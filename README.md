# Stock Dashboard Render Deployment

This dashboard uses `server.py` as the single backend. The shared watchlist is stored in a SQLite database on the server, while browser `localStorage` is only used as a fast cache.

## Local Development

The dashboard is a same-origin web application. Start `server.py` and open the
HTTP address it serves; do **not** double-click `index.html` or open it with
`file://`.

```bash
cd "/Users/vincentwang/Documents/Stock Dashboard Project"
python3 -m venv .venv           # first time only
source .venv/bin/activate       # each new terminal session
pip install -r requirements.txt # first time only
python3 server.py
```

The Company Profile classifier and the offline EOD recorder run the same
canonical JavaScript modules as the Dashboard Decision Engine. Ensure
`node --version` works in this terminal. If Node is installed outside `PATH`,
set `EOD_DECISION_NODE_PATH` to its executable before starting the server.

Open:

```text
http://127.0.0.1:4173/
```

`server.py` serves the dashboard HTML, JavaScript, CSS, and API on that one
origin. This is also how the Render deployment works, so local development
does not need CORS configuration or a separate frontend server.

Local watchlist database and market-data cache:

```text
data/watchlist.db
data/cache/
```

Automatic refresh runs **every 30 minutes at :10 and :40 in America/New_York**,
including 09:10, 09:40 and 10:10 ET. The browser and server use the same schedule; manual
refreshes do not shift it. Optional quote/company enrichment has a bounded
wait alongside intraday history. If no valid prices are returned, the browser
keeps its previous successful snapshot and Last Refresh and shows a notice.
Without a `MARKET_CACHE_DIR` override, quote cache lives beside
`WATCHLIST_DB_PATH`; a persistent Render database therefore uses persistent
cache too. The EOD recorder still runs at 16:30 ET.

Multi-year history normalization reuses one calendar for its frame and a
temporary session lookup, preserving the same holiday/half-day and completion
rules. A first visit waits for an already-running full refresh with the live
deadline (extended once on an explicit busy response), displays watchlist
placeholders while warming, and identifies partial price availability.

The three-indicator integration, horizon weights, causal completion rules,
Price State constraints and replay results are documented in
[the current indicator model](docs/indicator-model-2026-10-04.md). New Squeeze,
break/retest and Bollinger+RSI features are shared by the UI and EOD engine.
The separate expansion of structure-based price-zone candidates is disabled
after its offline return-retention check failed.

All stock and ETF horizons are policies of the same unified V2 release.
`decision-engine/decision-engine.js` is the shared entry; stock Short uses
`short-model-v2.js`, and stock Mid/Long plus ETF horizons use
`horizon-model-v2.js` with their preserved rules. No production V1 fallback
remains. `decision-engine/config.js` supplies the single model version.

`decision-api/emit-decision.js` serves the existing external `decision.v1`
data format through this same engine. `/api/decision/<ticker>` and
`/api/decisions?tickers=...` keep their URLs and payload shape. The format
version is independent of `modelVersion`; the old `decision-v1/` directory
has been removed. Dashboard, API, EOD and health metadata identify the same
current model release.

## Render Deployment

1. Push code to GitHub.
2. In Render, create a new Web Service.
3. Connect the GitHub repo.
4. Runtime: Python.
5. Build Command:

```bash
pip install -r requirements.txt
```

6. Start Command:

```bash
gunicorn -c gunicorn.conf.py server:app
```

7. Environment Variables:

```text
WATCHLIST_DB_PATH=/var/data/watchlist.db
MARKET_CACHE_DIR=/var/data/cache
PYTHON_VERSION=3.12.14
NODE_VERSION=24.19.0
```

For an existing Render service, check **Settings → Start Command** and
**Environment** explicitly: editing `render.yaml` alone does not update a
service created manually. The checked-in Gunicorn configuration also loads
with the older `gunicorn server:app` command. It uses one worker, two web
threads, a 120-second worker timeout, and no application preloading. Do not
increase workers on the 512 MB instance. Build with the pinned Python version
and `requirements.txt`; an Environment override takes priority over
`.python-version`.

Startup logs now include the actual Python/dependency versions and effective
worker settings. A native `SIGSEGV` emits a fatal stack trace for diagnosis;
it is not proof of an OOM. `/api/health` must respond during refreshes. Its
`service_version` identifies the deployed service fix. If a worker still
crashes, retain the first fatal stack trace and the preceding startup lines.

8. Health Check Path: `/api/health`.

9. To persist the shared watchlist and market-data cache across redeploys/restarts, add a Render Disk:

```text
Mount Path: /var/data
```

If you do not attach a persistent disk, the default SQLite database and market-data cache can still work, but they may be lost after redeploys or restarts.

## Market Data API

```text
GET /api/market-data?tickers=NVDA,MSFT
GET /api/market-data?tickers=NVDA,MSFT&force=true
GET /api/debug/quote/NVDA
```

`/api/market-data` is cache-first for initial/cache hydration. Manual and scheduled
automatic Dashboard refreshes use the shared full-refresh transaction with
`force=true&full_refresh=true`, which refreshes the complete requested watchlist
before the response is applied. The `_refresh` query string only bypasses browser
cache; it does not force a provider refresh.

The browser uses `format=compact`. This serializes one complete quote at a
time into an anonymous temporary file, with 64 KiB writes and optional gzip
when accepted by the client. Serialization finishes before HTTP headers are
sent, and the refresh lock is released before network delivery. Files close
on completion or disconnect. A concurrent refresh/EOD returns a complete
`503` JSON with `error_code=refresh_in_progress` and `Retry-After: 3`; the
Dashboard retries the same request within a bounded deadline. Failure keeps
the last good Dashboard/Last Refresh and displays a retry message. This
changes transport and availability, not indicators, rules or history rows.

Focused checks for this path:

```bash
python3 -m unittest discover -s tests -p 'market_snapshot_test.py'
node tests/dashboard-network.test.js
```

## Shared Watchlist API

```text
GET    /api/watchlist
POST   /api/watchlist
DELETE /api/watchlist?ticker=MSFT&market_type=US
DELETE /api/watchlist/MSFT?market_type=US
```

The API does not require login, authorization headers, admin tokens, or `added_by`.
