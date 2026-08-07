"""Authoritative, cache-friendly US financial-statement freshness helpers.

The module intentionally has no Flask, pandas, or yfinance dependency.  It can
therefore be tested with filing fixtures and only receives live SEC JSON from
the server's network adapter.
"""

from __future__ import annotations

from collections import defaultdict
from datetime import date, datetime, timezone
import re
from typing import Any, Callable, Iterable
from xml.etree import ElementTree as ET


SEC_COMPANY_TICKERS_URL = "https://www.sec.gov/files/company_tickers.json"
SEC_SUBMISSIONS_URL = "https://data.sec.gov/submissions/CIK{cik:010d}.json"
SEC_COMPANY_FACTS_URL = "https://data.sec.gov/api/xbrl/companyfacts/CIK{cik:010d}.json"
SEC_ARCHIVE_URL = "https://www.sec.gov/Archives/edgar/data/{cik}/{accession}/{document}"

INCOME_CONCEPTS = {
    "revenue": ["RevenueFromContractWithCustomerExcludingAssessedTax", "Revenues", "SalesRevenueNet"],
    "gross_profit": ["GrossProfit"],
    "operating_income": ["OperatingIncomeLoss"],
    "net_income": ["NetIncomeLoss", "NetIncomeLossAvailableToCommonStockholdersBasic"],
    "diluted_eps": ["EarningsPerShareDiluted"],
}

CASH_FLOW_CONCEPTS = {
    "operating_cash_flow": ["NetCashProvidedByUsedInOperatingActivities"],
    "capital_expenditure": [
        "PaymentsToAcquirePropertyPlantAndEquipment",
        "PaymentsToAcquireProductiveAssets",
        "SegmentExpenditureAdditionToLongLivedAssets",
    ],
    "share_repurchases": ["PaymentsForRepurchaseOfCommonStock", "PaymentsForRepurchaseOfEquity"],
    "dividends_paid": ["PaymentsOfDividends", "PaymentsOfDividendsCommonStock"],
}


def build_sec_concept_diagnostic(
    company_facts: dict[str, Any] | None,
    filing: dict[str, Any] | None,
    selected_concept: str | None = None,
    field: str = "capital_expenditure",
) -> dict[str, Any]:
    """Expose SEC concept selection only through the development debug endpoint."""
    report_date = str((filing or {}).get("reportDate") or "")[:10] or None
    candidates = CASH_FLOW_CONCEPTS.get(field, [])
    rows_out: list[dict[str, Any]] = []
    for concept in candidates:
        unit, rows = sec_units_for_single_concept(company_facts or {}, concept, ("USD",))
        matching_rows = _filtered_period_rows(rows, report_date, filing) if report_date else rows
        duration_rows = [row for row in matching_rows if _duration_days(row) is not None]
        selected_rows = [row for row in duration_rows if str(row.get("form") or "").replace("/A", "") in {"10-Q", "10-K"}]
        if not selected_rows:
            rows_out.append({
                "concept_name": concept,
                "unit": unit,
                "selected": concept == selected_concept,
                "decision": "rejected_no_matching_sec_duration_fact",
            })
            continue
        for row in selected_rows:
            rows_out.append({
                "concept_name": concept,
                "form": row.get("form"),
                "filed_date": row.get("filed"),
                "fiscal_period": row.get("fp"),
                "start_date": row.get("start"),
                "end_date": row.get("end"),
                "unit": unit,
                "raw_value": safe_float(row.get("val")),
                "normalized_value": safe_float(row.get("val")),
                "selected": concept == selected_concept,
                "decision": "selected_standard_capex_concept" if concept == selected_concept else "rejected_lower_priority_or_incompatible_concept",
            })
    return {
        "status": "available" if rows_out else "unavailable",
        "field": field,
        "filing_period": report_date,
        "selected_concept": selected_concept,
        "candidates": rows_out,
    }

BALANCE_SHEET_CONCEPTS = {
    "cash_and_cash_equivalents": ["CashAndCashEquivalentsAtCarryingValue"],
    "short_term_investments": ["ShortTermInvestments"],
    "marketable_securities": ["MarketableSecurities", "AvailableForSaleSecuritiesDebtSecurities"],
    # A current-debt concept alone is not a complete debt balance.  Do not use
    # it to manufacture a total-debt or net-cash figure.
    "total_debt": ["LongTermDebtAndFinanceLeaseObligations"],
    "stockholders_equity": ["StockholdersEquity", "StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest"],
    "period_end_shares": ["EntityCommonStockSharesOutstanding"],
    "diluted_weighted_average_shares": ["WeightedAverageNumberOfDilutedSharesOutstanding"],
}

