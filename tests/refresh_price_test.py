"""Valid OHLCV survives unavailable enrichment; browser/server hourly slots agree."""
import os
for key in ('BACKGROUND_MARKET_REFRESH_ENABLED', 'EOD_HISTORY_ENABLED', 'COMPANY_PROFILE_REVIEW_ENABLED'):
    os.environ[key] = 'false'
import unittest
from concurrent.futures import Future
from datetime import datetime, timezone
from unittest.mock import patch
import pandas as pd
import server
import market_data_validation as validation


class RefreshPriceTests(unittest.TestCase):
    def test_duplicate_ohlcv_columns_are_unavailable_instead_of_crashing_fast_iteration(self):
        raw = pd.DataFrame([[100, 101, 99, 100, 100, 1000]],
                           columns=['Open', 'High', 'Low', 'Close', 'Close', 'Volume'],
                           index=pd.to_datetime(['2026-10-02']))
        clean, audit = validation.validate_frame(raw)
        self.assertTrue(clean.empty)
        self.assertEqual(audit['reasons'], {'duplicate_ohlcv_column': 1})

    def test_ten_year_frame_reuses_one_calendar_across_tickers(self):
        index = pd.bdate_range('2016-10-03', '2026-10-02')
        raw = pd.DataFrame({'Open': 100., 'High': 101., 'Low': 99., 'Close': 100., 'Volume': 1000.}, index=index)
        raw.attrs['request'] = {'interval': '1d', 'period': '10y'}
        validation.exchange_calendar.cache_clear()
        self.addCleanup(validation.exchange_calendar.cache_clear)
        for _ in range(2):
            payload = server._history_payload(raw)
            self.assertEqual(len(payload['completed']), len(raw))
            self.assertEqual(payload['closes'], [100.] * len(raw))
        self.assertEqual(validation.exchange_calendar.cache_info().misses, 1,
                         'one shared calendar, instead of rebuilding all eleven years for every ticker')

    def test_shared_calendar_preserves_holidays_half_days_and_older_date_fallback(self):
        calendar = validation.exchange_calendar(2026)
        self.assertIsNone(validation.session(datetime(2026, 4, 3).date(), calendar=calendar))
        half_day = validation.session(datetime(2026, 11, 27).date(), calendar=calendar)
        self.assertEqual(half_day['close'].isoformat(), '2026-11-27T18:00:00+00:00')
        old = datetime(2000, 1, 3).date()
        self.assertEqual(validation.session(old, calendar=calendar), validation.session(old))

    def test_server_schedule_uses_fixed_et_40_including_dst(self):
        cases = [
            ('2026-10-04T13:39:59.999+00:00', '2026-10-04T13:40:00+00:00'),
            ('2026-10-04T13:40:00+00:00', '2026-10-04T14:40:00+00:00'),
            ('2026-10-04T13:45:00+00:00', '2026-10-04T14:40:00+00:00'),
            ('2026-01-04T14:39:00+00:00', '2026-01-04T14:40:00+00:00'),
            ('2026-11-01T05:50:00+00:00', '2026-11-01T06:40:00+00:00'),
            ('2026-03-08T06:50:00+00:00', '2026-03-08T07:40:00+00:00'),
        ]
        for current, expected in cases:
            with self.subTest(current=current):
                self.assertEqual(server.next_dashboard_refresh_utc(datetime.fromisoformat(current)).isoformat(), expected)

    def quote_with_metadata_future(self, future):
        history = pd.DataFrame({'Open': [99, 100], 'High': [101, 102], 'Low': [98, 99],
                                'Close': [100, 101], 'Volume': [1000, 1200]},
                               index=pd.to_datetime(['2026-09-30', '2026-10-01']))
        history.attrs.update(source='yfinance', adjustment_basis='provider_ohlc_auto_adjust_false',
                             request={'period': '10y', 'interval': '1d'})
        with patch.object(server, 'provider_ticker', return_value=object()), \
             patch.object(server, 'load_incremental_daily_history', return_value=history), \
             patch.object(server, 'read_market_cache', return_value=None), \
             patch.object(server, 'load_technical_intraday_history_frames', return_value=(None, (pd.DataFrame(), {}, 'source_unavailable'))), \
             patch.object(server.AUXILIARY_TASKS, 'submit', return_value=future), \
             patch.object(server, 'QUOTE_METADATA_TIMEOUT_SECONDS', .001):
            return server.fetch_us_quote_with_yfinance('TEST')

    def test_slow_metadata_does_not_discard_price_and_daily_history(self):
        pending = Future()
        quote = self.quote_with_metadata_future(pending)
        self.assertEqual(quote['price'], 101)
        self.assertEqual(quote['previousClose'], 100)
        self.assertEqual(quote['changePercent'], 1)
        self.assertEqual(quote['history']['closes'], [100, 101])
        self.assertEqual(quote['updatedAt'], '2026-10-01T20:00:00Z')
        self.assertEqual(quote['metadata']['quoteMetadataStatus'], 'unavailable')
        self.assertIsNone(quote['metadata']['industry'])
        self.assertEqual(quote['history']['intervals']['4h']['availability'], 'unavailable')
        self.assertFalse(pending.cancelled(), 'timeout must not release or restart running work')

    def test_earlier_metadata_generation_cannot_replace_current_price(self):
        future = Future()
        future.set_result((server.current_refresh_generation() - 1,
                           ({'regularMarketPrice': 999}, {}, {}, {}, False)))
        self.assertEqual(self.quote_with_metadata_future(future)['price'], 101)

    def test_current_metadata_preserves_fresh_regular_quote_over_daily_close(self):
        future = Future()
        timestamp = int(datetime(2026, 10, 2, 20, tzinfo=timezone.utc).timestamp())
        future.set_result((server.current_refresh_generation(),
                           ({'regularMarketPrice': 105, 'regularMarketTime': timestamp,
                             'regularMarketPreviousClose': 101, 'shortName': 'Example'}, {}, {}, {}, False)))
        quote = self.quote_with_metadata_future(future)
        self.assertEqual(quote['price'], 105)
        self.assertEqual(quote['previousClose'], 101)
        self.assertEqual(quote['updatedAt'], '2026-10-02T20:00:00Z')
        self.assertEqual(quote['metadata']['quoteMetadataStatus'], 'available')

    def test_full_refresh_records_provider_failure_instead_of_empty_success(self):
        payload = {'failed': [{'ticker': 'TEST', 'error': 'Provider timed out', 'used_cache': False}],
                   'refresh_status': {'success_count': 0, 'failed_count': 1, 'live_failed_tickers': ['TEST']}}
        with patch.object(server, 'build_market_data_payload', return_value=payload), \
             patch.object(server, 'active_watchlist_tickers', return_value=['TEST']):
            result = server._refresh_market_cache_for_tickers(['TEST'])
        self.assertEqual(result['quote_errors'], {'TEST': 'Provider timed out'})
        self.assertEqual(result['batches'][0]['errors'], {'TEST': 'Provider timed out'})
        self.assertIsNotNone(result['error'])
        self.assertEqual(server.BACKGROUND_REFRESH_STATE['last_error'], result['error'])

    def test_next_refresh_receipt_does_not_shift_after_manual_refresh(self):
        cached = {'quote': {'price': 101, 'updatedAt': '2026-10-04T13:35:00Z'},
                  'updated_at': '2026-10-04T13:35:00Z', 'cache_age_seconds': 0}
        with patch.object(server, 'read_market_cache', return_value=cached), \
             patch.object(server, 'is_market_cache_fresh', return_value=True), \
             patch.object(server, 'ensure_company_profiles_for_quotes'), \
             patch.object(server, 'get_market_context_cached_snapshot', return_value=({}, {})), \
             patch.object(server, 'next_dashboard_refresh_utc', return_value=datetime(2026, 10, 4, 13, 40, tzinfo=timezone.utc)):
            result = server.build_market_data_payload(['TEST'])
        self.assertEqual(result['refresh_status']['next_auto_refresh_at'], '2026-10-04T13:40:00Z')
        self.assertEqual(result['refresh_status']['refresh_timezone'], 'America/New_York')
        self.assertEqual(result['refresh_status']['refresh_minute'], 40)


if __name__ == '__main__': unittest.main()
