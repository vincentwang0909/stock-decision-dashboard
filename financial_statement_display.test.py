import unittest
from unittest.mock import patch

import pandas as pd

import server


def record(value, period):
    return {"raw_value": value, "period_end_date": period, "period_type": "quarter"}


def snapshot(cash_period="2026-03-31", income_period="2026-06-30"):
    return {
        "financialFacts": {
            "cashFlow": {
                "quarterly": {
                    "operatingCashFlow": record(100, cash_period),
                    "freeCashFlow": record(-20, cash_period),
                    "capitalExpenditure": record(120, cash_period),
                },
                "ttm": {
                    "operatingCashFlow": {**record(400, cash_period), "period_type": "ttm"},
                    "freeCashFlow": {**record(-10, cash_period), "period_type": "ttm"},
                    "capitalExpenditure": {**record(410, cash_period), "period_type": "ttm"},
                },
            },
            "balanceSheet": {
                "cashAndCashEquivalents": record(50, cash_period),
                "shortTermInvestments": record(20, cash_period),
                "totalDebt": record(30, cash_period),
            },
        },
        "earningsMetrics": {"eps": {"period": record(1.2, income_period)}},
        "displayFundamentals": {
            "metrics": {
                "gross_margin": {"value": 0.30, "period_end_date": cash_period},
                "roe": {"value": 0.12, "period_end_date": cash_period},
            },
        },
    }


def full_sec_report(period="2026-06-30"):
    return {
        "fiscal_period_end_date": period,
        "source_name": "SEC EDGAR companyfacts",
        "source_url": "https://www.sec.gov/example",
        "filing": {"filingDate": "2026-07-31", "accessionNumber": "0000000000-26-000001"},
        "quarter": {
            "revenue": record(200, period),
            "gross_profit": record(120, period),
            "operating_cash_flow": record(60, period),
            "capital_expenditure": record(90, period),
            "standardized_free_cash_flow": record(-30, period),
            "operating_income": record(25, period),
            "net_income": record(20, period),
            "diluted_eps": record(2, period),
        },
        "ttm": {
            "revenue": {**record(700, period), "period_type": "ttm"},
            "gross_profit": {**record(420, period), "period_type": "ttm"},
            "operating_income": {**record(175, period), "period_type": "ttm"},
            "net_income": {**record(140, period), "period_type": "ttm"},
            "operating_cash_flow": {**record(210, period), "period_type": "ttm"},
            "capital_expenditure": {**record(250, period), "period_type": "ttm"},
            "standardized_free_cash_flow": {**record(-40, period), "period_type": "ttm"},
        },
        "ratios": {"quarter_fcf_margin": -0.15, "ttm_fcf_margin": -0.06, "quarter_capex_to_ocf": 1.5, "ttm_capex_to_ocf": 1.19},
        "balance": {
            "cash_and_cash_equivalents": {**record(80, period), "period_type": "point_in_time"},
            "short_term_investments": {**record(20, period), "period_type": "point_in_time"},
            "marketable_securities": {**record(10, period), "period_type": "point_in_time"},
            "total_debt": {**record(30, period), "period_type": "point_in_time"},
            "stockholders_equity": {**record(350, period), "period_type": "point_in_time"},
        },
    }


