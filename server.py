#!/usr/bin/env python3
import json
import math
import os
import queue
import re
import sqlite3
import threading
import time
from email.utils import parsedate_to_datetime
from html import unescape
from datetime import datetime, timedelta, timezone
from http.server import HTTPServer, SimpleHTTPRequestHandler
from urllib.parse import parse_qs, quote_plus, unquote, urlparse
from urllib.request import Request, urlopen
from xml.etree import ElementTree as ET

try:
    import akshare as ak
except Exception:
    ak = None
import pandas as pd
import yfinance as yf
from flask import Flask, jsonify, request, send_from_directory

try:
    from flask_cors import CORS
except Exception:
    CORS = None


ROOT = os.path.dirname(os.path.abspath(__file__))
ENV_FILE = os.path.join(ROOT, ".env")
if os.path.exists(ENV_FILE):
    try:
        with open(ENV_FILE, "r", encoding="utf-8") as handle:
            for raw_line in handle:
                line = raw_line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                key, value = line.split("=", 1)
                key = key.strip()
                value = value.strip().strip('"').strip("'")
                if key and key not in os.environ:
                    os.environ[key] = value
    except Exception:
        pass
PORT = int(os.environ.get("PORT", "4173"))
HOST = os.environ.get("HOST", "127.0.0.1")
CACHE_SECONDS = 60 * 60
QUOTE_FETCH_TIMEOUT_SECONDS = 12
A_SHARE_METADATA_TIMEOUT_SECONDS = 2.5
A_SHARE_PRIMARY_PRICE_TIMEOUT_SECONDS = 4.0
A_SHARE_SECONDARY_PRICE_TIMEOUT_SECONDS = 4.5
CACHE = {}
SEARCH_CACHE_SECONDS = 10 * 60
SYMBOL_SEARCH_CACHE = {}
A_SHARE_SYMBOL_CACHE = {"value": [], "expiresAt": 0}
NEWS_CACHE_SECONDS = 60 * 60
COMPANY_NEWS_CACHE = {}
MARKET_CONTEXT_CACHE = {"value": None, "expiresAt": 0}
FEAR_GREED_CACHE = {"value": None, "expiresAt": 0}
WATCHLIST_DB_PATH = os.environ.get("WATCHLIST_DB_PATH", os.path.join(ROOT, "data", "watchlist.db"))
MARKET_EVENTS_FILE = os.environ.get("MARKET_EVENTS_FILE", os.path.join(ROOT, "market_events.json"))
WATCHLIST_LOCK = threading.Lock()
QUOTE_FETCH_LOCK = threading.Lock()
DEFAULT_SHARED_WATCHLIST = [
    "NVDA", "TSLA", "AMD", "BABA", "GOOGL", "AMZN", "AAPL", "CRCL", "FFAI", "HIMS",
    "MPT", "META", "MSFT", "NFLX", "PLTR", "NOW", "SOFI", "TEM", "XE", "ZETA",
    "300657", "002463", "603005", "600522",
]
US_SYMBOL_CATALOG = [
    {"ticker": "NVDA", "name": "NVIDIA", "aliases": ["NVIDIA Corp", "英伟达"], "exchange": "NASDAQ"},
    {"ticker": "TSLA", "name": "Tesla", "aliases": ["Tesla Inc", "特斯拉"], "exchange": "NASDAQ"},
    {"ticker": "AMD", "name": "AMD", "aliases": ["Advanced Micro Devices", "超威半导体"], "exchange": "NASDAQ"},
    {"ticker": "BABA", "name": "Alibaba", "aliases": ["Alibaba Group Holding Limited", "阿里巴巴"], "exchange": "NYSE"},
    {"ticker": "GOOGL", "name": "Google", "aliases": ["Alphabet", "谷歌"], "exchange": "NASDAQ"},
    {"ticker": "AMZN", "name": "Amazon", "aliases": ["Amazon.com", "亚马逊"], "exchange": "NASDAQ"},
    {"ticker": "AAPL", "name": "Apple", "aliases": ["Apple Inc", "苹果"], "exchange": "NASDAQ"},
    {"ticker": "CRCL", "name": "Circle", "aliases": ["Circle Internet Group"], "exchange": "NYSE"},
    {"ticker": "FFAI", "name": "Faraday Future AI", "aliases": ["Faraday Future", "法拉第未来"], "exchange": "NASDAQ"},
    {"ticker": "HIMS", "name": "Hims & Hers", "aliases": ["Hims and Hers", "Hims Hers"], "exchange": "NYSE"},
    {"ticker": "MPT", "name": "Medical Properties Trust", "aliases": ["医疗地产信托"], "exchange": "NYSE"},
    {"ticker": "META", "name": "Meta", "aliases": ["Meta Platforms", "Facebook"], "exchange": "NASDAQ"},
    {"ticker": "MSFT", "name": "Microsoft", "aliases": ["微软"], "exchange": "NASDAQ"},
    {"ticker": "NFLX", "name": "Netflix", "aliases": ["奈飞"], "exchange": "NASDAQ"},
    {"ticker": "PLTR", "name": "Palantir", "aliases": ["Palantir Technologies"], "exchange": "NASDAQ"},
    {"ticker": "NOW", "name": "ServiceNow", "aliases": ["Service Now"], "exchange": "NYSE"},
    {"ticker": "SOFI", "name": "SoFi", "aliases": ["SoFi Technologies"], "exchange": "NASDAQ"},
    {"ticker": "TEM", "name": "Tempus AI", "aliases": ["Tempus"], "exchange": "NASDAQ"},
    {"ticker": "XE", "name": "XE", "aliases": ["Energy Fuels"], "exchange": "NYSE"},
    {"ticker": "ZETA", "name": "Zeta Global", "aliases": ["Zeta"], "exchange": "NYSE"},
]
A_SHARE_SYMBOL_CATALOG = [
    {"ticker": "002463", "name": "沪电股份", "aliases": ["Hudian", "Hudian Corp", "Hu Dian"]},
    {"ticker": "300657", "name": "先导基电", "aliases": ["Hongxin Electronics", "Xian Dao Ji Dian", "Hongxin"]},
    {"ticker": "603005", "name": "晶方科技", "aliases": ["Anji Microelectronics", "Jingfang Keji", "Jingfang"]},
    {"ticker": "600522", "name": "中天科技", "aliases": ["Zhongtian Technology", "Zhong Tian Ke Ji"]},
    {"ticker": "600641", "name": "万业企业", "aliases": ["Shanghai Vital Deeptech", "Wanye Qiye", "Wan Ye Qi Ye"]},
]

POSITIVE_NEWS_KEYWORDS = [
    "beat", "beats", "surge", "growth", "upgrade", "raises", "raised", "expands", "partnership",
    "approval", "rebound", "record", "strong demand", "buyback", "bullish", "rally", "wins",
    "launch", "profit jump", "guidance raised", "breakthrough", "ai demand", "cloud growth",
    "增长", "上调", "合作", "突破", "回升", "利好", "创新高", "反弹", "订单增长",
]

NEGATIVE_NEWS_KEYWORDS = [
    "miss", "misses", "downgrade", "cut", "cuts", "lawsuit", "probe", "investigation",
    "antitrust", "regulation", "tariff", "war", "conflict", "delay", "recall", "warning",
    "slump", "fall", "drop", "weak demand", "bearish", "fraud", "default", "bankruptcy",
    "监管", "诉讼", "调查", "下调", "关税", "战争", "冲突", "延迟", "召回", "下滑", "利空",
]

MACRO_EVENT_PATTERNS = [
    ("fed", re.compile(r"\bfed\b|fomc|rate cut|rate hike|interest rate|powell", re.I)),
    ("inflation", re.compile(r"\bcpi\b|\bppi\b|inflation|jobs report|payroll", re.I)),
    ("tariff", re.compile(r"tariff|trade war|export restriction|sanction", re.I)),
    ("war", re.compile(r"war|missile|middle east|iran|israel|geopolitical|conflict", re.I)),
    ("regulation", re.compile(r"regulation|antitrust|lawsuit|probe|investigation", re.I)),
    ("energy", re.compile(r"oil|energy|crude|opec|gas price|lng", re.I)),
]


def is_a_share_ticker(ticker):
    normalized = (ticker or "").strip().upper()
    return len(normalized) == 6 and normalized.isdigit() and normalized.startswith(("0", "3", "6"))


def normalize_ticker_input(value):
    invisible = "\u200b\u200c\u200d\ufeff"
    cleaned = "".join(ch for ch in (value or "") if ch not in invisible)
    return "".join(ch for ch in cleaned.strip().upper() if ch.isalnum() or ch in ".-")


def infer_market_type(ticker, market_type=None):
    requested = (market_type or "").strip().upper()
    if requested in ("US", "CN_A_SHARE"):
        return requested
    return "CN_A_SHARE" if is_a_share_ticker(ticker) else "US"


def normalize_watchlist_item(value):
    if isinstance(value, dict):
        ticker = normalize_ticker_input(value.get("ticker"))
        market_type = infer_market_type(ticker, value.get("market_type"))
        created_at = value.get("created_at") or value.get("createdAt")
    else:
        ticker = normalize_ticker_input(str(value))
        market_type = infer_market_type(ticker)
        created_at = None
    if not ticker:
        return None
    return {
        "id": None,
        "ticker": ticker,
        "market_type": market_type,
        "created_at": created_at or datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
    }


def normalize_search_query(value):
    return " ".join(str(value or "").strip().split())


def normalize_watchlist(values):
    seen = set()
    normalized = []
    for value in values or []:
        item = normalize_watchlist_item(value)
        ticker = item["ticker"] if item else ""
        if not ticker or ticker in seen:
            continue
        seen.add(ticker)
        normalized.append(ticker)
    return normalized


def normalize_watchlist_items(values):
    seen = set()
    items = []
    for value in values or []:
        item = normalize_watchlist_item(value)
        if not item:
            continue
        key = (item["ticker"], item["market_type"])
        if key in seen:
            continue
        seen.add(key)
        item["id"] = len(items) + 1
        items.append(item)
    return items


def watchlist_items_to_tickers(items):
    return [item["ticker"] for item in items or [] if item.get("ticker")]


def sqlite_timestamp_to_iso(value):
    if not value:
        return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    text = str(value)
    if "T" in text:
        return text if text.endswith("Z") else f"{text}Z"
    return f"{text.replace(' ', 'T')}Z"


