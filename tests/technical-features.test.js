"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { buildTechnicalFeatures, toLegacyTechnicalStructure, HORIZON_CONFIG, _test } = require("../technical-features.js");

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

// Horizon labels are investment windows, not candle intervals.
assert.equal(HORIZON_CONFIG.short.label, "1–30 days");
assert.equal(HORIZON_CONFIG.medium.label, "1–6 months");
assert.equal(HORIZON_CONFIG.long.label, "> 6 months");

// Interval/period identity and timeframe isolation.
const rsi4h = features.horizons.short.momentum.rsi.rsi_6_4h;
const rsi1h = features.horizons.short.momentum.rsi.rsi_6_1h;
assert.equal(rsi4h.interval, "4h");
assert.equal(rsi4h.period, 6);
assert.equal(rsi1h.interval, "1h");
assert.notEqual(rsi1h.last_bar_timestamp, daily.timestamps.at(-1));
assert.equal(features.horizons.medium.momentum.rsi.rsi_14_1d.period, 14);
assert.equal(features.horizons.long.momentum.rsi.rsi_21_1w.interval, "1w");
assert.equal(features.horizons.long.momentum.rsi.rsi_21_1w.period, 21);

// MA types stay explicit, and MACD keeps the correct primary interval per horizon.
const shortEma = features.horizons.short.trend.moving_averages.ema_9_4h;
const mediumEma = features.horizons.medium.trend.moving_averages.ema_20_1d;
const mediumSma = features.horizons.medium.trend.moving_averages.sma_100_1d;
const longSma = features.horizons.long.trend.moving_averages.sma_200_1d;
assert.equal(shortEma.indicator, "ema");
assert.equal(shortEma.interval, "4h");
assert.equal(mediumEma.indicator, "ema");
assert.equal(mediumSma.indicator, "sma");
assert.equal(mediumSma.period, 100);
assert.equal(longSma.indicator, "sma");
assert.equal(longSma.period, 200);
assert(Number.isFinite(shortEma.value));
assert(Number.isFinite(features.horizons.medium.momentum.macd.macd_1d.macd_line));
assert(Number.isFinite(features.horizons.medium.momentum.macd.macd_1d.histogram));
assert.equal(features.horizons.short.momentum.macd.macd_4h.interval, "4h");
assert.equal(features.horizons.medium.momentum.macd.macd_1d.interval, "1d");
assert.equal(features.horizons.long.momentum.macd.macd_1w.interval, "1w");
assert.equal(features.horizons.long.momentum.macd.macd_1w.period, "12/26/9");
assert.equal(features.horizons.short.momentum.kdj.kdj_9_4h.interval, "4h");
assert.equal(features.horizons.medium.momentum.kdj.kdj_9_1d.interval, "1d");

// ATR% is the normalized primary volatility value, with raw ATR retained internally.
const atr = features.horizons.medium.volatility.atr.atr_14_1d;
assert(Math.abs(atr.atr_pct - (atr.value / price * 100)) < 1e-10);
assert(Number.isFinite(atr.value));
assert.equal(atr.interval, "1d");
assert.equal(atr.period, 14);

// RVOL is calculated once from the canonical current-volume / average-volume formula.
for (const period of [5, 20, 60]) {
  const expected = daily.volumes.at(-1) / (daily.volumes.slice(-period).reduce((sum, value) => sum + value, 0) / period);
  assert(Math.abs(features.volume.relative_volume[`rvol_${period}d`] - expected) < 1e-12);
}
assert.equal(features.volume.relative_volume.state, "high");
const legacy = toLegacyTechnicalStructure(features);
for (const horizon of ["short_term", "mid_term", "long_term"]) {
  assert.strictEqual(legacy[horizon].volume.volume_ratio_5d, features.volume.relative_volume.rvol_5d);
  assert.strictEqual(legacy[horizon].volume.volume_ratio_20d, features.volume.relative_volume.rvol_20d);
  assert.strictEqual(legacy[horizon].volume.volume_ratio_60d, features.volume.relative_volume.rvol_60d);
}

