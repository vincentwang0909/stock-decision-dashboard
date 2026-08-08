#!/usr/bin/env python3
"""Live, read-only audit for the canonical fundamental display schema.

This script intentionally uses the same quote path as the dashboard. It never
alters the recommendation model; its job is to make period selection, source
precedence, and raw-versus-normalized values visible. The normal source cache
may be refreshed as part of that same dashboard path.
"""

from __future__ import annotations

import argparse
import json
import sys

import server


REGRESSION_TICKERS = [
    "GOOGL", "AAPL", "NOW", "NVDA", "TSLA", "UNH", "META", "AMZN", "PLTR",
    "TEM", "XE", "ORCL", "MU", "MPT", "AMD", "SOFI", "NOK",
]

BROAD_SAMPLE_TICKERS = [
    "MSFT", "NFLX", "JPM", "XOM", "CAT", "COST", "JNJ", "LLY", "CVX", "KO",
    "WMT", "BA", "CRM", "UBER", "ROKU", "RIVN", "SHOP", "PDD", "TSM", "NVO",
    "VZ", "KMI", "O", "SLB", "GE", "PANW", "INTC", "DIS", "F", "DAL",
]


def metric_value(group, key):
    value = (group or {}).get(key) or {}
    return {
        "value": value.get("value"),
        "period_end": value.get("period_end_date"),
        "period_type": value.get("period_type"),
        "source": value.get("source"),
        "calculated_or_provider": value.get("calculated_or_provider"),
        "stale": value.get("stale"),
        "missing_reason": value.get("missing_reason"),
    }


def audit_ticker(ticker):
    quote = server.fetch_us_quote_with_yfinance(ticker)
    metadata = quote.get("metadata") or {}
    analysis = metadata.get("companyAnalysis") or {}
    normalized = analysis.get("normalizedFundamentals") or {}
    profitability = normalized.get("profitability") or {}
    balance = normalized.get("balance_sheet") or {}
    growth = normalized.get("growth") or {}
    valuation = normalized.get("valuation") or {}
    raw = {
        "operating_margin": metadata.get("operatingMargins"),
        "gross_margin": metadata.get("grossMargins"),
        "net_margin": metadata.get("profitMargins"),
        "roe": metadata.get("returnOnEquity"),
        "revenue_growth": metadata.get("revenueGrowth"),
        "eps_growth": metadata.get("earningsQuarterlyGrowth"),
    }
    return {
        "ticker": ticker,
        "latest_fiscal_quarter": (normalized.get("metadata") or {}).get("latest_fiscal_quarter"),
        "source": normalized.get("source"),
        "source_status": analysis.get("financialDataStatus"),
        "price_as_of": (normalized.get("metadata") or {}).get("price_as_of"),
        "raw_provider": raw,
        "normalized": {
            "roe_ttm": metric_value(profitability, "roe_ttm"),
            "gross_margin_ttm": metric_value(profitability, "gross_margin_ttm"),
            "operating_margin_ttm": metric_value(profitability, "operating_margin_ttm"),
            "net_margin_ttm": metric_value(profitability, "net_margin_ttm"),
            "debt_to_equity": metric_value(balance, "debt_to_equity"),
            "current_ratio": metric_value(balance, "current_ratio"),
            "revenue_growth_yoy": metric_value(growth, "revenue_growth_yoy"),
            "eps_growth_yoy": metric_value(growth, "eps_growth_yoy"),
            "free_cash_flow_growth_yoy": metric_value(growth, "free_cash_flow_growth_yoy"),
            "pe": metric_value(valuation, "pe"),
            "forward_pe": metric_value(valuation, "forward_pe"),
            "peg": metric_value(valuation, "peg"),
            "price_to_sales": metric_value(valuation, "price_to_sales"),
            "ev_to_ebitda": metric_value(valuation, "ev_to_ebitda"),
        },
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--tickers", nargs="*", default=REGRESSION_TICKERS)
    parser.add_argument("--broad-sample", action="store_true", help="Add 30 cross-sector US equities.")
    parser.add_argument("--json", action="store_true", help="Print JSON lines instead of a compact table.")
    args = parser.parse_args()
    tickers = list(dict.fromkeys([item.upper() for item in args.tickers + (BROAD_SAMPLE_TICKERS if args.broad_sample else [])]))
    failures = []
    for ticker in tickers:
        try:
            result = audit_ticker(ticker)
            if args.json:
                print(json.dumps(result, ensure_ascii=False, sort_keys=True))
                continue
            normalized = result["normalized"]
            print(
                f"{ticker:5} period={result['latest_fiscal_quarter'] or 'N/A':10} "
                f"source={result['source'] or 'N/A'}\n"
                f"  raw operatingMargin={result['raw_provider']['operating_margin']!r} | "
                f"TTM operatingMargin={normalized['operating_margin_ttm']['value']!r} "
                f"({normalized['operating_margin_ttm']['calculated_or_provider']})\n"
                f"  gross={normalized['gross_margin_ttm']['value']!r} net={normalized['net_margin_ttm']['value']!r} "
                f"ROE={normalized['roe_ttm']['value']!r} FCF YoY={normalized['free_cash_flow_growth_yoy']['value']!r}\n"
                f"  PE={normalized['pe']['value']!r} ForwardPE={normalized['forward_pe']['value']!r} "
                f"PEG={normalized['peg']['value']!r} PS={normalized['price_to_sales']['value']!r} "
                f"EV/EBITDA={normalized['ev_to_ebitda']['value']!r}"
            )
        except Exception as exc:  # Keep the broader audit progressing after one source failure.
            failures.append({"ticker": ticker, "error": f"{type(exc).__name__}: {exc}"})
            print(f"{ticker:5} ERROR {type(exc).__name__}: {exc}", file=sys.stderr)
    if failures:
        print(json.dumps({"failed": failures}, ensure_ascii=False), file=sys.stderr)
        raise SystemExit(1)


if __name__ == "__main__":
    main()
