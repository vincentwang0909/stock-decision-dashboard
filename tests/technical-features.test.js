"use strict";

const assert = require("assert");
const { buildTechnicalFeatures, _test } = require("../technical-features.js");

function dailyHistory(count = 420) {
  const timestamps = []; const opens = []; const highs = []; const lows = []; const closes = []; const volumes = [];
  const start = Date.UTC(2024, 0, 2);
  for (let index = 0; index < count; index += 1) {
    const date = new Date(start + index * 86400000);
    const close = 100 + index * 0.15 + Math.sin(index / 9) * 2;
    const previous = index ? closes[index - 1] : close - 0.4;
    timestamps.push(date.toISOString().slice(0, 10));
    opens.push(index === count - 1 ? previous * 1.02 : close - 0.35);
    closes.push(close);
    highs.push(close + 1.5);
    lows.push(close - 1.25);
    volumes.push(index === count - 1 ? 2_000_000 : 1_000_000 + (index % 7) * 10_000);
  }
  // An ATH outside the 52-week sample proves that ATH uses all supplied data.
  highs[0] = 250;
  return { timestamps, opens, highs, lows, closes, volumes };
}

function hourlyHistory(count = 240) {
  const timestamps = []; const opens = []; const highs = []; const lows = []; const closes = []; const volumes = [];
  const start = Date.UTC(2026, 5, 1, 14, 30);
  for (let index = 0; index < count; index += 1) {
    const close = 180 - index * 0.05 + Math.sin(index / 3);
    timestamps.push(new Date(start + index * 3600000).toISOString());
    opens.push(close + 0.2); closes.push(close); highs.push(close + 0.7); lows.push(close - 0.8); volumes.push(100_000 + index * 50);
  }
  return { timestamps, opens, highs, lows, closes, volumes };
}

function fibonacciFixture(price) {
  const level = (label, ratio, value) => ({ label, ratio, price: value, distance_from_current_pct: (value / price - 1) * 100, valid_for_display: true });
  return {
    short_term: { status: "available", horizon: "short_term", current_price: price, pivot_method: "confirmed daily pivots (2/2)", data_quality: "high", swing_low: 100, swing_low_date: "2026-01-02", swing_high: 130, swing_high_date: "2026-02-02", swing_direction: "up_swing", current_position_label: "between 38.2 and 50.0", retracement_levels: { "38.2": level("38.2%", 38.2, 118.54), "50.0": level("50.0%", 50, 115), "61.8": level("61.8%", 61.8, 111.46) }, extension_levels: { "127.2": level("127.2%", 127.2, 138.16), "161.8": level("161.8%", 161.8, 148.54) } },
    mid_term: { status: "unavailable" },
    long_term: { status: "unavailable" },
  };
}

const daily = dailyHistory();
const hourly = hourlyHistory();
const price = daily.closes.at(-1);
const features = buildTechnicalFeatures({
  history: { ...daily, intervals: { "1h": hourly } },
  currentPrice: price,
  shareBase: 100_000_000,
  relativeStrength: { stock_return_20d: 4, stock_vs_spy_20d: 3, stock_vs_qqq_20d: 1, stock_return_60d: 8, stock_vs_spy_60d: 6, stock_vs_qqq_60d: 4, stock_return_120d: 10, stock_vs_spy_120d: 8, stock_vs_qqq_120d: 6 },
  fibonacciStructure: fibonacciFixture(price),
  calculatedAt: "2026-08-09T00:00:00.000Z",
});

// Interval/period identity and timeframe isolation.
const rsi4h = features.horizons.short.momentum.rsi.rsi_6_4h;
const rsi1h = features.horizons.short.momentum.rsi.rsi_6_1h;
assert.equal(rsi4h.interval, "4h");
assert.equal(rsi4h.period, 6);
assert.equal(rsi1h.interval, "1h");
assert.notEqual(rsi1h.last_bar_timestamp, daily.timestamps.at(-1));
assert.equal(features.horizons.medium.momentum.rsi.rsi_14_1d.period, 14);
assert.equal(features.horizons.long.momentum.rsi.rsi_21_1w.interval, "1w");

// MA/EMA and MACD return raw numerical data, not only textual states.
assert(Number.isFinite(features.horizons.short.trend.moving_averages.ema_9_4h.value));
assert(Number.isFinite(features.horizons.medium.trend.moving_averages.sma_100_1d.value));
assert(Number.isFinite(features.horizons.medium.momentum.macd.macd_1d.macd_line));
assert(Number.isFinite(features.horizons.medium.momentum.macd.macd_1d.histogram));

// ATR% is the normalized volatility feature, and RVOL uses the comparable 20D average.
const atr = features.horizons.medium.volatility.atr.atr_14_1d;
assert(Math.abs(atr.atr_pct - (atr.value / price * 100)) < 1e-10);
assert(Math.abs(features.volume.relative_volume.rvol_20d - (daily.volumes.at(-1) / daily.volumes.slice(-20).reduce((sum, value) => sum + value, 0) * 20)) < 1e-12);
assert.equal(features.volume.relative_volume.state, "high");

// 52-week and ATH calculations retain the correct historical windows.
assert.equal(features.price_position.high_52w, Math.max(...daily.highs.slice(-252)));
assert.equal(features.price_position.low_52w, Math.min(...daily.lows.slice(-252)));
assert.equal(features.price_position.all_time_high, 250);
assert(features.price_position.distance_to_ath_pct < 0);
assert(features.price_position.position_52w_pct >= 0 && features.price_position.position_52w_pct <= 100);

// Daily open vs prior daily close is the canonical gap definition.
assert.equal(features.gaps.gap_direction, "gap_up");
assert(Math.abs(features.gaps.gap_pct - 2) < 1e-10);

// Fibonacci keeps separately supplied confirmed anchors and normalized fields.
assert.equal(features.fibonacci.short.anchor_low, 100);
assert.equal(features.fibonacci.short.anchor_method, "confirmed daily pivots (2/2)");
assert(features.fibonacci.short.nearest_fib_level);

// Missing bars never become numeric zero, and insufficient history remains explicit.
const unavailable = buildTechnicalFeatures({ history: { closes: [1], highs: [1], lows: [1], volumes: [0], opens: [1], timestamps: ["2026-01-01"] }, currentPrice: 1 });
assert.equal(unavailable.horizons.medium.momentum.rsi.rsi_14_1d.value, null);
assert.equal(unavailable.volume.current_volume, 0);
assert.equal(unavailable.price_position.position_52w_pct, null);

// A 4H source is only produced from 1H bars; daily data is never substituted.
const noIntraday = buildTechnicalFeatures({ history: daily, currentPrice: price });
assert.equal(noIntraday.source_intervals["1h"].availability, "unavailable");
assert.equal(noIntraday.horizons.short.momentum.rsi.rsi_6_4h.value, null);

// Low-level helpers protect against zero ranges and produce no hidden divide-by-zero values.
assert.equal(_test.gapFeatures([{ open: 10, high: 10, low: 10, close: 10 }, { open: 10, high: 10, low: 10, close: 10 }]).gap_fill_pct, 100);

console.log("technical-features.test.js: all assertions passed");
