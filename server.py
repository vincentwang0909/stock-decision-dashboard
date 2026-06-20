#!/usr/bin/env python3
import json
import os
import threading
import time
from datetime import datetime, timedelta, timezone
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

import akshare as ak
import pandas as pd
import yfinance as yf


ROOT = os.path.dirname(os.path.abspath(__file__))
PORT = int(os.environ.get("PORT", "4173"))
HOST = os.environ.get("HOST", "127.0.0.1")
CACHE_SECONDS = 30 * 60
CACHE = {}
WATCHLIST_FILE = os.environ.get("WATCHLIST_FILE", os.path.join(ROOT, "watchlist.shared.json"))
WATCHLIST_LOCK = threading.Lock()
DEFAULT_SHARED_WATCHLIST = [
    "NVDA", "TSLA", "AMD", "BABA", "GOOGL", "AMZN", "AAPL", "CRCL", "FFAI", "HIMS",
    "MPT", "META", "MSFT", "NFLX", "PLTR", "NOW", "SOFI", "TEM", "XE", "ZETA",
    "300657", "002463", "603005", "600522",
]


def is_a_share_ticker(ticker):
    normalized = (ticker or "").strip().upper()
    return len(normalized) == 6 and normalized.isdigit() and normalized.startswith(("0", "3", "6"))


def normalize_ticker_input(value):
    return "".join(ch for ch in (value or "").strip().upper() if ch.isalnum() or ch in ".-")


def normalize_watchlist(values):
    seen = set()
    normalized = []
    for value in values or []:
        ticker = normalize_ticker_input(str(value))
        if not ticker or ticker in seen:
            continue
        seen.add(ticker)
        normalized.append(ticker)
    return normalized


def load_shared_watchlist():
    with WATCHLIST_LOCK:
        os.makedirs(os.path.dirname(WATCHLIST_FILE), exist_ok=True)
        if not os.path.exists(WATCHLIST_FILE):
            watchlist = DEFAULT_SHARED_WATCHLIST[:]
            with open(WATCHLIST_FILE, "w", encoding="utf-8") as handle:
                json.dump({"watchlist": watchlist}, handle, ensure_ascii=False, indent=2)
            return watchlist

        try:
            with open(WATCHLIST_FILE, "r", encoding="utf-8") as handle:
                payload = json.load(handle)
            watchlist = normalize_watchlist(payload.get("watchlist", []))
            if not watchlist:
                watchlist = DEFAULT_SHARED_WATCHLIST[:]
            return watchlist
        except Exception:
            return DEFAULT_SHARED_WATCHLIST[:]


def save_shared_watchlist(watchlist):
    normalized = normalize_watchlist(watchlist)
    with WATCHLIST_LOCK:
        os.makedirs(os.path.dirname(WATCHLIST_FILE), exist_ok=True)
        with open(WATCHLIST_FILE, "w", encoding="utf-8") as handle:
            json.dump(
                {
                    "watchlist": normalized,
                    "updatedAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
                },
                handle,
                ensure_ascii=False,
                indent=2,
            )
    return normalized


def add_shared_ticker(ticker):
    ticker = normalize_ticker_input(ticker)
    watchlist = load_shared_watchlist()
    if ticker and ticker not in watchlist:
        watchlist.append(ticker)
        watchlist = save_shared_watchlist(watchlist)
    return watchlist


def remove_shared_ticker(ticker):
    ticker = normalize_ticker_input(ticker)
    watchlist = [item for item in load_shared_watchlist() if item != ticker]
    if not watchlist:
        watchlist = DEFAULT_SHARED_WATCHLIST[:]
    return save_shared_watchlist(watchlist)


def resolve_market_symbol(ticker):
    normalized = (ticker or "").strip().upper()
    if is_a_share_ticker(normalized):
        if normalized.startswith(("0", "3")):
            return f"{normalized}.SZ"
        return f"{normalized}.SS"
    return normalized


