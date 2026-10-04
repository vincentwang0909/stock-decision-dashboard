import importlib.util
import re
from pathlib import Path
import threading
import time
import unittest
from unittest.mock import patch
from concurrent.futures import TimeoutError as FutureTimeoutError
import pandas as pd
from server_resources import BoundedTaskPool, BoundedTTLCache, ApplyToken, TaskBudgetExceeded
from market_data_validation import validate_frame, validate_us_daily_frame, completed_week_metadata, session
from datetime import date, datetime, timezone


class ResourcesAndDataTests(unittest.TestCase):
    def test_unified_model_health_and_real_api_serializer_keep_wire_contract(self):
        import server
        node = server.eod_history_node_executable()
        if not node:
            self.skipTest('Node is required for the production Decision API')
        source = (Path(server.ROOT) / 'decision-engine' / 'config.js').read_text()
        expected = re.search(r'^\s*version:\s*"([^"]+)"', source, re.MULTILINE).group(1)
        self.assertEqual(server.DECISION_MODEL_VERSION, expected)
        self.assertTrue(Path(server.DECISION_NODE_RUNNER).is_file())
        self.assertEqual(Path(server.DECISION_NODE_RUNNER).parent.name, 'decision-api')
        quote = {'ticker': 'MODEL', 'price': None, 'quote_status': 'unavailable',
                 'history': {'timestamps': [], 'closes': [], 'availability': 'unavailable'},
                 'metadata': {'quoteType': 'EQUITY'}}
        with patch.object(server, 'CACHE', {}), \
             patch.object(server, 'get_lightweight_market_context', return_value={}), \
             patch.object(server, 'read_market_cache', return_value={'quote': quote}), \
             patch.object(server, 'normalize_cached_market_quote', return_value=quote), \
             patch.object(server, 'is_market_cache_fresh', return_value=True), \
             patch.object(server, 'eod_history_node_executable', return_value=node):
            response = server.app.test_client().get('/api/decision/model')
            self.assertEqual(response.status_code, 200, response.get_json())
            payload = response.get_json()
            self.assertEqual(payload['contractVersion'], 'decision.v1')
            self.assertEqual(payload['modelVersion'], expected)
            self.assertEqual(set(payload['horizons']), {'short', 'mid', 'long'})

    def test_full_refresh_receipt_is_live_even_when_serialized_from_disk(self):
        import server
        payload={"success":True,"refresh_status":{"is_cache_only":True,"used_cache_count":2,"cache_only_tickers":["A","B"]}}
        summary={"completed":True,"completed_at":"2026-10-01T20:30:00Z","batch_count":1,"success_count":2,"live_success_tickers":["A","B"]}
        server.apply_full_refresh_status(payload,summary,["A","B"],True)
        receipt=payload["refresh_status"]
        self.assertFalse(receipt["is_cache_only"])
        self.assertEqual(receipt["used_cache_count"],0)
        self.assertEqual(receipt["cache_only_tickers"],[])
        self.assertEqual(receipt["force_requested_tickers"],["A","B"])
        self.assertEqual(receipt["last_successful_live_refresh_at"],summary["completed_at"])
        server.apply_full_refresh_status(payload,{"completed":True,"cache_fallback_count":2},["A","B"])
        self.assertFalse(payload["success"])
        self.assertFalse(receipt["full_refresh_completed"])

    def test_timeouts_do_not_free_running_budget_and_duplicate_shares(self):
        gate = threading.Event()
        pool = BoundedTaskPool('test', 1, 1)
        first = pool.submit('same', lambda: gate.wait(1))
        self.assertIs(first, pool.submit('same', lambda: None))
        with self.assertRaises(FutureTimeoutError):
            first.result(timeout=0.001)
        second = pool.submit('second', lambda: True)
        with self.assertRaises(TaskBudgetExceeded):
            pool.submit('third', lambda: True)
        self.assertEqual(pool.snapshot()['in_flight'], 2)
        gate.set()
        self.assertTrue(first.result(timeout=1))
        self.assertTrue(second.result(timeout=1))
        self.assertTrue(pool.drain(1))
        pool.shutdown()

    def test_caches_expire_evict_and_respect_active_universe(self):
        cache = BoundedTTLCache(2, 200)
        for key in ['A','B','C']:
            cache[key] = {'expiresAt': time.time()+60,'value':key}
        self.assertEqual(len(cache),2)
        cache.purge(allowed={'C'})
        self.assertEqual(list(cache),['C'])
        cache['large']={'expiresAt':time.time()+60,'value':'x'*300}
        self.assertNotIn('large',cache)
        cache.purge(now=time.time()+61)
        self.assertEqual(len(cache),0)

    def test_generation_and_abandoned_waiter_cannot_apply(self):
        token=ApplyToken(1,lambda:2)
        self.assertFalse(token.valid)
        token=ApplyToken(2,lambda:2)
        self.assertTrue(token.valid)
        token.abandon()
        self.assertFalse(token.valid)

    def test_aligned_bad_ohlcv_rejection(self):
        frame=pd.DataFrame({'Open':[1,2,3,4],'High':[2,3,4,5],'Low':[.5,1,2,3],'Close':[1,9,3,4],'Volume':[0,5,-1,10]},index=pd.to_datetime(['2026-09-28','2026-09-29','2026-09-30','2026-09-28']))
        clean,audit=validate_frame(frame)
        self.assertEqual(len(clean),1)
        self.assertEqual(clean.iloc[0]['Volume'],0)
        self.assertEqual(audit['rejected_rows'],3)
        self.assertEqual(set(audit['reasons']),{'ohlc_envelope','negative_volume','duplicate_or_unordered_timestamp'})

    def test_daily_source_rejects_closed_and_intraday_duplicate_sessions(self):
        frame=pd.DataFrame({'Open':[100.]*4,'High':[101.]*4,'Low':[99.]*4,'Close':[100.]*4,'Volume':[0]*4},index=pd.to_datetime(['2026-04-02 10:00','2026-04-02 11:00','2026-04-03 00:00','2026-04-06 00:00']))
        clean,audit=validate_us_daily_frame(frame)
        self.assertEqual(len(clean),1)
        self.assertEqual(audit['reasons']['multiple_bars_in_daily_session'],2)
        self.assertEqual(audit['reasons']['exchange_closed_daily_bar'],1)

    def test_completed_week_friday_intraday_good_friday_and_missing_session(self):
        # Good Friday 2026 is closed: Thursday is this week's completed last session.
        frame=pd.DataFrame(index=pd.to_datetime(['2026-03-30','2026-03-31','2026-04-01','2026-04-02']))
        self.assertEqual(completed_week_metadata(frame,datetime(2026,4,2,21,tzinfo=timezone.utc))['completed_week_keys'],['2026-03-30'])
        friday=pd.DataFrame(index=pd.to_datetime(['2026-03-23','2026-03-24','2026-03-25','2026-03-26','2026-03-27']))
        self.assertEqual(completed_week_metadata(friday,datetime(2026,3,27,19,tzinfo=timezone.utc))['completed_week_keys'],[])
        self.assertEqual(completed_week_metadata(friday,datetime(2026,3,27,21,tzinfo=timezone.utc))['completed_week_keys'],['2026-03-23'])
        self.assertEqual(completed_week_metadata(friday.iloc[1:],datetime(2026,3,27,21,tzinfo=timezone.utc))['completed_week_keys'],[])
        self.assertEqual(session(date(2025,11,28))['close'].hour,18) # 13:00 EST, DST safe.

    def test_quote_singleflight_cannot_publish_earlier_generation(self):
        import server
        gate=threading.Event()
        calls=[]
        def work(*args, **kwargs):
            calls.append(1)
            gate.wait(1)
            return {'price':100}
        try:
            with patch.object(server,'fetch_quote',side_effect=work):
                server.TASK_CONTEXT.refresh_generation=server.start_refresh_generation()
                with self.assertRaises(TimeoutError):server.fetch_quote_with_timeout('TEST-SINGLEFLIGHT',timeout_seconds=.005)
                server.TASK_CONTEXT.refresh_generation=server.start_refresh_generation()
                release=threading.Timer(.03,gate.set);release.start()
                with self.assertRaisesRegex(RuntimeError,'earlier refresh generation'):
                    server.fetch_quote_with_timeout('TEST-SINGLEFLIGHT',timeout_seconds=.5)
                release.join()
                self.assertEqual(len(calls),1)
        finally:
            gate.set();server.TASK_CONTEXT.refresh_generation=None
            server.QUOTE_TASKS.drain(1)

    def test_native_four_hour_dst_tail_and_unordered_source(self):
        import server
        stamps=pd.to_datetime(['2026-03-06 09:30','2026-03-06 13:30','2026-03-09 09:30','2026-03-09 13:30']).tz_localize('America/New_York')
        frame=pd.DataFrame({'Open':[100.]*4,'High':[101.]*4,'Low':[99.]*4,'Close':[100.]*4,'Volume':[0]*4},index=stamps)
        result=server.validate_native_four_hour_history_frame(frame,datetime(2026,3,10,tzinfo=timezone.utc))
        self.assertEqual(len(result['frame']),4)
        self.assertEqual([x['duration_minutes'] for x in result['bar_segments']],[240,150,240,150])
        self.assertEqual(stamps[0].tz_convert('UTC').hour,14)
        self.assertEqual(stamps[2].tz_convert('UTC').hour,13)
        unordered=server.validate_native_four_hour_history_frame(frame.iloc[[2,3,0,1]],datetime(2026,3,10,tzinfo=timezone.utc))
        self.assertEqual(len(unordered['frame']),2)
        self.assertIn('duplicate_or_unordered_timestamp',unordered['rejected_reasons'])
        active=server.validate_native_four_hour_history_frame(frame.iloc[[2]],datetime(2026,3,9,15,tzinfo=timezone.utc))
        self.assertEqual(len(active['frame']),1)
        self.assertFalse(active['bar_segments'][0]['completed'])

    def test_expired_controller_never_writes_cache(self):
        import server
        token=ApplyToken(server.current_refresh_generation(),server.current_refresh_generation);token.abandon()
        server.TASK_CONTEXT.apply_token=token
        try:
            with patch.object(server,'read_market_cache',return_value=None),patch.object(server,'fetch_quote_with_timeout',return_value={'price':100,'history':{}}),patch.object(server,'write_market_cache') as write:
                quote,_failure,_cached,attempts=server.fetch_market_quote_for_ticker('TEST-LATE',force=True)
                write.assert_not_called()
                self.assertEqual(quote['quote_status'],'unavailable')
                self.assertIn('Late provider result',attempts[-1]['error'])
        finally:server.TASK_CONTEXT.apply_token=None

    def test_incremental_overlap_preserves_seed_and_rebases_corporate_action(self):
        import server
        frame=pd.DataFrame({'Open':[10.,11.,12.,13.],'High':[11.,12.,13.,14.],'Low':[9.,10.,11.,12.],'Close':[10.,11.,12.,13.],'Volume':[10,20,30,40]},index=pd.to_datetime(['2026-09-28','2026-09-29','2026-09-30','2026-10-01']))
        old=frame.iloc[:3]
        history={'lookback':server.TECHNICAL_DAILY_HISTORY_PERIOD,'source':'yfinance','adjustment_basis':'provider_ohlc_auto_adjust_false','timestamps':[str(x.date()) for x in old.index],**{key:old[column].tolist() for key,column in [('opens','Open'),('highs','High'),('lows','Low'),('closes','Close'),('volumes','Volume')]}}
        class Instrument:
            def history(self,**kw):return frame.iloc[1:].copy()
        with patch.object(server,'read_market_cache',return_value={'quote':{'history':history}}),patch.object(server,'load_yfinance_history_frame',return_value=frame) as backfill:
            merged=server.load_incremental_daily_history(Instrument(),'TEST','TEST')
            self.assertEqual(merged['Close'].tolist(),frame['Close'].tolist());backfill.assert_not_called()
            self.assertEqual(merged.attrs['request']['method'],'incremental_validated_overlap')
            history['closes'][1]=history['closes'][1]/2
            self.assertIs(server.load_incremental_daily_history(Instrument(),'TEST','TEST'),frame)
            backfill.assert_called_once()


if __name__=='__main__':unittest.main()