class FinancialStatementDisplayTests(unittest.TestCase):
    def test_normalized_fundamentals_use_four_quarters_and_keep_missing_distinct_from_zero(self):
        columns = pd.to_datetime(["2026-06-30", "2026-03-31", "2025-12-31", "2025-09-30", "2025-06-30"])
        income = pd.DataFrame({
            columns[0]: [100, 60, 20, 10, 1.0],
            columns[1]: [90, 54, 18, 9, 0.9],
            columns[2]: [80, 48, 16, 8, 0.8],
            columns[3]: [70, 42, 14, 7, 0.7],
            columns[4]: [60, 36, 12, 6, 0.6],
        }, index=["Total Revenue", "Gross Profit", "Operating Income", "Net Income", "Diluted EPS"])
        cashflow = pd.DataFrame({
            columns[0]: [30, -5], columns[1]: [20, -4], columns[2]: [20, -4],
            columns[3]: [10, -2], columns[4]: [15, -3],
        }, index=["Operating Cash Flow", "Capital Expenditure"])
        balance = pd.DataFrame({
            columns[0]: [100, 20, 50, 25], columns[1]: [95, 21, 49, 25],
            columns[2]: [90, 22, 48, 24], columns[3]: [85, 23, 47, 24],
            columns[4]: [80, 24, 46, 23],
        }, index=["Stockholders Equity", "Total Debt", "Current Assets", "Current Liabilities"])
        normalized = server.build_yahoo_normalized_fundamentals(
            income, cashflow, balance,
            {"operatingMargins": 0.99, "returnOnEquity": 0.77}, "2026-08-08T00:00:00Z",
        )
        self.assertAlmostEqual(normalized["profitability"]["gross_margin_ttm"]["value"], 0.60)
        self.assertAlmostEqual(normalized["profitability"]["operating_margin_ttm"]["value"], 0.20)
        self.assertAlmostEqual(normalized["profitability"]["net_margin_ttm"]["value"], 0.10)
        self.assertNotEqual(normalized["profitability"]["operating_margin_ttm"]["value"], 0.99)
        self.assertAlmostEqual(normalized["growth"]["free_cash_flow_growth_yoy"]["value"], (25 - 12) / 12)
        self.assertAlmostEqual(normalized["balance_sheet"]["current_ratio"]["value"], 2.0)

        missing_net_income = income.drop(index="Net Income")
        incomplete = server.build_yahoo_normalized_fundamentals(
            missing_net_income, cashflow, balance, {}, "2026-08-08T00:00:00Z",
        )
        self.assertIsNone(incomplete["profitability"]["net_margin_ttm"]["value"])
        self.assertNotEqual(incomplete["profitability"]["net_margin_ttm"]["value"], 0)

    def test_same_quarter_growth_does_not_turn_a_zero_base_into_zero_growth(self):
        growth, reason = server._growth_from_same_quarter(
            {"value": 25.0, "period_end_date": "2026-06-30"},
            {"value": 0.0, "period_end_date": "2025-06-30"},
        )
        self.assertIsNone(growth)
        self.assertEqual(reason, "zero_prior_year_denominator")

    def test_normalized_valuation_preserves_negative_multiples(self):
        normalized = {
            "source": "fixture", "metadata": {"profitability_period_end": "2026-06-30"},
            "inputs": {
                "ttm_diluted_eps": {"value": -1.0},
                "ttm_revenue": {"value": 100.0},
            },
        }
        result = server.finalize_normalized_fundamentals_valuation(
            normalized,
            {"marketCap": 500, "epsForward": -0.5, "nextYearEpsGrowth": 0.25, "enterpriseToEbitda": -12.0},
            20,
            "2026-08-08T20:00:00Z",
        )
        self.assertEqual(result["valuation"]["pe"]["value"], -20.0)
        self.assertEqual(result["valuation"]["forward_pe"]["value"], -40.0)
        self.assertEqual(result["valuation"]["peg"]["value"], -0.8)
        self.assertEqual(result["valuation"]["ev_to_ebitda"]["value"], -12.0)
    def test_basic_fundamental_payload_is_removed_before_serialization(self):
        item = server.strip_basic_fundamental_payload({
            "financialFacts": {"cashFlow": {}},
            "cashFlow": {"freeCashFlow": 1},
            "capitalAllocation": {"capitalExpenditure": 2},
            "balanceSheet": {"cash": 3},
            "guidance": {"revenueGuidance": {}},
            "earningsMetrics": {"eps": {"actual": 0.1}},
            "latestEarnings": {"epsActual": 0.1},
        })
        for field in server.BASIC_FUNDAMENTAL_SNAPSHOT_FIELDS:
            self.assertNotIn(field, item)
        self.assertIn("earningsMetrics", item)
        self.assertIn("latestEarnings", item)

    def test_dividend_yield_prefers_annual_dividend_rate_over_ambiguous_provider_yield(self):
        result = server.canonical_dividend_yield(
            {"dividendYield": 0.06, "trailingAnnualDividendRate": 0.46},
            750,
        )
        self.assertAlmostEqual(result["value"], 0.46 / 750)
        self.assertEqual(result["unit"], "decimal")
        self.assertEqual(result["source"], "annual_dividend_rate_divided_by_price")

    def test_ambiguous_dividend_yield_is_hidden_instead_of_guessing_its_scale(self):
        result = server.canonical_dividend_yield({"dividendYield": 0.06}, 750)
        self.assertIsNone(result["value"])
        self.assertEqual(result["source"], "unverified_or_unavailable")

    def test_company_news_cache_purges_expired_entries_without_a_ticker_limit(self):
        original_cache = dict(server.COMPANY_NEWS_CACHE)
        try:
            server.COMPANY_NEWS_CACHE.clear()
            server.COMPANY_NEWS_CACHE.update({
                "OLD": {"value": {"headline": "old"}, "expiresAt": 99},
                "CURRENT": {"value": {"headline": "current"}, "expiresAt": 101},
            })
            self.assertEqual(server.purge_expired_company_news_cache(now=100), 1)
            self.assertEqual(set(server.COMPANY_NEWS_CACHE), {"CURRENT"})
        finally:
            server.COMPANY_NEWS_CACHE.clear()
            server.COMPANY_NEWS_CACHE.update(original_cache)

    def test_company_news_cache_reuses_one_stable_key_per_ticker(self):
        original_cache = dict(server.COMPANY_NEWS_CACHE)
        try:
            server.COMPANY_NEWS_CACHE.clear()
            with patch.object(server, "fetch_company_news_payload", return_value={"headline": "latest"}) as fetch:
                with patch.object(server.time, "time", side_effect=[100, 100, 101]):
                    first = server.get_cached_company_news("mpt", {"updatedAt": "first-quote"})
                    second = server.get_cached_company_news("MPT", {"updatedAt": "next-quote"})
            self.assertEqual(first, second)
            self.assertEqual(fetch.call_count, 1)
            self.assertEqual(set(server.COMPANY_NEWS_CACHE), {"MPT"})
        finally:
            server.COMPANY_NEWS_CACHE.clear()
            server.COMPANY_NEWS_CACHE.update(original_cache)

    def test_new_header_with_old_rendered_values_is_not_latest_complete(self):
        result = server.apply_financial_display_status(
            snapshot(),
            {"latest_reported_fiscal_period_end_date": "2026-06-30"},
        )
        freshness = result["financialStatementFreshness"]
        self.assertEqual(freshness["status"], "latest_partial")
        self.assertEqual(freshness["displayed_complete_period_end"], "2026-03-31")
        self.assertEqual(freshness["expected_latest_fiscal_period_end"], "2026-06-30")

    def test_complete_current_groups_are_latest_complete(self):
        result = server.apply_financial_display_status(
            snapshot(cash_period="2026-06-30", income_period="2026-06-30"),
            {"latest_reported_fiscal_period_end_date": "2026-06-30"},
        )
        self.assertEqual(result["financialStatementFreshness"]["status"], "latest_complete")

    def test_nearby_non_calendar_fiscal_periods_are_not_reported_as_stale(self):
        result = server.apply_financial_display_status(
            snapshot(cash_period="2026-06-30", income_period="2026-06-30"),
            {"latest_reported_fiscal_period_end_date": "2026-06-27"},
        )
        self.assertEqual(result["financialStatementFreshness"]["status"], "latest_complete")
        self.assertTrue(result["financialStatementSnapshot"]["fiscal_calendar_equivalent"])

    def test_eps_surprise_handles_crossing_zero_and_near_zero_estimates(self):
        turned_to_loss = server.build_earnings_surprise(-0.40, 0.13)
        self.assertEqual(turned_to_loss["comparison_status"], "turned_to_loss")
        self.assertAlmostEqual(turned_to_loss["surprise_abs"], -0.53)
        turned_profitable = server.build_earnings_surprise(0.10, -0.05)
        self.assertEqual(turned_profitable["comparison_status"], "turned_profitable")
        near_zero = server.build_earnings_surprise(0.03, 0.001)
        self.assertEqual(near_zero["comparison_status"], "denominator_near_zero")
        self.assertIsNone(near_zero["surprise_pct"])

    def test_eps_quarter_comparison_uses_semantic_states_when_values_cross_zero(self):
        turned_to_loss = server.build_eps_quarter_comparison(-0.41, 0.09)
        self.assertEqual(turned_to_loss["state"], "turned_to_loss")
        self.assertAlmostEqual(turned_to_loss["absolute_change"], -0.50)
        narrowed_loss = server.build_eps_quarter_comparison(-0.05, -0.12)
        self.assertEqual(narrowed_loss["state"], "loss_narrowed")
        growth = server.build_eps_quarter_comparison(0.12, 0.09)
        self.assertEqual(growth["state"], "earnings_growth")
        self.assertTrue(growth["pct_change_valid"])

    def test_partial_release_keeps_complete_statement_period(self):
        item = snapshot()
        report = {
            "completeness": "headline_release_partial",
            "fiscal_period_end_date": "2026-06-30",
            "source_name": "Official company earnings release filed with SEC",
            "quarter": {"revenue": record(200, "2026-06-30")},
            "filing": {"filingDate": "2026-07-29"},
        }
        item = server.apply_sec_financial_report(item, report, {}, {})
        item = server.apply_financial_display_status(
            item,
            {"latest_reported_fiscal_period_end_date": "2026-06-30"},
            report,
        )
        self.assertEqual(item["financialStatementFreshness"]["status"], "latest_partial")
        self.assertEqual(item["financialStatementSource"]["source_data_period_end"], "2026-03-31")
        self.assertEqual(item["financialStatementSource"]["latest_fiscal_period_end"], "2026-06-30")

    def test_complete_sec_snapshot_updates_the_same_cashflow_and_balance_fields_as_the_ui(self):
        item = server.apply_sec_financial_report(snapshot(), full_sec_report(), {}, {})
        item = server.apply_financial_display_status(
            item,
            {"latest_reported_fiscal_period_end_date": "2026-06-30"},
            full_sec_report(),
        )
        facts = item["financialFacts"]
        self.assertEqual(facts["cashFlow"]["quarterly"]["operatingCashFlow"]["period_end_date"], "2026-06-30")
        self.assertEqual(facts["cashFlow"]["ttm"]["freeCashFlow"]["raw_value"], -40)
        self.assertEqual(facts["balanceSheet"]["cashAndCashEquivalents"]["period_end_date"], "2026-06-30")
        self.assertEqual(item["financialStatementFreshness"]["status"], "latest_complete")

    def test_complete_sec_snapshot_replaces_stale_display_ratios_atomically(self):
        item = server.apply_sec_financial_report(snapshot(), full_sec_report(), {}, {})
        display = item["displayFundamentals"]["metrics"]
        self.assertEqual(display["gross_margin"]["period_end_date"], "2026-06-30")
        self.assertAlmostEqual(display["gross_margin"]["value"], 0.60)
        self.assertAlmostEqual(display["operating_margin"]["value"], 0.25)
        self.assertAlmostEqual(display["net_margin"]["value"], 0.20)
        # TTM ROE requires beginning and ending equity; a single point-in-time
        # balance must not be silently substituted as the denominator.
        self.assertIsNone(display["roe"]["value"])

    def test_release_and_sec_filing_dates_remain_distinct(self):
        item = server.apply_financial_display_status(
            snapshot(cash_period="2026-06-30", income_period="2026-06-30"),
            {
                "latest_reported_fiscal_period_end_date": "2026-06-30",
                "release_reference": {"filing_date": "2026-07-30"},
                "official_filing_date": "2026-07-31",
            },
        )
        source = item["financialStatementSource"]
        self.assertEqual(source["earnings_release_date"], "2026-07-30")
        self.assertEqual(source["sec_filing_date"], "2026-07-31")

    def test_old_financial_cache_schema_is_not_accepted_as_an_atomic_snapshot(self):
        self.assertFalse(server.financial_statement_cache_is_compatible({"schema_version": 1, "report": {}}))
        self.assertTrue(server.financial_statement_cache_is_compatible({"schema_version": server.FINANCIAL_STATEMENT_SCHEMA_VERSION, "report": {}}))

    def test_old_market_cache_cannot_serve_a_pre_normalization_equity_snapshot(self):
        common = {
            "cache_age_seconds": 30,
            "quote": {
                "metadata": {
                    "quoteType": "EQUITY",
                    "companyAnalysis": {"status": "available"},
                },
            },
        }
        self.assertFalse(server.is_market_cache_fresh(common))
        common["quote"]["metadata"]["companyAnalysis"]["normalizedFundamentals"] = {
            "schema_version": server.FUNDAMENTAL_NORMALIZATION_SCHEMA_VERSION,
        }
        self.assertTrue(server.is_market_cache_fresh(common))

    def test_normalize_numeric_keeps_real_zero_but_rejects_missing_placeholders(self):
        self.assertIsNone(server.normalize_numeric(None))
        self.assertIsNone(server.normalize_numeric(""))
        self.assertIsNone(server.normalize_numeric("N/A"))
        self.assertIsNone(server.normalize_numeric(float("nan")))
        self.assertIsNone(server.normalize_numeric(float("inf")))
        self.assertEqual(server.normalize_numeric(0), 0.0)
        self.assertEqual(server.normalize_numeric("0"), 0.0)
        self.assertEqual(server.normalize_numeric(-3.2), -3.2)

    def test_yahoo_trailing_margin_fallback_is_used_only_for_missing_statement_rows(self):
        columns = pd.to_datetime(["2026-06-30", "2026-03-31"])
        income = pd.DataFrame({
            columns[0]: [100, 10, 1.0],
            columns[1]: [90, 9, 0.9],
        }, index=["Total Revenue", "Net Income", "Diluted EPS"])
        normalized = server.build_yahoo_normalized_fundamentals(
            income,
            pd.DataFrame(),
            pd.DataFrame(),
            {"grossMargins": 0.83734, "operatingMargins": 0.16956},
            "2026-08-08T00:00:00Z",
        )
        gross = normalized["profitability"]["gross_margin_ttm"]
        operating = normalized["profitability"]["operating_margin_ttm"]
        self.assertAlmostEqual(gross["value"], 0.83734)
        self.assertAlmostEqual(operating["value"], 0.16956)
        self.assertEqual(gross["period_type"], "ttm_provider")
        self.assertEqual(operating["calculated_or_provider"], "provider")

    def test_placeholder_zero_multiples_become_unavailable_but_calculated_zero_is_preserved(self):
        normalized = {
            "profitability": {
                "gross_margin_ttm": server._fundamental_metric(0, "gross_margin", "ttm", "2026-06-30", "fixture", "fixture", calculated=True),
            },
            "valuation": {
                "price_to_sales": server._fundamental_metric(0, "price_to_sales", "ttm", "2026-06-30", "provider", "fixture", calculated=False),
            },
        }
        result = server.validate_normalized_fundamental_zeros(normalized, {"marketCap": 100}, 20, ticker="FIXTURE")
        self.assertEqual(result["profitability"]["gross_margin_ttm"]["value"], 0.0)
        self.assertEqual(result["profitability"]["gross_margin_ttm"]["validation_status"], "valid_zero")
        self.assertIsNone(result["valuation"]["price_to_sales"]["value"])
        self.assertEqual(result["valuation"]["price_to_sales"]["missing_reason"], "provider_placeholder_zero_or_unavailable_denominator")

    def test_price_to_sales_rebuilds_from_shares_when_market_cap_is_missing(self):
        normalized = {
            "source": "fixture",
            "metadata": {"profitability_period_end": "2026-06-30"},
            "inputs": {
                "ttm_diluted_eps": {"value": 2.0},
                "ttm_revenue": {"value": 100.0},
            },
        }
        result = server.finalize_normalized_fundamentals_valuation(
            normalized,
            {"sharesOutstanding": 50, "epsForward": 2.5, "nextYearEpsGrowth": 0.20},
            20,
            "2026-08-08T20:00:00Z",
        )
        price_to_sales = result["valuation"]["price_to_sales"]
        self.assertEqual(price_to_sales["value"], 10.0)
        self.assertTrue(price_to_sales["calculated_or_provider"] == "calculated")
        self.assertIn("sharesOutstanding", price_to_sales["source_field"])


if __name__ == "__main__":
    unittest.main()
