#!/usr/bin/env python3
import json
import math
import os
import queue
import re
import sqlite3
import sys
import threading
import time
import traceback
from concurrent.futures import ThreadPoolExecutor, TimeoutError as FuturesTimeoutError, as_completed
from email.utils import parsedate_to_datetime
from html import unescape
from datetime import datetime, timedelta, timezone
from http.server import HTTPServer, SimpleHTTPRequestHandler
from urllib.parse import parse_qs, quote_plus, unquote, urlparse
from urllib.request import Request, urlopen
from xml.etree import ElementTree as ET

from flask import Flask, jsonify, request, send_from_directory

try:
    from flask_cors import CORS
except Exception:
    CORS = None


class LazyModule:
    def __init__(self, module_name):
        self.module_name = module_name
        self.module = None

    def _load(self):
        if self.module is None:
            import importlib
            self.module = importlib.import_module(self.module_name)
        return self.module

    def __getattr__(self, item):
        return getattr(self._load(), item)


pd = LazyModule("pandas")
yf = LazyModule("yfinance")


def get_ak():
    try:
        import importlib
        return importlib.import_module("akshare")
    except Exception:
        return None


ROOT = os.path.dirname(os.path.abspath(__file__))
ENV_FILE = os.path.join(ROOT, ".env")
if os.path.exists(ENV_FILE):
    try:
        with open(ENV_FILE, "r", encoding="utf-8") as handle:
            for raw_line in handle:
                line = raw_line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                key, value = line.split("=", 1)
                key = key.strip()
                value = value.strip().strip('"').strip("'")
                if key and key not in os.environ:
                    os.environ[key] = value
    except Exception:
        pass
PORT = int(os.environ.get("PORT", "4173"))
HOST = os.environ.get("HOST", "127.0.0.1")
CACHE_SECONDS = 60 * 60
QUOTE_FETCH_TIMEOUT_SECONDS = 12
MARKET_CACHE_TTL_SECONDS = int(os.environ.get("MARKET_CACHE_TTL_SECONDS", str(60 * 60)))
MARKET_DATA_MAX_TICKERS = int(os.environ.get("MARKET_DATA_MAX_TICKERS", "60"))
MARKET_DATA_MAX_WORKERS = int(os.environ.get("MARKET_DATA_MAX_WORKERS", "2"))
MARKET_DATA_MAX_LIVE_TICKERS = int(os.environ.get("MARKET_DATA_MAX_LIVE_TICKERS", "5"))
MARKET_DATA_ROUTE_TIMEOUT_SECONDS = int(os.environ.get("MARKET_DATA_ROUTE_TIMEOUT_SECONDS", "18"))
MARKET_DATA_PER_TICKER_TIMEOUT_SECONDS = int(os.environ.get("MARKET_DATA_PER_TICKER_TIMEOUT_SECONDS", "8"))
OPTIONS_FETCH_TIMEOUT_SECONDS = float(os.environ.get("OPTIONS_FETCH_TIMEOUT_SECONDS", "6"))
A_SHARE_METADATA_TIMEOUT_SECONDS = 2.5
A_SHARE_PRIMARY_PRICE_TIMEOUT_SECONDS = 4.0
A_SHARE_SECONDARY_PRICE_TIMEOUT_SECONDS = 4.5
CACHE = {}
SEARCH_CACHE_SECONDS = 10 * 60
SYMBOL_SEARCH_CACHE = {}
A_SHARE_SYMBOL_CACHE = {"value": [], "expiresAt": 0}
NEWS_CACHE_SECONDS = 60 * 60
COMPANY_NEWS_CACHE = {}
MARKET_CONTEXT_CACHE = {"value": None, "expiresAt": 0}
FEAR_GREED_CACHE = {"value": None, "expiresAt": 0}
WATCHLIST_DB_PATH = os.environ.get("WATCHLIST_DB_PATH", "data/watchlist.db")
MARKET_CACHE_DIR = os.environ.get("MARKET_CACHE_DIR", os.path.join("data", "cache"))
MARKET_EVENTS_FILE = os.environ.get("MARKET_EVENTS_FILE", os.path.join(ROOT, "market_events.json"))
WATCHLIST_LOCK = threading.Lock()
QUOTE_FETCH_LOCK = threading.Lock()
DEFAULT_SHARED_WATCHLIST = [
    "NVDA", "TSLA", "AMD", "BABA", "GOOGL", "AMZN", "AAPL", "CRCL", "FFAI", "HIMS",
    "MPT", "META", "MSFT", "NFLX", "PLTR", "NOW", "SOFI", "TEM", "XE", "ZETA",
    "300657", "002463", "603005", "600522",
]
US_SYMBOL_CATALOG = [
    {"ticker": "NVDA", "name": "NVIDIA", "aliases": ["NVIDIA Corp", "英伟达"], "exchange": "NASDAQ"},
    {"ticker": "TSLA", "name": "Tesla", "aliases": ["Tesla Inc", "特斯拉"], "exchange": "NASDAQ"},
    {"ticker": "AMD", "name": "AMD", "aliases": ["Advanced Micro Devices", "超威半导体"], "exchange": "NASDAQ"},
    {"ticker": "BABA", "name": "Alibaba", "aliases": ["Alibaba Group Holding Limited", "阿里巴巴"], "exchange": "NYSE"},
    {"ticker": "GOOGL", "name": "Google", "aliases": ["Alphabet", "谷歌"], "exchange": "NASDAQ"},
    {"ticker": "AMZN", "name": "Amazon", "aliases": ["Amazon.com", "亚马逊"], "exchange": "NASDAQ"},
    {"ticker": "AAPL", "name": "Apple", "aliases": ["Apple Inc", "苹果"], "exchange": "NASDAQ"},
    {"ticker": "CRCL", "name": "Circle", "aliases": ["Circle Internet Group"], "exchange": "NYSE"},
    {"ticker": "FFAI", "name": "Faraday Future AI", "aliases": ["Faraday Future", "法拉第未来"], "exchange": "NASDAQ"},
    {"ticker": "HIMS", "name": "Hims & Hers", "aliases": ["Hims and Hers", "Hims Hers"], "exchange": "NYSE"},
    {"ticker": "MPT", "name": "Medical Properties Trust", "aliases": ["医疗地产信托"], "exchange": "NYSE"},
    {"ticker": "META", "name": "Meta", "aliases": ["Meta Platforms", "Facebook"], "exchange": "NASDAQ"},
    {"ticker": "MSFT", "name": "Microsoft", "aliases": ["微软"], "exchange": "NASDAQ"},
    {"ticker": "NFLX", "name": "Netflix", "aliases": ["奈飞"], "exchange": "NASDAQ"},
    {"ticker": "PLTR", "name": "Palantir", "aliases": ["Palantir Technologies"], "exchange": "NASDAQ"},
    {"ticker": "NOW", "name": "ServiceNow", "aliases": ["Service Now"], "exchange": "NYSE"},
    {"ticker": "SOFI", "name": "SoFi", "aliases": ["SoFi Technologies"], "exchange": "NASDAQ"},
    {"ticker": "TEM", "name": "Tempus AI", "aliases": ["Tempus"], "exchange": "NASDAQ"},
    {"ticker": "XE", "name": "XE", "aliases": ["Energy Fuels"], "exchange": "NYSE"},
    {"ticker": "ZETA", "name": "Zeta Global", "aliases": ["Zeta"], "exchange": "NYSE"},
]
A_SHARE_SYMBOL_CATALOG = [
    {"ticker": "002463", "name": "沪电股份", "aliases": ["Hudian", "Hudian Corp", "Hu Dian"]},
    {"ticker": "300657", "name": "先导基电", "aliases": ["Hongxin Electronics", "Xian Dao Ji Dian", "Hongxin"]},
    {"ticker": "603005", "name": "晶方科技", "aliases": ["Anji Microelectronics", "Jingfang Keji", "Jingfang"]},
    {"ticker": "600522", "name": "中天科技", "aliases": ["Zhongtian Technology", "Zhong Tian Ke Ji"]},
    {"ticker": "600641", "name": "万业企业", "aliases": ["Shanghai Vital Deeptech", "Wanye Qiye", "Wan Ye Qi Ye"]},
]

POSITIVE_NEWS_KEYWORDS = [
    "beat", "beats", "surge", "growth", "upgrade", "raises", "raised", "expands", "partnership",
    "approval", "rebound", "record", "strong demand", "buyback", "bullish", "rally", "wins",
    "launch", "profit jump", "guidance raised", "breakthrough", "ai demand", "cloud growth",
    "增长", "上调", "合作", "突破", "回升", "利好", "创新高", "反弹", "订单增长",
]

NEGATIVE_NEWS_KEYWORDS = [
    "miss", "misses", "downgrade", "cut", "cuts", "lawsuit", "probe", "investigation",
    "antitrust", "regulation", "tariff", "war", "conflict", "delay", "recall", "warning",
    "slump", "fall", "drop", "weak demand", "bearish", "fraud", "default", "bankruptcy",
    "监管", "诉讼", "调查", "下调", "关税", "战争", "冲突", "延迟", "召回", "下滑", "利空",
]

MACRO_EVENT_PATTERNS = [
    ("fed", re.compile(r"\bfed\b|fomc|rate cut|rate hike|interest rate|powell", re.I)),
    ("inflation", re.compile(r"\bcpi\b|\bppi\b|inflation|jobs report|payroll", re.I)),
    ("tariff", re.compile(r"tariff|trade war|export restriction|sanction", re.I)),
    ("war", re.compile(r"war|missile|middle east|iran|israel|geopolitical|conflict", re.I)),
    ("regulation", re.compile(r"regulation|antitrust|lawsuit|probe|investigation", re.I)),
    ("energy", re.compile(r"oil|energy|crude|opec|gas price|lng", re.I)),
]


def is_a_share_ticker(ticker):
    normalized = (ticker or "").strip().upper()
    return len(normalized) == 6 and normalized.isdigit() and normalized.startswith(("0", "3", "6"))


def normalize_ticker_input(value):
    invisible = "\u200b\u200c\u200d\ufeff"
    cleaned = "".join(ch for ch in (value or "") if ch not in invisible)
    return "".join(ch for ch in cleaned.strip().upper() if ch.isalnum() or ch in ".-")


def infer_market_type(ticker, market_type=None):
    requested = (market_type or "").strip().upper()
    if requested in ("US", "CN_A_SHARE"):
        return requested
    return "CN_A_SHARE" if is_a_share_ticker(ticker) else "US"


def normalize_watchlist_item(value):
    if isinstance(value, dict):
        ticker = normalize_ticker_input(value.get("ticker"))
        market_type = infer_market_type(ticker, value.get("market_type"))
        created_at = value.get("created_at") or value.get("createdAt")
    else:
        ticker = normalize_ticker_input(str(value))
        market_type = infer_market_type(ticker)
        created_at = None
    if not ticker:
        return None
    return {
        "id": None,
        "ticker": ticker,
        "market_type": market_type,
        "created_at": created_at or datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
    }


def normalize_search_query(value):
    return " ".join(str(value or "").strip().split())


def normalize_watchlist(values):
    seen = set()
    normalized = []
    for value in values or []:
        item = normalize_watchlist_item(value)
        ticker = item["ticker"] if item else ""
        if not ticker or ticker in seen:
            continue
        seen.add(ticker)
        normalized.append(ticker)
    return normalized


def normalize_watchlist_items(values):
    seen = set()
    items = []
    for value in values or []:
        item = normalize_watchlist_item(value)
        if not item:
            continue
        key = (item["ticker"], item["market_type"])
        if key in seen:
            continue
        seen.add(key)
        item["id"] = len(items) + 1
        items.append(item)
    return items


def watchlist_items_to_tickers(items):
    return [item["ticker"] for item in items or [] if item.get("ticker")]


def sqlite_timestamp_to_iso(value):
    if not value:
        return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    text = str(value)
    if "T" in text:
        return text if text.endswith("Z") else f"{text}Z"
    return f"{text.replace(' ', 'T')}Z"


def get_watchlist_conn():
    init_watchlist_db()
    conn = sqlite3.connect(WATCHLIST_DB_PATH, timeout=10)
    conn.row_factory = sqlite3.Row
    return conn


def get_watchlist_connection():
    db_dir = os.path.dirname(WATCHLIST_DB_PATH)
    if db_dir:
        os.makedirs(db_dir, exist_ok=True)
    conn = sqlite3.connect(WATCHLIST_DB_PATH, timeout=10)
    conn.row_factory = sqlite3.Row
    return conn


