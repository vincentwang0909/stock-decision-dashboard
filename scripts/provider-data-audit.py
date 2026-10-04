#!/usr/bin/env python3
"""Read-only, bounded provider capability/row audit; no production writes."""
import argparse
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
import json
import os
import warnings
from pathlib import Path
import sys
import time

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from market_data_validation import validate_frame


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--output', required=True)
    parser.add_argument('--raw-dir', required=True)
    parser.add_argument('--watchlist-db', default=str(ROOT / 'data' / 'watchlist.db'), help='Read-only current active watchlist; never infer symbols from caches or history.')
    args = parser.parse_args()
    import yfinance as yf
    from curl_cffi import requests
    raw_dir = Path(args.raw_dir)
    raw_dir.mkdir(parents=True, exist_ok=True)
    import sqlite3
    connection = sqlite3.connect(f"file:{Path(args.watchlist_db).resolve()}?mode=ro", uri=True)
    symbols = [row[0] for row in connection.execute("SELECT ticker FROM watchlist ORDER BY id")]
    connection.close()
    cases = [(symbol, interval, period) for symbol in symbols for interval, period in [('1d', '10y'), ('1h', '365d'), ('4h', '365d')]]
    for key in ("BACKGROUND_MARKET_REFRESH_ENABLED", "EOD_HISTORY_ENABLED", "COMPANY_PROFILE_REVIEW_ENABLED"):
        os.environ[key] = "false"
    warnings.filterwarnings("ignore", category=DeprecationWarning)
    from server import _history_payload, native_four_hour_history_payload

    def probe(case):
        symbol, interval, period = case
        started = time.monotonic()
        as_of = datetime.now(timezone.utc).isoformat()
        audit = {'ticker': symbol, 'interval': interval, 'requested_period': period, 'source': 'yfinance', 'version': yf.__version__, 'as_of': as_of, 'adjustment_basis': 'auto_adjust=False', 'native_requested': True}
        try:
            session = requests.Session(impersonate='chrome')
            instrument = yf.Ticker(symbol, session=session)
            frame = instrument.history(period=period, interval=interval, auto_adjust=False, prepost=False, timeout=5, raise_errors=True)
            metadata = {key: instrument.history_metadata.get(key) for key in ['dataGranularity', 'exchangeTimezoneName', 'currency', 'regularMarketTime', 'regularMarketPrice', 'previousClose', 'chartPreviousClose', 'range']}
            if interval == '4h' and (metadata.get('dataGranularity') != '4h' or metadata.get('exchangeTimezoneName') != 'America/New_York'):
                raise ValueError('Unverified native 4H provider provenance')
            clean, validation = validate_frame(frame)
            audit.update(validation=validation, returned_bars=len(frame), valid_bars=len(clean), first_timestamp=str(clean.index[0]) if len(clean) else None, last_timestamp=str(clean.index[-1]) if len(clean) else None, provider_metadata=metadata)
            if len(clean):
                frame.attrs.update({'source': 'yfinance', 'adjustment_basis': 'provider_ohlc_auto_adjust_false', 'request': {'period': period, 'interval': interval, 'prepost': False, 'auto_adjust': False}})
                if interval == '4h':
                    payload = native_four_hour_history_payload(frame, metadata=metadata)
                else:
                    payload = _history_payload(frame, timestamp_format='%Y-%m-%d' if interval == '1d' else '%Y-%m-%dT%H:%M:%S%z')
                payload['lookback'] = period
                payload['provider_metadata'] = metadata
                payload['currency'] = metadata.get('currency')
                payload['bar_method'] = 'provider_native_v1' if interval == '4h' and metadata.get('dataGranularity') == '4h' else 'provider_interval'
                output_file = raw_dir / f'{symbol}-{interval}-{period}.json'
                output_file.write_text(json.dumps(payload, allow_nan=False), encoding='utf8')
                audit['raw_file'] = str(output_file)
            session.close()
        except Exception as error:
            audit['status'] = 'source_unavailable'
            audit['error'] = str(error)[:1500]
        audit['seconds'] = round(time.monotonic() - started, 3)
        return audit
    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(probe, cases))
    output = {'read_only': True, 'max_concurrency': 2, 'source_retries': 0, 'cases': results}
    Path(args.output).write_text(json.dumps(output, indent=2, default=str), encoding='utf8')
    print(json.dumps({'cases': len(results), 'returned': sum(bool(case.get('valid_bars')) for case in results), 'output': args.output}))


if __name__ == '__main__':
    main()
