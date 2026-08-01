import unittest

from financial_freshness import (
    build_sec_normalized_report,
    determine_freshness,
    derive_standalone_quarter,
    financial_semantics,
    latest_official_filing,
    official_release_period_end,
    parse_official_earnings_release,
    preserve_cached_statement,
    price_to_fcf,
    select_source,
    source_conflicts,
)


class FinancialFreshnessTests(unittest.TestCase):
    def test_stale_period_selects_fallback_after_released_filing(self):
        filing = {"form": "10-Q", "reportDate": "2026-06-30", "filingDate": "2026-08-01"}
        freshness = determine_freshness("2026-03-31", "2026-08-01T00:00:00Z", {"eventDate": "2026-07-31", "reportReleased": True}, filing)
        self.assertEqual(freshness["status"], "released_primary_source_pending")
        self.assertTrue(freshness["primary_source_is_older"])

    def test_awaiting_release_is_not_called_stale(self):
        freshness = determine_freshness("2026-03-31", None, {"eventDate": "2026-08-15", "reportReleased": False}, None)
        self.assertEqual(freshness["status"], "awaiting_release")

    def test_ytd_cashflow_derives_standalone_quarter(self):
        rows = [
            {"start": "2026-01-01", "end": "2026-06-30", "val": 110, "accn": "new", "form": "10-Q"},
            {"start": "2026-01-01", "end": "2026-03-31", "val": 40, "accn": "old", "form": "10-Q"},
        ]
        result = derive_standalone_quarter(rows, "2026-06-30", {"accessionNumber": "new", "form": "10-Q"})
        self.assertEqual(result["value"], 70)
        self.assertEqual(result["method"], "derived_ytd_minus_prior_ytd")

    def test_ttm_rebuilds_from_four_standalone_quarters(self):
        facts = {"facts": {"us-gaap": {
            "Revenues": {"units": {"USD": [
                {"start": "2026-04-01", "end": "2026-06-30", "val": 130, "form": "10-Q", "accn": "q2", "filed": "2026-08-01"},
                {"start": "2026-01-01", "end": "2026-03-31", "val": 120, "form": "10-Q", "accn": "q1", "filed": "2026-05-01"},
                {"start": "2025-10-01", "end": "2025-12-31", "val": 110, "form": "10-K", "accn": "k", "filed": "2026-02-01"},
                {"start": "2025-07-01", "end": "2025-09-30", "val": 100, "form": "10-Q", "accn": "q3", "filed": "2025-11-01"},
            ]}},
            "NetCashProvidedByUsedInOperatingActivities": {"units": {"USD": [
                {"start": "2026-01-01", "end": "2026-06-30", "val": 90, "form": "10-Q", "accn": "q2", "filed": "2026-08-01"},
                {"start": "2026-01-01", "end": "2026-03-31", "val": 40, "form": "10-Q", "accn": "q1", "filed": "2026-05-01"},
                {"start": "2025-10-01", "end": "2025-12-31", "val": 30, "form": "10-K", "accn": "k", "filed": "2026-02-01"},
                {"start": "2025-07-01", "end": "2025-09-30", "val": 20, "form": "10-Q", "accn": "q3", "filed": "2025-11-01"},
            ]}},
            "PaymentsToAcquirePropertyPlantAndEquipment": {"units": {"USD": [
                {"start": "2026-01-01", "end": "2026-06-30", "val": 30, "form": "10-Q", "accn": "q2", "filed": "2026-08-01"},
                {"start": "2026-01-01", "end": "2026-03-31", "val": 10, "form": "10-Q", "accn": "q1", "filed": "2026-05-01"},
                {"start": "2025-10-01", "end": "2025-12-31", "val": 8, "form": "10-K", "accn": "k", "filed": "2026-02-01"},
                {"start": "2025-07-01", "end": "2025-09-30", "val": 6, "form": "10-Q", "accn": "q3", "filed": "2025-11-01"},
            ]}},
        }}}
        filing = {"form": "10-Q", "reportDate": "2026-06-30", "filingDate": "2026-08-01", "accessionNumber": "q2", "primaryDocument": "q2.htm"}
        report = build_sec_normalized_report(facts, 1, filing)
        self.assertEqual(report["quarter"]["operating_cash_flow"]["raw_value"], 50)
        self.assertEqual(report["ttm"]["revenue"]["raw_value"], 460)
        self.assertEqual(report["ttm"]["standardized_free_cash_flow"]["raw_value"], 96)

    def test_negative_fcf_has_no_price_to_fcf(self):
        self.assertIsNone(price_to_fcf(1000, -1))
        self.assertEqual(price_to_fcf(1000, 50), 20)

    def test_financial_sector_avoids_ordinary_fcf_semantics(self):
        self.assertEqual(financial_semantics({"sector": "Financial Services", "industry": "Credit Services"})["model"], "financial_company_cash_flow_limited")

    def test_conflict_and_cache_preservation(self):
        self.assertTrue(source_conflicts(100, 102, tolerance=0.01))
        cached = {"fiscal_period_end_date": "2026-06-30"}
        self.assertEqual(preserve_cached_statement(cached, None), cached)

    def test_newer_sec_source_has_priority_but_current_yahoo_is_kept(self):
        fallback = {"fiscal_period_end_date": "2026-06-30"}
        stale = determine_freshness("2026-03-31", None, {"reportReleased": True}, {"reportDate": "2026-06-30"}, True)
        current = determine_freshness("2026-06-30", None, {"reportReleased": True}, {"reportDate": "2026-06-30"})
        self.assertEqual(select_source("2026-03-31", fallback, stale), "sec_edgar")
        self.assertEqual(select_source("2026-06-30", fallback, current), "yahoo_finance")

    def test_latest_official_filing_ignores_non_financial_forms(self):
        submissions = {"filings": {"recent": {"form": ["8-K", "10-Q"], "reportDate": ["", "2026-06-30"], "filingDate": ["2026-08-01", "2026-08-02"]}}}
        self.assertEqual(latest_official_filing(submissions)["reportDate"], "2026-06-30")

    def test_official_release_uses_fiscal_period_not_release_date(self):
        release = """
          <table><tr><th>Three Months Ended June 30</th><th>2026</th></tr>
          <tr><td>Revenue</td><td>$</td><td>60,801</td></tr>
          <tr><td>Net income</td><td>$</td><td>15,848</td></tr></table>
          <p>In millions, except percentages and per share amounts.</p>
        """
        report = parse_official_earnings_release(
            release, 1, {"filingDate": "2026-07-29", "accessionNumber": "x"}, "https://example.test/release",
        )
        self.assertEqual(official_release_period_end("Three Months Ended June 30", "2026-07-29"), "2026-06-30")
        self.assertEqual(report["fiscal_period_end_date"], "2026-06-30")
        self.assertEqual(report["quarter"]["revenue"]["raw_value"], 60_801_000_000)


if __name__ == "__main__":
    unittest.main()
