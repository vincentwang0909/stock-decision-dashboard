/*
 * Canonical technical feature layer.
 *
 * This file deliberately has no scoring or recommendation code. It converts
 * raw OHLCV histories into horizon-aware, machine-readable technical features.
 */
(function exposeCanonicalTechnicalFeatures(root) {
  "use strict";

  const SCHEMA_VERSION = "technical-features-v5-structure-momentum";
  const AVAILABILITY_REASONS = Object.freeze([
    "available",
    "source_unavailable",
    "insufficient_history",
    "calculation_error",
    "dependency_unavailable",
    "not_applicable",
    "market_session_incomplete",
    "invalid_source_data",
    "completion_metadata_unavailable",
  ]);
  const RVOL_THRESHOLDS = Object.freeze([
    [0.6, "very_low"], [0.8, "low"], [1.2, "normal"], [1.5, "elevated"], [2.0, "high"], [Infinity, "extreme"],
  ]);
  const HORIZON_CONFIG = Object.freeze({
    short: {
      label: "1–30 days",
      primary_intervals: ["4h"],
      supporting_intervals: ["1h", "1d"],
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
  // Fibonacci is a technical-structure feature, not a decision score.  These
  // are the pre-existing confirmed-pivot windows, moved here so the canonical
  // feature layer remains complete even when the API does not attach a legacy
  // presentation object to a quote.
  const FIBONACCI_HORIZON_CONFIG = Object.freeze({
    // The swing source follows the actual Decision horizon.  Short is native
    // 4H first; Daily is a named secondary confirmation/fallback rather than
    // a silently reused Short object.  Long uses completed Weekly bars.
    short_term: { source_timeframe: "4h", lookback: 80, min_lookback: 45, max_lookback: 120, pivot_bars: 3, min_pivot_separation: 8, min_swing_pct: 4, stale_after_bars: 32 },
    short_daily_confirmation: { source_timeframe: "1d", lookback: 65, min_lookback: 40, max_lookback: 90, pivot_bars: 2, min_pivot_separation: 6, min_swing_pct: 5, stale_after_bars: 28 },
    mid_term: { source_timeframe: "1d", lookback: 100, min_lookback: 60, max_lookback: 150, pivot_bars: 4, min_pivot_separation: 10, min_swing_pct: 10, stale_after_bars: 50 },
    long_term: { source_timeframe: "1w", lookback: 104, min_lookback: 26, max_lookback: 130, pivot_bars: 2, min_pivot_separation: 5, min_swing_pct: 15, stale_after_bars: 26 },
    long_daily_fallback: { source_timeframe: "1d", lookback: 250, min_lookback: 120, max_lookback: 320, pivot_bars: 5, min_pivot_separation: 20, min_swing_pct: 15, stale_after_bars: 80 },
  });

  const finite = (value) => value == null || typeof value === "boolean" || (typeof value === "string" && value.trim() === "") ? null : Number.isFinite(Number(value)) ? Number(value) : null;
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

  function timestampMillis(value) {
    if (value == null || value === "") return null;
    const number = typeof value === "number" ? value : null;
    if (number != null) {
      // Epoch seconds/milliseconds are explicit accepted units; reject other
      // magnitudes rather than interpreting seconds as a date in 1970.
      const ms = number >= 1e12 && number < 1e14 ? number : number >= 1e9 && number < 1e11 ? number * 1000 : null;
      return Number.isFinite(ms) ? ms : null;
    }
    const dateMatch = typeof value === "string" ? value.match(/^(\d{4})-(\d{2})-(\d{2})(?:T.*)?$/) : null;
    if (!dateMatch) return null;
    if (value.includes("T") && !/(?:Z|[+-]\d{2}:?\d{2})$/.test(value)) return null;
    const [year, month, day] = dateMatch.slice(1).map(Number);
    const calendarDay = new Date(Date.UTC(year, month - 1, day));
    if (calendarDay.getUTCFullYear() !== year || calendarDay.getUTCMonth() !== month - 1 || calendarDay.getUTCDate() !== day) return null;
    const stamp = Date.parse(value);
    return Number.isFinite(stamp) ? stamp : null;
  }

  function normalizeBars(source = {}) {
    const arrays = Object.fromEntries(["opens", "highs", "lows", "closes", "volumes"].map((key) => [key, Array.isArray(source[key]) ? source[key] : []]));
    const timestamps = Array.isArray(source.timestamps) ? source.timestamps : (Array.isArray(source.dates) ? source.dates : []);
    const length = Math.max(timestamps.length, ...Object.values(arrays).map((array) => array.length));
    const bars = [], reasons = {};
    let previous = null;
    const reject = (reason) => { reasons[reason] = (reasons[reason] || 0) + 1; };
    for (let index = 0; index < length; index += 1) {
      const stamp = timestampMillis(timestamps[index]);
      if (stamp == null) { reject("invalid_timestamp"); continue; }
      if (previous != null && stamp <= previous) { reject("duplicate_or_unordered_timestamp"); continue; }
      previous = stamp;
      const [open, high, low, close, volume] = ["opens", "highs", "lows", "closes", "volumes"].map((key) => finite(arrays[key][index]));
      if ([open, high, low, close, volume].some((value) => value == null)) { reject("missing_or_nonfinite_ohlcv"); continue; }
      if (Math.min(open, high, low, close) <= 0) { reject("nonpositive_price"); continue; }
      if (!(low <= Math.min(open, close) && Math.max(open, close) <= high)) { reject("ohlc_envelope"); continue; }
      if (volume < 0) { reject("negative_volume"); continue; }
      const bar = { open, high, low, close, volume, timestamp: typeof timestamps[index] === "number" ? new Date(stamp).toISOString() : timestamps[index] };
      const segment = source.bar_segments?.[index];
      const perBarCompletion = source.completed?.[index] ?? segment?.completed;
      if (typeof perBarCompletion === "boolean") bar.completed = perBarCompletion;
      const end = source.bar_end_timestamps?.[index] ?? segment?.end;
      if (timestampMillis(end) != null) bar.end_timestamp = end;
      const completed = source.last_bar_completed ?? source.bar_segments?.at(-1)?.completed;
      if (index === length - 1 && typeof completed === "boolean") bar.completed = typeof perBarCompletion === "boolean" ? perBarCompletion && completed : completed;
      bars.push(bar);
    }
    Object.defineProperty(bars, "validation", { value: { source_rows: length, rejected_rows: length - bars.length, reasons }, enumerable: false });
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
    if (interval === "4h") return normalizeBars(intervals["4h"] || {});
    return [];
  }

  function completedWeeklyBars(dailyBars = [], { asOf = null, calendar = null } = {}) {
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
    if (calendar?.completed_week_keys) {
      const completed = new Set(calendar.completed_week_keys);
      return result.filter((bar) => completed.has(bar.week_key)).map(({ last_day, week_key, ...bar }) => ({ ...bar, completed: true, end_timestamp: bar.end_timestamp || null }));
    }
    // Legacy/offline inputs without a session calendar use an explicit
    // conservative fallback. A current Friday still needs its session close.
    if (result.length) {
      const final = result.at(-1);
      const stamp = new Date(final.timestamp);
      const asOfMs = timestampMillis(asOf);
      const etDate = Number.isFinite(asOfMs) ? new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(asOfMs)) : null;
      const etParts = Number.isFinite(asOfMs) ? new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "numeric", hourCycle: "h23" }).formatToParts(new Date(asOfMs)) : [];
      const hour = Number(etParts.find((part) => part.type === "hour")?.value);
      const beforeFridayClose = etDate === stamp.toISOString().slice(0, 10) && hour < 16;
      if (final.last_day < 5 || beforeFridayClose) result.pop();
    }
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

  function metadata({ indicator, interval, period = null, lookback = null, requiredBars = lookback, bars = [], source = null, calculatedAt, unavailableReason = null }) {
    const availableBars = bars.length;
    const availability = availableBars ? "available" : "unavailable";
    return {
      indicator,
      interval,
      period,
      lookback,
      availability,
      available: availability === "available",
      unavailable_reason: availability === "available" ? null : (unavailableReason || "source_unavailable"),
      required_bars: requiredBars,
      available_bars: availableBars,
      source: source || (interval === "4h" ? "provider_native_4h" : interval === "1w" ? "completed_weekly_from_daily" : "market_ohlcv"),
      last_bar_timestamp: last(bars)?.timestamp ?? null,
      last_bar_completed: last(bars)?.completed ?? null,
      last_bar_end: last(bars)?.end_timestamp ?? null,
      input_state: last(bars)?.completed === false ? "provisional" : last(bars)?.completed === true ? "completed" : "completion_unknown",
      calculation_timestamp: calculatedAt,
      bar_count: availableBars,
    };
  }

  function unavailableFeature(args = {}) {
    const bars = args.bars || [];
    const unavailableReason = args.unavailableReason || (bars.length ? "insufficient_history" : "source_unavailable");
    return {
      value: null,
      state: "unavailable",
      ...metadata({ ...args, bars, unavailableReason }),
      availability: "unavailable",
      available: false,
      unavailable_reason: unavailableReason,
    };
  }

  function derivedAvailability(value, { requiredBars = null, availableBars = null, requiredObservations = null, availableObservations = null, unavailableReason = null, source = null } = {}) {
    const available = Number.isFinite(value);
    return {
      value: available ? value : null,
      availability: available ? "available" : "unavailable",
      available,
      unavailable_reason: available ? null : (unavailableReason || "insufficient_history"),
      required_bars: requiredBars,
      available_bars: availableBars,
      required_observations: requiredObservations,
      available_observations: availableObservations,
      source,
    };
  }

  function slopeState(series, bars = 3) {
    const value = last(series);
    const prior = valueAgo(series, bars);
    const availableObservations = series.filter(Number.isFinite).length;
    if (!Number.isFinite(value) || !Number.isFinite(prior)) return {
      value: null,
      state: "unavailable",
      change: null,
      bars,
      availability: "unavailable",
      available: false,
      unavailable_reason: "insufficient_history",
      required_observations: bars + 1,
      available_observations: availableObservations,
    };
    const change = value - prior;
    return {
      value: change,
      change,
      state: change > 0 ? "rising" : change < 0 ? "falling" : "flat",
      bars,
      availability: "available",
      available: true,
      unavailable_reason: null,
      required_observations: bars + 1,
      available_observations: availableObservations,
    };
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
    if (closes.length < slow + signal) {
      const unavailable = unavailableFeature({ indicator: "macd", interval, period: `${fast}/${slow}/${signal}`, lookback: slow + signal, bars, calculatedAt });
      const dependency = derivedAvailability(null, {
        requiredBars: unavailable.required_bars,
        availableBars: unavailable.available_bars,
        unavailableReason: "dependency_unavailable",
        source: "macd",
      });
      return {
        ...unavailable,
        macd_line: null,
        signal_line: null,
        histogram: null,
        histogram_change_1: null,
        histogram_change_3: null,
        histogram_change_5: null,
        histogram_slope: { value: null, state: "unavailable", ...dependency },
        crossover_state: "unavailable",
        above_or_below_zero: "unavailable",
        improving_or_deteriorating: "unavailable",
        child_availability: {
          macd_line: dependency,
          signal_line: dependency,
          histogram: dependency,
          histogram_change_1: dependency,
          histogram_change_3: dependency,
          histogram_change_5: dependency,
          histogram_slope: dependency,
          crossover_state: dependency,
          above_or_below_zero: dependency,
          improving_or_deteriorating: dependency,
        },
      };
    }
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
    let crossoverAge = null;
    let crossoverTimestamp = null;
    for (let index = histogramSeries.length - 1; index > 0; index -= 1) {
      if (!Number.isFinite(histogramSeries[index]) || !Number.isFinite(histogramSeries[index - 1])) continue;
      if ((histogramSeries[index] >= 0) !== (histogramSeries[index - 1] >= 0)) { crossoverState = histogramSeries[index] >= 0 ? "bullish_cross" : "bearish_cross"; crossoverAge = histogramSeries.length - 1 - index; crossoverTimestamp = bars[index].timestamp; break; }
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
      crossover_state: crossoverState, crossover_age_bars: crossoverAge, crossover_timestamp: crossoverTimestamp, crossover_method: "most_recent_historical_cross",
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
    if (![adx, plusDi, minusDi].every(Number.isFinite)) return unavailableFeature({ indicator: "adx", interval, period, lookback: period * 2 + 1, bars, calculatedAt, unavailableReason: "dependency_unavailable" });
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
    const percentileMetadata = (window) => derivedAvailability(percentile(window), {
      requiredBars: period + window - 1,
      availableBars: bars.length,
      requiredObservations: window,
      availableObservations: pctSeries.length,
      unavailableReason: "insufficient_history",
      source: "atr_pct_series",
    });
    const percentile60 = percentileMetadata(60);
    const percentile120 = percentileMetadata(120);
    const percentile250 = percentileMetadata(250);
    // The current primary regime uses the 60-observation percentile. The
    // longer windows stay available as context, but cannot rescue a missing
    // 60-observation value because they necessarily require even more data.
    const primaryPercentile = percentile60;
    const percentileValue = percentile60.value ?? percentile120.value ?? percentile250.value;
    const state = percentileValue == null ? "unavailable" : percentileValue <= 20 ? "low" : percentileValue <= 70 ? "normal" : percentileValue <= 88 ? "elevated" : "extreme";
    const slope = slopeState(pctSeries, Math.min(5, Math.max(1, Math.floor(pctSeries.length / 8))));
    const regimeAvailability = derivedAvailability(percentileValue, {
      requiredBars: primaryPercentile.required_bars,
      availableBars: bars.length,
      requiredObservations: primaryPercentile.required_observations,
      availableObservations: pctSeries.length,
      unavailableReason: "dependency_unavailable",
      source: "atr_percentile",
    });
    return { value, atr_pct: atrPct, atr_percentile_pct: percentileValue, atr_percentile_60: percentile60.value, atr_percentile_120: percentile120.value, atr_percentile_250: percentile250.value, atr_percentile: primaryPercentile, atr_percentiles: { d60: percentile60, d120: percentile120, d250: percentile250 }, volatility_regime: state, volatility_regime_availability: regimeAvailability, expansion_state: slope.state === "rising" ? "expanding" : slope.state === "falling" ? "contracting" : slope.state, slope, series, ...metadata({ indicator: "atr", interval, period, lookback: period, bars, calculatedAt }) };
  }

  function kdjFeature(bars, interval, period, calculatedAt) {
    if (bars.length < period + 3) return unavailableFeature({ indicator: "kdj", interval, period, lookback: period, requiredBars: period + 3, bars, calculatedAt });
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
    return { k: kValue, d: dValue, j: jValue, crossover_state: crossover, direction: slopeState(jSeries, 3).state, overbought: jValue >= 80, oversold: jValue <= 20, k_slope: slopeState(kSeries, 3), d_slope: slopeState(dSeries, 3), j_slope: slopeState(jSeries, 3), ...metadata({ indicator: "kdj", interval, period, lookback: period, requiredBars: period + 3, bars, calculatedAt }) };
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
    const bandwidthPercentile = derivedAvailability(percentile, {
      requiredBars: period + 60 - 1,
      availableBars: bars.length,
      requiredObservations: 60,
      availableObservations: widths.length,
      unavailableReason: "insufficient_history",
      source: "bollinger_bandwidth_series",
    });
    const squeezeAvailability = derivedAvailability(percentile, {
      requiredBars: bandwidthPercentile.required_bars,
      availableBars: bars.length,
      requiredObservations: bandwidthPercentile.required_observations,
      availableObservations: widths.length,
      unavailableReason: "dependency_unavailable",
      source: "bollinger_bandwidth_percentile",
    });
    return { middle_band: middle, upper_band: upper, lower_band: lower, percent_b: percentB, bandwidth_pct: bandwidth, bandwidth_percentile: percentile, bandwidth_percentile_availability: bandwidthPercentile, squeeze_state: percentile == null ? "unavailable" : percentile <= 20 ? "squeeze" : percentile >= 80 ? "expanded" : "normal", squeeze_state_availability: squeezeAvailability, price_position: percentB == null ? "unavailable" : percentB >= 1 ? "above_upper" : percentB <= 0 ? "below_lower" : percentB >= 0.8 ? "upper" : percentB <= 0.2 ? "lower" : "middle", ...metadata({ indicator: "bollinger", interval, period, lookback: period, bars, calculatedAt }) };
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
        // value, while 5D/60D are child trend context only.
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
      state: average == null ? "unavailable" : average > 3 ? "outperforming" : average < -3 ? "underperforming" : "neutral",
      consistency_state: state,
    };
  }

  function fibonacciDate(value) {
    if (value == null) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? String(value).slice(0, 10) : date.toISOString().slice(0, 10);
  }

  function fibonacciLevel(ratio, price, type, direction, currentPrice) {
    const distance = Number.isFinite(price) && Number.isFinite(currentPrice) ? price - currentPrice : null;
    return {
      ratio: ratio * 100,
      label: `${(ratio * 100).toFixed(1)}%`,
      price,
      type,
      direction,
      valid_for_display: Number.isFinite(price) && price > 0,
      distance_from_current: distance,
      distance_from_current_pct: Number.isFinite(distance) && currentPrice > 0 ? distance / currentPrice * 100 : null,
      current_price_above: Number.isFinite(currentPrice) && Number.isFinite(price) ? currentPrice > price : null,
      current_price_below: Number.isFinite(currentPrice) && Number.isFinite(price) ? currentPrice < price : null,
    };
  }

  function confirmedPivots(bars, side, width) {
    const key = side === "high" ? "high" : "low";
    const comparison = side === "high" ? (value, other) => value > other : (value, other) => value < other;
    const pivots = [];
    for (let index = width; index < bars.length - width; index += 1) {
      const value = bars[index]?.[key];
      const neighbours = bars.slice(index - width, index).concat(bars.slice(index + 1, index + width + 1));
      if (Number.isFinite(value) && neighbours.length === width * 2 && neighbours.every((bar) => comparison(value, bar[key]))) {
        pivots.push({ index, price: value, date: fibonacciDate(bars[index].timestamp) });
      }
    }
    return pivots;
  }

  function fibonacciSourceHash(bars = []) {
    const sample = bars.length ? [bars[0], bars[Math.floor(bars.length / 2)], bars[bars.length - 1]] : [];
    let value = 2166136261;
    sample.forEach((bar) => {
      const text = `${bar?.timestamp || ""}|${bar?.high || ""}|${bar?.low || ""}|${bar?.close || ""}`;
      for (let index = 0; index < text.length; index += 1) value = Math.imul(value ^ text.charCodeAt(index), 16777619);
    });
    return `${(value >>> 0).toString(16)}-${bars.length}`;
  }

  function fibSecondarySummary(item) {
    return {
      availability: item?.status === "available" || item?.status === "stale_swing" ? "available" : "unavailable",
      source_timeframe: item?.source_timeframe || null,
      fallback_used: Boolean(item?.fallback_used),
      swing_low: item?.swing_low ?? null,
      swing_high: item?.swing_high ?? null,
      swing_low_date: item?.swing_low_date ?? null,
      swing_high_date: item?.swing_high_date ?? null,
      swing_direction: item?.swing_direction ?? null,
      retracement_levels: { ...(item?.retracement_levels || {}) },
      extension_levels: { ...(item?.extension_levels || {}) },
      derivation_id: item?.derivation_id || null,
    };
  }

  function canonicalFibonacciHorizon(sourceBars, horizon, currentPrice, options = {}) {
    const config = FIBONACCI_HORIZON_CONFIG[horizon];
    const bars = sourceBars.slice(-config.max_lookback).slice(-config.lookback);
    const interval = config.source_timeframe;
    const sourceTimeframe = options.sourceTimeframe || config.source_timeframe;
    const fallbackUsed = Boolean(options.fallbackUsed);
    const fallbackReason = options.fallbackReason || null;
    const sourceHash = fibonacciSourceHash(bars);
    const base = {
      horizon,
      status: "insufficient_history",
      source_timeframe: sourceTimeframe,
      lookback_bars: config.lookback,
      data_window: `recent ${bars.length} ${interval} bars`,
      source_bar_count: bars.length,
      source_object_id: `fib:${horizon}:${sourceTimeframe}:${sourceHash}`,
      source_bar_hash: sourceHash,
      derivation_id: `fib:${horizon}:${sourceTimeframe}:${config.lookback}:${sourceHash}`,
      fallback_used: fallbackUsed,
      fallback_reason: fallbackReason,
      data_quality: bars.length >= config.min_lookback ? "partial" : "insufficient",
      pivot_method: `confirmed ${interval} pivots (${config.pivot_bars}/${config.pivot_bars})`,
      pivot_confirmation: `left ${config.pivot_bars} / right ${config.pivot_bars} bars confirmed`,
      swing_direction: null,
      swing_start_date: null,
      swing_end_date: null,
      swing_low: null,
      swing_low_date: null,
      swing_high: null,
      swing_high_date: null,
      swing_range: null,
      swing_range_pct: null,
      bars_since_swing_end: null,
      pivot_high_count: 0,
      pivot_low_count: 0,
      retracement_levels: {},
      extension_levels: {},
      current_price: Number.isFinite(currentPrice) ? currentPrice : null,
      current_position_ratio: null,
      current_position_label: null,
      nearest_level_below: null,
      nearest_level_above: null,
      distance_to_level_below_pct: null,
      distance_to_level_above_pct: null,
      invalidation_reason: null,
      explanation: `Insufficient ${interval} history to confirm an independently derived Fibonacci swing.`,
    };
    if (bars.length < config.min_lookback || !Number.isFinite(currentPrice)) return base;

    const highs = confirmedPivots(bars, "high", config.pivot_bars);
    const lows = confirmedPivots(bars, "low", config.pivot_bars);
    const candidates = [];
    lows.forEach((low) => highs.forEach((high) => {
      if (high.index <= low.index || high.index - low.index < config.min_pivot_separation) return;
      const range = high.price - low.price;
      if (range > 0 && range / low.price * 100 >= config.min_swing_pct) candidates.push({ direction: "up_swing", start: low, end: high, low: low.price, high: high.price, range });
    }));
    highs.forEach((high) => lows.forEach((low) => {
      if (low.index <= high.index || low.index - high.index < config.min_pivot_separation) return;
      const range = high.price - low.price;
      if (range > 0 && range / low.price * 100 >= config.min_swing_pct) candidates.push({ direction: "down_swing", start: high, end: low, low: low.price, high: high.price, range });
    }));
    // Select a current, confirmed structure deterministically.  No weighting
    // or recommendation score is involved in this technical calculation.
    const swing = candidates.sort((left, right) => right.end.index - left.end.index || right.range - left.range)[0];
    if (!swing) return {
      ...base,
      status: "no_valid_swing",
      data_quality: bars.every((bar) => bar.timestamp) ? "medium" : "low",
      pivot_high_count: highs.length,
      pivot_low_count: lows.length,
      explanation: "No confirmed swing met the Fibonacci time and range requirements.",
    };

    const retracementRatios = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];
    const extensionRatios = [1.272, 1.618, 2, 2.618];
    const retracementLevels = Object.fromEntries(retracementRatios.map((ratio) => {
      const price = swing.direction === "up_swing" ? swing.high - swing.range * ratio : swing.low + swing.range * ratio;
      return [(ratio * 100).toFixed(1), fibonacciLevel(ratio, price, "retracement", swing.direction, currentPrice)];
    }));
    const extensionLevels = Object.fromEntries(extensionRatios.map((ratio) => {
      const price = swing.direction === "up_swing" ? swing.low + swing.range * ratio : swing.high - swing.range * ratio;
      return [(ratio * 100).toFixed(1), fibonacciLevel(ratio, price, "extension", swing.direction, currentPrice)];
    }));
    const levels = [...Object.values(retracementLevels), ...Object.values(extensionLevels)].filter((level) => level.valid_for_display).sort((left, right) => left.price - right.price);
    const below = levels.filter((level) => level.price <= currentPrice).at(-1) || null;
    const above = levels.find((level) => level.price >= currentPrice) || null;
    const barsSinceSwingEnd = bars.length - 1 - swing.end.index;
    const stale = barsSinceSwingEnd > config.stale_after_bars;
    return {
      ...base,
      status: stale ? "stale_swing" : "available",
      swing_direction: swing.direction,
      swing_start_date: swing.start.date,
      swing_end_date: swing.end.date,
      swing_low: swing.low,
      swing_low_date: swing.direction === "up_swing" ? swing.start.date : swing.end.date,
      swing_high: swing.high,
      swing_high_date: swing.direction === "up_swing" ? swing.end.date : swing.start.date,
      swing_range: swing.range,
      swing_range_pct: swing.range / swing.low * 100,
      bars_since_swing_end: barsSinceSwingEnd,
      pivot_high_count: highs.length,
      pivot_low_count: lows.length,
      retracement_levels: retracementLevels,
      extension_levels: extensionLevels,
      current_position_ratio: swing.direction === "up_swing" ? (currentPrice - swing.low) / swing.range : (swing.high - currentPrice) / swing.range,
      current_position_label: below && above && below !== above ? `Between ${below.label} and ${above.label}` : below ? `Above ${below.label}` : above ? `Below ${above.label}` : "Outside selected swing range",
      nearest_level_below: below,
      nearest_level_above: above,
      distance_to_level_below_pct: below?.distance_from_current_pct ?? null,
      distance_to_level_above_pct: above?.distance_from_current_pct ?? null,
      invalidation_reason: swing.direction === "up_swing" && currentPrice < swing.low ? "current_price_below_up_swing_low" : swing.direction === "down_swing" && currentPrice > swing.high ? "current_price_above_down_swing_high" : null,
      data_quality: bars.every((bar) => bar.timestamp) ? "high" : "medium",
      explanation: `Confirmed ${swing.direction === "up_swing" ? "up" : "down"} swing from ${bars.length} ${interval} bars; independently derived technical structure.`,
    };
  }

  function canonicalFibonacciStructure(fourHourBars, dailyBars, weeklyBars, currentPrice) {
    const shortDailyConfirmation = canonicalFibonacciHorizon(dailyBars, "short_daily_confirmation", currentPrice);
    let shortTerm = canonicalFibonacciHorizon(fourHourBars, "short_term", currentPrice);
    if (!(["available", "stale_swing"].includes(shortTerm.status))) {
      // A source-unavailable Short calculation may use Daily structure only as
      // an explicit, inspectable fallback.  It is freshly calculated and never
      // references the Mid object.
      const fallback = canonicalFibonacciHorizon(dailyBars, "short_daily_confirmation", currentPrice, {
        sourceTimeframe: "1d",
        fallbackUsed: true,
        fallbackReason: fourHourBars.length ? "4h_no_valid_confirmed_swing" : "4h_source_unavailable",
      });
      shortTerm = {
        ...fallback,
        horizon: "short_term",
        source_object_id: `fib:short_term:1d-fallback:${fallback.source_bar_hash}`,
        derivation_id: `fib:short_term:1d-fallback:${fallback.lookback_bars}:${fallback.source_bar_hash}`,
      };
    }
    shortTerm = {
      ...shortTerm,
      secondary_confirmation: fibSecondarySummary(shortDailyConfirmation),
    };
    const midTerm = canonicalFibonacciHorizon(dailyBars, "mid_term", currentPrice);
    let longTerm = canonicalFibonacciHorizon(weeklyBars, "long_term", currentPrice);
    if (!(["available", "stale_swing"].includes(longTerm.status))) {
      const fallback = canonicalFibonacciHorizon(dailyBars, "long_daily_fallback", currentPrice, {
        sourceTimeframe: "1d",
        fallbackUsed: true,
        fallbackReason: weeklyBars.length ? "weekly_no_valid_confirmed_swing" : "weekly_history_unavailable",
      });
      longTerm = {
        ...fallback,
        horizon: "long_term",
        source_object_id: `fib:long_term:1d-fallback:${fallback.source_bar_hash}`,
        derivation_id: `fib:long_term:1d-fallback:${fallback.lookback_bars}:${fallback.source_bar_hash}`,
      };
    }
    return { short_term: shortTerm, mid_term: midTerm, long_term: longTerm };
  }

  function fibonacciFeatures(fibonacciStructure = {}, fourHourBars = [], dailyBars = [], weeklyBars = [], currentPrice = null) {
    // Server-side Fibonacci objects predate independent 4H/1D/1W horizons.
    // Keep the input parameter for API compatibility, but canonical features
    // always derive fresh immutable structures from the raw interval sources.
    void fibonacciStructure;
    const generatedStructure = canonicalFibonacciStructure(fourHourBars, dailyBars, weeklyBars, currentPrice);
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
        interval: item.source_timeframe || "unavailable",
        source_timeframe: item.source_timeframe || "unavailable",
        lookback_bars: item.lookback_bars ?? null,
        source_bar_count: item.source_bar_count ?? null,
        source_object_id: item.source_object_id || null,
        source_bar_hash: item.source_bar_hash || null,
        derivation_id: item.derivation_id || null,
        fallback_used: Boolean(item.fallback_used),
        fallback_reason: item.fallback_reason || null,
        secondary_confirmation: item.secondary_confirmation || null,
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
      };
    };
    return {
      short: normalize(generatedStructure.short_term),
      medium: normalize(generatedStructure.mid_term),
      long: normalize(generatedStructure.long_term),
      structure: { short_term: generatedStructure.short_term, mid_term: generatedStructure.mid_term, long_term: generatedStructure.long_term },
    };
  }

  function indicatorConfig() {
    return root.DecisionEngine?.config?.indicators || (typeof require !== "undefined" ? require("./decision-engine/config.js").indicators : null);
  }

  function regressionEndpoint(values) {
    if (!values.length || values.some((value) => !Number.isFinite(value))) return null;
    const n = values.length, xMean = (n - 1) / 2, yMean = mean(values);
    let numerator = 0, denominator = 0;
    values.forEach((value, index) => { numerator += (index - xMean) * (value - yMean); denominator += (index - xMean) ** 2; });
    return yMean + (denominator ? numerator / denominator : 0) * xMean;
  }

  function confirmedBy(bar, calculatedAt) {
    const end = timestampMillis(bar.end_timestamp), asOf = timestampMillis(calculatedAt);
    return bar.completed === true && end != null && asOf != null && end <= asOf;
  }

  // LazyBear's corrected BB multiplier and SMA(True Range) KC convention.
  // The regression is evaluated at the observed window endpoint, never ahead.
  function squeezeFeature(bars, interval, calculatedAt) {
    const cfg = indicatorConfig().squeeze, n = cfg.length, required = n + cfg.regressionLength - 1;
    const args = { indicator: "squeeze_momentum", interval, period: n, lookback: required, bars, calculatedAt };
    if (bars.length < required) return unavailableFeature(args);
    const closes = bars.map((bar) => bar.close), basis = smaSeries(closes, n);
    const ranges = bars.map((bar, i) => i ? Math.max(bar.high - bar.low, Math.abs(bar.high - bars[i - 1].close), Math.abs(bar.low - bars[i - 1].close)) : bar.high - bar.low);
    const rangeMeans = smaSeries(ranges, n), detrended = [], momentum = [], states = [];
    let lastRelease = null, releaseCount = 0, lastChannels = null;
    bars.forEach((bar, i) => {
      if (i < n - 1) { detrended.push(null); momentum.push(null); states.push(null); return; }
      const window = bars.slice(i - n + 1, i + 1), deviation = standardDeviation(closes.slice(i - n + 1, i + 1));
      const upper = basis[i] + cfg.bbMultiplier * deviation, lower = basis[i] - cfg.bbMultiplier * deviation;
      const kcUpper = basis[i] + cfg.kcMultiplier * rangeMeans[i], kcLower = basis[i] - cfg.kcMultiplier * rangeMeans[i];
      const state = lower > kcLower && upper < kcUpper ? "squeeze_on" : lower < kcLower && upper > kcUpper ? "squeeze_off" : "squeeze_neither";
      states.push(state);
      detrended.push(bar.close - (basis[i] + (Math.max(...window.map((x) => x.high)) + Math.min(...window.map((x) => x.low))) / 2) / 2);
      momentum.push(i >= required - 1 ? regressionEndpoint(detrended.slice(i - cfg.regressionLength + 1, i + 1)) : null);
      if (state === "squeeze_off" && states[i - 1] === "squeeze_on" && confirmedBy(bar, calculatedAt)) {
        lastRelease = { timestamp: bar.end_timestamp || bar.timestamp, bar_timestamp: bar.timestamp, age_bars: bars.length - 1 - i, confirmed: true }; releaseCount += 1;
      }
      lastChannels = { bb_upper: upper, bb_middle: basis[i], bb_lower: lower, kc_upper: kcUpper, kc_middle: basis[i], kc_lower: kcLower };
    });
    const value = last(momentum), change = (age) => Number.isFinite(valueAgo(momentum, age)) ? value - valueAgo(momentum, age) : null;
    const delta = change(1);
    return { ...metadata(args), value, momentum: value, change_1: delta, change_3: change(3), change_5: change(5),
      state: last(states), momentum_state: value >= 0 ? delta == null ? "positive" : delta >= 0 ? "positive_increasing" : "positive_decreasing" : delta == null ? "negative" : delta < 0 ? "negative_decreasing" : "negative_increasing",
      release: lastRelease, release_count: releaseCount, release_now: confirmedBy(last(bars), calculatedAt) && last(states) === "squeeze_off" && valueAgo(states, 1) === "squeeze_on",
      parameters: { bb_length: n, bb_multiplier: cfg.bbMultiplier, kc_length: n, kc_multiplier: cfg.kcMultiplier, kc_range_method: "sma_true_range", regression_length: cfg.regressionLength }, ...lastChannels };
  }

  function bollingerRsiFeature(bars, interval, horizon, rsi, bands, calculatedAt) {
    const cfg = indicatorConfig().bollingerRsi, bb = indicatorConfig().squeeze;
    const args = { indicator: "bollinger_rsi", interval, period: cfg.periods[horizon], lookback: Math.max(bb.length, cfg.periods[horizon] + 1), bars, calculatedAt };
    if (rsi.availability !== "available" || bands.availability !== "available") return unavailableFeature({ ...args, unavailableReason: "dependency_unavailable" });
    const series = rsi.series || [], closes = bars.map((bar) => bar.close), basis = smaSeries(closes, bb.length);
    let extension = null, event = null, state = "inside_bands", highExtension = 0, lowExtension = 0;
    for (let i = bb.length - 1; i < bars.length; i += 1) {
      if (!Number.isFinite(series[i])) continue;
      const deviation = standardDeviation(closes.slice(i - bb.length + 1, i + 1));
      const upper = basis[i] + bb.bbMultiplier * deviation, lower = basis[i] - bb.bbMultiplier * deviation;
      const high = closes[i] > upper && series[i] >= cfg.high, low = closes[i] < lower && series[i] <= cfg.low;
      state = high ? "upper_extension" : low ? "lower_extension" : "inside_bands";
      if (high || low) extension = { side: high ? "upper" : "lower", index: i, timestamp: bars[i].end_timestamp || bars[i].timestamp, repaired: false };
      else if (extension && !extension.repaired && i - extension.index <= cfg.repairBars && Number.isFinite(series[i - 1]) && closes[i] >= lower && closes[i] <= upper) {
        const repair = extension.side === "lower" ? series[i] > series[i - 1] : series[i] < series[i - 1];
        if (repair && confirmedBy(bars[i], calculatedAt)) {
          event = { state: extension.side === "lower" ? "lower_repair" : "upper_repair", timestamp: bars[i].end_timestamp, bar_timestamp: bars[i].timestamp, age_bars: bars.length - 1 - i, sign: extension.side === "lower" ? 1 : -1, confirmed: true };
          extension.repaired = true;
        }
      }
    }
    if (event && event.age_bars <= cfg.repairBars && state === "inside_bands") state = event.state;
    else if (event?.age_bars > cfg.repairBars) event = null;
    highExtension = Math.max(0, Math.min(100, (rsi.value - cfg.high) * 100 / (100 - cfg.high)));
    lowExtension = Math.max(0, Math.min(100, (cfg.low - rsi.value) * 100 / cfg.low));
    return { ...metadata(args), state, rsi: rsi.value, rsi_period: rsi.period, percent_b: bands.percent_b, upper_band: bands.upper_band, middle_band: bands.middle_band, lower_band: bands.lower_band,
      high_extension: highExtension, low_extension: lowExtension, repair: event, last_extension: extension ? { side: extension.side, timestamp: extension.timestamp, age_bars: bars.length - 1 - extension.index } : null,
      parameters: { bb_length: bb.length, bb_multiplier: bb.bbMultiplier, rsi_period: cfg.periods[horizon], low: cfg.low, high: cfg.high, repair_bars: cfg.repairBars } };
  }

  function supportResistanceFeature(bars, interval, supportingBars, supportingInterval, calculatedAt) {
    const cfg = indicatorConfig().structure, pivot = cfg.pivotBars[interval];
    const args = { indicator: "support_resistance", interval, period: pivot, lookback: pivot * 2 + 1, bars, calculatedAt };
    const asOf = timestampMillis(calculatedAt);
    const completed = bars.filter((bar) => bar.completed === true && timestampMillis(bar.end_timestamp) != null && (asOf == null || timestampMillis(bar.end_timestamp) <= asOf));
    if (completed.length < Math.max(pivot * 2 + 1, cfg.atrPeriod)) return unavailableFeature({ ...args, unavailableReason: bars.length && !completed.length ? "completion_metadata_unavailable" : "insufficient_history" });
    const atr = atrSeries(completed, cfg.atrPeriod), fast = emaSeries(completed.map((bar) => bar.volume), cfg.volumeFast), slow = emaSeries(completed.map((bar) => bar.volume), cfg.volumeSlow);
    const levels = [], events = [];
    const appendEvent = (level, kind, sign, bar, index, age, volumeOscillator, confirmationInterval) => {
      const event = { kind, sign, level_id: level.id, reference_price: level.price, reference_interval: interval, reference_known_at: level.known_at,
        confirmation_interval: confirmationInterval, age_interval: confirmationInterval, timestamp: bar.end_timestamp, bar_timestamp: bar.timestamp, age_bars: age, confirmed: true,
        volume_oscillator: volumeOscillator, volume_confirmed: Number.isFinite(volumeOscillator) ? volumeOscillator > cfg.volumeThreshold : null };
      events.push(event); if (events.length > cfg.maxEvents) events.shift();
      level.event = event; return event;
    };
    const observe = (bar, previous, index, scale, oscillator, confirmationInterval, age) => {
      if (!(scale > 0)) return;
      for (const level of levels) {
        if (!level.active || timestampMillis(level.known_at) > timestampMillis(bar.timestamp)) continue;
        const direction = level.original_role === "reduce" ? 1 : -1, buffer = cfg.breakAtr * scale;
        if (!level.break_at) {
          if (Math.abs(bar.close - level.price) <= cfg.retestAtr * scale) level.touches += 1;
          if (direction * (bar.close - level.price) > buffer && direction * (previous.close - level.price) <= buffer) {
            level.break_at = bar.end_timestamp; level.break_index = index; level.break_interval = confirmationInterval;
            const ev = appendEvent(level, direction > 0 ? "breakout_up" : "breakdown_down", direction, bar, index, age, oscillator, confirmationInterval);
            level.role = direction > 0 ? "support" : "reduce"; level.qualified = ev.volume_confirmed === true;
          }
        } else if (timestampMillis(bar.timestamp) >= timestampMillis(level.break_at)) {
          if (direction * (bar.close - level.price) < -buffer) {
            appendEvent(level, "failed_break", -direction, bar, index, age, oscillator, confirmationInterval); level.active = false; level.qualified = false;
          } else if (Math.abs((direction > 0 ? bar.low : bar.high) - level.price) <= cfg.retestAtr * scale && direction * (bar.close - level.price) > buffer && !level.retested) {
            appendEvent(level, direction > 0 ? "retest_up" : "retest_down", direction, bar, index, age, oscillator, confirmationInterval);
            level.retested = true; level.qualified = true; level.touches += 1;
          }
        }
      }
    };
    for (let i = 0; i < completed.length; i += 1) {
      const oscillator = slow[i] > 0 && Number.isFinite(fast[i]) ? (fast[i] / slow[i] - 1) * 100 : null;
      if (i) observe(completed[i], completed[i - 1], i, atr[i], oscillator, interval, completed.length - 1 - i);
      const j = i - pivot;
      if (j < pivot || j < completed.length - cfg.lookback) continue;
      const window = completed.slice(j - pivot, j + pivot + 1);
      for (const role of ["support", "reduce"]) {
        const key = role === "support" ? "low" : "high", value = completed[j][key];
        const isPivot = window.every((bar, k) => k === pivot || (role === "support" ? value <= bar[key] : value >= bar[key])) && window.some((bar) => bar[key] !== value);
        if (!isPivot) continue;
        // Equal-price plateaus identify one reference, not a stack of evidence.
        if (levels.some((level) => level.active && level.original_role === role && Math.abs(level.price - value) <= Math.max(1e-8, value * 1e-8))) continue;
        levels.push({ id: `${interval}:${completed[j].timestamp}:${role}`, price: value, original_role: role, role, pivot_at: completed[j].timestamp,
          known_at: completed[i].end_timestamp, interval, active: true, touches: 1, qualified: false, break_at: null, retested: false });
        if (levels.length > cfg.maxLevels) levels.shift();
      }
    }
    // Only completed supporting bars after the last completed primary bar may
    // confirm an earlier event against a reference already known at bar start.
    const primaryEnd = timestampMillis(last(completed).end_timestamp);
    const early = supportingBars.filter((bar) => bar.completed === true && timestampMillis(bar.timestamp) >= primaryEnd && timestampMillis(bar.end_timestamp) != null && (asOf == null || timestampMillis(bar.end_timestamp) <= asOf));
    const supportingFast = emaSeries(supportingBars.map((bar) => bar.volume), cfg.volumeFast), supportingSlow = emaSeries(supportingBars.map((bar) => bar.volume), cfg.volumeSlow);
    for (let i = 0; i < early.length; i += 1) {
      const index = supportingBars.indexOf(early[i]), previous = supportingBars[index - 1];
      if (!previous) continue;
      const oscillator = supportingSlow[index] > 0 && Number.isFinite(supportingFast[index]) ? (supportingFast[index] / supportingSlow[index] - 1) * 100 : null;
      observe(early[i], previous, completed.length + i, last(atr), oscillator, supportingInterval, early.length - 1 - i);
    }
    const compactLevel = (level) => ({ id: level.id, price: level.price, role: level.role, original_role: level.original_role, pivot_at: level.pivot_at, known_at: level.known_at, interval,
      active: level.active, touches: level.touches, qualified: level.break_at ? level.qualified : level.touches >= cfg.minimumTouches, break_at: level.break_at, retested: level.retested,
      last_event: level.event?.age_bars <= cfg.maxAge ? level.event : null });
    const availableLevels = levels.filter((level) => level.active).map(compactLevel);
    const activeEvents = events.filter((event) => event.age_bars <= cfg.maxAge && (event.kind === "failed_break" || availableLevels.some((level) => level.id === event.level_id)));
    return { ...metadata(args), state: activeEvents.at(-1)?.kind || "structure_ready", parameters: { pivot_left: pivot, pivot_right: pivot, break_atr: cfg.breakAtr, retest_atr: cfg.retestAtr, volume_fast: cfg.volumeFast, volume_slow: cfg.volumeSlow, volume_threshold: cfg.volumeThreshold, event_max_age: cfg.maxAge },
      confirmed_bars: completed.length, reference_interval: interval, supporting_interval: supportingInterval, levels: availableLevels,
      support: [...availableLevels].reverse().find((level) => level.role === "support") || null, resistance: [...availableLevels].reverse().find((level) => level.role === "reduce") || null,
      events: activeEvents, last_event: activeEvents.at(-1) || null, volume_oscillator: last(slow) > 0 && Number.isFinite(last(fast)) ? (last(fast) / last(slow) - 1) * 100 : null };
  }

  function horizonFeatureSet(horizon, sources, currentPrice, relativeStrength, fibonacci, calculatedAt) {
    const config = HORIZON_CONFIG[horizon];
    const indicators = { ema: {}, sma: {}, rsi: {}, macd: {}, adx: {}, atr: {}, kdj: {}, bollinger: {}, obv: {} };
    const use = (interval) => horizon === "long" && interval === "1d" && indicatorConfig().stability.completedLongDaily ? (sources[interval] || []).filter((bar) => bar.completed !== false) : sources[interval] || [];
    Object.entries(config.ema || {}).forEach(([interval, periods]) => periods.forEach((period) => { indicators.ema[`ema_${period}_${interval}`] = movingAverageFeature(use(interval), interval, period, "ema", currentPrice, calculatedAt); }));
    Object.entries(config.sma || {}).forEach(([interval, periods]) => periods.forEach((period) => { indicators.sma[`sma_${period}_${interval}`] = movingAverageFeature(use(interval), interval, period, "sma", currentPrice, calculatedAt); }));
    Object.entries(config.rsi || {}).forEach(([interval, periods]) => periods.forEach((period) => { indicators.rsi[`rsi_${period}_${interval}`] = rsiFeature(use(interval), interval, period, calculatedAt); }));
    Object.entries(config.macd || {}).forEach(([interval, params]) => { indicators.macd[`macd_${interval}`] = macdFeature(use(interval), interval, params, calculatedAt); });
    Object.entries(config.adx || {}).forEach(([interval, period]) => { indicators.adx[`adx_${period}_${interval}`] = adxFeature(use(interval), interval, period, calculatedAt); });
    Object.entries(config.atr || {}).forEach(([interval, period]) => { indicators.atr[`atr_${period}_${interval}`] = atrFeature(use(interval), interval, period, calculatedAt); });
    Object.entries(config.kdj || {}).forEach(([interval, period]) => { indicators.kdj[`kdj_${period}_${interval}`] = kdjFeature(use(interval), interval, period, calculatedAt); });
    Object.entries(config.bollinger || {}).forEach(([interval, params]) => { indicators.bollinger[`bollinger_${interval}`] = bollingerFeature(use(interval), interval, params, calculatedAt); });
    Object.entries(config.obv || {}).forEach(([interval, lookback]) => { indicators.obv[`obv_${interval}`] = obvFeature(use(interval), interval, lookback, calculatedAt); });
    const primaryInterval = config.primary_intervals[0], primaryBars = use(primaryInterval);
    const supportingInterval = horizon === "short" ? "1h" : horizon === "medium" ? "4h" : "1d";
    const squeeze = squeezeFeature(primaryBars, primaryInterval, calculatedAt);
    const comboPeriod = indicatorConfig().bollingerRsi.periods[horizon];
    const combo = bollingerRsiFeature(primaryBars, primaryInterval, horizon, indicators.rsi[`rsi_${comboPeriod}_${primaryInterval}`] || {}, indicators.bollinger[`bollinger_${primaryInterval}`] || {}, calculatedAt);
    const structure = supportResistanceFeature(primaryBars, primaryInterval, use(supportingInterval), supportingInterval, calculatedAt);
    const allMa = [...Object.values(indicators.ema), ...Object.values(indicators.sma)];
    const preferredMa = allMa.filter((feature) => feature.interval === (horizon === "short" ? "4h" : "1d"));
    const missing = Object.entries(indicators).filter(([, group]) => Object.keys(group).length && Object.values(group).every((feature) => feature.availability === "unavailable")).map(([key]) => key);
    return {
      horizon,
      horizon_label: config.label,
      indicator_version: indicatorConfig().version,
      trend_reference_price: horizon === "long" ? last(use("1d"))?.close ?? currentPrice : currentPrice,
      primary_intervals: config.primary_intervals,
      supporting_intervals: config.supporting_intervals,
      trend: { moving_averages: { ...indicators.ema, ...indicators.sma }, ma_structure: movingAverageStructure(preferredMa), adx: indicators.adx, support_resistance: structure },
      momentum: { rsi: indicators.rsi, macd: indicators.macd, kdj: indicators.kdj, squeeze },
      volatility: { atr: indicators.atr, bollinger: indicators.bollinger, bollinger_rsi: combo },
      participation: { obv: indicators.obv },
      relative_strength: relativeStrengthFeatures(relativeStrength, horizon),
      fibonacci: fibonacci[horizon],
      missing_families: missing,
      availability: missing.length === Object.keys(indicators).length ? "unavailable" : missing.length ? "partial" : "available",
    };
  }

  function buildTechnicalFeatures({ history = {}, currentPrice = null, relativeStrength = null, benchmarkContext = null, fibonacciStructure = {}, shareBase = null, calculatedAt = timestampNow() } = {}) {
    const daily = pickBars(history, "1d");
    const inputHelpers = root.CanonicalFeatureInputs || (typeof require !== "undefined" ? require("./decision-engine/feature-inputs.js") : null);
    relativeStrength = relativeStrength || (benchmarkContext && inputHelpers ? inputHelpers.relativeStrengthFromBars(daily, benchmarkContext) : {});
    const hourly = pickBars(history, "1h");
    // 4H is provider-native market data. Never reconstruct it from 1H, daily,
    // or any other interval: unavailable provider data must remain unavailable.
    const fourHour = pickBars(history, "4h");
    const weekly = completedWeeklyBars(daily, { asOf: history.as_of || calculatedAt, calendar: history.session_calendar });
    const sources = { "1h": hourly, "4h": fourHour, "1d": daily, "1w": weekly };
    const normalizedPrice = Number.isFinite(currentPrice) ? currentPrice : last(daily)?.close ?? null;
    const fibonacci = fibonacciFeatures(fibonacciStructure, fourHour.filter((bar) => bar.completed !== false), daily.filter((bar) => bar.completed !== false), weekly, normalizedPrice);
    const volume = canonicalVolumeFeature(daily, finite(shareBase), calculatedAt);
    const hourlySource = history.intervals?.["1h"] || history.by_interval?.["1h"] || history.intervals?.hourly || {};
    const fourHourSource = history.intervals?.["4h"] || history.by_interval?.["4h"] || {};
    const sourceIntervalMetadata = (interval, bars) => {
      const upstream = interval === "1h" ? hourlySource : interval === "4h" ? fourHourSource : history;
      const available = bars.length > 0;
      const unavailableReason = available ? null
        : interval === "4h" ? (upstream.unavailable_reason || "source_unavailable")
          : interval === "1w" ? (daily.length ? "insufficient_history" : "source_unavailable")
            : "source_unavailable";
      return {
        interval,
        bar_count: bars.length,
        availability: available ? "available" : "unavailable",
        available,
        unavailable_reason: unavailableReason,
        lookback: interval === "1d" ? (history.daily_history_metadata?.lookback || history.lookback || null) : interval === "1h" ? (hourlySource.lookback || null) : interval === "4h" ? (fourHourSource.lookback || null) : null,
        requested_history: upstream.requested_history || (interval === "1h" ? (hourlySource.lookback || null) : interval === "1d" ? (history.daily_history_metadata?.lookback || history.lookback || null) : interval === "4h" ? (fourHourSource.lookback || null) : null),
        first_bar_timestamp: bars[0]?.timestamp ?? null,
        last_bar_timestamp: last(bars)?.timestamp ?? null,
        as_of: upstream.as_of || history.as_of || calculatedAt,
        last_bar_completed: available ? last(bars)?.completed ?? upstream.last_bar_completed ?? upstream.bar_segments?.at(-1)?.completed ?? null : null,
        last_bar_end: last(bars)?.end_timestamp ?? null,
        provider_as_of: upstream.provider_as_of ?? null,
        last_bar_duration_minutes: upstream.last_bar_duration_minutes ?? (interval === "4h" ? fourHourSource.bar_segments?.at(-1)?.duration_minutes ?? null : null),
        active_bar_usage: upstream.active_bar_usage || "legacy_completion_metadata_unavailable",
        adjustment_basis: upstream.adjustment_basis || "unverified",
        currency: upstream.currency || history.currency || null,
        request: upstream.request || {},
        validation: bars.validation || null,
        rejected_reasons: upstream.rejected_reasons || {},
        weekly_completion: interval === "1w" ? { source: history.session_calendar?.source || "legacy_calendar_unavailable", excluded_weeks: history.session_calendar?.excluded_weeks ?? null } : null,
        source: interval === "1w" ? "completed_weekly_from_daily" : upstream.source || "unverified_provider",
        bar_method: interval === "4h" ? (fourHourSource.bar_method || null) : null,
        regular_hours_only: upstream.regular_hours_only ?? null,
        timezone: upstream.timezone || null,
        session_validation: interval === "4h" ? (fourHourSource.session_validation || null) : null,
      };
    };
    return {
      schema_version: SCHEMA_VERSION,
      calculated_at: calculatedAt,
      source_intervals: Object.fromEntries(Object.entries(sources).map(([interval, bars]) => [interval, sourceIntervalMetadata(interval, bars)])),
      horizons: {
        short: horizonFeatureSet("short", sources, normalizedPrice, relativeStrength, fibonacci, calculatedAt),
        medium: horizonFeatureSet("medium", sources, normalizedPrice, relativeStrength, fibonacci, calculatedAt),
        long: horizonFeatureSet("long", sources, normalizedPrice, relativeStrength, fibonacci, calculatedAt),
      },
      volume,
      price_position: pricePositionFeatures(daily, normalizedPrice, calculatedAt, history.daily_history_metadata || {}),
      fibonacci: { short: fibonacci.short, medium: fibonacci.medium, long: fibonacci.long },
      fibonacci_structure: fibonacci.structure,
      data_quality: {
        daily_history: daily.length >= 252 ? "available" : daily.length ? "partial" : "unavailable",
        intraday_history: hourly.length ? "available" : "unavailable",
        all_time_history: daily.length ? "available_history" : "unavailable",
        missing_intervals: Object.entries(sources).filter(([, bars]) => !bars.length).map(([interval]) => interval),
      },
    };
  }

  const api = { SCHEMA_VERSION, AVAILABILITY_REASONS, HORIZON_CONFIG, RVOL_THRESHOLDS, buildTechnicalFeatures, _test: { squeezeFeature, bollingerRsiFeature, supportResistanceFeature, regressionEndpoint, smaSeries, normalizeBars, completedWeeklyBars, rsiSeries, emaSeries, atrSeries, atrFeature, kdjFeature, macdFeature, adxFeature, bollingerFeature, obvFeature, pricePositionFeatures, canonicalVolumeFeature, canonicalFibonacciHorizon, canonicalFibonacciStructure } };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.CanonicalTechnicalFeatures = api;
}(typeof globalThis !== "undefined" ? globalThis : window));
