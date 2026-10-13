"""Valid OHLCV survives unavailable enrichment; browser/server half-hour slots agree."""
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
    def test_missing_latest_close_recovers_only_real_completed_daily(self):
        raw = pd.DataFrame({'Open': [100., 101.], 'High': [102., 103.], 'Low': [99., 100.],
                            'Close': [101., float('nan')], 'Volume': [1000., 1200.]},
                           index=pd.to_datetime(['2026-10-09', '2026-10-12']))
        raw.attrs.update(source='yfinance', adjustment_basis='provider_ohlc_auto_adjust_false', request={'period':'10y'})
        day = raw.iloc[-1:].copy(); day['Close'] = 102.
        at = datetime(2026,10,12,21,tzinfo=timezone.utc)
        with patch.object(server,'fetch_completed_daily_tail',return_value=day) as fetch:
            result = server.recover_latest_completed_daily(raw,'TEST',at)
        self.assertEqual(result['Close'].tolist(),[101.,102.])
        self.assertEqual(result.attrs['request']['tail_recovery']['date'],'2026-10-12')
        self.assertEqual(validation.validate_us_daily_frame(result)[1]['rejected_rows'],0)
        fetch.assert_called_once_with('TEST')
        revised=day.copy();revised['Low']=98.;revised['Volume']=1250.
        with patch.object(server,'fetch_completed_daily_tail',return_value=revised):
            final=server.recover_latest_completed_daily(raw,'TEST',at)
            self.assertEqual(final.iloc[-1]['Low'],98.)
            self.assertEqual(final.iloc[-1]['Volume'],1250.,'replace a rejected provisional row with a whole real final Daily candle')
        for invalid in ('missing_close','missing_volume','bad_envelope','wrong_date'):
            candidate=day.copy()
            if invalid=='missing_close': candidate['Close']=float('nan')
            if invalid=='missing_volume': candidate['Volume']=float('nan')
            if invalid=='bad_envelope': candidate['High']=100.
            if invalid=='wrong_date': candidate.index=pd.to_datetime(['2026-10-09'])
            with patch.object(server,'fetch_completed_daily_tail',return_value=candidate):
                self.assertIs(server.recover_latest_completed_daily(raw,'TEST',at),raw,invalid)
        with patch.object(server,'fetch_completed_daily_tail') as fetch:
            self.assertIs(server.recover_latest_completed_daily(raw,'TEST',datetime(2026,10,12,19,tzinfo=timezone.utc)),raw)
            fetch.assert_not_called()

    def test_benchmark_cache_checks_completed_session_not_cache_write_time(self):
        at = datetime(2026, 10, 12, 21, tzinfo=timezone.utc)
        h = {'timestamps':['2026-10-09'], 'completed':[True], 'bar_end_timestamps':['2026-10-09T20:00:00Z'],
             'source_validation_version':server.SOURCE_VALIDATION_VERSION,
             'adjustment_basis':'provider_ohlc_auto_adjust_false'}
        def payload(history):
            return {'market_context':{'vix':{'value':18},
                'benchmark_history':{name:history for name in ('spy','qqq')},
                'equity_trend':{name:{'value':100,'change_60d_pct':1,'change_120d_pct':2} for name in ('spy','qqq')}}}
        old = payload(h)
        current = payload({**h, 'timestamps':['2026-10-09','2026-10-12'], 'completed':[True,True], 'bar_end_timestamps':['2026-10-09T20:00:00Z','2026-10-12T20:00:00Z']})
        self.assertFalse(server.market_context_has_current_benchmarks(old,at))
        self.assertTrue(server.market_context_has_current_benchmarks(current,at))
        self.assertTrue(server.market_context_has_current_benchmarks(old,datetime(2026,10,12,19,tzinfo=timezone.utc)), 'prior close is current before session close')
        self.assertFalse(server.market_context_has_current_benchmarks(payload({**h,'timestamps':['2026-10-12'],'completed':[False]}),at))
        self.assertFalse(server.market_context_has_current_benchmarks(payload({**h,'timestamps':['2026-10-12'],'bar_end_timestamps':[]}),at))
        self.assertFalse(server.market_context_has_current_benchmarks(payload({**h,'timestamps':['2026-10-12'],'bar_end_timestamps':['2026-10-13T20:00:00Z']}),at))
        check = server.market_context_has_current_benchmarks
        with patch.object(server,'MARKET_CONTEXT_CACHE',{'value':current,'expiresAt':server.time.time()+3600}), \
             patch.object(server,'market_context_has_current_benchmarks',side_effect=lambda p:check(p,at)), \
             patch.object(server,'_run_with_timeout') as fetch:
            self.assertIs(server._get_market_context_cached_snapshot(allow_live=True)[0],current)
            fetch.assert_not_called()
        for layer in ('memory','disk'):
            with self.subTest(layer=layer), patch.object(server,'MARKET_CONTEXT_CACHE',{'value':old if layer=='memory' else None,'expiresAt':server.time.time()+3600}), \
                 patch.object(server,'read_market_context_cache',return_value={'payload':old,'cache_age_seconds':0}), \
                 patch.object(server,'market_context_has_current_benchmarks',side_effect=lambda p:check(p,at)), \
                 patch.object(server,'_run_with_timeout',return_value=current) as fetch, \
                 patch.object(server,'write_market_context_cache',return_value='2026-10-12T21:00:00Z'):
                result, meta=server._get_market_context_cached_snapshot(allow_live=True)
                self.assertIs(result,current); self.assertFalse(meta['cache_used']); fetch.assert_called_once()
        with patch.object(server,'MARKET_CONTEXT_CACHE',{'value':old,'expiresAt':server.time.time()+3600}), \
             patch.object(server,'_run_with_timeout') as fetch:
            self.assertIs(server._get_market_context_cached_snapshot(allow_live=False)[0],old)
            fetch.assert_not_called()

    def test_full_transaction_forces_shared_market_only_on_refresh_batch(self):
        for force, auto, first, expected in ((True,False,True,True),(False,True,True,True),(True,False,False,False),(False,False,True,False)):
            with self.subTest(force=force,auto=auto,first=first), patch.object(server,'get_market_context_cached_snapshot',return_value=({},{})) as market:
                server.build_market_data_payload([],force=force,auto_refresh=auto,refresh_market_context=first)
                self.assertEqual(market.call_args.kwargs['force'],expected)
                self.assertEqual(market.call_args.kwargs['allow_live'],expected)

    def test_rejection_dates_are_bounded_and_preserved_across_validation(self):
        raw=pd.DataFrame({'Open':[100.,101.],'High':[102.,103.],'Low':[99.,100.],'Close':[101.,float('nan')],'Volume':[1000.,1200.]},index=pd.to_datetime(['2026-10-09','2026-10-12']))
        clean,audit=validation.validate_us_daily_frame(raw)
        self.assertEqual(audit['rejected_samples'],[{'date':'2026-10-12','reason':'missing_or_nonfinite_ohlcv'}])
        self.assertEqual(validation.validate_us_daily_frame(clean)[1],audit)

    def test_incremental_tail_recovery_preserves_seed_without_ten_year_redownload(self):
        seed=pd.DataFrame({'Open':100.,'High':102.,'Low':99.,'Close':101.,'Volume':1000.},index=pd.bdate_range('2026-10-01','2026-10-09'))
        cached={'lookback':'10y','source':'yfinance','adjustment_basis':'provider_ohlc_auto_adjust_false','timestamps':[x.date().isoformat() for x in seed.index],**{out:seed[field].tolist() for field,out in [('Open','opens'),('High','highs'),('Low','lows'),('Close','closes'),('Volume','volumes')]}}
        recent=pd.concat([seed.loc['2026-10-05':],pd.DataFrame({'Open':[100.],'High':[102.],'Low':[99.],'Close':[float('nan')],'Volume':[1000.]},index=pd.to_datetime(['2026-10-12']))])
        final=recent.iloc[-1:].copy();final['Close']=101.
        class Instrument:
            def history(self,**kwargs):return recent.copy()
        recover=server.recover_latest_completed_daily
        for succeeds in (True,False):
            with patch.object(server,'read_market_cache',return_value={'quote':{'history':cached}}),patch.object(server,'recover_latest_completed_daily',side_effect=lambda f,s:recover(f,s,datetime(2026,10,12,21,tzinfo=timezone.utc))),patch.object(server,'fetch_completed_daily_tail',return_value=final if succeeds else pd.DataFrame()) as tail,patch.object(server,'load_yfinance_history_frame') as backfill:
                merged=server.load_incremental_daily_history(Instrument(),'TEST','TEST')
                tail.assert_called_once();backfill.assert_not_called()
                self.assertEqual(len(merged),len(seed)+(1 if succeeds else 0))
                self.assertEqual(merged.attrs['validation']['rejected_rows'],0 if succeeds else 1)
                if not succeeds:self.assertEqual(merged.attrs['validation']['rejected_samples'][0]['date'],'2026-10-12')

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
            self.assertEqual(len(payload['completed']), len(validation.validate_us_daily_frame(raw)[0]))
            self.assertEqual(payload['closes'], [100.] * len(payload['completed']))
        self.assertEqual(validation.exchange_calendar.cache_info().misses, 1,
                         'one shared calendar, instead of rebuilding all eleven years for every ticker')

    def test_shared_calendar_preserves_holidays_half_days_and_older_date_fallback(self):
        calendar = validation.exchange_calendar(2026)
        self.assertIsNone(validation.session(datetime(2026, 4, 3).date(), calendar=calendar))
        half_day = validation.session(datetime(2026, 11, 27).date(), calendar=calendar)
        self.assertEqual(half_day['close'].isoformat(), '2026-11-27T18:00:00+00:00')
        old = datetime(2000, 1, 3).date()
        self.assertEqual(validation.session(old, calendar=calendar), validation.session(old))

    def test_server_schedule_uses_fixed_et_10_and_40_including_dst(self):
        cases = [
            ('2026-10-04T13:00:00+00:00', '2026-10-04T13:10:00+00:00'),
            ('2026-10-04T13:09:59.999+00:00', '2026-10-04T13:10:00+00:00'),
            ('2026-10-04T13:10:00+00:00', '2026-10-04T13:40:00+00:00'),
            ('2026-10-04T13:39:59.999+00:00', '2026-10-04T13:40:00+00:00'),
            ('2026-10-04T13:40:00+00:00', '2026-10-04T14:10:00+00:00'),
            ('2026-10-04T13:45:00+00:00', '2026-10-04T14:10:00+00:00'),
            ('2026-10-05T03:59:59.999+00:00', '2026-10-05T04:10:00+00:00'),
            ('2026-01-04T14:39:00+00:00', '2026-01-04T14:40:00+00:00'),
            ('2026-11-01T05:40:00+00:00', '2026-11-01T06:10:00+00:00'),
            ('2026-11-01T05:50:00+00:00', '2026-11-01T06:10:00+00:00'),
            ('2026-11-01T06:10:00+00:00', '2026-11-01T06:40:00+00:00'),
            ('2026-03-08T06:40:00+00:00', '2026-03-08T07:10:00+00:00'),
            ('2026-03-08T06:50:00+00:00', '2026-03-08T07:10:00+00:00'),
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
        self.assertNotIn('intervals', quote['history'])
        self.assertFalse(pending.cancelled(), 'timeout must not release or restart running work')

    def test_undated_future_or_older_quote_cannot_borrow_history_timestamp(self):
        for stamp in (None, int(datetime(2029,1,1,tzinfo=timezone.utc).timestamp()), int(datetime(2026,9,30,20,tzinfo=timezone.utc).timestamp())):
            metadata=Future()
            metadata.set_result(({'regularMarketPrice':999,'regularMarketTime':stamp}, {}, {}, {}, False))
            quote=self.quote_with_metadata_future(metadata)
            self.assertEqual(quote['price'],101)
            self.assertEqual(quote['updatedAt'],'2026-10-01T20:00:00Z')
            self.assertEqual(quote['metadata']['historyBasisAlignment'],'same_history_source')

    def test_unverified_stooq_is_not_an_automatic_daily_price_replacement(self):
        class Missing:
            def history(self, **kwargs):
                return pd.DataFrame()
        with patch.object(server.yf,'download',return_value=pd.DataFrame()), patch.object(server,'fetch_yahoo_chart_frame',return_value=pd.DataFrame()), patch.object(server,'fetch_stooq_chart_frame') as stooq:
            self.assertTrue(server.load_yfinance_history_frame(Missing(),'TEST',period='10y').empty)
            stooq.assert_not_called()

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
        self.assertEqual(result['refresh_status']['refresh_minutes'], [10, 40])
        self.assertEqual(result['refresh_status']['refresh_interval_minutes'], 30)


if __name__ == '__main__': unittest.main()