FINANCIAL_SECTOR_KEYWORDS = (
    "bank",
    "insurance",
    "credit services",
    "financial services",
    "capital markets",
    "asset management",
    "mortgage finance",
)


def now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def parse_date(value: Any) -> date | None:
    if not value:
        return None
    try:
        return date.fromisoformat(str(value)[:10])
    except (TypeError, ValueError):
        return None


def safe_float(value: Any) -> float | None:
    try:
        if value is None:
            return None
        return float(value)
    except (TypeError, ValueError):
        return None


def is_financial_company(profile: dict[str, Any] | None) -> bool:
    profile = profile or {}
    text = " ".join(str(profile.get(key) or "").lower() for key in ("sector", "industry", "quoteType"))
    return any(keyword in text for keyword in FINANCIAL_SECTOR_KEYWORDS)


def financial_semantics(profile: dict[str, Any] | None) -> dict[str, Any]:
    if is_financial_company(profile):
        return {
            "model": "financial_company_cash_flow_limited",
            "warning": "ordinary_fcf_is_not_a_primary_business_quality_metric_for_financial_companies",
        }
    return {"model": "corporate_cash_flow", "warning": None}


def filing_url(cik: int, accession: str | None, document: str | None) -> str | None:
    if not accession or not document:
        return None
    return SEC_ARCHIVE_URL.format(cik=int(cik), accession=str(accession).replace("-", ""), document=document)


def find_cik_for_ticker(ticker_payload: dict[str, Any], ticker: str) -> int | None:
    normalized = str(ticker or "").upper()
    for entry in (ticker_payload or {}).values():
        if str((entry or {}).get("ticker") or "").upper() == normalized:
            try:
                return int(entry.get("cik_str"))
            except (TypeError, ValueError):
                return None
    return None


def recent_filings(submissions: dict[str, Any]) -> list[dict[str, Any]]:
    recent = (submissions or {}).get("filings", {}).get("recent", {})
    if not isinstance(recent, dict):
        return []
    rows = []
    length = max((len(value) for value in recent.values() if isinstance(value, list)), default=0)
    for index in range(length):
        row = {key: value[index] for key, value in recent.items() if isinstance(value, list) and index < len(value)}
        if row:
            rows.append(row)
    return rows


def latest_official_filing(submissions: dict[str, Any]) -> dict[str, Any] | None:
    candidates = [
        row for row in recent_filings(submissions)
        if str(row.get("form") or "") in {"10-Q", "10-K", "10-Q/A", "10-K/A"}
        and parse_date(row.get("reportDate")) is not None
    ]
    if not candidates:
        return None
    candidates.sort(key=lambda row: (parse_date(row.get("reportDate")) or date.min, parse_date(row.get("filingDate")) or date.min), reverse=True)
    return candidates[0]


def latest_earnings_release_filing(submissions: dict[str, Any], since_period: str | None = None) -> dict[str, Any] | None:
    since = parse_date(since_period)
    candidates = []
    for row in recent_filings(submissions):
        if str(row.get("form") or "") != "8-K":
            continue
        filed = parse_date(row.get("filingDate"))
        if filed is None or (since and filed <= since):
            continue
        items = str(row.get("items") or "")
        if "2.02" in items:
            candidates.append(row)
    candidates.sort(key=lambda row: parse_date(row.get("filingDate")) or date.min, reverse=True)
    return candidates[0] if candidates else None


def latest_inline_xbrl_release_period(company_facts: dict[str, Any], release_filing: dict[str, Any] | None, primary_period: str | None = None) -> dict[str, Any] | None:
    """Resolve a fiscal period carried by an Item 2.02 Inline-XBRL 8-K.

    Some issuers publish a complete tagged earnings release before the 10-Q.
    The submission row's ``reportDate`` is the 8-K filing date, so the actual
    fiscal period must come from a matching revenue fact rather than guessed
    from the calendar.
    """
    accession = (release_filing or {}).get("accessionNumber")
    if not accession:
        return None
    _concept, _unit, rows = sec_units_for_concept(company_facts, INCOME_CONCEPTS["revenue"])
    primary_date = parse_date(primary_period)
    candidates = []
    for row in rows:
        if row.get("accn") != accession or str(row.get("form") or "").replace("/A", "") != "8-K":
            continue
        end = parse_date(row.get("end"))
        if end is None or (primary_date and end <= primary_date) or _duration_days(row) is None:
            continue
        candidates.append(row)
    if not candidates:
        return None
    selected = max(candidates, key=lambda row: (parse_date(row.get("end")) or date.min, parse_date(row.get("filed")) or date.min))
    resolved = dict(release_filing)
    resolved["reportDate"] = str(selected.get("end"))[:10]
    resolved["filingDate"] = selected.get("filed") or resolved.get("filingDate")
    return resolved


