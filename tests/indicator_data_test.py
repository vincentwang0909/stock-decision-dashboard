"""Native-history depth, completion/session metadata and split-safe extension."""
import os
for key in ('BACKGROUND_MARKET_REFRESH_ENABLED','EOD_HISTORY_ENABLED','COMPANY_PROFILE_REVIEW_ENABLED'):
    os.environ[key]='false'
import unittest
from datetime import datetime, timezone
from unittest.mock import patch
from zoneinfo import ZoneInfo
import pandas as pd
import server

class FrozenDate(datetime):
    @classmethod
    def now(cls, tz=None):
        value=datetime(2026,11,27,12,45,tzinfo=ZoneInfo('America/New_York'))
        return value.astimezone(tz) if tz else value.replace(tzinfo=None)

def frame(closes=(100,101,102),date='2026-11-27',hours=(9,10,12)):
    values=pd.DataFrame({'Open':closes,'High':[x+1 for x in closes],'Low':[x-1 for x in closes],'Close':closes,'Volume':[1000]*len(closes)},index=pd.DatetimeIndex([f'{date} {hour}:30:00' for hour in hours]).tz_localize('America/New_York'))
    values.attrs.update(source='yfinance',adjustment_basis='provider_ohlc_auto_adjust_false',request={'interval':'1h','period':'365d'})
    return values

class IndicatorDataTests(unittest.TestCase):
    def test_half_day_completion_and_invalid_session_are_explicit(self):
        raw=frame((100,101,102,103),hours=(9,10,12,13))
        with patch.object(server,'datetime',FrozenDate):value=server._history_payload(raw,timestamp_format='%Y-%m-%dT%H:%M:%S%z')
        self.assertEqual(len(value['timestamps']),3)
        self.assertEqual(value['completed'],[True,True,False])
        self.assertEqual(datetime.fromisoformat(value['bar_end_timestamps'][-1]).astimezone(ZoneInfo('America/New_York')).hour,13)
        self.assertEqual(value['last_bar_duration_minutes'],30)
        self.assertFalse(value['last_bar_completed'])
        self.assertEqual(value['rejected_reasons']['invalid_hourly_session_bar'],1)
        self.assertEqual(value['requested_history'],'365d')
    def test_overlap_is_extended_without_duplicate_bars(self):
        old=frame(date='2026-09-24',hours=(9,10,11))
        with patch.object(server,'datetime',FrozenDate):payload=server._history_payload(old,timestamp_format='%Y-%m-%dT%H:%M:%S%z')
        payload['lookback']=server.TECHNICAL_INTRADAY_HISTORY_PERIOD
        payload['source_validation_version']=server.SOURCE_VALIDATION_VERSION
        cached={'quote':{'history':{'intervals':{'1h':payload}}}}
        recent=old.iloc[1:].copy()
        with patch.object(server,'read_market_cache',return_value=cached),patch.object(server,'load_yfinance_intraday_history_frame',return_value=recent) as fetch:
            result=server.load_incremental_hourly_history_frame(object(),'TEST')
        self.assertEqual(len(result),3)
        self.assertEqual(result.attrs['request']['method'],'incremental_validated_overlap')
        self.assertEqual(fetch.call_count,1)
    def test_revised_overlap_forces_real_seed_backfill(self):
        old=frame(date='2026-09-24',hours=(9,10,11))
        with patch.object(server,'datetime',FrozenDate):payload=server._history_payload(old,timestamp_format='%Y-%m-%dT%H:%M:%S%z')
        payload['lookback']=server.TECHNICAL_INTRADAY_HISTORY_PERIOD
        payload['source_validation_version']=server.SOURCE_VALIDATION_VERSION
        recent=old.iloc[1:].astype(float).copy();recent.iloc[0,recent.columns.get_loc('Close')]=100.5
        cached={'quote':{'history':{'intervals':{'1h':payload}}}}
        with patch.object(server,'read_market_cache',return_value=cached),patch.object(server,'load_yfinance_intraday_history_frame',side_effect=[recent,old]) as fetch:
            result=server.load_incremental_hourly_history_frame(object(),'TEST')
        self.assertEqual(fetch.call_count,2)
        self.assertEqual(fetch.call_args.kwargs['period'],server.TECHNICAL_INTRADAY_HISTORY_PERIOD)
        self.assertEqual(len(result),3)

if __name__=='__main__':unittest.main()
