"""Deterministic SQLite and scheduler contracts for offline EOD history."""
from __future__ import annotations

import csv
import hashlib
import io
import importlib.util
import zipfile
import json
import os
import sqlite3
import subprocess
import sys
import tempfile
import unittest
import types
from datetime import datetime
from pathlib import Path
from unittest.mock import patch
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parent.parent
os.environ.setdefault("BACKGROUND_MARKET_REFRESH_ENABLED", "false")
os.environ.setdefault("EOD_HISTORY_ENABLED", "false")
sys.path.insert(0, str(ROOT))

# The lightweight bundled test venv intentionally has no Flask. EOD contracts
# exercise scheduler helpers only, so provide the tiny decorator surface needed
# to import server.py without creating a web application dependency.
try:
    import flask  # noqa: F401
except ModuleNotFoundError:
    class _FakeApp:
        def __init__(self, *args, **kwargs):
            self.json = types.SimpleNamespace(ensure_ascii=True)
        def route(self, *args, **kwargs):
            return lambda function: function
        def after_request(self, function):
            return function
        def run(self, *args, **kwargs):
            return None
    sys.modules["flask"] = types.SimpleNamespace(
        Flask=_FakeApp, jsonify=lambda value: value,
        request=types.SimpleNamespace(args={}, get_json=lambda **_: {}),
        send_from_directory=lambda *args, **kwargs: None,
    )

import server
from 历史记录 import 历史记录数据库 as history_db


def record(ticker="NVDA", horizon="daily", **changes):
    base = {
        "market_date": "2026-08-18", "recorded_at_et": "2026-08-18T16:30:05-04:00",
        "ticker": ticker, "asset_type": "stock", "horizon": horizon, "data_status": "available",
        "action": "hold", "confidence": 58, "price_state": "NEUTRAL_ZONE", "current_price": 180.25,
        "opportunity_low": 165.0, "opportunity_high": 170.0, "reduce_low": 190.0, "reduce_high": 195.0,
        "invalidation": 158.0, "landscape_quality": 2.2, "direction": 33, "confirmation": 62,
        "risk": 35, "exhaustion": 4, "market_regime": "normal",
        "market_context": {"regime": "normal", "vix": {"current": 18}},
        "technical_features": {"horizon": horizon, "momentum": {"rsi": {"value": 58}}},
        "supporting_reasons": ["Trend is constructive."], "limiting_reasons": ["Price is neutral."],
        "primary_classification": "Semiconductors", "lifecycle": "EstablishedLeader",
        "size_class": "MegaCap", "company_traits": ["HighGrowth", "HighVolatility"],
        "applied_profile_modifiers": {
            "effective": {"riskSensitivity": 1.0}, "business_trait": "HighGrowth", "size_class": "MegaCap",
            "risk_trait": "HighVolatility", "profile_status": "complete", "profile_source": "automatic",
        },
        "leveraged": None, "etf_direction": None, "underlying": None, "etf_modifiers": None,
        "material_change": [],
    }
    base.update(changes)
    return base


class EodHistoryDatabaseTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="eod-历史记录-")
        self.db = Path(self.temp.name) / "历史记录" / "历史记录.sqlite"
        self.previous = os.environ.get("DECISION_HISTORY_DB_PATH")
        os.environ["DECISION_HISTORY_DB_PATH"] = str(self.db)

    def tearDown(self):
        if self.previous is None:
            os.environ.pop("DECISION_HISTORY_DB_PATH", None)
        else:
            os.environ["DECISION_HISTORY_DB_PATH"] = self.previous
        self.temp.cleanup()

    def rows(self):
        conn = sqlite3.connect(self.db)
        try:
            return conn.execute("SELECT * FROM decision_history ORDER BY ticker, horizon").fetchall()
        finally:
            conn.close()

    def test_schema_initializes_on_unicode_path_and_survives_reopen(self):
        self.assertEqual(history_db.initialize(), self.db)
        self.assertTrue(self.db.exists())
        self.assertTrue(history_db.initialize().exists())

    def test_one_ticker_two_horizons_writes_two_rows(self):
        rows = [record(horizon=horizon) for horizon in ("daily", "weekly")]
        result = history_db.write_snapshot("2026-08-18", "start", "end", rows)
        self.assertEqual(result["row_count"], 2)
        self.assertEqual(result["ticker_count"], 1)
        self.assertEqual(len(self.rows()), 2)

    def test_old_schema_migration_preserves_history_verbatim(self):
        self.db.parent.mkdir(parents=True, exist_ok=True)
        schema=(ROOT/'历史记录'/'历史记录建表.sql').read_text().replace("'short', 'mid', 'long', 'daily', 'weekly'", "'short', 'mid', 'long'")
        conn=sqlite3.connect(self.db);conn.executescript(schema);conn.execute('alter table decision_history add column width_shadow_json TEXT');conn.close()
        conn=sqlite3.connect(self.db);conn.execute("insert into decision_history(market_date,recorded_at_et,ticker,asset_type,horizon,data_status,action,width_shadow_json) values('2026-08-18','legacy','OLD','stock','short','available','avoid','{\"legacy\":1}')");conn.commit();conn.close()
        conn=sqlite3.connect(self.db);before=conn.execute("select * from decision_history where horizon='short'").fetchall();conn.close()
        history_db.initialize();history_db.write_snapshot('2026-08-18','start','end',[record(horizon='daily'),record(horizon='weekly')])
        conn=sqlite3.connect(self.db);after=conn.execute("select * from decision_history where horizon='short'").fetchall();conn.close()
        self.assertEqual(before,after);self.assertEqual(len(self.rows()),3)

    def test_successful_snapshot_is_frozen_on_same_date_retry(self):
        history_db.write_snapshot("2026-08-18", "start", "end", [record(confidence=45)])
        history_db.write_snapshot("2026-08-18", "start2", "end2", [record(confidence=71)])
        rows = self.rows()
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0][7], 45.0)

    def test_multiple_ticker_transaction_and_eod_run_success(self):
        rows = [record("NVDA", horizon) for horizon in ("daily", "weekly")] + [record("TQQQ", horizon, asset_type="ETF", primary_classification=None, lifecycle=None, company_traits=None, leveraged=True, etf_direction="long", underlying="Nasdaq-100", etf_modifiers={"riskSensitivity": 1.2}) for horizon in ("daily", "weekly")]
        result = history_db.write_snapshot("2026-08-18", "start", "end", rows)
        self.assertEqual(result["ticker_count"], 2)
        self.assertEqual(len(self.rows()), 4)
        conn = sqlite3.connect(self.db)
        try:
            run = conn.execute("SELECT status, row_count, unavailable_count FROM eod_runs WHERE market_date='2026-08-18'").fetchone()
            self.assertEqual(run, ("success", 4, 0))
            etf = conn.execute("SELECT asset_type, leveraged, etf_direction, underlying, etf_modifiers_json FROM decision_history WHERE ticker='TQQQ' LIMIT 1").fetchone()
            self.assertEqual(etf[:4], ("ETF", 1, "long", "Nasdaq-100"))
            self.assertIn("riskSensitivity", etf[4])
        finally:
            conn.close()

    def test_unavailable_ticker_is_a_valid_explicit_row(self):
        result = history_db.write_snapshot("2026-08-18", "start", "end", [record("MU", data_status="unavailable", action=None, confidence=None, technical_features=None, current_price=None)])
        self.assertEqual(result["unavailable_count"], 1)
        self.assertEqual(self.rows()[0][5], "unavailable")

    def test_active_canonical_profile_snapshot_is_stored_additively(self):
        history_db.write_snapshot("2026-08-18", "start", "end", [record()])
        conn = sqlite3.connect(self.db)
        try:
            raw = conn.execute("SELECT company_traits_json, applied_profile_modifiers_json FROM decision_history WHERE ticker='NVDA'").fetchone()
        finally:
            conn.close()
        self.assertEqual(json.loads(raw[0]), ["HighGrowth", "HighVolatility"])
        profile = json.loads(raw[1])
        self.assertEqual(profile["business_trait"], "HighGrowth")
        self.assertEqual(profile["size_class"], "MegaCap")
        self.assertEqual(profile["risk_trait"], "HighVolatility")
        self.assertEqual(profile["profile_status"], "complete")

    def test_failed_transaction_rolls_back_incomplete_rows(self):
        good = record("GOOD", "daily")
        bad = record("BAD", "not_a_horizon")
        with self.assertRaises(sqlite3.IntegrityError):
            history_db.write_snapshot("2026-08-18", "start", "end", [good, bad])
        self.assertEqual(self.rows(), [])
        self.assertFalse(history_db.successful_run_exists("2026-08-18"))

    def test_failed_retry_does_not_overwrite_existing_success(self):
        history_db.write_snapshot("2026-08-18", "start", "end", [record()])
        history_db.mark_run_terminal("2026-08-18", "later", "later", "failed", "test failure")
        self.assertTrue(history_db.successful_run_exists("2026-08-18"))

    def test_export_script_writes_csv(self):
        history_db.write_snapshot("2026-08-18", "start", "end", [record()])
        output = Path(self.temp.name) / "export.csv"
        run = subprocess.run([sys.executable, str(ROOT / "历史记录" / "导出历史记录.py"), "--db", str(self.db), "--format", "csv", "--output", str(output)], cwd=ROOT, capture_output=True, text=True, check=False)
        self.assertEqual(run.returncode, 0, run.stderr)
        with output.open(encoding="utf-8") as handle:
            exported = list(csv.DictReader(handle))
        self.assertEqual(len(exported), 1)
        self.assertEqual(exported[0]["ticker"], "NVDA")

    def test_default_bundle_preserves_both_tables_and_checksums_without_writing_db(self):
        context = {"config": {"threshold": 1.5}, "macro_actuals": {"status": "unavailable"}}
        history_db.write_snapshot("2026-08-18", "start", "end", [record()], run_context=context,
                                  resource_metrics={"database_growth_bytes": 123})
        history_db.write_snapshot("2026-08-19", "start", "end", [record(market_date="2026-08-19")])
        with sqlite3.connect(self.db) as db:
            db.execute("ALTER TABLE decision_history ADD COLUMN old_evidence TEXT")
            db.execute("UPDATE decision_history SET old_evidence='保留旧数据'")
        before = Path(self.db).read_bytes()
        output = Path(self.temp.name) / "bundle.zip"
        run = subprocess.run([sys.executable, str(ROOT / "历史记录" / "导出历史记录.py"),
                              "--db", str(self.db), "--from", "2026-08-18", "--to", "2026-08-18",
                              "--output", str(output)], cwd=ROOT, capture_output=True, text=True)
        self.assertEqual(run.returncode, 0, run.stderr)
        self.assertEqual(Path(self.db).read_bytes(), before)
        with zipfile.ZipFile(output) as archive:
            self.assertIsNone(archive.testzip())
            manifest = json.loads(archive.read("manifest.json"))
            for name, info in manifest["files"].items():
                self.assertEqual(info["sha256"], hashlib.sha256(archive.read(name)).hexdigest())
                self.assertEqual(info["rows"], 1)
            decisions = list(csv.DictReader(io.StringIO(archive.read("stock-history.csv").decode())))
            runs = [json.loads(line) for line in archive.read("eod-runs.jsonl").decode().splitlines()]
        self.assertEqual(decisions[0]["old_evidence"], "保留旧数据")
        self.assertEqual(json.loads(runs[0]["run_context_json"]), context)
        self.assertEqual(json.loads(runs[0]["resource_metrics_json"])["database_growth_bytes"], 123)

    def test_bundle_missing_db_does_not_create_db_or_replace_previous_export(self):
        missing = Path(self.temp.name) / "missing.sqlite"
        output = Path(self.temp.name) / "bundle.zip"
        output.write_bytes(b"previous export")
        run = subprocess.run([sys.executable, str(ROOT / "历史记录" / "导出历史记录.py"),
                              "--db", str(missing), "--output", str(output)], cwd=ROOT,
                             capture_output=True, text=True)
        self.assertNotEqual(run.returncode, 0)
        self.assertFalse(missing.exists())
        self.assertEqual(output.read_bytes(), b"previous export")

    def test_bundle_cannot_overwrite_source_database(self):
        history_db.write_snapshot("2026-08-18", "start", "end", [record()])
        run = subprocess.run([sys.executable, str(ROOT / "历史记录" / "导出历史记录.py"),
                              "--db", str(self.db), "--output", str(self.db)], cwd=ROOT,
                             capture_output=True, text=True)
        self.assertNotEqual(run.returncode, 0)
        self.assertEqual(len(self.rows()), 1)

    def test_bundle_uses_one_snapshot_even_if_new_batch_commits_during_export(self):
        history_db.write_snapshot("2026-08-18", "start", "end", [record()])
        sys.path.insert(0, str(ROOT / "历史记录"))
        try:
            spec = importlib.util.spec_from_file_location("history_export_test", ROOT / "历史记录" / "导出历史记录.py")
            module = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(module)
        finally:
            sys.path.pop(0)
        original_open = zipfile.ZipFile.open
        committed = False

        def open_and_commit(archive, name, mode="r", *args, **kwargs):
            nonlocal committed
            if name == "stock-history.csv" and mode == "w" and not committed:
                committed = True
                history_db.write_snapshot("2026-08-19", "start", "end", [record(market_date="2026-08-19")])
            return original_open(archive, name, mode, *args, **kwargs)

        with patch.object(zipfile.ZipFile, "open", open_and_commit):
            manifest = module.export_bundle(self.db, Path(self.temp.name) / "consistent.zip")
        self.assertTrue(committed)
        self.assertEqual(len(self.rows()), 2)
        self.assertEqual(manifest["files"]["stock-history.csv"]["rows"], 1)
        self.assertEqual(manifest["files"]["eod-runs.jsonl"]["rows"], 1)

    def test_local_fallback_is_unicode_safe_when_no_render_disk_or_env(self):
        os.environ.pop("DECISION_HISTORY_DB_PATH", None)
        with patch.object(history_db, "RENDER_PERSISTENT_DISK", Path(self.temp.name) / "missing"):
            self.assertEqual(history_db.resolve_db_path().name, "历史记录.sqlite")

    def test_run_context_and_resources_are_atomic_and_success_stays_unchanged(self):
        history_db.write_snapshot('2026-08-18','start','end',[record()],run_context={'source_sha256':'original'},resource_metrics={'node_peak_rss_bytes':123})
        history_db.mark_run_started('2026-08-18','a later attempt')
        result=history_db.write_snapshot('2026-08-18','new','new',[record(action='sell')],run_context={'source_sha256':'new'})
        self.assertTrue(result['already_recorded'])
        run=history_db.recent_runs()[0]
        self.assertEqual(run['source_sha256'],'original')
        self.assertEqual(run['started_at_et'],'start')
        self.assertEqual(run['resource_metrics']['node_peak_rss_bytes'],123)
        self.assertEqual(self.rows()[0][6],'hold')

    def test_additive_run_column_migration_and_readonly_status(self):
        self.db.parent.mkdir(parents=True,exist_ok=True)
        schema=(ROOT/'历史记录/历史记录建表.sql').read_text().replace('database_size_mb REAL,\n    run_context_json TEXT,\n    resource_metrics_json TEXT','database_size_mb REAL')
        conn=sqlite3.connect(self.db);conn.executescript(schema);conn.execute("insert into eod_runs(market_date,started_at_et,status) values('2026-08-17','old','success')");conn.commit();conn.close()
        history_db.initialize()
        self.assertIsNone(history_db.recent_runs()[0]['resource_metrics'])
        env=dict(os.environ,EOD_HISTORY_ENABLED='true',BACKGROUND_MARKET_REFRESH_ENABLED='true')
        run=subprocess.run([sys.executable,str(ROOT/'历史记录/历史记录.py'),'--status'],capture_output=True,text=True,env=env,timeout=5)
        self.assertEqual(run.returncode,0,run.stderr)
        self.assertEqual(json.loads(run.stdout)[0]['market_date'],'2026-08-17')

    def test_missing_status_does_not_create_a_database(self):
        self.assertEqual(history_db.recent_runs(),[])
        self.assertFalse(self.db.exists())

    def test_missing_and_boolean_numbers_never_become_zero(self):
        for value in (None,' ',False,True,float('nan'),float('inf')):
            self.assertIsNone(history_db._number(value))
        self.assertEqual(history_db._number(0),0)


class EodSnapshotProfileTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="eod-profiles-")
        self.addCleanup(self.temp.cleanup)
        self.db_patch = patch.object(server, "WATCHLIST_DB_PATH", str(Path(self.temp.name) / "watchlist.db"))
        self.db_patch.start()
        self.addCleanup(self.db_patch.stop)
        self.profiles = {
            "STABLE": self.profile("Industrials", "CashCow"),
            "SPARSE": self.profile("Consumer Discretionary", "HighGrowth"),
            "FUND": self.profile("Banking", "CashCow"),
            "DORMANT": self.profile("Banking", "CashCow"),
        }
        server._upsert_company_profiles(self.profiles)

    @staticmethod
    def profile(primary, business):
        return {
            "primaryClassification": primary, "businessTrait": business,
            "riskTrait": "MacroSensitive", "lifecycle": "EstablishedLeader", "sizeClass": "MegaCap",
            "companyTraits": [business, "MacroSensitive"], "profileStatus": "complete",
            "profileSource": "automatic", "profileSchemaVersion": "2.1",
            "lastProfileReview": "2026-03-31T03:30:00-04:00",
        }

    def handoff(self, quotes, market=None, date="2026-10-29", at="2026-10-29T23:00:00-04:00"):
        with patch.object(server, "read_market_cache", side_effect=lambda ticker: quotes[ticker]), \
             patch.object(server, "eod_quote_from_cache", side_effect=lambda ticker, cached: cached), \
             patch.object(server, "log_resources"), \
             patch.object(server, "load_company_profiles", wraps=server.load_company_profiles) as load:
            directory, src, dest = server.write_eod_snapshot_input(
                {"format": "disk-snapshot-v1", "tickers": list(quotes), "marketContext": market or {}}, date, at,
            )
            self.addCleanup(server.shutil.rmtree, directory)
            load.assert_called_once_with(list(quotes))
        manifest = json.loads(Path(src).read_text())
        frozen = {item["ticker"]: json.loads(Path(item["path"]).read_text()) for item in manifest["items"]}
        return src, dest, frozen

    def test_disk_handoff_uses_persisted_profiles_without_mutating_raw_cache_or_expanding_universe(self):
        quotes = {
            "STABLE": {"price": 100, "metadata": {"quoteType": "EQUITY", "revenueGrowth": 0.3,
                "classification": {"businessTrait": "HighGrowth"}}},
            "SPARSE": {"price": 100, "metadata": {"quoteType": "EQUITY", "revenueGrowth": None}},
            "FUND": {"price": 100, "metadata": {"quoteType": "ETF"}},
        }
        before = json.loads(json.dumps(quotes))
        _, _, frozen = self.handoff(quotes)
        self.assertEqual(set(frozen), set(quotes))
        self.assertNotIn("DORMANT", frozen)
        for ticker in ("STABLE", "SPARSE"):
            stored = server.load_company_profiles([ticker])[ticker]
            self.assertEqual(frozen[ticker]["metadata"]["classification"], stored)
        self.assertEqual(frozen["STABLE"]["metadata"]["classification"]["businessTrait"], "CashCow")
        self.assertEqual(frozen["SPARSE"]["metadata"]["classification"]["businessTrait"], "HighGrowth")
        self.assertNotIn("classification", frozen["FUND"]["metadata"])
        self.assertEqual(quotes, before, "profile decoration must not mutate the raw quote cache")

    def test_persisted_profiles_reach_both_engine_horizons_and_match_dashboard_modifiers(self):
        node = server.eod_history_node_executable()
        if not node:
            self.skipTest("Node.js unavailable")
        fixture = json.loads(subprocess.check_output([
            node, "-e", "const f=require('./tests/fixtures/decision-scenarios.js');"
            "const history=f.rawHistory();const market=f.market();"
            "market.market_context.benchmark_history={spy:history,qqq:history};"
            "console.log(JSON.stringify({history,market}));",
        ], cwd=ROOT, text=True, timeout=30))
        history, market = fixture["history"], fixture["market"]
        metadata = {
            "STABLE": {"quoteType": "EQUITY", "industry": "Specialty Industrial Machinery",
                       "marketCap": 200_000_000_000, "revenueGrowth": 0.3, "profitMargins": 0.2},
            "SPARSE": {"quoteType": "EQUITY", "industry": "Auto Manufacturers",
                       "marketCap": 800_000_000_000, "revenueGrowth": None, "profitMargins": 0.05},
            "FUND": {"quoteType": "ETF"},
        }
        quotes = {ticker: {"price": history["closes"][-1], "history": history,
                          "updatedAt": history["as_of"], "metadata": value} for ticker, value in metadata.items()}
        src, dest, frozen = self.handoff(quotes, market, history["timestamps"][-1], history["as_of"])
        actual = server.build_eod_decision_snapshot(src, dest)["records"]
        # The Dashboard uses this same metadata/profile resolver and JS engine.
        dashboard_input = Path(self.temp.name) / "dashboard.json"
        dashboard_output = Path(self.temp.name) / "dashboard-output.json"
        dashboard_input.write_text(json.dumps({"marketDate": history["timestamps"][-1],
            "recordedAtEt": history["as_of"], "payload": {"quotes": {
                ticker: {**quote, "metadata": {**quote["metadata"], "classification": server.load_company_profiles([ticker])[ticker]}}
                if ticker != "FUND" else quote for ticker, quote in quotes.items()
            }, "marketContext": market}}))
        expected = server.build_eod_decision_snapshot(str(dashboard_input), str(dashboard_output))["records"]
        self.assertEqual(actual, expected, "disk EOD and Dashboard-profile inputs must produce identical compact decisions")
        self.assertEqual(len(actual), 6)
        for row in actual:
            self.assertIn(row["horizon"], ("daily", "weekly"))
            if row["ticker"] == "FUND":
                self.assertIsNone(row["business_trait"])
            else:
                stored = self.profiles[row["ticker"]]
                self.assertEqual(row["business_trait"], stored["businessTrait"])
                self.assertEqual(row["applied_profile_modifiers"]["last_profile_review"], stored["lastProfileReview"])


class EodHistorySchedulerTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="eod-server-")
        self.db = Path(self.temp.name) / "历史记录.sqlite"
        self.previous = os.environ.get("DECISION_HISTORY_DB_PATH")
        os.environ["DECISION_HISTORY_DB_PATH"] = str(self.db)

    def tearDown(self):
        if self.previous is None:
            os.environ.pop("DECISION_HISTORY_DB_PATH", None)
        else:
            os.environ["DECISION_HISTORY_DB_PATH"] = self.previous
        self.temp.cleanup()

    def test_timezone_and_dst_aware_2300_schedule(self):
        self.assertEqual(server.EOD_HISTORY_TIMEZONE.key, "America/New_York")
        summer = server.next_eod_history_run(datetime(2026, 8, 18, 22, 59, tzinfo=ZoneInfo("America/New_York")))
        winter = server.next_eod_history_run(datetime(2026, 1, 20, 22, 59, tzinfo=ZoneInfo("America/New_York")))
        self.assertEqual(summer.strftime("%H:%M %z"), "23:00 -0400")
        self.assertEqual(winter.strftime("%H:%M %z"), "23:00 -0500")

    def test_weekend_is_skipped_without_refresh(self):
        saturday = datetime(2026, 8, 22, 16, 30, tzinfo=ZoneInfo("America/New_York"))
        with patch.object(server, "_eod_refresh_and_cache_snapshot") as refresh:
            result = server.run_eod_history_once(saturday, reason="test")
        self.assertEqual(result["status"], "skipped")
        refresh.assert_not_called()

    def test_no_current_trading_date_skips_without_node(self):
        previous_day_payload = {"success": True, "items": [{"ticker": "NVDA", "analysis": {"price": 1, "history": {"timestamps": ["2026-08-17"], "availability": "available"}}}]}
        now = datetime(2026, 8, 18, 23, 0, tzinfo=ZoneInfo("America/New_York"))
        with patch.object(server, "eod_history_watchlist_tickers", return_value=["NVDA"]), patch.object(server, "_eod_refresh_and_cache_snapshot", return_value=previous_day_payload), patch.object(server, "build_eod_decision_snapshot") as node:
            result = server.run_eod_history_once(now, reason="test")
        self.assertEqual(result["status"], "failed")
        node.assert_not_called()

    def test_full_refresh_precedes_production_engine_snapshot_and_writes_rows(self):
        now = datetime(2026, 8, 18, 23, 0, tzinfo=ZoneInfo("America/New_York"))
        payload = {"success": True, "items": [{"ticker": "NVDA", "analysis": {"price": 180, "history": {"timestamps": ["2026-08-18"], "availability": "available"}}}]}
        snapshot = {"records": [record("NVDA", horizon) for horizon in ("daily", "weekly")],
                    "run_context":{"source_sha256":"frozen-source"},"resource_metrics":{"node_peak_rss_bytes":1000}}
        events = []
        def refreshed(_):
            events.append("refresh")
            return payload
        def generated(_, __):
            events.append("production_js_engine")
            return snapshot
        with patch.object(server, "eod_history_watchlist_tickers", return_value=["NVDA"]), patch.object(server, "_eod_refresh_and_cache_snapshot", side_effect=refreshed), patch.object(server, "write_eod_snapshot_input", return_value=(self.temp.name, "input", "output")), patch.object(server, "build_eod_decision_snapshot", side_effect=generated), patch.object(server.shutil, "rmtree"):
            result = server.run_eod_history_once(now, reason="test")
        self.assertEqual(result["status"], "success")
        self.assertEqual(events, ["refresh", "production_js_engine"])
        conn = sqlite3.connect(self.db)
        try:
            self.assertEqual(conn.execute("SELECT COUNT(*) FROM decision_history").fetchone()[0], 2)
        finally:
            conn.close()
        run=history_db.recent_runs()[0]
        self.assertEqual(run['source_sha256'],'frozen-source')
        self.assertEqual(run['resource_metrics']['node_peak_rss_bytes'],1000)
        self.assertGreater(run['resource_metrics']['database_growth_bytes'],0)

    def test_engine_failure_marks_run_failed_without_success_rows(self):
        now = datetime(2026, 8, 18, 23, 0, tzinfo=ZoneInfo("America/New_York"))
        payload = {"success": True, "items": [{"ticker": "NVDA", "analysis": {"price": 180, "history": {"timestamps": ["2026-08-18"], "availability": "available"}}}]}
        with patch.object(server, "eod_history_watchlist_tickers", return_value=["NVDA"]), patch.object(server, "_eod_refresh_and_cache_snapshot", return_value=payload), patch.object(server, "write_eod_snapshot_input", return_value=(self.temp.name, "input", "output")), patch.object(server, "build_eod_decision_snapshot", side_effect=RuntimeError("engine failure")), patch.object(server.shutil, "rmtree"):
            result = server.run_eod_history_once(now, reason="test")
        self.assertEqual(result["status"], "failed")
        conn = sqlite3.connect(self.db)
        try:
            self.assertEqual(conn.execute("SELECT COUNT(*) FROM decision_history").fetchone()[0], 0)
            self.assertEqual(conn.execute("SELECT status FROM eod_runs WHERE market_date='2026-08-18'").fetchone()[0], "failed")
        finally:
            conn.close()

    def test_catchup_requires_current_day_and_no_success(self):
        before = datetime(2026, 8, 18, 22, 59, tzinfo=ZoneInfo("America/New_York"))
        after = datetime(2026, 8, 18, 23, 1, tzinfo=ZoneInfo("America/New_York"))
        self.assertFalse(server.eod_history_should_catch_up(before))
        self.assertTrue(server.eod_history_should_catch_up(after))

    def test_server_does_not_use_history_export_on_normal_routes(self):
        source = (ROOT / "server.py").read_text(encoding="utf-8")
        self.assertNotIn("export_rows(", source)

    def test_holiday_and_dst_weekend_schedule(self):
        now=datetime(2026,11,26,22,0,tzinfo=ZoneInfo('America/New_York'))
        self.assertEqual(server.next_eod_history_run(now).strftime('%Y-%m-%d %H:%M'),'2026-11-27 23:00')
        self.assertFalse(server.eod_history_should_catch_up(now.replace(hour=23)))
        after_friday=datetime(2026,10,30,23,1,tzinfo=ZoneInfo('America/New_York'))
        self.assertEqual(server.next_eod_history_run(after_friday).strftime('%Y-%m-%d %H:%M %z'),'2026-11-02 23:00 -0500')

    def test_already_successful_day_does_not_refresh_or_rewrite(self):
        history_db.write_snapshot('2026-08-18','first','first',[record()])
        with patch.object(server,'_eod_refresh_and_cache_snapshot') as refresh:
            self.assertEqual(server.run_eod_history_once(datetime(2026,8,18,23,5,tzinfo=ZoneInfo('America/New_York')))['status'],'already_recorded')
            refresh.assert_not_called()

    def test_before_2300_never_fetches(self):
        with patch.object(server,'_eod_refresh_and_cache_snapshot') as refresh:
            result=server.run_eod_history_once(datetime(2026,8,18,22,59,tzinfo=ZoneInfo('America/New_York')))
            self.assertEqual(result['reason'],'before_recording_time');refresh.assert_not_called()
            self.assertFalse(server.EOD_HISTORY_STATE['running'])
            self.assertEqual(server.EOD_HISTORY_STATE['last_status'],'skipped')

    def test_retry_is_bounded_and_stops_when_date_changes(self):
        day=datetime(2026,8,18,23,59,tzinfo=ZoneInfo('America/New_York'))
        next_day=datetime(2026,8,19,0,1,tzinfo=ZoneInfo('America/New_York'))
        with patch.object(server,'eod_history_now_et',side_effect=[day,day,next_day]),patch.object(server,'run_eod_history_once',return_value={'status':'failed'}) as run,patch.object(server.time,'sleep'):
            self.assertEqual(server.run_eod_history_with_retries('test')['reason'],'date_changed');self.assertEqual(run.call_count,1)
        with patch.object(server,'eod_history_now_et',return_value=day),patch.object(server,'run_eod_history_once',return_value={'status':'failed'}) as run,patch.object(server.time,'sleep'):
            self.assertEqual(server.run_eod_history_with_retries('test')['status'],'failed');self.assertEqual(run.call_count,3)

    def test_night_snapshot_never_reuses_afternoon_market(self):
        with patch.object(server,'LAST_FULL_REFRESH_SUMMARY',{'completed':True,'completed_at':'2026-08-18T21:00:00Z','requested_tickers':['TEST'],'failed_count':0,'cache_fallback_count':0}),patch.object(server,'_refresh_market_cache_for_watchlist',return_value={'completed':True}) as refresh,patch.object(server,'get_market_context_cached_snapshot',return_value=({},{})):
            server._eod_refresh_and_cache_snapshot(['TEST'])
            refresh.assert_called_once_with(reason='eod_history')

    def test_snapshot_key_mismatch_rolls_back(self):
        payload={'success':True,'items':[{'ticker':'NVDA','analysis':{'history':{'timestamps':['2026-08-18']}}}]}
        snapshot={'records':[record('NVDA','daily'),record('NVDA','daily')]}
        with patch.object(server,'eod_history_watchlist_tickers',return_value=['NVDA']),patch.object(server,'_eod_refresh_and_cache_snapshot',return_value=payload),patch.object(server,'write_eod_snapshot_input',return_value=(self.temp.name,'input','output')),patch.object(server,'build_eod_decision_snapshot',return_value=snapshot),patch.object(server.shutil,'rmtree'):
            result=server.run_eod_history_once(datetime(2026,8,18,23,0,tzinfo=ZoneInfo('America/New_York')))
            self.assertEqual(result['status'],'failed');self.assertFalse(history_db.successful_run_exists('2026-08-18'))

    def test_changed_watchlist_discards_batch_and_telemetry_failure_preserves_commit(self):
        payload={'success':True,'items':[{'ticker':'NVDA','analysis':{'history':{'timestamps':['2026-08-18']}}}]}
        snapshot={'records':[record('NVDA',h) for h in ('daily','weekly')]}
        now=datetime(2026,8,18,23,0,tzinfo=ZoneInfo('America/New_York'))
        with patch.object(server,'eod_history_watchlist_tickers',side_effect=[['NVDA'],['NEW']]),patch.object(server,'_eod_refresh_and_cache_snapshot',return_value=payload),patch.object(server,'write_eod_snapshot_input',return_value=(self.temp.name,'input','output')),patch.object(server,'build_eod_decision_snapshot',return_value=snapshot),patch.object(server.shutil,'rmtree'):
            self.assertEqual(server.run_eod_history_once(now)['status'],'failed')
            self.assertFalse(history_db.successful_run_exists('2026-08-18'))
        with patch.object(server,'eod_history_watchlist_tickers',return_value=['NVDA']),patch.object(server,'_eod_refresh_and_cache_snapshot',return_value=payload),patch.object(server,'write_eod_snapshot_input',return_value=(self.temp.name,'input','output')),patch.object(server,'build_eod_decision_snapshot',return_value=snapshot),patch.object(server.shutil,'rmtree'),patch.object(history_db,'update_run_resources',side_effect=OSError('measurement unavailable')):
            self.assertEqual(server.run_eod_history_once(now)['status'],'success')
            self.assertTrue(history_db.successful_run_exists('2026-08-18'))


if __name__ == "__main__":
    unittest.main()