def official_release_instance_document(index_payload: dict[str, Any] | None, filing: dict[str, Any] | None) -> str | None:
    """Find the Inline-XBRL instance document listed in an SEC 8-K index."""
    names = [str(item.get("name") or "") for item in ((index_payload or {}).get("directory", {}) or {}).get("item", [])]
    primary = str((filing or {}).get("primaryDocument") or "")
    expected = f"{primary.rsplit('.', 1)[0]}_htm.xml" if primary.lower().endswith((".htm", ".html")) else None
    if expected in names:
        return expected
    candidates = [name for name in names if name.lower().endswith("_htm.xml")]
    return candidates[0] if len(candidates) == 1 else None


def merge_sec_instance_facts(company_facts: dict[str, Any], xml_text: str, filing: dict[str, Any]) -> int:
    """Append standard US-GAAP 8-K Inline-XBRL facts to a companyfacts payload.

    This supports issuers that attach fully tagged results to an Item 2.02
    release before submitting a 10-Q.  Only concepts already accepted by the
    common normalizer are imported; custom issuer extensions are intentionally
    ignored.
    """
    try:
        root = ET.fromstring(xml_text)
    except (ET.ParseError, TypeError, ValueError):
        return 0
    accepted = {concept for concepts in ({**INCOME_CONCEPTS, **CASH_FLOW_CONCEPTS, **BALANCE_SHEET_CONCEPTS}).values() for concept in concepts}
    contexts: dict[str, tuple[str | None, str | None]] = {}
    units: dict[str, str] = {}
    for node in root.iter():
        local = node.tag.rsplit("}", 1)[-1]
        if local == "context":
            identifier = node.attrib.get("id")
            period = next((item for item in node if item.tag.rsplit("}", 1)[-1] == "period"), None)
            if identifier and period is not None:
                start = next((item.text for item in period if item.tag.rsplit("}", 1)[-1] == "startDate"), None)
                end = next((item.text for item in period if item.tag.rsplit("}", 1)[-1] in {"endDate", "instant"}), None)
                contexts[identifier] = (start, end)
        elif local == "unit":
            identifier = node.attrib.get("id")
            measures = [str(item.text or "").lower() for item in node.iter() if item.tag.rsplit("}", 1)[-1] == "measure"]
            if identifier and measures:
                if len(measures) == 1 and measures[0].endswith("usd"):
                    units[identifier] = "USD"
                elif any(item.endswith("usd") for item in measures) and any(item.endswith("shares") for item in measures):
                    units[identifier] = "USD/shares"
                elif len(measures) == 1 and measures[0].endswith("shares"):
                    units[identifier] = "shares"
    facts = company_facts.setdefault("facts", {}).setdefault("us-gaap", {})
    added = 0
    for node in root.iter():
        concept = node.tag.rsplit("}", 1)[-1]
        if concept not in accepted or not node.attrib.get("contextRef"):
            continue
        value = safe_float((node.text or "").strip())
        start, end = contexts.get(node.attrib.get("contextRef"), (None, None))
        if value is None or not end:
            continue
        unit = units.get(node.attrib.get("unitRef"), "USD")
        rows = facts.setdefault(concept, {"units": {}}).setdefault("units", {}).setdefault(unit, [])
        row = {
            "start": start,
            "end": end,
            "val": value,
            "accn": filing.get("accessionNumber"),
            "filed": filing.get("filingDate"),
            "form": "8-K",
        }
        if not any(existing.get("accn") == row["accn"] and existing.get("start") == start and existing.get("end") == end and safe_float(existing.get("val")) == value for existing in rows):
            rows.append(row)
            added += 1
    return added


