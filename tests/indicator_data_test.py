"""Daily-only history, actual exchange completion and clean overlap backfill."""
import os
for k in ('BACKGROUND_MARKET_REFRESH_ENABLED','EOD_HISTORY_ENABLED','COMPANY_PROFILE_REVIEW_ENABLED'): os.environ[k]='false'
import unittest
from datetime import datetime, timezone
from unittest.mock import patch
from zoneinfo import ZoneInfo
import pandas as pd
import server
from market_data_validation import validate_us_daily_frame

class FrozenDate(datetime):
    @classmethod
    def now(cls,tz=None):
        value=datetime(2026,11,27,12,45,tzinfo=ZoneInfo('America/New_York'))
        return value.astimezone(tz) if tz else value.replace(tzinfo=None)

def frame(dates):
    f=pd.DataFrame({'Open':100.,'High':101.,'Low':99.,'Close':100.,'Volume':1000.},index=pd.to_datetime(dates))
    f.attrs.update(source='yfinance',adjustment_basis='provider_ohlc_auto_adjust_false',request={'interval':'1d','period':'10y'})
    return f

class IndicatorDataTests(unittest.TestCase):
    def test_half_day_is_unfinished_until_actual_early_close(self):
        with patch.object(server,'datetime',FrozenDate): result=server._history_payload(frame(['2026-11-25','2026-11-26','2026-11-27']))
        self.assertEqual(result['timestamps'],['2026-11-25','2026-11-27'])
        self.assertEqual(result['completed'],[True,False])
        self.assertEqual(result['bar_end_timestamps'][-1],'2026-11-27T18:00:00+00:00')
        self.assertEqual(result['rejected_reasons']['exchange_closed_daily_bar'],1)
        self.assertEqual(result['session_calendar']['completed_week_keys'],[])
    def test_closed_holiday_week_has_four_real_daily_observations(self):
        from market_data_validation import completed_week_metadata
        result=completed_week_metadata(frame(['2026-11-23','2026-11-24','2026-11-25','2026-11-27']),datetime(2026,11,27,18,1,tzinfo=timezone.utc))
        self.assertEqual(result['completed_week_keys'],['2026-11-23'])
        incomplete=completed_week_metadata(frame(['2026-11-23','2026-11-24','2026-11-27']),datetime(2026,11,27,18,1,tzinfo=timezone.utc))
        self.assertEqual(incomplete['completed_week_keys'],[])
    def test_hourly_rows_cannot_masquerade_as_daily(self):
        raw=frame(['2026-10-09 09:30','2026-10-09 13:30'])
        clean,audit=validate_us_daily_frame(raw)
        self.assertTrue(clean.empty);self.assertEqual(audit['reasons']['multiple_bars_in_daily_session'],2)
    def test_stale_summary_marker_cannot_skip_new_source_validation(self):
        old={'_summary_cache_fresh':True,'cache_age_seconds':0,'quote':{'history':{'source_validation_version':1,'lookback':'10y'}}}
        self.assertFalse(server.is_market_cache_fresh(old))
        old['quote']['history']['source_validation_version']=server.SOURCE_VALIDATION_VERSION
        self.assertFalse(server.is_market_cache_fresh(old))
        old['quote']['history']['adjustment_basis']='provider_ohlc_auto_adjust_false'
        self.assertTrue(server.is_market_cache_fresh(old))
        old['quote']['history']['intervals']={'4h':{}}
        self.assertFalse(server.is_market_cache_fresh(old))
if __name__=='__main__':unittest.main()