// OBV is one canonical family; its 5D/20D/60D views are child context.
assert.equal(features.volume.obv.interval, "1d");
assert(Number.isFinite(features.volume.obv.raw_value));
assert.equal(features.volume.obv.trends.d5.trend, "rising");
assert.equal(features.volume.obv.trends.d20.trend, "rising");
assert.equal(features.volume.obv.trends.d60.trend, "rising");

// All relative-strength series remain available while each horizon selects one primary lookback.
assert.equal(features.horizons.short.relative_strength.primary_lookback_days, 20);
assert.equal(features.horizons.medium.relative_strength.primary_lookback_days, 60);
assert.equal(features.horizons.long.relative_strength.primary_lookback_days, 120);
assert.equal(features.horizons.short.relative_strength.returns.stock_20d, 4);
assert.equal(features.horizons.medium.relative_strength.vs_spy.d60, 6);
assert.equal(features.horizons.long.relative_strength.vs_qqq.d120, 6);

// 52-week and ATH calculations retain the correct historical windows.
assert.equal(features.price_position.high_52w, Math.max(...daily.highs.slice(-252)));
assert.equal(features.price_position.low_52w, Math.min(...daily.lows.slice(-252)));
assert.equal(features.price_position.all_time_high, 250);
assert(features.price_position.distance_to_ath_pct < 0);
assert(features.price_position.position_52w_pct >= 0 && features.price_position.position_52w_pct <= 100);

// Gap and canonical market-breadth payloads are intentionally absent.
assert.equal(Object.hasOwn(features, "gaps"), false);
assert.equal(Object.hasOwn(features, "market_" + "breadth"), false);

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
assert.equal(noIntraday.horizons.short.momentum.macd.macd_4h.macd_line, null);
assert.equal(noIntraday.horizons.short.trend.moving_averages.ema_50_4h.value, null);
assert(Number.isFinite(noIntraday.horizons.medium.trend.moving_averages.ema_50_1d.value));

// User-facing UI no longer exposes a source-interval block, Gap, breadth, or old horizons.
const mainSource = fs.readFileSync(path.join(__dirname, "..", "main.js"), "utf8");
for (const forbidden of ["30" + "-90 days", "90" + "-180 days", "30" + "-90D", "90" + "-180D", "30" + "-90天", "90" + "-180天", "1" + "-10D", "10" + "-30D", "30" + "-60D risk review", "Source intervals / " + "latest bars", "数据源周期 / " + "最新K线", "Daily " + "gap", "日线" + "跳空", "Market " + "breadth", "市场" + "广度"]) {
  assert.equal(mainSource.includes(forbidden), false, `obsolete UI string remains: ${forbidden}`);
}
assert(mainSource.includes('title: "ATR%"'));
assert(mainSource.includes("renderCanonicalTechnicalIndicators"));
assert(mainSource.includes("renderCanonicalVolume"));
assert(mainSource.includes("Horizon OBV"));
assert.equal(mainSource.includes("renderTechnicalIndicatorStructure("), false);
assert.equal(mainSource.includes("renderGapDownRiskCard("), false);

// Presentation uses the canonical primary timeframe only; it never falls back
// to another interval when the configured primary feature is unavailable.
for (const forbiddenFallback of [
  '|| Object.values(horizon.momentum?.macd || {})[0]',
  '|| Object.values(horizon.volatility?.atr || {})[0]',
  '|| Object.values(horizon.trend?.adx || {})[0]',
  '|| Object.values(horizon.volatility?.bollinger || {})[0]',
  '|| Object.values(horizon.momentum?.kdj || {})[0]',
  '|| rsiFeatures[0] ||',
]) assert.equal(mainSource.includes(forbiddenFallback), false, `UI fallback remains: ${forbiddenFallback}`);
assert(mainSource.includes('PRIMARY · ${rs.primary_lookback_days'));
assert(mainSource.includes('contextLabel: currentLanguage === "zh" ? "背景数据" : "CONTEXT"'));
assert(mainSource.includes('const rvolValue = (value) => displayValue(value, (entry) => Number(entry).toFixed(2));'));
assert(mainSource.includes('RVOL20 ${rvolValue(rvol.rvol_20d)} · ${displayFeatureState(rvol.state)}'));

console.log("technical-features.test.js: all assertions passed");