def compare_periods(primary_period: str | None, official_period: str | None) -> int | None:
    primary = parse_date(primary_period)
    official = parse_date(official_period)
    if primary is None or official is None:
        return None
    return (official > primary) - (official < primary)


def determine_freshness(primary_period: str | None, primary_updated_at: str | None, earnings: dict[str, Any] | None, filing: dict[str, Any] | None, fallback_loaded: bool = False, release_reference: dict[str, Any] | None = None) -> dict[str, Any]:
    earnings = earnings or {}
    released_from_calendar = bool(earnings.get("reportReleased"))
    official_period = (filing or {}).get("reportDate")
    filing_date = (filing or {}).get("filingDate")
    released = released_from_calendar or bool(filing) or bool(release_reference)
    period_comparison = compare_periods(primary_period, official_period)
    primary_is_older = period_comparison == 1
    if fallback_loaded:
        status = "fallback_data_loaded"
    elif released and primary_is_older:
        status = "released_primary_source_pending"
    elif released and not official_period:
        status = "released_primary_source_pending"
    elif not released:
        status = "awaiting_release"
    else:
        status = "latest"
    return {
        "status": status,
        "primary_period_end_date": primary_period,
        "primary_updated_at": primary_updated_at,
        "latest_reported_earnings_date": earnings.get("eventDate"),
        "latest_reported_fiscal_period_end_date": official_period,
        "official_filing_date": filing_date,
        "report_released": released,
        "primary_source_is_older": primary_is_older,
        "release_reference": release_reference,
    }


def sec_units_for_concept(company_facts: dict[str, Any], concepts: Iterable[str], preferred_units: tuple[str, ...] = ("USD",)) -> tuple[str | None, str | None, list[dict[str, Any]]]:
    facts = (company_facts or {}).get("facts", {})
    for namespace in ("us-gaap", "dei"):
        namespace_facts = facts.get(namespace, {}) if isinstance(facts, dict) else {}
        for concept in concepts:
            fact = namespace_facts.get(concept) or {}
            units = fact.get("units") or {}
            for unit in preferred_units:
                if isinstance(units.get(unit), list):
                    return concept, unit, units[unit]
            for unit, rows in units.items():
                if isinstance(rows, list):
                    return concept, unit, rows
    return None, None, []


def sec_units_for_single_concept(company_facts: dict[str, Any], concept: str, preferred_units: tuple[str, ...]) -> tuple[str | None, list[dict[str, Any]]]:
    facts = (company_facts or {}).get("facts", {})
    for namespace in ("us-gaap", "dei"):
        units = ((facts.get(namespace, {}) or {}).get(concept, {}) or {}).get("units", {})
        for unit in preferred_units:
            if isinstance(units.get(unit), list):
                return unit, units[unit]
        for unit, rows in units.items():
            if isinstance(rows, list):
                return unit, rows
    return None, []


def _duration_days(row: dict[str, Any]) -> int | None:
    start, end = parse_date(row.get("start")), parse_date(row.get("end"))
    return (end - start).days + 1 if start and end else None


def _filtered_period_rows(rows: Iterable[dict[str, Any]], period_end: str, filing: dict[str, Any] | None) -> list[dict[str, Any]]:
    accession = (filing or {}).get("accessionNumber")
    forms = {str((filing or {}).get("form") or "").replace("/A", "")}
    values = [row for row in rows if str(row.get("end") or "")[:10] == str(period_end or "")[:10]]
    if accession:
        exact = [row for row in values if row.get("accn") == accession]
        if exact:
            values = exact
    form_rows = [row for row in values if str(row.get("form") or "").replace("/A", "") in forms]
    return form_rows or values


def _best_duration_row(rows: Iterable[dict[str, Any]], prefer_quarter: bool = True) -> dict[str, Any] | None:
    rows = [row for row in rows if safe_float(row.get("val")) is not None and _duration_days(row) is not None]
    if not rows:
        return None
    if prefer_quarter:
        quarter_rows = [row for row in rows if 45 <= (_duration_days(row) or 0) <= 125]
        if quarter_rows:
            return min(quarter_rows, key=lambda row: abs((_duration_days(row) or 90) - 90))
    return max(rows, key=lambda row: _duration_days(row) or 0)


