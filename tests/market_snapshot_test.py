"""Response completeness, bounded writes and web-worker responsiveness."""
import gzip
import importlib.util
import json
from pathlib import Path
import tempfile
import threading
import unittest
from unittest.mock import patch

import server


class MarketSnapshotTests(unittest.TestCase):
    def setUp(self):
        self.patches = [
            patch.object(server, 'active_watchlist_tickers', return_value=['A', 'B', 'C']),
            patch.object(server, 'active_watchlist_requested_tickers', side_effect=lambda tickers: tickers),
            patch.object(server, 'build_market_data_payload', return_value={
                'success': True, 'items': [{'ticker': ticker, 'analysis': {'unused': True}} for ticker in ['A', 'B', 'C']],
                'quotes': {}, 'data': {}, 'refresh_status': {}, 'marketContext': {'source': 'fixture'},
            }),
            patch.object(server, 'read_market_cache', side_effect=lambda ticker: {'quote': {'ticker': ticker, 'price': 100, 'history': {'closes': [100] * 3000}}}),
            patch.object(server, 'normalize_cached_market_quote', side_effect=lambda ticker, cached, **kw: cached['quote']),
            patch.object(server, 'is_market_cache_fresh', return_value=True),
        ]
        for item in self.patches: item.start()
        self.addCleanup(lambda: [item.stop() for item in reversed(self.patches)])

    def test_utf8_chunks_are_bounded_and_exact(self):
        text = '中文' * (server.SNAPSHOT_CHUNK_BYTES + 7)
        chunks = list(server.buffered_snapshot_bytes(iter([text[:7], text[7:]])))
        self.assertTrue(all(0 < len(chunk) <= server.SNAPSHOT_CHUNK_BYTES for chunk in chunks))
        self.assertEqual(b''.join(chunks).decode('utf-8'), text)

    def test_compact_preserves_persistent_profile_from_summary_pass(self):
        profile = {'primaryClassification': 'Banking', 'riskTrait': 'InterestRateSensitive',
                   'lifecycle': 'MatureLeader', 'profileSchemaVersion': '2.1'}
        payload = {'success': True, 'quotes': {'A': {'metadata': {'classification': profile}}},
                   'items': [], 'refresh_status': {}}
        with patch.object(server, 'build_market_data_payload', return_value=payload):
            body = json.loads(''.join(server.iter_market_snapshot_json(['A', 'B'])))
        self.assertEqual(body['quotes']['A']['metadata']['classification'], profile)
        self.assertNotIn('classification', body['quotes']['B'].get('metadata', {}))
        self.assertEqual(len(body['quotes']['A']['history']['closes']), 3000)

    def test_full_watchlist_json_and_gzip_are_identical(self):
        client = server.app.test_client()
        plain = client.get('/api/market-data?format=compact&tickers=A,B,C')
        zipped = client.get('/api/market-data?format=compact&tickers=A,B,C', headers={'Accept-Encoding': 'gzip'})
        self.assertEqual(plain.status_code, 200)
        self.assertEqual(plain.content_length, len(plain.data))
        self.assertEqual(zipped.content_length, len(zipped.data))
        self.assertEqual(zipped.headers['Content-Encoding'], 'gzip')
        self.assertEqual(gzip.decompress(zipped.data), plain.data)
        self.assertEqual(list(plain.get_json()['quotes']), ['A', 'B', 'C'])
        self.assertTrue(all('analysis' not in item for item in plain.get_json()['items']))
        self.assertLess(len(zipped.data), len(plain.data))
        plain.close(); zipped.close()

    def test_standard_contract_keeps_aliases_and_item_analysis_without_full_payload(self):
        response = server.app.test_client().get('/api/market-data?tickers=A,B,C', headers={'Accept-Encoding': 'gzip'})
        self.assertEqual(response.status_code, 200)
        body = json.loads(gzip.decompress(response.data))
        self.assertEqual(body['quotes'], body['data'])
        self.assertEqual([item['ticker'] for item in body['items']], ['A', 'B', 'C'])
        for item in body['items']:
            self.assertEqual(item['analysis'], body['quotes'][item['ticker']])
        self.assertTrue(all(call.kwargs['summary_only'] for call in server.build_market_data_payload.call_args_list))
        response.close()

    def test_slow_reader_has_no_refresh_lock_and_disconnect_closes_file(self):
        spool, _size = server.prepare_market_snapshot(['A', 'B', 'C'])
        stream = server.stream_snapshot_file(spool)
        self.assertTrue(next(stream))
        acquired = []
        def other_transaction():
            taken = server.FULL_REFRESH_RUN_LOCK.acquire(timeout=.1)
            acquired.append(taken)
            if taken: server.FULL_REFRESH_RUN_LOCK.release()
        thread = threading.Thread(target=other_transaction); thread.start(); thread.join()
        self.assertEqual(acquired, [True])
        stream.close()
        self.assertTrue(spool.closed)

    def test_standard_aliases_freeze_dynamic_metadata_and_unicode_once(self):
        calls = []
        def dynamic(ticker, cached, **kwargs):
            calls.append(ticker)
            return {**cached['quote'], 'cache_age_seconds': len(calls), 'name': '中文公司'}
        with patch.object(server, 'normalize_cached_market_quote', side_effect=dynamic):
            body = json.loads(''.join(server.iter_market_snapshot_json(['A', 'B', 'C'], compact=False)))
        self.assertEqual(calls, ['A', 'B', 'C'])
        self.assertEqual(body['quotes'], body['data'])
        for item in body['items']:
            self.assertEqual(item['analysis'], body['quotes'][item['ticker']])

    def test_bad_serialization_returns_complete_error_and_closes_file(self):
        spool = tempfile.TemporaryFile(mode='w+b')
        with patch.object(server.tempfile, 'TemporaryFile', return_value=spool), patch.object(server, 'normalize_cached_market_quote', return_value={'price': float('nan')}), patch.object(server.traceback, 'print_exc'):
            response = server.app.test_client().get('/api/market-data?format=compact&tickers=A')
        self.assertEqual(response.status_code, 500)
        self.assertFalse(response.get_json()['success'])
        self.assertTrue(spool.closed)
        acquired = []
        def take_lock():
            taken = server.FULL_REFRESH_RUN_LOCK.acquire(timeout=.1)
            acquired.append(taken)
            if taken: server.FULL_REFRESH_RUN_LOCK.release()
        thread = threading.Thread(target=take_lock); thread.start(); thread.join()
        self.assertEqual(acquired, [True])

    def test_busy_eod_or_refresh_does_not_block_web_thread(self):
        ready, done = threading.Event(), threading.Event()
        def hold_refresh():
            with server.FULL_REFRESH_RUN_LOCK:
                ready.set(); done.wait(2)
        thread = threading.Thread(target=hold_refresh); thread.start(); ready.wait(1)
        try:
            for format_query in ('&format=compact', ''):
                response = server.app.test_client().get('/api/market-data?force=true&tickers=A,B,C'+format_query)
                self.assertEqual(response.status_code, 503)
                self.assertEqual(response.get_json()['error_code'], 'refresh_in_progress')
                self.assertEqual(response.headers['Retry-After'], '3')
            self.assertEqual(server.app.test_client().get('/api/health').status_code, 200)
        finally: done.set(); thread.join()

    def test_live_compact_keeps_all_batches_and_exact_receipt(self):
        summary = {'completed': True, 'generation': 22, 'success_count': 3, 'batch_count': 2,
                   'live_success_tickers': ['A', 'B', 'C'], 'completed_at': '2026-10-02T20:30:00Z'}
        with patch.object(server, '_refresh_market_cache_for_tickers', return_value=summary) as refresh:
            response = server.app.test_client().get('/api/market-data?format=compact&force=true&full_refresh=true&tickers=A,B,C')
        refresh.assert_called_once_with(['A', 'B', 'C'], reason='api_full_refresh')
        body = response.get_json()
        self.assertEqual(list(body['quotes']), ['A', 'B', 'C'])
        self.assertEqual(body['refresh_status']['full_refresh_success_count'], 3)
        self.assertEqual(body['refresh_status']['refresh_generation'], 22)
        self.assertFalse(body['refresh_status']['is_cache_only'])
        response.close()

    def test_bare_gunicorn_command_loads_safe_defaults(self):
        spec = importlib.util.spec_from_file_location('dashboard_gunicorn', Path(server.ROOT)/'gunicorn.conf.py')
        module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
        self.assertEqual((module.workers, module.threads, module.worker_class, module.timeout), (1, 2, 'gthread', 120))
        self.assertFalse(module.preload_app)
        self.assertTrue(module.control_socket_disable)

    def test_compact_unavailable_quote_keeps_actual_provider_error(self):
        summary = {'completed': True, 'generation': 23, 'success_count': 0,
                   'quote_errors': {'A': 'Provider timed out'}, 'live_failed_tickers': ['A']}
        with patch.object(server, '_refresh_market_cache_for_tickers', return_value=summary), \
             patch.object(server, 'read_market_cache', return_value=None):
            response = server.app.test_client().get('/api/market-data?format=compact&force=true&tickers=A')
        self.assertEqual(response.status_code, 200)
        body = response.get_json()
        self.assertFalse(body['success'])
        self.assertIsNone(body['quotes']['A']['price'])
        self.assertEqual(body['quotes']['A']['error'], 'Provider timed out')
        response.close()

    def test_response_closed_before_first_read_releases_spool(self):
        spool = tempfile.TemporaryFile(mode='w+b')
        spool.write(b'{}'); spool.seek(0)
        with patch.object(server, 'prepare_market_snapshot', return_value=(spool, 2)):
            response = server.app.test_client().get('/api/market-data?format=compact', buffered=False)
        response.close()
        self.assertTrue(spool.closed)


if __name__ == '__main__': unittest.main()
