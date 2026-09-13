#!/usr/bin/env python3
"""Read-only active-universe Company Profile V2.1.1 live metadata audit.

This reuses server.py's provider symbol and yfinance normalization path, but it
never calls cache writers or company-profile persistence.  The only universe
source is the current SQLite watchlist table.
"""
from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
import tempfile
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
import server  # noqa: E402


def node_executable():
    return os.environ.get("EOD_DECISION_NODE_PATH") or os.environ.get("NODE_EXECUTABLE") or shutil.which("node")


def safe_live_metadata(ticker: str):
    """Provider-only read path: intentionally no local-cache fallback."""
    quote = server.fetch_us_quote_with_yfinance(ticker, include_options=False)
    metadata = dict(quote.get("metadata") or {})
    metadata["quoteType"] = metadata.get("quoteType") or "EQUITY"
    metadata["companyName"] = quote.get("longName") or quote.get("shortName") or ticker
    return metadata


def explain_live_metadata(metadata_by_ticker):
    executable = node_executable()
    if not executable:
        raise RuntimeError("Node.js is required for the canonical Company Profile audit")
    runner = ROOT / "scripts" / "explain-company-profiles.js"
    with tempfile.TemporaryDirectory(prefix="company-profile-live-audit-") as temp:
        input_path = Path(temp) / "input.json"
        output_path = Path(temp) / "output.json"
        input_path.write_text(json.dumps({"metadataByTicker": metadata_by_ticker}, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
        completed = subprocess.run([executable, str(runner), str(input_path), str(output_path)], cwd=ROOT, capture_output=True, text=True, encoding="utf-8", check=False, timeout=30)
        if completed.returncode:
            raise RuntimeError((completed.stderr or completed.stdout or "profile explanation failed").strip())
        return json.loads(output_path.read_text(encoding="utf-8"))


def persisted_profile_rows(tickers):
    profiles = server.load_company_profiles(tickers)
    return {ticker: profiles.get(ticker) for ticker in tickers}


def distribution(rows, key):
    return dict(sorted(Counter((row.get("result") or {}).get(key) or "null" for row in rows if row.get("type") == "stock").items()))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", help="Optional UTF-8 JSON output path")
    args = parser.parse_args()

    active = server.active_watchlist_tickers()
    metadata_by_ticker, provider_errors, etfs = {}, {}, []
    for ticker in active:
        try:
            metadata = safe_live_metadata(ticker)
            if str(metadata.get("quoteType") or "").upper() == "ETF":
                etfs.append({"ticker": ticker, "quoteType": "ETF"})
            else:
                metadata_by_ticker[ticker] = metadata
        except Exception as exc:  # failure is data, never cache fallback
            provider_errors[ticker] = str(exc)[:800]

    explained = explain_live_metadata(metadata_by_ticker) if metadata_by_ticker else {"rows": []}
    rows = explained.get("rows") or []
    persisted = persisted_profile_rows(list(metadata_by_ticker))
    for row in rows:
        ticker = row["ticker"]
        row["companyName"] = metadata_by_ticker[ticker].get("companyName") or ticker
        row["liveMetadata"] = metadata_by_ticker[ticker]
        row["persisted"] = persisted.get(ticker)
    report = {
        "mode": "live_provider_read_only",
        "activeUniverse": active,
        "activeSymbolCount": len(active),
        "ordinaryStockCount": len(metadata_by_ticker),
        "etfCount": len(etfs),
        "etfs": etfs,
        "providerErrors": provider_errors,
        "rows": rows,
        "distributions": {
            "primaryClassification": distribution(rows, "primaryClassification"),
            "businessTrait": distribution(rows, "businessTrait"),
            "riskTrait": distribution(rows, "riskTrait"),
            "lifecycle": distribution(rows, "lifecycle"),
            "sizeClass": distribution(rows, "sizeClass"),
        },
    }
    rendered = json.dumps(report, ensure_ascii=False, indent=2)
    if args.output:
        Path(args.output).write_text(rendered + "\n", encoding="utf-8")
    print(rendered)


if __name__ == "__main__":
    main()
