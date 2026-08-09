import unittest

import pandas as pd

import server


class ServerAvailabilityTests(unittest.TestCase):
    def test_old_intraday_lookback_cache_is_refreshed(self):
        old_cache = {
            "cache_age_seconds": 0,
            "quote": {"history": {"intervals": {"1h": {"lookback": "30d"}}}},
        }
        current_cache = {
            "cache_age_seconds": 0,
            "quote": {"history": {"intervals": {"1h": {"lookback": server.TECHNICAL_INTRADAY_HISTORY_PERIOD}}}},
        }

        self.assertFalse(server.is_market_cache_fresh(old_cache))
        self.assertTrue(server.is_market_cache_fresh(current_cache))

    def test_history_payload_only_drops_required_ohlcv_nulls(self):
        frame = pd.DataFrame(
            {
                "Open": [10.0, 11.0],
                "High": [11.0, 12.0],
                "Low": [9.0, 10.0],
                "Close": [10.5, 11.5],
                "Volume": [100, 200],
                # Optional provider data must not remove otherwise valid OHLCV.
                "Adj Close": [None, None],
            },
            index=pd.date_range("2026-01-01", periods=2, freq="D"),
        )

        payload = server._history_payload(frame)

        self.assertTrue(payload["available"])
        self.assertEqual(payload["availability"], "available")
        self.assertEqual(payload["available_bars"], 2)
        self.assertEqual(payload["excluded_invalid_rows"], 0)

    def test_yahoo_frame_never_substitutes_missing_ohlcv(self):
        original = server.fetch_yahoo_chart_rows
        try:
            server.fetch_yahoo_chart_rows = lambda *args, **kwargs: [
                {"datetime": pd.Timestamp("2026-01-01T09:30:00Z"), "open": 10.0, "high": 11.0, "low": 9.0, "close": 10.5, "volume": 100},
                {"datetime": pd.Timestamp("2026-01-01T10:30:00Z"), "open": 10.5, "high": None, "low": 10.0, "close": 10.75, "volume": None},
            ]

            frame = server.fetch_yahoo_chart_frame("META", range_value="120d", interval="1h", limit=6000)

            self.assertEqual(len(frame), 1)
            self.assertEqual(float(frame.iloc[0]["Open"]), 10.0)
            self.assertEqual(int(frame.iloc[0]["Volume"]), 100)
        finally:
            server.fetch_yahoo_chart_rows = original

    def test_stooq_frame_never_substitutes_missing_ohlcv(self):
        original = server.fetch_stooq_history_rows
        try:
            server.fetch_stooq_history_rows = lambda *args, **kwargs: [
                {"datetime": pd.Timestamp("2026-01-01T00:00:00Z"), "open": 10.0, "high": 11.0, "low": 9.0, "close": 10.5, "volume": 100},
                {"datetime": pd.Timestamp("2026-01-02T00:00:00Z"), "open": None, "high": 12.0, "low": 10.0, "close": 11.5, "volume": None},
            ]

            frame = server.fetch_stooq_chart_frame("META", limit=260)

            self.assertEqual(len(frame), 1)
            self.assertEqual(float(frame.iloc[0]["Close"]), 10.5)
        finally:
            server.fetch_stooq_history_rows = original


if __name__ == "__main__":
    unittest.main()
