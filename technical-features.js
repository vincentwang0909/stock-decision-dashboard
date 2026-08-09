/*
 * Canonical technical feature layer.
 *
 * This file deliberately has no scoring or recommendation code. It converts
 * raw OHLCV histories into horizon-aware, machine-readable technical features
 * and provides a read-only compatibility adapter for the legacy dashboard.
 */
(function exposeCanonicalTechnicalFeatures(root) {
  "use strict";

  const SCHEMA_VERSION = "technical-features-v1";
  const RVOL_THRESHOLDS = Object.freeze([
    [0.6, "very_low"], [0.8, "low"], [1.2, "normal"], [1.5, "elevated"], [2.0, "high"], [Infinity, "extreme"],
  ]);
  const HORIZON_CONFIG = Object.freeze({
    short: {
      label: "1–30 days",
      primary_intervals: ["1h", "4h"],
      supporting_intervals: ["1d"],
      ema: { "1h": [9, 20], "4h": [9, 20, 50] },
      rsi: { "1h": [6], "4h": [6, 14] },
      macd: { "1h": [12, 26, 9], "4h": [12, 26, 9] },
      adx: { "4h": 14 },
      atr: { "4h": 14 },
      kdj: { "1h": 9, "4h": 9 },
      bollinger: { "4h": [20, 2] },
      obv: { "4h": 12 },
      fibonacci_horizon: "short_term",
    },
    medium: {
      label: "1–6 months",
      primary_intervals: ["1d"],
      supporting_intervals: ["4h", "1w"],
      ema: { "1d": [20, 50], "4h": [20, 50] },
      sma: { "1d": [100] },
      rsi: { "1d": [14], "4h": [14] },
      macd: { "1d": [12, 26, 9] },
      adx: { "1d": 14 },
      atr: { "1d": 14 },
      kdj: { "1d": 9 },
      bollinger: { "1d": [20, 2] },
      obv: { "1d": 20 },
      fibonacci_horizon: "mid_term",
    },
    long: {
      label: "> 6 months",
      primary_intervals: ["1w"],
      supporting_intervals: ["1d"],
      sma: { "1d": [50, 100, 200] },
      rsi: { "1w": [21], "1d": [21] },
      macd: { "1w": [12, 26, 9], "1d": [12, 26, 9] },
      adx: { "1w": 14 },
      atr: { "1w": 14 },
      bollinger: { "1w": [20, 2] },
      obv: { "1w": 12 },
      fibonacci_horizon: "long_term",
    },
  });

  const finite = (value) => Number.isFinite(Number(value)) ? Number(value) : null;
  const mean = (values) => {
    const valid = values.filter(Number.isFinite);
    return valid.length ? valid.reduce((sum, value) => sum + value, 0) / valid.length : null;
  };
  const standardDeviation = (values) => {
    const average = mean(values);
    return average == null ? null : Math.sqrt(mean(values.filter(Number.isFinite).map((value) => (value - average) ** 2)) || 0);
  };
  const timestampNow = () => new Date().toISOString();
  const stateFromRvol = (value) => value == null ? "unavailable" : RVOL_THRESHOLDS.find(([limit]) => value < limit)?.[1] || "unavailable";
  const last = (values) => values.length ? values[values.length - 1] : null;
  const valueAgo = (values, bars) => values.length > bars ? values[values.length - 1 - bars] : null;

  function normalizeBars(source = {}) {
    const closes = Array.isArray(source.closes) ? source.closes : [];
    const highs = Array.isArray(source.highs) ? source.highs : [];
    const lows = Array.isArray(source.lows) ? source.lows : [];
    const opens = Array.isArray(source.opens) ? source.opens : [];
    const volumes = Array.isArray(source.volumes) ? source.volumes : [];
    const timestamps = Array.isArray(source.timestamps) ? source.timestamps : (Array.isArray(source.dates) ? source.dates : []);
    const length = Math.min(closes.length, highs.length, lows.length);
    const bars = [];
    for (let index = 0; index < length; index += 1) {
      const close = finite(closes[index]);
      const high = finite(highs[index]);
      const low = finite(lows[index]);
      if (close == null || high == null || low == null || high < low) continue;
      bars.push({
        open: finite(opens[index]) ?? close,
        high,
        low,
        close,
        volume: finite(volumes[index]),
        timestamp: timestamps[index] ?? null,
      });
    }
    return bars;
  }

  function barsToSeries(bars = []) {
    return {
      opens: bars.map((bar) => bar.open),
      highs: bars.map((bar) => bar.high),
      lows: bars.map((bar) => bar.low),
      closes: bars.map((bar) => bar.close),
      volumes: bars.map((bar) => bar.volume),
      timestamps: bars.map((bar) => bar.timestamp),
    };
  }

  function pickBars(history = {}, interval) {
    const intervals = history.intervals || history.by_interval || {};
    if (interval === "1d") return normalizeBars(intervals["1d"] || history.full_daily || history.daily || history);
    if (interval === "1h") return normalizeBars(intervals["1h"] || intervals.hourly || {});
    return [];
  }

  // Yahoo does not offer 4H equity candles. These are derived only from four
  // consecutive regular-session 1H bars and never substituted with daily bars.
  function aggregateFourHourBars(hourlyBars = []) {
    const grouped = [];
    let bucket = null;
    let bucketDay = null;
    let count = 0;
    // Incomplete session buckets are intentionally discarded. A partial 4H
    // candle must not masquerade as a completed feature input.
    const push = () => { if (bucket && count === 4) grouped.push(bucket); bucket = null; count = 0; };
    hourlyBars.forEach((bar) => {
      const day = typeof bar.timestamp === "string" ? bar.timestamp.slice(0, 10) : null;
      if (bucket && day !== bucketDay) push();
      if (!bucket) {
        bucketDay = day;
        bucket = { ...bar, volume: Number.isFinite(bar.volume) ? bar.volume : null };
        count = 1;
      } else {
        bucket.high = Math.max(bucket.high, bar.high);
        bucket.low = Math.min(bucket.low, bar.low);
        bucket.close = bar.close;
        bucket.timestamp = bar.timestamp;
        bucket.volume = Number.isFinite(bucket.volume) && Number.isFinite(bar.volume) ? bucket.volume + bar.volume : null;
        count += 1;
      }
      if (count === 4) push();
    });
    push();
    return grouped;
  }

  function completedWeeklyBars(dailyBars = []) {
    const result = [];
    let current = null;
    let currentKey = null;
    const dateKey = (timestamp, index) => {
      const date = new Date(timestamp);
      if (Number.isNaN(date.getTime())) return `fallback-${Math.floor(index / 5)}`;
      const monday = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() - ((date.getUTCDay() + 6) % 7)));
      return monday.toISOString().slice(0, 10);
    };
    const push = () => { if (current) result.push(current); current = null; };
    dailyBars.forEach((bar, index) => {
      const key = dateKey(bar.timestamp, index);
      if (current && key !== currentKey) push();
      if (!current) {
        currentKey = key;
        current = { ...bar, volume: Number.isFinite(bar.volume) ? bar.volume : null, week_key: key, last_day: new Date(bar.timestamp).getUTCDay() };
      } else {
        current.high = Math.max(current.high, bar.high);
        current.low = Math.min(current.low, bar.low);
        current.close = bar.close;
        current.timestamp = bar.timestamp;
        current.last_day = new Date(bar.timestamp).getUTCDay();
        current.volume = Number.isFinite(current.volume) && Number.isFinite(bar.volume) ? current.volume + bar.volume : null;
      }
    });
    push();
    // Model features use completed weekly candles. A final Mon-Thu partial bar
    // stays unavailable rather than being treated as a completed weekly signal.
    if (result.length && Number.isFinite(result[result.length - 1].last_day) && result[result.length - 1].last_day < 5) result.pop();
    return result.map(({ last_day, week_key, ...bar }) => bar);
  }

  function emaSeries(values, period) {
    const result = new Array(values.length).fill(null);
    if (!Number.isInteger(period) || period <= 0 || values.length < period) return result;
    const seed = mean(values.slice(0, period));
    if (seed == null) return result;
    const multiplier = 2 / (period + 1);
    let previous = seed;
    result[period - 1] = seed;
    for (let index = period; index < values.length; index += 1) {
      if (!Number.isFinite(values[index])) continue;
      previous = (values[index] - previous) * multiplier + previous;
      result[index] = previous;
    }
    return result;
  }

  function smaSeries(values, period) {
    return values.map((_, index) => index + 1 < period ? null : mean(values.slice(index - period + 1, index + 1)));
  }

  function rsiSeries(values, period) {
    const result = new Array(values.length).fill(null);
    if (values.length <= period) return result;
    let gain = 0;
    let loss = 0;
    for (let index = 1; index <= period; index += 1) {
      const delta = values[index] - values[index - 1];
      gain += Math.max(delta, 0);
      loss += Math.max(-delta, 0);
    }
    gain /= period;
    loss /= period;
    result[period] = loss === 0 ? 100 : 100 - (100 / (1 + gain / loss));
    for (let index = period + 1; index < values.length; index += 1) {
      const delta = values[index] - values[index - 1];
      gain = ((gain * (period - 1)) + Math.max(delta, 0)) / period;
      loss = ((loss * (period - 1)) + Math.max(-delta, 0)) / period;
      result[index] = loss === 0 ? 100 : 100 - (100 / (1 + gain / loss));
    }
    return result;
  }

  function atrSeries(bars, period) {
    const ranges = bars.map((bar, index) => index === 0 ? bar.high - bar.low : Math.max(bar.high - bar.low, Math.abs(bar.high - bars[index - 1].close), Math.abs(bar.low - bars[index - 1].close)));
    const result = new Array(bars.length).fill(null);
    if (ranges.length < period) return result;
    let running = mean(ranges.slice(0, period));
    result[period - 1] = running;
    for (let index = period; index < ranges.length; index += 1) {
      running = ((running * (period - 1)) + ranges[index]) / period;
      result[index] = running;
    }
    return result;
  }

  function metadata({ indicator, interval, period = null, lookback = null, bars = [], source = null, calculatedAt }) {
    return {
      indicator,
      interval,
      period,
      lookback,
      availability: bars.length ? "available" : "unavailable",
      source: source || (interval === "4h" ? "derived_1h_regular_session" : interval === "1w" ? "completed_weekly_from_daily" : "market_ohlcv"),
      last_bar_timestamp: last(bars)?.timestamp ?? null,
      calculation_timestamp: calculatedAt,
      bar_count: bars.length,
    };
  }

  function unavailableFeature(args = {}) {
    return { value: null, state: "unavailable", ...metadata({ ...args, bars: args.bars || [] }), availability: "unavailable" };
  }

  function slopeState(series, bars = 3) {
    const value = last(series);
    const prior = valueAgo(series, bars);
    if (!Number.isFinite(value) || !Number.isFinite(prior)) return { value: null, state: "unavailable", change: null, bars };
    const change = value - prior;
    return { value: change, change, state: change > 0 ? "rising" : change < 0 ? "falling" : "flat", bars };
  }

  function movingAverageFeature(bars, interval, period, type, currentPrice, calculatedAt) {
    const closes = bars.map((bar) => bar.close);
    const series = type === "ema" ? emaSeries(closes, period) : smaSeries(closes, period);
    const value = last(series);
    if (!Number.isFinite(value)) return unavailableFeature({ indicator: type, interval, period, lookback: period, bars, calculatedAt });
    const distancePct = Number.isFinite(currentPrice) && value !== 0 ? ((currentPrice / value) - 1) * 100 : null;
    return {
      value,
      price_distance_pct: distancePct,
      price_state: distancePct == null ? "unavailable" : distancePct > 0 ? "above" : distancePct < 0 ? "below" : "at",
      slope: slopeState(series, Math.min(5, Math.max(1, Math.floor(period / 4)))),
      series,
      ...metadata({ indicator: type, interval, period, lookback: period, bars, calculatedAt }),
    };
  }

  function movingAverageStructure(features = []) {
    const valid = features.filter((feature) => Number.isFinite(feature?.value));
    if (valid.length < 2) return { alignment: "unavailable", compression_state: "unavailable", expansion_state: null, price_vs: {} };
    const values = valid.map((feature) => feature.value);
    const descending = values.every((value, index) => index === 0 || values[index - 1] > value);
    const ascending = values.every((value, index) => index === 0 || values[index - 1] < value);
    const slopes = valid.map((feature) => feature.slope?.state);
    const alignment = descending && slopes.every((state) => state === "rising") ? "strong_bullish"
      : descending ? "bullish"
        : ascending && slopes.every((state) => state === "falling") ? "strong_bearish"
          : ascending ? "bearish" : "mixed";
    const spreadPct = Math.abs((Math.max(...values) - Math.min(...values)) / mean(values)) * 100;
    const priorValues = valid.map((feature) => valueAgo(feature.series || [], 5)).filter(Number.isFinite);
    const priorSpread = priorValues.length === valid.length ? Math.abs((Math.max(...priorValues) - Math.min(...priorValues)) / mean(priorValues)) * 100 : null;
    const compressionState = spreadPct <= 1 ? "tight" : priorSpread != null && spreadPct < priorSpread * 0.85 ? "compressing" : priorSpread != null && spreadPct > priorSpread * 1.15 ? "expanding" : "normal";
    return {
      alignment,
      average_spread_pct: spreadPct,
      compression_state: compressionState,
      expansion_state: compressionState === "expanding",
      price_vs: Object.fromEntries(valid.map((feature) => [`${feature.indicator}${feature.period}`, feature.price_distance_pct])),
    };
  }

  function rsiFeature(bars, interval, period, calculatedAt) {
    const series = rsiSeries(bars.map((bar) => bar.close), period);
    const value = last(series);
    if (!Number.isFinite(value)) return unavailableFeature({ indicator: "rsi", interval, period, lookback: period + 1, bars, calculatedAt });
    const state = value <= 20 ? "extreme_oversold" : value <= 30 ? "oversold" : value < 45 ? "weak" : value < 55 ? "neutral" : value < 70 ? "strong" : value < 80 ? "overbought" : "extreme_overbought";
    const slope = slopeState(series, 3);
    const sample = series.filter(Number.isFinite).slice(-12);
    const closeSample = bars.slice(-sample.length).map((bar) => bar.close);
    const divergence = sample.length >= 8 && Math.max(...closeSample.slice(-6)) > Math.max(...closeSample.slice(0, -6)) && Math.max(...sample.slice(-6)) < Math.max(...sample.slice(0, -6))
      ? "bearish_divergence" : sample.length >= 8 && Math.min(...closeSample.slice(-6)) < Math.min(...closeSample.slice(0, -6)) && Math.min(...sample.slice(-6)) > Math.min(...sample.slice(0, -6))
        ? "bullish_divergence" : "none";
    return { value, state, overbought: value >= 70, oversold: value <= 30, slope, divergence, series, ...metadata({ indicator: "rsi", interval, period, lookback: period + 1, bars, calculatedAt }) };
  }

  function macdFeature(bars, interval, parameters, calculatedAt) {
    const [fast, slow, signal] = parameters;
    const closes = bars.map((bar) => bar.close);
    if (closes.length < slow + signal) return unavailableFeature({ indicator: "macd", interval, period: `${fast}/${slow}/${signal}`, lookback: slow + signal, bars, calculatedAt });
    const fastSeries = emaSeries(closes, fast);
    const slowSeries = emaSeries(closes, slow);
    const macdSeries = closes.map((_, index) => Number.isFinite(fastSeries[index]) && Number.isFinite(slowSeries[index]) ? fastSeries[index] - slowSeries[index] : null);
    const signalInput = macdSeries.map((value) => Number.isFinite(value) ? value : 0);
    const signalSeries = emaSeries(signalInput, signal);
    const histogramSeries = macdSeries.map((value, index) => Number.isFinite(value) && Number.isFinite(signalSeries[index]) ? value - signalSeries[index] : null);
    const histogram = last(histogramSeries);
    const macd = last(macdSeries);
    const signalLine = last(signalSeries);
    let crossoverState = "none";
    for (let index = histogramSeries.length - 1; index > 0; index -= 1) {
      if (!Number.isFinite(histogramSeries[index]) || !Number.isFinite(histogramSeries[index - 1])) continue;
      if ((histogramSeries[index] >= 0) !== (histogramSeries[index - 1] >= 0)) { crossoverState = histogramSeries[index] >= 0 ? "bullish_cross" : "bearish_cross"; break; }
    }
    const histogramSlope = slopeState(histogramSeries, 3);
    const state = histogram > 0 && histogramSlope.change > 0 ? "accelerating_bullish"
      : histogram > 0 ? "decelerating_bullish"
        : histogramSlope.change > 0 ? "recovering_bearish" : "accelerating_bearish";
    return {
      macd_line: macd,
      signal_line: signalLine,
      histogram,
      histogram_change_1: Number.isFinite(histogram) && Number.isFinite(valueAgo(histogramSeries, 1)) ? histogram - valueAgo(histogramSeries, 1) : null,
      histogram_change_3: Number.isFinite(histogram) && Number.isFinite(valueAgo(histogramSeries, 3)) ? histogram - valueAgo(histogramSeries, 3) : null,
      histogram_change_5: Number.isFinite(histogram) && Number.isFinite(valueAgo(histogramSeries, 5)) ? histogram - valueAgo(histogramSeries, 5) : null,
      histogram_slope: histogramSlope,
      crossover_state: crossoverState,
      above_or_below_zero: macd > 0 ? "above_zero" : macd < 0 ? "below_zero" : "at_zero",
      improving_or_deteriorating: histogramSlope.state === "rising" ? "improving" : histogramSlope.state === "falling" ? "deteriorating" : histogramSlope.state,
      state,
      macd_series: macdSeries,
      signal_series: signalSeries,
      histogram_series: histogramSeries,
      ...metadata({ indicator: "macd", interval, period: `${fast}/${slow}/${signal}`, lookback: slow + signal, bars, calculatedAt }),
    };
  }

  function adxFeature(bars, interval, period, calculatedAt) {
    if (bars.length < period * 2 + 1) return unavailableFeature({ indicator: "adx", interval, period, lookback: period * 2 + 1, bars, calculatedAt });
    const tr = []; const plusDm = []; const minusDm = [];
    for (let index = 1; index < bars.length; index += 1) {
      const up = bars[index].high - bars[index - 1].high;
      const down = bars[index - 1].low - bars[index].low;
      tr.push(Math.max(bars[index].high - bars[index].low, Math.abs(bars[index].high - bars[index - 1].close), Math.abs(bars[index].low - bars[index - 1].close)));
      plusDm.push(up > down && up > 0 ? up : 0);
      minusDm.push(down > up && down > 0 ? down : 0);
    }
    const plus = []; const minus = []; const dx = [];
    for (let index = period - 1; index < tr.length; index += 1) {
      const averageTr = mean(tr.slice(index - period + 1, index + 1));
      const plusDi = averageTr ? 100 * mean(plusDm.slice(index - period + 1, index + 1)) / averageTr : null;
      const minusDi = averageTr ? 100 * mean(minusDm.slice(index - period + 1, index + 1)) / averageTr : null;
      plus.push(plusDi); minus.push(minusDi);
      dx.push(Number.isFinite(plusDi) && Number.isFinite(minusDi) && plusDi + minusDi ? 100 * Math.abs(plusDi - minusDi) / (plusDi + minusDi) : null);
    }
    const adxValues = smaSeries(dx, period);
    const adx = last(adxValues); const plusDi = last(plus); const minusDi = last(minus);
    const trendStrength = adx < 15 ? "no_trend" : adx < 22 ? "weak" : adx < 30 ? "developing" : adx < 40 ? "strong" : "very_strong";
    return { adx, plus_di: plusDi, minus_di: minusDi, trend_strength: trendStrength, directional_bias: plusDi > minusDi ? "bullish" : minusDi > plusDi ? "bearish" : "neutral", slope: slopeState(adxValues, 3), ...metadata({ indicator: "adx", interval, period, lookback: period * 2 + 1, bars, calculatedAt }) };
  }

  function atrFeature(bars, interval, period, calculatedAt) {
    const series = atrSeries(bars, period);
    const value = last(series);
    const price = last(bars)?.close;
    if (!Number.isFinite(value) || !Number.isFinite(price) || price <= 0) return unavailableFeature({ indicator: "atr", interval, period, lookback: period, bars, calculatedAt });
    const atrPct = value / price * 100;
    const pctSeries = series.map((entry, index) => Number.isFinite(entry) && bars[index]?.close > 0 ? entry / bars[index].close * 100 : null).filter(Number.isFinite);
    const percentile = (window) => pctSeries.length >= window ? pctSeries.slice(-window).filter((entry) => entry <= atrPct).length / window * 100 : null;
    const percentileValue = percentile(60) ?? percentile(120) ?? percentile(250);
    const state = percentileValue == null ? "unavailable" : percentileValue <= 20 ? "low" : percentileValue <= 70 ? "normal" : percentileValue <= 88 ? "elevated" : "extreme";
    const slope = slopeState(pctSeries, Math.min(5, Math.max(1, Math.floor(pctSeries.length / 8))));
    return { value, atr_pct: atrPct, atr_percentile_pct: percentileValue, atr_percentile_60: percentile(60), atr_percentile_120: percentile(120), atr_percentile_250: percentile(250), volatility_regime: state, expansion_state: slope.state === "rising" ? "expanding" : slope.state === "falling" ? "contracting" : slope.state, slope, series, ...metadata({ indicator: "atr", interval, period, lookback: period, bars, calculatedAt }) };
  }

  function kdjFeature(bars, interval, period, calculatedAt) {
    if (bars.length < period + 3) return unavailableFeature({ indicator: "kdj", interval, period, lookback: period, bars, calculatedAt });
    const kSeries = []; const dSeries = []; const jSeries = [];
    let k = 50; let d = 50;
    bars.forEach((bar, index) => {
      if (index + 1 < period) { kSeries.push(null); dSeries.push(null); jSeries.push(null); return; }
      const sample = bars.slice(index - period + 1, index + 1);
      const high = Math.max(...sample.map((item) => item.high)); const low = Math.min(...sample.map((item) => item.low));
      const rsv = high === low ? 50 : (bar.close - low) / (high - low) * 100;
      k = 2 / 3 * k + 1 / 3 * rsv; d = 2 / 3 * d + 1 / 3 * k;
      kSeries.push(k); dSeries.push(d); jSeries.push(3 * k - 2 * d);
    });
    const kValue = last(kSeries); const dValue = last(dSeries); const jValue = last(jSeries);
    const previousK = valueAgo(kSeries, 1); const previousD = valueAgo(dSeries, 1);
    const crossover = Number.isFinite(previousK) && Number.isFinite(previousD) && (kValue >= dValue) !== (previousK >= previousD) ? kValue > dValue ? "bullish_cross" : "bearish_cross" : "none";
    return { k: kValue, d: dValue, j: jValue, crossover_state: crossover, direction: slopeState(jSeries, 3).state, overbought: jValue >= 80, oversold: jValue <= 20, k_slope: slopeState(kSeries, 3), d_slope: slopeState(dSeries, 3), j_slope: slopeState(jSeries, 3), ...metadata({ indicator: "kdj", interval, period, lookback: period, bars, calculatedAt }) };
  }

  function bollingerFeature(bars, interval, parameters, calculatedAt) {
    const [period, multiple] = parameters;
    if (bars.length < period) return unavailableFeature({ indicator: "bollinger", interval, period, lookback: period, bars, calculatedAt });
    const closes = bars.map((bar) => bar.close); const sample = closes.slice(-period);
    const middle = mean(sample); const deviation = standardDeviation(sample); const upper = middle + multiple * deviation; const lower = middle - multiple * deviation; const price = last(closes); const width = upper - lower;
    const percentB = width > 0 ? (price - lower) / width : null;
    const widths = closes.map((_, index) => index + 1 < period ? null : (() => { const values = closes.slice(index - period + 1, index + 1); const mid = mean(values); return mid ? ((standardDeviation(values) * multiple * 2) / mid) * 100 : null; })()).filter(Number.isFinite);
    const bandwidth = middle ? width / middle * 100 : null;
    const percentile = widths.length >= 60 ? widths.slice(-60).filter((entry) => entry <= bandwidth).length / 60 * 100 : null;
    return { middle_band: middle, upper_band: upper, lower_band: lower, percent_b: percentB, bandwidth_pct: bandwidth, bandwidth_percentile: percentile, squeeze_state: percentile == null ? "unavailable" : percentile <= 20 ? "squeeze" : percentile >= 80 ? "expanded" : "normal", price_position: percentB == null ? "unavailable" : percentB >= 1 ? "above_upper" : percentB <= 0 ? "below_lower" : percentB >= 0.8 ? "upper" : percentB <= 0.2 ? "lower" : "middle", ...metadata({ indicator: "bollinger", interval, period, lookback: period, bars, calculatedAt }) };
  }

  function obvFeature(bars, interval, lookback, calculatedAt) {
    if (bars.length < lookback + 1 || bars.some((bar) => !Number.isFinite(bar.volume))) return unavailableFeature({ indicator: "obv", interval, period: null, lookback, bars, calculatedAt });
    const series = [0];
    for (let index = 1; index < bars.length; index += 1) series.push(series[index - 1] + (bars[index].close > bars[index - 1].close ? bars[index].volume : bars[index].close < bars[index - 1].close ? -bars[index].volume : 0));
    const slope = slopeState(series, lookback);
    const priceReturn = (last(bars).close / bars[bars.length - 1 - lookback].close - 1) * 100;
    const divergence = priceReturn > 0 && slope.change < 0 ? "bearish_divergence" : priceReturn < 0 && slope.change > 0 ? "bullish_divergence" : "none";
    return { raw_value: last(series), slope, trend: slope.state, divergence, price_obv_confirmation: divergence === "none" ? slope.state === "rising" ? "confirming_uptrend" : slope.state === "falling" ? "confirming_downtrend" : "neutral" : "divergent", ...metadata({ indicator: "obv", interval, period: null, lookback, bars, calculatedAt }) };
  }

  function canonicalVolumeFeature(bars, shareBase, calculatedAt) {
    const volumes = bars.map((bar) => bar.volume);
    if (!bars.length || volumes.some((value) => !Number.isFinite(value))) return { availability: "unavailable", source: "market_ohlcv", current_volume: null, reason: "Daily volume history is unavailable." };
    const averages = Object.fromEntries([5, 20, 60, 120, 250].map((period) => [`avg_${period}d`, volumes.length >= period ? mean(volumes.slice(-period)) : null]));
    const current = last(volumes);
    const rvol = Object.fromEntries([5, 20, 60].map((period) => [`rvol_${period}d`, Number.isFinite(averages[`avg_${period}d`]) && averages[`avg_${period}d`] > 0 ? current / averages[`avg_${period}d`] : null]));
    const turnover = Object.fromEntries(["current", 5, 20, 60].map((period) => {
      const volume = period === "current" ? current : averages[`avg_${period}d`];
      return [`turnover_${period === "current" ? "current" : `${period}d_avg`}`, Number.isFinite(shareBase) && shareBase > 0 && Number.isFinite(volume) ? volume / shareBase * 100 : null];
    }));
    const obvByLookback = Object.fromEntries([5, 20, 60].map((lookback) => [`d${lookback}`, obvFeature(bars, "1d", lookback, calculatedAt)]));
    // One canonical OBV calculation family. The 20D view remains the primary
    // value for compatibility, while 5D/60D are child trend context only.
    const obv = obvByLookback.d20;
    const ma5vs20 = Number.isFinite(averages.avg_5d) && Number.isFinite(averages.avg_20d) && averages.avg_20d > 0 ? averages.avg_5d / averages.avg_20d : null;
    const ma20vs60 = Number.isFinite(averages.avg_20d) && Number.isFinite(averages.avg_60d) && averages.avg_60d > 0 ? averages.avg_20d / averages.avg_60d : null;
    const volumeTrend = ma5vs20 > 1.1 && ma20vs60 > 1 ? "expanding" : ma5vs20 < 0.9 && ma20vs60 < 1 ? "contracting" : "stable";
    const latestBar = last(bars); const priorBar = bars[bars.length - 2] || null;
    const confirmation = !priorBar || !Number.isFinite(rvol.rvol_20d) ? "unavailable" : latestBar.close > priorBar.close && rvol.rvol_20d >= 1.2 && obv.trend === "rising" ? "bullish_confirmation" : latestBar.close < priorBar.close && rvol.rvol_20d >= 1.2 && obv.trend === "falling" ? "bearish_confirmation" : "neutral";
    return {
      availability: "available",
      source: "daily_ohlcv",
      interval: "1d",
      calculation_timestamp: calculatedAt,
      last_bar_timestamp: latestBar.timestamp,
      current_volume: current,
      moving_average_volume: averages,
      relative_volume: { ...rvol, displayed_rvol: rvol.rvol_20d, state: stateFromRvol(rvol.rvol_20d), thresholds: RVOL_THRESHOLDS.map(([limit, state]) => ({ less_than: Number.isFinite(limit) ? limit : null, state })) },
      turnover: { ...turnover, share_base: Number.isFinite(shareBase) ? shareBase : null, availability: Number.isFinite(shareBase) && shareBase > 0 ? "available" : "unavailable" },
      obv: {
        ...obv,
        trends: Object.fromEntries(Object.entries(obvByLookback).map(([period, feature]) => [period, {
          trend: feature.trend,
          slope: feature.slope,
          price_obv_confirmation: feature.price_obv_confirmation,
          divergence: feature.divergence,
        }])),
        by_lookback: obvByLookback,
      },
      trend: { volume_ma5_vs_ma20: ma5vs20, volume_ma20_vs_ma60: ma20vs60, volume_trend: volumeTrend, volume_expanding: volumeTrend === "expanding", volume_contracting: volumeTrend === "contracting", price_volume_confirmation: confirmation },
      accumulation_distribution: obv.availability === "available" ? obv.trend === "rising" ? "accumulation" : obv.trend === "falling" ? "distribution" : "balanced" : "unavailable",
    };
  }

  function pricePositionFeatures(bars, currentPrice, calculatedAt, dailyMetadata = {}) {
    if (!bars.length || !Number.isFinite(currentPrice)) return { availability: "unavailable", high_52w: null, low_52w: null, all_time_high: null };
    const annual = bars.slice(-252);
    const maxItem = (items, key) => items.reduce((winner, item) => item[key] > winner[key] ? item : winner, items[0]);
    const minItem = (items, key) => items.reduce((winner, item) => item[key] < winner[key] ? item : winner, items[0]);
    const high52 = maxItem(annual, "high"); const low52 = minItem(annual, "low"); const ath = maxItem(bars, "high");
    const distance = (price, reference) => Number.isFinite(reference) && reference !== 0 ? (price / reference - 1) * 100 : null;
    const range = high52.high - low52.low;
    return {
      availability: annual.length >= 2 ? "available" : "partial",
      source: "daily_ohlcv",
      interval: "1d",
      calculation_timestamp: calculatedAt,
      high_52w: high52.high,
      high_52w_date: high52.timestamp,
      low_52w: low52.low,
      low_52w_date: low52.timestamp,
      distance_to_52w_high_pct: distance(currentPrice, high52.high),
      distance_to_52w_low_pct: distance(currentPrice, low52.low),
      position_52w_pct: range > 0 ? (currentPrice - low52.low) / range * 100 : null,
      all_time_high: ath.high,
      all_time_high_date: ath.timestamp,
      distance_to_ath_pct: distance(currentPrice, ath.high),
      all_time_history_bar_count: bars.length,
      all_time_history_start: bars[0]?.timestamp ?? null,
      all_time_history_coverage: dailyMetadata.lookback === "max_available" ? "max_available_from_source" : bars.length ? "loaded_history_only" : "unavailable",
    };
  }

  function relativeStrengthFeatures(relativeStrength = {}, horizon) {
    const period = horizon === "short" ? 20 : horizon === "medium" ? 60 : 120;
    const spy = relativeStrength[`stock_vs_spy_${period}d`] ?? null;
    const qqq = relativeStrength[`stock_vs_qqq_${period}d`] ?? null;
    const shortValue = relativeStrength.stock_vs_spy_20d ?? relativeStrength.stock_vs_qqq_20d ?? null;
    const longValue = relativeStrength.stock_vs_spy_120d ?? relativeStrength.stock_vs_qqq_120d ?? null;
    const state = Number.isFinite(shortValue) && Number.isFinite(longValue) ? shortValue > longValue + 1 ? "improving" : shortValue < longValue - 1 ? "deteriorating" : "stable" : "unavailable";
    const average = mean([spy, qqq]);
    const returns = {
      stock_20d: relativeStrength.stock_return_20d ?? null,
      stock_60d: relativeStrength.stock_return_60d ?? null,
      stock_120d: relativeStrength.stock_return_120d ?? null,
    };
    const vsSpy = {
      d20: relativeStrength.stock_vs_spy_20d ?? null,
      d60: relativeStrength.stock_vs_spy_60d ?? null,
      d120: relativeStrength.stock_vs_spy_120d ?? null,
    };
    const vsQqq = {
      d20: relativeStrength.stock_vs_qqq_20d ?? null,
      d60: relativeStrength.stock_vs_qqq_60d ?? null,
      d120: relativeStrength.stock_vs_qqq_120d ?? null,
    };
    const primaryReturn = returns[`stock_${period}d`];
    return {
      interval: "1d",
      period: `${period}d`,
      primary_lookback_days: period,
      source: "stock_and_benchmark_daily_returns",
      availability: Number.isFinite(spy) || Number.isFinite(qqq) ? "available" : "unavailable",
      returns,
      vs_spy: vsSpy,
      vs_qqq: vsQqq,
      primary: { stock_return: primaryReturn, vs_spy: spy, vs_qqq: qqq, average },
      consistency: { value: state, state },
      // Compatibility aliases. These point to the canonical values above and
      // never recalculate relative strength independently.
      stock_return: primaryReturn,
      relative_strength_vs_spy: spy,
      relative_strength_vs_qqq: qqq,
      relative_strength_average: average,
      state: average == null ? "unavailable" : average > 3 ? "outperforming" : average < -3 ? "underperforming" : "neutral",
      consistency_state: state,
    };
  }

  function fibonacciFeatures(fibonacciStructure = {}) {
    const normalize = (item) => {
      if (!item) return { availability: "unavailable" };
      const levels = [...Object.values(item.retracement_levels || {}), ...Object.values(item.extension_levels || {})].filter((entry) => Number.isFinite(entry?.price));
      const currentPrice = item.current_price;
      const nearest = levels.slice().sort((left, right) => Math.abs(left.price - currentPrice) - Math.abs(right.price - currentPrice))[0] || null;
      const ordered = levels.slice().sort((left, right) => left.price - right.price);
      const below = ordered.filter((entry) => entry.price <= currentPrice).at(-1) || null;
      const above = ordered.find((entry) => entry.price >= currentPrice) || null;
      const level50 = item.retracement_levels?.["50.0"]?.price ?? null;
      const level618 = item.retracement_levels?.["61.8"]?.price ?? null;
      return {
        availability: item.status === "available" || item.status === "stale_swing" ? "available" : "unavailable",
        status: item.status || "unavailable",
        source: "confirmed_pivot_fibonacci",
        interval: item.horizon === "long_term" ? "1w" : "1d",
        anchor_method: item.pivot_method || "confirmed_pivots",
        anchor_confidence: item.data_quality || "unavailable",
        anchor_low: item.swing_low ?? null,
        anchor_low_date: item.swing_low_date ?? null,
        anchor_high: item.swing_high ?? null,
        anchor_high_date: item.swing_high_date ?? null,
        direction: item.swing_direction ?? null,
        retracement_levels: item.retracement_levels || {},
        extension_levels: item.extension_levels || {},
        nearest_fib_level: nearest?.label ?? null,
        nearest_fib_level_pct: nearest?.ratio ?? null,
        distance_to_nearest_fib_pct: nearest?.distance_from_current_pct ?? null,
        price_between_fib_levels: below && above && below !== above ? { lower: below.label, upper: above.label } : null,
        fib_zone: item.current_position_label ?? "unavailable",
        above_or_below_50_retracement: Number.isFinite(level50) && Number.isFinite(currentPrice) ? currentPrice >= level50 ? "above" : "below" : "unavailable",
        above_or_below_61_8_retracement: Number.isFinite(level618) && Number.isFinite(currentPrice) ? currentPrice >= level618 ? "above" : "below" : "unavailable",
        legacy: item,
      };
    };
    return { short: normalize(fibonacciStructure.short_term), medium: normalize(fibonacciStructure.mid_term), long: normalize(fibonacciStructure.long_term) };
  }

  function horizonFeatureSet(horizon, sources, currentPrice, relativeStrength, fibonacci, calculatedAt) {
    const config = HORIZON_CONFIG[horizon];
    const indicators = { ema: {}, sma: {}, rsi: {}, macd: {}, adx: {}, atr: {}, kdj: {}, bollinger: {}, obv: {} };
    const use = (interval) => sources[interval] || [];
    Object.entries(config.ema || {}).forEach(([interval, periods]) => periods.forEach((period) => { indicators.ema[`ema_${period}_${interval}`] = movingAverageFeature(use(interval), interval, period, "ema", currentPrice, calculatedAt); }));
    Object.entries(config.sma || {}).forEach(([interval, periods]) => periods.forEach((period) => { indicators.sma[`sma_${period}_${interval}`] = movingAverageFeature(use(interval), interval, period, "sma", currentPrice, calculatedAt); }));
    Object.entries(config.rsi || {}).forEach(([interval, periods]) => periods.forEach((period) => { indicators.rsi[`rsi_${period}_${interval}`] = rsiFeature(use(interval), interval, period, calculatedAt); }));
    Object.entries(config.macd || {}).forEach(([interval, params]) => { indicators.macd[`macd_${interval}`] = macdFeature(use(interval), interval, params, calculatedAt); });
    Object.entries(config.adx || {}).forEach(([interval, period]) => { indicators.adx[`adx_${period}_${interval}`] = adxFeature(use(interval), interval, period, calculatedAt); });
    Object.entries(config.atr || {}).forEach(([interval, period]) => { indicators.atr[`atr_${period}_${interval}`] = atrFeature(use(interval), interval, period, calculatedAt); });
    Object.entries(config.kdj || {}).forEach(([interval, period]) => { indicators.kdj[`kdj_${period}_${interval}`] = kdjFeature(use(interval), interval, period, calculatedAt); });
    Object.entries(config.bollinger || {}).forEach(([interval, params]) => { indicators.bollinger[`bollinger_${interval}`] = bollingerFeature(use(interval), interval, params, calculatedAt); });
    Object.entries(config.obv || {}).forEach(([interval, lookback]) => { indicators.obv[`obv_${interval}`] = obvFeature(use(interval), interval, lookback, calculatedAt); });
    const allMa = [...Object.values(indicators.ema), ...Object.values(indicators.sma)];
    const preferredMa = allMa.filter((feature) => feature.interval === (horizon === "short" ? "4h" : "1d"));
    const missing = Object.entries(indicators).filter(([, group]) => Object.values(group).every((feature) => feature.availability === "unavailable")).map(([key]) => key);
    return {
      horizon,
      horizon_label: config.label,
      primary_intervals: config.primary_intervals,
      supporting_intervals: config.supporting_intervals,
      trend: { moving_averages: { ...indicators.ema, ...indicators.sma }, ma_structure: movingAverageStructure(preferredMa), adx: indicators.adx },
      momentum: { rsi: indicators.rsi, macd: indicators.macd, kdj: indicators.kdj },
      volatility: { atr: indicators.atr, bollinger: indicators.bollinger },
      participation: { obv: indicators.obv },
      relative_strength: relativeStrengthFeatures(relativeStrength, horizon),
      fibonacci: fibonacci[horizon],
      missing_families: missing,
      availability: missing.length === Object.keys(indicators).length ? "unavailable" : missing.length ? "partial" : "available",
    };
  }

  function buildTechnicalFeatures({ history = {}, currentPrice = null, relativeStrength = {}, fibonacciStructure = {}, shareBase = null, calculatedAt = timestampNow() } = {}) {
    const daily = pickBars(history, "1d");
    const hourly = pickBars(history, "1h");
    const fourHour = aggregateFourHourBars(hourly);
    const weekly = completedWeeklyBars(daily);
    const sources = { "1h": hourly, "4h": fourHour, "1d": daily, "1w": weekly };
    const normalizedPrice = Number.isFinite(currentPrice) ? currentPrice : last(daily)?.close ?? null;
    const fibonacci = fibonacciFeatures(fibonacciStructure);
    const volume = canonicalVolumeFeature(daily, finite(shareBase), calculatedAt);
    return {
      schema_version: SCHEMA_VERSION,
      calculated_at: calculatedAt,
      source_intervals: Object.fromEntries(Object.entries(sources).map(([interval, bars]) => [interval, { interval, bar_count: bars.length, availability: bars.length ? "available" : "unavailable", lookback: interval === "1d" ? (history.daily_history_metadata?.lookback || null) : interval === "1h" ? (history.intervals?.["1h"]?.lookback || null) : null, last_bar_timestamp: last(bars)?.timestamp ?? null, source: interval === "4h" ? "derived_1h_regular_session" : interval === "1w" ? "completed_weekly_from_daily" : "market_ohlcv" }])),
      horizons: {
        short: horizonFeatureSet("short", sources, normalizedPrice, relativeStrength, fibonacci, calculatedAt),
        medium: horizonFeatureSet("medium", sources, normalizedPrice, relativeStrength, fibonacci, calculatedAt),
        long: horizonFeatureSet("long", sources, normalizedPrice, relativeStrength, fibonacci, calculatedAt),
      },
      volume,
      price_position: pricePositionFeatures(daily, normalizedPrice, calculatedAt, history.daily_history_metadata || {}),
      fibonacci,
      data_quality: {
        daily_history: daily.length >= 252 ? "available" : daily.length ? "partial" : "unavailable",
        intraday_history: hourly.length ? "available" : "unavailable",
        all_time_history: daily.length ? "available_history" : "unavailable",
        missing_intervals: Object.entries(sources).filter(([, bars]) => !bars.length).map(([interval]) => interval),
      },
    };
  }

  // Adapter only: legacy detail cards keep their current field names while all
  // values below are sourced from the canonical feature object above.
  function legacyHorizon(canonical, horizon) {
    const source = canonical?.horizons?.[horizon] || {};
    const maFeatures = Object.values(source.trend?.moving_averages || {});
    const rsiFeatures = Object.values(source.momentum?.rsi || {});
    const primaryInterval = horizon === "short" ? "4h" : horizon === "medium" ? "1d" : "1w";
    const macd = Object.values(source.momentum?.macd || {}).find((feature) => feature.interval === primaryInterval) || Object.values(source.momentum?.macd || {})[0] || {};
    const obv = Object.values(source.participation?.obv || {})[0] || {};
    const atr = Object.values(source.volatility?.atr || {})[0] || {};
    const bollinger = Object.values(source.volatility?.bollinger || {})[0] || {};
    const kdj = Object.values(source.momentum?.kdj || {})[0] || {};
    const adx = Object.values(source.trend?.adx || {})[0] || {};
    const volume = canonical?.volume || {};
    const rs = source.relative_strength || {};
    const primaryRsi = rsiFeatures.find((feature) => feature.interval === (horizon === "long" ? "1w" : horizon === "medium" ? "1d" : "4h")) || rsiFeatures[0] || {};
    return {
      ma: { relevant_mas: maFeatures.map((feature) => ({ period: feature.period, type: feature.indicator, interval: feature.interval, current_value: feature.value, distance_pct: feature.price_distance_pct, slope_direction: feature.slope?.state, price_above: feature.price_state === "above" })), ma_alignment: source.trend?.ma_structure?.alignment || "unavailable", trend_state: source.trend?.ma_structure?.alignment || "unavailable", compression_state: source.trend?.ma_structure?.compression_state || "unavailable", expansion_state: source.trend?.ma_structure?.expansion_state || false, fast_ma_slope: maFeatures[0]?.slope?.state || "unavailable", medium_ma_slope: maFeatures[1]?.slope?.state || "unavailable", slow_ma_slope: maFeatures[2]?.slope?.state || "unavailable", nearest_ma: null, extension_state: "unavailable", bullish_crosses: [], bearish_crosses: [], recent_reclaims: [], recent_breakdowns: [] },
      rsi: { values: Object.fromEntries(rsiFeatures.map((feature) => [`RSI${feature.period}`, feature.value])), primary_rsi: primaryRsi.value ?? null, state: primaryRsi.state || "unavailable", range_regime: primaryRsi.value >= 55 ? "bull_range" : primaryRsi.value <= 45 ? "bear_range" : "neutral_range", slope: primaryRsi.slope || {}, divergence: primaryRsi.divergence || "unavailable", failure_swing: "none" },
      macd: { macd_line: macd.macd_line ?? null, signal_line: macd.signal_line ?? null, histogram: macd.histogram ?? null, histogram_change_1: macd.histogram_change_1 ?? null, histogram_change_3: macd.histogram_change_3 ?? null, histogram_change_5: macd.histogram_change_5 ?? null, cross_state: macd.crossover_state || "unavailable", zero_line_state: macd.above_or_below_zero || "unavailable", momentum_state: macd.state || "unavailable" },
      obv: { trend: obv.trend || "unavailable", price_obv_divergence: obv.divergence || "unavailable", confirmation_state: obv.price_obv_confirmation || "unavailable", weekly_obv_trend: horizon === "long" ? obv.trend || "unavailable" : "not_primary" },
      relative_strength: { vs_spy: { [`stock_vs_spy_${horizon === "short" ? 20 : horizon === "medium" ? 60 : 120}d`]: rs.relative_strength_vs_spy ?? null }, vs_qqq: { [`stock_vs_qqq_${horizon === "short" ? 20 : horizon === "medium" ? 60 : 120}d`]: rs.relative_strength_vs_qqq ?? null }, regime: rs.state || "unavailable", consistency: rs.consistency_state || "unavailable", rs_slope: null, explanation: "Canonical relative-strength feature" },
      volume: {
        latest_volume: volume.current_volume ?? null,
        averages: volume.moving_average_volume || {},
        ratios: {
          ...(volume.relative_volume || {}),
          volume_ratio_5d: volume.relative_volume?.rvol_5d ?? null,
          volume_ratio_20d: volume.relative_volume?.rvol_20d ?? null,
          volume_ratio_60d: volume.relative_volume?.rvol_60d ?? null,
        },
        volume_ratio_5d: volume.relative_volume?.rvol_5d ?? null,
        volume_ratio_20d: volume.relative_volume?.rvol_20d ?? null,
        volume_ratio_60d: volume.relative_volume?.rvol_60d ?? null,
        turnover_latest: volume.turnover?.turnover_current ?? null, turnover_average: volume.turnover?.turnover_20d_avg ?? null, turnover_period: 20, up_down_volume_ratio: null, weekly_volume_trend: horizon === "long" ? volume.trend?.volume_trend || "unavailable" : "not_primary", state: volume.relative_volume?.state || "unavailable", accumulation_distribution_balance: volume.accumulation_distribution || "unavailable",
      },
      atr: { ATR14: atr.value ?? null, ATR_pct: atr.atr_pct ?? null, ATR_percentile_60D: atr.atr_percentile_60 ?? null, ATR_percentile_120D: atr.atr_percentile_120 ?? null, ATR_percentile_250D: atr.atr_percentile_250 ?? null, volatility_state: atr.volatility_regime || "unavailable", volatility_trend: atr.expansion_state || "unavailable", range_efficiency: "unavailable", range_efficiency_ratio: null },
      momentum: { momentum_direction: macd.improving_or_deteriorating || "unavailable", momentum_strength: macd.state || "unavailable", consistency: rs.consistency_state || "unavailable" },
      adx: { adx: adx.adx ?? null, plus_di: adx.plus_di ?? null, minus_di: adx.minus_di ?? null, di_cross: "none", trend_strength: adx.trend_strength || "unavailable", direction: adx.directional_bias || "unavailable" },
      bollinger: { percent_b: bollinger.percent_b ?? null, band_width_pct: bollinger.bandwidth_pct ?? null, band_walk_state: bollinger.price_position || "unavailable", squeeze_state: bollinger.squeeze_state || "unavailable" },
      kdj: { status: kdj.availability === "available" ? "available" : "unavailable", k: kdj.k ?? null, d: kdj.d ?? null, j: kdj.j ?? null, cross_state: kdj.crossover_state || "unavailable", k_slope: kdj.k_slope || {}, d_slope: kdj.d_slope || {}, j_slope: kdj.j_slope || {}, persistent_overbought: false, persistent_oversold: false },
      used_indicators: Object.keys(source.trend || {}),
      missing_indicators: source.missing_families || [],
      data_window: [...(source.primary_intervals || []), ...(source.supporting_intervals || [])].join(" / "),
      data_quality: source.availability || "unavailable",
    };
  }

  function toLegacyTechnicalStructure(canonical) {
    return {
      short_term: legacyHorizon(canonical, "short"),
      mid_term: legacyHorizon(canonical, "medium"),
      long_term: legacyHorizon(canonical, "long"),
      configuration: HORIZON_CONFIG,
      canonical_schema_version: canonical?.schema_version || SCHEMA_VERSION,
      adapter: "canonical_feature_layer",
    };
  }

  const api = { SCHEMA_VERSION, HORIZON_CONFIG, RVOL_THRESHOLDS, buildTechnicalFeatures, toLegacyTechnicalStructure, _test: { normalizeBars, aggregateFourHourBars, completedWeeklyBars, rsiSeries, emaSeries, atrSeries, pricePositionFeatures, canonicalVolumeFeature } };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.CanonicalTechnicalFeatures = api;
}(typeof globalThis !== "undefined" ? globalThis : window));
