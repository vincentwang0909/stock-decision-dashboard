#!/usr/bin/env python3
"""Bounded, isolated whole-service audit; provider simulation by default.

Use the same frozen cache directory for before/after. Fixtures preserve source
bars but are simulated network responses, not a test of live provider accuracy.
Samples sum simultaneous RSS for the Gunicorn master and all descendants.
Linux additionally reports cgroup current/peak/limit and per-process PSS.
Explicit --live-provider runs one read-only real full refresh and EOD.
"""
import argparse
import concurrent.futures
import json
import os
from pathlib import Path
import shutil
import socket
import sqlite3
import subprocess
import sys
import tempfile
import threading
import time
from urllib.request import urlopen
from urllib.error import HTTPError


FIXTURE = r'''
import json, os, time, threading
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo
import server
server.pd._load()
server.yf._load()
app = server.app
fixtures = Path(os.environ['AUDIT_FIXTURES'])
tickers = json.loads((fixtures / 'tickers.json').read_text())
market = json.loads((fixtures / 'market.json').read_text())
slow = False
active = 0
peak_active = 0
count = 0
lock = threading.Lock()
def quote(ticker, include_options=False):
    global active, peak_active, count
    with lock:
        active += 1
        count += 1
        peak_active = max(peak_active, active)
    try:
        time.sleep(1.0 if slow else 0.01)
        return json.loads((fixtures / (ticker + '.json')).read_text())
    finally:
        with lock:
            active -= 1
if os.environ.get("AUDIT_LIVE_PROVIDER") != "1":
    server.fetch_quote = quote
    server.get_market_context_cached_snapshot = lambda **kw: (market, {})
    server.ensure_company_profiles_for_quotes = lambda quotes, **kw: quotes
@app.route('/__audit/status')
def status():
    resource = server.resource_snapshot() if hasattr(server, 'resource_snapshot') else {}
    return {'threads': threading.active_count(), 'active': active, 'peak_active': peak_active,
            'fetches': count, 'cache_entries': len(server.CACHE), 'resources': resource}
@app.route('/__audit/timeout')
def timeout():
    global slow
    slow = True
    failures = 0
    for i in range(32):
        try:
            server.fetch_quote_with_timeout(tickers[i % len(tickers)], timeout_seconds=0.005)
        except Exception:
            failures += 1
    return {'failures': failures, 'threads': threading.active_count(), 'active': active}
@app.route('/__audit/recover')
def recover():
    global slow
    slow = False
    return status()
@app.route('/__audit/eod')
def eod():
    date = json.loads((fixtures / (tickers[0] + '.json')).read_text())['history']['timestamps'][-1][:10]
    now = datetime.fromisoformat(date).replace(hour=16, minute=30, tzinfo=ZoneInfo('America/New_York'))
    return server.run_eod_history_once(now=now, reason='isolated_memory_audit')
'''


