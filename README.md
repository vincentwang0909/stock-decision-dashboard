# Stock Dashboard Render Deployment

This dashboard uses `server.py` as the single backend. The shared watchlist is stored in a SQLite database on the server, while browser `localStorage` is only used as a fast cache.

## Local Development

```bash
cd "/Users/vincentwang/Documents/Stock Dashboard Project"
python3 server.py
```

Open:

```text
http://localhost:4173
```

Local watchlist database:

```text
data/watchlist.db
```

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
gunicorn server:app
```

7. Environment Variables:

```text
WATCHLIST_DB_PATH=/var/data/watchlist.db
```

8. To persist the shared watchlist across redeploys/restarts, add a Render Disk:

```text
Mount Path: /var/data
```

If you do not attach a persistent disk, the default SQLite database can still work, but the watchlist may be lost after redeploys or restarts.

## Shared Watchlist API

```text
GET    /api/watchlist
POST   /api/watchlist
DELETE /api/watchlist?ticker=MSFT&market_type=US
DELETE /api/watchlist/MSFT?market_type=US
```

The API does not require login, authorization headers, admin tokens, or `added_by`.
