"""Source trust and official macro parsing; no network or active storage."""
import io
import os
for k in ('BACKGROUND_MARKET_REFRESH_ENABLED','EOD_HISTORY_ENABLED','COMPANY_PROFILE_REVIEW_ENABLED'):os.environ[k]='false'
import unittest
import tempfile
from unittest.mock import patch
from datetime import datetime,timezone
from lxml import html
from market_data_validation import daily_history_freshness, weekly_history_freshness
import server

class DataQualityTests(unittest.TestCase):
    def test_weekly_freshness_is_independent_and_detects_an_entire_missing_week(self):
        h={'session_calendar':{'completed_week_keys':['2026-10-05'],'week_ends':{'2026-10-05':'2026-10-09T20:00:00+00:00'}}}
        for at,state,expected in [('2026-10-12T21:00:00+00:00','current','2026-10-05'),('2026-10-16T19:59:00+00:00','current','2026-10-05'),('2026-10-16T20:01:00+00:00','stale','2026-10-12')]:
            r=weekly_history_freshness(h,datetime.fromisoformat(at));self.assertEqual(r['state'],state);self.assertEqual(r['expected_completed_week'],expected)
        h={'session_calendar':{'completed_week_keys':['2026-11-23'],'week_ends':{'2026-11-23':'2026-11-27T18:00:00+00:00'}}}
        self.assertEqual(weekly_history_freshness(h,datetime.fromisoformat('2026-11-27T18:01:00+00:00'))['state'],'current')
        h={'session_calendar':{'completed_week_keys':['2026-03-30'],'week_ends':{'2026-03-30':'2026-04-02T20:00:00+00:00'}}}
        self.assertEqual(weekly_history_freshness(h,datetime.fromisoformat('2026-04-02T20:01:00+00:00'))['state'],'current','Good Friday means Thursday is the final session')

    def test_corrupt_or_future_macro_cache_cannot_bypass_loader(self):
        now=datetime(2026,10,12,21,tzinfo=timezone.utc).timestamp()
        for cached in ([1], {"expires_at":now+600,"value":{"status":"available","as_of":None}}, {"expires_at":now+600,"value":{"status":"available","as_of":"2026-10-13T21:00:00+00:00","events":[]}}, {"expires_at":now+600,"value":{"status":"available","as_of":"2026-10-12T20:00:00+00:00","events":None}}):
            with tempfile.TemporaryDirectory() as folder, patch.object(server,"MARKET_CACHE_DIR",folder), patch.object(server,"MACRO_OFFICIAL_CACHE",{"calendar":cached}), patch.object(server.time,"time",return_value=now):
                calls=[]
                def loader():
                    calls.append(1);return {"status":"unavailable","reason":"fixture missing source"}
                self.assertEqual(server._official_macro_cached("calendar",loader,600)["status"],"unavailable")
                self.assertEqual(calls,[1])

    def test_calendar_cache_refreshes_after_new_fomc_decision(self):
        now=datetime(2026,10,28,21,tzinfo=timezone.utc).timestamp()
        cached={"expires_at":now+600,"value":{"status":"available","as_of":"2026-10-28T12:00:00+00:00","events":[{"type":"fomc","at":"2026-10-28T14:00:00-04:00"}]}}
        with tempfile.TemporaryDirectory() as folder, patch.object(server,"MARKET_CACHE_DIR",folder), patch.object(server,"MACRO_OFFICIAL_CACHE",{"calendar":cached}), patch.object(server.time,"time",return_value=now):
            calls=[]
            def loader():
                calls.append(1);return {"status":"available","as_of":"2026-10-28T21:00:00+00:00","events":[],"fomc_decision":{"status":"available"}}
            self.assertEqual(server._official_macro_cached("calendar",loader,600)["fomc_decision"]["status"],"available")
            self.assertEqual(calls,[1])

    def test_freshness_respects_close_holiday_weekend_and_dst(self):
        for at,expected in [('2026-10-09T19:59:00+00:00','2026-10-08'),('2026-10-09T20:01:00+00:00','2026-10-09'),('2026-10-10T15:00:00+00:00','2026-10-09'),('2026-11-27T18:01:00+00:00','2026-11-27'),('2026-11-26T21:00:00+00:00','2026-11-25')]:
            r=daily_history_freshness({'timestamps':['2026-10-08']},datetime.fromisoformat(at));self.assertEqual(r['expected_completed_date'],expected)
    def test_fred_central_time_converts_to_et_in_both_seasons(self):
        for day,offset in [('Wednesday October 14, 2026','-04:00'),('Wednesday January 14, 2026','-05:00')]:
            doc=html.fromstring(f'<table><tbody><tr><td><span>{day}</span></td></tr><tr><td>7:30 am</td><td><a href="/release?rid=10">CPI</a></td></tr></tbody></table>')
            result=server.parse_fred_release_calendar(doc,'cpi','official-fixture')
            self.assertEqual(len(result),1);self.assertTrue(result[0]['at'].endswith('08:30:00'+offset))
    def test_fomc_uses_decision_day_and_skips_future_nonmeeting_text(self):
        doc=html.fromstring('<div class="panel"><h4>2026 FOMC Meetings</h4><div class="fomc-meeting"><div class="fomc-meeting__month">October</div><div class="fomc-meeting__date">27-28</div></div></div>')
        result=server.parse_fomc_calendar(doc,datetime(2026,10,12,tzinfo=timezone.utc))
        self.assertEqual(result[0]['at'],'2026-10-28T14:00:00-04:00')
    def test_fred_actual_units_missing_values_and_revisions(self):
        payload = """observation_date,CPIAUCSL,CPILFESL,CPIAUCNS,CPILFENS,PAYEMS,UNRATE,CES0500000003,CIVPART
2026-01-01,100,100,.,.,150000,4,.,.
2026-02-01,100.2,100.2,.,.,150100,4,.,.
2026-03-01,100.5,100.5,.,.,150220,4.1,.,.
2026-04-01,100.8,100.8,.,.,150350,4.3,.,.
"""
        now = datetime(2026, 5, 8, tzinfo=timezone.utc)
        result = server.parse_fred_macro_actuals(payload, now)
        jobs = result["employment"]
        self.assertEqual(result["status"], "available")
        self.assertEqual(jobs["payroll_change_thousands"], 130)
        self.assertAlmostEqual(jobs["unemployment_change_pp"], .2)
        self.assertAlmostEqual(result["cpi"]["headline"]["mom_pct"], (100.8 / 100.5 - 1) * 100)
        self.assertIsNone(jobs["wage_mom_pct"])
        self.assertIsNone(jobs["previous_month_revision_thousands"])
        old = {"series": {"CES0000000001": [{"period": "2026-03", "value": 150200}]}}
        revised = server.parse_fred_macro_actuals(payload, now, old)
        self.assertEqual(revised["employment"]["previous_month_revision_thousands"], 20)

    def test_fred_gaps_and_cross_series_periods_do_not_make_false_comparisons(self):
        payload = """observation_date,CPIAUCSL,CPILFESL,CPIAUCNS,CPILFENS,PAYEMS,UNRATE,CES0500000003,CIVPART
2026-01-01,100,100,.,.,150000,4,.,.
2026-02-01,.,.,.,.,.,4.1,.,.
2026-03-01,101,101,.,.,150200,.,.,.
"""
        result = server.parse_fred_macro_actuals(payload, datetime(2026, 4, 8, tzinfo=timezone.utc))
        self.assertIsNone(result["cpi"]["core"]["mom_pct"])
        self.assertIsNone(result["employment"]["payroll_change_thousands"])
        self.assertEqual(result["status"], "unavailable")
        self.assertIsNone(result["employment"]["unemployment_change_pp"])

    def test_fred_yoy_uses_exact_year_ago_month_despite_intervening_gap(self):
        payload = """observation_date,CPIAUCSL,CPILFESL,CPIAUCNS,CPILFENS,PAYEMS,UNRATE,CES0500000003,CIVPART
2025-08-01,.,.,80,80,.,.,.,.
2025-09-01,100,100,100,100,.,.,.,.
2025-11-01,101,101,101,101,.,.,.,.
2026-06-01,102,102,.,.,.,.,.,.
2026-07-01,103,103,.,.,.,.,.,.
2026-08-01,104,104,106,106,.,.,.,.
2026-09-01,105,105,108,108,.,.,.,.
"""
        now = datetime(2026, 10, 14, tzinfo=timezone.utc)
        result = server.parse_fred_macro_actuals(payload, now)
        for data in result["cpi"]["headline"], result["cpi"]["core"]:
            self.assertEqual(data["period"], "2026-09")
            self.assertEqual(data["yoy_base_period"], "2025-09")
            self.assertEqual(data["yoy_basis"], "not_seasonally_adjusted")
            self.assertAlmostEqual(data["yoy_pct"], 8)
            self.assertAlmostEqual(data["mom_pct"], (105 / 104 - 1) * 100)
            self.assertAlmostEqual(data["previous_mom_pct"], (104 / 103 - 1) * 100)
            self.assertAlmostEqual(data["three_month_mean_pct"], sum([(103/102-1)*100,(104/103-1)*100,(105/104-1)*100])/3)
            self.assertIsNone(data["yoy_unavailable_reason"])
        for base, reason in [(".", "missing_year_ago_period"), ("0", "invalid_index")]:
            modified = payload.replace("2025-09-01,100,100,100,100", f"2025-09-01,100,100,{base},{base}")
            data = server.parse_fred_macro_actuals(modified, now)["cpi"]["headline"]
            self.assertIsNone(data["yoy_pct"])
            self.assertNotIn("yoy_estimate", data)
            self.assertEqual(data["yoy_unavailable_reason"], reason)
            self.assertEqual(data["mom_pct"], result["cpi"]["headline"]["mom_pct"])
        missing_current = payload.replace("2026-09-01,105,105,108,108", "2026-09-01,105,105,.,.")
        self.assertEqual(server.parse_fred_macro_actuals(missing_current, now)["cpi"]["headline"]["yoy_unavailable_reason"],
                         "missing_current_period")

    def test_october_estimates_require_both_unadjusted_neighbors_and_yield_to_official_yoy(self):
        payload = """observation_date,CPIAUCSL,CPILFESL,CPIAUCNS,CPILFENS,PAYEMS,UNRATE,CES0500000003,CIVPART
2025-09-01,.,.,324.800,330.804,.,.,.,.
2025-10-01,.,.,.,.,.,.,.,.
2025-11-01,.,.,324.122,330.425,.,.,.,.
2026-09-01,336.298,338.896,336.940,339.287,159128,4.2,37.86,61.8
2026-10-01,337.476,339.900,337.511,339.921,159293,4.1,38.00,61.9
"""
        now = datetime(2026, 11, 22, tzinfo=timezone.utc)
        cpi = server.parse_fred_macro_actuals(payload, now)["cpi"]
        for series, expected in [("headline", 4.0221118), ("core", 2.8149267)]:
            self.assertIsNone(cpi[series]["yoy_pct"])
            self.assertAlmostEqual(cpi[series]["yoy_estimate"]["pct"], expected)
            self.assertEqual(cpi[series]["yoy_estimate"]["source_periods"], ["2025-09", "2025-11"])
        without_neighbor = payload.replace("324.122,330.425", ".,.")
        self.assertNotIn("yoy_estimate", server.parse_fred_macro_actuals(without_neighbor, now)["cpi"]["headline"])
        with_official = payload.replace("2025-10-01,.,.,.,.", "2025-10-01,.,.,325,331")
        data = server.parse_fred_macro_actuals(with_official, now)["cpi"]["headline"]
        self.assertAlmostEqual(data["yoy_pct"], (337.511 / 325 - 1) * 100)
        self.assertNotIn("yoy_estimate", data)

    def test_fred_queries_once_after_0905_et_and_preserves_verified_values_on_failure(self):
        class Clock(datetime):
            current = None

            @classmethod
            def now(cls, tz=None):
                return cls.current.astimezone(tz)

        success = b"observation_date,CPIAUCSL,CPILFESL,CPIAUCNS,CPILFENS,PAYEMS,UNRATE,CES0500000003,CIVPART\n2026-10-01,337.476,339.900,337.511,339.921,159293,4.1,38,61.9\n"
        responses = [io.BytesIO(success), OSError("FRED timeout")]
        with tempfile.TemporaryDirectory() as folder, patch.object(server, "MARKET_CACHE_DIR", folder), \
                patch.object(server, "MACRO_OFFICIAL_CACHE", {}), patch.object(server, "datetime", Clock), \
                patch.object(server.time, "time", side_effect=lambda: Clock.current.timestamp()), \
                patch.object(server, "urlopen", side_effect=responses) as request:
            def actuals_at(utc):
                Clock.current = datetime.fromisoformat(utc)
                return server.fetch_official_macro_actuals()

            self.assertEqual(actuals_at("2026-10-31T13:04:59+00:00")["status"], "unavailable")
            request.assert_not_called()
            first = actuals_at("2026-10-31T13:05:00+00:00")
            self.assertEqual(first["status"], "available")
            self.assertEqual(request.call_args.args[0].get_method(), "GET")
            self.assertTrue(request.call_args.args[0].full_url.startswith(server.FRED_ACTUALS_URL + "?"))
            server.MACRO_OFFICIAL_CACHE.clear()
            self.assertEqual(actuals_at("2026-11-01T14:04:59+00:00"), first)
            request.assert_called_once()
            stale = actuals_at("2026-11-01T14:05:00+00:00")
            self.assertEqual(stale["status"], "stale")
            self.assertEqual(stale["as_of"], first["as_of"])
            server.MACRO_OFFICIAL_CACHE.clear()
            self.assertEqual(actuals_at("2026-11-01T20:05:00+00:00"), stale)
            self.assertEqual(request.call_count, 2)

    def test_legacy_macro_cache_is_refetched_for_exact_period_schema(self):
        now=datetime(2026,10,14,23,tzinfo=timezone.utc).timestamp()
        for version,expected_calls in [(None,1),(2,0)]:
            cache={'expires_at':now+600,'value':{'status':'available','as_of':'2026-10-14T22:00:00+00:00','schema_version':version}}
            with tempfile.TemporaryDirectory() as folder, patch.object(server,'MARKET_CACHE_DIR',folder), patch.object(server,'MACRO_OFFICIAL_CACHE',{'actuals':cache}), patch.object(server.time,'time',return_value=now):
                calls=[]
                def loader():
                    calls.append(1);return {'status':'available','as_of':'2026-10-14T23:00:00+00:00','schema_version':2}
                self.assertEqual(server._official_macro_cached('actuals',loader,1800)['schema_version'],2)
                self.assertEqual(len(calls),expected_calls)

    def test_fomc_actuals_use_latest_two_published_decisions_only(self):
        now=datetime(2026,10,15,20,tzinfo=timezone.utc)
        events=[{'id':f'fomc-{day}','type':'fomc','at':day+'T18:00:00+00:00','statement_url':'https://www.federalreserve.gov/newsevents/pressreleases/monetary'+day.replace('-','')+'a.htm'} for day in ['2026-07-29','2026-09-16','2026-10-28']]
        seen=[]
        def document(url):
            seen.append(url)
            rate='3-1/2 to 3-3/4' if '20260729' in url else '3-3/4 to 4'
            return html.fromstring('<body>The target range for the federal funds rate is '+rate+' percent.</body>')
        with patch.object(server,'_read_official_html',side_effect=document):
            actual=server.fetch_completed_fomc_actuals(events,now)
        self.assertEqual(actual['target_range'],{'low':3.75,'high':4})
        self.assertEqual(actual['previous_decision']['target_range'],{'low':3.5,'high':3.75})
        self.assertEqual(len(seen),2);self.assertFalse(any('20261028' in url for url in seen))
        with patch.object(server,'_read_official_html',side_effect=ValueError('invalid actual')) as read:
            bad=server.fetch_completed_fomc_actuals(events,now)
        self.assertEqual(bad['meeting_id'],'fomc-2026-09-16');self.assertEqual(bad['status'],'unavailable');self.assertIsNone(bad['previous_decision']);self.assertEqual(read.call_count,1)
        self.assertIsNone(server.parse_fomc_target_range(html.fromstring('<body>target range for the federal funds rate by 1/4 percent</body>')))
        self.assertIsNone(server.parse_fomc_target_range(html.fromstring('<body>target range for the federal funds rate at 4 to 3 percent</body>')))
        self.assertEqual(server.parse_fomc_target_range(html.fromstring('<body>target range for the federal funds rate at 0 to 1/4 percent</body>')),{'low':0,'high':.25})

    def test_official_calendar_includes_previous_decision_outside_old_70_days(self):
        doc=html.fromstring('<div class="panel"><h4>2026 FOMC Meetings</h4>'+''.join(f'<div class="fomc-meeting"><div class="fomc-meeting__month">{month}</div><div class="fomc-meeting__date">{days}</div></div>' for month,days in [('July','28-29'),('September','15-16'),('October','27-28')])+'</div>')
        rows=server.parse_fomc_calendar(doc,datetime(2026,10,15,tzinfo=timezone.utc))
        self.assertEqual([row['id'] for row in rows],['fomc-2026-07-29','fomc-2026-09-16','fomc-2026-10-28'])

    def test_old_calendar_cache_is_refetched_for_actual_history_schema(self):
        now=datetime(2026,10,15,20,tzinfo=timezone.utc).timestamp()
        for schema,calls_expected in [(None,1),(2,0)]:
            cached={'expires_at':now+600,'value':{'schema_version':schema,'status':'available','as_of':'2026-10-15T19:00:00+00:00','events':[]}}
            with tempfile.TemporaryDirectory() as folder,patch.object(server,'MARKET_CACHE_DIR',folder),patch.object(server,'MACRO_OFFICIAL_CACHE',{'calendar':cached}),patch.object(server.time,'time',return_value=now):
                calls=[]
                def loader():
                    calls.append(1);return {'schema_version':2,'status':'available','as_of':'2026-10-15T20:00:00+00:00','events':[]}
                self.assertEqual(server._official_macro_cached('calendar',loader,600)['schema_version'],2)
                self.assertEqual(len(calls),calls_expected)

if __name__=='__main__':unittest.main()