def iso_from_epoch(value):
    if value is None:
        return None
    try:
        return datetime.fromtimestamp(int(value), tz=timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    except (TypeError, ValueError, OSError, OverflowError):
        return None


def dt_from_epoch(value):
    if value is None:
        return None
    try:
        return datetime.fromtimestamp(int(value), tz=timezone.utc)
    except (TypeError, ValueError, OSError, OverflowError):
        return None


def iso_from_local_close(value, hour, minute, offset_hours):
    if value is None:
        return None
    try:
        if isinstance(value, pd.Timestamp):
            dt_value = value.to_pydatetime()
        elif isinstance(value, datetime):
            dt_value = value
        else:
            dt_value = datetime.combine(value, datetime.min.time())
        local_tz = timezone(timedelta(hours=offset_hours))
        dt_local = dt_value.replace(hour=hour, minute=minute, second=0, microsecond=0, tzinfo=local_tz)
        return dt_local.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    except Exception:
        return None


def _safe_float(value):
    try:
        if value is None or pd.isna(value):
            return None
        return float(value)
    except Exception:
        return None


def _safe_int(value):
    try:
        if value is None or pd.isna(value):
            return None
        return int(float(value))
    except Exception:
        return None


def fetch_a_share_profile(ticker):
    try:
        profile = ak.stock_profile_cninfo(symbol=ticker)
        if profile is None or profile.empty:
            return {}
        row = profile.iloc[0]
        return {
            "shortName": row.get("A股简称"),
            "longName": row.get("公司名称"),
        }
    except Exception:
        return {}


def fetch_a_share_valuation(ticker):
    result = {
        "trailingPE": None,
        "forwardPE": None,
        "marketCap": None,
    }

    try:
        market_cap_df = ak.stock_zh_valuation_baidu(symbol=ticker, indicator="总市值", period="近一年")
        if market_cap_df is not None and not market_cap_df.empty:
            latest_market_cap = _safe_float(market_cap_df.iloc[-1]["value"])
            if latest_market_cap is not None:
                # Baidu valuation uses 亿元 for A-share market cap.
                result["marketCap"] = int(latest_market_cap * 1e8)
    except Exception:
        pass

    try:
        pe_df = ak.stock_zh_valuation_baidu(symbol=ticker, indicator="市盈率(TTM)", period="近一年")
        if pe_df is not None and not pe_df.empty:
            result["trailingPE"] = _safe_float(pe_df.iloc[-1]["value"])
    except Exception:
        pass

    try:
        forecast_df = ak.stock_profit_forecast_ths(symbol=ticker)
        if forecast_df is not None and not forecast_df.empty:
            current_year = datetime.now().year
            forecast_df = forecast_df.copy()
            forecast_df["年度"] = pd.to_numeric(forecast_df["年度"], errors="coerce")
            forecast_df["均值"] = pd.to_numeric(forecast_df["均值"], errors="coerce")
            forecast_df = forecast_df.dropna(subset=["年度", "均值"])
            future_rows = forecast_df[forecast_df["年度"] >= current_year]
            target_row = future_rows.iloc[0] if not future_rows.empty else forecast_df.iloc[0]
            mean_eps = _safe_float(target_row["均值"])
            if mean_eps and mean_eps > 0:
                # Keep EPS forecast here and convert to forward PE after we know price.
                result["forwardEpsMean"] = mean_eps
    except Exception:
        pass

    return result


def fetch_us_quote_with_yfinance(ticker):
    symbol = resolve_market_symbol(ticker)
    instrument = yf.Ticker(symbol)

    history = instrument.history(period="1y", interval="1d", auto_adjust=False)
    if history is None or history.empty:
        raise ValueError(f"No yfinance history for {ticker}")

    history = history.dropna(subset=["Open", "High", "Low", "Close", "Volume"]).tail(252)
    if history.empty:
        raise ValueError(f"No clean yfinance history for {ticker}")

    info = {}
    try:
        info = instrument.info or {}
    except Exception:
        info = {}

    latest_row = history.iloc[-1]
    previous_row = history.iloc[-2] if len(history) > 1 else latest_row
    regular_close = _safe_float(latest_row["Close"])
    regular_market_time = dt_from_epoch(info.get("regularMarketTime"))

    # Use the official daily close as the dashboard price so the homepage,
    # detail page, and all daily indicators stay aligned on the same data point.
    price = regular_close
    updated_at_dt = regular_market_time

    previous_close = _safe_float(info.get("regularMarketPreviousClose")) or _safe_float(info.get("previousClose")) or _safe_float(previous_row["Close"])
    change = price - previous_close if price is not None and previous_close is not None else None
    change_percent = (change / previous_close) * 100 if change is not None and previous_close else None

    updated_at = (
        updated_at_dt.strftime("%Y-%m-%dT%H:%M:%SZ") if updated_at_dt
        else iso_from_local_close(history.index[-1], 16, 0, -4)
    )

    return {
        "price": price,
        "previousClose": previous_close,
        "change": change,
        "changePercent": change_percent,
        "updatedAt": updated_at,
        "symbol": symbol,
        "shortName": info.get("shortName") or info.get("displayName"),
        "longName": info.get("longName") or info.get("shortName") or info.get("displayName"),
        "exchangeName": info.get("exchange") or info.get("fullExchangeName"),
        "trailingPE": _safe_float(info.get("trailingPE")),
        "forwardPE": _safe_float(info.get("forwardPE")),
        "marketCap": _safe_int(info.get("marketCap")),
        "history": {
            "timestamps": [entry.to_pydatetime().strftime("%Y-%m-%d") for entry in history.index],
            "closes": [_safe_float(value) for value in history["Close"].tolist()],
            "highs": [_safe_float(value) for value in history["High"].tolist()],
            "lows": [_safe_float(value) for value in history["Low"].tolist()],
            "volumes": [_safe_int(value) for value in history["Volume"].tolist()],
        },
    }


def fetch_a_share_with_akshare(ticker):
    start_date = (datetime.now() - timedelta(days=390)).strftime("%Y%m%d")
    end_date = datetime.now().strftime("%Y%m%d")
    exchange_name = "SZ" if ticker.startswith(("0", "3")) else "SH"
    profile_info = fetch_a_share_profile(ticker)
    valuation_info = fetch_a_share_valuation(ticker)

    primary_error = None
    try:
        history = ak.stock_zh_a_hist(
            symbol=ticker,
            period="daily",
            start_date=start_date,
            end_date=end_date,
            adjust="",
        )
        history = history.dropna(subset=["开盘", "收盘", "最高", "最低", "成交量"]).tail(252)
        if history is None or history.empty:
            raise ValueError(f"No clean AkShare primary history for {ticker}")

        latest_row = history.iloc[-1]
        previous_row = history.iloc[-2] if len(history) > 1 else latest_row

        price = _safe_float(latest_row["收盘"])
        previous_close = _safe_float(previous_row["收盘"])
        change = price - previous_close if price is not None and previous_close is not None else None
        change_percent = _safe_float(latest_row.get("涨跌幅"))
        if change_percent is None and change is not None and previous_close:
            change_percent = (change / previous_close) * 100
        forward_pe = None
        forward_eps_mean = valuation_info.get("forwardEpsMean")
        if price is not None and forward_eps_mean:
            forward_pe = price / forward_eps_mean

        return {
            "price": price,
            "previousClose": previous_close,
            "change": change,
            "changePercent": change_percent,
            "updatedAt": iso_from_local_close(latest_row["日期"], 15, 0, 8),
            "symbol": resolve_market_symbol(ticker),
            "shortName": profile_info.get("shortName"),
            "longName": profile_info.get("longName"),
            "exchangeName": exchange_name,
            "trailingPE": valuation_info.get("trailingPE"),
            "forwardPE": forward_pe,
            "marketCap": valuation_info.get("marketCap"),
            "history": {
                "timestamps": [str(value) for value in history["日期"].tolist()],
                "closes": [_safe_float(value) for value in history["收盘"].tolist()],
                "highs": [_safe_float(value) for value in history["最高"].tolist()],
                "lows": [_safe_float(value) for value in history["最低"].tolist()],
                "volumes": [_safe_int(value) for value in history["成交量"].tolist()],
            },
        }
    except Exception as exc:
        primary_error = exc

    fallback_symbol = f"{exchange_name.lower()}{ticker}"
    history_tx = ak.stock_zh_a_hist_tx(
        symbol=fallback_symbol,
        start_date=start_date,
        end_date=end_date,
    )
    history_tx = history_tx.dropna(subset=["open", "close", "high", "low", "amount"]).tail(252)
    if history_tx is None or history_tx.empty:
        raise ValueError(f"A-share fetch failed for {ticker}: {primary_error}")

    latest_row = history_tx.iloc[-1]
    previous_row = history_tx.iloc[-2] if len(history_tx) > 1 else latest_row

    price = _safe_float(latest_row["close"])
    previous_close = _safe_float(previous_row["close"])
    change = price - previous_close if price is not None and previous_close is not None else None
    change_percent = (change / previous_close) * 100 if change is not None and previous_close else None
    forward_pe = None
    forward_eps_mean = valuation_info.get("forwardEpsMean")
    if price is not None and forward_eps_mean:
        forward_pe = price / forward_eps_mean

    return {
        "price": price,
        "previousClose": previous_close,
        "change": change,
        "changePercent": change_percent,
        "updatedAt": iso_from_local_close(latest_row["date"], 15, 0, 8),
        "symbol": resolve_market_symbol(ticker),
        "shortName": profile_info.get("shortName"),
        "longName": profile_info.get("longName"),
        "exchangeName": exchange_name,
        "trailingPE": valuation_info.get("trailingPE"),
        "forwardPE": forward_pe,
        "marketCap": valuation_info.get("marketCap"),
        "history": {
            "timestamps": [str(value) for value in history_tx["date"].tolist()],
            "closes": [_safe_float(value) for value in history_tx["close"].tolist()],
            "highs": [_safe_float(value) for value in history_tx["high"].tolist()],
            "lows": [_safe_float(value) for value in history_tx["low"].tolist()],
            "volumes": [_safe_int(value) for value in history_tx["amount"].tolist()],
        },
    }


def fetch_quote(ticker):
    if is_a_share_ticker(ticker):
        return fetch_a_share_with_akshare(ticker)
    return fetch_us_quote_with_yfinance(ticker)


def get_cached_quote(ticker):
    entry = CACHE.get(ticker)
    now = time.time()
    if entry and entry["expiresAt"] > now:
        return entry["value"]

    value = fetch_quote(ticker)
    CACHE[ticker] = {
        "value": value,
        "expiresAt": now + CACHE_SECONDS,
    }
    return value


class Handler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(204)
        self.end_headers()

    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path == "/api/market-data":
            self.handle_market_data(parsed)
            return
        if parsed.path == "/api/watchlist":
            self.handle_watchlist_get()
            return

        if parsed.path == "/":
            self.path = "/index.html"
        return super().do_GET()

    def do_POST(self):
        parsed = urlparse(self.path)
        if parsed.path == "/api/watchlist":
            self.handle_watchlist_add()
            return
        self.send_error(404, "Not found")

    def do_DELETE(self):
        parsed = urlparse(self.path)
        if parsed.path == "/api/watchlist":
            self.handle_watchlist_delete(parsed)
            return
        self.send_error(404, "Not found")

    def handle_market_data(self, parsed):
        params = parse_qs(parsed.query)
        tickers = [
            ticker.strip().upper()
            for ticker in params.get("tickers", [""])[0].split(",")
            if ticker.strip()
        ]

        quotes = {}
        for ticker in tickers:
            try:
                quotes[ticker] = get_cached_quote(ticker)
            except Exception as exc:
                quotes[ticker] = {
                    "price": None,
                    "previousClose": None,
                    "change": None,
                    "changePercent": None,
                    "updatedAt": None,
                    "symbol": resolve_market_symbol(ticker),
                    "shortName": None,
                    "longName": None,
                    "exchangeName": None,
                    "trailingPE": None,
                    "forwardPE": None,
                    "marketCap": None,
                    "history": {"timestamps": [], "closes": [], "highs": [], "lows": [], "volumes": []},
                    "error": str(exc),
                }

        payload = {
            "source": "yfinance-akshare",
            "quotes": quotes,
        }
        quote_times = [
            quote.get("updatedAt")
            for quote in quotes.values()
            if isinstance(quote, dict) and quote.get("updatedAt")
        ]
        payload["updatedAt"] = max(quote_times) if quote_times else datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        body = json.dumps(payload).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def respond_json(self, status, payload):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def handle_watchlist_get(self):
        watchlist = load_shared_watchlist()
        self.respond_json(200, {
            "watchlist": watchlist,
            "updatedAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        })

    def handle_watchlist_add(self):
        try:
            content_length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            content_length = 0
        raw = self.rfile.read(content_length) if content_length > 0 else b"{}"
        try:
            payload = json.loads(raw.decode("utf-8") or "{}")
        except Exception:
            self.respond_json(400, {"error": "Invalid JSON"})
            return

        ticker = normalize_ticker_input(payload.get("ticker"))
        if not ticker:
            self.respond_json(400, {"error": "Ticker is required"})
            return

        watchlist = add_shared_ticker(ticker)
        self.respond_json(200, {
            "watchlist": watchlist,
            "updatedAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        })

    def handle_watchlist_delete(self, parsed):
        params = parse_qs(parsed.query)
        ticker = normalize_ticker_input(params.get("ticker", [""])[0])
        if not ticker:
            self.respond_json(400, {"error": "Ticker is required"})
            return

        watchlist = remove_shared_ticker(ticker)
        self.respond_json(200, {
            "watchlist": watchlist,
            "updatedAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        })


def main():
    os.chdir(ROOT)
    server = ThreadingHTTPServer((HOST, PORT), Handler)
    display_host = "localhost" if HOST == "127.0.0.1" else HOST
    print(f"Serving dashboard on http://{display_host}:{PORT}")
    print(f"API endpoint: http://{display_host}:{PORT}/api/market-data?tickers=AAPL,MSFT,002463,300657")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