def init_watchlist_db():
    db_exists = os.path.exists(WATCHLIST_DB_PATH)
    with WATCHLIST_LOCK:
        with get_watchlist_connection() as conn:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS watchlist (
                  id INTEGER PRIMARY KEY AUTOINCREMENT,
                  ticker TEXT NOT NULL,
                  market_type TEXT NOT NULL,
                  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                  UNIQUE(ticker, market_type)
                )
                """
            )
            if not db_exists:
                for item in normalize_watchlist_items(DEFAULT_SHARED_WATCHLIST):
                    conn.execute(
                        "INSERT OR IGNORE INTO watchlist (ticker, market_type) VALUES (?, ?)",
                        (item["ticker"], item["market_type"]),
                    )
            conn.commit()


def row_to_watchlist_item(row):
    return {
        "id": row["id"],
        "ticker": row["ticker"],
        "market_type": row["market_type"],
        "created_at": sqlite_timestamp_to_iso(row["created_at"]),
    }


def watchlist_rows_to_items(rows):
    return [row_to_watchlist_item(row) for row in rows]


def load_shared_watchlist():
    return watchlist_items_to_tickers(load_shared_watchlist_items())


def load_shared_watchlist_items():
    init_watchlist_db()
    with WATCHLIST_LOCK:
        with get_watchlist_connection() as conn:
            rows = conn.execute(
                """
                SELECT id, ticker, market_type, created_at
                FROM watchlist
                ORDER BY datetime(created_at) ASC, id ASC
                """
            ).fetchall()
            return watchlist_rows_to_items(rows)


def add_shared_ticker(ticker, market_type=None):
    ticker = normalize_ticker_input(ticker)
    normalized_market_type = infer_market_type(ticker, market_type)
    if ticker:
        init_watchlist_db()
        with WATCHLIST_LOCK:
            with get_watchlist_connection() as conn:
                conn.execute(
                    "INSERT OR IGNORE INTO watchlist (ticker, market_type) VALUES (?, ?)",
                    (ticker, normalized_market_type),
                )
                conn.commit()
    return load_shared_watchlist_items()


def remove_shared_ticker(ticker, market_type=None):
    ticker = normalize_ticker_input(ticker)
    if ticker:
        init_watchlist_db()
        normalized_market_type = infer_market_type(ticker, market_type) if market_type else None
        with WATCHLIST_LOCK:
            with get_watchlist_connection() as conn:
                if normalized_market_type:
                    conn.execute(
                        "DELETE FROM watchlist WHERE ticker = ? AND market_type = ?",
                        (ticker, normalized_market_type),
                    )
                else:
                    conn.execute("DELETE FROM watchlist WHERE ticker = ?", (ticker,))
                conn.commit()
    return load_shared_watchlist_items()


def resolve_market_symbol(ticker):
    normalized = (ticker or "").strip().upper()
    if is_a_share_ticker(normalized):
        if normalized.startswith(("0", "3")):
            return f"{normalized}.SZ"
        return f"{normalized}.SS"
    return normalized


def fetch_a_share_symbol_rows():
    now = time.time()
    if A_SHARE_SYMBOL_CACHE["value"] and A_SHARE_SYMBOL_CACHE["expiresAt"] > now:
        return A_SHARE_SYMBOL_CACHE["value"]

    rows = [
        {
            "ticker": item["ticker"],
            "name": item["name"],
            "market": "cn",
            "exchange": "SZ" if item["ticker"].startswith(("0", "3")) else "SH",
            "aliases": item.get("aliases", []),
        }
        for item in A_SHARE_SYMBOL_CATALOG
    ]

    A_SHARE_SYMBOL_CACHE["value"] = rows
    A_SHARE_SYMBOL_CACHE["expiresAt"] = now + 12 * 60 * 60
    return rows


def search_a_share_candidates(query, limit=8):
    normalized = normalize_search_query(query)
    if not normalized:
        return []

    query_upper = normalized.upper()
    rows = fetch_a_share_symbol_rows()
    scored = []
    seen_tickers = set()

    for item in rows:
        ticker = item["ticker"]
        name = item["name"]
        alias_blob = " ".join(item.get("aliases", []))
        search_blob = f"{name} {alias_blob}".upper()
        score = None
        if ticker == query_upper:
            score = 0
        elif ticker.startswith(query_upper):
            score = 1
        elif query_upper in search_blob:
            score = 2
        if score is None:
            continue
        seen_tickers.add(ticker)
        scored.append((score, len(name), item))

    if is_a_share_ticker(query_upper) and query_upper not in seen_tickers:
        exchange = "SZ" if query_upper.startswith(("0", "3")) else "SH"
        profile_info = _run_with_timeout(
            lambda: fetch_a_share_profile(query_upper),
            1.5,
            fallback={},
        ) or {}
        display_name = (
            profile_info.get("shortName")
            or profile_info.get("longName")
            or f"A-share {query_upper}"
        )
        scored.append((
            0,
            len(display_name),
            {
                "ticker": query_upper,
                "name": display_name,
                "market": "cn",
                "exchange": exchange,
                "aliases": [],
            },
        ))

    scored.sort(key=lambda pair: (pair[0], pair[1], pair[2]["ticker"]))
    return [format_symbol_candidate(item) for _, _, item in scored[:limit]]


def search_us_candidates(query, limit=8):
    normalized = normalize_search_query(query)
    if not normalized:
        return []

    cache_key = normalized.upper()
    now = time.time()
    cached = SYMBOL_SEARCH_CACHE.get(cache_key)
    if cached and cached["expiresAt"] > now:
        return cached["value"]

    candidates = []
    seen = set()
    query_upper = normalized.upper()

    local_ranked = []
    for item in US_SYMBOL_CATALOG:
        ticker = item["ticker"]
        alias_blob = " ".join([item["name"], *item.get("aliases", [])]).upper()
        score = None
        if ticker == query_upper:
            score = 0
        elif ticker.startswith(query_upper):
            score = 1
        elif query_upper in alias_blob:
            score = 2
        if score is None:
            continue
        local_ranked.append((score, len(item["name"]), item))

    local_ranked.sort(key=lambda pair: (pair[0], pair[1], pair[2]["ticker"]))
    for _, _, item in local_ranked[:limit]:
        symbol = item["ticker"]
        seen.add(symbol)
        candidates.append(format_symbol_candidate({
            "ticker": symbol,
            "name": item["name"],
            "market": "us",
            "exchange": item["exchange"],
        }))

    try:
        search = yf.Search(normalized, max_results=max(limit * 2, 10), news_count=0)
        quotes = getattr(search, "quotes", []) or []
        for quote in quotes:
            symbol = normalize_ticker_input(quote.get("symbol"))
            if not symbol or symbol in seen:
                continue
            quote_type = str(quote.get("quoteType", "")).upper()
            exchange = str(quote.get("exchange", "") or quote.get("exchangeDisp", "") or "").upper()
            if quote_type not in {"EQUITY", "ETF"}:
                continue
            if exchange not in {"NMS", "NYQ", "ASE", "NASDAQ", "NYSE", "AMEX", "PCX", "BATS"}:
                continue
            seen.add(symbol)
            candidates.append(format_symbol_candidate({
                "ticker": symbol,
                "name": quote.get("shortname") or quote.get("longname") or symbol,
                "market": "us",
                "exchange": exchange,
            }))
            if len(candidates) >= limit:
                break
    except Exception:
        pass

    if not candidates:
        symbol = normalize_ticker_input(normalized)
        if symbol and not is_a_share_ticker(symbol):
            try:
                quote = get_cached_quote(symbol)
                candidates = [format_symbol_candidate({
                    "ticker": symbol,
                    "name": quote.get("shortName") or quote.get("longName") or symbol,
                    "market": "us",
                    "exchange": quote.get("exchangeName") or "US",
                })]
            except Exception:
                candidates = []

    SYMBOL_SEARCH_CACHE[cache_key] = {
        "value": candidates,
        "expiresAt": now + SEARCH_CACHE_SECONDS,
    }
    return candidates


def format_symbol_candidate(item):
    ticker = normalize_ticker_input(item.get("ticker"))
    market = item.get("market") or ("cn" if is_a_share_ticker(ticker) else "us")
    exchange = str(item.get("exchange") or "").upper()
    symbol_display = ticker
    if market == "cn":
        if exchange == "SZ" or ticker.startswith(("0", "3")):
            symbol_display = f"{ticker}.SZ"
        elif exchange == "SH" or ticker.startswith("6"):
            symbol_display = f"{ticker}.SH"
    return {
        "ticker": ticker,
        "symbolDisplay": symbol_display,
        "name": str(item.get("name") or ticker),
        "market": market,
        "marketLabel": "A-share" if market == "cn" else "US",
        "exchange": exchange or ("SZ" if market == "cn" and ticker.startswith(("0", "3")) else "SH" if market == "cn" else "US"),
    }


def search_symbol_candidates(query, limit=10):
    normalized = normalize_search_query(query)
    if not normalized:
        return []

    query_upper = normalized.upper()
    cn_candidates = search_a_share_candidates(normalized, limit=limit)
    us_candidates = search_us_candidates(normalized, limit=limit)

    combined = []
    seen = set()
    prefer_cn_first = query_upper[:1].isdigit()
    ordered = [cn_candidates, us_candidates] if prefer_cn_first else [us_candidates, cn_candidates]

    for group in ordered:
        for item in group:
            key = item["ticker"]
            if key in seen:
                continue
            seen.add(key)
            combined.append(item)
            if len(combined) >= limit:
                return combined
    return combined


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


def _safe_text(value):
    if value is None:
        return ""
    return str(value).strip()


def build_source_info(status, missing_source=None, suggested_source=None, source_name=None):
    return {
        "status": status,
        "missing_source": missing_source or "—",
        "suggested_source": suggested_source or "—",
        "source_name": source_name or status,
    }


def http_get_text(url, timeout=8):
    request = Request(
        url,
        headers={
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36",
            "Accept": "application/rss+xml, application/xml, text/xml, text/html;q=0.9, */*;q=0.8",
        },
    )
    with urlopen(request, timeout=timeout) as response:
        charset = response.headers.get_content_charset() or "utf-8"
        return response.read().decode(charset, errors="ignore")


def http_get_json(url, timeout=8):
    text = http_get_text(url, timeout=timeout)
    return json.loads(text)


def http_get_json_with_accept(url, timeout=8, accept="application/json, text/plain;q=0.9, */*;q=0.8"):
    request = Request(
        url,
        headers={
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36",
            "Accept": accept,
            "Referer": "https://www.cnn.com/",
            "Origin": "https://www.cnn.com",
        },
    )
    with urlopen(request, timeout=timeout) as response:
        charset = response.headers.get_content_charset() or "utf-8"
        return json.loads(response.read().decode(charset, errors="ignore"))


def http_get_json_browser(url, timeout=8, referer="https://finance.yahoo.com/"):
    request = Request(
        url,
        headers={
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36",
            "Accept": "application/json, text/plain;q=0.9, */*;q=0.8",
            "Referer": referer,
        },
    )
    with urlopen(request, timeout=timeout) as response:
        charset = response.headers.get_content_charset() or "utf-8"
        return json.loads(response.read().decode(charset, errors="ignore"))


def _unwrap_yahoo_value(value):
    if isinstance(value, dict):
        for key in ("raw", "fmt", "longFmt"):
            if key in value and value.get(key) is not None:
                return value.get(key)
    return value


def fetch_yahoo_chart_points(symbol, range_value="3mo", interval="1d", limit=60, value_scale=1.0):
    rows = fetch_yahoo_chart_rows(symbol, range_value=range_value, interval=interval, limit=limit)
    return [
        {"date": row["date"], "value": row["close"] * value_scale}
        for row in rows
        if row.get("close") is not None
    ][-limit:]


def fetch_yahoo_chart_rows(symbol, range_value="3mo", interval="1d", limit=252):
    encoded_symbol = quote_plus(symbol)
    urls = [
        f"https://query1.finance.yahoo.com/v8/finance/chart/{encoded_symbol}?range={quote_plus(range_value)}&interval={quote_plus(interval)}",
        f"https://query2.finance.yahoo.com/v8/finance/chart/{encoded_symbol}?range={quote_plus(range_value)}&interval={quote_plus(interval)}",
    ]
    for url in urls:
        try:
            payload = http_get_json_browser(url, timeout=8)
            result = (((payload or {}).get("chart") or {}).get("result") or [None])[0] or {}
            timestamps = result.get("timestamp") or []
            quote = (((result.get("indicators") or {}).get("quote") or [None])[0]) or {}
            rows = []
            for index, ts in enumerate(timestamps):
                stamp = dt_from_epoch(ts)
                if stamp is None:
                    continue
                close = _safe_float((quote.get("close") or [None])[index] if index < len(quote.get("close") or []) else None)
                if close is None:
                    continue
                rows.append({
                    "date": stamp.date().isoformat(),
                    "datetime": stamp,
                    "open": _safe_float((quote.get("open") or [None])[index] if index < len(quote.get("open") or []) else None),
                    "high": _safe_float((quote.get("high") or [None])[index] if index < len(quote.get("high") or []) else None),
                    "low": _safe_float((quote.get("low") or [None])[index] if index < len(quote.get("low") or []) else None),
                    "close": close,
                    "volume": _safe_int((quote.get("volume") or [None])[index] if index < len(quote.get("volume") or []) else None),
                })
            if rows:
                return rows[-limit:]
        except Exception:
            continue
    return []


def fetch_yahoo_chart_frame(symbol, range_value="1y", interval="1d"):
    rows = fetch_yahoo_chart_rows(symbol, range_value=range_value, interval=interval, limit=260)
    if not rows:
        return pd.DataFrame()
    try:
        frame = pd.DataFrame({
            "Open": [row.get("open") if row.get("open") is not None else row.get("close") for row in rows],
            "High": [row.get("high") if row.get("high") is not None else row.get("close") for row in rows],
            "Low": [row.get("low") if row.get("low") is not None else row.get("close") for row in rows],
            "Close": [row.get("close") for row in rows],
            "Volume": [row.get("volume") or 0 for row in rows],
        }, index=pd.DatetimeIndex([row["datetime"] for row in rows]))
        return frame
    except Exception:
        return pd.DataFrame()


def fetch_yahoo_quote_snapshot(symbol):
    urls = [
        f"https://query1.finance.yahoo.com/v7/finance/quote?symbols={quote_plus(symbol)}",
        f"https://query2.finance.yahoo.com/v7/finance/quote?symbols={quote_plus(symbol)}",
    ]
    for url in urls:
        try:
            payload = http_get_json_browser(url, timeout=8)
            result = (((payload or {}).get("quoteResponse") or {}).get("result") or [None])[0] or {}
            if result:
                return {key: _unwrap_yahoo_value(value) for key, value in result.items()}
        except Exception:
            continue
    return {}


def stooq_symbol_candidates(symbol):
    normalized = _safe_text(symbol).lower().replace("-", ".")
    candidates = []
    if normalized in {"^vix", "vix"}:
        candidates.extend(["^vix", "vix"])
    if normalized in {"^tnx", "tnx"}:
        candidates.extend(["10yus.b", "us10y", "10yus", "^tnx", "tnx"])
    if normalized.startswith("^"):
        candidates.extend([normalized, normalized[1:]])
    elif "." not in normalized:
        candidates.append(f"{normalized}.us")
    candidates.append(normalized)
    if normalized in {"spy", "qqq"}:
        candidates.append(f"{normalized}.us")
    seen = []
    for candidate in candidates:
        if candidate and candidate not in seen:
            seen.append(candidate)
    return seen


def fetch_stooq_history_rows(symbol, limit=260):
    for candidate in stooq_symbol_candidates(symbol):
        try:
            url = f"https://stooq.com/q/d/l/?s={quote_plus(candidate)}&i=d"
            csv_text = http_get_text(url, timeout=8)
            rows = []
            for raw_line in csv_text.splitlines()[1:]:
                parts = [part.strip() for part in raw_line.split(",")]
                if len(parts) < 6 or parts[0].lower() == "no data":
                    continue
                try:
                    stamp = datetime.strptime(parts[0], "%Y-%m-%d").replace(tzinfo=timezone.utc)
                except Exception:
                    continue
                close = _safe_float(parts[4])
                if close is None:
                    continue
                rows.append({
                    "date": stamp.date().isoformat(),
                    "datetime": stamp,
                    "open": _safe_float(parts[1]),
                    "high": _safe_float(parts[2]),
                    "low": _safe_float(parts[3]),
                    "close": close,
                    "volume": _safe_int(parts[5]),
                    "source_symbol": candidate,
                })
            if rows:
                return rows[-limit:]
        except Exception:
            continue
    return []


def fetch_stooq_chart_frame(symbol, limit=260):
    rows = fetch_stooq_history_rows(symbol, limit=limit)
    if not rows:
        return pd.DataFrame()
    try:
        return pd.DataFrame({
            "Open": [row.get("open") if row.get("open") is not None else row.get("close") for row in rows],
            "High": [row.get("high") if row.get("high") is not None else row.get("close") for row in rows],
            "Low": [row.get("low") if row.get("low") is not None else row.get("close") for row in rows],
            "Close": [row.get("close") for row in rows],
            "Volume": [row.get("volume") or 0 for row in rows],
        }, index=pd.DatetimeIndex([row["datetime"] for row in rows]))
    except Exception:
        return pd.DataFrame()


def fetch_yahoo_quote_summary_snapshot(symbol):
    modules = "price,summaryDetail,defaultKeyStatistics,financialData,summaryProfile"
    for host in ("query1.finance.yahoo.com", "query2.finance.yahoo.com"):
        try:
            url = f"https://{host}/v10/finance/quoteSummary/{quote_plus(symbol)}?modules={modules}"
            payload = http_get_json_browser(url, timeout=8)
            result = ((((payload or {}).get("quoteSummary") or {}).get("result")) or [None])[0] or {}
            summary_detail = result.get("summaryDetail") or {}
            default_key_stats = result.get("defaultKeyStatistics") or {}
            financial_data = result.get("financialData") or {}
            price = result.get("price") or {}
            summary_profile = result.get("summaryProfile") or {}
            flattened = {}
            for source in [summary_detail, default_key_stats, financial_data, price, summary_profile]:
                for key, value in source.items():
                    flattened[key] = _unwrap_yahoo_value(value)
            if flattened:
                return flattened
        except Exception:
            continue
    return {}


def merge_yahoo_fallback_info(symbol, info):
    merged = dict(info or {})
    quote_snapshot = fetch_yahoo_quote_snapshot(symbol)
    quote_summary = fetch_yahoo_quote_summary_snapshot(symbol)
    for source in [quote_snapshot, quote_summary]:
        for key, value in (source or {}).items():
            if merged.get(key) is None and value is not None:
                merged[key] = value
    return merged, quote_snapshot, quote_summary


def fetch_fred_series_points(series_id, limit=120):
    try:
        csv_text = http_get_text(f"https://fred.stlouisfed.org/graph/fredgraph.csv?id={series_id}", timeout=8)
        rows = []
        for raw_line in csv_text.splitlines()[1:]:
            if not raw_line or "," not in raw_line:
                continue
            date_text, value_text = raw_line.split(",", 1)
            value_text = value_text.strip()
            if not value_text or value_text == ".":
                continue
            value = _safe_float(value_text)
            if value is None:
                continue
            rows.append({"date": date_text.strip(), "value": value})
        return rows[-limit:]
    except Exception:
        return []


def parse_fear_greed_datetime(value):
    if value is None:
        return None
    if isinstance(value, (int, float)):
        timestamp = value / 1000 if value > 10_000_000_000 else value
        try:
            return datetime.fromtimestamp(timestamp, tz=timezone.utc)
        except Exception:
            return None
    text = str(value).strip()
    if not text:
        return None
    try:
        return datetime.fromisoformat(text.replace("Z", "+00:00"))
    except Exception:
        pass
    for fmt in ("%Y-%m-%d", "%Y-%m-%d %H:%M:%S"):
        try:
            return datetime.strptime(text, fmt).replace(tzinfo=timezone.utc)
        except Exception:
            continue
    return None


def extract_fear_greed_records(node, records=None):
    if records is None:
        records = []
    if isinstance(node, dict):
        numeric_value = None
        for key in ("score", "value"):
            candidate = _safe_float(node.get(key))
            if candidate is not None and 0 <= candidate <= 100:
                numeric_value = candidate
                break
        if numeric_value is not None:
            label = (
                _safe_text(node.get("rating"))
                or _safe_text(node.get("label"))
                or _safe_text(node.get("classification"))
                or _safe_text(node.get("status"))
                or _safe_text(node.get("name"))
            )
            stamp = None
            for key in ("timestamp", "time", "x", "date", "updated_at"):
                stamp = parse_fear_greed_datetime(node.get(key))
                if stamp is not None:
                    break
            records.append({
                "value": numeric_value,
                "label": label,
                "timestamp": stamp,
            })
        for value in node.values():
            extract_fear_greed_records(value, records)
    elif isinstance(node, list):
        for item in node:
            extract_fear_greed_records(item, records)
    return records


def parse_fear_greed_payload(payload):
    records = extract_fear_greed_records(payload, [])
    if not records:
        return None
    deduped = []
    seen = set()
    for record in records:
        dedupe_key = (
            record["value"],
            record["label"],
            record["timestamp"].isoformat() if record["timestamp"] else None,
        )
        if dedupe_key in seen:
            continue
        seen.add(dedupe_key)
        deduped.append(record)
    if not deduped:
        return None
    deduped.sort(key=lambda item: item["timestamp"] or datetime.min.replace(tzinfo=timezone.utc), reverse=True)
    latest = deduped[0]
    previous = deduped[1] if len(deduped) > 1 else None
    trend = None
    if previous is not None:
        delta = latest["value"] - previous["value"]
        if delta >= 3:
            trend = "rising"
        elif delta <= -3:
            trend = "falling"
        else:
            trend = "neutral"
    return {
        "value": latest["value"],
        "label": latest["label"] or fear_greed_label(latest["value"]),
        "trend": trend,
    }


def fetch_fear_greed_value():
    candidate_urls = [
        "https://production.dataviz.cnn.io/index/fearandgreed/graphdata",
        "https://production.dataviz.cnn.io/index/fearandgreed/current",
    ]
    for url in candidate_urls:
        try:
            payload = http_get_json_with_accept(url, timeout=6)
        except Exception:
            continue
        parsed = parse_fear_greed_payload(payload)
        if parsed is not None and parsed.get("value") is not None:
            return parsed
    return None


def fetch_fear_greed_snapshot():
    now = time.time()
    cached = FEAR_GREED_CACHE.get("value")
    if cached and FEAR_GREED_CACHE.get("expiresAt", 0) > now:
        return cached

    live_snapshot = fetch_fear_greed_value()
    if live_snapshot is not None and live_snapshot.get("value") is not None:
        snapshot = {
            "value": live_snapshot.get("value"),
            "label": live_snapshot.get("label") or fear_greed_label(live_snapshot.get("value")),
            "trend": live_snapshot.get("trend"),
            "source_name": "CNN Fear & Greed",
            "source_status": "Live",
            "source_reason": None,
        }
        FEAR_GREED_CACHE["value"] = snapshot
        FEAR_GREED_CACHE["expiresAt"] = now + (30 * 60)
        return snapshot

    if cached:
        stale_snapshot = dict(cached)
        stale_snapshot["source_status"] = "Stale"
        stale_snapshot["source_reason"] = "Using the last successful CNN Fear & Greed snapshot because the live feed is unavailable."
        return stale_snapshot

    return {
        "value": None,
        "label": None,
        "trend": None,
        "source_name": "CNN Fear & Greed",
        "source_status": "Data unavailable",
        "source_reason": "CNN Fear & Greed feed is unavailable.",
    }


def summarize_fomc_rate_path(series_points):
    if not series_points:
        return None
    latest = series_points[-1]
    latest_value = latest.get("value")
    if latest_value is None:
        return None
    baseline = None
    for point in reversed(series_points[:-1]):
        if point.get("value") is None:
            continue
        if abs(point["value"] - latest_value) >= 0.05:
            baseline = point
            break
    if baseline is None:
        return {
            "current_rate": latest_value,
            "last_change": 0.0,
            "direction": "unchanged",
            "summary": f"Fed funds rate is {latest_value:.2f}% and has not changed recently.",
            "last_change_date": latest.get("date"),
        }
    delta = round(latest_value - baseline["value"], 2)
    direction = "hike" if delta > 0 else "cut"
    summary = (
        f"Fed funds rate is {latest_value:.2f}%. Latest FOMC path points to a {direction} of {abs(delta):.2f}% versus {baseline['date']}."
    )
    return {
        "current_rate": latest_value,
        "last_change": delta,
        "direction": direction,
        "summary": summary,
        "last_change_date": baseline.get("date"),
    }


def parse_google_news_rss(query, market="us", limit=6):
    if not query:
        return []
    if market == "cn":
        hl, gl, ceid = "zh-CN", "CN", "CN:zh-Hans"
    else:
        hl, gl, ceid = "en-US", "US", "US:en"
    url = f"https://news.google.com/rss/search?q={quote_plus(query)}&hl={hl}&gl={gl}&ceid={quote_plus(ceid)}"
    xml_text = http_get_text(url, timeout=8)
    root = ET.fromstring(xml_text)
    articles = []
    seen = set()
    for item in root.findall(".//item"):
        raw_title = unescape(_safe_text(item.findtext("title")))
        if not raw_title:
            continue
        source = None
        headline = raw_title
        if " - " in raw_title:
            headline, source = raw_title.rsplit(" - ", 1)
        headline = headline.strip()
        dedupe_key = headline.lower()
        if not headline or dedupe_key in seen:
            continue
        seen.add(dedupe_key)
        published_at = _safe_text(item.findtext("pubDate"))
        try:
            if published_at:
                published_at = parsedate_to_datetime(published_at).astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        except Exception:
            pass
        articles.append({
            "headline": headline,
            "source": source,
            "link": _safe_text(item.findtext("link")),
            "published_at": published_at,
        })
        if len(articles) >= limit:
            break
    return articles


def normalize_yfinance_news_items(raw_items, limit=6):
    if not raw_items:
        return []
    articles = []
    seen = set()
    for raw in raw_items:
        if not isinstance(raw, dict):
            continue
        content = raw.get("content") if isinstance(raw.get("content"), dict) else {}
        candidate = content or raw
        headline = unescape(_safe_text(candidate.get("title") or raw.get("title")))
        if not headline:
            continue
        dedupe_key = headline.lower()
        if dedupe_key in seen:
            continue
        seen.add(dedupe_key)

        link = (
            _safe_text(candidate.get("canonicalUrl", {}).get("url") if isinstance(candidate.get("canonicalUrl"), dict) else None)
            or _safe_text(candidate.get("clickThroughUrl", {}).get("url") if isinstance(candidate.get("clickThroughUrl"), dict) else None)
            or _safe_text(candidate.get("link"))
            or _safe_text(raw.get("link"))
        )
        source = (
            _safe_text(candidate.get("provider", {}).get("displayName") if isinstance(candidate.get("provider"), dict) else None)
            or _safe_text(raw.get("publisher"))
            or _safe_text(raw.get("provider"))
        )
        published_at = (
            candidate.get("pubDate")
            or raw.get("providerPublishTime")
            or raw.get("published")
            or raw.get("published_at")
        )
        if isinstance(published_at, (int, float)):
            timestamp = published_at / 1000 if published_at > 10_000_000_000 else published_at
            try:
                published_at = datetime.fromtimestamp(timestamp, tz=timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
            except Exception:
                published_at = None
        elif published_at:
            published_at = _safe_text(published_at)

        articles.append({
            "headline": headline,
            "source": source,
            "link": link,
            "published_at": published_at,
        })
        if len(articles) >= limit:
            break
    return articles


def merge_news_articles(primary, fallback, limit=6):
    merged = []
    seen = set()
    for bucket in [primary or [], fallback or []]:
        for article in bucket:
            headline = _safe_text(article.get("headline"))
            if not headline:
                continue
            dedupe_key = headline.lower()
            if dedupe_key in seen:
                continue
            seen.add(dedupe_key)
            merged.append(article)
            if len(merged) >= limit:
                return merged
    return merged


def fetch_yfinance_company_news(symbol, limit=6):
    try:
        ticker = yf.Ticker(symbol)
        raw_items = []
        if hasattr(ticker, "get_news"):
            try:
                raw_items = ticker.get_news(count=limit)
            except TypeError:
                raw_items = ticker.get_news()
            except Exception:
                raw_items = []
        if not raw_items:
            raw_items = getattr(ticker, "news", []) or []
        return normalize_yfinance_news_items(raw_items, limit=limit)
    except Exception:
        return []


def fetch_yfinance_market_news(symbols=None, limit=6):
    merged = []
    seen = set()
    for symbol in (symbols or ["SPY", "QQQ", "^GSPC"]):
        for article in fetch_yfinance_company_news(symbol, limit=limit):
            headline = _safe_text(article.get("headline"))
            if not headline:
                continue
            dedupe_key = headline.lower()
            if dedupe_key in seen:
                continue
            seen.add(dedupe_key)
            merged.append(article)
            if len(merged) >= limit:
                return merged
    return merged


def score_news_articles(articles, fallback_summary, market="company"):
    if not articles:
        return {
            "score": 50,
            "sentiment": None,
            "summary": fallback_summary,
            "key_points": [],
            "bullish_news": [],
            "bearish_news": [],
            "key_catalysts": [],
            "risk_events": [],
        }

    running = 0
    bullish = []
    bearish = []
    key_points = []
    for article in articles:
        headline = _safe_text(article.get("headline"))
        if not headline:
            continue
        lowered = headline.lower()
        positive_hits = sum(1 for keyword in POSITIVE_NEWS_KEYWORDS if keyword.lower() in lowered)
        negative_hits = sum(1 for keyword in NEGATIVE_NEWS_KEYWORDS if keyword.lower() in lowered)
        delta = max(-3, min(3, positive_hits - negative_hits))
        if market == "macro" and any(word in lowered for word in ["tariff", "war", "conflict", "inflation", "hawkish", "antitrust", "probe"]):
            delta -= 1
        running += delta
        label = headline if not article.get("source") else f"{headline} · {article.get('source')}"
        key_points.append(label)
        if delta > 0:
            bullish.append(label)
        elif delta < 0:
            bearish.append(label)

    score = max(25, min(78, int(round(50 + running * 6))))
    sentiment = "neutral"
    if score >= 58:
        sentiment = "bullish"
    elif score <= 42:
        sentiment = "bearish"

    if market == "macro":
        if sentiment == "bullish":
            summary = "Broad macro-news flow is leaning supportive."
        elif sentiment == "bearish":
            summary = "Broad macro-news flow is leaning risk-off."
        else:
            summary = "Macro-news flow is mixed and currently balanced."
    else:
        if sentiment == "bullish":
            summary = "Recent company headlines are leaning constructive."
        elif sentiment == "bearish":
            summary = "Recent company headlines are leaning cautious."
        else:
            summary = "Recent company headlines are mixed."

    return {
        "score": score,
        "sentiment": sentiment,
        "summary": summary,
        "key_points": key_points[:4],
        "bullish_news": bullish[:3],
        "bearish_news": bearish[:3],
        "key_catalysts": bullish[:3],
        "risk_events": bearish[:3],
    }


def classify_macro_events(articles):
    events = []
    for article in articles[:5]:
        headline = _safe_text(article.get("headline"))
        lowered = headline.lower()
        event_type = "other"
        for candidate, pattern in MACRO_EVENT_PATTERNS:
            if pattern.search(lowered):
                event_type = candidate
                break
        impact = "mixed"
        severity = "low"
        if any(word in lowered for word in ["tariff", "war", "conflict", "inflation", "hawkish", "probe", "sanction"]):
            impact = "negative"
            severity = "high" if any(word in lowered for word in ["war", "missile", "sanction", "tariff"]) else "medium"
        elif any(word in lowered for word in ["rate cut", "cooling inflation", "stimulus", "rebound"]):
            impact = "positive"
            severity = "medium"
        events.append({
            "event_type": event_type,
            "headline": headline,
            "summary": headline,
            "affected_sectors": [],
            "affected_tickers": [],
            "impact": impact,
            "severity": severity,
            "source": article.get("source"),
            "link": article.get("link"),
            "published_at": article.get("published_at"),
        })
    return events


def fetch_company_news_payload(ticker, quote):
    symbol = quote.get("symbol") or ticker
    company_name = quote.get("longName") or quote.get("shortName") or ticker
    market = "cn" if is_a_share_ticker(ticker) else "us"
    query = f"{symbol} {company_name} stock"
    if market == "cn":
        query = f"{ticker} {company_name} 股票"
    try:
        google_articles = parse_google_news_rss(query, market=market, limit=6)
        yf_articles = fetch_yfinance_company_news(symbol, limit=6) if market == "us" else []
        articles = merge_news_articles(google_articles, yf_articles, limit=6)
        scored = score_news_articles(
            articles,
            "Recent company-news feed is unavailable, so this module stays neutral.",
            market="company",
        )
        return {
            "sentiment": scored["sentiment"],
            "score": scored["score"],
            "summary": scored["summary"],
            "key_points": scored["key_points"],
            "latest_news": articles[:5],
            "bullish_news": scored["bullish_news"],
            "bearish_news": scored["bearish_news"],
            "key_catalysts": scored["key_catalysts"],
            "risk_events": scored["risk_events"],
            "source_info": build_source_info(
                "Live",
                source_name="Google News RSS / Yahoo Finance",
                suggested_source="Google News RSS / Yahoo Finance / FMP / Polygon",
            ),
        }
    except Exception as exc:
        return {
            "sentiment": None,
            "score": 50,
            "summary": f"Company-news feed unavailable: {exc}",
            "key_points": [],
            "latest_news": [],
            "bullish_news": [],
            "bearish_news": [],
            "key_catalysts": [],
            "risk_events": [],
            "source_info": build_source_info(
                "Data unavailable",
                missing_source="Google News RSS / Yahoo Finance",
                suggested_source="Google News RSS / Yahoo Finance / FMP / Polygon",
                source_name="Company News Feed",
            ),
        }


def fetch_single_symbol_last_close(symbol):
    try:
        history = yf.Ticker(symbol).history(period="5d", interval="1d", auto_adjust=False)
        if history is None or history.empty:
            ticker = yf.Ticker(symbol)
            fast_info = getattr(ticker, "fast_info", {}) or {}
            return _safe_float(
                fast_info.get("lastPrice")
                or fast_info.get("regularMarketPrice")
                or fast_info.get("previousClose")
            )
        closes = history["Close"].dropna()
        if closes.empty:
            ticker = yf.Ticker(symbol)
            fast_info = getattr(ticker, "fast_info", {}) or {}
            return _safe_float(
                fast_info.get("lastPrice")
                or fast_info.get("regularMarketPrice")
                or fast_info.get("previousClose")
            )
        return _safe_float(closes.iloc[-1])
    except Exception:
        return None


def fetch_symbol_history_points(symbol, period="3mo", interval="1d", limit=60, value_scale=1.0):
    try:
        history = yf.Ticker(symbol).history(period=period, interval=interval, auto_adjust=False)
        if history is None or history.empty:
            raise ValueError("empty yfinance history")
        rows = []
        closes = history.get("Close")
        if closes is None:
            raise ValueError("missing close series")
        for index, raw_value in closes.dropna().items():
            value = _safe_float(raw_value)
            if value is None:
                continue
            if hasattr(index, "to_pydatetime"):
                stamp = index.to_pydatetime()
            elif isinstance(index, datetime):
                stamp = index
            else:
                try:
                    stamp = pd.Timestamp(index).to_pydatetime()
                except Exception:
                    stamp = None
            if stamp is None:
                continue
            rows.append({
                "date": stamp.date().isoformat(),
                "value": value * value_scale,
            })
        if rows:
            return rows[-limit:]
    except Exception:
        pass
    yahoo_points = fetch_yahoo_chart_points(symbol, range_value=period, interval=interval, limit=limit, value_scale=value_scale)
    if yahoo_points:
        return yahoo_points
    stooq_rows = fetch_stooq_history_rows(symbol, limit=limit)
    return [
        {"date": row["date"], "value": row["close"] * value_scale}
        for row in stooq_rows
        if row.get("close") is not None
    ][-limit:]


def scale_series_points(series_points, scale):
    if not series_points:
        return []
    return [
        {
            "date": point.get("date"),
            "value": (_safe_float(point.get("value")) * scale) if _safe_float(point.get("value")) is not None else None,
        }
        for point in series_points
        if _safe_float(point.get("value")) is not None
    ]


def fetch_treasury_history_points(limit=40):
    fred_points = fetch_fred_series_points("DGS10", limit=limit)
    if fred_points:
        return fred_points
    yahoo_points = fetch_symbol_history_points("^TNX", period="3mo", interval="1d", limit=limit, value_scale=1.0)
    latest = latest_series_value(yahoo_points)
    if latest is not None and latest > 20:
        return scale_series_points(yahoo_points, 0.1)
    return yahoo_points


def latest_series_value(series_points):
    if not series_points:
        return None
    latest = series_points[-1]
    return _safe_float(latest.get("value"))


def series_change(series_points, sessions_back=5):
    if not series_points or len(series_points) < 2:
        return None
    latest_value = latest_series_value(series_points)
    if latest_value is None:
        return None
    anchor_index = max(0, len(series_points) - 1 - max(1, int(sessions_back)))
    anchor_value = None
    for point in reversed(series_points[:anchor_index + 1]):
        anchor_value = _safe_float(point.get("value"))
        if anchor_value is not None:
            break
    if anchor_value is None:
        return None
    return round(latest_value - anchor_value, 2)


def classify_change_trend(change_5d, change_20d, short_threshold, long_threshold):
    if change_5d is None and change_20d is None:
        return "neutral"
    short_value = change_5d or 0.0
    long_value = change_20d or 0.0
    if short_value >= short_threshold or long_value >= long_threshold:
        return "rising"
    if short_value <= -short_threshold or long_value <= -long_threshold:
        return "falling"
    return "neutral"


def fear_greed_label(value):
    if value is None:
        return None
    if value <= 25:
        return "Extreme Fear"
    if value <= 45:
        return "Fear"
    if value <= 55:
        return "Neutral"
    if value <= 75:
        return "Greed"
    return "Extreme Greed"


def load_market_events():
    try:
        if not os.path.exists(MARKET_EVENTS_FILE):
            return []
        with open(MARKET_EVENTS_FILE, "r", encoding="utf-8") as handle:
            payload = json.load(handle)
        events = payload.get("events", []) if isinstance(payload, dict) else []
        return [event for event in events if isinstance(event, dict)]
    except Exception:
        return []


def parse_iso_date(date_text):
    try:
        return datetime.strptime(str(date_text).strip(), "%Y-%m-%d").date()
    except Exception:
        return None


def find_active_market_event(events, as_of_date=None, lookback_days=3):
    if not events:
        return {
            "active": False,
            "type": None,
            "title": None,
            "impact": None,
            "severity": None,
            "summary": "No recent Fed or macro event is active in the configured window.",
            "date": None,
            "source": "market_events.json",
        }
    today = as_of_date or datetime.now(timezone.utc).date()
    window_start = today - timedelta(days=lookback_days)
    ranked = []
    severity_rank = {"high": 3, "medium": 2, "low": 1}
    for event in events:
        event_date = parse_iso_date(event.get("date"))
        if event_date is None or event_date < window_start or event_date > today:
            continue
        ranked.append((event_date, severity_rank.get(str(event.get("severity", "")).lower(), 0), event))
    if not ranked:
        return {
            "active": False,
            "type": None,
            "title": None,
            "impact": None,
            "severity": None,
            "summary": "No recent Fed or macro event is active in the configured window.",
            "date": None,
            "source": "market_events.json",
        }
    ranked.sort(key=lambda item: (item[0], item[1]), reverse=True)
    chosen = ranked[0][2]
    return {
        "active": True,
        "type": _safe_text(chosen.get("type")),
        "title": _safe_text(chosen.get("title")),
        "impact": _safe_text(chosen.get("impact")),
        "severity": _safe_text(chosen.get("severity")) or "medium",
        "summary": _safe_text(chosen.get("summary")) or _safe_text(chosen.get("title")) or "Recent configured macro event is active.",
        "date": parse_iso_date(chosen.get("date")).isoformat(),
        "source": "market_events.json",
    }


def build_index_trend(symbol, label):
    points = fetch_symbol_history_points(symbol, period="3mo", interval="1d", limit=50)
    if not points:
        return {
            "symbol": symbol,
            "label": label,
            "value": None,
            "change_5d_pct": None,
            "change_20d_pct": None,
            "trend": "neutral",
            "impact": "Data unavailable",
        }
    current_value = latest_series_value(points)
    change_5d = series_change(points, 5)
    change_20d = series_change(points, 20)
    change_5d_pct = None
    change_20d_pct = None
    if current_value is not None and len(points) > 5:
        base_5d = _safe_float(points[max(0, len(points) - 6)].get("value"))
        if base_5d not in (None, 0):
            change_5d_pct = round(((current_value - base_5d) / base_5d) * 100, 2)
    if current_value is not None and len(points) > 20:
        base_20d = _safe_float(points[max(0, len(points) - 21)].get("value"))
        if base_20d not in (None, 0):
            change_20d_pct = round(((current_value - base_20d) / base_20d) * 100, 2)
    trend = "neutral"
    if (change_5d_pct or 0) >= 1.5 and (change_20d_pct or 0) >= 0:
        trend = "rising"
    elif (change_5d_pct or 0) <= -1.5 and (change_20d_pct or 0) <= 0:
        trend = "falling"
    impact = "Neutral"
    if trend == "rising":
        impact = "Supportive equity trend"
    elif trend == "falling":
        impact = "Broad market trend is soft"
    return {
        "symbol": symbol,
        "label": label,
        "value": current_value,
        "change_5d_pct": change_5d_pct,
        "change_20d_pct": change_20d_pct,
        "trend": trend,
        "impact": impact,
    }


def build_strategy_impact_summary(regime, fed_event, fear_greed_label_value):
    buy_stock = "Neutral backdrop for staged stock entries."
    sell_put = "Neutral for cash-secured puts if the strike still sits near support."
    covered_call = "Neutral for covered calls."
    wait_no_action = "Waiting is optional, not mandatory."
    if regime == "risk_off":
        buy_stock = "Risk-off backdrop lowers the quality of aggressive chase entries."
        sell_put = "Sell puts should be more conservative with lower strikes and tighter duration."
        covered_call = "Covered calls become relatively more attractive if upside is capped by resistance."
        wait_no_action = "Waiting or scaling slowly becomes more attractive in a risk-off tape."
    elif regime == "risk_on":
        buy_stock = "Risk-on backdrop is more supportive for staged stock entries."
        sell_put = "Sell puts can stay constructive if the stock also has clean support."
        covered_call = "Covered calls are still usable, but upside capping matters more in a risk-on tape."
        wait_no_action = "Waiting is less necessary unless the stock is stretched."
    if fed_event.get("active") and fed_event.get("type") in {"fed_rate_hike", "fed_hawkish"}:
        sell_put = "Fed hawkish pressure argues for lower put strikes, shorter DTE, and explicit rate-risk caution."
    if fear_greed_label_value == "Extreme Greed":
        covered_call = "Extreme greed raises chase risk, which can make covered calls more attractive near resistance."
    return {
        "buy_stock": buy_stock,
        "sell_put": sell_put,
        "covered_call": covered_call,
        "wait_no_action": wait_no_action,
    }


def fetch_market_context_payload():
    vix_points = fetch_fred_series_points("VIXCLS", limit=40) or fetch_symbol_history_points("^VIX", period="3mo", interval="1d", limit=40)
    vix = latest_series_value(vix_points)
    vix_5d_change = series_change(vix_points, 5)
    vix_20d_change = series_change(vix_points, 20)
    vix_trend = classify_change_trend(vix_5d_change, vix_20d_change, 1.0, 2.5)
    treasury_points = fetch_treasury_history_points(limit=40)
    treasury_yield = latest_series_value(treasury_points)
    yield_5d_change = series_change(treasury_points, 5)
    yield_20d_change = series_change(treasury_points, 20)
    yield_5d_change_bps = round(yield_5d_change * 100, 1) if yield_5d_change is not None else None
    yield_20d_change_bps = round(yield_20d_change * 100, 1) if yield_20d_change is not None else None
    yield_trend = classify_change_trend(yield_5d_change_bps, yield_20d_change_bps, 10.0, 25.0)
    fed_funds_points = fetch_fred_series_points("DFF", limit=180)
    fed_funds_value = fed_funds_points[-1]["value"] if fed_funds_points else None
    fomc_rate_path = summarize_fomc_rate_path(fed_funds_points)
    fear_greed_snapshot = fetch_fear_greed_snapshot()
    fear_greed = fear_greed_snapshot.get("value")
    fear_greed_label_value = fear_greed_snapshot.get("label") or fear_greed_label(fear_greed)
    active_event = find_active_market_event(load_market_events(), datetime.now(timezone.utc).date(), lookback_days=3)
    spy_trend = build_index_trend("SPY", "SPY")
    qqq_trend = build_index_trend("QQQ", "QQQ")
    macro_articles = []
    try:
        macro_articles = parse_google_news_rss("tariff war fed rates inflation fomc sanctions oil geopolitical regulation", market="us", limit=6)
    except Exception:
        macro_articles = []
    if not macro_articles:
        macro_articles = fetch_yfinance_market_news(["SPY", "QQQ", "^GSPC", "^IXIC"], limit=6)
    filtered_events = classify_macro_events(macro_articles)
    macro_articles = [article for article, event in zip(macro_articles, filtered_events) if event.get("event_type") != "other"] or macro_articles
    macro_news = score_news_articles(
        macro_articles,
        "Broad macro-news feed is currently unavailable, so macro stays neutral.",
        market="macro",
    )
    broad_events = [event for event in classify_macro_events(macro_articles) if event.get("event_type") != "other"][:5]
    base_score = 50
    vix_delta = 0
    vix_momentum_delta = 0
    if vix is not None:
        if vix < 15:
            vix_delta = 5
        elif vix <= 20:
            vix_delta = 0
        elif vix <= 30:
            vix_delta = -5
        else:
            vix_delta = -10
        if (vix_5d_change or 0) >= 2:
            vix_momentum_delta = -5
        elif (vix_5d_change or 0) <= -2:
            vix_momentum_delta = 2

    yield_delta = 0
    if yield_5d_change_bps is not None:
        if yield_5d_change_bps >= 10:
            yield_delta -= 5
        elif yield_5d_change_bps <= -10:
            yield_delta += 3
    if yield_20d_change_bps is not None:
        if yield_20d_change_bps >= 25:
            yield_delta -= 8
        elif yield_20d_change_bps <= -25:
            yield_delta += 5

    fear_greed_short_delta = 0
    fear_greed_long_delta = 0
    if fear_greed_label_value == "Extreme Fear":
        fear_greed_short_delta = -5
        fear_greed_long_delta = 3
    elif fear_greed_label_value == "Fear":
        fear_greed_short_delta = -2
    elif fear_greed_label_value == "Greed":
        fear_greed_short_delta = -2
    elif fear_greed_label_value == "Extreme Greed":
        fear_greed_short_delta = -6

    fed_short_delta = 0
    fed_mid_delta = 0
    fed_long_delta = 0
    fed_type = active_event.get("type")
    fed_summary_lower = _safe_text(active_event.get("summary")).lower()
    if active_event.get("active") and fed_type in {"fed_rate_hike", "fed_hawkish"}:
        fed_short_delta = -8
        fed_mid_delta = -6
        fed_long_delta = -3
    elif active_event.get("active") and fed_type in {"fed_rate_cut", "fed_dovish"}:
        if any(word in fed_summary_lower for word in ["recession", "slowdown", "stress", "weakness"]):
            fed_short_delta = 1
            fed_mid_delta = 0
            fed_long_delta = -1
        else:
            fed_short_delta = 5
            fed_mid_delta = 5
            fed_long_delta = 2

    equity_trend_delta = 0
    rising_indices = [item for item in [spy_trend, qqq_trend] if item.get("trend") == "rising"]
    falling_indices = [item for item in [spy_trend, qqq_trend] if item.get("trend") == "falling"]
    if len(rising_indices) == 2:
        equity_trend_delta = 4
    elif len(falling_indices) == 2:
        equity_trend_delta = -4

    macro_news_delta = 0
    if macro_news["sentiment"] == "bullish":
        macro_news_delta = 2
    elif macro_news["sentiment"] == "bearish":
        macro_news_delta = -2

    macro_score = base_score + vix_delta + vix_momentum_delta + yield_delta + fear_greed_short_delta + fed_short_delta + equity_trend_delta + macro_news_delta
    macro_score = max(25, min(85, int(round(macro_score))))

    missing_core_count = 0
    missing_core_count += 0 if vix is not None else 1
    missing_core_count += 0 if treasury_yield is not None else 1
    missing_core_count += 0 if fear_greed is not None else 1
    missing_core_count += 0 if fed_funds_value is not None else 1
    missing_core_count += 0 if spy_trend.get("value") is not None or qqq_trend.get("value") is not None else 1
    confidence = max(42, min(95, 88 - missing_core_count * 10 - (0 if macro_articles else 5)))

    regime = "neutral"
    if active_event.get("active") and fed_type in {"fed_rate_hike", "fed_hawkish"}:
        regime = "risk_off"
    elif macro_score <= 45:
        regime = "risk_off"
    elif macro_score >= 60:
        regime = "risk_on"

    vix_impact = "Neutral volatility backdrop."
    if vix is None:
        vix_impact = "Data unavailable"
    elif vix > 30:
        vix_impact = "High volatility is a clear short-term risk-off signal."
    elif vix >= 20:
        vix_impact = "Elevated volatility keeps short-term risk appetite in check."
    elif vix < 15:
        vix_impact = "Low volatility is supportive for risk appetite."

    yield_impact = "Neutral yield backdrop."
    if treasury_yield is None:
        yield_impact = "Data unavailable"
    elif yield_trend == "rising":
        yield_impact = "Rising 10Y yield is usually negative for high multiple, REIT, and rate-sensitive stocks."
    elif yield_trend == "falling":
        yield_impact = "Falling 10Y yield is generally supportive for duration-sensitive equities."

    fear_greed_impact = "Neutral sentiment read."
    if fear_greed_label_value == "Extreme Fear":
        fear_greed_impact = "Extreme fear raises short-term caution but can create medium-term opportunity."
    elif fear_greed_label_value == "Fear":
        fear_greed_impact = "Fear argues for more patient entries in the short term."
    elif fear_greed_label_value == "Greed":
        fear_greed_impact = "Greed raises short-term chasing risk."
    elif fear_greed_label_value == "Extreme Greed":
        fear_greed_impact = "Extreme greed raises chase risk and can favor covered-call style positioning."

    trend_summary = "Broad index trend is mixed."
    if len(rising_indices) == 2:
        trend_summary = "SPY and QQQ are both trending higher, which is supportive for risk appetite."
    elif len(falling_indices) == 2:
        trend_summary = "SPY and QQQ are both soft, which keeps the backdrop risk-off."

    market_summary = "Market environment is balanced."
    if regime == "risk_off":
        market_summary = "Market environment is leaning risk-off due to volatility, yields, or a hawkish macro event."
    elif regime == "risk_on":
        market_summary = "Market environment is leaning risk-on with supportive volatility, yield, and index trends."

    macro_summary_bits = []
    if vix is not None:
        macro_summary_bits.append(f"VIX {vix:.1f}")
    if fear_greed is not None:
        macro_summary_bits.append(f"Fear & Greed {fear_greed:.0f}/100 ({fear_greed_label_value})")
    if treasury_yield is not None:
        macro_summary_bits.append(f"10Y {treasury_yield:.2f}%")
    if fed_funds_value is not None:
        macro_summary_bits.append(f"Fed funds {fed_funds_value:.2f}%")
    macro_summary_bits.append(market_summary)
    if active_event.get("active") and active_event.get("summary"):
        macro_summary_bits.append(active_event["summary"])

    market_context = {
        "score": macro_score,
        "regime": regime,
        "confidence": confidence,
        "vix": {
            "value": vix,
            "change_5d": vix_5d_change,
            "change_20d": vix_20d_change,
            "trend": vix_trend,
            "impact": vix_impact,
        },
        "fear_greed": {
            "value": fear_greed,
            "label": fear_greed_label_value,
            "trend": fear_greed_snapshot.get("trend"),
            "impact": fear_greed_impact,
        },
        "ten_year_yield": {
            "value": treasury_yield,
            "change_5d_bps": yield_5d_change_bps,
            "change_20d_bps": yield_20d_change_bps,
            "trend": yield_trend,
            "impact": yield_impact,
        },
        "fed_event": active_event,
        "equity_trend": {
            "spy": spy_trend,
            "qqq": qqq_trend,
            "summary": trend_summary,
            "impact": "supportive" if equity_trend_delta > 0 else "cautious" if equity_trend_delta < 0 else "neutral",
        },
        "summary": market_summary,
        "breakdown": {
            "base": base_score,
            "vix": vix_delta,
            "vix_momentum": vix_momentum_delta,
            "fear_greed_short": fear_greed_short_delta,
            "fear_greed_long": fear_greed_long_delta,
            "ten_year_yield": yield_delta,
            "fed_event_short": fed_short_delta,
            "fed_event_mid": fed_mid_delta,
            "fed_event_long": fed_long_delta,
            "equity_trend": equity_trend_delta,
            "macro_news": macro_news_delta,
            "final_score": macro_score,
        },
        "strategy_impact": build_strategy_impact_summary(regime, active_event, fear_greed_label_value),
        "source_info": {
            "vix": build_source_info("Live" if vix is not None else "Data unavailable", missing_source="Cboe / FRED / Yahoo Finance", suggested_source="FRED VIXCLS / Yahoo Finance ^VIX / Cboe", source_name="FRED VIXCLS"),
            "fear_greed": build_source_info(
                fear_greed_snapshot.get("source_status") or ("Live" if fear_greed is not None else "Data unavailable"),
                missing_source=fear_greed_snapshot.get("source_reason") or "CNN Fear & Greed",
                suggested_source="CNN Fear & Greed direct endpoint / CNN scraper / RapidAPI / custom in-house sentiment composite.",
                source_name=fear_greed_snapshot.get("source_name") or "Fear & Greed",
            ),
            "ten_year_yield": build_source_info("Live" if treasury_yield is not None else "Data unavailable", missing_source="FRED DGS10 / Yahoo Finance ^TNX", suggested_source="FRED DGS10 / Yahoo Finance ^TNX / Alpha Vantage", source_name="FRED DGS10"),
            "fed_event": build_source_info("Live", missing_source="Economic calendar / market_events.json", suggested_source="FMP Economic Calendar / Alpha Vantage / market_events.json", source_name="market_events.json"),
            "equity_trend": build_source_info("Live" if spy_trend.get("value") is not None or qqq_trend.get("value") is not None else "Data unavailable", missing_source="Yahoo Finance SPY / QQQ", suggested_source="Yahoo Finance SPY / QQQ", source_name="Yahoo Finance"),
        },
    }

    return {
        "macro": {
            "vix": vix,
            "fear_greed": fear_greed,
            "treasury_yield": treasury_yield,
            "fed_funds_rate": fed_funds_value,
            "fomc_rate_path": fomc_rate_path,
            "score": macro_score,
            "summary": " · ".join(macro_summary_bits) if macro_summary_bits else "Macro data is neutral due to missing live feeds.",
            "source_info": {
                "vix": build_source_info("Live" if vix is not None else "Data unavailable", missing_source="Cboe / FRED / Yahoo Finance", suggested_source="FRED VIXCLS / Yahoo Finance ^VIX / Cboe", source_name="FRED VIXCLS"),
                "fear_greed": build_source_info(
                    fear_greed_snapshot.get("source_status") or ("Live" if fear_greed is not None else "Data unavailable"),
                    missing_source=fear_greed_snapshot.get("source_reason") or "CNN Fear & Greed",
                    suggested_source="CNN Fear & Greed direct endpoint / CNN scraper / RapidAPI / custom in-house sentiment composite.",
                    source_name=fear_greed_snapshot.get("source_name") or "Fear & Greed",
                ),
                "treasury_yield": build_source_info("Live" if treasury_yield is not None else "Data unavailable", missing_source="FRED / Yahoo Finance ^TNX", suggested_source="FRED DGS10 / Yahoo Finance ^TNX / Alpha Vantage", source_name="FRED DGS10"),
                "fed_funds_rate": build_source_info("Live" if fed_funds_value is not None else "Data unavailable", missing_source="FRED DFF / FEDFUNDS", suggested_source="FRED DFF / FEDFUNDS", source_name="FRED"),
                "fomc_rate_path": build_source_info("Live" if fomc_rate_path is not None else "Data unavailable", missing_source="Federal Reserve / FRED", suggested_source="Federal Reserve FOMC / FRED DFF", source_name="FRED / Federal Reserve"),
                "market_events": build_source_info("Live", missing_source="Economic calendar / market_events.json", suggested_source="FMP Economic Calendar / Alpha Vantage / market_events.json", source_name="market_events.json"),
                "equity_trend": build_source_info("Live" if spy_trend.get("value") is not None or qqq_trend.get("value") is not None else "Data unavailable", missing_source="Yahoo Finance SPY / QQQ", suggested_source="Yahoo Finance SPY / QQQ", source_name="Yahoo Finance"),
            },
        },
        "market_context": market_context,
        "broad_macro_news": {
            "score": macro_news["score"],
            "sentiment": macro_news["sentiment"],
            "major_events": broad_events,
            "summary": macro_news["summary"],
            "source_info": build_source_info(
                "Live" if macro_articles else "Data unavailable",
                missing_source="Broad market news feed",
                suggested_source="Google News RSS / Reuters / FMP Market News / Alpha Vantage News",
                source_name="Google News RSS",
            ),
        },
    }


def get_cached_company_news(ticker, quote):
    cache_key = f"{ticker}:{quote.get('updatedAt') or 'na'}"
    now = time.time()
    cached = COMPANY_NEWS_CACHE.get(cache_key)
    if cached and cached["expiresAt"] > now:
        return cached["value"]
    value = fetch_company_news_payload(ticker, quote)
    COMPANY_NEWS_CACHE[cache_key] = {
        "value": value,
        "expiresAt": now + NEWS_CACHE_SECONDS,
    }
    return value


def get_cached_market_context():
    now = time.time()
    cached = MARKET_CONTEXT_CACHE.get("value")
    if cached and MARKET_CONTEXT_CACHE["expiresAt"] > now:
        cached_vix = ((cached.get("market_context") or {}).get("vix") or {}).get("value")
        cached_yield = ((cached.get("market_context") or {}).get("ten_year_yield") or {}).get("value")
        cached_fear_greed = ((cached.get("market_context") or {}).get("fear_greed") or {}).get("value")
        cache_age_budget = MARKET_CONTEXT_CACHE["expiresAt"] - now
        critical_missing = cached_vix is None or cached_yield is None or cached_fear_greed is None
        if not critical_missing or cache_age_budget > (NEWS_CACHE_SECONDS - 90):
            return cached
    value = fetch_market_context_payload()
    MARKET_CONTEXT_CACHE["value"] = value
    MARKET_CONTEXT_CACHE["expiresAt"] = now + NEWS_CACHE_SECONDS
    return value


def build_unavailable_options_payload(reason, market="us"):
    return {
        "available": False,
        "market": market,
        "reason": reason,
        "callWall": None,
        "putWall": None,
        "gammaFlip": None,
        "impliedVolatility": None,
        "historicVolatility": None,
        "ivPercentile": None,
        "ivRank": None,
        "netGammaExposure": None,
        "expiries": [],
        "nearestExpiry": None,
        "updatedAt": None,
        "coverage": "none",
    }


def build_unavailable_quote(ticker, reason, stale_value=None):
    base = stale_value.copy() if isinstance(stale_value, dict) else {}
    metadata = base.get("metadata") if isinstance(base.get("metadata"), dict) else {}
    history = base.get("history") if isinstance(base.get("history"), dict) else {}
    return {
        "price": base.get("price"),
        "previousClose": base.get("previousClose"),
        "change": base.get("change"),
        "changePercent": base.get("changePercent"),
        "updatedAt": base.get("updatedAt"),
        "symbol": base.get("symbol") or resolve_market_symbol(ticker),
        "shortName": base.get("shortName"),
        "longName": base.get("longName"),
        "exchangeName": base.get("exchangeName"),
        "trailingPE": base.get("trailingPE"),
        "forwardPE": base.get("forwardPE"),
        "marketCap": base.get("marketCap"),
        "metadata": {
            "sector": metadata.get("sector"),
            "industry": metadata.get("industry"),
            "beta": metadata.get("beta"),
            "dividendYield": metadata.get("dividendYield"),
            "payoutRatio": metadata.get("payoutRatio"),
            "enterpriseToEbitda": metadata.get("enterpriseToEbitda"),
            "priceToSalesTrailing12Months": metadata.get("priceToSalesTrailing12Months"),
            "enterpriseToRevenue": metadata.get("enterpriseToRevenue"),
            "pegRatio": metadata.get("pegRatio"),
            "priceToFreeCashflow": metadata.get("priceToFreeCashflow"),
            "operatingMargins": metadata.get("operatingMargins"),
            "profitMargins": metadata.get("profitMargins"),
            "revenueGrowth": metadata.get("revenueGrowth"),
            "grossMargins": metadata.get("grossMargins"),
            "returnOnEquity": metadata.get("returnOnEquity"),
            "debtToEquity": metadata.get("debtToEquity"),
            "currentRatio": metadata.get("currentRatio"),
            "quickRatio": metadata.get("quickRatio"),
            "freeCashflow": metadata.get("freeCashflow"),
            "totalCash": metadata.get("totalCash"),
            "totalDebt": metadata.get("totalDebt"),
            "capex": metadata.get("capex"),
            "businessSummary": metadata.get("businessSummary"),
            "country": metadata.get("country"),
            "city": metadata.get("city"),
            "state": metadata.get("state"),
            "exchange": metadata.get("exchange"),
            "quoteType": metadata.get("quoteType"),
            "ipoDate": metadata.get("ipoDate"),
            "floatShares": metadata.get("floatShares"),
            "sharesOutstanding": metadata.get("sharesOutstanding"),
        },
        "optionsMarket": base.get("optionsMarket") or build_unavailable_options_payload(
            reason,
            market="cn" if is_a_share_ticker(ticker) else "us",
        ),
        "history": {
            "timestamps": history.get("timestamps", []),
            "closes": history.get("closes", []),
            "highs": history.get("highs", []),
            "lows": history.get("lows", []),
            "volumes": history.get("volumes", []),
        },
        "error": reason,
        "stale": bool(stale_value),
        "marketStatus": "closed" if stale_value else "unavailable",
        "dataStaleness": "stale" if stale_value else "unavailable",
        "last_successful_update": base.get("last_successful_update") or base.get("updatedAt"),
    }


def _norm_pdf(value):
    return math.exp(-0.5 * value * value) / math.sqrt(2 * math.pi)


def _weighted_average(values):
    weighted_total = 0.0
    total_weight = 0.0
    for value, weight in values:
        if value is None or weight is None or weight <= 0 or not math.isfinite(value) or not math.isfinite(weight):
            continue
        weighted_total += value * weight
        total_weight += weight
    if total_weight <= 0:
        return None
    return weighted_total / total_weight


def _run_with_timeout(func, timeout_seconds, fallback=None):
    result_queue = queue.Queue(maxsize=1)

    def worker():
        try:
            result_queue.put(("ok", func()))
        except Exception as exc:
            result_queue.put(("error", exc))

    thread = threading.Thread(target=worker, daemon=True)
    thread.start()

    try:
        status, payload = result_queue.get(timeout=timeout_seconds)
    except queue.Empty:
        return fallback

    if status == "error":
        return fallback
    return payload


def _median(values):
    filtered = sorted(
        value for value in (values or [])
        if value is not None and math.isfinite(value)
    )
    if not filtered:
        return None
    midpoint = len(filtered) // 2
    if len(filtered) % 2 == 1:
        return filtered[midpoint]
    return (filtered[midpoint - 1] + filtered[midpoint]) / 2


def _standard_deviation(values):
    filtered = [
        value for value in (values or [])
        if value is not None and math.isfinite(value)
    ]
    if len(filtered) < 2:
        return None
    average = sum(filtered) / len(filtered)
    variance = sum((value - average) ** 2 for value in filtered) / (len(filtered) - 1)
    if variance < 0 or not math.isfinite(variance):
        return None
    return math.sqrt(variance)


def _weighted_median(values):
    filtered = sorted(
        (
            (value, weight)
            for value, weight in (values or [])
            if value is not None and weight is not None and weight > 0 and math.isfinite(value) and math.isfinite(weight)
        ),
        key=lambda item: item[0],
    )
    if not filtered:
        return None
    total_weight = sum(weight for _, weight in filtered)
    threshold = total_weight / 2
    running = 0.0
    for value, weight in filtered:
        running += weight
        if running >= threshold:
            return value
    return filtered[-1][0]


def _annualized_volatility(returns):
    if returns is None or len(returns) < 2:
        return None
    mean_return = sum(returns) / len(returns)
    variance = sum((value - mean_return) ** 2 for value in returns) / (len(returns) - 1)
    if variance < 0 or not math.isfinite(variance):
        return None
    return math.sqrt(variance) * math.sqrt(252) * 100


def _close_to_close_volatility(closes, window):
    if closes is None or len(closes) < window:
        return None
    window_closes = closes[-window:]
    returns = []
    for previous_close, current_close in zip(window_closes, window_closes[1:]):
        previous_close = _safe_float(previous_close)
        current_close = _safe_float(current_close)
        if previous_close is None or current_close is None or previous_close <= 0 or current_close <= 0:
            continue
        returns.append(math.log(current_close / previous_close))
    return _annualized_volatility(returns)


def _parkinson_volatility(highs, lows, window):
    if highs is None or lows is None or len(highs) < window or len(lows) < window:
        return None
    window_highs = highs[-window:]
    window_lows = lows[-window:]
    log_ranges = []
    for high_value, low_value in zip(window_highs, window_lows):
        high_value = _safe_float(high_value)
        low_value = _safe_float(low_value)
        if high_value is None or low_value is None or high_value <= 0 or low_value <= 0 or high_value < low_value:
            continue
        log_ranges.append(math.log(high_value / low_value) ** 2)
    if not log_ranges:
        return None
    variance = sum(log_ranges) / (4 * len(log_ranges) * math.log(2))
    if variance < 0 or not math.isfinite(variance):
        return None
    return math.sqrt(variance) * math.sqrt(252) * 100


def _estimate_historic_volatility(closes, highs, lows):
    hv20 = _close_to_close_volatility(closes, 20)
    if hv20 is not None and math.isfinite(hv20):
        return hv20
    components = [
        (_close_to_close_volatility(closes, 30), 0.65),
        (_parkinson_volatility(highs, lows, 20), 0.35),
    ]
    return _weighted_average(components)


def _rolling_historic_volatility_proxy(closes, highs, lows, min_history=40):
    if closes is None or highs is None or lows is None:
        return []
    series = []
    length = min(len(closes), len(highs), len(lows))
    for end_index in range(min_history, length + 1):
        value = _estimate_historic_volatility(
            closes[:end_index],
            highs[:end_index],
            lows[:end_index],
        )
        if value is not None and math.isfinite(value):
            series.append(value)
    return series


def _build_iv_history_proxy(rolling_hv_series):
    if not rolling_hv_series:
        return []
    long_run_hv = _median(rolling_hv_series)
    if long_run_hv is None or long_run_hv <= 0:
        return []
    hv_vol_of_vol = _standard_deviation(rolling_hv_series)
    normalized_vol_of_vol = (hv_vol_of_vol / long_run_hv) if hv_vol_of_vol is not None and long_run_hv > 0 else 0.0
    base_premium = max(1.04, min(1.28, 1.05 + (min(long_run_hv, 100) / 100 * 0.18) + (min(normalized_vol_of_vol, 1.0) * 0.08)))
    regime_reactivity = max(0.32, min(0.52, 0.34 + (min(normalized_vol_of_vol, 1.0) * 0.10) + (min(long_run_hv, 100) / 100 * 0.06)))
    anchor = long_run_hv * base_premium
    proxy_series = []
    for hv_value in rolling_hv_series:
        proxy_value = anchor + ((hv_value - long_run_hv) * regime_reactivity)
        proxy_series.append(max(proxy_value, long_run_hv * 0.55))
    return proxy_series


def _estimate_iv_regime_metrics(current_iv, closes, highs, lows):
    historic_volatility = _estimate_historic_volatility(closes, highs, lows)
    if current_iv is None or not math.isfinite(current_iv):
        return {
            "historicVolatility": historic_volatility,
            "ivPercentile": None,
            "ivRank": None,
        }

    rolling_hv_series = _rolling_historic_volatility_proxy(closes, highs, lows)
    proxy_series = _build_iv_history_proxy(rolling_hv_series)
    if not proxy_series:
        return {
            "historicVolatility": historic_volatility,
            "ivPercentile": None,
            "ivRank": None,
        }

    proxy_min = min(proxy_series)
    proxy_max = max(proxy_series)
    proxy_range = proxy_max - proxy_min
    iv_rank = None
    if proxy_range > 0:
        iv_rank = max(0.0, min(100.0, ((current_iv - proxy_min) / proxy_range) * 100))

    observations_below = sum(1 for value in proxy_series if value <= current_iv)
    iv_percentile = max(0.0, min(100.0, (observations_below / len(proxy_series)) * 100))

    return {
        "historicVolatility": historic_volatility,
        "ivPercentile": iv_percentile,
        "ivRank": iv_rank,
    }


def _frame_atm_iv_candidates(frame, spot_price, max_distance=0.06, limit=2):
    if frame is None or frame.empty or spot_price is None or spot_price <= 0:
        return []
    candidates = []
    for _, row in frame.iterrows():
        strike = _safe_float(row.get("strike"))
        implied_volatility = _safe_float(row.get("impliedVolatility"))
        open_interest = max(_safe_int(row.get("openInterest")) or 0, 0)
        volume = max(_safe_int(row.get("volume")) or 0, 0)
        if (
            strike is None
            or implied_volatility is None
            or implied_volatility <= 0
            or implied_volatility > 8
        ):
            continue
        distance = abs(strike - spot_price) / max(spot_price, 1)
        if distance > max_distance:
            continue
        liquidity = open_interest + (volume * 0.35)
        candidates.append({
            "iv": implied_volatility * 100,
            "distance": distance,
            "liquidity": liquidity,
        })
    return sorted(
        candidates,
        key=lambda item: (item["distance"], -item["liquidity"]),
    )[:limit]


def _estimate_expiry_atm_iv(calls_frame, puts_frame, spot_price, dte):
    call_candidates = _frame_atm_iv_candidates(calls_frame, spot_price)
    put_candidates = _frame_atm_iv_candidates(puts_frame, spot_price)
    candidates = call_candidates + put_candidates
    if not candidates:
        return None

    raw_center = _median([candidate["iv"] for candidate in candidates])
    filtered_candidates = [
        candidate for candidate in candidates
        if raw_center
        and abs(candidate["iv"] - raw_center) / max(raw_center, 1) <= 0.22
    ] or candidates

    expiry_weight = 1 / (1 + (abs(dte - 30) / 12))
    weighted_candidates = [
        (
            candidate["iv"],
            expiry_weight
            * (1 / (1 + ((candidate["distance"] / 0.01) ** 2)))
            * (1 + min(1.0, math.log1p(candidate["liquidity"]) / 6.0)),
        )
        for candidate in filtered_candidates
    ]
    weighted_iv = _weighted_average(weighted_candidates)
    if weighted_iv is None:
        return None

    weighted_center = _weighted_median(weighted_candidates) or weighted_iv
    if abs(weighted_iv - weighted_center) / max(weighted_center, 1) > 0.08:
        weighted_iv = (weighted_iv * 0.4) + (weighted_center * 0.6)

    total_liquidity = sum(candidate["liquidity"] for candidate in filtered_candidates)
    observation_weight = expiry_weight * max(0.75, 0.8 + min(0.9, math.log1p(total_liquidity) / 8.0))
    return weighted_iv, observation_weight


def _estimate_implied_volatility(expiry_samples):
    if not expiry_samples:
        return None
    weighted_center = _weighted_median(expiry_samples)
    if weighted_center is None:
        return _weighted_average(expiry_samples)
    filtered = [
        (value, weight)
        for value, weight in expiry_samples
        if abs(value - weighted_center) / max(weighted_center, 1) <= 0.16
    ] or expiry_samples
    return _weighted_average(filtered)


def _black_scholes_gamma(spot_price, strike, implied_volatility, time_years, risk_free_rate=0.0):
    if (
        spot_price is None
        or strike is None
        or implied_volatility is None
        or spot_price <= 0
        or strike <= 0
        or implied_volatility <= 0
        or time_years <= 0
        or not math.isfinite(implied_volatility)
    ):
        return 0.0
    try:
        numerator = math.log(spot_price / strike) + (risk_free_rate + 0.5 * implied_volatility * implied_volatility) * time_years
        denominator = implied_volatility * math.sqrt(time_years)
        if denominator <= 0:
            return 0.0
        d1 = numerator / denominator
        return _norm_pdf(d1) / (spot_price * implied_volatility * math.sqrt(time_years))
    except Exception:
        return 0.0


def _estimate_option_gamma_exposure(spot_price, strike, implied_volatility, time_years, open_interest):
    gamma = _black_scholes_gamma(spot_price, strike, implied_volatility, time_years)
    if gamma <= 0 or open_interest <= 0:
        return 0.0
    # Approximate dealer gamma exposure for a 1% move.
    return gamma * open_interest * 100 * (spot_price ** 2) * 0.01


def _aggregate_option_metrics(frame, bucket, contracts, spot_price, time_years, side):
    if frame is None or frame.empty:
        return
    expiry_seen = set()
    for _, row in frame.iterrows():
        strike = _safe_float(row.get("strike"))
        open_interest = _safe_int(row.get("openInterest")) or 0
        volume = _safe_int(row.get("volume")) or 0
        implied_volatility = _safe_float(row.get("impliedVolatility"))
        if strike is None or open_interest <= 0:
            continue
        normalized_strike = round(strike, 2)
        gamma_exposure = _estimate_option_gamma_exposure(
            spot_price,
            normalized_strike,
            implied_volatility,
            time_years,
            open_interest,
        )
        item = bucket.setdefault(normalized_strike, {"openInterest": 0, "volume": 0, "gammaExposure": 0.0, "expiryCount": 0})
        item["openInterest"] += max(0, open_interest)
        item["volume"] += max(0, volume)
        item["gammaExposure"] += max(0.0, gamma_exposure)
        if normalized_strike not in expiry_seen:
            item["expiryCount"] += 1
            expiry_seen.add(normalized_strike)
        contracts.append({
            "strike": normalized_strike,
            "openInterest": max(0, open_interest),
            "volume": max(0, volume),
            "impliedVolatility": implied_volatility,
            "timeYears": time_years,
            "daysToExpiry": max(1, int(round(time_years * 365))),
            "side": side,
            "gammaExposure": gamma_exposure,
        })


def _is_round_wall_strike(strike, spot_price):
    if strike is None:
        return False
    scaled = abs(strike)
    if scaled >= 100:
        return abs(strike % 50) < 1e-6 or abs(strike % 100) < 1e-6
    if scaled >= 30:
        return abs(strike % 10) < 1e-6 or abs(strike % 5) < 1e-6
    return abs((strike * 2) - round(strike * 2)) < 1e-6


def _wall_round_strength(strike):
    if strike is None:
        return 0
    scaled = abs(strike)

    def hits(modulus):
        remainder = strike % modulus
        return abs(remainder) < 1e-6 or abs(remainder - modulus) < 1e-6

    if scaled >= 100:
        if hits(100):
            return 4
        if hits(50):
            return 3
        if hits(25):
            return 2
        if hits(10):
            return 1
        return 0
    if scaled >= 30:
        if hits(10):
            return 3
        if hits(5):
            return 2
        if hits(2.5):
            return 1
        return 0
    if abs(strike - round(strike)) < 1e-6:
        return 3
    if abs((strike * 2) - round(strike * 2)) < 1e-6:
        return 1
    return 0


def _call_wall_score(strike, payload, spot_price, metric_key, max_open_interest, max_expiry_count):
    gamma_value = max(payload.get(metric_key) or 0, 0)
    if gamma_value <= 0:
        return 0.0
    open_interest = max(payload.get("openInterest", 0), 0)
    expiry_count = max(payload.get("expiryCount", 0), 0)
    volume = max(payload.get("volume", 0), 0)
    open_interest_ratio = math.sqrt(open_interest / max(max_open_interest, 1))
    expiry_ratio = expiry_count / max(max_expiry_count, 1)
    volume_factor = math.log1p(volume) / 12.0
    distance_ratio = abs(strike - spot_price) / max(spot_price, 1)
    distance_multiplier = max(0.83, 1.0 - max(distance_ratio - 0.18, 0.0) * 0.3)
    if spot_price > 0 and strike >= spot_price * 1.08 and strike <= spot_price * 1.35:
        distance_multiplier *= 1.02
    if spot_price > 0 and strike >= spot_price and strike <= spot_price * 1.03 and open_interest_ratio < 0.75:
        distance_multiplier *= 0.94
    round_bonus = 0.08 if _is_round_wall_strike(strike, spot_price) else 0.0
    structure_multiplier = 1 + (0.42 * open_interest_ratio) + (0.12 * expiry_ratio) + (0.02 * volume_factor) + round_bonus
    return gamma_value * structure_multiplier * distance_multiplier


def _put_wall_score(strike, payload, spot_price, metric_key, max_open_interest, max_expiry_count):
    gamma_value = max(payload.get(metric_key) or 0, 0)
    if gamma_value <= 0:
        return 0.0
    open_interest = max(payload.get("openInterest", 0), 0)
    expiry_count = max(payload.get("expiryCount", 0), 0)
    volume = max(payload.get("volume", 0), 0)
    open_interest_ratio = math.sqrt(open_interest / max(max_open_interest, 1))
    expiry_ratio = expiry_count / max(max_expiry_count, 1)
    volume_factor = math.log1p(volume) / 12.0
    relative_strike = strike / max(spot_price, 1)
    above_penalty = max(relative_strike - 1.05, 0.0)
    below_penalty = max((1 - relative_strike) - 0.25, 0.0)
    distance_multiplier = max(0.82, 1.0 - (above_penalty * 0.65) - (below_penalty * 0.15))
    round_bonus = 0.08 if _is_round_wall_strike(strike, spot_price) else 0.0
    structure_multiplier = 1 + (0.40 * open_interest_ratio) + (0.12 * expiry_ratio) + (0.02 * volume_factor) + round_bonus
    return gamma_value * structure_multiplier * distance_multiplier


def _pick_wall(bucket, spot_price, side="call", metric_key="gammaExposure"):
    if not bucket:
        return None
    if side == "put":
        strike_floor = max(0.01, spot_price * 0.8)
        strike_ceiling = spot_price * 1.15
    else:
        strike_floor = max(0.01, spot_price * 0.85)
        strike_ceiling = spot_price * 1.8
    eligible = {
        strike: payload
        for strike, payload in bucket.items()
        if strike_floor <= strike <= strike_ceiling
    } or bucket
    max_open_interest = max((max(payload.get("openInterest", 0), 0) for payload in eligible.values()), default=1)
    max_expiry_count = max((max(payload.get("expiryCount", 0), 0) for payload in eligible.values()), default=1)
    if side == "put":
        ranked = sorted(
            (
                (
                    _put_wall_score(strike, payload, spot_price, metric_key, max_open_interest, max_expiry_count),
                    strike,
                    payload,
                )
                for strike, payload in eligible.items()
            ),
            key=lambda item: (
                -item[0],
                -(item[2].get(metric_key) or 0),
                -item[2].get("openInterest", 0),
                -item[2].get("expiryCount", 0),
                abs(item[1] - spot_price),
                item[1],
            ),
        )
        top_score = ranked[0][0]
        shortlist = [
            item for item in ranked
            if top_score > 0 and ((top_score - item[0]) / top_score) <= 0.015
        ] or ranked[:1]
        shortlist = sorted(
            shortlist,
            key=lambda item: (
                -_wall_round_strength(item[1]),
                -item[2].get("expiryCount", 0),
                abs(item[1] - spot_price),
                -item[2].get("openInterest", 0),
                -item[0],
                item[1],
            ),
        )
        _, strike, payload = shortlist[0]
    else:
        _, strike, payload = sorted(
            (
                (
                    _call_wall_score(strike, payload, spot_price, metric_key, max_open_interest, max_expiry_count),
                    strike,
                    payload,
                )
                for strike, payload in eligible.items()
            ),
            key=lambda item: (
                -item[0],
                -(item[2].get(metric_key) or 0),
                -item[2].get("openInterest", 0),
                -item[2].get("expiryCount", 0),
                abs(item[1] - spot_price),
                item[1],
            ),
        )[0]
    return {
        "strike": strike,
        "openInterest": payload["openInterest"],
        "volume": payload["volume"],
        "gammaExposure": round(payload.get("gammaExposure", 0.0), 2),
    }


def _total_signed_gamma_exposure(contracts, scenario_price):
    total = 0.0
    for contract in contracts:
        strike = contract.get("strike")
        implied_volatility = contract.get("impliedVolatility")
        time_years = contract.get("timeYears")
        open_interest = contract.get("openInterest", 0)
        side = contract.get("side")
        sign = 1 if side == "call" else -1
        total += sign * _estimate_option_gamma_exposure(
            scenario_price,
            strike,
            implied_volatility,
            time_years,
            open_interest,
        )
    return total


def _estimate_gamma_flip_profile(contracts, spot_price, nearby_strike_count=41):
    if not contracts:
        return None
    strikes = sorted({contract["strike"] for contract in contracts if contract.get("strike") is not None})
    if not strikes:
        return None

    if nearby_strike_count and len(strikes) > nearby_strike_count:
        nearby = set(sorted(strikes, key=lambda strike: (abs(strike - spot_price), strike))[:nearby_strike_count])
        contracts = [contract for contract in contracts if contract.get("strike") in nearby]
        strikes = sorted(nearby)
        if not contracts:
            return None

    min_strike = min(strikes)
    max_strike = max(strikes)
    low = max(0.01, min(spot_price * 0.65, min_strike * 0.95))
    high = max(spot_price * 1.45, max_strike * 1.02)
    step = max(0.25, round(spot_price * 0.0035, 2))

    profile = []
    current = low
    while current <= high + 1e-9:
        profile.append((round(current, 4), _total_signed_gamma_exposure(contracts, current)))
        current += step

    spot_net_gamma = _total_signed_gamma_exposure(contracts, spot_price)
    crossing_candidates = []
    for index in range(len(profile) - 1):
        strike, net_value = profile[index]
        next_strike, next_net = profile[index + 1]
        if net_value == 0:
            crossing_candidates.append((strike, 0.0))
            continue
        if (net_value < 0 < next_net) or (net_value > 0 > next_net):
            span = abs(net_value) + abs(next_net)
            ratio = abs(net_value) / span if span else 0.5
            flip_strike = round(strike + (next_strike - strike) * ratio, 2)
            crossing_candidates.append((flip_strike, min(abs(net_value), abs(next_net))))

    crossing = None
    if crossing_candidates:
        preferred = crossing_candidates
        if spot_net_gamma < 0:
            above_spot = [item for item in crossing_candidates if item[0] >= spot_price]
            if above_spot:
                preferred = above_spot
        elif spot_net_gamma > 0:
            below_spot = [item for item in crossing_candidates if item[0] <= spot_price]
            if below_spot:
                preferred = below_spot
        crossing = sorted(preferred, key=lambda item: (abs(item[0] - spot_price), item[1]))[0]

    min_balance_strike, min_balance_value = sorted(
        profile,
        key=lambda item: (abs(item[1]), abs(item[0] - spot_price)),
    )[0]

    return {
        "hasCrossing": crossing is not None,
        "crossingStrike": crossing[0] if crossing else None,
        "crossingBalance": round(abs(crossing[1]), 2) if crossing else None,
        "spotNetGamma": round(spot_net_gamma, 2),
        "minBalanceStrike": round(min_balance_strike, 2),
        "minBalance": round(abs(min_balance_value), 2),
        "method": "estimated-gex-zero-cross-nearby-strikes" if crossing else "estimated-gex-min-balance-nearby-strikes",
        "nearbyStrikeCount": nearby_strike_count,
    }


def _median_strike(values):
    if not values:
        return None
    ordered = sorted(values)
    middle = len(ordered) // 2
    if len(ordered) % 2 == 1:
        return ordered[middle]
    return round((ordered[middle - 1] + ordered[middle]) / 2, 2)


def _contract_days_to_expiry(contract):
    days_to_expiry = contract.get("daysToExpiry")
    if days_to_expiry is not None:
        return max(0, int(days_to_expiry))
    time_years = contract.get("timeYears")
    if time_years is None:
        return 0
    return max(0, int(round(time_years * 365)))


def _term_bucket_gamma_flip_profile(contracts, spot_price, min_days, max_days):
    filtered_contracts = [
        contract
        for contract in contracts
        if min_days <= _contract_days_to_expiry(contract) <= max_days
    ]
    if not filtered_contracts:
        return None
    return _estimate_gamma_flip_profile(filtered_contracts, spot_price, nearby_strike_count=None)


def _weighted_bucket_crossing(profiles):
    weighted_points = []
    for profile in profiles:
        strike = profile.get("crossingStrike") if profile else None
        if strike is None:
            continue
        balance = max(profile.get("crossingBalance") or 0, 1.0)
        spot_net_gamma = abs(profile.get("spotNetGamma") or 0)
        weight = spot_net_gamma / max(math.log10(balance + 10), 1.0)
        if weight <= 0:
            continue
        weighted_points.append((strike, weight))
    if not weighted_points:
        return None
    total_weight = sum(weight for _, weight in weighted_points)
    if total_weight <= 0:
        return None
    return sum(strike * weight for strike, weight in weighted_points) / total_weight


def _profile_gamma_sign(profile):
    if not profile:
        return None
    spot_net_gamma = profile.get("spotNetGamma")
    if spot_net_gamma is None or spot_net_gamma == 0:
        return 0
    return 1 if spot_net_gamma > 0 else -1


def _refine_gamma_flip_with_term_structure(base_flip, contracts, spot_price):
    if not base_flip or base_flip.get("strike") is None or not contracts:
        return base_flip

    bucket_profiles = {
        "0-7": _term_bucket_gamma_flip_profile(contracts, spot_price, 0, 7),
        "8-21": _term_bucket_gamma_flip_profile(contracts, spot_price, 8, 21),
        "22-45": _term_bucket_gamma_flip_profile(contracts, spot_price, 22, 45),
        "46-90": _term_bucket_gamma_flip_profile(contracts, spot_price, 46, 90),
        "91-180": _term_bucket_gamma_flip_profile(contracts, spot_price, 91, 180),
    }
    short_term_average = _weighted_bucket_crossing([
        bucket_profiles["0-7"],
        bucket_profiles["8-21"],
    ])
    medium_term_average = _weighted_bucket_crossing([
        bucket_profiles["8-21"],
        bucket_profiles["22-45"],
        bucket_profiles["46-90"],
    ])

    adjusted_strike = float(base_flip["strike"])
    method = base_flip.get("method") or "estimated-gex"

    if (
        spot_price < 25
        and short_term_average is not None
        and adjusted_strike < spot_price
        and short_term_average > adjusted_strike
    ):
        adjusted_strike = short_term_average
        method = "estimated-gex-low-price-short-term"

    sign_0_7 = _profile_gamma_sign(bucket_profiles["0-7"])
    sign_8_21 = _profile_gamma_sign(bucket_profiles["8-21"])
    sign_22_45 = _profile_gamma_sign(bucket_profiles["22-45"])
    if (
        base_flip.get("method") == "estimated-gex-adaptive-expanded-window"
        and short_term_average is not None
        and sign_0_7 is not None
        and sign_8_21 is not None
        and sign_22_45 is not None
        and sign_0_7 != sign_8_21
        and sign_0_7 == sign_22_45
    ):
        adjusted_strike = short_term_average
        method = "estimated-gex-adaptive-short-term"

    if (
        base_flip.get("method") == "estimated-gex-adaptive-expanded-window"
        and medium_term_average is not None
    ):
        medium_term_strikes = [
            profile["crossingStrike"]
            for profile in (
                bucket_profiles["8-21"],
                bucket_profiles["22-45"],
                bucket_profiles["46-90"],
            )
            if profile and profile.get("crossingStrike") is not None
        ]
        if len(medium_term_strikes) >= 2:
            medium_term_spread = max(medium_term_strikes) - min(medium_term_strikes)
            if adjusted_strike < medium_term_average and medium_term_spread <= spot_price * 0.22:
                if medium_term_spread <= spot_price * 0.10:
                    adjusted_strike = medium_term_average
                else:
                    adjusted_strike = (adjusted_strike * 0.55) + (medium_term_average * 0.45)
                method = "estimated-gex-adaptive-term-structure"

    if (
        base_flip.get("method") == "estimated-gex-zero-cross-nearby-strikes"
        and short_term_average is not None
        and abs(short_term_average - adjusted_strike) / max(spot_price, 1) <= 0.015
        and abs(short_term_average - spot_price) <= abs(adjusted_strike - spot_price) + (spot_price * 0.002)
    ):
        adjusted_strike = (adjusted_strike + short_term_average) / 2
        method = "estimated-gex-nearby-short-term-smooth"

    if abs(adjusted_strike - base_flip["strike"]) < 0.005:
        return base_flip

    return {
        "strike": round(adjusted_strike, 2),
        "balance": base_flip.get("balance"),
        "method": method,
    }


def _estimate_gamma_flip(contracts, spot_price, nearby_strike_count=41, put_wall=None, call_wall=None):
    profile = _estimate_gamma_flip_profile(contracts, spot_price, nearby_strike_count=nearby_strike_count)
    if not profile:
        return None

    if profile.get("hasCrossing"):
        strike = profile.get("crossingStrike")
        spot_net_gamma = profile.get("spotNetGamma", 0) or 0
        if (
            strike is not None
            and put_wall
            and put_wall.get("strike") is not None
            and put_wall["strike"] < spot_price
            and spot_net_gamma > 0
            and strike < put_wall["strike"] * 0.93
        ):
            strike = round((put_wall["strike"] * 0.7) + (strike * 0.3), 2)
            return _refine_gamma_flip_with_term_structure({
                "strike": strike,
                "balance": profile.get("crossingBalance"),
                "method": "estimated-gex-zero-cross-put-support-blend",
            }, contracts, spot_price)
        return _refine_gamma_flip_with_term_structure({
            "strike": strike,
            "balance": profile.get("crossingBalance"),
            "method": profile.get("method"),
        }, contracts, spot_price)

    expanded_candidates = []
    for count in [61, 81, 101, None]:
        if count == nearby_strike_count:
            continue
        next_profile = _estimate_gamma_flip_profile(contracts, spot_price, nearby_strike_count=count)
        if next_profile and next_profile.get("hasCrossing") and next_profile.get("crossingStrike") is not None:
            expanded_candidates.append(next_profile)

    if expanded_candidates:
        spot_net_gamma = profile.get("spotNetGamma", 0) or 0
        if spot_net_gamma >= 0:
            below_spot = [item for item in expanded_candidates if item["crossingStrike"] <= spot_price]
            candidate = max(below_spot, key=lambda item: item["crossingStrike"]) if below_spot else expanded_candidates[0]
            candidate_strike = candidate["crossingStrike"]
            if (
                put_wall
                and put_wall.get("strike") is not None
                and put_wall["strike"] < spot_price
                and candidate_strike < put_wall["strike"] * 0.93
            ):
                candidate_strike = round((put_wall["strike"] + candidate_strike) / 2, 2)
            return _refine_gamma_flip_with_term_structure({
                "strike": candidate_strike,
                "balance": candidate.get("crossingBalance"),
                "method": "estimated-gex-adaptive-putwall-blend",
            }, contracts, spot_price)

        viable_candidates = [
            item for item in expanded_candidates
            if item["crossingStrike"] >= spot_price
        ] or expanded_candidates
        if (
            put_wall
            and call_wall
            and put_wall.get("strike") is not None
            and call_wall.get("strike") is not None
            and abs(call_wall["strike"] - put_wall["strike"]) / max(spot_price, 1) <= 0.04
            and spot_price <= min(call_wall["strike"], put_wall["strike"]) * 0.94
        ):
            anchor = (call_wall["strike"] + put_wall["strike"]) / 2
            candidate_strike = min(
                viable_candidates,
                key=lambda item: (
                    abs(item["crossingStrike"] - anchor),
                    item.get("crossingBalance") or 0,
                    item.get("nearbyStrikeCount") or 10_000,
                ),
            )["crossingStrike"]
        else:
            candidate_spread = max(item["crossingStrike"] for item in viable_candidates) - min(item["crossingStrike"] for item in viable_candidates)
            if candidate_spread >= 12:
                candidate_strike = _median_strike([item["crossingStrike"] for item in viable_candidates]) or viable_candidates[0]["crossingStrike"]
            else:
                candidate_strike = max(
                    viable_candidates,
                    key=lambda item: (
                        item["crossingStrike"],
                        -(item.get("crossingBalance") or 0),
                    ),
                )["crossingStrike"]
        return _refine_gamma_flip_with_term_structure({
            "strike": candidate_strike,
            "balance": min(item.get("crossingBalance") or 0 for item in viable_candidates),
            "method": "estimated-gex-adaptive-expanded-window",
        }, contracts, spot_price)

    return _refine_gamma_flip_with_term_structure({
        "strike": profile.get("minBalanceStrike"),
        "balance": profile.get("minBalance"),
        "method": profile.get("method"),
    }, contracts, spot_price)


def fetch_us_options_market(instrument, ticker, spot_price, updated_at, history_frame=None):
    try:
        expiries = list(instrument.options or [])
    except Exception:
        return build_unavailable_options_payload("Unable to load options expiries", market="us")

    if not expiries:
        return build_unavailable_options_payload("No listed options expiries", market="us")

    today = datetime.now(timezone.utc).date()
    ranked_expiries = []
    for expiry in expiries:
        try:
            expiry_date = datetime.strptime(expiry, "%Y-%m-%d").date()
            dte = (expiry_date - today).days
            ranked_expiries.append((expiry, dte))
        except Exception:
            continue

    if not ranked_expiries:
        return build_unavailable_options_payload("No valid options expiries", market="us")

    valid_expiries = [item for item in ranked_expiries if 0 <= item[1] <= 270] or ranked_expiries[:12]
    selected = []
    seen_expiries = set()
    target_dtes = [7, 14, 30, 45, 60, 90, 180]
    for target_dte in target_dtes:
        candidates = [item for item in valid_expiries if item[1] >= 0]
        if not candidates:
            continue
        expiry, dte = min(candidates, key=lambda item: (abs(item[1] - target_dte), item[1]))
        if expiry in seen_expiries:
            continue
        seen_expiries.add(expiry)
        selected.append((expiry, dte))
        if len(selected) >= 6:
            break
    wall_expiries = selected or valid_expiries[:4]
    gamma_expiry_keys = {expiry for expiry, dte in wall_expiries if 0 <= dte <= 180}

    call_bucket = {}
    put_bucket = {}
    contracts = []
    used_expiries = []
    iv_expiry_samples = []
    total_calls_count = 0
    total_puts_count = 0
    for expiry, dte in wall_expiries:
        try:
            chain = instrument.option_chain(expiry)
        except Exception:
            continue
        time_years = max(dte / 365.0, 1 / 365.0)
        calls_frame = getattr(chain, "calls", None)
        puts_frame = getattr(chain, "puts", None)
        total_calls_count += len(calls_frame.index) if calls_frame is not None else 0
        total_puts_count += len(puts_frame.index) if puts_frame is not None else 0
        _aggregate_option_metrics(calls_frame, call_bucket, [], spot_price, time_years, "call")
        _aggregate_option_metrics(puts_frame, put_bucket, [], spot_price, time_years, "put")
        if 3 <= dte <= 75:
            expiry_iv = _estimate_expiry_atm_iv(calls_frame, puts_frame, spot_price, dte)
            if expiry_iv is not None:
                iv_expiry_samples.append(expiry_iv)
        if expiry in gamma_expiry_keys:
            _aggregate_option_metrics(calls_frame, {}, contracts, spot_price, time_years, "call")
            _aggregate_option_metrics(puts_frame, {}, contracts, spot_price, time_years, "put")
        used_expiries.append({"expiry": expiry, "daysToExpiry": dte})

    if not call_bucket and not put_bucket:
        return build_unavailable_options_payload("No options chain data returned", market="us")

    call_wall = _pick_wall(call_bucket, spot_price, side="call", metric_key="gammaExposure")
    put_wall = _pick_wall(put_bucket, spot_price, side="put", metric_key="gammaExposure")
    gamma_flip_strike_count = 51 if spot_price >= 200 else 41
    gamma_flip = _estimate_gamma_flip(
        contracts,
        spot_price,
        nearby_strike_count=gamma_flip_strike_count,
        put_wall=put_wall,
        call_wall=call_wall,
    )
    total_call_oi = sum(item["openInterest"] for item in call_bucket.values())
    total_put_oi = sum(item["openInterest"] for item in put_bucket.values())
    total_call_gamma = sum(item.get("gammaExposure", 0.0) for item in call_bucket.values())
    total_put_gamma = sum(item.get("gammaExposure", 0.0) for item in put_bucket.values())
    net_gamma = total_call_gamma - total_put_gamma
    implied_volatility = _estimate_implied_volatility(iv_expiry_samples)
    history_closes = history_frame["Close"].tolist() if history_frame is not None and "Close" in history_frame else []
    history_highs = history_frame["High"].tolist() if history_frame is not None and "High" in history_frame else []
    history_lows = history_frame["Low"].tolist() if history_frame is not None and "Low" in history_frame else []
    iv_regime = _estimate_iv_regime_metrics(implied_volatility, history_closes, history_highs, history_lows)

    return {
        "available": True,
        "market": "us",
        "reason": None,
        "callWall": call_wall,
        "putWall": put_wall,
        "gammaFlip": gamma_flip,
        "expiries": used_expiries,
        "nearestExpiry": used_expiries[0]["expiry"] if used_expiries else None,
        "updatedAt": updated_at,
        "totalCallOpenInterest": total_call_oi,
        "totalPutOpenInterest": total_put_oi,
        "totalCallGammaExposure": round(total_call_gamma, 2),
        "totalPutGammaExposure": round(total_put_gamma, 2),
        "netGammaExposure": round(net_gamma, 2),
        "impliedVolatility": round(implied_volatility, 2) if implied_volatility is not None else None,
        "historicVolatility": round(iv_regime["historicVolatility"], 2) if iv_regime.get("historicVolatility") is not None else None,
        "ivPercentile": round(iv_regime["ivPercentile"], 2) if iv_regime.get("ivPercentile") is not None else None,
        "ivRank": round(iv_regime["ivRank"], 2) if iv_regime.get("ivRank") is not None else None,
        "coverage": "estimated-gex-nearby-expiries-atm-iv-rv-proxy",
        "gammaFlipStrikeCount": gamma_flip_strike_count,
        "selectedExpiration": used_expiries[0]["expiry"] if used_expiries else None,
        "callsCount": total_calls_count,
        "putsCount": total_puts_count,
    }


def fetch_a_share_profile(ticker):
    ak = get_ak()
    if ak is None:
        return {}
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
    ak = get_ak()
    if ak is None:
        return result

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


def fetch_a_share_spot_snapshot(ak, ticker):
    attempts = [
        ("stock_zh_a_spot_em", "代码", "最新价", "昨收", "名称"),
        ("stock_zh_a_spot", "代码", "最新价", "昨收", "名称"),
        ("stock_zh_a_spot_tx", "代码", "最新价", "昨收", "名称"),
    ]
    for func_name, code_col, price_col, prev_close_col, name_col in attempts:
        fetcher = getattr(ak, func_name, None)
        if fetcher is None:
            continue
        try:
            frame = _run_with_timeout(fetcher, A_SHARE_SECONDARY_PRICE_TIMEOUT_SECONDS, fallback=None)
            if frame is None or frame.empty:
                continue
            normalized_cols = {str(col).strip(): col for col in frame.columns}
            code_column = next((normalized_cols[col] for col in ("代码", "symbol", "证券代码", code_col) if col in normalized_cols), None)
            price_column = next((normalized_cols[col] for col in ("最新价", "最新", "price", price_col) if col in normalized_cols), None)
            prev_column = next((normalized_cols[col] for col in ("昨收", "昨收价", "previous_close", prev_close_col) if col in normalized_cols), None)
            name_column = next((normalized_cols[col] for col in ("名称", "name", name_col) if col in normalized_cols), None)
            if code_column is None or price_column is None:
                continue
            rows = frame[frame[code_column].astype(str).str.strip() == ticker]
            if rows.empty:
                continue
            row = rows.iloc[0]
            price = _safe_float(row.get(price_column))
            if price is None:
                continue
            return {
                "source": func_name,
                "price": price,
                "previous_close": _safe_float(row.get(prev_column)) if prev_column else None,
                "name": _safe_text(row.get(name_column)) if name_column else None,
            }
        except Exception:
            continue
    return None


def eastmoney_secid(ticker):
    return f"1.{ticker}" if str(ticker).startswith(("6", "9")) else f"0.{ticker}"


def fetch_a_share_tencent_quote(ticker, timeout=4):
    prefix = "sh" if str(ticker).startswith(("6", "9")) else "sz"
    url = f"https://qt.gtimg.cn/q={prefix}{ticker}"
    request = Request(
        url,
        headers={
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
            "Accept": "text/plain, */*",
            "Referer": "https://gu.qq.com/",
        },
    )
    try:
        with urlopen(request, timeout=timeout) as response:
            raw = response.read()
        text = raw.decode("gbk", errors="ignore")
        match = re.search(r'="([^"]*)"', text)
        fields = match.group(1).split("~") if match else []
        if len(fields) < 39:
            return None
        price = _safe_float(fields[3])
        if price is None or price <= 0:
            return None
        previous_close = _safe_float(fields[4])
        return {
            "source": "tencent_quote",
            "price": price,
            "previous_close": previous_close,
            "open": _safe_float(fields[5]),
            "volume": _safe_int(fields[6]),
            "name": _safe_text(fields[1]),
            "change": _safe_float(fields[31]),
            "change_percent": _safe_float(fields[32]),
            "high": _safe_float(fields[33]),
            "low": _safe_float(fields[34]),
            "quote_time": _safe_text(fields[30]),
        }
    except Exception:
        return None


def fetch_a_share_eastmoney_quote(ticker, timeout=4):
    fields = "f43,f44,f45,f46,f47,f57,f58,f60,f116,f170"
    url = f"https://push2.eastmoney.com/api/qt/stock/get?secid={eastmoney_secid(ticker)}&fields={fields}"
    try:
        payload = http_get_json_browser(url, timeout=timeout, referer="https://quote.eastmoney.com/")
        data = (payload or {}).get("data") or {}
        price = _safe_float(data.get("f43"))
        previous_close = _safe_float(data.get("f60"))
        high = _safe_float(data.get("f44"))
        low = _safe_float(data.get("f45"))
        open_price = _safe_float(data.get("f46"))
        pct = _safe_float(data.get("f170"))
        for key, value in {"price": price, "previous_close": previous_close, "high": high, "low": low, "open": open_price, "pct": pct}.items():
            if value is not None and (key == "pct" or abs(value) > 1000):
                value = value / 100
            if key == "price":
                price = value
            elif key == "previous_close":
                previous_close = value
            elif key == "high":
                high = value
            elif key == "low":
                low = value
            elif key == "open":
                open_price = value
            elif key == "pct":
                pct = value
        if price is None:
            return None
        return {
            "source": "eastmoney_quote",
            "price": price,
            "previous_close": previous_close,
            "high": high,
            "low": low,
            "open": open_price,
            "volume": _safe_int(data.get("f47")),
            "market_cap": _safe_int(data.get("f116")),
            "change_percent": pct,
            "name": _safe_text(data.get("f58")),
        }
    except Exception:
        return None


def fetch_a_share_eastmoney_history(ticker, limit=260, timeout=4):
    fields1 = "f1,f2,f3,f4,f5,f6"
    fields2 = "f51,f52,f53,f54,f55,f56,f57"
    url = (
        f"https://push2his.eastmoney.com/api/qt/stock/kline/get?secid={eastmoney_secid(ticker)}"
        f"&klt=101&fqt=0&end=20500101&lmt={int(limit)}&fields1={fields1}&fields2={fields2}"
    )
    try:
        payload = http_get_json_browser(url, timeout=timeout, referer="https://quote.eastmoney.com/")
        klines = (((payload or {}).get("data") or {}).get("klines")) or []
        rows = []
        for line in klines:
            parts = str(line).split(",")
            if len(parts) < 6:
                continue
            stamp = datetime.strptime(parts[0], "%Y-%m-%d").replace(tzinfo=timezone.utc)
            close = _safe_float(parts[2])
            if close is None:
                continue
            rows.append({
                "date": stamp.date().isoformat(),
                "datetime": stamp,
                "open": _safe_float(parts[1]),
                "close": close,
                "high": _safe_float(parts[3]),
                "low": _safe_float(parts[4]),
                "volume": _safe_int(parts[5]),
            })
        return rows[-limit:]
    except Exception:
        return []


def fetch_a_share_with_eastmoney(ticker, profile_info=None, valuation_info=None, primary_error=None):
    profile_info = profile_info or {}
    valuation_info = valuation_info or {}
    # The lightweight endpoints are substantially more reliable on Render than
    # downloading the full AkShare spot table. History also gives us a usable
    # last close when a real-time endpoint is temporarily unavailable.
    history_rows = fetch_a_share_eastmoney_history(ticker, limit=252, timeout=4)
    quote_snapshot = fetch_a_share_tencent_quote(ticker, timeout=3)
    if not quote_snapshot and not history_rows:
        quote_snapshot = fetch_a_share_eastmoney_quote(ticker, timeout=3)
    if not quote_snapshot and not history_rows:
        raise ValueError(f"A-share Eastmoney fallback failed for {ticker}: {primary_error or 'No quote/history'}")

    latest = history_rows[-1] if history_rows else {}
    previous = history_rows[-2] if len(history_rows) > 1 else latest
    price = quote_snapshot.get("price") if quote_snapshot else latest.get("close")
    previous_close = (quote_snapshot.get("previous_close") if quote_snapshot else None) or previous.get("close")
    change = price - previous_close if price is not None and previous_close is not None else None
    change_percent = quote_snapshot.get("change_percent") if quote_snapshot else None
    if change_percent is None and change is not None and previous_close:
        change_percent = (change / previous_close) * 100
    forward_pe = valuation_info.get("forwardPE")
    forward_eps_mean = valuation_info.get("forwardEpsMean")
    if forward_pe is None and price is not None and forward_eps_mean:
        forward_pe = price / forward_eps_mean
    now_iso = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    return {
        "price": price,
        "previousClose": previous_close,
        "change": change,
        "changePercent": change_percent,
        "updatedAt": iso_from_local_close(latest.get("datetime"), 15, 0, 8) if latest else now_iso,
        "marketStatus": "open",
        "dataStaleness": "fresh",
        "last_successful_update": now_iso,
        "symbol": resolve_market_symbol(ticker),
        "shortName": profile_info.get("shortName") or (quote_snapshot or {}).get("name"),
        "longName": profile_info.get("longName") or (quote_snapshot or {}).get("name"),
        "exchangeName": "SZ" if ticker.startswith(("0", "3")) else "SH",
        "trailingPE": valuation_info.get("trailingPE"),
        "forwardPE": forward_pe,
        "marketCap": valuation_info.get("marketCap") or (quote_snapshot or {}).get("market_cap"),
        "metadata": {
            "sector": None,
            "industry": None,
            "beta": None,
            "dividendYield": None,
            "payoutRatio": None,
            "enterpriseToEbitda": None,
            "priceToSalesTrailing12Months": None,
            "enterpriseToRevenue": None,
            "pegRatio": None,
            "priceToFreeCashflow": None,
            "operatingMargins": None,
            "profitMargins": None,
            "revenueGrowth": None,
            "grossMargins": None,
            "returnOnEquity": None,
            "debtToEquity": None,
            "currentRatio": None,
            "quickRatio": None,
            "freeCashflow": None,
            "totalCash": None,
            "totalDebt": None,
            "capex": None,
            "businessSummary": None,
            "ipoDate": None,
            "floatShares": None,
            "sharesOutstanding": None,
        },
        "optionsMarket": build_unavailable_options_payload("A-share options wall data is not supported yet", market="cn"),
        "history": {
            "timestamps": [row["date"] for row in history_rows],
            "closes": [_safe_float(row.get("close")) for row in history_rows],
            "highs": [_safe_float(row.get("high")) for row in history_rows],
            "lows": [_safe_float(row.get("low")) for row in history_rows],
            "volumes": [_safe_int(row.get("volume")) for row in history_rows],
        },
        "debug": {
            "a_share_quote_source": (quote_snapshot or {}).get("source") or "eastmoney_history",
            "a_share_history_source": "eastmoney" if history_rows else None,
        },
    }


def fetch_a_share_with_yfinance_fallback(ticker, profile_info=None, valuation_info=None, primary_error=None):
    profile_info = profile_info or {}
    valuation_info = valuation_info or {}
    symbol = resolve_market_symbol(ticker)
    instrument = yf.Ticker(symbol)
    history = load_yfinance_history_frame(instrument, symbol, period="1y", interval="1d")
    if history is None or history.empty:
        raise ValueError(f"A-share fetch failed for {ticker}: {primary_error or 'No fallback history'}")
    history = history.dropna(subset=["Open", "High", "Low", "Close", "Volume"]).tail(252)
    if history.empty:
        raise ValueError(f"A-share fetch failed for {ticker}: {primary_error or 'No clean fallback history'}")

    info = {}
    fast_info = {}
    try:
        fast_info = dict(instrument.fast_info or {})
    except Exception:
        fast_info = {}
    try:
        info = instrument.info or {}
    except Exception:
        info = {}

    latest_row = history.iloc[-1]
    previous_row = history.iloc[-2] if len(history) > 1 else latest_row
    price = _safe_float(latest_row["Close"])
    previous_close = _safe_float(previous_row["Close"])
    change = price - previous_close if price is not None and previous_close is not None else None
    change_percent = (change / previous_close) * 100 if change is not None and previous_close else None
    forward_pe = valuation_info.get("forwardPE")
    forward_eps_mean = valuation_info.get("forwardEpsMean")
    if forward_pe is None and price is not None and forward_eps_mean:
        forward_pe = price / forward_eps_mean
    free_cashflow = _safe_float(info.get("freeCashflow"))
    market_cap = valuation_info.get("marketCap") or _safe_int(info.get("marketCap")) or _safe_int(fast_info.get("market_cap"))
    price_to_fcf = None
    if _safe_float(market_cap) not in (None, 0) and free_cashflow not in (None, 0):
        try:
            price_to_fcf = abs(_safe_float(market_cap) / free_cashflow)
        except Exception:
            price_to_fcf = None

    catalog_match = next((item for item in A_SHARE_SYMBOL_CATALOG if item.get("ticker") == ticker), {})
    exchange_name = "SZ" if ticker.startswith(("0", "3")) else "SH"
    return {
        "price": price,
        "previousClose": previous_close,
        "change": change,
        "changePercent": change_percent,
        "updatedAt": iso_from_local_close(history.index[-1], 15, 0, 8),
        "marketStatus": "open",
        "dataStaleness": "fresh",
        "last_successful_update": iso_from_local_close(history.index[-1], 15, 0, 8),
        "symbol": symbol,
        "shortName": profile_info.get("shortName") or catalog_match.get("name"),
        "longName": profile_info.get("longName") or catalog_match.get("name"),
        "exchangeName": exchange_name,
        "trailingPE": valuation_info.get("trailingPE") or _safe_float(info.get("trailingPE")),
        "forwardPE": forward_pe or _safe_float(info.get("forwardPE")),
        "marketCap": market_cap,
        "metadata": {
            "sector": info.get("sector"),
            "industry": info.get("industry"),
            "beta": _safe_float(info.get("beta")),
            "dividendYield": _safe_float(info.get("dividendYield")),
            "payoutRatio": _safe_float(info.get("payoutRatio")),
            "enterpriseToEbitda": _safe_float(info.get("enterpriseToEbitda")),
            "priceToSalesTrailing12Months": _safe_float(info.get("priceToSalesTrailing12Months")),
            "enterpriseToRevenue": _safe_float(info.get("enterpriseToRevenue")),
            "pegRatio": _safe_float(info.get("pegRatio")),
            "priceToFreeCashflow": price_to_fcf,
            "operatingMargins": _safe_float(info.get("operatingMargins")),
            "profitMargins": _safe_float(info.get("profitMargins")),
            "revenueGrowth": _safe_float(info.get("revenueGrowth")),
            "grossMargins": _safe_float(info.get("grossMargins")),
            "returnOnEquity": _safe_float(info.get("returnOnEquity")),
            "debtToEquity": _safe_float(info.get("debtToEquity")),
            "currentRatio": _safe_float(info.get("currentRatio")),
            "quickRatio": _safe_float(info.get("quickRatio")),
            "freeCashflow": free_cashflow,
            "totalCash": _safe_float(info.get("totalCash")),
            "totalDebt": _safe_float(info.get("totalDebt")),
            "capex": _safe_float(info.get("capitalExpenditure")),
            "businessSummary": info.get("longBusinessSummary") or info.get("shortBusinessSummary"),
            "country": info.get("country"),
            "city": info.get("city"),
            "state": info.get("state"),
            "exchange": info.get("exchange") or exchange_name,
            "quoteType": info.get("quoteType"),
            "ipoDate": iso_from_epoch(info.get("firstTradeDateEpochUtc")),
            "floatShares": _safe_int(info.get("floatShares")) or _safe_int(info.get("sharesFloat")) or _safe_int(info.get("publicFloat")) or _safe_int(fast_info.get("float_shares")),
            "sharesOutstanding": _safe_int(info.get("sharesOutstanding")) or _safe_int(info.get("impliedSharesOutstanding")) or _safe_int(fast_info.get("shares")),
        },
        "optionsMarket": build_unavailable_options_payload("A-share options wall data is not supported yet", market="cn"),
        "history": {
            "timestamps": [entry.to_pydatetime().strftime("%Y-%m-%d") for entry in history.index],
            "closes": [_safe_float(value) for value in history["Close"].tolist()],
            "highs": [_safe_float(value) for value in history["High"].tolist()],
            "lows": [_safe_float(value) for value in history["Low"].tolist()],
            "volumes": [_safe_int(value) for value in history["Volume"].tolist()],
        },
    }


def fetch_a_share_spot_only_quote(ticker, profile_info=None, valuation_info=None, primary_error=None):
    profile_info = profile_info or {}
    valuation_info = valuation_info or {}
    ak = get_ak()
    if ak is None:
        raise ValueError(f"A-share fetch failed for {ticker}: {primary_error or 'AkShare unavailable'}")

    snapshot = fetch_a_share_spot_snapshot(ak, ticker)
    if not snapshot:
        raise ValueError(f"A-share fetch failed for {ticker}: {primary_error or 'No spot snapshot available'}")

    price = snapshot.get("price")
    previous_close = snapshot.get("previous_close")
    change = price - previous_close if price is not None and previous_close is not None else None
    change_percent = (change / previous_close) * 100 if change is not None and previous_close else None
    forward_pe = valuation_info.get("forwardPE")
    forward_eps_mean = valuation_info.get("forwardEpsMean")
    if forward_pe is None and price is not None and forward_eps_mean:
        forward_pe = price / forward_eps_mean

    now_iso = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    return {
        "price": price,
        "previousClose": previous_close,
        "change": change,
        "changePercent": change_percent,
        "updatedAt": now_iso,
        "marketStatus": "open",
        "dataStaleness": "fresh",
        "last_successful_update": now_iso,
        "symbol": resolve_market_symbol(ticker),
        "shortName": profile_info.get("shortName") or snapshot.get("name"),
        "longName": profile_info.get("longName") or snapshot.get("name"),
        "exchangeName": "SZ" if ticker.startswith(("0", "3")) else "SH",
        "trailingPE": valuation_info.get("trailingPE"),
        "forwardPE": forward_pe,
        "marketCap": valuation_info.get("marketCap"),
        "metadata": {
            "sector": None,
            "industry": None,
            "beta": None,
            "dividendYield": None,
            "payoutRatio": None,
            "enterpriseToEbitda": None,
            "priceToSalesTrailing12Months": None,
            "enterpriseToRevenue": None,
            "pegRatio": None,
            "priceToFreeCashflow": None,
            "operatingMargins": None,
            "profitMargins": None,
            "revenueGrowth": None,
            "grossMargins": None,
            "returnOnEquity": None,
            "debtToEquity": None,
            "currentRatio": None,
            "quickRatio": None,
            "freeCashflow": None,
            "totalCash": None,
            "totalDebt": None,
            "capex": None,
            "businessSummary": None,
            "ipoDate": None,
            "floatShares": None,
            "sharesOutstanding": None,
        },
        "optionsMarket": build_unavailable_options_payload("A-share options wall data is not supported yet", market="cn"),
        "history": {
            "timestamps": [],
            "closes": [],
            "highs": [],
            "lows": [],
            "volumes": [],
        },
    }


def _normalize_download_history_frame(frame):
    if frame is None or frame.empty:
        return pd.DataFrame()
    if isinstance(frame.columns, pd.MultiIndex):
        normalized = pd.DataFrame(index=frame.index)
        for field in ["Open", "High", "Low", "Close", "Volume"]:
            match = next((column for column in frame.columns if field in column), None)
            if match is not None:
                normalized[field] = frame[match]
        frame = normalized
    return frame


def load_yfinance_history_frame(instrument, symbol, period="1y", interval="1d"):
    try:
        history = instrument.history(period=period, interval=interval, auto_adjust=False)
        if history is not None and not history.empty:
            return history
    except Exception:
        pass

    try:
        downloaded = yf.download(
            symbol,
            period=period,
            interval=interval,
            auto_adjust=False,
            progress=False,
            threads=False,
        )
        downloaded = _normalize_download_history_frame(downloaded)
        if downloaded is not None and not downloaded.empty:
            return downloaded
    except Exception:
        pass

    yahoo_frame = fetch_yahoo_chart_frame(symbol, range_value=period, interval=interval)
    if yahoo_frame is not None and not yahoo_frame.empty:
        return yahoo_frame

    stooq_frame = fetch_stooq_chart_frame(symbol)
    if stooq_frame is not None and not stooq_frame.empty:
        return stooq_frame

    return pd.DataFrame()


def fetch_us_quote_with_yfinance(ticker, include_options=True):
    symbol = resolve_market_symbol(ticker)
    instrument = yf.Ticker(symbol)

    history = load_yfinance_history_frame(instrument, symbol, period="1y", interval="1d")
    if history is None or history.empty:
        raise ValueError(f"No yfinance history for {ticker}")

    history = history.dropna(subset=["Open", "High", "Low", "Close", "Volume"]).tail(252)
    if history.empty:
        raise ValueError(f"No clean yfinance history for {ticker}")

    info = {}
    fast_info = {}
    try:
        fast_info = dict(instrument.fast_info or {})
    except Exception:
        fast_info = {}
    try:
        info = instrument.info or {}
    except Exception:
        info = {}
    quote_summary = {}
    quote_snapshot = {}
    quote_summary_attempted = False
    fallback_fields = [
        "trailingPE",
        "forwardPE",
        "pegRatio",
        "enterpriseToEbitda",
        "freeCashflow",
        "revenueGrowth",
        "profitMargins",
        "marketCap",
        "shortName",
        "longName",
        "sector",
        "industry",
        "longBusinessSummary",
    ]
    if any(info.get(field) is None for field in fallback_fields):
        quote_summary_attempted = True
        info, quote_snapshot, quote_summary = merge_yahoo_fallback_info(symbol, info)

    latest_row = history.iloc[-1]
    previous_row = history.iloc[-2] if len(history) > 1 else latest_row
    regular_close = _safe_float(latest_row["Close"])
    regular_market_time = dt_from_epoch(info.get("regularMarketTime"))

    # Use the official daily close as the dashboard price so the homepage,
    # detail page, and all daily indicators stay aligned on the same data point.
    price = regular_close
    updated_at_dt = regular_market_time

    previous_close = (
        _safe_float(info.get("regularMarketPreviousClose"))
        or _safe_float(info.get("previousClose"))
        or _safe_float(fast_info.get("previous_close"))
        or _safe_float(previous_row["Close"])
    )
    change = price - previous_close if price is not None and previous_close is not None else None
    change_percent = (change / previous_close) * 100 if change is not None and previous_close else None

    updated_at = (
        updated_at_dt.strftime("%Y-%m-%dT%H:%M:%SZ") if updated_at_dt
        else iso_from_local_close(history.index[-1], 16, 0, -4)
    )
    if include_options:
        options_market = _run_with_timeout(
            lambda: fetch_us_options_market(instrument, ticker, price, updated_at, history_frame=history),
            OPTIONS_FETCH_TIMEOUT_SECONDS,
            fallback=build_unavailable_options_payload("Options chain timed out; quote and fundamentals are still available", market="us"),
        )
    else:
        options_market = build_unavailable_options_payload("Quote loaded without options snapshot", market="us")
    free_cashflow = _safe_float(info.get("freeCashflow"))
    market_cap = _safe_int(info.get("marketCap")) or _safe_int(fast_info.get("market_cap"))
    price_to_fcf = None
    reported_price_to_fcf = _safe_float(
        info.get("priceToFreeCashflow")
        or info.get("priceToFreeCashFlow")
        or info.get("priceToFCF")
    )
    if _safe_float(market_cap) not in (None, 0) and free_cashflow not in (None, 0):
        try:
            price_to_fcf = abs(_safe_float(market_cap) / free_cashflow)
        except Exception:
            price_to_fcf = None

    return {
        "price": price,
        "previousClose": previous_close,
        "change": change,
        "changePercent": change_percent,
        "updatedAt": updated_at,
        "marketStatus": "open",
        "dataStaleness": "fresh",
        "last_successful_update": updated_at,
        "symbol": symbol,
        "shortName": info.get("shortName") or info.get("displayName"),
        "longName": info.get("longName") or info.get("shortName") or info.get("displayName"),
        "exchangeName": info.get("exchange") or info.get("fullExchangeName"),
        "trailingPE": _safe_float(info.get("trailingPE")),
        "forwardPE": _safe_float(info.get("forwardPE")),
        "marketCap": market_cap,
        "metadata": {
            "sector": info.get("sector"),
            "industry": info.get("industry"),
            "beta": _safe_float(info.get("beta")),
            "dividendYield": _safe_float(info.get("dividendYield")),
            "payoutRatio": _safe_float(info.get("payoutRatio")),
            "enterpriseToEbitda": _safe_float(info.get("enterpriseToEbitda")),
            "priceToSalesTrailing12Months": _safe_float(info.get("priceToSalesTrailing12Months")),
            "enterpriseToRevenue": _safe_float(info.get("enterpriseToRevenue")),
            "pegRatio": _safe_float(info.get("pegRatio")),
            "priceToFreeCashflow": reported_price_to_fcf if reported_price_to_fcf is not None else price_to_fcf,
            "operatingMargins": _safe_float(info.get("operatingMargins")),
            "profitMargins": _safe_float(info.get("profitMargins")),
            "revenueGrowth": _safe_float(info.get("revenueGrowth")),
            "grossMargins": _safe_float(info.get("grossMargins")),
            "returnOnEquity": _safe_float(info.get("returnOnEquity")),
            "debtToEquity": _safe_float(info.get("debtToEquity")),
            "currentRatio": _safe_float(info.get("currentRatio")),
            "quickRatio": _safe_float(info.get("quickRatio")),
            "freeCashflow": free_cashflow,
            "totalCash": _safe_float(info.get("totalCash")),
            "totalDebt": _safe_float(info.get("totalDebt")),
            "capex": _safe_float(info.get("capitalExpenditure")),
            "businessSummary": info.get("longBusinessSummary") or info.get("shortBusinessSummary"),
            "country": info.get("country"),
            "city": info.get("city"),
            "state": info.get("state"),
            "exchange": info.get("exchange") or info.get("fullExchangeName"),
            "quoteType": info.get("quoteType"),
            "ipoDate": iso_from_epoch(info.get("firstTradeDateEpochUtc")),
            "floatShares": _safe_int(info.get("floatShares")) or _safe_int(info.get("sharesFloat")) or _safe_int(info.get("publicFloat")) or _safe_int(fast_info.get("float_shares")),
            "sharesOutstanding": _safe_int(info.get("sharesOutstanding")) or _safe_int(info.get("impliedSharesOutstanding")) or _safe_int(fast_info.get("shares")),
        },
        "debug": {
            "yfinance_import_success": True,
            "yfinance_fields_found": [field for field in fallback_fields if info.get(field) is not None],
            "yahoo_quote_summary_attempt": quote_summary_attempted,
            "yahoo_quote_snapshot_attempt": bool(quote_snapshot),
            "raw_keys_sample": sorted(list(info.keys()))[:20],
            "quote_summary_keys_sample": sorted(list(quote_summary.keys()))[:20] if quote_summary else [],
            "quote_snapshot_keys_sample": sorted(list(quote_snapshot.keys()))[:20] if quote_snapshot else [],
        },
        "optionsMarket": options_market,
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

    # Prefer small direct payloads. This keeps a single A-share refresh within
    # the route timeout and avoids loading a market-wide AkShare table.
    try:
        return fetch_a_share_with_eastmoney(ticker, profile_info={}, valuation_info={})
    except Exception:
        pass

    ak = get_ak()
    if ak is None:
        try:
            return fetch_a_share_with_yfinance_fallback(ticker, profile_info={}, valuation_info={}, primary_error="AkShare unavailable")
        except Exception as yf_error:
            return fetch_a_share_with_eastmoney(ticker, profile_info={}, valuation_info={}, primary_error=yf_error)

    primary_error = None
    try:
        history = _run_with_timeout(
            lambda: ak.stock_zh_a_hist(
                symbol=ticker,
                period="daily",
                start_date=start_date,
                end_date=end_date,
                adjust="",
            ),
            A_SHARE_PRIMARY_PRICE_TIMEOUT_SECONDS,
            fallback=None,
        )
        if history is None:
            raise TimeoutError(f"A-share primary history timed out for {ticker}")
        history = history.dropna(subset=["开盘", "收盘", "最高", "最低", "成交量"]).tail(252)
        if history is None or history.empty:
            raise ValueError(f"No clean AkShare primary history for {ticker}")

        latest_row = history.iloc[-1]
        previous_row = history.iloc[-2] if len(history) > 1 else latest_row
        profile_info = _run_with_timeout(
            lambda: fetch_a_share_profile(ticker),
            A_SHARE_METADATA_TIMEOUT_SECONDS,
            fallback={},
        ) or {}
        valuation_info = _run_with_timeout(
            lambda: fetch_a_share_valuation(ticker),
            A_SHARE_METADATA_TIMEOUT_SECONDS,
            fallback={},
        ) or {}

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
            "marketStatus": "open",
            "dataStaleness": "fresh",
            "last_successful_update": iso_from_local_close(latest_row["日期"], 15, 0, 8),
            "symbol": resolve_market_symbol(ticker),
            "shortName": profile_info.get("shortName"),
            "longName": profile_info.get("longName"),
            "exchangeName": exchange_name,
            "trailingPE": valuation_info.get("trailingPE"),
            "forwardPE": forward_pe,
            "marketCap": valuation_info.get("marketCap"),
            "metadata": {
                "sector": None,
                "industry": None,
                "beta": None,
                "dividendYield": None,
                "payoutRatio": None,
                "enterpriseToEbitda": None,
                "priceToSalesTrailing12Months": None,
                "enterpriseToRevenue": None,
                "pegRatio": None,
                "priceToFreeCashflow": None,
                "operatingMargins": None,
                "profitMargins": None,
                "revenueGrowth": None,
                "grossMargins": None,
                "returnOnEquity": None,
                "debtToEquity": None,
                "currentRatio": None,
                "quickRatio": None,
                "freeCashflow": None,
                "totalCash": None,
                "totalDebt": None,
                "capex": None,
                "businessSummary": None,
                "ipoDate": None,
                "floatShares": None,
                "sharesOutstanding": None,
            },
            "optionsMarket": build_unavailable_options_payload("A-share options wall data is not supported yet", market="cn"),
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
    try:
        history_tx = _run_with_timeout(
            lambda: ak.stock_zh_a_hist_tx(
                symbol=fallback_symbol,
                start_date=start_date,
                end_date=end_date,
            ),
            A_SHARE_SECONDARY_PRICE_TIMEOUT_SECONDS,
            fallback=None,
        )
        if history_tx is None:
            raise TimeoutError(f"A-share Tencent history timed out for {ticker}")
        history_tx = history_tx.dropna(subset=["open", "close", "high", "low", "amount"]).tail(252)
        if history_tx is None or history_tx.empty:
            profile_info = _run_with_timeout(
                lambda: fetch_a_share_profile(ticker),
                A_SHARE_METADATA_TIMEOUT_SECONDS,
                fallback={},
            ) or {}
            valuation_info = _run_with_timeout(
                lambda: fetch_a_share_valuation(ticker),
                A_SHARE_METADATA_TIMEOUT_SECONDS,
                fallback={},
            ) or {}
            try:
                return fetch_a_share_with_yfinance_fallback(ticker, profile_info=profile_info, valuation_info=valuation_info, primary_error=primary_error)
            except Exception as yf_error:
                try:
                    return fetch_a_share_spot_only_quote(ticker, profile_info=profile_info, valuation_info=valuation_info, primary_error=yf_error or primary_error)
                except Exception as spot_error:
                    return fetch_a_share_with_eastmoney(ticker, profile_info=profile_info, valuation_info=valuation_info, primary_error=spot_error or yf_error or primary_error)
    except Exception as tx_error:
        profile_info = _run_with_timeout(
            lambda: fetch_a_share_profile(ticker),
            A_SHARE_METADATA_TIMEOUT_SECONDS,
            fallback={},
        ) or {}
        valuation_info = _run_with_timeout(
            lambda: fetch_a_share_valuation(ticker),
            A_SHARE_METADATA_TIMEOUT_SECONDS,
            fallback={},
        ) or {}
        try:
            return fetch_a_share_with_yfinance_fallback(
                ticker,
                profile_info=profile_info,
                valuation_info=valuation_info,
                primary_error=tx_error if tx_error else primary_error,
            )
        except Exception as yf_error:
            try:
                return fetch_a_share_spot_only_quote(
                    ticker,
                    profile_info=profile_info,
                    valuation_info=valuation_info,
                    primary_error=yf_error or tx_error or primary_error,
                )
            except Exception as spot_error:
                return fetch_a_share_with_eastmoney(
                    ticker,
                    profile_info=profile_info,
                    valuation_info=valuation_info,
                    primary_error=spot_error or yf_error or tx_error or primary_error,
                )

    latest_row = history_tx.iloc[-1]
    previous_row = history_tx.iloc[-2] if len(history_tx) > 1 else latest_row
    profile_info = _run_with_timeout(
        lambda: fetch_a_share_profile(ticker),
        A_SHARE_METADATA_TIMEOUT_SECONDS,
        fallback={},
    ) or {}
    valuation_info = _run_with_timeout(
        lambda: fetch_a_share_valuation(ticker),
        A_SHARE_METADATA_TIMEOUT_SECONDS,
        fallback={},
    ) or {}

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
        "marketStatus": "open",
        "dataStaleness": "fresh",
        "last_successful_update": iso_from_local_close(latest_row["date"], 15, 0, 8),
        "symbol": resolve_market_symbol(ticker),
        "shortName": profile_info.get("shortName"),
        "longName": profile_info.get("longName"),
        "exchangeName": exchange_name,
        "trailingPE": valuation_info.get("trailingPE"),
        "forwardPE": forward_pe,
        "marketCap": valuation_info.get("marketCap"),
        "metadata": {
            "sector": None,
            "industry": None,
            "beta": None,
            "dividendYield": None,
            "payoutRatio": None,
            "enterpriseToEbitda": None,
            "priceToSalesTrailing12Months": None,
            "enterpriseToRevenue": None,
            "pegRatio": None,
            "priceToFreeCashflow": None,
            "operatingMargins": None,
            "profitMargins": None,
            "revenueGrowth": None,
            "grossMargins": None,
            "returnOnEquity": None,
            "debtToEquity": None,
            "currentRatio": None,
            "quickRatio": None,
            "freeCashflow": None,
            "totalCash": None,
            "totalDebt": None,
            "capex": None,
            "businessSummary": None,
            "ipoDate": None,
            "floatShares": None,
            "sharesOutstanding": None,
        },
        "optionsMarket": build_unavailable_options_payload("A-share options wall data is not supported yet", market="cn"),
        "history": {
            "timestamps": [str(value) for value in history_tx["date"].tolist()],
            "closes": [_safe_float(value) for value in history_tx["close"].tolist()],
            "highs": [_safe_float(value) for value in history_tx["high"].tolist()],
            "lows": [_safe_float(value) for value in history_tx["low"].tolist()],
            "volumes": [_safe_int(value) for value in history_tx["amount"].tolist()],
        },
    }


def fetch_quote(ticker, include_options=True):
    if is_a_share_ticker(ticker):
        return fetch_a_share_with_akshare(ticker)
    return fetch_us_quote_with_yfinance(ticker, include_options=include_options)


def fetch_quote_with_timeout(ticker, timeout_seconds=QUOTE_FETCH_TIMEOUT_SECONDS, include_options=True):
    result_queue = queue.Queue(maxsize=1)

    def worker():
        try:
            result_queue.put(("ok", fetch_quote(ticker, include_options=include_options)))
        except Exception as exc:
            result_queue.put(("error", exc))

    thread = threading.Thread(target=worker, daemon=True)
    thread.start()

    try:
        status, payload = result_queue.get(timeout=timeout_seconds)
    except queue.Empty:
        raise TimeoutError(f"Quote fetch timed out for {ticker} after {timeout_seconds}s")

    if status == "error":
        raise payload
    return payload


def get_cached_quote(ticker):
    with QUOTE_FETCH_LOCK:
        entry = CACHE.get(ticker)
        now = time.time()
        if entry and entry["expiresAt"] > now:
            return entry["value"]
        stale_value = entry["value"] if entry else None

        try:
            value = fetch_quote_with_timeout(ticker)
            CACHE[ticker] = {
                "value": value,
                "expiresAt": now + CACHE_SECONDS,
            }
            return value
        except Exception as exc:
            if not is_a_share_ticker(ticker):
                try:
                    value = fetch_quote_with_timeout(
                        ticker,
                        timeout_seconds=max(4, QUOTE_FETCH_TIMEOUT_SECONDS // 2),
                        include_options=False,
                    )
                    value["optionsMarket"] = value.get("optionsMarket") or build_unavailable_options_payload(
                        "Quote loaded but options snapshot is unavailable",
                        market="us",
                    )
                    value["quoteWarning"] = str(exc)
                    CACHE[ticker] = {
                        "value": value,
                        "expiresAt": now + CACHE_SECONDS,
                    }
                    return value
                except Exception:
                    pass
            if stale_value:
                fallback = stale_value.copy()
                fallback["error"] = str(exc)
                fallback["stale"] = True
                return fallback
            return build_unavailable_quote(ticker, str(exc))


def ensure_market_cache_dir():
    if MARKET_CACHE_DIR:
        os.makedirs(MARKET_CACHE_DIR, exist_ok=True)


def market_cache_module_dir(module_name):
    ensure_market_cache_dir()
    path = os.path.join(MARKET_CACHE_DIR, module_name)
    os.makedirs(path, exist_ok=True)
    return path


def market_cache_path(ticker, module_name="quotes"):
    safe_ticker = re.sub(r"[^A-Z0-9._-]", "_", normalize_ticker_input(ticker))
    return os.path.join(market_cache_module_dir(module_name), f"{safe_ticker}.json")


def market_cache_key_path(cache_key, module_name):
    safe_key = re.sub(r"[^A-Z0-9._-]", "_", _safe_text(cache_key) or "snapshot").upper()
    return os.path.join(market_cache_module_dir(module_name), f"{safe_key}.json")


def read_json_cache_file(path):
    try:
        if not path or not os.path.exists(path):
            return None
        with open(path, "r", encoding="utf-8") as handle:
            return json.load(handle)
    except Exception:
        traceback.print_exc()
        return None


def write_json_cache_file(path, payload):
    try:
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "w", encoding="utf-8") as handle:
            json.dump(payload, handle, ensure_ascii=False)
        return True
    except Exception:
        traceback.print_exc()
        return False


def read_module_cache(module_name, cache_key, legacy_path=None):
    payload = read_json_cache_file(market_cache_key_path(cache_key, module_name))
    if payload is not None:
        return payload
    if legacy_path:
        return read_json_cache_file(legacy_path)
    return None


def write_module_cache(module_name, cache_key, payload):
    return write_json_cache_file(market_cache_key_path(cache_key, module_name), payload)


def count_cache_files(module_name):
    try:
        directory = market_cache_module_dir(module_name)
        return len([name for name in os.listdir(directory) if name.endswith(".json")])
    except Exception:
        return 0


def parse_iso_datetime(value):
    if not value:
        return None
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except Exception:
        return None


def read_market_cache(ticker):
    try:
        legacy_path = os.path.join(MARKET_CACHE_DIR, f"{re.sub(r'[^A-Z0-9._-]', '_', normalize_ticker_input(ticker))}.json")
        cached = read_module_cache("quotes", ticker, legacy_path=legacy_path)
        if cached is None:
            return None
        updated_at = cached.get("updated_at") or cached.get("updatedAt")
        updated_dt = parse_iso_datetime(updated_at)
        cached["cache_age_seconds"] = (
            max(0, (datetime.now(timezone.utc) - updated_dt).total_seconds())
            if updated_dt else None
        )
        return cached
    except Exception:
        traceback.print_exc()
        return None


def is_market_cache_fresh(cached):
    if not cached:
        return False
    age_seconds = cached.get("cache_age_seconds")
    return age_seconds is not None and age_seconds <= MARKET_CACHE_TTL_SECONDS


def normalize_cached_market_quote(ticker, cached, stale=False):
    quote = cached.get("quote") if isinstance(cached, dict) else None
    if not isinstance(quote, dict):
        quote = cached if isinstance(cached, dict) else {}
    normalized = quote.copy()
    normalized["ticker"] = normalize_ticker_input(ticker)
    normalized["market_type"] = infer_market_type(normalized["ticker"])
    normalized["quote_status"] = "stale" if stale else normalized.get("quote_status") or "available"
    normalized["quote_source"] = normalized.get("quote_source") or "cache"
    normalized["stale"] = bool(stale)
    normalized["dataStaleness"] = "stale" if stale else normalized.get("dataStaleness") or "fresh"
    normalized["marketStatus"] = normalized.get("marketStatus") or ("closed" if stale else "open")
    normalized["cache_age_seconds"] = cached.get("cache_age_seconds") if isinstance(cached, dict) else None
    normalized["cache_updated_at"] = cached.get("updated_at") if isinstance(cached, dict) else None
    normalized["last_quote_time"] = normalized.get("updatedAt") or normalized.get("last_successful_update")
    return normalized


def extract_fundamental_fields_from_quote(quote):
    metadata = quote.get("metadata") if isinstance(quote, dict) else {}
    if not isinstance(metadata, dict):
        metadata = {}
    market_cap = quote.get("marketCap") if isinstance(quote, dict) else None
    free_cashflow = metadata.get("freeCashflow")
    price_fcf = None
    if _safe_float(market_cap) not in (None, 0) and _safe_float(free_cashflow) not in (None, 0):
        try:
            price_fcf = abs(_safe_float(market_cap) / _safe_float(free_cashflow))
        except Exception:
            price_fcf = None
    return {
        "pe": quote.get("trailingPE") if isinstance(quote, dict) else None,
        "forward_pe": quote.get("forwardPE") if isinstance(quote, dict) else None,
        "peg": metadata.get("pegRatio"),
        "ev_ebitda": metadata.get("enterpriseToEbitda"),
        "price_fcf": metadata.get("priceToFreeCashflow") if metadata.get("priceToFreeCashflow") is not None else price_fcf,
        "market_cap": market_cap,
        "revenue_growth": metadata.get("revenueGrowth"),
        "profit_margins": metadata.get("profitMargins"),
        "free_cashflow": free_cashflow,
    }


def extract_options_fields_from_quote(quote):
    options_market = quote.get("optionsMarket") if isinstance(quote, dict) else {}
    if not isinstance(options_market, dict):
        options_market = {}
    return {
        "status": "available" if options_market.get("available") else "unavailable",
        "reason": options_market.get("reason"),
        "call_wall": options_market.get("callWall"),
        "put_wall": options_market.get("putWall"),
        "gamma_flip": options_market.get("gammaFlip"),
        "expiries_count": len(options_market.get("expiries") or []),
        "coverage": options_market.get("coverage"),
    }


def fundamentals_cache_valid(payload):
    if not isinstance(payload, dict):
        return False
    fields = payload.get("fields") or {}
    return any(value is not None for value in fields.values())


def options_cache_valid(payload):
    if not isinstance(payload, dict):
        return False
    options = payload.get("options") or {}
    return any(options.get(key) is not None for key in ("put_wall", "call_wall", "gamma_flip")) or bool(options.get("expiries_count"))


def market_context_payload_status(payload):
    market_context = (payload or {}).get("market_context") or {}
    equity_trend = market_context.get("equity_trend") or {}
    available_keys = 0
    if (market_context.get("vix") or {}).get("value") is not None:
        available_keys += 1
    if (market_context.get("ten_year_yield") or {}).get("value") is not None:
        available_keys += 1
    if (equity_trend.get("spy") or {}).get("value") is not None:
        available_keys += 1
    if (equity_trend.get("qqq") or {}).get("value") is not None:
        available_keys += 1
    if (market_context.get("fear_greed") or {}).get("value") is not None:
        available_keys += 1
    if available_keys >= 4:
        return "available"
    if available_keys >= 1:
        return "partial"
    return "unavailable"


def market_context_payload_valid(payload):
    return market_context_payload_status(payload) in {"available", "partial"}


def flatten_market_context_payload(payload, meta=None):
    market_context = (payload or {}).get("market_context") or {}
    equity_trend = market_context.get("equity_trend") or {}
    return {
        "status": (meta or {}).get("status") or market_context_payload_status(payload),
        "updated_at": (meta or {}).get("cache_updated_at"),
        "vix": market_context.get("vix") or {},
        "ten_year_yield": market_context.get("ten_year_yield") or {},
        "spy_trend": equity_trend.get("spy") or {},
        "qqq_trend": equity_trend.get("qqq") or {},
        "fear_greed": market_context.get("fear_greed") or {},
        "score": market_context.get("score"),
        "regime": market_context.get("regime"),
        "confidence": market_context.get("confidence"),
        "summary": market_context.get("summary"),
        "cache_used": (meta or {}).get("cache_used"),
        "source_attempts": (meta or {}).get("source_attempts") or [],
    }


def cache_updated_at_and_age(payload):
    if not isinstance(payload, dict):
        return None, None
    updated_at = payload.get("updated_at") or payload.get("updatedAt")
    updated_dt = parse_iso_datetime(updated_at)
    age_seconds = (
        max(0, (datetime.now(timezone.utc) - updated_dt).total_seconds())
        if updated_dt else None
    )
    return updated_at, age_seconds


def fields_available_from_mapping(mapping):
    if not isinstance(mapping, dict):
        return []
    return [key for key, value in mapping.items() if value is not None]


def merge_quote_with_cached_modules(ticker, quote, cached):
    if not isinstance(quote, dict) or not cached:
        return quote
    cached_quote = normalize_cached_market_quote(ticker, cached, stale=False)
    merged = dict(quote)

    for field in ("shortName", "longName", "exchangeName", "marketCap", "trailingPE", "forwardPE"):
        if merged.get(field) is None and cached_quote.get(field) is not None:
            merged[field] = cached_quote.get(field)

    merged_metadata = dict(cached_quote.get("metadata") or {})
    merged_metadata.update({key: value for key, value in (merged.get("metadata") or {}).items() if value is not None})
    if merged_metadata:
        merged["metadata"] = merged_metadata

    live_options = merged.get("optionsMarket") if isinstance(merged.get("optionsMarket"), dict) else {}
    cached_options = cached_quote.get("optionsMarket") if isinstance(cached_quote.get("optionsMarket"), dict) else {}
    if cached_options and (not live_options or not live_options.get("available")):
        restored_options = dict(cached_options)
        restored_options["stale"] = True
        restored_options["reason"] = live_options.get("reason") or "Using cached options structure because the live option chain is unavailable."
        merged["optionsMarket"] = restored_options

    if (not merged.get("history")) and cached_quote.get("history"):
        merged["history"] = cached_quote.get("history")

    return merged


def write_market_cache(ticker, quote):
    try:
        updated_at = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        normalized = normalize_ticker_input(ticker)
        quote_payload = {
            "ticker": normalized,
            "market_type": infer_market_type(ticker),
            "quote": quote,
            "updated_at": updated_at,
        }
        write_json_cache_file(market_cache_path(normalized, "quotes"), quote_payload)
        write_module_cache("fundamentals", normalized, {
            "ticker": normalized,
            "market_type": infer_market_type(ticker),
            "updated_at": updated_at,
            "fields": extract_fundamental_fields_from_quote(quote),
            "quote_status": quote.get("quote_status"),
            "quote_source": quote.get("quote_source"),
        })
        write_module_cache("options", normalized, {
            "ticker": normalized,
            "market_type": infer_market_type(ticker),
            "updated_at": updated_at,
            "options": extract_options_fields_from_quote(quote),
            "quote_status": quote.get("quote_status"),
            "quote_source": quote.get("quote_source"),
        })
        return updated_at
    except Exception:
        traceback.print_exc()
        return None


def unavailable_company_news(reason="Company-news feed skipped for fast market-data response"):
    return {
        "sentiment": None,
        "score": 50,
        "summary": reason,
        "key_points": [],
        "latest_news": [],
        "bullish_news": [],
        "bearish_news": [],
        "key_catalysts": [],
        "risk_events": [],
        "source_info": build_source_info(
            "Data unavailable",
            missing_source="Google News RSS / Yahoo Finance",
            suggested_source="Google News RSS / Yahoo Finance / FMP / Polygon",
            source_name="Company News Feed",
        ),
    }


def build_unavailable_market_context(reason="Market context skipped for fast market-data response"):
    source_info = {
        "vix": build_source_info("Data unavailable", "Cboe / FRED / Yahoo Finance", "FRED VIXCLS / Yahoo Finance ^VIX / Cboe", "Macro Feed"),
        "fear_greed": build_source_info("Data unavailable", "CNN Fear & Greed", "CNN Fear & Greed direct endpoint / CNN scraper / RapidAPI / custom in-house sentiment composite.", "Fear & Greed Feed"),
        "ten_year_yield": build_source_info("Data unavailable", "FRED DGS10 / Yahoo Finance ^TNX", "FRED DGS10 / Yahoo Finance ^TNX / Alpha Vantage", "Macro Feed"),
        "fed_event": build_source_info("Data unavailable", "Economic calendar / market_events.json", "FMP Economic Calendar / Alpha Vantage / market_events.json", "market_events.json"),
        "equity_trend": build_source_info("Data unavailable", "Yahoo Finance SPY / QQQ", "Yahoo Finance SPY / QQQ", "Yahoo Finance"),
    }
    return {
        "macro": {
            "vix": None,
            "fear_greed": None,
            "treasury_yield": None,
            "score": 50,
            "summary": reason,
            "source_info": source_info,
        },
        "market_context": {
            "score": 50,
            "regime": "neutral",
            "confidence": 35,
            "vix": {"value": None, "change_5d": None, "change_20d": None, "trend": "neutral", "impact": "Data unavailable"},
            "fear_greed": {"value": None, "label": None, "trend": None, "impact": "Data unavailable"},
            "ten_year_yield": {"value": None, "change_5d_bps": None, "change_20d_bps": None, "trend": "neutral", "impact": "Data unavailable"},
            "equity_trend": {
                "spy": {"symbol": "SPY", "label": "SPY", "value": None, "change_5d_pct": None, "change_20d_pct": None, "trend": "neutral", "impact": "Data unavailable"},
                "qqq": {"symbol": "QQQ", "label": "QQQ", "value": None, "change_5d_pct": None, "change_20d_pct": None, "trend": "neutral", "impact": "Data unavailable"},
                "summary": reason,
                "impact": "neutral",
            },
            "summary": reason,
            "breakdown": {"base": 50, "final_score": 50},
            "strategy_impact": {},
            "source_info": source_info,
        },
        "broad_macro_news": {
            "score": 50,
            "sentiment": None,
            "major_events": [],
            "summary": reason,
            "source_info": build_source_info("Data unavailable", "Broad market news feed", "Google News RSS / Reuters / FMP Market News", "Broad Market News Feed"),
        },
    }


def read_market_context_cache():
    cached = read_module_cache("market_context", "snapshot")
    if not isinstance(cached, dict):
        return None
    updated_at = cached.get("updated_at") or cached.get("updatedAt")
    updated_dt = parse_iso_datetime(updated_at)
    cached["cache_age_seconds"] = (
        max(0, (datetime.now(timezone.utc) - updated_dt).total_seconds())
        if updated_dt else None
    )
    return cached


def write_market_context_cache(payload):
    updated_at = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    wrapped = {
        "updated_at": updated_at,
        "payload": payload,
    }
    write_module_cache("market_context", "snapshot", wrapped)
    return updated_at


def get_market_context_cached_snapshot(force=False, allow_live=True):
    attempts = []
    now = time.time()
    cached_memory = MARKET_CONTEXT_CACHE.get("value")
    if (
        cached_memory
        and not force
        and MARKET_CONTEXT_CACHE.get("expiresAt", 0) > now
        and (market_context_payload_valid(cached_memory) or not allow_live)
    ):
        attempts.append({"source": "memory_cache", "success": True, "fresh": True})
        return cached_memory, {
            "cache_used": True,
            "cache_layer": "memory",
            "source_attempts": attempts,
            "status": market_context_payload_status(cached_memory),
            "missing_fields": [],
            "cache_updated_at": None,
        }

    cached_disk = read_market_context_cache()
    cached_disk_payload = cached_disk.get("payload") if isinstance(cached_disk, dict) else None
    cache_is_fresh = (
        cached_disk is not None
        and cached_disk.get("cache_age_seconds") is not None
        and cached_disk.get("cache_age_seconds") <= MARKET_CACHE_TTL_SECONDS
    )
    if cached_disk:
        attempts.append({
            "source": "disk_cache",
            "success": True,
            "fresh": cache_is_fresh,
            "age_minutes": round((cached_disk.get("cache_age_seconds") or 0) / 60, 2) if cached_disk.get("cache_age_seconds") is not None else None,
        })
        if cached_disk_payload and not force and cache_is_fresh and (market_context_payload_valid(cached_disk_payload) or not allow_live):
            MARKET_CONTEXT_CACHE["value"] = cached_disk_payload
            MARKET_CONTEXT_CACHE["expiresAt"] = now + NEWS_CACHE_SECONDS
            return cached_disk_payload, {
                "cache_used": True,
                "cache_layer": "disk",
                "source_attempts": attempts,
                "status": market_context_payload_status(cached_disk_payload),
                "missing_fields": [],
                "cache_updated_at": cached_disk.get("updated_at"),
            }

    if allow_live:
        live_payload = _run_with_timeout(fetch_market_context_payload, 8, fallback=None)
        if live_payload and market_context_payload_valid(live_payload):
            MARKET_CONTEXT_CACHE["value"] = live_payload
            MARKET_CONTEXT_CACHE["expiresAt"] = now + NEWS_CACHE_SECONDS
            cache_updated_at = write_market_context_cache(live_payload)
            attempts.append({"source": "live_market_context", "success": True, "fresh": True})
            return live_payload, {
                "cache_used": False,
                "cache_layer": None,
                "source_attempts": attempts,
                "status": market_context_payload_status(live_payload),
                "missing_fields": [],
                "cache_updated_at": cache_updated_at,
            }
        attempts.append({"source": "live_market_context", "success": False, "error": "Live market-context fetch failed, timed out, or returned no usable VIX/10Y/SPY/QQQ/Fear-Greed fields"})

    if cached_disk_payload:
        return cached_disk_payload, {
            "cache_used": True,
            "cache_layer": "disk",
            "source_attempts": attempts,
            "status": "stale" if market_context_payload_valid(cached_disk_payload) else "unavailable",
            "missing_fields": [],
            "cache_updated_at": cached_disk.get("updated_at"),
        }

    if cached_memory:
        return cached_memory, {
            "cache_used": True,
            "cache_layer": "memory",
            "source_attempts": attempts,
            "status": "stale" if market_context_payload_valid(cached_memory) else "unavailable",
            "missing_fields": [],
            "cache_updated_at": None,
        }

    unavailable = build_unavailable_market_context()
    missing_fields = ["vix", "fear_greed", "ten_year_yield", "spy_trend", "qqq_trend"]
    return unavailable, {
        "cache_used": False,
        "cache_layer": None,
        "source_attempts": attempts,
        "status": "unavailable",
        "missing_fields": missing_fields,
        "cache_updated_at": None,
    }


def get_lightweight_market_context(force=False, allow_live=True):
    payload, _meta = get_market_context_cached_snapshot(force=force, allow_live=allow_live)
    return payload


def build_unavailable_or_cached_quote(ticker, error_message, cached=None):
    if cached:
        quote = normalize_cached_market_quote(ticker, cached, stale=True)
        quote["error"] = error_message
        quote["quoteWarning"] = error_message
        return quote, {"ticker": normalize_ticker_input(ticker), "error": error_message, "used_cache": True}
    quote = build_unavailable_quote(ticker, error_message)
    quote["ticker"] = normalize_ticker_input(ticker)
    quote["market_type"] = infer_market_type(ticker)
    quote["quote_status"] = "unavailable"
    quote["quote_source"] = None
    quote["last_quote_time"] = None
    quote["companyNews"] = unavailable_company_news()
    return quote, {"ticker": normalize_ticker_input(ticker), "error": error_message, "used_cache": False}


def fetch_market_quote_for_ticker(ticker, force=False):
    ticker = normalize_ticker_input(ticker)
    attempts = []
    cached = read_market_cache(ticker)
    if cached:
        attempts.append({
            "source": "cache",
            "success": True,
            "price": ((cached.get("quote") or {}).get("price") if isinstance(cached.get("quote"), dict) else cached.get("price")),
            "age_minutes": round((cached.get("cache_age_seconds") or 0) / 60, 2) if cached.get("cache_age_seconds") is not None else None,
            "fresh": is_market_cache_fresh(cached),
        })
        if not force and is_market_cache_fresh(cached):
            quote = normalize_cached_market_quote(ticker, cached, stale=False)
            quote["companyNews"] = quote.get("companyNews") or unavailable_company_news()
            return quote, None, True, attempts

    source_name = "a_share_direct" if is_a_share_ticker(ticker) else "yfinance"
    try:
        quote = fetch_quote_with_timeout(
            ticker,
            timeout_seconds=MARKET_DATA_PER_TICKER_TIMEOUT_SECONDS,
            include_options=True,
        )
        if quote.get("price") is None:
            raise ValueError("Live quote returned no price")
        quote = merge_quote_with_cached_modules(ticker, quote, cached)
        quote["ticker"] = ticker
        quote["market_type"] = infer_market_type(ticker)
        quote["quote_status"] = "available"
        quote["quote_source"] = source_name
        quote["stale"] = False
        quote["dataStaleness"] = quote.get("dataStaleness") or "fresh"
        quote["last_quote_time"] = quote.get("updatedAt") or quote.get("last_successful_update")
        quote["companyNews"] = quote.get("companyNews") or unavailable_company_news()
        CACHE[ticker] = {"value": quote, "expiresAt": time.time() + CACHE_SECONDS}
        quote["cache_updated_at"] = write_market_cache(ticker, quote)
        attempts.append({"source": source_name, "success": True, "price": quote.get("price"), "error": None})
        return quote, None, False, attempts
    except Exception as exc:
        error_message = str(exc)
        attempts.append({"source": source_name, "success": False, "price": None, "error": error_message})
        if not is_a_share_ticker(ticker):
            try:
                quote = fetch_quote_with_timeout(
                    ticker,
                    timeout_seconds=max(1, min(5, MARKET_DATA_PER_TICKER_TIMEOUT_SECONDS)),
                    include_options=False,
                )
                if quote.get("price") is None:
                    raise ValueError("Live quote without options returned no price")
                quote["optionsMarket"] = quote.get("optionsMarket") or build_unavailable_options_payload(
                    "Quote loaded but options snapshot is unavailable",
                    market="us",
                )
                quote = merge_quote_with_cached_modules(ticker, quote, cached)
                quote["ticker"] = ticker
                quote["market_type"] = infer_market_type(ticker)
                quote["quote_status"] = "available"
                quote["quote_source"] = f"{source_name}:quote_only"
                quote["stale"] = False
                quote["dataStaleness"] = quote.get("dataStaleness") or "fresh"
                quote["last_quote_time"] = quote.get("updatedAt") or quote.get("last_successful_update")
                quote["companyNews"] = quote.get("companyNews") or unavailable_company_news()
                quote["quoteWarning"] = error_message
                CACHE[ticker] = {"value": quote, "expiresAt": time.time() + CACHE_SECONDS}
                quote["cache_updated_at"] = write_market_cache(ticker, quote)
                attempts.append({"source": f"{source_name}:quote_only", "success": True, "price": quote.get("price"), "error": None})
                return quote, None, False, attempts
            except Exception as fallback_exc:
                error_message = f"{error_message}; quote-only fallback failed: {fallback_exc}"
                attempts.append({"source": f"{source_name}:quote_only", "success": False, "price": None, "error": str(fallback_exc)})
        quote, failure = build_unavailable_or_cached_quote(ticker, error_message, cached=cached)
        quote["companyNews"] = quote.get("companyNews") or unavailable_company_news()
        return quote, failure, bool(cached), attempts


def quote_to_market_item(ticker, quote):
    last_quote_time = None
    if isinstance(quote, dict):
        last_quote_time = quote.get("last_quote_time") or quote.get("updatedAt")
    return {
        "ticker": normalize_ticker_input(ticker),
        "market_type": infer_market_type(ticker),
        "price": quote.get("price") if isinstance(quote, dict) else None,
        "quote_status": quote.get("quote_status") if isinstance(quote, dict) else "unavailable",
        "quote_source": quote.get("quote_source") if isinstance(quote, dict) else None,
        "last_quote_time": last_quote_time,
        "analysis": quote if isinstance(quote, dict) else {},
        "error": quote.get("error") if isinstance(quote, dict) else "Quote unavailable",
    }


def build_market_data_payload(tickers, force=False, auto_refresh=False, cache_only=True):
    normalized_tickers = []
    seen = set()
    for raw_ticker in tickers:
        ticker = normalize_ticker_input(raw_ticker)
        if ticker and ticker not in seen:
            normalized_tickers.append(ticker)
            seen.add(ticker)
    requested_count = len(normalized_tickers)
    requested_tickers = list(normalized_tickers)
    if len(normalized_tickers) > MARKET_DATA_MAX_TICKERS:
        normalized_tickers = normalized_tickers[:MARKET_DATA_MAX_TICKERS]
    processed_tickers = list(normalized_tickers)
    missing_from_request = [ticker for ticker in requested_tickers if ticker not in processed_tickers]

    quotes = {}
    failed = []
    used_cache_count = 0
    stale_cache_count = 0
    us_live_tickers = []
    a_share_live_tickers = []
    live_attempted_tickers = []
    live_success_tickers = []
    live_failed_tickers = []
    cache_only_tickers = []
    deferred_live_tickers = []
    source_attempts_by_ticker = {}
    live_refresh_started = False
    live_refresh_completed = False
    cache_age_samples = []

    for ticker in normalized_tickers:
        cached = read_market_cache(ticker)
        if cached:
            if cached.get("cache_age_seconds") is not None:
                cache_age_samples.append(cached.get("cache_age_seconds"))
            if is_market_cache_fresh(cached) and not force:
                quote = normalize_cached_market_quote(ticker, cached, stale=False)
                quote["companyNews"] = quote.get("companyNews") or unavailable_company_news()
                quotes[ticker] = quote
                used_cache_count += 1
                cache_only_tickers.append(ticker)
                continue
            if cache_only and not force and not auto_refresh:
                quote = normalize_cached_market_quote(ticker, cached, stale=True)
                quote["companyNews"] = quote.get("companyNews") or unavailable_company_news()
                quotes[ticker] = quote
                used_cache_count += 1
                stale_cache_count += 1
                cache_only_tickers.append(ticker)
                continue
        if cache_only and not force and not auto_refresh:
            quote, failure = build_unavailable_or_cached_quote(
                ticker,
                "No cached quote available yet",
                cached=cached,
            )
            quotes[ticker] = quote
            if cached:
                used_cache_count += 1
                stale_cache_count += 1
            cache_only_tickers.append(ticker)
            if failure:
                failed.append(failure)
            continue
        if auto_refresh and cached and is_market_cache_fresh(cached):
            quote = normalize_cached_market_quote(ticker, cached, stale=False)
            quote["companyNews"] = quote.get("companyNews") or unavailable_company_news()
            quotes[ticker] = quote
            used_cache_count += 1
            cache_only_tickers.append(ticker)
            continue
        if is_a_share_ticker(ticker):
            a_share_live_tickers.append(ticker)
        else:
            us_live_tickers.append(ticker)

    live_candidates = us_live_tickers + a_share_live_tickers
    if (force or auto_refresh) and len(live_candidates) > MARKET_DATA_MAX_LIVE_TICKERS:
        allowed_live = set(live_candidates[:MARKET_DATA_MAX_LIVE_TICKERS])
        deferred_live_tickers = [ticker for ticker in live_candidates if ticker not in allowed_live]
        us_live_tickers = [ticker for ticker in us_live_tickers if ticker in allowed_live]
        a_share_live_tickers = [ticker for ticker in a_share_live_tickers if ticker in allowed_live]
        for ticker in deferred_live_tickers:
            cached = read_market_cache(ticker)
            quote, failure = build_unavailable_or_cached_quote(
                ticker,
                f"Live refresh deferred: request exceeded per-request live limit ({MARKET_DATA_MAX_LIVE_TICKERS})",
                cached=cached,
            )
            quote["companyNews"] = quote.get("companyNews") or unavailable_company_news()
            quotes[ticker] = quote
            source_attempts_by_ticker[ticker] = [{
                "source": "live_refresh_limit",
                "success": False,
                "deferred": True,
                "error": f"Per-request live refresh limit is {MARKET_DATA_MAX_LIVE_TICKERS}",
            }]
            cache_only_tickers.append(ticker)
            if cached:
                used_cache_count += 1
                stale_cache_count += 1 if quote.get("stale") or quote.get("quote_status") == "stale" else 0
            if failure:
                failed.append(failure)

    executor = None
    futures = {}
    completed = set()
    if us_live_tickers:
        live_refresh_started = True
        live_attempted_tickers.extend(us_live_tickers)
        executor = ThreadPoolExecutor(max_workers=max(1, MARKET_DATA_MAX_WORKERS))
        futures = {
            executor.submit(fetch_market_quote_for_ticker, ticker, force): ticker
            for ticker in us_live_tickers
        }
        try:
            for future in as_completed(futures, timeout=MARKET_DATA_ROUTE_TIMEOUT_SECONDS):
                ticker = futures[future]
                completed.add(ticker)
                try:
                    quote, failure, used_cache, attempts = future.result(timeout=1)
                except Exception as exc:
                    traceback.print_exc()
                    cached = read_market_cache(ticker)
                    quote, failure = build_unavailable_or_cached_quote(ticker, str(exc), cached=cached)
                    used_cache = bool(cached)
                    attempts = [{"source": "worker", "success": False, "error": str(exc)}]
                quotes[ticker] = quote
                source_attempts_by_ticker[ticker] = attempts
                if quote.get("price") is not None and not used_cache:
                    live_success_tickers.append(ticker)
                elif failure:
                    live_failed_tickers.append(ticker)
                if used_cache:
                    used_cache_count += 1
                    stale_cache_count += 1 if quote.get("stale") or quote.get("quote_status") == "stale" else 0
                if failure:
                    failed.append(failure)
        except FuturesTimeoutError:
            pass
        finally:
            for future, ticker in futures.items():
                if ticker in completed:
                    continue
                future.cancel()
                cached = read_market_cache(ticker)
                quote, failure = build_unavailable_or_cached_quote(
                    ticker,
                    f"Market-data route timed out before {ticker} completed",
                    cached=cached,
                )
                quotes[ticker] = quote
                source_attempts_by_ticker[ticker] = [{"source": "route_timeout", "success": False, "error": f"Market-data route timed out before {ticker} completed"}]
                live_failed_tickers.append(ticker)
                if cached:
                    used_cache_count += 1
                    stale_cache_count += 1 if quote.get("stale") or quote.get("quote_status") == "stale" else 0
                if failure:
                    failed.append(failure)
            if executor:
                executor.shutdown(wait=False, cancel_futures=True)
        live_refresh_completed = True

    for ticker in a_share_live_tickers:
        live_refresh_started = True
        live_attempted_tickers.append(ticker)
        try:
            quote, failure, used_cache, attempts = fetch_market_quote_for_ticker(ticker, force=force)
        except Exception as exc:
            traceback.print_exc()
            cached = read_market_cache(ticker)
            quote, failure = build_unavailable_or_cached_quote(ticker, str(exc), cached=cached)
            used_cache = bool(cached)
            attempts = [{"source": "a_share_worker", "success": False, "error": str(exc)}]
        quotes[ticker] = quote
        source_attempts_by_ticker[ticker] = attempts
        if quote.get("price") is not None and not used_cache:
            live_success_tickers.append(ticker)
        elif failure:
            live_failed_tickers.append(ticker)
        if used_cache:
            used_cache_count += 1
            stale_cache_count += 1 if quote.get("stale") or quote.get("quote_status") == "stale" else 0
        if failure:
            failed.append(failure)
    if a_share_live_tickers:
        live_refresh_completed = True

    for ticker in normalized_tickers:
        if ticker not in quotes:
            quote, failure = build_unavailable_or_cached_quote(ticker, "Quote unavailable")
            quotes[ticker] = quote
            failed.append(failure)
            live_failed_tickers.append(ticker)

    request_started_at = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    market_context, market_context_meta = get_market_context_cached_snapshot(
        force=False,
        allow_live=bool(force or auto_refresh),
    )
    fetched_at = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    request_completed_at = fetched_at
    quote_times = [
        quote.get("updatedAt")
        for quote in quotes.values()
        if isinstance(quote, dict) and quote.get("updatedAt")
    ]
    updated_at = max(quote_times) if quote_times else fetched_at
    refresh_reference_candidates = []
    for quote in quotes.values():
        if isinstance(quote, dict) and quote.get("cache_updated_at") and quote.get("price") is not None:
            refresh_reference_candidates.append(quote.get("cache_updated_at"))
    if market_context_meta.get("cache_updated_at") and market_context_payload_valid(market_context):
        refresh_reference_candidates.append(market_context_meta.get("cache_updated_at"))
    if not refresh_reference_candidates:
        if any(
            isinstance(quote, dict)
            and quote.get("price") is not None
            and not quote.get("stale")
            and quote.get("quote_source") not in {None, "cache"}
            for quote in quotes.values()
        ) or (not market_context_meta.get("cache_used") and market_context_payload_valid(market_context)):
            refresh_reference_candidates.append(fetched_at)
    last_dashboard_refresh = max(refresh_reference_candidates) if refresh_reference_candidates else None
    live_refresh_successful = bool(live_success_tickers) or (
        not market_context_meta.get("cache_used") and market_context_payload_valid(market_context)
    )
    last_successful_live_refresh_at = fetched_at if live_refresh_successful else None
    last_successful_cache_update_at = last_dashboard_refresh
    last_any_successful_ticker_refresh_at = max([
        quote.get("cache_updated_at") or quote.get("updatedAt")
        for quote in quotes.values()
        if isinstance(quote, dict) and quote.get("price") is not None and (quote.get("cache_updated_at") or quote.get("updatedAt"))
    ] or [None])
    stale_quote_count = sum(
        1 for quote in quotes.values()
        if isinstance(quote, dict) and (
            quote.get("stale")
            or quote.get("dataStaleness") == "stale"
            or quote.get("quote_status") == "stale"
        )
    )
    unavailable_count = sum(
        1 for quote in quotes.values()
        if isinstance(quote, dict) and quote.get("quote_status") == "unavailable"
    )
    items = [quote_to_market_item(ticker, quotes[ticker]) for ticker in normalized_tickers]
    success_count = sum(
        1 for quote in quotes.values()
        if isinstance(quote, dict) and quote.get("price") is not None
    )
    cache_age_minutes = round((max(cache_age_samples) / 60), 2) if cache_age_samples else None
    last_refresh_dt = parse_iso_datetime(last_dashboard_refresh) if last_dashboard_refresh else None
    next_refresh_dt = (last_refresh_dt + timedelta(minutes=60)) if last_refresh_dt else None
    for ticker, quote in quotes.items():
        if isinstance(quote, dict):
            quote["data_quality"] = {
                "quote_status": quote.get("quote_status") or ("stale" if quote.get("stale") else "available"),
                "quote_source": quote.get("quote_source"),
                "fundamental_status": "stale" if quote.get("stale") else "available" if (
                    quote.get("trailingPE") is not None
                    or quote.get("forwardPE") is not None
                    or ((quote.get("metadata") or {}).get("freeCashflow") is not None)
                ) else "unavailable",
                "options_status": "stale" if quote.get("stale") and (quote.get("optionsMarket") or {}).get("available") else "available" if (quote.get("optionsMarket") or {}).get("available") else "unavailable",
                "market_context_status": market_context_meta.get("status"),
                "cache_used": bool(quote.get("quote_source") == "cache" or quote.get("stale")),
                "stale_fields": ["price"] if quote.get("stale") else [],
                "unavailable_fields": [
                    field for field, value in {
                        "price": quote.get("price"),
                        "trailingPE": quote.get("trailingPE"),
                        "forwardPE": quote.get("forwardPE"),
                    }.items()
                    if value is None
                ],
                "warnings": [quote.get("error")] if quote.get("error") else [],
            }
            quote["source_attempts"] = source_attempts_by_ticker.get(ticker, [])
            quote["fundamentals"] = {
                "fields": extract_fundamental_fields_from_quote(quote),
                "status": quote["data_quality"]["fundamental_status"],
                "source_attempts": source_attempts_by_ticker.get(ticker, []),
            }
            quote["options_debug"] = {
                "fields": extract_options_fields_from_quote(quote),
                "status": quote["data_quality"]["options_status"],
                "source_attempts": source_attempts_by_ticker.get(ticker, []),
            }

    warning = None
    if requested_count > len(normalized_tickers):
        warning = f"Ticker list truncated to {MARKET_DATA_MAX_TICKERS} symbols"

    return {
        "success": success_count > 0,
        "source": "cache-first-yfinance-akshare",
        "quotes": quotes,
        "items": items,
        "data": quotes,
        "failed": failed,
        "warning": warning,
        "marketContext": market_context,
        "market_context": flatten_market_context_payload(market_context, market_context_meta),
        "fetchedAt": fetched_at,
        "updatedAt": updated_at,
        "requested_tickers": requested_tickers,
        "processed_tickers": processed_tickers,
        "missing_from_request": missing_from_request,
        "refresh_status": {
            "refresh_interval_minutes": 60,
            "request_started_at": request_started_at,
            "request_completed_at": request_completed_at,
            "last_successful_live_refresh_at": last_successful_live_refresh_at,
            "last_successful_cache_update_at": last_successful_cache_update_at,
            "last_any_successful_ticker_refresh_at": last_any_successful_ticker_refresh_at,
            "last_dashboard_refresh": last_dashboard_refresh,
            "next_dashboard_refresh": next_refresh_dt.strftime("%Y-%m-%dT%H:%M:%SZ") if next_refresh_dt else None,
            "next_auto_refresh_at": next_refresh_dt.strftime("%Y-%m-%dT%H:%M:%SZ") if next_refresh_dt else None,
            "cache_age_minutes": cache_age_minutes,
            "is_cache_only": bool(cache_only and not force and not auto_refresh),
            "is_force_refresh": bool(force),
            "is_auto_refresh": bool(auto_refresh),
            "live_refresh_started": live_refresh_started,
            "live_refresh_completed": live_refresh_completed if live_refresh_started else False,
            "force_requested_tickers": requested_tickers if force else [],
            "live_limit_per_request": MARKET_DATA_MAX_LIVE_TICKERS,
            "live_attempted_tickers": sorted(set(live_attempted_tickers)),
            "live_success_tickers": sorted(set(live_success_tickers)),
            "live_failed_tickers": sorted(set(live_failed_tickers)),
            "deferred_live_tickers": sorted(set(deferred_live_tickers)),
            "cache_only_tickers": sorted(set(cache_only_tickers)),
            "requested_tickers": requested_tickers,
            "processed_tickers": processed_tickers,
            "missing_from_request": missing_from_request,
            "total_tickers": len(normalized_tickers),
            "success_count": success_count,
            "failed_count": len(failed),
            "unavailable_count": unavailable_count,
            "has_stale_quotes": stale_quote_count > 0 or unavailable_count > 0,
            "stale_quote_count": stale_quote_count,
            "unavailable_quote_count": unavailable_count,
            "used_cache_count": used_cache_count,
            "stale_cache_count": stale_cache_count,
            "is_partial": success_count > 0 and success_count < len(normalized_tickers),
            "is_loading_live_data": success_count > 0 and success_count < len(normalized_tickers) and len(failed) == 0,
            "force_refresh": bool(force),
        },
    }


def get_quote_for_debug_modules(ticker, force=False, include_options=True):
    normalized = normalize_ticker_input(ticker)
    cached = read_market_cache(normalized)
    if cached and not force and is_market_cache_fresh(cached):
        quote = normalize_cached_market_quote(normalized, cached, stale=False)
        return quote, True, None
    try:
        quote = fetch_quote_with_timeout(
            normalized,
            timeout_seconds=MARKET_DATA_PER_TICKER_TIMEOUT_SECONDS,
            include_options=include_options,
        )
        quote["ticker"] = normalized
        quote["market_type"] = infer_market_type(normalized)
        quote["quote_status"] = "available"
        quote["quote_source"] = "akshare" if is_a_share_ticker(normalized) else "yfinance"
        write_market_cache(normalized, quote)
        return quote, False, None
    except Exception as exc:
        if cached:
            quote = normalize_cached_market_quote(normalized, cached, stale=True)
            quote["error"] = str(exc)
            return quote, True, str(exc)
        return build_unavailable_quote(normalized, str(exc)), False, str(exc)


def watchlist_response_payload(items):
    return {
        "success": True,
        "items": items,
        "watchlist": watchlist_items_to_tickers(items),
        "updatedAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
    }


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
        if parsed.path == "/api/symbol-search":
            self.handle_symbol_search(parsed)
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
        if parsed.path == "/api/watchlist" or parsed.path.startswith("/api/watchlist/"):
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
                    "metadata": {
                        "sector": None,
                        "industry": None,
                        "beta": None,
                        "dividendYield": None,
                        "payoutRatio": None,
                        "enterpriseToEbitda": None,
                        "priceToSalesTrailing12Months": None,
                        "enterpriseToRevenue": None,
                        "operatingMargins": None,
                        "grossMargins": None,
                        "returnOnEquity": None,
                        "debtToEquity": None,
                        "currentRatio": None,
                        "quickRatio": None,
                        "freeCashflow": None,
                        "totalCash": None,
                        "totalDebt": None,
                        "capex": None,
                        "businessSummary": None,
                        "ipoDate": None,
                        "floatShares": None,
                        "sharesOutstanding": None,
                    },
                    "optionsMarket": build_unavailable_options_payload(str(exc), market="cn" if is_a_share_ticker(ticker) else "us"),
                    "history": {"timestamps": [], "closes": [], "highs": [], "lows": [], "volumes": []},
                    "error": str(exc),
                }

        for ticker, quote in quotes.items():
            try:
                quote["companyNews"] = get_cached_company_news(ticker, quote)
            except Exception as exc:
                quote["companyNews"] = {
                    "sentiment": None,
                    "score": 50,
                    "summary": f"Company-news feed unavailable: {exc}",
                    "key_points": [],
                    "latest_news": [],
                    "bullish_news": [],
                    "bearish_news": [],
                    "key_catalysts": [],
                    "risk_events": [],
                    "source_info": build_source_info(
                        "Data unavailable",
                        missing_source="Google News RSS / Yahoo Finance",
                        suggested_source="Google News RSS / Yahoo Finance / FMP / Polygon",
                        source_name="Company News Feed",
                    ),
                }

        try:
            market_context = get_cached_market_context()
        except Exception as exc:
            market_context = {
                "macro": {
                    "vix": None,
                    "fear_greed": None,
                    "treasury_yield": None,
                    "fed_funds_rate": None,
                    "fomc_rate_path": None,
                    "score": 50,
                    "summary": f"Macro feed unavailable: {exc}",
                    "source_info": {
                        "vix": build_source_info("Data unavailable", "Cboe / FRED / Yahoo Finance", "Cboe / FRED VIXCLS / Yahoo Finance", "Macro Feed"),
                        "fear_greed": build_source_info("Data unavailable", "CNN Fear & Greed", "CNN Fear & Greed direct endpoint / CNN scraper / RapidAPI / custom in-house sentiment composite.", "Fear & Greed Feed"),
                        "treasury_yield": build_source_info("Data unavailable", "FRED / Yahoo Finance ^TNX", "FRED / Yahoo Finance ^TNX / Alpha Vantage", "Macro Feed"),
                        "fed_funds_rate": build_source_info("Data unavailable", "FRED DFF / FEDFUNDS", "FRED DFF / FEDFUNDS", "FRED"),
                        "fomc_rate_path": build_source_info("Data unavailable", "Federal Reserve / FRED", "Federal Reserve FOMC / FRED DFF", "Federal Reserve / FRED"),
                        "market_events": build_source_info("Live", "Economic calendar / market_events.json", "FMP Economic Calendar / Alpha Vantage / market_events.json", "market_events.json"),
                        "equity_trend": build_source_info("Data unavailable", "Yahoo Finance SPY / QQQ", "Yahoo Finance SPY / QQQ", "Yahoo Finance"),
                    },
                },
                "market_context": {
                    "score": 50,
                    "regime": "neutral",
                    "confidence": 45,
                    "vix": {"value": None, "change_5d": None, "change_20d": None, "trend": "neutral", "impact": "Data unavailable"},
                    "fear_greed": {"value": None, "label": None, "trend": None, "impact": "Data unavailable"},
                    "ten_year_yield": {"value": None, "change_5d_bps": None, "change_20d_bps": None, "trend": "neutral", "impact": "Data unavailable"},
                    "fed_event": {
                        "active": False,
                        "type": None,
                        "title": None,
                        "impact": None,
                        "severity": None,
                        "summary": f"Fed / rate event feed unavailable: {exc}",
                        "date": None,
                        "source": "market_events.json",
                    },
                    "equity_trend": {
                        "spy": {"symbol": "SPY", "label": "SPY", "value": None, "change_5d_pct": None, "change_20d_pct": None, "trend": "neutral", "impact": "Data unavailable"},
                        "qqq": {"symbol": "QQQ", "label": "QQQ", "value": None, "change_5d_pct": None, "change_20d_pct": None, "trend": "neutral", "impact": "Data unavailable"},
                        "summary": f"Equity trend feed unavailable: {exc}",
                        "impact": "neutral",
                    },
                    "summary": f"Market context feed unavailable: {exc}",
                    "breakdown": {
                        "base": 50,
                        "vix": 0,
                        "vix_momentum": 0,
                        "fear_greed_short": 0,
                        "fear_greed_long": 0,
                        "ten_year_yield": 0,
                        "fed_event_short": 0,
                        "fed_event_mid": 0,
                        "fed_event_long": 0,
                        "equity_trend": 0,
                        "macro_news": 0,
                        "final_score": 50,
                    },
                    "strategy_impact": {
                        "buy_stock": "Data unavailable",
                        "sell_put": "Data unavailable",
                        "covered_call": "Data unavailable",
                        "wait_no_action": "Data unavailable",
                    },
                    "source_info": {
                        "vix": build_source_info("Data unavailable", "Cboe / FRED / Yahoo Finance", "FRED VIXCLS / Yahoo Finance ^VIX / Cboe", "Macro Feed"),
                        "fear_greed": build_source_info("Data unavailable", "CNN Fear & Greed", "CNN Fear & Greed direct endpoint / CNN scraper / RapidAPI / custom in-house sentiment composite.", "Fear & Greed Feed"),
                        "ten_year_yield": build_source_info("Data unavailable", "FRED DGS10 / Yahoo Finance ^TNX", "FRED DGS10 / Yahoo Finance ^TNX / Alpha Vantage", "Macro Feed"),
                        "fed_event": build_source_info("Live", "Economic calendar / market_events.json", "FMP Economic Calendar / Alpha Vantage / market_events.json", "market_events.json"),
                        "equity_trend": build_source_info("Data unavailable", "Yahoo Finance SPY / QQQ", "Yahoo Finance SPY / QQQ", "Yahoo Finance"),
                    },
                },
                "broad_macro_news": {
                    "score": 50,
                    "sentiment": None,
                    "major_events": [],
                    "summary": f"Broad macro-news feed unavailable: {exc}",
                    "source_info": build_source_info("Data unavailable", "Broad market news feed", "Google News RSS / Reuters / FMP Market News", "Broad Market News Feed"),
                },
            }

        payload = {
            "source": "yfinance-akshare",
            "quotes": quotes,
            "marketContext": market_context,
        }
        payload["fetchedAt"] = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        quote_times = [
            quote.get("updatedAt")
            for quote in quotes.values()
            if isinstance(quote, dict) and quote.get("updatedAt")
        ]
        payload["updatedAt"] = max(quote_times) if quote_times else datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        stale_quote_count = sum(
            1 for quote in quotes.values()
            if isinstance(quote, dict) and (quote.get("stale") or quote.get("dataStaleness") == "stale")
        )
        next_refresh_dt = datetime.fromisoformat(payload["fetchedAt"].replace("Z", "+00:00")) + timedelta(minutes=60)
        payload["refresh_status"] = {
            "refresh_interval_minutes": 60,
            "last_dashboard_refresh": payload["fetchedAt"],
            "next_dashboard_refresh": next_refresh_dt.strftime("%Y-%m-%dT%H:%M:%SZ"),
            "has_stale_quotes": stale_quote_count > 0,
            "stale_quote_count": stale_quote_count,
        }
        body = json.dumps(payload).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        try:
            self.wfile.write(body)
        except (BrokenPipeError, ConnectionResetError):
            return

    def handle_symbol_search(self, parsed):
        params = parse_qs(parsed.query)
        query = normalize_search_query(params.get("q", [""])[0])
        limit_raw = params.get("limit", ["10"])[0]
        try:
            limit = max(1, min(int(limit_raw), 20))
        except ValueError:
            limit = 10

        if not query:
            self.respond_json(200, {"query": "", "candidates": []})
            return

        candidates = search_symbol_candidates(query, limit=limit)
        self.respond_json(200, {
            "query": query,
            "candidates": candidates,
            "updatedAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        })

    def respond_json(self, status, payload):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def handle_watchlist_get(self):
        items = load_shared_watchlist_items()
        self.respond_json(200, watchlist_response_payload(items))

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
        market_type = infer_market_type(ticker, payload.get("market_type"))
        if not ticker:
            self.respond_json(400, {"error": "Ticker is required"})
            return

        items = add_shared_ticker(ticker, market_type)
        self.respond_json(200, watchlist_response_payload(items))

    def handle_watchlist_delete(self, parsed):
        params = parse_qs(parsed.query)
        path_prefix = "/api/watchlist/"
        path_ticker = unquote(parsed.path[len(path_prefix):]) if parsed.path.startswith(path_prefix) else ""
        ticker = normalize_ticker_input(path_ticker or params.get("ticker", [""])[0])
        market_type = params.get("market_type", [None])[0]
        if not ticker:
            self.respond_json(400, {"error": "Ticker is required"})
            return

        items = remove_shared_ticker(ticker, market_type)
        self.respond_json(200, watchlist_response_payload(items))


app = Flask(__name__, static_folder=ROOT, static_url_path="")
app.json.ensure_ascii = False
if CORS:
    CORS(app)


@app.after_request
def add_no_store_headers(response):
    response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
    response.headers["Pragma"] = "no-cache"
    response.headers["Expires"] = "0"
    return response


@app.route("/api/market-data")
def api_market_data():
    try:
        tickers = [
            normalize_ticker_input(ticker)
            for ticker in request.args.get("tickers", "").split(",")
            if normalize_ticker_input(ticker)
        ]
        force = str(request.args.get("force", "")).strip().lower() in {"1", "true", "yes", "y"}
        auto_refresh = str(request.args.get("auto_refresh", "")).strip().lower() in {"1", "true", "yes", "y"}
        cache_only_param = str(request.args.get("cache_only", "")).strip().lower()
        cache_only = cache_only_param not in {"0", "false", "no", "n"}
        if force:
            cache_only = False
        if auto_refresh:
            cache_only = False
        payload = build_market_data_payload(
            tickers,
            force=force,
            auto_refresh=auto_refresh,
            cache_only=cache_only,
        )
        status_code = 200 if payload.get("success") or payload.get("items") else 503
        return jsonify(payload), status_code
    except Exception as exc:
        traceback.print_exc()
        return jsonify({
            "success": False,
            "error": str(exc),
            "items": [],
            "data": {},
            "quotes": {},
            "failed": [],
            "refresh_status": {
                "refresh_interval_minutes": 60,
                "total_tickers": 0,
                "success_count": 0,
                "failed_count": 0,
                "used_cache_count": 0,
                "unavailable_count": 0,
                "is_partial": False,
                "is_loading_live_data": False,
                "has_stale_quotes": False,
                "stale_quote_count": 0,
            },
        }), 500


@app.route("/api/debug/quote/<path:ticker>")
def api_debug_quote(ticker):
    normalized = normalize_ticker_input(ticker)
    if not normalized:
        return jsonify({"success": False, "error": "Ticker is required"}), 400
    try:
        cached = read_market_cache(normalized)
        quote, failure, _used_cache, attempts = fetch_market_quote_for_ticker(normalized, force=True)
        ak = get_ak() if is_a_share_ticker(normalized) else None
        return jsonify({
            "success": quote.get("price") is not None,
            "ticker": normalized,
            "market_type": infer_market_type(normalized),
            "resolved_symbol": resolve_market_symbol(normalized),
            "is_a_share": is_a_share_ticker(normalized),
            "akshare_import_success": ak is not None if is_a_share_ticker(normalized) else None,
            "quote_source_attempts": attempts,
            "cache_path": market_cache_path(normalized, "quotes"),
            "cache_exists": bool(cached),
            "cache_age_seconds": cached.get("cache_age_seconds") if isinstance(cached, dict) else None,
            "final_price": quote.get("price"),
            "quote_status": quote.get("quote_status"),
            "quote_source": quote.get("quote_source"),
            "error": failure.get("error") if failure else quote.get("error"),
        })
    except Exception as exc:
        traceback.print_exc()
        return jsonify({
            "success": False,
            "ticker": normalized,
            "market_type": infer_market_type(normalized),
            "quote_source_attempts": [],
            "final_price": None,
            "quote_status": "unavailable",
            "error": str(exc),
        }), 500


@app.route("/api/debug/bulk-status")
def api_debug_bulk_status():
    try:
        tickers = [
            normalize_ticker_input(ticker)
            for ticker in request.args.get("tickers", "").split(",")
            if normalize_ticker_input(ticker)
        ][:MARKET_DATA_MAX_TICKERS]
        items = []
        for ticker in tickers:
            quote_cache = read_market_cache(ticker)
            quote_payload = (quote_cache.get("quote") if isinstance(quote_cache, dict) else None) or {}
            quote_updated_at, quote_age = cache_updated_at_and_age(quote_cache)

            fundamentals_cache = read_module_cache("fundamentals", ticker)
            fundamentals_fields = (fundamentals_cache or {}).get("fields") or {}
            fundamentals_updated_at, fundamentals_age = cache_updated_at_and_age(fundamentals_cache)

            options_cache = read_module_cache("options", ticker)
            options_fields = (options_cache or {}).get("options") or {}
            options_updated_at, options_age = cache_updated_at_and_age(options_cache)

            items.append({
                "ticker": ticker,
                "market_type": infer_market_type(ticker),
                "quote": {
                    "cache_exists": bool(quote_cache),
                    "cache_valid": bool(quote_cache and quote_payload.get("price") is not None and is_market_cache_fresh(quote_cache)),
                    "price": quote_payload.get("price"),
                    "status": quote_payload.get("quote_status") or ("available" if quote_payload.get("price") is not None else "unavailable"),
                    "source": quote_payload.get("quote_source"),
                    "updated_at": quote_updated_at,
                    "age_minutes": round(quote_age / 60, 2) if quote_age is not None else None,
                    "last_successful_refresh": quote_payload.get("last_successful_update") or quote_payload.get("updatedAt") or quote_updated_at,
                },
                "fundamentals": {
                    "cache_exists": bool(fundamentals_cache),
                    "cache_valid": fundamentals_cache_valid(fundamentals_cache),
                    "fields_available": fields_available_from_mapping(fundamentals_fields),
                    "status": "available" if fundamentals_cache_valid(fundamentals_cache) else "unavailable",
                    "updated_at": fundamentals_updated_at,
                    "age_minutes": round(fundamentals_age / 60, 2) if fundamentals_age is not None else None,
                },
                "options": {
                    "cache_exists": bool(options_cache),
                    "cache_valid": options_cache_valid(options_cache),
                    "put_wall": options_fields.get("put_wall"),
                    "call_wall": options_fields.get("call_wall"),
                    "gamma_flip": options_fields.get("gamma_flip"),
                    "status": options_fields.get("status") or ("available" if options_cache_valid(options_cache) else "unavailable"),
                    "updated_at": options_updated_at,
                    "age_minutes": round(options_age / 60, 2) if options_age is not None else None,
                },
            })

        market_cached = read_market_context_cache()
        market_payload = (market_cached or {}).get("payload")
        flat_market = flatten_market_context_payload(market_payload, {
            "status": market_context_payload_status(market_payload),
            "cache_used": bool(market_cached),
            "cache_updated_at": (market_cached or {}).get("updated_at"),
        })
        market_fields_available = [
            field for field, value in {
                "vix": (flat_market.get("vix") or {}).get("value"),
                "ten_year_yield": (flat_market.get("ten_year_yield") or {}).get("value"),
                "spy_trend": (flat_market.get("spy_trend") or {}).get("value"),
                "qqq_trend": (flat_market.get("qqq_trend") or {}).get("value"),
                "fear_greed": (flat_market.get("fear_greed") or {}).get("value"),
            }.items()
            if value is not None
        ]
        return jsonify({
            "success": True,
            "tickers": tickers,
            "items": items,
            "market_context": {
                "cache_exists": bool(market_cached),
                "cache_valid": market_context_payload_valid(market_payload),
                "status": market_context_payload_status(market_payload),
                "fields_available": market_fields_available,
                "updated_at": (market_cached or {}).get("updated_at"),
            },
        })
    except Exception as exc:
        traceback.print_exc()
        return jsonify({
            "success": False,
            "error": str(exc),
            "tickers": [],
            "items": [],
            "market_context": {},
        }), 500


@app.route("/api/debug/fundamentals/<path:ticker>")
def api_debug_fundamentals(ticker):
    normalized = normalize_ticker_input(ticker)
    if not normalized:
        return jsonify({"success": False, "error": "Ticker is required"}), 400
    try:
        cached = read_module_cache("fundamentals", normalized)
        cache_valid = fundamentals_cache_valid(cached)
        quote, cache_used, error = get_quote_for_debug_modules(normalized, force=False, include_options=False)
        fields = extract_fundamental_fields_from_quote(quote)
        missing_fields = [key for key, value in fields.items() if value is None]
        debug_info = (quote.get("debug") if isinstance(quote, dict) else {}) or {}
        attempts = []
        if cached:
            attempts.append({
                "source": "fundamentals_cache",
                "success": True,
                "updated_at": cached.get("updated_at"),
                "valid": cache_valid,
            })
        attempts.append({
            "source": quote.get("quote_source") or ("cache" if cache_used else "live"),
            "success": error is None,
            "error": error,
        })
        return jsonify({
            "success": any(value is not None for value in fields.values()),
            "ticker": normalized,
            "cache_exists": bool(cached),
            "cache_valid": cache_valid,
            "source_attempts": attempts,
            "fields": fields,
            "missing_fields": missing_fields,
            "cache_used": bool(cache_used),
            "yfinance_import_success": None if is_a_share_ticker(normalized) else debug_info.get("yfinance_import_success", error is None),
            "yfinance_fields_found": debug_info.get("yfinance_fields_found") or [],
            "yahoo_quote_summary_attempt": debug_info.get("yahoo_quote_summary_attempt"),
            "raw_keys_sample": debug_info.get("raw_keys_sample") or [],
            "final_status": "available" if any(value is not None for value in fields.values()) else "stale" if cache_valid else "unavailable",
            "error": error,
        })
    except Exception as exc:
        traceback.print_exc()
        return jsonify({
            "success": False,
            "ticker": normalized,
            "source_attempts": [],
            "fields": {},
            "missing_fields": [],
            "cache_used": False,
            "error": str(exc),
        }), 500


@app.route("/api/debug/options/<path:ticker>")
def api_debug_options(ticker):
    normalized = normalize_ticker_input(ticker)
    if not normalized:
        return jsonify({"success": False, "error": "Ticker is required"}), 400
    try:
        cached = read_module_cache("options", normalized)
        cache_valid = options_cache_valid(cached)
        quote, cache_used, error = get_quote_for_debug_modules(normalized, force=False, include_options=True)
        options_payload = extract_options_fields_from_quote(quote)
        options_market = quote.get("optionsMarket") if isinstance(quote, dict) else {}
        attempts = []
        if cached:
            attempts.append({
                "source": "options_cache",
                "success": True,
                "updated_at": cached.get("updated_at"),
                "valid": cache_valid,
            })
        attempts.append({
            "source": quote.get("quote_source") or ("cache" if cache_used else "live"),
            "success": error is None and bool(options_market),
            "error": error or options_payload.get("reason"),
        })
        return jsonify({
            "success": bool(options_market.get("available")) if isinstance(options_market, dict) else False,
            "ticker": normalized,
            "cache_exists": bool(cached),
            "cache_valid": cache_valid,
            "yfinance_import_success": None if is_a_share_ticker(normalized) else ((quote.get("debug") or {}).get("yfinance_import_success", error is None) if isinstance(quote, dict) else (error is None)),
            "has_option_chain": bool(options_market.get("available")) if isinstance(options_market, dict) else False,
            "expirations_count": len(options_market.get("expiries") or []) if isinstance(options_market, dict) else 0,
            "selected_expiration": options_market.get("selectedExpiration") if isinstance(options_market, dict) else None,
            "calls_count": options_market.get("callsCount") if isinstance(options_market, dict) else 0,
            "puts_count": options_market.get("putsCount") if isinstance(options_market, dict) else 0,
            "put_wall": options_payload.get("put_wall"),
            "call_wall": options_payload.get("call_wall"),
            "gamma_flip": options_payload.get("gamma_flip"),
            "source": quote.get("quote_source"),
            "cache_used": bool(cache_used),
            "source_attempts": attempts,
            "final_status": options_payload.get("status"),
            "error": error or options_payload.get("reason"),
        })
    except Exception as exc:
        traceback.print_exc()
        return jsonify({
            "success": False,
            "ticker": normalized,
            "has_option_chain": False,
            "expirations_count": 0,
            "put_wall": None,
            "call_wall": None,
            "gamma_flip": None,
            "source": None,
            "cache_used": False,
            "source_attempts": [],
            "error": str(exc),
        }), 500


@app.route("/api/debug/market-context")
def api_debug_market_context():
    try:
        cached = read_market_context_cache()
        payload, meta = get_market_context_cached_snapshot(force=False, allow_live=True)
        market_context = (payload or {}).get("market_context") or {}
        equity_trend = market_context.get("equity_trend") or {}
        missing_fields = []
        if (market_context.get("vix") or {}).get("value") is None:
            missing_fields.append("vix")
        if (market_context.get("fear_greed") or {}).get("value") is None:
            missing_fields.append("fear_greed")
        if (market_context.get("ten_year_yield") or {}).get("value") is None:
            missing_fields.append("ten_year_yield")
        if (equity_trend.get("spy") or {}).get("value") is None:
            missing_fields.append("spy_trend")
        if (equity_trend.get("qqq") or {}).get("value") is None:
            missing_fields.append("qqq_trend")
        field_cache_attempt = {
            "source": "market_context_cache",
            "success": bool(cached),
            "valid": bool(cached and market_context_payload_valid((cached or {}).get("payload"))),
            "updated_at": cached.get("updated_at") if isinstance(cached, dict) else None,
        }
        context_has_any_field = market_context_payload_valid(payload)
        return jsonify({
            "success": context_has_any_field,
            "vix": market_context.get("vix"),
            "fear_greed": market_context.get("fear_greed"),
            "ten_year_yield": market_context.get("ten_year_yield"),
            "spy_trend": equity_trend.get("spy"),
            "qqq_trend": equity_trend.get("qqq"),
            "source_attempts": meta.get("source_attempts"),
            "vix_attempts": [field_cache_attempt, {"source": "yfinance_^VIX_or_fred", "success": (market_context.get("vix") or {}).get("value") is not None}],
            "ten_year_attempts": [field_cache_attempt, {"source": "yfinance_^TNX_or_fred", "success": (market_context.get("ten_year_yield") or {}).get("value") is not None}],
            "spy_attempts": [field_cache_attempt, {"source": "yfinance_or_yahoo_chart_SPY", "success": (equity_trend.get("spy") or {}).get("value") is not None}],
            "qqq_attempts": [field_cache_attempt, {"source": "yfinance_or_yahoo_chart_QQQ", "success": (equity_trend.get("qqq") or {}).get("value") is not None}],
            "fear_greed_attempts": [field_cache_attempt, {"source": "fear_greed_live_or_cache", "success": (market_context.get("fear_greed") or {}).get("value") is not None}],
            "cache_used": meta.get("cache_used"),
            "cache_layer": meta.get("cache_layer"),
            "cache_exists": bool(cached),
            "cache_valid": bool(cached and market_context_payload_valid((cached or {}).get("payload"))),
            "final_status": market_context_payload_status(payload),
            "missing_fields": missing_fields,
            "error": None if meta.get("status") != "unavailable" else "Market context unavailable",
        })
    except Exception as exc:
        traceback.print_exc()
        return jsonify({
            "success": False,
            "vix": None,
            "fear_greed": None,
            "ten_year_yield": None,
            "spy_trend": None,
            "qqq_trend": None,
            "source_attempts": [],
            "cache_used": False,
            "missing_fields": [],
            "error": str(exc),
        }), 500


@app.route("/api/symbol-search")
def api_symbol_search():
    query = normalize_search_query(request.args.get("q", ""))
    try:
        limit = max(1, min(int(request.args.get("limit", "10")), 20))
    except ValueError:
        limit = 10
    if not query:
        return jsonify({"query": "", "candidates": []})
    return jsonify({
        "query": query,
        "candidates": search_symbol_candidates(query, limit=limit),
        "updatedAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
    })


@app.route("/api/health")
def api_health():
    db_dir = os.path.dirname(WATCHLIST_DB_PATH)
    market_context_cache_exists = read_module_cache("market_context", "snapshot") is not None
    return jsonify({
        "success": True,
        "status": "ok",
        "watchlist_db_path": WATCHLIST_DB_PATH,
        "watchlist_db_exists": os.path.exists(WATCHLIST_DB_PATH),
        "watchlist_db_dir": db_dir,
        "watchlist_db_dir_exists": os.path.isdir(db_dir) if db_dir else True,
        "market_cache_dir": MARKET_CACHE_DIR,
        "market_cache_dir_exists": os.path.isdir(MARKET_CACHE_DIR) if MARKET_CACHE_DIR else False,
        "quotes_cache_count": count_cache_files("quotes"),
        "fundamentals_cache_count": count_cache_files("fundamentals"),
        "options_cache_count": count_cache_files("options"),
        "market_context_cache_exists": market_context_cache_exists,
        "cwd": os.getcwd(),
        "python_version": sys.version,
        "render_service": bool(os.environ.get("RENDER") or os.environ.get("RENDER_SERVICE_ID") or os.environ.get("RENDER_EXTERNAL_URL")),
    })


@app.route("/api/watchlist", methods=["GET"])
def api_watchlist_get():
    try:
        with get_watchlist_conn() as conn:
            rows = conn.execute(
                """
                SELECT id, ticker, market_type, created_at
                FROM watchlist
                ORDER BY datetime(created_at) ASC, id ASC
                """
            ).fetchall()
        items = watchlist_rows_to_items(rows)
        return jsonify(watchlist_response_payload(items))
    except Exception as exc:
        traceback.print_exc()
        return jsonify({"success": False, "error": str(exc), "items": [], "watchlist": []}), 500


@app.route("/api/watchlist", methods=["POST"])
def api_watchlist_post():
    try:
        payload = request.get_json(silent=True) or {}
        ticker = normalize_ticker_input(payload.get("ticker"))
        if not ticker:
            return jsonify({"success": False, "error": "Ticker is required", "items": [], "watchlist": []}), 400
        market_type = infer_market_type(ticker, payload.get("market_type"))
        with get_watchlist_conn() as conn:
            conn.execute(
                "INSERT OR IGNORE INTO watchlist (ticker, market_type) VALUES (?, ?)",
                (ticker, market_type),
            )
            conn.commit()
            rows = conn.execute(
                """
                SELECT id, ticker, market_type, created_at
                FROM watchlist
                ORDER BY datetime(created_at) ASC, id ASC
                """
            ).fetchall()
        return jsonify(watchlist_response_payload(watchlist_rows_to_items(rows)))
    except Exception as exc:
        traceback.print_exc()
        return jsonify({"success": False, "error": str(exc), "items": [], "watchlist": []}), 500


@app.route("/api/watchlist", methods=["DELETE"])
@app.route("/api/watchlist/<path:ticker>", methods=["DELETE"])
def api_watchlist_delete(ticker=None):
    try:
        normalized = normalize_ticker_input(ticker or request.args.get("ticker", ""))
        if not normalized:
            return jsonify({"success": False, "error": "Ticker is required", "items": [], "watchlist": []}), 400
        market_type = request.args.get("market_type")
        with get_watchlist_conn() as conn:
            if market_type:
                conn.execute(
                    "DELETE FROM watchlist WHERE ticker = ? AND market_type = ?",
                    (normalized, infer_market_type(normalized, market_type)),
                )
            else:
                conn.execute("DELETE FROM watchlist WHERE ticker = ?", (normalized,))
            conn.commit()
            rows = conn.execute(
                """
                SELECT id, ticker, market_type, created_at
                FROM watchlist
                ORDER BY datetime(created_at) ASC, id ASC
                """
            ).fetchall()
        return jsonify(watchlist_response_payload(watchlist_rows_to_items(rows)))
    except Exception as exc:
        traceback.print_exc()
        return jsonify({"success": False, "error": str(exc), "items": [], "watchlist": []}), 500


@app.route("/")
def serve_index():
    return send_from_directory(ROOT, "index.html")


@app.route("/<path:filename>")
def serve_static_file(filename):
    if filename.startswith("api/"):
        return jsonify({"success": False, "error": "Not found"}), 404
    return send_from_directory(ROOT, filename)


def main():
    os.chdir(ROOT)
    display_host = "localhost" if HOST == "127.0.0.1" else HOST
    print(f"Serving dashboard on http://{display_host}:{PORT}")
    print(f"API endpoint: http://{display_host}:{PORT}/api/market-data?tickers=AAPL,MSFT,002463,300657")
    app.run(host=HOST, port=PORT, debug=False)


if __name__ == "__main__":
    main()
