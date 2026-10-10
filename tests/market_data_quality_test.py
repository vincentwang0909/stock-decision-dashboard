"""Trust checks preserve raw observations and distinguish missing coverage."""
from datetime import datetime, timezone
import unittest
from unittest.mock import patch
import pandas as pd
import server
from market_data_validation import daily_history_freshness, reconcile_intraday_volume


def observations(day='2026-10-09', close='16:00:00-04:00', volumes=(40, 40)):
    daily = {'timestamps': [day], 'volumes': [100], 'completed': [True],
             'bar_end_timestamps': [f'{day}T{close}']}
    source = {'timestamps': [f'{day}T09:30:00-04:00', f'{day}T13:30:00-04:00'],
              'bar_end_timestamps': [f'{day}T13:30:00-04:00', f'{day}T{close}'],
              'completed': [True, True], 'volumes': list(volumes)}
    return daily, source


class MarketDataQualityTests(unittest.TestCase):
    def test_normal_intraday_volume_can_be_less_than_daily(self):
        daily, source = observations()
        result = reconcile_intraday_volume(daily, {'4h': source})['4h']
        self.assertEqual(result['status'], 'passed')
        self.assertEqual(result['checked_sessions'], 1)
        self.assertEqual(source['volumes'], [40, 40])

    def test_overcount_is_explicit_and_never_rescaled(self):
        daily, source = observations(volumes=(700, 600))
        result = reconcile_intraday_volume(daily, {'4h': source})['4h']
        self.assertEqual(result['status'], 'conflict')
        self.assertEqual(result['examples'][0]['ratio'], 13)
        self.assertEqual(source['volumes'], [700, 600])

    def test_incomplete_or_provisional_session_cannot_pass(self):
        daily, source = observations()
        source['timestamps'][1] = '2026-10-09T14:00:00-04:00'
        self.assertEqual(reconcile_intraday_volume(daily, {'4h': source})['4h']['status'], 'not_checked')
        daily, source = observations()
        source['completed'][1] = False
        self.assertEqual(reconcile_intraday_volume(daily, {'4h': source})['4h']['status'], 'not_checked')

    def test_missing_timezone_is_not_assumed(self):
        daily, source = observations()
        source['timestamps'][0] = '2026-10-09T09:30:00'
        self.assertEqual(reconcile_intraday_volume(daily, {'4h': source})['4h']['status'], 'not_checked')

    def test_half_day_uses_actual_session_close(self):
        daily, source = observations(day='2026-11-27', close='13:00:00-05:00', volumes=(80,))
        source = {key: value[:1] for key, value in source.items()}
        source['timestamps'] = ['2026-11-27T09:30:00-05:00']
        source['bar_end_timestamps'] = daily['bar_end_timestamps']
        self.assertEqual(reconcile_intraday_volume(daily, {'4h': source})['4h']['status'], 'passed')

    def test_freshness_respects_session_close_weekend_holiday_dst(self):
        for at, expected in [('2026-10-09T19:59:00+00:00', '2026-10-08'),
                             ('2026-10-09T20:01:00+00:00', '2026-10-09'),
                             ('2026-10-10T15:00:00+00:00', '2026-10-09'),
                             ('2026-11-27T18:01:00+00:00', '2026-11-27'),
                             ('2026-11-26T21:00:00+00:00', '2026-11-25')]:
            result = daily_history_freshness({'timestamps': ['2026-10-08']}, datetime.fromisoformat(at))
            self.assertEqual(result['expected_completed_date'], expected)
        self.assertEqual(daily_history_freshness({'timestamps': ['2026-10-08']}, datetime(2026, 10, 10, tzinfo=timezone.utc))['state'], 'stale')

    def test_legacy_or_unusable_hourly_cache_is_reseeded(self):
        seed = pd.DataFrame()
        for version, status in [(None, None), (server.SOURCE_VALIDATION_VERSION, 'conflict')]:
            cached = {'quote': {'history': {'intervals': {'1h': {
                'source_validation_version': version, 'volume_validation': {'status': status},
                'lookback': server.TECHNICAL_INTRADAY_HISTORY_PERIOD, 'source': 'yfinance',
                'adjustment_basis': 'provider_ohlc_auto_adjust_false'}}}}}
            with patch.object(server, 'read_market_cache', return_value=cached), patch.object(server, 'load_yfinance_intraday_history_frame', return_value=seed) as fetch:
                self.assertIs(server.load_incremental_hourly_history_frame(object(), 'TEST'), seed)
            self.assertEqual(fetch.call_count, 1)
            self.assertEqual(fetch.call_args.kwargs['period'], server.TECHNICAL_INTRADAY_HISTORY_PERIOD)

    def test_legacy_or_unusable_native_four_hour_cache_is_reseeded(self):
        for version, status in [(None, None), (server.SOURCE_VALIDATION_VERSION, 'conflict')]:
            cached = {'quote': {'history': {'intervals': {'4h': {
                'source_validation_version': version, 'volume_validation': {'status': status},
                'lookback': server.TECHNICAL_FOUR_HOUR_HISTORY_PERIOD, 'source': 'yfinance',
                'bar_method': server.TECHNICAL_FOUR_HOUR_BAR_METHOD, 'available': True}}}}}
            with patch.object(server, 'read_market_cache', return_value=cached), patch.object(server, 'load_yfinance_native_four_hour_history_frame', return_value=(pd.DataFrame(), {}, 'source_unavailable')) as fetch:
                server.load_incremental_native_four_hour_history_frame(object(), 'TEST')
            self.assertEqual(fetch.call_count, 1)
            self.assertNotIn('period', fetch.call_args.kwargs, 'default full seed, not one-month overlap')


if __name__ == '__main__':
    unittest.main()
