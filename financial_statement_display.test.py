import unittest

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

    def test_negative_ttm_fcf_has_no_price_to_fcf(self):
        self.assertIsNone(server.fresh_price_to_fcf(1_000, -10))
        self.assertIsNone(server.fresh_price_to_fcf(1_000, None))

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
