#!/usr/bin/env python3
"""Audit zero-valued normalized fundamental metrics without altering data.

The dashboard uses one period-aware normalized schema.  This script scans the
same schema used by the UI and reports every literal zero plus any provider-zero
that the validator correctly converted to unavailable.  It is deliberately
read-only: no cache values, recommendation inputs, or source records change.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any


PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

import server  # noqa: E402


# A cross-sector US-stock sample.  These are audit inputs, not business rules.
DEFAULT_TICKERS = [
    "AAPL", "MSFT", "AMZN", "GOOGL", "META", "NVDA", "TSLA", "NFLX", "ORCL", "NOW",
    "CRM", "ADBE", "INTU", "PLTR", "HIMS", "ZETA", "SOFI", "PYPL", "SHOP", "UBER",
    "AMD", "MU", "AVGO", "QCOM", "INTC", "TXN", "AMAT", "LRCX", "KLAC", "MRVL",
    "TEM", "XE", "NOK", "BABA", "PDD", "JD", "CRCL", "MPT", "UNH", "LLY",
    "JNJ", "ABBV", "TMO", "ISRG", "ABT", "MRK", "PFE", "CVS", "CI", "HUM",
    "JPM", "BAC", "WFC", "GS", "MS", "BLK", "V", "MA", "AXP", "COF",
    "XOM", "CVX", "COP", "SLB", "OXY", "CAT", "DE", "GE", "HON", "RTX",
    "BA", "LMT", "UNP", "UPS", "FDX", "WMT", "COST", "TGT", "HD", "LOW",
    "MCD", "SBUX", "NKE", "DIS", "CMCSA", "T", "VZ", "AMT", "PLD", "O",
    "NEE", "DUK", "SO", "D", "SPG", "EQIX", "PSA", "VICI", "RCL", "CCL",
]


GROUPS = {
    "profitability": ["roe_ttm", "gross_margin_ttm", "operating_margin_ttm", "net_margin_ttm"],
    "balance_sheet": ["debt_to_equity", "current_ratio"],
    "growth": ["revenue_growth_yoy", "eps_growth_yoy", "free_cash_flow_growth_yoy"],
    "valuation": ["pe", "forward_pe", "peg", "price_to_sales", "ev_to_ebitda"],
}


def metric_row(ticker: str, group: str, key: str, record: dict[str, Any], include_all: bool = False) -> dict[str, Any] | None:
    if not isinstance(record, dict):
        return None
    value = server.normalize_numeric(record.get("value"))
    invalid_zero = record.get("validation_status") == "invalid_placeholder_zero"
    if value != 0 and not invalid_zero and not include_all:
        return None

    source_field = record.get("source_field")
    source_value = record.get("calculation_inputs") or {}
    valid_zero = record.get("validation_status") == "valid_zero"
    return {
        "ticker": ticker,
        "metric": key,
        "group": group,
        "displayed_value": "N/A" if value is None else value,
        "raw_provider_value": source_value.get("raw_provider_value"),
        "raw_provider_type": type(source_value.get("raw_provider_value")).__name__ if "raw_provider_value" in source_value else None,
        "source_field": source_field,
        "normalized_value": value,
        "calculated_value": value if record.get("calculated_or_provider") == "calculated" else None,
        "missing_reason": record.get("missing_reason"),
        "source": record.get("source"),
        "calculated_or_provider": record.get("calculated_or_provider"),
        "period_type": record.get("period_type"),
        "period_end_date": record.get("period_end_date"),
        "calculation_inputs": source_value,
        "valid_zero": valid_zero,
        "reason": record.get("zero_validation_reason") or record.get("missing_reason") or "numeric_zero_from_source_or_calculation",
    }


def audit_ticker(ticker: str, include_all: bool = False) -> dict[str, Any]:
    try:
        quote = server.fetch_us_quote_with_yfinance(ticker)
        normalized = ((quote.get("metadata") or {}).get("companyAnalysis") or {}).get("normalizedFundamentals") or {}
        rows = []
        for group, keys in GROUPS.items():
            metrics = normalized.get(group) or {}
            for key in keys:
                row = metric_row(ticker, group, key, metrics.get(key) or {}, include_all=include_all)
                if row:
                    rows.append(row)
        return {
            "ticker": ticker,
            "status": "ok",
            "source": normalized.get("source"),
            "latest_fiscal_quarter": (normalized.get("metadata") or {}).get("latest_fiscal_quarter"),
            "rows": rows,
        }
    except Exception as exc:  # Network/data-source failures are audit evidence too.
        return {"ticker": ticker, "status": "error", "error": str(exc), "rows": []}


def main() -> int:
    parser = argparse.ArgumentParser(description="Read-only audit of zero-valued normalized fundamental metrics")
    parser.add_argument("--tickers", help="Comma-separated tickers; defaults to the 100-stock cross-sector sample")
    parser.add_argument("--offset", type=int, default=0, help="Start at this offset in the selected ticker sample")
    parser.add_argument("--limit", type=int, help="Limit the selected sample for a faster smoke test")
    parser.add_argument("--output", help="Write the JSON audit report to this path")
    parser.add_argument("--include-all", action="store_true", help="Include non-zero and unavailable metrics for a field-level trace")
    args = parser.parse_args()

    tickers = [item.strip().upper() for item in (args.tickers.split(",") if args.tickers else DEFAULT_TICKERS) if item.strip()]
    tickers = tickers[max(args.offset, 0):]
    if args.limit is not None:
        tickers = tickers[: max(args.limit, 0)]

    reports = [audit_ticker(ticker, include_all=args.include_all) for ticker in tickers]
    all_rows = [row for report in reports for row in report["rows"]]
    zero_rows = [
        row for row in all_rows
        if row["normalized_value"] == 0 or row["reason"] == "provider_placeholder_zero_or_unavailable_denominator"
    ]
    result = {
        "sample_size": len(tickers),
        "completed": sum(1 for report in reports if report["status"] == "ok"),
        "errors": [report for report in reports if report["status"] != "ok"],
        "metric_rows": all_rows if args.include_all else None,
        "zero_rows": zero_rows,
        "summary": {
            "reported_zero_count": sum(1 for row in zero_rows if row["normalized_value"] == 0),
            "valid_zero_count": sum(1 for row in zero_rows if row["valid_zero"]),
            "placeholder_zero_converted_to_na_count": sum(1 for row in zero_rows if row["normalized_value"] is None),
        },
    }
    encoded = json.dumps(result, ensure_ascii=False, indent=2, default=str)
    if args.output:
        Path(args.output).write_text(encoded, encoding="utf-8")
    print(encoded)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
