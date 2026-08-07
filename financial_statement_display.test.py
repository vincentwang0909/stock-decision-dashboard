import unittest
from unittest.mock import patch

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
    }


def full_sec_report(period="2026-06-30"):
    return {
        "fiscal_period_end_date": period,
        "source_name": "SEC EDGAR companyfacts",
        "source_url": "https://www.sec.gov/example",
        "filing": {"filingDate": "2026-07-31", "accessionNumber": "0000000000-26-000001"},
        "quarter": {
            "revenue": record(200, period),
            "operating_cash_flow": record(60, period),
            "capital_expenditure": record(90, period),
            "standardized_free_cash_flow": record(-30, period),
            "operating_income": record(25, period),
            "net_income": record(20, period),
            "diluted_eps": record(2, period),
        },
        "ttm": {
            "revenue": {**record(700, period), "period_type": "ttm"},
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
        },
    }


class FinancialStatementDisplayTests(unittest.TestCase):
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


if __name__ == "__main__":
    unittest.main()