def derive_standalone_quarter(rows: Iterable[dict[str, Any]], period_end: str, filing: dict[str, Any] | None) -> dict[str, Any]:
    """Return a reported quarter or a valid YTD-minus-prior-YTD derivation."""
    current_candidates = _filtered_period_rows(rows, period_end, filing)
    current = _best_duration_row(current_candidates, prefer_quarter=True)
    if current and (_duration_days(current) or 0) <= 125:
        return {"value": safe_float(current.get("val")), "record": current, "method": "reported_standalone_quarter", "available": True}
    current = _best_duration_row(current_candidates, prefer_quarter=False)
    if not current:
        return {"value": None, "record": None, "method": "unavailable", "available": False}
    start = str(current.get("start") or "")[:10]
    current_end = parse_date(current.get("end"))
    duration = _duration_days(current) or 0
    if not start or not current_end or duration <= 125:
        return {"value": None, "record": current, "method": "unavailable", "available": False}
    prior_candidates = [
        row for row in rows
        if str(row.get("start") or "")[:10] == start
        and parse_date(row.get("end")) is not None
        and parse_date(row.get("end")) < current_end
        and safe_float(row.get("val")) is not None
        and (_duration_days(row) or 0) >= 45
    ]
    if not prior_candidates:
        return {"value": None, "record": current, "method": "ytd_value_without_prior_period", "available": False, "cumulative_value": safe_float(current.get("val"))}
    prior = max(prior_candidates, key=lambda row: parse_date(row.get("end")) or date.min)
    return {
        "value": safe_float(current.get("val")) - safe_float(prior.get("val")),
        "record": current,
        "prior_record": prior,
        "method": "derived_ytd_minus_prior_ytd",
        "available": True,
    }


def _record(value: float | None, period_type: str, period_end: str | None, concept: str | None, unit: str | None, filing: dict[str, Any] | None, source_url: str | None, method: str) -> dict[str, Any]:
    return {
        "raw_value": safe_float(value),
        "currency": "USD" if unit and unit.startswith("USD") else None,
        "unit": unit,
        "detected_scale": "raw_usd" if unit == "USD" else "raw_provider_unit",
        "period_type": period_type,
        "period_end_date": period_end,
        "source_field": concept,
        "original_financial_statement_concept": concept,
        "normalized_dashboard_field": None,
        "source": "SEC EDGAR companyfacts",
        "source_name": "SEC EDGAR",
        "source_url": source_url,
        "filing_accession": (filing or {}).get("accessionNumber"),
        "filing_date": (filing or {}).get("filingDate"),
        "report_date": (filing or {}).get("reportDate"),
        "extraction_timestamp": now_iso(),
        "calculation_method": method,
        "data_quality": "high" if value is not None else "unavailable",
    }


def _latest_balance_value(rows: Iterable[dict[str, Any]], filing: dict[str, Any] | None) -> dict[str, Any] | None:
    period = (filing or {}).get("reportDate")
    values = _filtered_period_rows(rows, period, filing) if period else list(rows)
    values = [row for row in values if safe_float(row.get("val")) is not None and not row.get("start")]
    if not values:
        return None
    return max(values, key=lambda row: parse_date(row.get("filed")) or date.min)


def _period_filings(company_facts: dict[str, Any], filing: dict[str, Any]) -> list[dict[str, Any]]:
    concept, _unit, rows = sec_units_for_concept(company_facts, INCOME_CONCEPTS["revenue"])
    by_end: dict[str, dict[str, Any]] = {}
    permitted_forms = {"10-Q", "10-K"}
    if str(filing.get("form") or "").replace("/A", "") == "8-K":
        permitted_forms.add("8-K")
    for row in rows:
        if str(row.get("form") or "").replace("/A", "") not in permitted_forms:
            continue
        end = str(row.get("end") or "")[:10]
        if not end:
            continue
        candidate = {
            "form": str(row.get("form") or "").replace("/A", ""),
            "reportDate": end,
            "filingDate": row.get("filed"),
            "accessionNumber": row.get("accn"),
            "primaryDocument": (filing or {}).get("primaryDocument") if row.get("accn") == (filing or {}).get("accessionNumber") else None,
        }
        previous = by_end.get(end)
        if previous is None or str(candidate.get("filingDate") or "") > str(previous.get("filingDate") or ""):
            by_end[end] = candidate
    latest_end = str(filing.get("reportDate") or "")[:10]
    if latest_end:
        by_end[latest_end] = dict(filing)
    return sorted(by_end.values(), key=lambda row: parse_date(row.get("reportDate")) or date.min, reverse=True)