def get_watchlist_connection():
    db_dir = os.path.dirname(WATCHLIST_DB_PATH)
    if db_dir:
        os.makedirs(db_dir, exist_ok=True)
    conn = sqlite3.connect(WATCHLIST_DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_watchlist_db():
    db_exists = os.path.exists(WATCHLIST_DB_PATH)
    with WATCHLIST_LOCK:
        with get_watchlist_connection() as conn:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS watchlist (
                  id INTEGER PRIMARY KEY AUTOINCREMENT,
                  ticker TEXT NOT NULL,
                  market_type TEXT NOT NULL,
                  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                  UNIQUE(ticker, market_type)
                )
                """
            )
            if not db_exists:
                for item in normalize_watchlist_items(DEFAULT_SHARED_WATCHLIST):
                    conn.execute(
                        "INSERT OR IGNORE INTO watchlist (ticker, market_type) VALUES (?, ?)",
                        (item["ticker"], item["market_type"]),
                    )
            conn.commit()


def row_to_watchlist_item(row):
    return {
        "id": row["id"],
        "ticker": row["ticker"],
        "market_type": row["market_type"],
        "created_at": sqlite_timestamp_to_iso(row["created_at"]),
    }


def load_shared_watchlist():
    return watchlist_items_to_tickers(load_shared_watchlist_items())


def load_shared_watchlist_items():
    init_watchlist_db()
    with WATCHLIST_LOCK:
        with get_watchlist_connection() as conn:
            rows = conn.execute(
                """
                SELECT id, ticker, market_type, created_at
                FROM watchlist
                ORDER BY datetime(created_at) ASC, id ASC
                """
            ).fetchall()
            return [row_to_watchlist_item(row) for row in rows]


def add_shared_ticker(ticker, market_type=None):
    ticker = normalize_ticker_input(ticker)
    normalized_market_type = infer_market_type(ticker, market_type)
    if ticker:
        init_watchlist_db()
        with WATCHLIST_LOCK:
            with get_watchlist_connection() as conn:
                conn.execute(
                    "INSERT OR IGNORE INTO watchlist (ticker, market_type) VALUES (?, ?)",
                    (ticker, normalized_market_type),
                )
                conn.commit()
    return load_shared_watchlist_items()


def remove_shared_ticker(ticker, market_type=None):
    ticker = normalize_ticker_input(ticker)
    if ticker:
        init_watchlist_db()
        normalized_market_type = infer_market_type(ticker, market_type) if market_type else None
        with WATCHLIST_LOCK:
            with get_watchlist_connection() as conn:
                if normalized_market_type:
                    conn.execute(
                        "DELETE FROM watchlist WHERE ticker = ? AND market_type = ?",
                        (ticker, normalized_market_type),
                    )
                else:
                    conn.execute("DELETE FROM watchlist WHERE ticker = ?", (ticker,))
                conn.commit()
    return load_shared_watchlist_items()


def resolve_market_symbol(ticker):
    normalized = (ticker or "").strip().upper()
    if is_a_share_ticker(normalized):
        if normalized.startswith(("0", "3")):
            return f"{normalized}.SZ"
        return f"{normalized}.SS"
    return normalized


def fetch_a_share_symbol_rows():
    now = time.time()
    if A_SHARE_SYMBOL_CACHE["value"] and A_SHARE_SYMBOL_CACHE["expiresAt"] > now:
        return A_SHARE_SYMBOL_CACHE["value"]

    rows = [
        {
            "ticker": item["ticker"],
            "name": item["name"],
            "market": "cn",
            "exchange": "SZ" if item["ticker"].startswith(("0", "3")) else "SH",
            "aliases": item.get("aliases", []),
        }
        for item in A_SHARE_SYMBOL_CATALOG
    ]

    A_SHARE_SYMBOL_CACHE["value"] = rows
    A_SHARE_SYMBOL_CACHE["expiresAt"] = now + 12 * 60 * 60
    return rows


def search_a_share_candidates(query, limit=8):
    normalized = normalize_search_query(query)
    if not normalized:
        return []

    query_upper = normalized.upper()
    rows = fetch_a_share_symbol_rows()
    scored = []
    seen_tickers = set()

    for item in rows:
        ticker = item["ticker"]
        name = item["name"]
        alias_blob = " ".join(item.get("aliases", []))
        search_blob = f"{name} {alias_blob}".upper()
        score = None
        if ticker == query_upper:
            score = 0
        elif ticker.startswith(query_upper):
            score = 1
        elif query_upper in search_blob:
            score = 2
        if score is None:
            continue
        seen_tickers.add(ticker)
        scored.append((score, len(name), item))

    if is_a_share_ticker(query_upper) and query_upper not in seen_tickers:
        exchange = "SZ" if query_upper.startswith(("0", "3")) else "SH"
        profile_info = _run_with_timeout(
            lambda: fetch_a_share_profile(query_upper),
            1.5,
            fallback={},
        ) or {}
        display_name = (
            profile_info.get("shortName")
            or profile_info.get("longName")
            or f"A-share {query_upper}"
        )
        scored.append((
            0,
            len(display_name),
            {
                "ticker": query_upper,
                "name": display_name,
                "market": "cn",
                "exchange": exchange,
                "aliases": [],
            },
        ))

    scored.sort(key=lambda pair: (pair[0], pair[1], pair[2]["ticker"]))
    return [format_symbol_candidate(item) for _, _, item in scored[:limit]]


def search_us_candidates(query, limit=8):
    normalized = normalize_search_query(query)
    if not normalized:
        return []

    cache_key = normalized.upper()
    now = time.time()
    cached = SYMBOL_SEARCH_CACHE.get(cache_key)
    if cached and cached["expiresAt"] > now:
        return cached["value"]

    candidates = []
    seen = set()
    query_upper = normalized.upper()

    local_ranked = []
    for item in US_SYMBOL_CATALOG:
        ticker = item["ticker"]
        alias_blob = " ".join([item["name"], *item.get("aliases", [])]).upper()
        score = None
        if ticker == query_upper:
            score = 0
        elif ticker.startswith(query_upper):
            score = 1
        elif query_upper in alias_blob:
            score = 2
        if score is None:
            continue
        local_ranked.append((score, len(item["name"]), item))

    local_ranked.sort(key=lambda pair: (pair[0], pair[1], pair[2]["ticker"]))
    for _, _, item in local_ranked[:limit]:
        symbol = item["ticker"]
        seen.add(symbol)
        candidates.append(format_symbol_candidate({
            "ticker": symbol,
            "name": item["name"],
            "market": "us",
            "exchange": item["exchange"],
        }))

    try:
        search = yf.Search(normalized, max_results=max(limit * 2, 10), news_count=0)
        quotes = getattr(search, "quotes", []) or []
        for quote in quotes:
            symbol = normalize_ticker_input(quote.get("symbol"))
            if not symbol or symbol in seen:
                continue
            quote_type = str(quote.get("quoteType", "")).upper()
            exchange = str(quote.get("exchange", "") or quote.get("exchangeDisp", "") or "").upper()
            if quote_type not in {"EQUITY", "ETF"}:
                continue
            if exchange not in {"NMS", "NYQ", "ASE", "NASDAQ", "NYSE", "AMEX", "PCX", "BATS"}:
                continue
            seen.add(symbol)
            candidates.append(format_symbol_candidate({
                "ticker": symbol,
                "name": quote.get("shortname") or quote.get("longname") or symbol,
                "market": "us",
                "exchange": exchange,
            }))
            if len(candidates) >= limit:
                break
    except Exception:
        pass

    if not candidates:
        symbol = normalize_ticker_input(normalized)
        if symbol and not is_a_share_ticker(symbol):
            try:
                quote = get_cached_quote(symbol)
                candidates = [format_symbol_candidate({
                    "ticker": symbol,
                    "name": quote.get("shortName") or quote.get("longName") or symbol,
                    "market": "us",
                    "exchange": quote.get("exchangeName") or "US",
                })]
            except Exception:
                candidates = []

    SYMBOL_SEARCH_CACHE[cache_key] = {
        "value": candidates,
        "expiresAt": now + SEARCH_CACHE_SECONDS,
    }
    return candidates


def format_symbol_candidate(item):
    ticker = normalize_ticker_input(item.get("ticker"))
    market = item.get("market") or ("cn" if is_a_share_ticker(ticker) else "us")
    exchange = str(item.get("exchange") or "").upper()
    symbol_display = ticker
    if market == "cn":
        if exchange == "SZ" or ticker.startswith(("0", "3")):
            symbol_display = f"{ticker}.SZ"
        elif exchange == "SH" or ticker.startswith("6"):
            symbol_display = f"{ticker}.SH"
    return {
        "ticker": ticker,
        "symbolDisplay": symbol_display,
        "name": str(item.get("name") or ticker),
        "market": market,
        "marketLabel": "A-share" if market == "cn" else "US",
        "exchange": exchange or ("SZ" if market == "cn" and ticker.startswith(("0", "3")) else "SH" if market == "cn" else "US"),
    }


def search_symbol_candidates(query, limit=10):
    normalized = normalize_search_query(query)
    if not normalized:
        return []

    query_upper = normalized.upper()
    cn_candidates = search_a_share_candidates(normalized, limit=limit)
    us_candidates = search_us_candidates(normalized, limit=limit)

    combined = []
    seen = set()
    prefer_cn_first = query_upper[:1].isdigit()
    ordered = [cn_candidates, us_candidates] if prefer_cn_first else [us_candidates, cn_candidates]

    for group in ordered:
        for item in group:
            key = item["ticker"]
            if key in seen:
                continue
            seen.add(key)
            combined.append(item)
            if len(combined) >= limit:
                return combined
    return combined


def iso_from_epoch(value):
    if value is None:
        return None
    try:
        return datetime.fromtimestamp(int(value), tz=timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    except (TypeError, ValueError, OSError, OverflowError):
        return None


def dt_from_epoch(value):
    if value is None:
        return None
    try:
        return datetime.fromtimestamp(int(value), tz=timezone.utc)
    except (TypeError, ValueError, OSError, OverflowError):
        return None


def iso_from_local_close(value, hour, minute, offset_hours):
    if value is None:
        return None
    try:
        if isinstance(value, pd.Timestamp):
            dt_value = value.to_pydatetime()
        elif isinstance(value, datetime):
            dt_value = value
        else:
            dt_value = datetime.combine(value, datetime.min.time())
        local_tz = timezone(timedelta(hours=offset_hours))
        dt_local = dt_value.replace(hour=hour, minute=minute, second=0, microsecond=0, tzinfo=local_tz)
        return dt_local.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    except Exception:
        return None


def _safe_float(value):
    try:
        if value is None or pd.isna(value):
            return None
        return float(value)
    except Exception:
        return None


def _safe_int(value):
    try:
        if value is None or pd.isna(value):
            return None
        return int(float(value))
    except Exception:
        return None


def _safe_text(value):
    if value is None:
        return ""
    return str(value).strip()


def build_source_info(status, missing_source=None, suggested_source=None, source_name=None):
    return {
        "status": status,
        "missing_source": missing_source or "—",
        "suggested_source": suggested_source or "—",
        "source_name": source_name or status,
    }


def http_get_text(url, timeout=8):
    request = Request(
        url,
        headers={
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36",
            "Accept": "application/rss+xml, application/xml, text/xml, text/html;q=0.9, */*;q=0.8",
        },
    )
    with urlopen(request, timeout=timeout) as response:
        charset = response.headers.get_content_charset() or "utf-8"
        return response.read().decode(charset, errors="ignore")


def http_get_json(url, timeout=8):
    text = http_get_text(url, timeout=timeout)
    return json.loads(text)


def http_get_json_with_accept(url, timeout=8, accept="application/json, text/plain;q=0.9, */*;q=0.8"):
    request = Request(
        url,
        headers={
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36",
            "Accept": accept,
            "Referer": "https://www.cnn.com/",
            "Origin": "https://www.cnn.com",
        },
    )
    with urlopen(request, timeout=timeout) as response:
        charset = response.headers.get_content_charset() or "utf-8"
        return json.loads(response.read().decode(charset, errors="ignore"))


def fetch_fred_series_points(series_id, limit=120):
    try:
        csv_text = http_get_text(f"https://fred.stlouisfed.org/graph/fredgraph.csv?id={series_id}", timeout=8)
        rows = []
        for raw_line in csv_text.splitlines()[1:]:
            if not raw_line or "," not in raw_line:
                continue
            date_text, value_text = raw_line.split(",", 1)
            value_text = value_text.strip()
            if not value_text or value_text == ".":
                continue
            value = _safe_float(value_text)
            if value is None:
                continue
            rows.append({"date": date_text.strip(), "value": value})
        return rows[-limit:]
    except Exception:
        return []


def parse_fear_greed_datetime(value):
    if value is None:
        return None
    if isinstance(value, (int, float)):
        timestamp = value / 1000 if value > 10_000_000_000 else value
        try:
            return datetime.fromtimestamp(timestamp, tz=timezone.utc)
        except Exception:
            return None
    text = str(value).strip()
    if not text:
        return None
    try:
        return datetime.fromisoformat(text.replace("Z", "+00:00"))
    except Exception:
        pass
    for fmt in ("%Y-%m-%d", "%Y-%m-%d %H:%M:%S"):
        try:
            return datetime.strptime(text, fmt).replace(tzinfo=timezone.utc)
        except Exception:
            continue
    return None


def extract_fear_greed_records(node, records=None):
    if records is None:
        records = []
    if isinstance(node, dict):
        numeric_value = None
        for key in ("score", "value"):
            candidate = _safe_float(node.get(key))
            if candidate is not None and 0 <= candidate <= 100:
                numeric_value = candidate
                break
        if numeric_value is not None:
            label = (
                _safe_text(node.get("rating"))
                or _safe_text(node.get("label"))
                or _safe_text(node.get("classification"))
                or _safe_text(node.get("status"))
                or _safe_text(node.get("name"))
            )
            stamp = None
            for key in ("timestamp", "time", "x", "date", "updated_at"):
                stamp = parse_fear_greed_datetime(node.get(key))
                if stamp is not None:
                    break
            records.append({
                "value": numeric_value,
                "label": label,
                "timestamp": stamp,
            })
        for value in node.values():
            extract_fear_greed_records(value, records)
    elif isinstance(node, list):
        for item in node:
            extract_fear_greed_records(item, records)
    return records


def parse_fear_greed_payload(payload):
    records = extract_fear_greed_records(payload, [])
    if not records:
        return None
    deduped = []
    seen = set()
    for record in records:
        dedupe_key = (
            record["value"],
            record["label"],
            record["timestamp"].isoformat() if record["timestamp"] else None,
        )
        if dedupe_key in seen:
            continue
        seen.add(dedupe_key)
        deduped.append(record)
    if not deduped:
        return None
    deduped.sort(key=lambda item: item["timestamp"] or datetime.min.replace(tzinfo=timezone.utc), reverse=True)
    latest = deduped[0]
    previous = deduped[1] if len(deduped) > 1 else None
    trend = None
    if previous is not None:
        delta = latest["value"] - previous["value"]
        if delta >= 3:
            trend = "rising"
        elif delta <= -3:
            trend = "falling"
        else:
            trend = "neutral"
    return {
        "value": latest["value"],
        "label": latest["label"] or fear_greed_label(latest["value"]),
        "trend": trend,
    }


def fetch_fear_greed_value():
    candidate_urls = [
        "https://production.dataviz.cnn.io/index/fearandgreed/graphdata",
        "https://production.dataviz.cnn.io/index/fearandgreed/current",
    ]
    for url in candidate_urls:
        try:
            payload = http_get_json_with_accept(url, timeout=6)
        except Exception:
            continue
        parsed = parse_fear_greed_payload(payload)
        if parsed is not None and parsed.get("value") is not None:
            return parsed
    return None


def fetch_fear_greed_snapshot():
    now = time.time()
    cached = FEAR_GREED_CACHE.get("value")
    if cached and FEAR_GREED_CACHE.get("expiresAt", 0) > now:
        return cached

    live_snapshot = fetch_fear_greed_value()
    if live_snapshot is not None and live_snapshot.get("value") is not None:
        snapshot = {
            "value": live_snapshot.get("value"),
            "label": live_snapshot.get("label") or fear_greed_label(live_snapshot.get("value")),
            "trend": live_snapshot.get("trend"),
            "source_name": "CNN Fear & Greed",
            "source_status": "Live",
            "source_reason": None,
        }
        FEAR_GREED_CACHE["value"] = snapshot
        FEAR_GREED_CACHE["expiresAt"] = now + (30 * 60)
        return snapshot

    if cached:
        stale_snapshot = dict(cached)
        stale_snapshot["source_status"] = "Stale"
        stale_snapshot["source_reason"] = "Using the last successful CNN Fear & Greed snapshot because the live feed is unavailable."
        return stale_snapshot

    return {
        "value": None,
        "label": None,
        "trend": None,
        "source_name": "CNN Fear & Greed",
        "source_status": "Data unavailable",
        "source_reason": "CNN Fear & Greed feed is unavailable.",
    }


def summarize_fomc_rate_path(series_points):
    if not series_points:
        return None
    latest = series_points[-1]
    latest_value = latest.get("value")
    if latest_value is None:
        return None
    baseline = None
    for point in reversed(series_points[:-1]):
        if point.get("value") is None:
            continue
        if abs(point["value"] - latest_value) >= 0.05:
            baseline = point
            break
    if baseline is None:
        return {
            "current_rate": latest_value,
            "last_change": 0.0,
            "direction": "unchanged",
            "summary": f"Fed funds rate is {latest_value:.2f}% and has not changed recently.",
            "last_change_date": latest.get("date"),
        }
    delta = round(latest_value - baseline["value"], 2)
    direction = "hike" if delta > 0 else "cut"
    summary = (
        f"Fed funds rate is {latest_value:.2f}%. Latest FOMC path points to a {direction} of {abs(delta):.2f}% versus {baseline['date']}."
    )
    return {
        "current_rate": latest_value,
        "last_change": delta,
        "direction": direction,
        "summary": summary,
        "last_change_date": baseline.get("date"),
    }


def parse_google_news_rss(query, market="us", limit=6):
    if not query:
        return []
    if market == "cn":
        hl, gl, ceid = "zh-CN", "CN", "CN:zh-Hans"
    else:
        hl, gl, ceid = "en-US", "US", "US:en"
    url = f"https://news.google.com/rss/search?q={quote_plus(query)}&hl={hl}&gl={gl}&ceid={quote_plus(ceid)}"
    xml_text = http_get_text(url, timeout=8)
    root = ET.fromstring(xml_text)
    articles = []
    seen = set()
    for item in root.findall(".//item"):
        raw_title = unescape(_safe_text(item.findtext("title")))
        if not raw_title:
            continue
        source = None
        headline = raw_title
        if " - " in raw_title:
            headline, source = raw_title.rsplit(" - ", 1)
        headline = headline.strip()
        dedupe_key = headline.lower()
        if not headline or dedupe_key in seen:
            continue
        seen.add(dedupe_key)
        published_at = _safe_text(item.findtext("pubDate"))
        try:
            if published_at:
                published_at = parsedate_to_datetime(published_at).astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        except Exception:
            pass
        articles.append({
            "headline": headline,
            "source": source,
            "link": _safe_text(item.findtext("link")),
            "published_at": published_at,
        })
        if len(articles) >= limit:
            break
    return articles


def normalize_yfinance_news_items(raw_items, limit=6):
    if not raw_items:
        return []
    articles = []
    seen = set()
    for raw in raw_items:
        if not isinstance(raw, dict):
            continue
        content = raw.get("content") if isinstance(raw.get("content"), dict) else {}
        candidate = content or raw
        headline = unescape(_safe_text(candidate.get("title") or raw.get("title")))
        if not headline:
            continue
        dedupe_key = headline.lower()
        if dedupe_key in seen:
            continue
        seen.add(dedupe_key)

        link = (
            _safe_text(candidate.get("canonicalUrl", {}).get("url") if isinstance(candidate.get("canonicalUrl"), dict) else None)
            or _safe_text(candidate.get("clickThroughUrl", {}).get("url") if isinstance(candidate.get("clickThroughUrl"), dict) else None)
            or _safe_text(candidate.get("link"))
            or _safe_text(raw.get("link"))
        )
        source = (
            _safe_text(candidate.get("provider", {}).get("displayName") if isinstance(candidate.get("provider"), dict) else None)
            or _safe_text(raw.get("publisher"))
            or _safe_text(raw.get("provider"))
        )
        published_at = (
            candidate.get("pubDate")
            or raw.get("providerPublishTime")
            or raw.get("published")
            or raw.get("published_at")
        )
        if isinstance(published_at, (int, float)):
            timestamp = published_at / 1000 if published_at > 10_000_000_000 else published_at
            try:
                published_at = datetime.fromtimestamp(timestamp, tz=timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
            except Exception:
                published_at = None
        elif published_at:
            published_at = _safe_text(published_at)

        articles.append({
            "headline": headline,
            "source": source,
            "link": link,
            "published_at": published_at,
        })
        if len(articles) >= limit:
            break
    return articles


def merge_news_articles(primary, fallback, limit=6):
    merged = []
    seen = set()
    for bucket in [primary or [], fallback or []]:
        for article in bucket:
            headline = _safe_text(article.get("headline"))
            if not headline:
                continue
            dedupe_key = headline.lower()
            if dedupe_key in seen:
                continue
            seen.add(dedupe_key)
            merged.append(article)
            if len(merged) >= limit:
                return merged
    return merged


def fetch_yfinance_company_news(symbol, limit=6):
    try:
        ticker = yf.Ticker(symbol)
        raw_items = []
        if hasattr(ticker, "get_news"):
            try:
                raw_items = ticker.get_news(count=limit)
            except TypeError:
                raw_items = ticker.get_news()
            except Exception:
                raw_items = []
        if not raw_items:
            raw_items = getattr(ticker, "news", []) or []
        return normalize_yfinance_news_items(raw_items, limit=limit)
    except Exception:
        return []


def fetch_yfinance_market_news(symbols=None, limit=6):
    merged = []
    seen = set()
    for symbol in (symbols or ["SPY", "QQQ", "^GSPC"]):
        for article in fetch_yfinance_company_news(symbol, limit=limit):
            headline = _safe_text(article.get("headline"))
            if not headline:
                continue
            dedupe_key = headline.lower()
            if dedupe_key in seen:
                continue
            seen.add(dedupe_key)
            merged.append(article)
            if len(merged) >= limit:
                return merged
    return merged


def score_news_articles(articles, fallback_summary, market="company"):
    if not articles:
        return {
            "score": 50,
            "sentiment": None,
            "summary": fallback_summary,
            "key_points": [],
            "bullish_news": [],
            "bearish_news": [],
            "key_catalysts": [],
            "risk_events": [],
        }

    running = 0
    bullish = []
    bearish = []
    key_points = []
    for article in articles:
        headline = _safe_text(article.get("headline"))
        if not headline:
            continue
        lowered = headline.lower()
        positive_hits = sum(1 for keyword in POSITIVE_NEWS_KEYWORDS if keyword.lower() in lowered)
        negative_hits = sum(1 for keyword in NEGATIVE_NEWS_KEYWORDS if keyword.lower() in lowered)
        delta = max(-3, min(3, positive_hits - negative_hits))
        if market == "macro" and any(word in lowered for word in ["tariff", "war", "conflict", "inflation", "hawkish", "antitrust", "probe"]):
            delta -= 1
        running += delta
        label = headline if not article.get("source") else f"{headline} · {article.get('source')}"
        key_points.append(label)
        if delta > 0:
            bullish.append(label)
        elif delta < 0:
            bearish.append(label)

    score = max(25, min(78, int(round(50 + running * 6))))
    sentiment = "neutral"
    if score >= 58:
        sentiment = "bullish"
    elif score <= 42:
        sentiment = "bearish"

    if market == "macro":
        if sentiment == "bullish":
            summary = "Broad macro-news flow is leaning supportive."
        elif sentiment == "bearish":
            summary = "Broad macro-news flow is leaning risk-off."
        else:
            summary = "Macro-news flow is mixed and currently balanced."
    else:
        if sentiment == "bullish":
            summary = "Recent company headlines are leaning constructive."
        elif sentiment == "bearish":
            summary = "Recent company headlines are leaning cautious."
        else:
            summary = "Recent company headlines are mixed."

    return {
        "score": score,
        "sentiment": sentiment,
        "summary": summary,
        "key_points": key_points[:4],
        "bullish_news": bullish[:3],
        "bearish_news": bearish[:3],
        "key_catalysts": bullish[:3],
        "risk_events": bearish[:3],
    }


def classify_macro_events(articles):
    events = []
    for article in articles[:5]:
        headline = _safe_text(article.get("headline"))
        lowered = headline.lower()
        event_type = "other"
        for candidate, pattern in MACRO_EVENT_PATTERNS:
            if pattern.search(lowered):
                event_type = candidate
                break
        impact = "mixed"
        severity = "low"
        if any(word in lowered for word in ["tariff", "war", "conflict", "inflation", "hawkish", "probe", "sanction"]):
            impact = "negative"
            severity = "high" if any(word in lowered for word in ["war", "missile", "sanction", "tariff"]) else "medium"
        elif any(word in lowered for word in ["rate cut", "cooling inflation", "stimulus", "rebound"]):
            impact = "positive"
            severity = "medium"
        events.append({
            "event_type": event_type,
            "headline": headline,
            "summary": headline,
            "affected_sectors": [],
            "affected_tickers": [],
            "impact": impact,
            "severity": severity,
            "source": article.get("source"),
            "link": article.get("link"),
            "published_at": article.get("published_at"),
        })
    return events


def fetch_company_news_payload(ticker, quote):
    symbol = quote.get("symbol") or ticker
    company_name = quote.get("longName") or quote.get("shortName") or ticker
    market = "cn" if is_a_share_ticker(ticker) else "us"
    query = f"{symbol} {company_name} stock"
    if market == "cn":
        query = f"{ticker} {company_name} 股票"
    try:
        google_articles = parse_google_news_rss(query, market=market, limit=6)
        yf_articles = fetch_yfinance_company_news(symbol, limit=6) if market == "us" else []
        articles = merge_news_articles(google_articles, yf_articles, limit=6)
        scored = score_news_articles(
            articles,
            "Recent company-news feed is unavailable, so this module stays neutral.",
            market="company",
        )
        return {
            "sentiment": scored["sentiment"],
            "score": scored["score"],
            "summary": scored["summary"],
            "key_points": scored["key_points"],
            "latest_news": articles[:5],
            "bullish_news": scored["bullish_news"],
            "bearish_news": scored["bearish_news"],
            "key_catalysts": scored["key_catalysts"],
            "risk_events": scored["risk_events"],
            "source_info": build_source_info(
                "Live",
                source_name="Google News RSS / Yahoo Finance",
                suggested_source="Google News RSS / Yahoo Finance / FMP / Polygon",
            ),
        }
    except Exception as exc:
        return {
            "sentiment": None,
            "score": 50,
            "summary": f"Company-news feed unavailable: {exc}",
            "key_points": [],
            "latest_news": [],
            "bullish_news": [],
            "bearish_news": [],
            "key_catalysts": [],
            "risk_events": [],
            "source_info": build_source_info(
                "Data unavailable",
                missing_source="Google News RSS / Yahoo Finance",
                suggested_source="Google News RSS / Yahoo Finance / FMP / Polygon",
                source_name="Company News Feed",
            ),
        }


def fetch_single_symbol_last_close(symbol):
    try:
        history = yf.Ticker(symbol).history(period="5d", interval="1d", auto_adjust=False)
        if history is None or history.empty:
            ticker = yf.Ticker(symbol)
            fast_info = getattr(ticker, "fast_info", {}) or {}
            return _safe_float(
                fast_info.get("lastPrice")
                or fast_info.get("regularMarketPrice")
                or fast_info.get("previousClose")
            )
        closes = history["Close"].dropna()
        if closes.empty:
            ticker = yf.Ticker(symbol)
            fast_info = getattr(ticker, "fast_info", {}) or {}
            return _safe_float(
                fast_info.get("lastPrice")
                or fast_info.get("regularMarketPrice")
                or fast_info.get("previousClose")
            )
        return _safe_float(closes.iloc[-1])
    except Exception:
        return None


def fetch_symbol_history_points(symbol, period="3mo", interval="1d", limit=60, value_scale=1.0):
    try:
        history = yf.Ticker(symbol).history(period=period, interval=interval, auto_adjust=False)
        if history is None or history.empty:
            return []
        rows = []
        closes = history.get("Close")
        if closes is None:
            return []
        for index, raw_value in closes.dropna().items():
            value = _safe_float(raw_value)
            if value is None:
                continue
            if hasattr(index, "to_pydatetime"):
                stamp = index.to_pydatetime()
            elif isinstance(index, datetime):
                stamp = index
            else:
                try:
                    stamp = pd.Timestamp(index).to_pydatetime()
                except Exception:
                    stamp = None
            if stamp is None:
                continue
            rows.append({
                "date": stamp.date().isoformat(),
                "value": value * value_scale,
            })
        return rows[-limit:]
    except Exception:
        return []


def scale_series_points(series_points, scale):
    if not series_points:
        return []
    return [
        {
            "date": point.get("date"),
            "value": (_safe_float(point.get("value")) * scale) if _safe_float(point.get("value")) is not None else None,
        }
        for point in series_points
        if _safe_float(point.get("value")) is not None
    ]


def fetch_treasury_history_points(limit=40):
    fred_points = fetch_fred_series_points("DGS10", limit=limit)
    if fred_points:
        return fred_points
    yahoo_points = fetch_symbol_history_points("^TNX", period="3mo", interval="1d", limit=limit, value_scale=1.0)
    latest = latest_series_value(yahoo_points)
    if latest is not None and latest > 20:
        return scale_series_points(yahoo_points, 0.1)
    return yahoo_points


def latest_series_value(series_points):
    if not series_points:
        return None
    latest = series_points[-1]
    return _safe_float(latest.get("value"))


def series_change(series_points, sessions_back=5):
    if not series_points or len(series_points) < 2:
        return None
    latest_value = latest_series_value(series_points)
    if latest_value is None:
        return None
    anchor_index = max(0, len(series_points) - 1 - max(1, int(sessions_back)))
    anchor_value = None
    for point in reversed(series_points[:anchor_index + 1]):
        anchor_value = _safe_float(point.get("value"))
        if anchor_value is not None:
            break
    if anchor_value is None:
        return None
    return round(latest_value - anchor_value, 2)


def classify_change_trend(change_5d, change_20d, short_threshold, long_threshold):
    if change_5d is None and change_20d is None:
        return "neutral"
    short_value = change_5d or 0.0
    long_value = change_20d or 0.0
    if short_value >= short_threshold or long_value >= long_threshold:
        return "rising"
    if short_value <= -short_threshold or long_value <= -long_threshold:
        return "falling"
    return "neutral"


def fear_greed_label(value):
    if value is None:
        return None
    if value <= 25:
        return "Extreme Fear"
    if value <= 45:
        return "Fear"
    if value <= 55:
        return "Neutral"
    if value <= 75:
        return "Greed"
    return "Extreme Greed"


def load_market_events():
    try:
        if not os.path.exists(MARKET_EVENTS_FILE):
            return []
        with open(MARKET_EVENTS_FILE, "r", encoding="utf-8") as handle:
            payload = json.load(handle)
        events = payload.get("events", []) if isinstance(payload, dict) else []
        return [event for event in events if isinstance(event, dict)]
    except Exception:
        return []


def parse_iso_date(date_text):
    try:
        return datetime.strptime(str(date_text).strip(), "%Y-%m-%d").date()
    except Exception:
        return None


def find_active_market_event(events, as_of_date=None, lookback_days=3):
    if not events:
        return {
            "active": False,
            "type": None,
            "title": None,
            "impact": None,
            "severity": None,
            "summary": "No recent Fed or macro event is active in the configured window.",
            "date": None,
            "source": "market_events.json",
        }
    today = as_of_date or datetime.now(timezone.utc).date()
    window_start = today - timedelta(days=lookback_days)
    ranked = []
    severity_rank = {"high": 3, "medium": 2, "low": 1}
    for event in events:
        event_date = parse_iso_date(event.get("date"))
        if event_date is None or event_date < window_start or event_date > today:
            continue
        ranked.append((event_date, severity_rank.get(str(event.get("severity", "")).lower(), 0), event))
    if not ranked:
        return {
            "active": False,
            "type": None,
            "title": None,
            "impact": None,
            "severity": None,
            "summary": "No recent Fed or macro event is active in the configured window.",
            "date": None,
            "source": "market_events.json",
        }
    ranked.sort(key=lambda item: (item[0], item[1]), reverse=True)
    chosen = ranked[0][2]
    return {
        "active": True,
        "type": _safe_text(chosen.get("type")),
        "title": _safe_text(chosen.get("title")),
        "impact": _safe_text(chosen.get("impact")),
        "severity": _safe_text(chosen.get("severity")) or "medium",
        "summary": _safe_text(chosen.get("summary")) or _safe_text(chosen.get("title")) or "Recent configured macro event is active.",
        "date": parse_iso_date(chosen.get("date")).isoformat(),
        "source": "market_events.json",
    }


def build_index_trend(symbol, label):
    points = fetch_symbol_history_points(symbol, period="3mo", interval="1d", limit=50)
    if not points:
        return {
            "symbol": symbol,
            "label": label,
            "value": None,
            "change_5d_pct": None,
            "change_20d_pct": None,
            "trend": "neutral",
            "impact": "Data unavailable",
        }
    current_value = latest_series_value(points)
    change_5d = series_change(points, 5)
    change_20d = series_change(points, 20)
    change_5d_pct = None
    change_20d_pct = None
    if current_value is not None and len(points) > 5:
        base_5d = _safe_float(points[max(0, len(points) - 6)].get("value"))
        if base_5d not in (None, 0):
            change_5d_pct = round(((current_value - base_5d) / base_5d) * 100, 2)
    if current_value is not None and len(points) > 20:
        base_20d = _safe_float(points[max(0, len(points) - 21)].get("value"))
        if base_20d not in (None, 0):
            change_20d_pct = round(((current_value - base_20d) / base_20d) * 100, 2)
    trend = "neutral"
    if (change_5d_pct or 0) >= 1.5 and (change_20d_pct or 0) >= 0:
        trend = "rising"
    elif (change_5d_pct or 0) <= -1.5 and (change_20d_pct or 0) <= 0:
        trend = "falling"
    impact = "Neutral"
    if trend == "rising":
        impact = "Supportive equity trend"
    elif trend == "falling":
        impact = "Broad market trend is soft"
    return {
        "symbol": symbol,
        "label": label,
        "value": current_value,
        "change_5d_pct": change_5d_pct,
        "change_20d_pct": change_20d_pct,
        "trend": trend,
        "impact": impact,
    }


def build_strategy_impact_summary(regime, fed_event, fear_greed_label_value):
    buy_stock = "Neutral backdrop for staged stock entries."
    sell_put = "Neutral for cash-secured puts if the strike still sits near support."
    covered_call = "Neutral for covered calls."
    wait_no_action = "Waiting is optional, not mandatory."
    if regime == "risk_off":
        buy_stock = "Risk-off backdrop lowers the quality of aggressive chase entries."
        sell_put = "Sell puts should be more conservative with lower strikes and tighter duration."
        covered_call = "Covered calls become relatively more attractive if upside is capped by resistance."
        wait_no_action = "Waiting or scaling slowly becomes more attractive in a risk-off tape."
    elif regime == "risk_on":
        buy_stock = "Risk-on backdrop is more supportive for staged stock entries."
        sell_put = "Sell puts can stay constructive if the stock also has clean support."
        covered_call = "Covered calls are still usable, but upside capping matters more in a risk-on tape."
        wait_no_action = "Waiting is less necessary unless the stock is stretched."
    if fed_event.get("active") and fed_event.get("type") in {"fed_rate_hike", "fed_hawkish"}:
        sell_put = "Fed hawkish pressure argues for lower put strikes, shorter DTE, and explicit rate-risk caution."
    if fear_greed_label_value == "Extreme Greed":
        covered_call = "Extreme greed raises chase risk, which can make covered calls more attractive near resistance."
    return {
        "buy_stock": buy_stock,
        "sell_put": sell_put,
        "covered_call": covered_call,
        "wait_no_action": wait_no_action,
    }


def fetch_market_context_payload():
    vix_points = fetch_fred_series_points("VIXCLS", limit=40) or fetch_symbol_history_points("^VIX", period="3mo", interval="1d", limit=40)
    vix = latest_series_value(vix_points)
    vix_5d_change = series_change(vix_points, 5)
    vix_20d_change = series_change(vix_points, 20)
    vix_trend = classify_change_trend(vix_5d_change, vix_20d_change, 1.0, 2.5)
    treasury_points = fetch_treasury_history_points(limit=40)
    treasury_yield = latest_series_value(treasury_points)
    yield_5d_change = series_change(treasury_points, 5)
    yield_20d_change = series_change(treasury_points, 20)
    yield_5d_change_bps = round(yield_5d_change * 100, 1) if yield_5d_change is not None else None
    yield_20d_change_bps = round(yield_20d_change * 100, 1) if yield_20d_change is not None else None
    yield_trend = classify_change_trend(yield_5d_change_bps, yield_20d_change_bps, 10.0, 25.0)
    fed_funds_points = fetch_fred_series_points("DFF", limit=180)
    fed_funds_value = fed_funds_points[-1]["value"] if fed_funds_points else None
    fomc_rate_path = summarize_fomc_rate_path(fed_funds_points)
    fear_greed_snapshot = fetch_fear_greed_snapshot()
    fear_greed = fear_greed_snapshot.get("value")
    fear_greed_label_value = fear_greed_snapshot.get("label") or fear_greed_label(fear_greed)
    active_event = find_active_market_event(load_market_events(), datetime.now(timezone.utc).date(), lookback_days=3)
    spy_trend = build_index_trend("SPY", "SPY")
    qqq_trend = build_index_trend("QQQ", "QQQ")
    macro_articles = []
    try:
        macro_articles = parse_google_news_rss("tariff war fed rates inflation fomc sanctions oil geopolitical regulation", market="us", limit=6)
    except Exception:
        macro_articles = []
    if not macro_articles:
        macro_articles = fetch_yfinance_market_news(["SPY", "QQQ", "^GSPC", "^IXIC"], limit=6)
    filtered_events = classify_macro_events(macro_articles)
    macro_articles = [article for article, event in zip(macro_articles, filtered_events) if event.get("event_type") != "other"] or macro_articles
    macro_news = score_news_articles(
        macro_articles,
        "Broad macro-news feed is currently unavailable, so macro stays neutral.",
        market="macro",
    )
    broad_events = [event for event in classify_macro_events(macro_articles) if event.get("event_type") != "other"][:5]
    base_score = 50
    vix_delta = 0
    vix_momentum_delta = 0
    if vix is not None:
        if vix < 15:
            vix_delta = 5
        elif vix <= 20:
            vix_delta = 0
        elif vix <= 30:
            vix_delta = -5
        else:
            vix_delta = -10
        if (vix_5d_change or 0) >= 2:
            vix_momentum_delta = -5
        elif (vix_5d_change or 0) <= -2:
            vix_momentum_delta = 2

    yield_delta = 0
    if yield_5d_change_bps is not None:
        if yield_5d_change_bps >= 10:
            yield_delta -= 5
        elif yield_5d_change_bps <= -10:
            yield_delta += 3
    if yield_20d_change_bps is not None:
        if yield_20d_change_bps >= 25:
            yield_delta -= 8
        elif yield_20d_change_bps <= -25:
            yield_delta += 5

    fear_greed_short_delta = 0
    fear_greed_long_delta = 0
    if fear_greed_label_value == "Extreme Fear":
        fear_greed_short_delta = -5
        fear_greed_long_delta = 3
    elif fear_greed_label_value == "Fear":
        fear_greed_short_delta = -2
    elif fear_greed_label_value == "Greed":
        fear_greed_short_delta = -2
    elif fear_greed_label_value == "Extreme Greed":
        fear_greed_short_delta = -6

    fed_short_delta = 0
    fed_mid_delta = 0
    fed_long_delta = 0
    fed_type = active_event.get("type")
    fed_summary_lower = _safe_text(active_event.get("summary")).lower()
    if active_event.get("active") and fed_type in {"fed_rate_hike", "fed_hawkish"}:
        fed_short_delta = -8
        fed_mid_delta = -6
        fed_long_delta = -3
    elif active_event.get("active") and fed_type in {"fed_rate_cut", "fed_dovish"}:
        if any(word in fed_summary_lower for word in ["recession", "slowdown", "stress", "weakness"]):
            fed_short_delta = 1
            fed_mid_delta = 0
            fed_long_delta = -1
        else:
            fed_short_delta = 5
            fed_mid_delta = 5
            fed_long_delta = 2

    equity_trend_delta = 0
    rising_indices = [item for item in [spy_trend, qqq_trend] if item.get("trend") == "rising"]
    falling_indices = [item for item in [spy_trend, qqq_trend] if item.get("trend") == "falling"]
    if len(rising_indices) == 2:
        equity_trend_delta = 4
    elif len(falling_indices) == 2:
        equity_trend_delta = -4

    macro_news_delta = 0
    if macro_news["sentiment"] == "bullish":
        macro_news_delta = 2
    elif macro_news["sentiment"] == "bearish":
        macro_news_delta = -2

    macro_score = base_score + vix_delta + vix_momentum_delta + yield_delta + fear_greed_short_delta + fed_short_delta + equity_trend_delta + macro_news_delta
    macro_score = max(25, min(85, int(round(macro_score))))

    missing_core_count = 0
    missing_core_count += 0 if vix is not None else 1
    missing_core_count += 0 if treasury_yield is not None else 1
    missing_core_count += 0 if fear_greed is not None else 1
    missing_core_count += 0 if fed_funds_value is not None else 1
    missing_core_count += 0 if spy_trend.get("value") is not None or qqq_trend.get("value") is not None else 1
    confidence = max(42, min(95, 88 - missing_core_count * 10 - (0 if macro_articles else 5)))

    regime = "neutral"
    if active_event.get("active") and fed_type in {"fed_rate_hike", "fed_hawkish"}:
        regime = "risk_off"
    elif macro_score <= 45:
        regime = "risk_off"
    elif macro_score >= 60:
        regime = "risk_on"

    vix_impact = "Neutral volatility backdrop."
    if vix is None:
        vix_impact = "Data unavailable"
    elif vix > 30:
        vix_impact = "High volatility is a clear short-term risk-off signal."
    elif vix >= 20:
        vix_impact = "Elevated volatility keeps short-term risk appetite in check."
    elif vix < 15:
        vix_impact = "Low volatility is supportive for risk appetite."

    yield_impact = "Neutral yield backdrop."
    if treasury_yield is None:
        yield_impact = "Data unavailable"
    elif yield_trend == "rising":
        yield_impact = "Rising 10Y yield is usually negative for high multiple, REIT, and rate-sensitive stocks."
    elif yield_trend == "falling":
        yield_impact = "Falling 10Y yield is generally supportive for duration-sensitive equities."

    fear_greed_impact = "Neutral sentiment read."
    if fear_greed_label_value == "Extreme Fear":
        fear_greed_impact = "Extreme fear raises short-term caution but can create medium-term opportunity."
    elif fear_greed_label_value == "Fear":
        fear_greed_impact = "Fear argues for more patient entries in the short term."
    elif fear_greed_label_value == "Greed":
        fear_greed_impact = "Greed raises short-term chasing risk."
    elif fear_greed_label_value == "Extreme Greed":
        fear_greed_impact = "Extreme greed raises chase risk and can favor covered-call style positioning."

    trend_summary = "Broad index trend is mixed."
    if len(rising_indices) == 2:
        trend_summary = "SPY and QQQ are both trending higher, which is supportive for risk appetite."
    elif len(falling_indices) == 2:
        trend_summary = "SPY and QQQ are both soft, which keeps the backdrop risk-off."

    market_summary = "Market environment is balanced."
    if regime == "risk_off":
        market_summary = "Market environment is leaning risk-off due to volatility, yields, or a hawkish macro event."
    elif regime == "risk_on":
        market_summary = "Market environment is leaning risk-on with supportive volatility, yield, and index trends."

    macro_summary_bits = []
    if vix is not None:
        macro_summary_bits.append(f"VIX {vix:.1f}")
    if fear_greed is not None:
        macro_summary_bits.append(f"Fear & Greed {fear_greed:.0f}/100 ({fear_greed_label_value})")
    if treasury_yield is not None:
        macro_summary_bits.append(f"10Y {treasury_yield:.2f}%")
    if fed_funds_value is not None:
        macro_summary_bits.append(f"Fed funds {fed_funds_value:.2f}%")
    macro_summary_bits.append(market_summary)
    if active_event.get("active") and active_event.get("summary"):
        macro_summary_bits.append(active_event["summary"])

    market_context = {
        "score": macro_score,
        "regime": regime,
        "confidence": confidence,
        "vix": {
            "value": vix,
            "change_5d": vix_5d_change,
            "change_20d": vix_20d_change,
            "trend": vix_trend,
            "impact": vix_impact,
        },
        "fear_greed": {
            "value": fear_greed,
            "label": fear_greed_label_value,
            "trend": fear_greed_snapshot.get("trend"),
            "impact": fear_greed_impact,
        },
        "ten_year_yield": {
            "value": treasury_yield,
            "change_5d_bps": yield_5d_change_bps,
            "change_20d_bps": yield_20d_change_bps,
            "trend": yield_trend,
            "impact": yield_impact,
        },
        "fed_event": active_event,
        "equity_trend": {
            "spy": spy_trend,
            "qqq": qqq_trend,
            "summary": trend_summary,
            "impact": "supportive" if equity_trend_delta > 0 else "cautious" if equity_trend_delta < 0 else "neutral",
        },
        "summary": market_summary,
        "breakdown": {
            "base": base_score,
            "vix": vix_delta,
            "vix_momentum": vix_momentum_delta,
            "fear_greed_short": fear_greed_short_delta,
            "fear_greed_long": fear_greed_long_delta,
            "ten_year_yield": yield_delta,
            "fed_event_short": fed_short_delta,
            "fed_event_mid": fed_mid_delta,
            "fed_event_long": fed_long_delta,
            "equity_trend": equity_trend_delta,
            "macro_news": macro_news_delta,
            "final_score": macro_score,
        },
        "strategy_impact": build_strategy_impact_summary(regime, active_event, fear_greed_label_value),
        "source_info": {
            "vix": build_source_info("Live" if vix is not None else "Data unavailable", missing_source="Cboe / FRED / Yahoo Finance", suggested_source="FRED VIXCLS / Yahoo Finance ^VIX / Cboe", source_name="FRED VIXCLS"),
            "fear_greed": build_source_info(
                fear_greed_snapshot.get("source_status") or ("Live" if fear_greed is not None else "Data unavailable"),
                missing_source=fear_greed_snapshot.get("source_reason") or "CNN Fear & Greed",
                suggested_source="CNN Fear & Greed direct endpoint / CNN scraper / RapidAPI / custom in-house sentiment composite.",
                source_name=fear_greed_snapshot.get("source_name") or "Fear & Greed",
            ),
            "ten_year_yield": build_source_info("Live" if treasury_yield is not None else "Data unavailable", missing_source="FRED DGS10 / Yahoo Finance ^TNX", suggested_source="FRED DGS10 / Yahoo Finance ^TNX / Alpha Vantage", source_name="FRED DGS10"),
            "fed_event": build_source_info("Live", missing_source="Economic calendar / market_events.json", suggested_source="FMP Economic Calendar / Alpha Vantage / market_events.json", source_name="market_events.json"),
            "equity_trend": build_source_info("Live" if spy_trend.get("value") is not None or qqq_trend.get("value") is not None else "Data unavailable", missing_source="Yahoo Finance SPY / QQQ", suggested_source="Yahoo Finance SPY / QQQ", source_name="Yahoo Finance"),
        },
    }

    return {
        "macro": {
            "vix": vix,
            "fear_greed": fear_greed,
            "treasury_yield": treasury_yield,
            "fed_funds_rate": fed_funds_value,
            "fomc_rate_path": fomc_rate_path,
            "score": macro_score,
            "summary": " · ".join(macro_summary_bits) if macro_summary_bits else "Macro data is neutral due to missing live feeds.",
            "source_info": {
                "vix": build_source_info("Live" if vix is not None else "Data unavailable", missing_source="Cboe / FRED / Yahoo Finance", suggested_source="FRED VIXCLS / Yahoo Finance ^VIX / Cboe", source_name="FRED VIXCLS"),
                "fear_greed": build_source_info(
                    fear_greed_snapshot.get("source_status") or ("Live" if fear_greed is not None else "Data unavailable"),
                    missing_source=fear_greed_snapshot.get("source_reason") or "CNN Fear & Greed",
                    suggested_source="CNN Fear & Greed direct endpoint / CNN scraper / RapidAPI / custom in-house sentiment composite.",
                    source_name=fear_greed_snapshot.get("source_name") or "Fear & Greed",
                ),
                "treasury_yield": build_source_info("Live" if treasury_yield is not None else "Data unavailable", missing_source="FRED / Yahoo Finance ^TNX", suggested_source="FRED DGS10 / Yahoo Finance ^TNX / Alpha Vantage", source_name="FRED DGS10"),
                "fed_funds_rate": build_source_info("Live" if fed_funds_value is not None else "Data unavailable", missing_source="FRED DFF / FEDFUNDS", suggested_source="FRED DFF / FEDFUNDS", source_name="FRED"),
                "fomc_rate_path": build_source_info("Live" if fomc_rate_path is not None else "Data unavailable", missing_source="Federal Reserve / FRED", suggested_source="Federal Reserve FOMC / FRED DFF", source_name="FRED / Federal Reserve"),
                "market_events": build_source_info("Live", missing_source="Economic calendar / market_events.json", suggested_source="FMP Economic Calendar / Alpha Vantage / market_events.json", source_name="market_events.json"),
                "equity_trend": build_source_info("Live" if spy_trend.get("value") is not None or qqq_trend.get("value") is not None else "Data unavailable", missing_source="Yahoo Finance SPY / QQQ", suggested_source="Yahoo Finance SPY / QQQ", source_name="Yahoo Finance"),
            },
        },
        "market_context": market_context,
        "broad_macro_news": {
            "score": macro_news["score"],
            "sentiment": macro_news["sentiment"],
            "major_events": broad_events,
            "summary": macro_news["summary"],
            "source_info": build_source_info(
                "Live" if macro_articles else "Data unavailable",
                missing_source="Broad market news feed",
                suggested_source="Google News RSS / Reuters / FMP Market News / Alpha Vantage News",
                source_name="Google News RSS",
            ),
        },
    }


def get_cached_company_news(ticker, quote):
    cache_key = f"{ticker}:{quote.get('updatedAt') or 'na'}"
    now = time.time()
    cached = COMPANY_NEWS_CACHE.get(cache_key)
    if cached and cached["expiresAt"] > now:
        return cached["value"]
    value = fetch_company_news_payload(ticker, quote)
    COMPANY_NEWS_CACHE[cache_key] = {
        "value": value,
        "expiresAt": now + NEWS_CACHE_SECONDS,
    }
    return value


def get_cached_market_context():
    now = time.time()
    cached = MARKET_CONTEXT_CACHE.get("value")
    if cached and MARKET_CONTEXT_CACHE["expiresAt"] > now:
        cached_vix = ((cached.get("market_context") or {}).get("vix") or {}).get("value")
        cached_yield = ((cached.get("market_context") or {}).get("ten_year_yield") or {}).get("value")
        cached_fear_greed = ((cached.get("market_context") or {}).get("fear_greed") or {}).get("value")
        cache_age_budget = MARKET_CONTEXT_CACHE["expiresAt"] - now
        critical_missing = cached_vix is None or cached_yield is None or cached_fear_greed is None
        if not critical_missing or cache_age_budget > (NEWS_CACHE_SECONDS - 90):
            return cached
    value = fetch_market_context_payload()
    MARKET_CONTEXT_CACHE["value"] = value
    MARKET_CONTEXT_CACHE["expiresAt"] = now + NEWS_CACHE_SECONDS
    return value


def build_unavailable_options_payload(reason, market="us"):
    return {
        "available": False,
        "market": market,
        "reason": reason,
        "callWall": None,
        "putWall": None,
        "gammaFlip": None,
        "impliedVolatility": None,
        "historicVolatility": None,
        "ivPercentile": None,
        "ivRank": None,
        "netGammaExposure": None,
        "expiries": [],
        "nearestExpiry": None,
        "updatedAt": None,
        "coverage": "none",
    }


def build_unavailable_quote(ticker, reason, stale_value=None):
    base = stale_value.copy() if isinstance(stale_value, dict) else {}
    metadata = base.get("metadata") if isinstance(base.get("metadata"), dict) else {}
    history = base.get("history") if isinstance(base.get("history"), dict) else {}
    return {
        "price": base.get("price"),
        "previousClose": base.get("previousClose"),
        "change": base.get("change"),
        "changePercent": base.get("changePercent"),
        "updatedAt": base.get("updatedAt"),
        "symbol": base.get("symbol") or resolve_market_symbol(ticker),
        "shortName": base.get("shortName"),
        "longName": base.get("longName"),
        "exchangeName": base.get("exchangeName"),
        "trailingPE": base.get("trailingPE"),
        "forwardPE": base.get("forwardPE"),
        "marketCap": base.get("marketCap"),
        "metadata": {
            "sector": metadata.get("sector"),
            "industry": metadata.get("industry"),
            "beta": metadata.get("beta"),
            "dividendYield": metadata.get("dividendYield"),
            "payoutRatio": metadata.get("payoutRatio"),
            "enterpriseToEbitda": metadata.get("enterpriseToEbitda"),
            "priceToSalesTrailing12Months": metadata.get("priceToSalesTrailing12Months"),
            "enterpriseToRevenue": metadata.get("enterpriseToRevenue"),
            "operatingMargins": metadata.get("operatingMargins"),
            "grossMargins": metadata.get("grossMargins"),
            "returnOnEquity": metadata.get("returnOnEquity"),
            "debtToEquity": metadata.get("debtToEquity"),
            "currentRatio": metadata.get("currentRatio"),
            "quickRatio": metadata.get("quickRatio"),
            "freeCashflow": metadata.get("freeCashflow"),
            "totalCash": metadata.get("totalCash"),
            "totalDebt": metadata.get("totalDebt"),
            "capex": metadata.get("capex"),
            "businessSummary": metadata.get("businessSummary"),
            "country": metadata.get("country"),
            "city": metadata.get("city"),
            "state": metadata.get("state"),
            "exchange": metadata.get("exchange"),
            "quoteType": metadata.get("quoteType"),
            "ipoDate": metadata.get("ipoDate"),
            "floatShares": metadata.get("floatShares"),
            "sharesOutstanding": metadata.get("sharesOutstanding"),
        },
        "optionsMarket": base.get("optionsMarket") or build_unavailable_options_payload(
            reason,
            market="cn" if is_a_share_ticker(ticker) else "us",
        ),
        "history": {
            "timestamps": history.get("timestamps", []),
            "closes": history.get("closes", []),
            "highs": history.get("highs", []),
            "lows": history.get("lows", []),
            "volumes": history.get("volumes", []),
        },
        "error": reason,
        "stale": bool(stale_value),
        "marketStatus": "closed" if stale_value else "unavailable",
        "dataStaleness": "stale" if stale_value else "unavailable",
        "last_successful_update": base.get("last_successful_update") or base.get("updatedAt"),
    }


def _norm_pdf(value):
    return math.exp(-0.5 * value * value) / math.sqrt(2 * math.pi)


def _weighted_average(values):
    weighted_total = 0.0
    total_weight = 0.0
    for value, weight in values:
        if value is None or weight is None or weight <= 0 or not math.isfinite(value) or not math.isfinite(weight):
            continue
        weighted_total += value * weight
        total_weight += weight
    if total_weight <= 0:
        return None
    return weighted_total / total_weight


def _run_with_timeout(func, timeout_seconds, fallback=None):
    result_queue = queue.Queue(maxsize=1)

    def worker():
        try:
            result_queue.put(("ok", func()))
        except Exception as exc:
            result_queue.put(("error", exc))

    thread = threading.Thread(target=worker, daemon=True)
    thread.start()

    try:
        status, payload = result_queue.get(timeout=timeout_seconds)
    except queue.Empty:
        return fallback

    if status == "error":
        return fallback
    return payload


def _median(values):
    filtered = sorted(
        value for value in (values or [])
        if value is not None and math.isfinite(value)
    )
    if not filtered:
        return None
    midpoint = len(filtered) // 2
    if len(filtered) % 2 == 1:
        return filtered[midpoint]
    return (filtered[midpoint - 1] + filtered[midpoint]) / 2


def _standard_deviation(values):
    filtered = [
        value for value in (values or [])
        if value is not None and math.isfinite(value)
    ]
    if len(filtered) < 2:
        return None
    average = sum(filtered) / len(filtered)
    variance = sum((value - average) ** 2 for value in filtered) / (len(filtered) - 1)
    if variance < 0 or not math.isfinite(variance):
        return None
    return math.sqrt(variance)


def _weighted_median(values):
    filtered = sorted(
        (
            (value, weight)
            for value, weight in (values or [])
            if value is not None and weight is not None and weight > 0 and math.isfinite(value) and math.isfinite(weight)
        ),
        key=lambda item: item[0],
    )
    if not filtered:
        return None
    total_weight = sum(weight for _, weight in filtered)
    threshold = total_weight / 2
    running = 0.0
    for value, weight in filtered:
        running += weight
        if running >= threshold:
            return value
    return filtered[-1][0]


def _annualized_volatility(returns):
    if returns is None or len(returns) < 2:
        return None
    mean_return = sum(returns) / len(returns)
    variance = sum((value - mean_return) ** 2 for value in returns) / (len(returns) - 1)
    if variance < 0 or not math.isfinite(variance):
        return None
    return math.sqrt(variance) * math.sqrt(252) * 100


def _close_to_close_volatility(closes, window):
    if closes is None or len(closes) < window:
        return None
    window_closes = closes[-window:]
    returns = []
    for previous_close, current_close in zip(window_closes, window_closes[1:]):
        previous_close = _safe_float(previous_close)
        current_close = _safe_float(current_close)
        if previous_close is None or current_close is None or previous_close <= 0 or current_close <= 0:
            continue
        returns.append(math.log(current_close / previous_close))
    return _annualized_volatility(returns)


def _parkinson_volatility(highs, lows, window):
    if highs is None or lows is None or len(highs) < window or len(lows) < window:
        return None
    window_highs = highs[-window:]
    window_lows = lows[-window:]
    log_ranges = []
    for high_value, low_value in zip(window_highs, window_lows):
        high_value = _safe_float(high_value)
        low_value = _safe_float(low_value)
        if high_value is None or low_value is None or high_value <= 0 or low_value <= 0 or high_value < low_value:
            continue
        log_ranges.append(math.log(high_value / low_value) ** 2)
    if not log_ranges:
        return None
    variance = sum(log_ranges) / (4 * len(log_ranges) * math.log(2))
    if variance < 0 or not math.isfinite(variance):
        return None
    return math.sqrt(variance) * math.sqrt(252) * 100


def _estimate_historic_volatility(closes, highs, lows):
    hv20 = _close_to_close_volatility(closes, 20)
    if hv20 is not None and math.isfinite(hv20):
        return hv20
    components = [
        (_close_to_close_volatility(closes, 30), 0.65),
        (_parkinson_volatility(highs, lows, 20), 0.35),
    ]
    return _weighted_average(components)


def _rolling_historic_volatility_proxy(closes, highs, lows, min_history=40):
    if closes is None or highs is None or lows is None:
        return []
    series = []
    length = min(len(closes), len(highs), len(lows))
    for end_index in range(min_history, length + 1):
        value = _estimate_historic_volatility(
            closes[:end_index],
            highs[:end_index],
            lows[:end_index],
        )
        if value is not None and math.isfinite(value):
            series.append(value)
    return series


def _build_iv_history_proxy(rolling_hv_series):
    if not rolling_hv_series:
        return []
    long_run_hv = _median(rolling_hv_series)
    if long_run_hv is None or long_run_hv <= 0:
        return []
    hv_vol_of_vol = _standard_deviation(rolling_hv_series)
    normalized_vol_of_vol = (hv_vol_of_vol / long_run_hv) if hv_vol_of_vol is not None and long_run_hv > 0 else 0.0
    base_premium = max(1.04, min(1.28, 1.05 + (min(long_run_hv, 100) / 100 * 0.18) + (min(normalized_vol_of_vol, 1.0) * 0.08)))
    regime_reactivity = max(0.32, min(0.52, 0.34 + (min(normalized_vol_of_vol, 1.0) * 0.10) + (min(long_run_hv, 100) / 100 * 0.06)))
    anchor = long_run_hv * base_premium
    proxy_series = []
    for hv_value in rolling_hv_series:
        proxy_value = anchor + ((hv_value - long_run_hv) * regime_reactivity)
        proxy_series.append(max(proxy_value, long_run_hv * 0.55))
    return proxy_series


def _estimate_iv_regime_metrics(current_iv, closes, highs, lows):
    historic_volatility = _estimate_historic_volatility(closes, highs, lows)
    if current_iv is None or not math.isfinite(current_iv):
        return {
            "historicVolatility": historic_volatility,
            "ivPercentile": None,
            "ivRank": None,
        }

    rolling_hv_series = _rolling_historic_volatility_proxy(closes, highs, lows)
    proxy_series = _build_iv_history_proxy(rolling_hv_series)
    if not proxy_series:
        return {
            "historicVolatility": historic_volatility,
            "ivPercentile": None,
            "ivRank": None,
        }

    proxy_min = min(proxy_series)
    proxy_max = max(proxy_series)
    proxy_range = proxy_max - proxy_min
    iv_rank = None
    if proxy_range > 0:
        iv_rank = max(0.0, min(100.0, ((current_iv - proxy_min) / proxy_range) * 100))

    observations_below = sum(1 for value in proxy_series if value <= current_iv)
    iv_percentile = max(0.0, min(100.0, (observations_below / len(proxy_series)) * 100))

    return {
        "historicVolatility": historic_volatility,
        "ivPercentile": iv_percentile,
        "ivRank": iv_rank,
    }


def _frame_atm_iv_candidates(frame, spot_price, max_distance=0.06, limit=2):
    if frame is None or frame.empty or spot_price is None or spot_price <= 0:
        return []
    candidates = []
    for _, row in frame.iterrows():
        strike = _safe_float(row.get("strike"))
        implied_volatility = _safe_float(row.get("impliedVolatility"))
        open_interest = max(_safe_int(row.get("openInterest")) or 0, 0)
        volume = max(_safe_int(row.get("volume")) or 0, 0)
        if (
            strike is None
            or implied_volatility is None
            or implied_volatility <= 0
            or implied_volatility > 8
        ):
            continue
        distance = abs(strike - spot_price) / max(spot_price, 1)
        if distance > max_distance:
            continue
        liquidity = open_interest + (volume * 0.35)
        candidates.append({
            "iv": implied_volatility * 100,
            "distance": distance,
            "liquidity": liquidity,
        })
    return sorted(
        candidates,
        key=lambda item: (item["distance"], -item["liquidity"]),
    )[:limit]


def _estimate_expiry_atm_iv(calls_frame, puts_frame, spot_price, dte):
    call_candidates = _frame_atm_iv_candidates(calls_frame, spot_price)
    put_candidates = _frame_atm_iv_candidates(puts_frame, spot_price)
    candidates = call_candidates + put_candidates
    if not candidates:
        return None

    raw_center = _median([candidate["iv"] for candidate in candidates])
    filtered_candidates = [
        candidate for candidate in candidates
        if raw_center
        and abs(candidate["iv"] - raw_center) / max(raw_center, 1) <= 0.22
    ] or candidates

    expiry_weight = 1 / (1 + (abs(dte - 30) / 12))
    weighted_candidates = [
        (
            candidate["iv"],
            expiry_weight
            * (1 / (1 + ((candidate["distance"] / 0.01) ** 2)))
            * (1 + min(1.0, math.log1p(candidate["liquidity"]) / 6.0)),
        )
        for candidate in filtered_candidates
    ]
    weighted_iv = _weighted_average(weighted_candidates)
    if weighted_iv is None:
        return None

    weighted_center = _weighted_median(weighted_candidates) or weighted_iv
    if abs(weighted_iv - weighted_center) / max(weighted_center, 1) > 0.08:
        weighted_iv = (weighted_iv * 0.4) + (weighted_center * 0.6)

    total_liquidity = sum(candidate["liquidity"] for candidate in filtered_candidates)
    observation_weight = expiry_weight * max(0.75, 0.8 + min(0.9, math.log1p(total_liquidity) / 8.0))
    return weighted_iv, observation_weight


def _estimate_implied_volatility(expiry_samples):
    if not expiry_samples:
        return None
    weighted_center = _weighted_median(expiry_samples)
    if weighted_center is None:
        return _weighted_average(expiry_samples)
    filtered = [
        (value, weight)
        for value, weight in expiry_samples
        if abs(value - weighted_center) / max(weighted_center, 1) <= 0.16
    ] or expiry_samples
    return _weighted_average(filtered)


def _black_scholes_gamma(spot_price, strike, implied_volatility, time_years, risk_free_rate=0.0):
    if (
        spot_price is None
        or strike is None
        or implied_volatility is None
        or spot_price <= 0
        or strike <= 0
        or implied_volatility <= 0
        or time_years <= 0
        or not math.isfinite(implied_volatility)
    ):
        return 0.0
    try:
        numerator = math.log(spot_price / strike) + (risk_free_rate + 0.5 * implied_volatility * implied_volatility) * time_years
        denominator = implied_volatility * math.sqrt(time_years)
        if denominator <= 0:
            return 0.0
        d1 = numerator / denominator
        return _norm_pdf(d1) / (spot_price * implied_volatility * math.sqrt(time_years))
    except Exception:
        return 0.0


def _estimate_option_gamma_exposure(spot_price, strike, implied_volatility, time_years, open_interest):
    gamma = _black_scholes_gamma(spot_price, strike, implied_volatility, time_years)
    if gamma <= 0 or open_interest <= 0:
        return 0.0
    # Approximate dealer gamma exposure for a 1% move.
    return gamma * open_interest * 100 * (spot_price ** 2) * 0.01


def _aggregate_option_metrics(frame, bucket, contracts, spot_price, time_years, side):
    if frame is None or frame.empty:
        return
    expiry_seen = set()
    for _, row in frame.iterrows():
        strike = _safe_float(row.get("strike"))
        open_interest = _safe_int(row.get("openInterest")) or 0
        volume = _safe_int(row.get("volume")) or 0
        implied_volatility = _safe_float(row.get("impliedVolatility"))
        if strike is None or open_interest <= 0:
            continue
        normalized_strike = round(strike, 2)
        gamma_exposure = _estimate_option_gamma_exposure(
            spot_price,
            normalized_strike,
            implied_volatility,
            time_years,
            open_interest,
        )
        item = bucket.setdefault(normalized_strike, {"openInterest": 0, "volume": 0, "gammaExposure": 0.0, "expiryCount": 0})
        item["openInterest"] += max(0, open_interest)
        item["volume"] += max(0, volume)
        item["gammaExposure"] += max(0.0, gamma_exposure)
        if normalized_strike not in expiry_seen:
            item["expiryCount"] += 1
            expiry_seen.add(normalized_strike)
        contracts.append({
            "strike": normalized_strike,
            "openInterest": max(0, open_interest),
            "volume": max(0, volume),
            "impliedVolatility": implied_volatility,
            "timeYears": time_years,
            "daysToExpiry": max(1, int(round(time_years * 365))),
            "side": side,
            "gammaExposure": gamma_exposure,
        })


def _is_round_wall_strike(strike, spot_price):
    if strike is None:
        return False
    scaled = abs(strike)
    if scaled >= 100:
        return abs(strike % 50) < 1e-6 or abs(strike % 100) < 1e-6
    if scaled >= 30:
        return abs(strike % 10) < 1e-6 or abs(strike % 5) < 1e-6
    return abs((strike * 2) - round(strike * 2)) < 1e-6


def _wall_round_strength(strike):
    if strike is None:
        return 0
    scaled = abs(strike)

    def hits(modulus):
        remainder = strike % modulus
        return abs(remainder) < 1e-6 or abs(remainder - modulus) < 1e-6

    if scaled >= 100:
        if hits(100):
            return 4
        if hits(50):
            return 3
        if hits(25):
            return 2
        if hits(10):
            return 1
        return 0
    if scaled >= 30:
        if hits(10):
            return 3
        if hits(5):
            return 2
        if hits(2.5):
            return 1
        return 0
    if abs(strike - round(strike)) < 1e-6:
        return 3
    if abs((strike * 2) - round(strike * 2)) < 1e-6:
        return 1
    return 0


def _call_wall_score(strike, payload, spot_price, metric_key, max_open_interest, max_expiry_count):
    gamma_value = max(payload.get(metric_key) or 0, 0)
    if gamma_value <= 0:
        return 0.0
    open_interest = max(payload.get("openInterest", 0), 0)
    expiry_count = max(payload.get("expiryCount", 0), 0)
    volume = max(payload.get("volume", 0), 0)
    open_interest_ratio = math.sqrt(open_interest / max(max_open_interest, 1))
    expiry_ratio = expiry_count / max(max_expiry_count, 1)
    volume_factor = math.log1p(volume) / 12.0
    distance_ratio = abs(strike - spot_price) / max(spot_price, 1)
    distance_multiplier = max(0.83, 1.0 - max(distance_ratio - 0.18, 0.0) * 0.3)
    if spot_price > 0 and strike >= spot_price * 1.08 and strike <= spot_price * 1.35:
        distance_multiplier *= 1.02
    if spot_price > 0 and strike >= spot_price and strike <= spot_price * 1.03 and open_interest_ratio < 0.75:
        distance_multiplier *= 0.94
    round_bonus = 0.08 if _is_round_wall_strike(strike, spot_price) else 0.0
    structure_multiplier = 1 + (0.42 * open_interest_ratio) + (0.12 * expiry_ratio) + (0.02 * volume_factor) + round_bonus
    return gamma_value * structure_multiplier * distance_multiplier


def _put_wall_score(strike, payload, spot_price, metric_key, max_open_interest, max_expiry_count):
    gamma_value = max(payload.get(metric_key) or 0, 0)
    if gamma_value <= 0:
        return 0.0
    open_interest = max(payload.get("openInterest", 0), 0)
    expiry_count = max(payload.get("expiryCount", 0), 0)
    volume = max(payload.get("volume", 0), 0)
    open_interest_ratio = math.sqrt(open_interest / max(max_open_interest, 1))
    expiry_ratio = expiry_count / max(max_expiry_count, 1)
    volume_factor = math.log1p(volume) / 12.0
    relative_strike = strike / max(spot_price, 1)
    above_penalty = max(relative_strike - 1.05, 0.0)
    below_penalty = max((1 - relative_strike) - 0.25, 0.0)
    distance_multiplier = max(0.82, 1.0 - (above_penalty * 0.65) - (below_penalty * 0.15))
    round_bonus = 0.08 if _is_round_wall_strike(strike, spot_price) else 0.0
    structure_multiplier = 1 + (0.40 * open_interest_ratio) + (0.12 * expiry_ratio) + (0.02 * volume_factor) + round_bonus
    return gamma_value * structure_multiplier * distance_multiplier


def _pick_wall(bucket, spot_price, side="call", metric_key="gammaExposure"):
    if not bucket:
        return None
    if side == "put":
        strike_floor = max(0.01, spot_price * 0.8)
        strike_ceiling = spot_price * 1.15
    else:
        strike_floor = max(0.01, spot_price * 0.85)
        strike_ceiling = spot_price * 1.8
    eligible = {
        strike: payload
        for strike, payload in bucket.items()
        if strike_floor <= strike <= strike_ceiling
    } or bucket
    max_open_interest = max((max(payload.get("openInterest", 0), 0) for payload in eligible.values()), default=1)
    max_expiry_count = max((max(payload.get("expiryCount", 0), 0) for payload in eligible.values()), default=1)
    if side == "put":
        ranked = sorted(
            (
                (
                    _put_wall_score(strike, payload, spot_price, metric_key, max_open_interest, max_expiry_count),
                    strike,
                    payload,
                )
                for strike, payload in eligible.items()
            ),
            key=lambda item: (
                -item[0],
                -(item[2].get(metric_key) or 0),
                -item[2].get("openInterest", 0),
                -item[2].get("expiryCount", 0),
                abs(item[1] - spot_price),
                item[1],
            ),
        )
        top_score = ranked[0][0]
        shortlist = [
            item for item in ranked
            if top_score > 0 and ((top_score - item[0]) / top_score) <= 0.015
        ] or ranked[:1]
        shortlist = sorted(
            shortlist,
            key=lambda item: (
                -_wall_round_strength(item[1]),
                -item[2].get("expiryCount", 0),
                abs(item[1] - spot_price),
                -item[2].get("openInterest", 0),
                -item[0],
                item[1],
            ),
        )
        _, strike, payload = shortlist[0]
    else:
        _, strike, payload = sorted(
            (
                (
                    _call_wall_score(strike, payload, spot_price, metric_key, max_open_interest, max_expiry_count),
                    strike,
                    payload,
                )
                for strike, payload in eligible.items()
            ),
            key=lambda item: (
                -item[0],
                -(item[2].get(metric_key) or 0),
                -item[2].get("openInterest", 0),
                -item[2].get("expiryCount", 0),
                abs(item[1] - spot_price),
                item[1],
            ),
        )[0]
    return {
        "strike": strike,
        "openInterest": payload["openInterest"],
        "volume": payload["volume"],
        "gammaExposure": round(payload.get("gammaExposure", 0.0), 2),
    }


def _total_signed_gamma_exposure(contracts, scenario_price):
    total = 0.0
    for contract in contracts:
        strike = contract.get("strike")
        implied_volatility = contract.get("impliedVolatility")
        time_years = contract.get("timeYears")
        open_interest = contract.get("openInterest", 0)
        side = contract.get("side")
        sign = 1 if side == "call" else -1
        total += sign * _estimate_option_gamma_exposure(
            scenario_price,
            strike,
            implied_volatility,
            time_years,
            open_interest,
        )
    return total


def _estimate_gamma_flip_profile(contracts, spot_price, nearby_strike_count=41):
    if not contracts:
        return None
    strikes = sorted({contract["strike"] for contract in contracts if contract.get("strike") is not None})
    if not strikes:
        return None

    if nearby_strike_count and len(strikes) > nearby_strike_count:
        nearby = set(sorted(strikes, key=lambda strike: (abs(strike - spot_price), strike))[:nearby_strike_count])
        contracts = [contract for contract in contracts if contract.get("strike") in nearby]
        strikes = sorted(nearby)
        if not contracts:
            return None

    min_strike = min(strikes)
    max_strike = max(strikes)
    low = max(0.01, min(spot_price * 0.65, min_strike * 0.95))
    high = max(spot_price * 1.45, max_strike * 1.02)
    step = max(0.25, round(spot_price * 0.0035, 2))

    profile = []
    current = low
    while current <= high + 1e-9:
        profile.append((round(current, 4), _total_signed_gamma_exposure(contracts, current)))
        current += step

    spot_net_gamma = _total_signed_gamma_exposure(contracts, spot_price)
    crossing_candidates = []
    for index in range(len(profile) - 1):
        strike, net_value = profile[index]
        next_strike, next_net = profile[index + 1]
        if net_value == 0:
            crossing_candidates.append((strike, 0.0))
            continue
        if (net_value < 0 < next_net) or (net_value > 0 > next_net):
            span = abs(net_value) + abs(next_net)
            ratio = abs(net_value) / span if span else 0.5
            flip_strike = round(strike + (next_strike - strike) * ratio, 2)
            crossing_candidates.append((flip_strike, min(abs(net_value), abs(next_net))))

    crossing = None
    if crossing_candidates:
        preferred = crossing_candidates
        if spot_net_gamma < 0:
            above_spot = [item for item in crossing_candidates if item[0] >= spot_price]
            if above_spot:
                preferred = above_spot
        elif spot_net_gamma > 0:
            below_spot = [item for item in crossing_candidates if item[0] <= spot_price]
            if below_spot:
                preferred = below_spot
        crossing = sorted(preferred, key=lambda item: (abs(item[0] - spot_price), item[1]))[0]

    min_balance_strike, min_balance_value = sorted(
        profile,
        key=lambda item: (abs(item[1]), abs(item[0] - spot_price)),
    )[0]

    return {
        "hasCrossing": crossing is not None,
        "crossingStrike": crossing[0] if crossing else None,
        "crossingBalance": round(abs(crossing[1]), 2) if crossing else None,
        "spotNetGamma": round(spot_net_gamma, 2),
        "minBalanceStrike": round(min_balance_strike, 2),
        "minBalance": round(abs(min_balance_value), 2),
        "method": "estimated-gex-zero-cross-nearby-strikes" if crossing else "estimated-gex-min-balance-nearby-strikes",
        "nearbyStrikeCount": nearby_strike_count,
    }


def _median_strike(values):
    if not values:
        return None
    ordered = sorted(values)
    middle = len(ordered) // 2
    if len(ordered) % 2 == 1:
        return ordered[middle]
    return round((ordered[middle - 1] + ordered[middle]) / 2, 2)


def _contract_days_to_expiry(contract):
    days_to_expiry = contract.get("daysToExpiry")
    if days_to_expiry is not None:
        return max(0, int(days_to_expiry))
    time_years = contract.get("timeYears")
    if time_years is None:
        return 0
    return max(0, int(round(time_years * 365)))


def _term_bucket_gamma_flip_profile(contracts, spot_price, min_days, max_days):
    filtered_contracts = [
        contract
        for contract in contracts
        if min_days <= _contract_days_to_expiry(contract) <= max_days
    ]
    if not filtered_contracts:
        return None
    return _estimate_gamma_flip_profile(filtered_contracts, spot_price, nearby_strike_count=None)


def _weighted_bucket_crossing(profiles):
    weighted_points = []
    for profile in profiles:
        strike = profile.get("crossingStrike") if profile else None
        if strike is None:
            continue
        balance = max(profile.get("crossingBalance") or 0, 1.0)
        spot_net_gamma = abs(profile.get("spotNetGamma") or 0)
        weight = spot_net_gamma / max(math.log10(balance + 10), 1.0)
        if weight <= 0:
            continue
        weighted_points.append((strike, weight))
    if not weighted_points:
        return None
    total_weight = sum(weight for _, weight in weighted_points)
    if total_weight <= 0:
        return None
    return sum(strike * weight for strike, weight in weighted_points) / total_weight


def _profile_gamma_sign(profile):
    if not profile:
        return None
    spot_net_gamma = profile.get("spotNetGamma")
    if spot_net_gamma is None or spot_net_gamma == 0:
        return 0
    return 1 if spot_net_gamma > 0 else -1


def _refine_gamma_flip_with_term_structure(base_flip, contracts, spot_price):
    if not base_flip or base_flip.get("strike") is None or not contracts:
        return base_flip

    bucket_profiles = {
        "0-7": _term_bucket_gamma_flip_profile(contracts, spot_price, 0, 7),
        "8-21": _term_bucket_gamma_flip_profile(contracts, spot_price, 8, 21),
        "22-45": _term_bucket_gamma_flip_profile(contracts, spot_price, 22, 45),
        "46-90": _term_bucket_gamma_flip_profile(contracts, spot_price, 46, 90),
        "91-180": _term_bucket_gamma_flip_profile(contracts, spot_price, 91, 180),
    }
    short_term_average = _weighted_bucket_crossing([
        bucket_profiles["0-7"],
        bucket_profiles["8-21"],
    ])
    medium_term_average = _weighted_bucket_crossing([
        bucket_profiles["8-21"],
        bucket_profiles["22-45"],
        bucket_profiles["46-90"],
    ])

    adjusted_strike = float(base_flip["strike"])
    method = base_flip.get("method") or "estimated-gex"

    if (
        spot_price < 25
        and short_term_average is not None
        and adjusted_strike < spot_price
        and short_term_average > adjusted_strike
    ):
        adjusted_strike = short_term_average
        method = "estimated-gex-low-price-short-term"

    sign_0_7 = _profile_gamma_sign(bucket_profiles["0-7"])
    sign_8_21 = _profile_gamma_sign(bucket_profiles["8-21"])
    sign_22_45 = _profile_gamma_sign(bucket_profiles["22-45"])
    if (
        base_flip.get("method") == "estimated-gex-adaptive-expanded-window"
        and short_term_average is not None
        and sign_0_7 is not None
        and sign_8_21 is not None
        and sign_22_45 is not None
        and sign_0_7 != sign_8_21
        and sign_0_7 == sign_22_45
    ):
        adjusted_strike = short_term_average
        method = "estimated-gex-adaptive-short-term"

    if (
        base_flip.get("method") == "estimated-gex-adaptive-expanded-window"
        and medium_term_average is not None
    ):
        medium_term_strikes = [
            profile["crossingStrike"]
            for profile in (
                bucket_profiles["8-21"],
                bucket_profiles["22-45"],
                bucket_profiles["46-90"],
            )
            if profile and profile.get("crossingStrike") is not None
        ]
        if len(medium_term_strikes) >= 2:
            medium_term_spread = max(medium_term_strikes) - min(medium_term_strikes)
            if adjusted_strike < medium_term_average and medium_term_spread <= spot_price * 0.22:
                if medium_term_spread <= spot_price * 0.10:
                    adjusted_strike = medium_term_average
                else:
                    adjusted_strike = (adjusted_strike * 0.55) + (medium_term_average * 0.45)
                method = "estimated-gex-adaptive-term-structure"

    if (
        base_flip.get("method") == "estimated-gex-zero-cross-nearby-strikes"
        and short_term_average is not None
        and abs(short_term_average - adjusted_strike) / max(spot_price, 1) <= 0.015
        and abs(short_term_average - spot_price) <= abs(adjusted_strike - spot_price) + (spot_price * 0.002)
    ):
        adjusted_strike = (adjusted_strike + short_term_average) / 2
        method = "estimated-gex-nearby-short-term-smooth"

    if abs(adjusted_strike - base_flip["strike"]) < 0.005:
        return base_flip

    return {
        "strike": round(adjusted_strike, 2),
        "balance": base_flip.get("balance"),
        "method": method,
    }


def _estimate_gamma_flip(contracts, spot_price, nearby_strike_count=41, put_wall=None, call_wall=None):
    profile = _estimate_gamma_flip_profile(contracts, spot_price, nearby_strike_count=nearby_strike_count)
    if not profile:
        return None

    if profile.get("hasCrossing"):
        strike = profile.get("crossingStrike")
        spot_net_gamma = profile.get("spotNetGamma", 0) or 0
        if (
            strike is not None
            and put_wall
            and put_wall.get("strike") is not None
            and put_wall["strike"] < spot_price
            and spot_net_gamma > 0
            and strike < put_wall["strike"] * 0.93
        ):
            strike = round((put_wall["strike"] * 0.7) + (strike * 0.3), 2)
            return _refine_gamma_flip_with_term_structure({
                "strike": strike,
                "balance": profile.get("crossingBalance"),
                "method": "estimated-gex-zero-cross-put-support-blend",
            }, contracts, spot_price)
        return _refine_gamma_flip_with_term_structure({
            "strike": strike,
            "balance": profile.get("crossingBalance"),
            "method": profile.get("method"),
        }, contracts, spot_price)

    expanded_candidates = []
    for count in [61, 81, 101, None]:
        if count == nearby_strike_count:
            continue
        next_profile = _estimate_gamma_flip_profile(contracts, spot_price, nearby_strike_count=count)
        if next_profile and next_profile.get("hasCrossing") and next_profile.get("crossingStrike") is not None:
            expanded_candidates.append(next_profile)

    if expanded_candidates:
        spot_net_gamma = profile.get("spotNetGamma", 0) or 0
        if spot_net_gamma >= 0:
            below_spot = [item for item in expanded_candidates if item["crossingStrike"] <= spot_price]
            candidate = max(below_spot, key=lambda item: item["crossingStrike"]) if below_spot else expanded_candidates[0]
            candidate_strike = candidate["crossingStrike"]
            if (
                put_wall
                and put_wall.get("strike") is not None
                and put_wall["strike"] < spot_price
                and candidate_strike < put_wall["strike"] * 0.93
            ):
                candidate_strike = round((put_wall["strike"] + candidate_strike) / 2, 2)
            return _refine_gamma_flip_with_term_structure({
                "strike": candidate_strike,
                "balance": candidate.get("crossingBalance"),
                "method": "estimated-gex-adaptive-putwall-blend",
            }, contracts, spot_price)

        viable_candidates = [
            item for item in expanded_candidates
            if item["crossingStrike"] >= spot_price
        ] or expanded_candidates
        if (
            put_wall
            and call_wall
            and put_wall.get("strike") is not None
            and call_wall.get("strike") is not None
            and abs(call_wall["strike"] - put_wall["strike"]) / max(spot_price, 1) <= 0.04
            and spot_price <= min(call_wall["strike"], put_wall["strike"]) * 0.94
        ):
            anchor = (call_wall["strike"] + put_wall["strike"]) / 2
            candidate_strike = min(
                viable_candidates,
                key=lambda item: (
                    abs(item["crossingStrike"] - anchor),
                    item.get("crossingBalance") or 0,
                    item.get("nearbyStrikeCount") or 10_000,
                ),
            )["crossingStrike"]
        else:
            candidate_spread = max(item["crossingStrike"] for item in viable_candidates) - min(item["crossingStrike"] for item in viable_candidates)
            if candidate_spread >= 12:
                candidate_strike = _median_strike([item["crossingStrike"] for item in viable_candidates]) or viable_candidates[0]["crossingStrike"]
            else:
                candidate_strike = max(
                    viable_candidates,
                    key=lambda item: (
                        item["crossingStrike"],
                        -(item.get("crossingBalance") or 0),
                    ),
                )["crossingStrike"]
        return _refine_gamma_flip_with_term_structure({
            "strike": candidate_strike,
            "balance": min(item.get("crossingBalance") or 0 for item in viable_candidates),
            "method": "estimated-gex-adaptive-expanded-window",
        }, contracts, spot_price)

    return _refine_gamma_flip_with_term_structure({
        "strike": profile.get("minBalanceStrike"),
        "balance": profile.get("minBalance"),
        "method": profile.get("method"),
    }, contracts, spot_price)


def fetch_us_options_market(instrument, ticker, spot_price, updated_at, history_frame=None):
    try:
        expiries = list(instrument.options or [])
    except Exception:
        return build_unavailable_options_payload("Unable to load options expiries", market="us")

    if not expiries:
        return build_unavailable_options_payload("No listed options expiries", market="us")

    today = datetime.now(timezone.utc).date()
    ranked_expiries = []
    for expiry in expiries:
        try:
            expiry_date = datetime.strptime(expiry, "%Y-%m-%d").date()
            dte = (expiry_date - today).days
            ranked_expiries.append((expiry, dte))
        except Exception:
            continue

    if not ranked_expiries:
        return build_unavailable_options_payload("No valid options expiries", market="us")

    wall_expiries = [item for item in ranked_expiries if 0 <= item[1] <= 270] or ranked_expiries[:12]
    gamma_expiry_keys = {expiry for expiry, dte in ranked_expiries if 0 <= dte <= 180}

    call_bucket = {}
    put_bucket = {}
    contracts = []
    used_expiries = []
    iv_expiry_samples = []
    for expiry, dte in wall_expiries:
        try:
            chain = instrument.option_chain(expiry)
        except Exception:
            continue
        time_years = max(dte / 365.0, 1 / 365.0)
        calls_frame = getattr(chain, "calls", None)
        puts_frame = getattr(chain, "puts", None)
        _aggregate_option_metrics(calls_frame, call_bucket, [], spot_price, time_years, "call")
        _aggregate_option_metrics(puts_frame, put_bucket, [], spot_price, time_years, "put")
        if 3 <= dte <= 75:
            expiry_iv = _estimate_expiry_atm_iv(calls_frame, puts_frame, spot_price, dte)
            if expiry_iv is not None:
                iv_expiry_samples.append(expiry_iv)
        if expiry in gamma_expiry_keys:
            _aggregate_option_metrics(calls_frame, {}, contracts, spot_price, time_years, "call")
            _aggregate_option_metrics(puts_frame, {}, contracts, spot_price, time_years, "put")
        used_expiries.append({"expiry": expiry, "daysToExpiry": dte})

    if not call_bucket and not put_bucket:
        return build_unavailable_options_payload("No options chain data returned", market="us")

    call_wall = _pick_wall(call_bucket, spot_price, side="call", metric_key="gammaExposure")
    put_wall = _pick_wall(put_bucket, spot_price, side="put", metric_key="gammaExposure")
    gamma_flip_strike_count = 51 if spot_price >= 200 else 41
    gamma_flip = _estimate_gamma_flip(
        contracts,
        spot_price,
        nearby_strike_count=gamma_flip_strike_count,
        put_wall=put_wall,
        call_wall=call_wall,
    )
    total_call_oi = sum(item["openInterest"] for item in call_bucket.values())
    total_put_oi = sum(item["openInterest"] for item in put_bucket.values())
    total_call_gamma = sum(item.get("gammaExposure", 0.0) for item in call_bucket.values())
    total_put_gamma = sum(item.get("gammaExposure", 0.0) for item in put_bucket.values())
    net_gamma = total_call_gamma - total_put_gamma
    implied_volatility = _estimate_implied_volatility(iv_expiry_samples)
    history_closes = history_frame["Close"].tolist() if history_frame is not None and "Close" in history_frame else []
    history_highs = history_frame["High"].tolist() if history_frame is not None and "High" in history_frame else []
    history_lows = history_frame["Low"].tolist() if history_frame is not None and "Low" in history_frame else []
    iv_regime = _estimate_iv_regime_metrics(implied_volatility, history_closes, history_highs, history_lows)

    return {
        "available": True,
        "market": "us",
        "reason": None,
        "callWall": call_wall,
        "putWall": put_wall,
        "gammaFlip": gamma_flip,
        "expiries": used_expiries,
        "nearestExpiry": used_expiries[0]["expiry"] if used_expiries else None,
        "updatedAt": updated_at,
        "totalCallOpenInterest": total_call_oi,
        "totalPutOpenInterest": total_put_oi,
        "totalCallGammaExposure": round(total_call_gamma, 2),
        "totalPutGammaExposure": round(total_put_gamma, 2),
        "netGammaExposure": round(net_gamma, 2),
        "impliedVolatility": round(implied_volatility, 2) if implied_volatility is not None else None,
        "historicVolatility": round(iv_regime["historicVolatility"], 2) if iv_regime.get("historicVolatility") is not None else None,
        "ivPercentile": round(iv_regime["ivPercentile"], 2) if iv_regime.get("ivPercentile") is not None else None,
        "ivRank": round(iv_regime["ivRank"], 2) if iv_regime.get("ivRank") is not None else None,
        "coverage": "estimated-gex-nearby-expiries-atm-iv-rv-proxy",
        "gammaFlipStrikeCount": gamma_flip_strike_count,
    }


def fetch_a_share_profile(ticker):
    if ak is None:
        return {}
    try:
        profile = ak.stock_profile_cninfo(symbol=ticker)
        if profile is None or profile.empty:
            return {}
        row = profile.iloc[0]
        return {
            "shortName": row.get("A股简称"),
            "longName": row.get("公司名称"),
        }
    except Exception:
        return {}


def fetch_a_share_valuation(ticker):
    result = {
        "trailingPE": None,
        "forwardPE": None,
        "marketCap": None,
    }
    if ak is None:
        return result

    try:
        market_cap_df = ak.stock_zh_valuation_baidu(symbol=ticker, indicator="总市值", period="近一年")
        if market_cap_df is not None and not market_cap_df.empty:
            latest_market_cap = _safe_float(market_cap_df.iloc[-1]["value"])
            if latest_market_cap is not None:
                # Baidu valuation uses 亿元 for A-share market cap.
                result["marketCap"] = int(latest_market_cap * 1e8)
    except Exception:
        pass

    try:
        pe_df = ak.stock_zh_valuation_baidu(symbol=ticker, indicator="市盈率(TTM)", period="近一年")
        if pe_df is not None and not pe_df.empty:
            result["trailingPE"] = _safe_float(pe_df.iloc[-1]["value"])
    except Exception:
        pass

    try:
        forecast_df = ak.stock_profit_forecast_ths(symbol=ticker)
        if forecast_df is not None and not forecast_df.empty:
            current_year = datetime.now().year
            forecast_df = forecast_df.copy()
            forecast_df["年度"] = pd.to_numeric(forecast_df["年度"], errors="coerce")
            forecast_df["均值"] = pd.to_numeric(forecast_df["均值"], errors="coerce")
            forecast_df = forecast_df.dropna(subset=["年度", "均值"])
            future_rows = forecast_df[forecast_df["年度"] >= current_year]
            target_row = future_rows.iloc[0] if not future_rows.empty else forecast_df.iloc[0]
            mean_eps = _safe_float(target_row["均值"])
            if mean_eps and mean_eps > 0:
                # Keep EPS forecast here and convert to forward PE after we know price.
                result["forwardEpsMean"] = mean_eps
    except Exception:
        pass

    return result


def fetch_a_share_with_yfinance_fallback(ticker, profile_info=None, valuation_info=None, primary_error=None):
    profile_info = profile_info or {}
    valuation_info = valuation_info or {}
    symbol = resolve_market_symbol(ticker)
    instrument = yf.Ticker(symbol)
    history = load_yfinance_history_frame(instrument, symbol, period="1y", interval="1d")
    if history is None or history.empty:
        raise ValueError(f"A-share fetch failed for {ticker}: {primary_error or 'No fallback history'}")
    history = history.dropna(subset=["Open", "High", "Low", "Close", "Volume"]).tail(252)
    if history.empty:
        raise ValueError(f"A-share fetch failed for {ticker}: {primary_error or 'No clean fallback history'}")

    info = {}
    fast_info = {}
    try:
        fast_info = dict(instrument.fast_info or {})
    except Exception:
        fast_info = {}
    try:
        info = instrument.info or {}
    except Exception:
        info = {}

    latest_row = history.iloc[-1]
    previous_row = history.iloc[-2] if len(history) > 1 else latest_row
    price = _safe_float(latest_row["Close"])
    previous_close = _safe_float(previous_row["Close"])
    change = price - previous_close if price is not None and previous_close is not None else None
    change_percent = (change / previous_close) * 100 if change is not None and previous_close else None
    forward_pe = valuation_info.get("forwardPE")
    forward_eps_mean = valuation_info.get("forwardEpsMean")
    if forward_pe is None and price is not None and forward_eps_mean:
        forward_pe = price / forward_eps_mean

    catalog_match = next((item for item in A_SHARE_SYMBOL_CATALOG if item.get("ticker") == ticker), {})
    exchange_name = "SZ" if ticker.startswith(("0", "3")) else "SH"
    return {
        "price": price,
        "previousClose": previous_close,
        "change": change,
        "changePercent": change_percent,
        "updatedAt": iso_from_local_close(history.index[-1], 15, 0, 8),
        "marketStatus": "open",
        "dataStaleness": "fresh",
        "last_successful_update": iso_from_local_close(history.index[-1], 15, 0, 8),
        "symbol": symbol,
        "shortName": profile_info.get("shortName") or catalog_match.get("name"),
        "longName": profile_info.get("longName") or catalog_match.get("name"),
        "exchangeName": exchange_name,
        "trailingPE": valuation_info.get("trailingPE") or _safe_float(info.get("trailingPE")),
        "forwardPE": forward_pe or _safe_float(info.get("forwardPE")),
        "marketCap": valuation_info.get("marketCap") or _safe_int(info.get("marketCap")) or _safe_int(fast_info.get("market_cap")),
        "metadata": {
            "sector": info.get("sector"),
            "industry": info.get("industry"),
            "beta": _safe_float(info.get("beta")),
            "dividendYield": _safe_float(info.get("dividendYield")),
            "payoutRatio": _safe_float(info.get("payoutRatio")),
            "enterpriseToEbitda": _safe_float(info.get("enterpriseToEbitda")),
            "priceToSalesTrailing12Months": _safe_float(info.get("priceToSalesTrailing12Months")),
            "enterpriseToRevenue": _safe_float(info.get("enterpriseToRevenue")),
            "operatingMargins": _safe_float(info.get("operatingMargins")),
            "grossMargins": _safe_float(info.get("grossMargins")),
            "returnOnEquity": _safe_float(info.get("returnOnEquity")),
            "debtToEquity": _safe_float(info.get("debtToEquity")),
            "currentRatio": _safe_float(info.get("currentRatio")),
            "quickRatio": _safe_float(info.get("quickRatio")),
            "freeCashflow": _safe_float(info.get("freeCashflow")),
            "totalCash": _safe_float(info.get("totalCash")),
            "totalDebt": _safe_float(info.get("totalDebt")),
            "capex": _safe_float(info.get("capitalExpenditure")),
            "businessSummary": info.get("longBusinessSummary") or info.get("shortBusinessSummary"),
            "country": info.get("country"),
            "city": info.get("city"),
            "state": info.get("state"),
            "exchange": info.get("exchange") or exchange_name,
            "quoteType": info.get("quoteType"),
            "ipoDate": iso_from_epoch(info.get("firstTradeDateEpochUtc")),
            "floatShares": _safe_int(info.get("floatShares")) or _safe_int(info.get("sharesFloat")) or _safe_int(info.get("publicFloat")) or _safe_int(fast_info.get("float_shares")),
            "sharesOutstanding": _safe_int(info.get("sharesOutstanding")) or _safe_int(info.get("impliedSharesOutstanding")) or _safe_int(fast_info.get("shares")),
        },
        "optionsMarket": build_unavailable_options_payload("A-share options wall data is not supported yet", market="cn"),
        "history": {
            "timestamps": [entry.to_pydatetime().strftime("%Y-%m-%d") for entry in history.index],
            "closes": [_safe_float(value) for value in history["Close"].tolist()],
            "highs": [_safe_float(value) for value in history["High"].tolist()],
            "lows": [_safe_float(value) for value in history["Low"].tolist()],
            "volumes": [_safe_int(value) for value in history["Volume"].tolist()],
        },
    }


def _normalize_download_history_frame(frame):
    if frame is None or frame.empty:
        return pd.DataFrame()
    if isinstance(frame.columns, pd.MultiIndex):
        normalized = pd.DataFrame(index=frame.index)
        for field in ["Open", "High", "Low", "Close", "Volume"]:
            match = next((column for column in frame.columns if field in column), None)
            if match is not None:
                normalized[field] = frame[match]
        frame = normalized
    return frame


def load_yfinance_history_frame(instrument, symbol, period="1y", interval="1d"):
    try:
        history = instrument.history(period=period, interval=interval, auto_adjust=False)
        if history is not None and not history.empty:
            return history
    except Exception:
        pass

    try:
        downloaded = yf.download(
            symbol,
            period=period,
            interval=interval,
            auto_adjust=False,
            progress=False,
            threads=False,
        )
        downloaded = _normalize_download_history_frame(downloaded)
        if downloaded is not None and not downloaded.empty:
            return downloaded
    except Exception:
        pass

    return pd.DataFrame()


def fetch_us_quote_with_yfinance(ticker, include_options=True):
    symbol = resolve_market_symbol(ticker)
    instrument = yf.Ticker(symbol)

    history = load_yfinance_history_frame(instrument, symbol, period="1y", interval="1d")
    if history is None or history.empty:
        raise ValueError(f"No yfinance history for {ticker}")

    history = history.dropna(subset=["Open", "High", "Low", "Close", "Volume"]).tail(252)
    if history.empty:
        raise ValueError(f"No clean yfinance history for {ticker}")

    info = {}
    fast_info = {}
    try:
        fast_info = dict(instrument.fast_info or {})
    except Exception:
        fast_info = {}
    try:
        info = instrument.info or {} if include_options else {}
    except Exception:
        info = {}

    latest_row = history.iloc[-1]
    previous_row = history.iloc[-2] if len(history) > 1 else latest_row
    regular_close = _safe_float(latest_row["Close"])
    regular_market_time = dt_from_epoch(info.get("regularMarketTime"))

    # Use the official daily close as the dashboard price so the homepage,
    # detail page, and all daily indicators stay aligned on the same data point.
    price = regular_close
    updated_at_dt = regular_market_time

    previous_close = (
        _safe_float(info.get("regularMarketPreviousClose"))
        or _safe_float(info.get("previousClose"))
        or _safe_float(fast_info.get("previous_close"))
        or _safe_float(previous_row["Close"])
    )
    change = price - previous_close if price is not None and previous_close is not None else None
    change_percent = (change / previous_close) * 100 if change is not None and previous_close else None

    updated_at = (
        updated_at_dt.strftime("%Y-%m-%dT%H:%M:%SZ") if updated_at_dt
        else iso_from_local_close(history.index[-1], 16, 0, -4)
    )
    options_market = (
        fetch_us_options_market(instrument, ticker, price, updated_at, history_frame=history)
        if include_options
        else build_unavailable_options_payload("Quote loaded without options snapshot", market="us")
    )

    return {
        "price": price,
        "previousClose": previous_close,
        "change": change,
        "changePercent": change_percent,
        "updatedAt": updated_at,
        "marketStatus": "open",
        "dataStaleness": "fresh",
        "last_successful_update": updated_at,
        "symbol": symbol,
        "shortName": info.get("shortName") or info.get("displayName"),
        "longName": info.get("longName") or info.get("shortName") or info.get("displayName"),
        "exchangeName": info.get("exchange") or info.get("fullExchangeName"),
        "trailingPE": _safe_float(info.get("trailingPE")),
        "forwardPE": _safe_float(info.get("forwardPE")),
        "marketCap": _safe_int(info.get("marketCap")) or _safe_int(fast_info.get("market_cap")),
        "metadata": {
            "sector": info.get("sector"),
            "industry": info.get("industry"),
            "beta": _safe_float(info.get("beta")),
            "dividendYield": _safe_float(info.get("dividendYield")),
            "payoutRatio": _safe_float(info.get("payoutRatio")),
            "enterpriseToEbitda": _safe_float(info.get("enterpriseToEbitda")),
            "priceToSalesTrailing12Months": _safe_float(info.get("priceToSalesTrailing12Months")),
            "enterpriseToRevenue": _safe_float(info.get("enterpriseToRevenue")),
            "operatingMargins": _safe_float(info.get("operatingMargins")),
            "grossMargins": _safe_float(info.get("grossMargins")),
            "returnOnEquity": _safe_float(info.get("returnOnEquity")),
            "debtToEquity": _safe_float(info.get("debtToEquity")),
            "currentRatio": _safe_float(info.get("currentRatio")),
            "quickRatio": _safe_float(info.get("quickRatio")),
            "freeCashflow": _safe_float(info.get("freeCashflow")),
            "totalCash": _safe_float(info.get("totalCash")),
            "totalDebt": _safe_float(info.get("totalDebt")),
            "capex": _safe_float(info.get("capitalExpenditure")),
            "businessSummary": info.get("longBusinessSummary") or info.get("shortBusinessSummary"),
            "country": info.get("country"),
            "city": info.get("city"),
            "state": info.get("state"),
            "exchange": info.get("exchange") or info.get("fullExchangeName"),
            "quoteType": info.get("quoteType"),
            "ipoDate": iso_from_epoch(info.get("firstTradeDateEpochUtc")),
            "floatShares": _safe_int(info.get("floatShares")) or _safe_int(info.get("sharesFloat")) or _safe_int(info.get("publicFloat")) or _safe_int(fast_info.get("float_shares")),
            "sharesOutstanding": _safe_int(info.get("sharesOutstanding")) or _safe_int(info.get("impliedSharesOutstanding")) or _safe_int(fast_info.get("shares")),
        },
        "optionsMarket": options_market,
        "history": {
            "timestamps": [entry.to_pydatetime().strftime("%Y-%m-%d") for entry in history.index],
            "closes": [_safe_float(value) for value in history["Close"].tolist()],
            "highs": [_safe_float(value) for value in history["High"].tolist()],
            "lows": [_safe_float(value) for value in history["Low"].tolist()],
            "volumes": [_safe_int(value) for value in history["Volume"].tolist()],
        },
    }


def fetch_a_share_with_akshare(ticker):
    start_date = (datetime.now() - timedelta(days=390)).strftime("%Y%m%d")
    end_date = datetime.now().strftime("%Y%m%d")
    exchange_name = "SZ" if ticker.startswith(("0", "3")) else "SH"
    if ak is None:
        return fetch_a_share_with_yfinance_fallback(ticker, profile_info={}, valuation_info={}, primary_error="AkShare unavailable")

    primary_error = None
    try:
        history = _run_with_timeout(
            lambda: ak.stock_zh_a_hist(
                symbol=ticker,
                period="daily",
                start_date=start_date,
                end_date=end_date,
                adjust="",
            ),
            A_SHARE_PRIMARY_PRICE_TIMEOUT_SECONDS,
            fallback=None,
        )
        if history is None:
            raise TimeoutError(f"A-share primary history timed out for {ticker}")
        history = history.dropna(subset=["开盘", "收盘", "最高", "最低", "成交量"]).tail(252)
        if history is None or history.empty:
            raise ValueError(f"No clean AkShare primary history for {ticker}")

        latest_row = history.iloc[-1]
        previous_row = history.iloc[-2] if len(history) > 1 else latest_row
        profile_info = _run_with_timeout(
            lambda: fetch_a_share_profile(ticker),
            A_SHARE_METADATA_TIMEOUT_SECONDS,
            fallback={},
        ) or {}
        valuation_info = _run_with_timeout(
            lambda: fetch_a_share_valuation(ticker),
            A_SHARE_METADATA_TIMEOUT_SECONDS,
            fallback={},
        ) or {}

        price = _safe_float(latest_row["收盘"])
        previous_close = _safe_float(previous_row["收盘"])
        change = price - previous_close if price is not None and previous_close is not None else None
        change_percent = _safe_float(latest_row.get("涨跌幅"))
        if change_percent is None and change is not None and previous_close:
            change_percent = (change / previous_close) * 100
        forward_pe = None
        forward_eps_mean = valuation_info.get("forwardEpsMean")
        if price is not None and forward_eps_mean:
            forward_pe = price / forward_eps_mean

        return {
            "price": price,
            "previousClose": previous_close,
            "change": change,
            "changePercent": change_percent,
            "updatedAt": iso_from_local_close(latest_row["日期"], 15, 0, 8),
            "marketStatus": "open",
            "dataStaleness": "fresh",
            "last_successful_update": iso_from_local_close(latest_row["日期"], 15, 0, 8),
            "symbol": resolve_market_symbol(ticker),
            "shortName": profile_info.get("shortName"),
            "longName": profile_info.get("longName"),
            "exchangeName": exchange_name,
            "trailingPE": valuation_info.get("trailingPE"),
            "forwardPE": forward_pe,
            "marketCap": valuation_info.get("marketCap"),
            "metadata": {
                "sector": None,
                "industry": None,
                "beta": None,
                "dividendYield": None,
                "payoutRatio": None,
                "enterpriseToEbitda": None,
                "priceToSalesTrailing12Months": None,
                "enterpriseToRevenue": None,
                "operatingMargins": None,
                "grossMargins": None,
                "returnOnEquity": None,
                "debtToEquity": None,
                "currentRatio": None,
                "quickRatio": None,
                "freeCashflow": None,
                "totalCash": None,
                "totalDebt": None,
                "capex": None,
                "businessSummary": None,
                "ipoDate": None,
                "floatShares": None,
                "sharesOutstanding": None,
            },
            "optionsMarket": build_unavailable_options_payload("A-share options wall data is not supported yet", market="cn"),
            "history": {
                "timestamps": [str(value) for value in history["日期"].tolist()],
                "closes": [_safe_float(value) for value in history["收盘"].tolist()],
                "highs": [_safe_float(value) for value in history["最高"].tolist()],
                "lows": [_safe_float(value) for value in history["最低"].tolist()],
                "volumes": [_safe_int(value) for value in history["成交量"].tolist()],
            },
        }
    except Exception as exc:
        primary_error = exc

    fallback_symbol = f"{exchange_name.lower()}{ticker}"
    try:
        history_tx = _run_with_timeout(
            lambda: ak.stock_zh_a_hist_tx(
                symbol=fallback_symbol,
                start_date=start_date,
                end_date=end_date,
            ),
            A_SHARE_SECONDARY_PRICE_TIMEOUT_SECONDS,
            fallback=None,
        )
        if history_tx is None:
            raise TimeoutError(f"A-share Tencent history timed out for {ticker}")
        history_tx = history_tx.dropna(subset=["open", "close", "high", "low", "amount"]).tail(252)
        if history_tx is None or history_tx.empty:
            profile_info = _run_with_timeout(
                lambda: fetch_a_share_profile(ticker),
                A_SHARE_METADATA_TIMEOUT_SECONDS,
                fallback={},
            ) or {}
            valuation_info = _run_with_timeout(
                lambda: fetch_a_share_valuation(ticker),
                A_SHARE_METADATA_TIMEOUT_SECONDS,
                fallback={},
            ) or {}
            return fetch_a_share_with_yfinance_fallback(ticker, profile_info=profile_info, valuation_info=valuation_info, primary_error=primary_error)
    except Exception as tx_error:
        profile_info = _run_with_timeout(
            lambda: fetch_a_share_profile(ticker),
            A_SHARE_METADATA_TIMEOUT_SECONDS,
            fallback={},
        ) or {}
        valuation_info = _run_with_timeout(
            lambda: fetch_a_share_valuation(ticker),
            A_SHARE_METADATA_TIMEOUT_SECONDS,
            fallback={},
        ) or {}
        return fetch_a_share_with_yfinance_fallback(
            ticker,
            profile_info=profile_info,
            valuation_info=valuation_info,
            primary_error=tx_error if tx_error else primary_error,
        )

    latest_row = history_tx.iloc[-1]
    previous_row = history_tx.iloc[-2] if len(history_tx) > 1 else latest_row
    profile_info = _run_with_timeout(
        lambda: fetch_a_share_profile(ticker),
        A_SHARE_METADATA_TIMEOUT_SECONDS,
        fallback={},
    ) or {}
    valuation_info = _run_with_timeout(
        lambda: fetch_a_share_valuation(ticker),
        A_SHARE_METADATA_TIMEOUT_SECONDS,
        fallback={},
    ) or {}

    price = _safe_float(latest_row["close"])
    previous_close = _safe_float(previous_row["close"])
    change = price - previous_close if price is not None and previous_close is not None else None
    change_percent = (change / previous_close) * 100 if change is not None and previous_close else None
    forward_pe = None
    forward_eps_mean = valuation_info.get("forwardEpsMean")
    if price is not None and forward_eps_mean:
        forward_pe = price / forward_eps_mean

    return {
        "price": price,
        "previousClose": previous_close,
        "change": change,
        "changePercent": change_percent,
        "updatedAt": iso_from_local_close(latest_row["date"], 15, 0, 8),
        "marketStatus": "open",
        "dataStaleness": "fresh",
        "last_successful_update": iso_from_local_close(latest_row["date"], 15, 0, 8),
        "symbol": resolve_market_symbol(ticker),
        "shortName": profile_info.get("shortName"),
        "longName": profile_info.get("longName"),
        "exchangeName": exchange_name,
        "trailingPE": valuation_info.get("trailingPE"),
        "forwardPE": forward_pe,
        "marketCap": valuation_info.get("marketCap"),
        "metadata": {
            "sector": None,
            "industry": None,
            "beta": None,
            "dividendYield": None,
            "payoutRatio": None,
            "enterpriseToEbitda": None,
            "priceToSalesTrailing12Months": None,
            "enterpriseToRevenue": None,
            "operatingMargins": None,
            "grossMargins": None,
            "returnOnEquity": None,
            "debtToEquity": None,
            "currentRatio": None,
            "quickRatio": None,
            "freeCashflow": None,
            "totalCash": None,
            "totalDebt": None,
            "capex": None,
            "businessSummary": None,
            "ipoDate": None,
            "floatShares": None,
            "sharesOutstanding": None,
        },
        "optionsMarket": build_unavailable_options_payload("A-share options wall data is not supported yet", market="cn"),
        "history": {
            "timestamps": [str(value) for value in history_tx["date"].tolist()],
            "closes": [_safe_float(value) for value in history_tx["close"].tolist()],
            "highs": [_safe_float(value) for value in history_tx["high"].tolist()],
            "lows": [_safe_float(value) for value in history_tx["low"].tolist()],
            "volumes": [_safe_int(value) for value in history_tx["amount"].tolist()],
        },
    }


def fetch_quote(ticker, include_options=True):
    if is_a_share_ticker(ticker):
        return fetch_a_share_with_akshare(ticker)
    return fetch_us_quote_with_yfinance(ticker, include_options=include_options)


def fetch_quote_with_timeout(ticker, timeout_seconds=QUOTE_FETCH_TIMEOUT_SECONDS, include_options=True):
    result_queue = queue.Queue(maxsize=1)

    def worker():
        try:
            result_queue.put(("ok", fetch_quote(ticker, include_options=include_options)))
        except Exception as exc:
            result_queue.put(("error", exc))

    thread = threading.Thread(target=worker, daemon=True)
    thread.start()

    try:
        status, payload = result_queue.get(timeout=timeout_seconds)
    except queue.Empty:
        raise TimeoutError(f"Quote fetch timed out for {ticker} after {timeout_seconds}s")

    if status == "error":
        raise payload
    return payload


def get_cached_quote(ticker):
    with QUOTE_FETCH_LOCK:
        entry = CACHE.get(ticker)
        now = time.time()
        if entry and entry["expiresAt"] > now:
            return entry["value"]
        stale_value = entry["value"] if entry else None

        try:
            value = fetch_quote_with_timeout(ticker)
            CACHE[ticker] = {
                "value": value,
                "expiresAt": now + CACHE_SECONDS,
            }
            return value
        except Exception as exc:
            if not is_a_share_ticker(ticker):
                try:
                    value = fetch_quote_with_timeout(
                        ticker,
                        timeout_seconds=max(4, QUOTE_FETCH_TIMEOUT_SECONDS // 2),
                        include_options=False,
                    )
                    value["optionsMarket"] = value.get("optionsMarket") or build_unavailable_options_payload(
                        "Quote loaded but options snapshot is unavailable",
                        market="us",
                    )
                    value["quoteWarning"] = str(exc)
                    CACHE[ticker] = {
                        "value": value,
                        "expiresAt": now + CACHE_SECONDS,
                    }
                    return value
                except Exception:
                    pass
            if stale_value:
                fallback = stale_value.copy()
                fallback["error"] = str(exc)
                fallback["stale"] = True
                return fallback
            return build_unavailable_quote(ticker, str(exc))


def build_market_data_payload(tickers):
    quotes = {}
    for ticker in tickers:
        try:
            quotes[ticker] = get_cached_quote(ticker)
        except Exception as exc:
            quotes[ticker] = {
                "price": None,
                "previousClose": None,
                "change": None,
                "changePercent": None,
                "updatedAt": None,
                "symbol": resolve_market_symbol(ticker),
                "shortName": None,
                "longName": None,
                "exchangeName": None,
                "trailingPE": None,
                "forwardPE": None,
                "marketCap": None,
                "metadata": {
                    "sector": None,
                    "industry": None,
                    "beta": None,
                    "dividendYield": None,
                    "payoutRatio": None,
                    "enterpriseToEbitda": None,
                    "priceToSalesTrailing12Months": None,
                    "enterpriseToRevenue": None,
                    "operatingMargins": None,
                    "grossMargins": None,
                    "returnOnEquity": None,
                    "debtToEquity": None,
                    "currentRatio": None,
                    "quickRatio": None,
                    "freeCashflow": None,
                    "totalCash": None,
                    "totalDebt": None,
                    "capex": None,
                    "businessSummary": None,
                    "ipoDate": None,
                    "floatShares": None,
                    "sharesOutstanding": None,
                },
                "optionsMarket": build_unavailable_options_payload(str(exc), market="cn" if is_a_share_ticker(ticker) else "us"),
                "history": {"timestamps": [], "closes": [], "highs": [], "lows": [], "volumes": []},
                "error": str(exc),
            }

    for ticker, quote in quotes.items():
        try:
            quote["companyNews"] = get_cached_company_news(ticker, quote)
        except Exception as exc:
            quote["companyNews"] = {
                "sentiment": None,
                "score": 50,
                "summary": f"Company-news feed unavailable: {exc}",
                "key_points": [],
                "latest_news": [],
                "bullish_news": [],
                "bearish_news": [],
                "key_catalysts": [],
                "risk_events": [],
                "source_info": build_source_info(
                    "Data unavailable",
                    missing_source="Google News RSS / Yahoo Finance",
                    suggested_source="Google News RSS / Yahoo Finance / FMP / Polygon",
                    source_name="Company News Feed",
                ),
            }

    try:
        market_context = get_cached_market_context()
    except Exception as exc:
        market_context = {
            "macro": {
                "vix": None,
                "fear_greed": None,
                "treasury_yield": None,
                "fed_funds_rate": None,
                "fomc_rate_path": None,
                "score": 50,
                "summary": f"Macro feed unavailable: {exc}",
                "source_info": {
                    "vix": build_source_info("Data unavailable", "Cboe / FRED / Yahoo Finance", "Cboe / FRED VIXCLS / Yahoo Finance", "Macro Feed"),
                    "fear_greed": build_source_info("Data unavailable", "CNN Fear & Greed", "CNN Fear & Greed direct endpoint / CNN scraper / RapidAPI / custom in-house sentiment composite.", "Fear & Greed Feed"),
                    "treasury_yield": build_source_info("Data unavailable", "FRED / Yahoo Finance ^TNX", "FRED / Yahoo Finance ^TNX / Alpha Vantage", "Macro Feed"),
                    "fed_funds_rate": build_source_info("Data unavailable", "FRED DFF / FEDFUNDS", "FRED DFF / FEDFUNDS", "FRED"),
                    "fomc_rate_path": build_source_info("Data unavailable", "Federal Reserve / FRED", "Federal Reserve FOMC / FRED DFF", "Federal Reserve / FRED"),
                    "market_events": build_source_info("Live", "Economic calendar / market_events.json", "FMP Economic Calendar / Alpha Vantage / market_events.json", "market_events.json"),
                    "equity_trend": build_source_info("Data unavailable", "Yahoo Finance SPY / QQQ", "Yahoo Finance SPY / QQQ", "Yahoo Finance"),
                },
            },
            "market_context": {
                "score": 50,
                "regime": "neutral",
                "confidence": 45,
                "vix": {"value": None, "change_5d": None, "change_20d": None, "trend": "neutral", "impact": "Data unavailable"},
                "fear_greed": {"value": None, "label": None, "trend": None, "impact": "Data unavailable"},
                "ten_year_yield": {"value": None, "change_5d_bps": None, "change_20d_bps": None, "trend": "neutral", "impact": "Data unavailable"},
                "fed_event": {
                    "active": False,
                    "type": None,
                    "title": None,
                    "impact": None,
                    "severity": None,
                    "summary": f"Fed / rate event feed unavailable: {exc}",
                    "date": None,
                    "source": "market_events.json",
                },
                "equity_trend": {
                    "spy": {"symbol": "SPY", "label": "SPY", "value": None, "change_5d_pct": None, "change_20d_pct": None, "trend": "neutral", "impact": "Data unavailable"},
                    "qqq": {"symbol": "QQQ", "label": "QQQ", "value": None, "change_5d_pct": None, "change_20d_pct": None, "trend": "neutral", "impact": "Data unavailable"},
                    "summary": f"Equity trend feed unavailable: {exc}",
                    "impact": "neutral",
                },
                "summary": f"Market context feed unavailable: {exc}",
                "breakdown": {
                    "base": 50,
                    "vix": 0,
                    "vix_momentum": 0,
                    "fear_greed_short": 0,
                    "fear_greed_long": 0,
                    "ten_year_yield": 0,
                    "fed_event_short": 0,
                    "fed_event_mid": 0,
                    "fed_event_long": 0,
                    "equity_trend": 0,
                    "macro_news": 0,
                    "final_score": 50,
                },
                "strategy_impact": {
                    "buy_stock": "Data unavailable",
                    "sell_put": "Data unavailable",
                    "covered_call": "Data unavailable",
                    "wait_no_action": "Data unavailable",
                },
                "source_info": {
                    "vix": build_source_info("Data unavailable", "Cboe / FRED / Yahoo Finance", "FRED VIXCLS / Yahoo Finance ^VIX / Cboe", "Macro Feed"),
                    "fear_greed": build_source_info("Data unavailable", "CNN Fear & Greed", "CNN Fear & Greed direct endpoint / CNN scraper / RapidAPI / custom in-house sentiment composite.", "Fear & Greed Feed"),
                    "ten_year_yield": build_source_info("Data unavailable", "FRED DGS10 / Yahoo Finance ^TNX", "FRED DGS10 / Yahoo Finance ^TNX / Alpha Vantage", "Macro Feed"),
                    "fed_event": build_source_info("Live", "Economic calendar / market_events.json", "FMP Economic Calendar / Alpha Vantage / market_events.json", "market_events.json"),
                    "equity_trend": build_source_info("Data unavailable", "Yahoo Finance SPY / QQQ", "Yahoo Finance SPY / QQQ", "Yahoo Finance"),
                },
            },
            "broad_macro_news": {
                "score": 50,
                "sentiment": None,
                "major_events": [],
                "summary": f"Broad macro-news feed unavailable: {exc}",
                "source_info": build_source_info("Data unavailable", "Broad market news feed", "Google News RSS / Reuters / FMP Market News", "Broad Market News Feed"),
            },
        }

    payload = {
        "source": "yfinance-akshare",
        "quotes": quotes,
        "marketContext": market_context,
    }
    payload["fetchedAt"] = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    quote_times = [
        quote.get("updatedAt")
        for quote in quotes.values()
        if isinstance(quote, dict) and quote.get("updatedAt")
    ]
    payload["updatedAt"] = max(quote_times) if quote_times else datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    stale_quote_count = sum(
        1 for quote in quotes.values()
        if isinstance(quote, dict) and (quote.get("stale") or quote.get("dataStaleness") == "stale")
    )
    next_refresh_dt = datetime.fromisoformat(payload["fetchedAt"].replace("Z", "+00:00")) + timedelta(minutes=60)
    payload["refresh_status"] = {
        "refresh_interval_minutes": 60,
        "last_dashboard_refresh": payload["fetchedAt"],
        "next_dashboard_refresh": next_refresh_dt.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "has_stale_quotes": stale_quote_count > 0,
        "stale_quote_count": stale_quote_count,
    }
    return payload


def watchlist_response_payload(items):
    return {
        "success": True,
        "items": items,
        "watchlist": watchlist_items_to_tickers(items),
        "updatedAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
    }


class Handler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(204)
        self.end_headers()

    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path == "/api/market-data":
            self.handle_market_data(parsed)
            return
        if parsed.path == "/api/symbol-search":
            self.handle_symbol_search(parsed)
            return
        if parsed.path == "/api/watchlist":
            self.handle_watchlist_get()
            return

        if parsed.path == "/":
            self.path = "/index.html"
        return super().do_GET()

    def do_POST(self):
        parsed = urlparse(self.path)
        if parsed.path == "/api/watchlist":
            self.handle_watchlist_add()
            return
        self.send_error(404, "Not found")

    def do_DELETE(self):
        parsed = urlparse(self.path)
        if parsed.path == "/api/watchlist" or parsed.path.startswith("/api/watchlist/"):
            self.handle_watchlist_delete(parsed)
            return
        self.send_error(404, "Not found")

    def handle_market_data(self, parsed):
        params = parse_qs(parsed.query)
        tickers = [
            ticker.strip().upper()
            for ticker in params.get("tickers", [""])[0].split(",")
            if ticker.strip()
        ]

        quotes = {}
        for ticker in tickers:
            try:
                quotes[ticker] = get_cached_quote(ticker)
            except Exception as exc:
                quotes[ticker] = {
                    "price": None,
                    "previousClose": None,
                    "change": None,
                    "changePercent": None,
                    "updatedAt": None,
                    "symbol": resolve_market_symbol(ticker),
                    "shortName": None,
                    "longName": None,
                    "exchangeName": None,
                    "trailingPE": None,
                    "forwardPE": None,
                    "marketCap": None,
                    "metadata": {
                        "sector": None,
                        "industry": None,
                        "beta": None,
                        "dividendYield": None,
                        "payoutRatio": None,
                        "enterpriseToEbitda": None,
                        "priceToSalesTrailing12Months": None,
                        "enterpriseToRevenue": None,
                        "operatingMargins": None,
                        "grossMargins": None,
                        "returnOnEquity": None,
                        "debtToEquity": None,
                        "currentRatio": None,
                        "quickRatio": None,
                        "freeCashflow": None,
                        "totalCash": None,
                        "totalDebt": None,
                        "capex": None,
                        "businessSummary": None,
                        "ipoDate": None,
                        "floatShares": None,
                        "sharesOutstanding": None,
                    },
                    "optionsMarket": build_unavailable_options_payload(str(exc), market="cn" if is_a_share_ticker(ticker) else "us"),
                    "history": {"timestamps": [], "closes": [], "highs": [], "lows": [], "volumes": []},
                    "error": str(exc),
                }

        for ticker, quote in quotes.items():
            try:
                quote["companyNews"] = get_cached_company_news(ticker, quote)
            except Exception as exc:
                quote["companyNews"] = {
                    "sentiment": None,
                    "score": 50,
                    "summary": f"Company-news feed unavailable: {exc}",
                    "key_points": [],
                    "latest_news": [],
                    "bullish_news": [],
                    "bearish_news": [],
                    "key_catalysts": [],
                    "risk_events": [],
                    "source_info": build_source_info(
                        "Data unavailable",
                        missing_source="Google News RSS / Yahoo Finance",
                        suggested_source="Google News RSS / Yahoo Finance / FMP / Polygon",
                        source_name="Company News Feed",
                    ),
                }

        try:
            market_context = get_cached_market_context()
        except Exception as exc:
            market_context = {
                "macro": {
                    "vix": None,
                    "fear_greed": None,
                    "treasury_yield": None,
                    "fed_funds_rate": None,
                    "fomc_rate_path": None,
                    "score": 50,
                    "summary": f"Macro feed unavailable: {exc}",
                    "source_info": {
                        "vix": build_source_info("Data unavailable", "Cboe / FRED / Yahoo Finance", "Cboe / FRED VIXCLS / Yahoo Finance", "Macro Feed"),
                        "fear_greed": build_source_info("Data unavailable", "CNN Fear & Greed", "CNN Fear & Greed direct endpoint / CNN scraper / RapidAPI / custom in-house sentiment composite.", "Fear & Greed Feed"),
                        "treasury_yield": build_source_info("Data unavailable", "FRED / Yahoo Finance ^TNX", "FRED / Yahoo Finance ^TNX / Alpha Vantage", "Macro Feed"),
                        "fed_funds_rate": build_source_info("Data unavailable", "FRED DFF / FEDFUNDS", "FRED DFF / FEDFUNDS", "FRED"),
                        "fomc_rate_path": build_source_info("Data unavailable", "Federal Reserve / FRED", "Federal Reserve FOMC / FRED DFF", "Federal Reserve / FRED"),
                        "market_events": build_source_info("Live", "Economic calendar / market_events.json", "FMP Economic Calendar / Alpha Vantage / market_events.json", "market_events.json"),
                        "equity_trend": build_source_info("Data unavailable", "Yahoo Finance SPY / QQQ", "Yahoo Finance SPY / QQQ", "Yahoo Finance"),
                    },
                },
                "market_context": {
                    "score": 50,
                    "regime": "neutral",
                    "confidence": 45,
                    "vix": {"value": None, "change_5d": None, "change_20d": None, "trend": "neutral", "impact": "Data unavailable"},
                    "fear_greed": {"value": None, "label": None, "trend": None, "impact": "Data unavailable"},
                    "ten_year_yield": {"value": None, "change_5d_bps": None, "change_20d_bps": None, "trend": "neutral", "impact": "Data unavailable"},
                    "fed_event": {
                        "active": False,
                        "type": None,
                        "title": None,
                        "impact": None,
                        "severity": None,
                        "summary": f"Fed / rate event feed unavailable: {exc}",
                        "date": None,
                        "source": "market_events.json",
                    },
                    "equity_trend": {
                        "spy": {"symbol": "SPY", "label": "SPY", "value": None, "change_5d_pct": None, "change_20d_pct": None, "trend": "neutral", "impact": "Data unavailable"},
                        "qqq": {"symbol": "QQQ", "label": "QQQ", "value": None, "change_5d_pct": None, "change_20d_pct": None, "trend": "neutral", "impact": "Data unavailable"},
                        "summary": f"Equity trend feed unavailable: {exc}",
                        "impact": "neutral",
                    },
                    "summary": f"Market context feed unavailable: {exc}",
                    "breakdown": {
                        "base": 50,
                        "vix": 0,
                        "vix_momentum": 0,
                        "fear_greed_short": 0,
                        "fear_greed_long": 0,
                        "ten_year_yield": 0,
                        "fed_event_short": 0,
                        "fed_event_mid": 0,
                        "fed_event_long": 0,
                        "equity_trend": 0,
                        "macro_news": 0,
                        "final_score": 50,
                    },
                    "strategy_impact": {
                        "buy_stock": "Data unavailable",
                        "sell_put": "Data unavailable",
                        "covered_call": "Data unavailable",
                        "wait_no_action": "Data unavailable",
                    },
                    "source_info": {
                        "vix": build_source_info("Data unavailable", "Cboe / FRED / Yahoo Finance", "FRED VIXCLS / Yahoo Finance ^VIX / Cboe", "Macro Feed"),
                        "fear_greed": build_source_info("Data unavailable", "CNN Fear & Greed", "CNN Fear & Greed direct endpoint / CNN scraper / RapidAPI / custom in-house sentiment composite.", "Fear & Greed Feed"),
                        "ten_year_yield": build_source_info("Data unavailable", "FRED DGS10 / Yahoo Finance ^TNX", "FRED DGS10 / Yahoo Finance ^TNX / Alpha Vantage", "Macro Feed"),
                        "fed_event": build_source_info("Live", "Economic calendar / market_events.json", "FMP Economic Calendar / Alpha Vantage / market_events.json", "market_events.json"),
                        "equity_trend": build_source_info("Data unavailable", "Yahoo Finance SPY / QQQ", "Yahoo Finance SPY / QQQ", "Yahoo Finance"),
                    },
                },
                "broad_macro_news": {
                    "score": 50,
                    "sentiment": None,
                    "major_events": [],
                    "summary": f"Broad macro-news feed unavailable: {exc}",
                    "source_info": build_source_info("Data unavailable", "Broad market news feed", "Google News RSS / Reuters / FMP Market News", "Broad Market News Feed"),
                },
            }

        payload = {
            "source": "yfinance-akshare",
            "quotes": quotes,
            "marketContext": market_context,
        }
        payload["fetchedAt"] = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        quote_times = [
            quote.get("updatedAt")
            for quote in quotes.values()
            if isinstance(quote, dict) and quote.get("updatedAt")
        ]
        payload["updatedAt"] = max(quote_times) if quote_times else datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        stale_quote_count = sum(
            1 for quote in quotes.values()
            if isinstance(quote, dict) and (quote.get("stale") or quote.get("dataStaleness") == "stale")
        )
        next_refresh_dt = datetime.fromisoformat(payload["fetchedAt"].replace("Z", "+00:00")) + timedelta(minutes=60)
        payload["refresh_status"] = {
            "refresh_interval_minutes": 60,
            "last_dashboard_refresh": payload["fetchedAt"],
            "next_dashboard_refresh": next_refresh_dt.strftime("%Y-%m-%dT%H:%M:%SZ"),
            "has_stale_quotes": stale_quote_count > 0,
            "stale_quote_count": stale_quote_count,
        }
        body = json.dumps(payload).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        try:
            self.wfile.write(body)
        except (BrokenPipeError, ConnectionResetError):
            return

    def handle_symbol_search(self, parsed):
        params = parse_qs(parsed.query)
        query = normalize_search_query(params.get("q", [""])[0])
        limit_raw = params.get("limit", ["10"])[0]
        try:
            limit = max(1, min(int(limit_raw), 20))
        except ValueError:
            limit = 10

        if not query:
            self.respond_json(200, {"query": "", "candidates": []})
            return

        candidates = search_symbol_candidates(query, limit=limit)
        self.respond_json(200, {
            "query": query,
            "candidates": candidates,
            "updatedAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        })

    def respond_json(self, status, payload):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def handle_watchlist_get(self):
        items = load_shared_watchlist_items()
        self.respond_json(200, watchlist_response_payload(items))

    def handle_watchlist_add(self):
        try:
            content_length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            content_length = 0
        raw = self.rfile.read(content_length) if content_length > 0 else b"{}"
        try:
            payload = json.loads(raw.decode("utf-8") or "{}")
        except Exception:
            self.respond_json(400, {"error": "Invalid JSON"})
            return

        ticker = normalize_ticker_input(payload.get("ticker"))
        market_type = infer_market_type(ticker, payload.get("market_type"))
        if not ticker:
            self.respond_json(400, {"error": "Ticker is required"})
            return

        items = add_shared_ticker(ticker, market_type)
        self.respond_json(200, watchlist_response_payload(items))

    def handle_watchlist_delete(self, parsed):
        params = parse_qs(parsed.query)
        path_prefix = "/api/watchlist/"
        path_ticker = unquote(parsed.path[len(path_prefix):]) if parsed.path.startswith(path_prefix) else ""
        ticker = normalize_ticker_input(path_ticker or params.get("ticker", [""])[0])
        market_type = params.get("market_type", [None])[0]
        if not ticker:
            self.respond_json(400, {"error": "Ticker is required"})
            return

        items = remove_shared_ticker(ticker, market_type)
        self.respond_json(200, watchlist_response_payload(items))


app = Flask(__name__, static_folder=ROOT, static_url_path="")
app.json.ensure_ascii = False
if CORS:
    CORS(app)


@app.after_request
def add_no_store_headers(response):
    response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
    response.headers["Pragma"] = "no-cache"
    response.headers["Expires"] = "0"
    return response


@app.route("/api/market-data")
def api_market_data():
    tickers = [
        normalize_ticker_input(ticker)
        for ticker in request.args.get("tickers", "").split(",")
        if normalize_ticker_input(ticker)
    ]
    return jsonify(build_market_data_payload(tickers))


@app.route("/api/symbol-search")
def api_symbol_search():
    query = normalize_search_query(request.args.get("q", ""))
    try:
        limit = max(1, min(int(request.args.get("limit", "10")), 20))
    except ValueError:
        limit = 10
    if not query:
        return jsonify({"query": "", "candidates": []})
    return jsonify({
        "query": query,
        "candidates": search_symbol_candidates(query, limit=limit),
        "updatedAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
    })


@app.route("/api/watchlist", methods=["GET"])
def api_watchlist_get():
    try:
        return jsonify(watchlist_response_payload(load_shared_watchlist_items()))
    except Exception as exc:
        return jsonify({"success": False, "error": str(exc)}), 500


@app.route("/api/watchlist", methods=["POST"])
def api_watchlist_post():
    try:
        payload = request.get_json(silent=True) or {}
        ticker = normalize_ticker_input(payload.get("ticker"))
        if not ticker:
            return jsonify({"success": False, "error": "Ticker is required"}), 400
        market_type = infer_market_type(ticker, payload.get("market_type"))
        return jsonify(watchlist_response_payload(add_shared_ticker(ticker, market_type)))
    except Exception as exc:
        return jsonify({"success": False, "error": str(exc)}), 500


@app.route("/api/watchlist", methods=["DELETE"])
@app.route("/api/watchlist/<path:ticker>", methods=["DELETE"])
def api_watchlist_delete(ticker=None):
    try:
        normalized = normalize_ticker_input(ticker or request.args.get("ticker", ""))
        if not normalized:
            return jsonify({"success": False, "error": "Ticker is required"}), 400
        items = remove_shared_ticker(normalized, request.args.get("market_type"))
        return jsonify(watchlist_response_payload(items))
    except Exception as exc:
        return jsonify({"success": False, "error": str(exc)}), 500


@app.route("/")
def serve_index():
    return send_from_directory(ROOT, "index.html")


@app.route("/<path:filename>")
def serve_static_file(filename):
    if filename.startswith("api/"):
        return jsonify({"success": False, "error": "Not found"}), 404
    return send_from_directory(ROOT, filename)


def main():
    os.chdir(ROOT)
    display_host = "localhost" if HOST == "127.0.0.1" else HOST
    print(f"Serving dashboard on http://{display_host}:{PORT}")
    print(f"API endpoint: http://{display_host}:{PORT}/api/market-data?tickers=AAPL,MSFT,002463,300657")
    app.run(host=HOST, port=PORT, debug=False)


if __name__ == "__main__":
    main()
