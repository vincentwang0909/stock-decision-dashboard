"""Source trust and official macro parsing; no network or active storage."""
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
    def test_bls_actual_units_missing_values_and_revisions(self):
        names=['CUSR0000SA0','CUSR0000SA0L1E','CES0000000001','LNS14000000']
        values=[[100,100.2,100.5,100.8],[100,100.2,100.5,100.8],[150000,150100,150220,150350],[4,4,4.1,4.3]]
        payload={'status':'REQUEST_SUCCEEDED','Results':{'series':[{'seriesID':n,'data':[{'year':'2026','period':f'M{i+1:02d}','value':str(v)} for i,v in enumerate(series)]} for n,series in zip(names,values)]}}
        r=server.parse_bls_actuals(payload,datetime(2026,5,8,tzinfo=timezone.utc))
        self.assertEqual(r['status'],'available');self.assertEqual(r['employment']['payroll_change_thousands'],130)
        self.assertAlmostEqual(r['employment']['unemployment_change_pp'],.2);self.assertAlmostEqual(r['cpi']['headline']['mom_pct'],(100.8/100.5-1)*100)
        self.assertIsNone(r['employment']['wage_mom_pct']);self.assertIsNone(r['employment']['previous_month_revision_thousands'])
        old={'series':{'CES0000000001':[{'period':'2026-03','value':150200}]}}
        self.assertEqual(server.parse_bls_actuals(payload,datetime.now(timezone.utc),old)['employment']['previous_month_revision_thousands'],20)
        self.assertEqual(server.parse_bls_actuals({'status':'REQUEST_NOT_PROCESSED'},datetime.now(timezone.utc))['status'],'unavailable')
    def test_bls_gaps_and_cross_series_periods_do_not_make_false_comparisons(self):
        names=['CUSR0000SA0','CUSR0000SA0L1E','CES0000000001','LNS14000000']
        payload={'status':'REQUEST_SUCCEEDED','Results':{'series':[{'seriesID':n,'data':[{'year':'2026','period':'M01','value':'100'},{'year':'2026','period':'M03','value':'101'}]} for n in names]}}
        result=server.parse_bls_actuals(payload,datetime(2026,4,8,tzinfo=timezone.utc))
        self.assertIsNone(result['cpi']['core']['mom_pct'])
        self.assertIsNone(result['employment']['payroll_change_thousands'])
        payload['Results']['series'][-1]['data'][-1]['period']='M02'
        result=server.parse_bls_actuals(payload,datetime(2026,4,8,tzinfo=timezone.utc))
        self.assertEqual(result['status'],'unavailable')
        self.assertIsNone(result['employment']['unemployment_change_pp'])
if __name__=='__main__':unittest.main()