def _metric_quarters(company_facts: dict[str, Any], filings: list[dict[str, Any]], concepts: list[str], units: tuple[str, ...] = ("USD",)) -> tuple[str | None, str | None, list[dict[str, Any]]]:
    fallback = (None, None, [])
    for concept in concepts:
        unit, rows = sec_units_for_single_concept(company_facts, concept, units)
        if not rows:
            continue
        result = [
            {"filing": filing, "derivation": derive_standalone_quarter(rows, filing.get("reportDate"), filing)}
            for filing in filings[:5]
        ]
        if not fallback[0]:
            fallback = (concept, unit, result)
        # Prefer the first standard concept that actually covers the newest filing.
        if result and result[0].get("derivation", {}).get("available"):
            return concept, unit, result
    return fallback


def _sum_complete_quarters(metric_quarters: list[dict[str, Any]]) -> float | None:
    values = [item.get("derivation", {}).get("value") for item in metric_quarters[:4]]
    return sum(values) if len(values) == 4 and all(value is not None for value in values) else None


def build_sec_normalized_report(company_facts: dict[str, Any], cik: int, filing: dict[str, Any]) -> dict[str, Any] | None:
    if not company_facts or not filing or not filing.get("reportDate"):
        return None
    period_filings = _period_filings(company_facts, filing)
    if not period_filings:
        return None
    latest = period_filings[0]
    source_url = filing_url(cik, latest.get("accessionNumber"), latest.get("primaryDocument"))
    metrics: dict[str, dict[str, Any]] = {}
    quarter_series: dict[str, list[dict[str, Any]]] = {}
    for field, concepts in {**INCOME_CONCEPTS, **CASH_FLOW_CONCEPTS}.items():
        preferred = ("USD/shares",) if field == "diluted_eps" else ("USD",)
        concept, unit, entries = _metric_quarters(company_facts, period_filings, concepts, preferred)
        latest_entry = entries[0] if entries else {"derivation": {"value": None, "method": "unavailable"}}
        latest_value = latest_entry.get("derivation", {}).get("value")
        metrics[field] = _record(latest_value, "quarter", latest.get("reportDate"), concept, unit, latest, source_url, latest_entry.get("derivation", {}).get("method") or "unavailable")
        metrics[field]["normalized_dashboard_field"] = field
        quarter_series[field] = entries

    balance: dict[str, dict[str, Any]] = {}
    for field, concepts in BALANCE_SHEET_CONCEPTS.items():
        preferred = ("shares",) if "shares" in field else ("USD",)
        concept, unit, rows = sec_units_for_concept(company_facts, concepts, preferred)
        row = _latest_balance_value(rows, latest)
        balance[field] = _record(safe_float((row or {}).get("val")), "point_in_time", latest.get("reportDate"), concept, unit, latest, source_url, "reported_instant")
        balance[field]["normalized_dashboard_field"] = field

    ttm: dict[str, dict[str, Any]] = {}
    for field in ("revenue", "gross_profit", "operating_income", "net_income", "operating_cash_flow", "capital_expenditure", "share_repurchases", "dividends_paid"):
        latest_record = metrics[field]
        value = _sum_complete_quarters(quarter_series.get(field) or [])
        ttm[field] = _record(value, "ttm", latest.get("reportDate"), latest_record.get("source_field"), latest_record.get("unit"), latest, source_url, "sum_four_normalized_standalone_quarters")
        ttm[field]["normalized_dashboard_field"] = field
    quarterly_fcf = None
    if metrics["operating_cash_flow"]["raw_value"] is not None and metrics["capital_expenditure"]["raw_value"] is not None:
        quarterly_fcf = metrics["operating_cash_flow"]["raw_value"] - abs(metrics["capital_expenditure"]["raw_value"])
    metrics["standardized_free_cash_flow"] = _record(quarterly_fcf, "quarter", latest.get("reportDate"), "NetCashProvidedByUsedInOperatingActivities - PaymentsToAcquirePropertyPlantAndEquipment", "USD", latest, source_url, "standardized_ocf_minus_capex")
    metrics["standardized_free_cash_flow"]["normalized_dashboard_field"] = "standardized_free_cash_flow"
    ttm_fcf = None
    if ttm["operating_cash_flow"]["raw_value"] is not None and ttm["capital_expenditure"]["raw_value"] is not None:
        ttm_fcf = ttm["operating_cash_flow"]["raw_value"] - abs(ttm["capital_expenditure"]["raw_value"])
    ttm["standardized_free_cash_flow"] = _record(ttm_fcf, "ttm", latest.get("reportDate"), "NetCashProvidedByUsedInOperatingActivities - PaymentsToAcquirePropertyPlantAndEquipment", "USD", latest, source_url, "sum_four_normalized_standardized_quarters")
    ttm["standardized_free_cash_flow"]["normalized_dashboard_field"] = "standardized_free_cash_flow"

    revenue = metrics["revenue"]["raw_value"]
    ttm_revenue = ttm["revenue"]["raw_value"]
    prior_eps_entry = (quarter_series.get("diluted_eps") or [None, None])[1] if len(quarter_series.get("diluted_eps") or []) > 1 else None
    prior_eps_derivation = (prior_eps_entry or {}).get("derivation") or {}
    prior_eps_filing = (prior_eps_entry or {}).get("filing") or {}
    prior_eps_record = _record(
        prior_eps_derivation.get("value"),
        "quarter",
        prior_eps_filing.get("reportDate"),
        metrics["diluted_eps"].get("source_field"),
        metrics["diluted_eps"].get("unit"),
        prior_eps_filing,
        filing_url(cik, prior_eps_filing.get("accessionNumber"), prior_eps_filing.get("primaryDocument")),
        prior_eps_derivation.get("method") or "unavailable",
    )
    prior_eps_record["normalized_dashboard_field"] = "prior_quarter_diluted_eps"
    return {
        "source_name": "SEC EDGAR companyfacts",
        "source_url": source_url,
        "cik": cik,
        "filing": latest,
        "fiscal_period_end_date": latest.get("reportDate"),
        "quarter": metrics,
        "ttm": ttm,
        "balance": balance,
        "ratios": {
            "quarter_fcf_margin": quarterly_fcf / revenue if quarterly_fcf is not None and revenue not in (None, 0) else None,
            "ttm_fcf_margin": ttm_fcf / ttm_revenue if ttm_fcf is not None and ttm_revenue not in (None, 0) else None,
            "quarter_capex_to_ocf": abs(metrics["capital_expenditure"]["raw_value"]) / metrics["operating_cash_flow"]["raw_value"] if metrics["capital_expenditure"]["raw_value"] is not None and metrics["operating_cash_flow"]["raw_value"] not in (None, 0) else None,
            "ttm_capex_to_ocf": abs(ttm["capital_expenditure"]["raw_value"]) / ttm["operating_cash_flow"]["raw_value"] if ttm["capital_expenditure"]["raw_value"] is not None and ttm["operating_cash_flow"]["raw_value"] not in (None, 0) else None,
        },
        "quarter_series": quarter_series,
        "previous_quarter": {"diluted_eps": prior_eps_record},
        "concept_diagnostics": {
            "capital_expenditure": build_sec_concept_diagnostic(
                company_facts,
                latest,
                metrics.get("capital_expenditure", {}).get("source_field"),
            ),
        },
        "extraction_timestamp": now_iso(),
    }