def process_sample(root_pid):
    listing = subprocess.check_output(['ps', '-axo', 'pid=,ppid=,rss='], text=True)
    rows = [tuple(map(int, line.split())) for line in listing.splitlines() if len(line.split()) == 3]
    members = {root_pid}
    for _ in range(8):
        expanded = members | {pid for pid, parent, _ in rows if parent in members}
        if expanded == members:
            break
        members = expanded
    processes = []
    for pid, _parent, rss in rows:
        if pid not in members:
            continue
        pss = None
        try:
            pss = sum(int(line.split()[1]) for line in Path(f'/proc/{pid}/smaps_rollup').read_text().splitlines() if line.startswith('Pss:')) * 1024
        except OSError:
            pass
        processes.append({'pid': pid, 'rss_bytes': rss * 1024, 'pss_bytes': pss})
    cgroup = {}
    cgroup_directory = Path('/sys/fs/cgroup')
    try:
        relative=next(line.split(':',2)[2] for line in Path(f'/proc/{root_pid}/cgroup').read_text().splitlines() if line.startswith('0::'))
        resolved=cgroup_directory/relative.lstrip('/')
        if (resolved/'memory.current').exists():cgroup_directory=resolved
    except (OSError,StopIteration):pass
    for name in ('memory.current', 'memory.peak', 'memory.max'):
        try:
            cgroup[name] = (cgroup_directory/name).read_text().strip()
        except OSError:
            cgroup[name] = None
    return {'time': time.monotonic(), 'rss_bytes': sum(p['rss_bytes'] for p in processes), 'processes': processes, 'cgroup': cgroup}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--repo', type=Path, default=Path(__file__).resolve().parent.parent)
    parser.add_argument('--cache', type=Path, required=True)
    parser.add_argument('--watchlist', type=Path, required=True)
    parser.add_argument('--count', type=int, default=22)
    parser.add_argument('--node', required=True)
    parser.add_argument('--live-provider', action='store_true', help='one read-only live full refresh, then shared-generation EOD; no timeout fault flood')
    parser.add_argument('--repeats', type=int, default=5)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    with tempfile.TemporaryDirectory(prefix='stock-service-audit-') as temp:
        directory = Path(temp)
        fixtures = directory / 'fixtures'
        fixtures.mkdir()
        conn = sqlite3.connect(f'file:{args.watchlist}?mode=ro', uri=True)
        tickers = [r[0] for r in conn.execute('select ticker from watchlist order by id')]
        conn.close()
        source_files = list((args.cache / 'quotes').glob('*.json'))
        source_by_ticker = {p.stem.upper(): p for p in source_files}
        seeds = [t for t in tickers if t in source_by_ticker]
        while len(tickers) < args.count:
            tickers.append(f'AUDIT{len(tickers):02}')
        tickers = tickers[:args.count]
        for i, ticker in enumerate(tickers):
            item = json.loads(source_by_ticker.get(ticker, source_by_ticker[seeds[i % len(seeds)]]).read_text())
            quote = item.get('quote', item)
            quote.update({'ticker': ticker, 'stale': False, 'dataStaleness': 'fresh'})
            (fixtures / f'{ticker}.json').write_text(json.dumps(quote))
        (fixtures / 'tickers.json').write_text(json.dumps(tickers))
        market_file = next((args.cache / 'market_context').glob('*.json'))
        market = json.loads(market_file.read_text())
        (fixtures / 'market.json').write_text(json.dumps(market.get('payload', market.get('value', market))))
        db = directory / 'watchlist.db'
        conn = sqlite3.connect(db)
        conn.execute('create table watchlist(id integer primary key autoincrement,ticker text unique,market_type text,created_at text)')
        conn.executemany('insert into watchlist(ticker,market_type,created_at) values(?,?,?)', [(t, 'US', '2026-01-01') for t in tickers])
        conn.commit()
        conn.close()
        (directory / 'audit_service.py').write_text(FIXTURE)
        with socket.socket() as sock:
            sock.bind(('127.0.0.1', 0))
            port = sock.getsockname()[1]
        env = dict(os.environ, PYTHONPATH=str(args.repo.resolve()), AUDIT_FIXTURES=str(fixtures),
                   WATCHLIST_DB_PATH=str(db), MARKET_CACHE_DIR=str(directory / 'cache'),
                   DECISION_HISTORY_DB_PATH=str(directory / 'history.sqlite'), EOD_DECISION_NODE_PATH=args.node,
                   BACKGROUND_MARKET_REFRESH_ENABLED='false', EOD_HISTORY_ENABLED='false', COMPANY_PROFILE_REVIEW_ENABLED='false',
                   AUDIT_LIVE_PROVIDER='1' if args.live_provider else '0', RESOURCE_METRICS_ENABLED='true')
        log = (directory / 'service.log').open('w')
        process = subprocess.Popen([sys.executable, '-m', 'gunicorn', '--workers', '1', '--threads', '2', '--timeout', '120', '--bind', f'127.0.0.1:{port}', 'audit_service:app'], cwd=directory, env=env, stdout=log, stderr=log)
        phase = 'startup'
        samples = []
        stop = threading.Event()
        def monitor():
            while not stop.is_set():
                samples.append({'phase': phase, **process_sample(process.pid)})
                stop.wait(0.05)
        sampler = threading.Thread(target=monitor)
        sampler.start()
        base = f'http://127.0.0.1:{port}'
        def get(route):
            started=time.monotonic()
            try:
                response = urlopen(base + route, timeout=120)
            except HTTPError as error:
                response = error
            with response:
                data = response.read()
                try:
                    body = json.loads(data)
                except ValueError:
                    body = {'error': data[:400].decode('utf8', errors='replace')}
                return {'status': response.status, 'bytes': len(data), 'request_body_bytes':0,'seconds':round(time.monotonic()-started,3),'body': body}
        outputs = {}
        try:
            deadline = time.monotonic() + 30
            while True:
                try:
                    outputs['startup'] = get('/__audit/status')
                    break
                except Exception:
                    if process.poll() is not None or time.monotonic() >= deadline:
                        raise RuntimeError('service startup failed')
                    time.sleep(0.1)
            phase = 'idle'
            time.sleep(0.5)
            phase = 'full_refresh'
            outputs['refresh'] = get('/api/market-data?force=true&full_refresh=true&format=compact')
            # Keep compact results, not a second complete response between runs.
            outputs['refresh']['body'] = outputs['refresh']['body'].get('refresh_status')
            phase = 'continuous_refresh'
            outputs['repeated'] = []
            for _ in range(0 if args.live_provider else max(0,min(30,args.repeats))):
                result = get('/api/market-data?force=true&full_refresh=true&format=compact')
                outputs['repeated'].append({'bytes': result['bytes'], 'status': get('/__audit/status')['body'], 'service_rss_bytes':process_sample(process.pid)['rss_bytes']})
                del result
            phase = 'timeout_residual'
            outputs['timeout'] = {'skipped': 'live read-only probe avoids synthetic request flood'} if args.live_provider else get('/__audit/timeout')
            time.sleep(1.2)
            outputs['recovery'] = get('/__audit/recover')
            phase = 'eod_with_access'
            with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
                eod = pool.submit(get, '/__audit/eod')
                for _ in range(3):
                    get('/api/market-data?cache_only=1&format=compact')
                outputs['eod'] = eod.result()
            outputs['final'] = get('/__audit/status')
        finally:
            stop.set()
            sampler.join(timeout=5)
            process.terminate()
            try:
                process.wait(timeout=8)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait()
            log.close()
            args.output.parent.mkdir(parents=True, exist_ok=True)
            args.output.with_suffix('.log').write_text((directory / 'service.log').read_text())
        result = {'repo': str(args.repo), 'count': args.count, 'platform': sys.platform,
                  'gunicorn': {'workers': 1, 'threads': 2, 'timeout': 120}, 'simulated_provider': not args.live_provider, 'live_provider': args.live_provider,
                  'live_render_verified': False, 'container_limit_verified': False,
                  'scope': 'simultaneous service process-tree RSS; file-cache charge only where cgroup is available',
                  'outputs': outputs, 'peak_rss_bytes': max(s['rss_bytes'] for s in samples),
                  'phases': {name: {'peak_rss_bytes': max(s['rss_bytes'] for s in samples if s['phase'] == name), 'samples': sum(s['phase'] == name for s in samples)} for name in sorted({s['phase'] for s in samples})},
                  'samples': samples}
        args.output.write_text(json.dumps(result, ensure_ascii=False, indent=2))
        print(json.dumps({k: result[k] for k in ('count', 'peak_rss_bytes', 'phases', 'live_render_verified')}))


if __name__ == '__main__':
    main()