def select_source(primary_period: str | None, sec_report: dict[str, Any] | None, freshness: dict[str, Any]) -> str:
    if sec_report and freshness.get("primary_source_is_older"):
        return "sec_edgar"
    return "yahoo_finance"


def source_conflicts(primary_value: float | None, fallback_value: float | None, tolerance: float = 0.015) -> bool:
    if primary_value is None or fallback_value is None:
        return False
    denominator = max(abs(primary_value), abs(fallback_value), 1.0)
    return abs(primary_value - fallback_value) / denominator > tolerance


def official_release_period_end(text: str, filing_date: str | None = None) -> str | None:
    """Extract a displayed fiscal period from an official release, not its filing date."""
    reference = parse_date(filing_date) or datetime.now(timezone.utc).date()

    def valid_period(candidate: date) -> str | None:
        # Releases often mention a future earnings date or guidance period.
        # A fiscal period in a report cannot end after the release was filed.
        return candidate.isoformat() if candidate <= reference else None

    period_matches = re.findall(
        r"(?:three|six|nine|twelve)\s+months?\s+ended\s+((?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2}(?:,\s*20\d{2})?)",
        text or "",
        flags=re.I,
    )
    for match in period_matches:
        try:
            if re.search(r"20\d{2}", match):
                period = valid_period(datetime.strptime(match.title(), "%B %d, %Y").date())
                if period:
                    return period
                continue
            candidate = datetime.strptime(f"{match.title()}, {reference.year}", "%B %d, %Y").date()
            if candidate > reference:
                candidate = candidate.replace(year=candidate.year - 1)
            period = valid_period(candidate)
            if period:
                return period
        except ValueError:
            continue
    # A generic date may be an announcement, webcast, guidance, or forward
    # earnings date.  Without an explicit statement-period label it is not a
    # reliable fiscal-period end and must not relabel the dashboard.
    return None


def _release_number(cell_text: str) -> float | None:
    text = str(cell_text or "").replace("$", "").replace(",", "").strip()
    match = re.search(r"(?:\(?\s*-?\s*\d+(?:\.\d+)?\s*\)?)", text)
    if not match:
        return None
    token = match.group(0).replace(" ", "")
    negative = token.startswith("(") and token.endswith(")")
    try:
        value = float(token.strip("()"))
        return -value if negative else value
    except ValueError:
        return None


def parse_official_earnings_release(html_text: str, cik: int, filing: dict[str, Any], source_url: str | None) -> dict[str, Any] | None:
    """Extract conservative GAAP headline metrics from an SEC-filed earnings release.

    The release is only used before the corresponding 10-Q/10-K is available;
    it deliberately does not infer cash-flow or TTM values from narrative text.
    """
    try:
        from lxml import html as lxml_html
        root = lxml_html.fromstring(html_text)
    except Exception:
        return None
    plain_text = " ".join(root.text_content().split())
    period_end = official_release_period_end(plain_text, (filing or {}).get("filingDate"))
    if not period_end:
        return None
    unit_scale = 1.0
    unit_label = "USD"
    prefix = plain_text[:12000].lower()
    if "in thousands" in prefix or "($ in thousands" in prefix:
        unit_scale, unit_label = 1_000.0, "USD"
    elif "in millions" in prefix or "($ in millions" in prefix:
        unit_scale, unit_label = 1_000_000.0, "USD"
    elif "in billions" in prefix or "($ in billions" in prefix:
        unit_scale, unit_label = 1_000_000_000.0, "USD"

    labels = {
        "revenue": ("revenue", "total revenue", "total net revenue", "net revenues"),
        "net_income": ("net income", "net earnings"),
        "diluted_eps": ("diluted eps", "diluted earnings per share", "diluted earnings per common share", "earnings per share diluted"),
    }
    extracted: dict[str, float] = {}
    for row in root.xpath("//tr"):
        cells = [" ".join(cell.text_content().split()) for cell in row.xpath("./th|./td")]
        if len(cells) < 2:
            continue
        label = (cells[0] or "").lower()
        if any(term in label for term in ("adjusted", "non-gaap", "year-over-year", "margin", "growth")):
            continue
        for field, aliases in labels.items():
            if field in extracted or not any(label == alias or label.startswith(f"{alias} ") for alias in aliases):
                continue
            values = [_release_number(cell) for cell in cells[1:]]
            value = next((item for item in values if item is not None), None)
            if value is not None:
                extracted[field] = value if field == "diluted_eps" else value * unit_scale
    if not extracted:
        return None
    release_source = "Official company earnings release filed with SEC"
    quarter = {
        field: _record(value, "quarter", period_end, f"official_release:{field}", "USD/shares" if field == "diluted_eps" else unit_label, filing, source_url, "official_release_headline_metric")
        for field, value in extracted.items()
    }
    for field, record in quarter.items():
        record["source"] = release_source
        record["source_name"] = release_source
        record["normalized_dashboard_field"] = field
    return {
        "source_name": release_source,
        "source_url": source_url,
        "cik": cik,
        "filing": filing,
        "fiscal_period_end_date": period_end,
        "quarter": quarter,
        "ttm": {},
        "balance": {},
        "ratios": {},
        "completeness": "headline_release_partial",
        "extraction_timestamp": now_iso(),
    }


def preserve_cached_statement(cached: dict[str, Any] | None, candidate: dict[str, Any] | None) -> dict[str, Any] | None:
    """Keep the last complete statement when a newer release has headline data only."""
    if candidate and candidate.get("fiscal_period_end_date") and candidate.get("completeness") != "headline_release_partial":
        return candidate
    if cached and cached.get("fiscal_period_end_date"):
        return cached
    return candidate
