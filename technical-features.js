/*
 * Canonical technical feature layer.
 *
 * This file deliberately has no scoring or recommendation code. It converts
 * raw OHLCV histories into horizon-aware, machine-readable technical features.
 */
(function exposeCanonicalTechnicalFeatures(root) {
  "use strict";

  const SCHEMA_VERSION = "V2-daily-weekly";
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
    "source_data_conflict",
  ]);
  const RVOL_THRESHOLDS = Object.freeze([
    [0.6, "very_low"], [0.8, "low"], [1.2, "normal"], [1.5, "elevated"], [2.0, "high"], [Infinity, "extreme"],
  ]);
  const engineConfig = () => root.DecisionEngine?.config || (typeof require !== "undefined" ? require("./decision-engine/config.js") : null);
  const HORIZON_CONFIG = Object.freeze(Object.fromEntries(Object.entries(engineConfig().horizons).map(([key, value]) => [key, {
    ...value.features, label: value.label, primary_intervals: [value.primaryInterval], supporting_intervals: [], fibonacci_horizon: key,
  }])));
  const FIBONACCI_HORIZON_CONFIG = engineConfig().indicators.fibonacci;

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

  function normalizeBars(source = {}, { priceOnly = false } = {}) {
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
      if ((priceOnly ? [open, high, low, close] : [open, high, low, close, volume]).some((value) => value == null)) { reject("missing_or_nonfinite_ohlcv"); continue; }
      if (Math.min(open, high, low, close) <= 0) { reject("nonpositive_price"); continue; }
      if (!(low <= Math.min(open, close) && Math.max(open, close) <= high)) { reject("ohlc_envelope"); continue; }
      if (volume < 0 && !priceOnly) { reject("negative_volume"); continue; }
      const bar = { open, high, low, close, volume, timestamp: typeof timestamps[index] === "number" ? new Date(stamp).toISOString() : timestamps[index] };
      if (volume == null || volume < 0) bar.volume_available = false;
      if (source.volume_validation?.status === "conflict") {
        const dates = source.volume_validation.conflicting_dates;
        if (!Array.isArray(dates) || dates.includes(bar.timestamp.slice(0, 10))) bar.volume_available = false;
      }
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
    return interval === "1d" ? normalizeBars(intervals["1d"] || history.full_daily || history.daily || history, { priceOnly: true }) : [];
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
        current = { ...bar, volume: Number.isFinite(bar.volume) ? bar.volume : null, session_count: 1, week_key: key, last_day: new Date(bar.timestamp).getUTCDay() };
      } else {
        current.session_count += 1;
        current.high = Math.max(current.high, bar.high);
        current.low = Math.min(current.low, bar.low);
        current.close = bar.close;
        current.timestamp = bar.timestamp;
        current.end_timestamp = bar.end_timestamp;
        current.completed = current.completed === true && bar.completed === true;
        if (bar.volume_available === false) current.volume_available = false;
        current.last_day = new Date(bar.timestamp).getUTCDay();
        current.volume = Number.isFinite(current.volume) && Number.isFinite(bar.volume) ? current.volume + bar.volume : null;
      }
    });
    push();
    // Model features use completed weekly candles. A final Mon-Thu partial bar
    // stays unavailable rather than being treated as a completed weekly signal.
    if (calendar?.completed_week_keys) {
      const completed = new Set(calendar.completed_week_keys);
      return result.filter((bar) => completed.has(bar.week_key) && calendar.week_ends?.[bar.week_key] && timestampMillis(calendar.week_ends[bar.week_key])<=timestampMillis(asOf) && bar.session_count===calendar.session_counts?.[bar.week_key] && bar.completed === true && confirmedBy(bar, asOf)).map(({ last_day, week_key, ...bar }) => ({ ...bar, completed: true, end_timestamp: bar.end_timestamp || null }));
    }
    // Completion without an exchange calendar cannot account for holidays or missing sessions.
    return [];
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

  function validatedVolumeEma(bars, period) {
    // A conflicted observation cannot seed an EMA. Restart from the next
    // contiguous valid segment and require the normal full warm-up period.
    // This leaves price-event timestamps unchanged and never fills volume.
    const result = Array(bars.length).fill(null);
    let start = 0;
    for (let index = 0; index <= bars.length; index += 1) {
      if (index < bars.length && bars[index].volume_available !== false) continue;
      const values = emaSeries(bars.slice(start, index).map((bar) => bar.volume), period);
      values.forEach((value, offset) => { result[start + offset] = value; });
      start = index + 1;
    }
    return result;
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
    result[period] = loss === 0 ? gain === 0 ? 50 : 100 : 100 - (100 / (1 + gain / loss));
    for (let index = period + 1; index < values.length; index += 1) {
      const delta = values[index] - values[index - 1];
      gain = ((gain * (period - 1)) + Math.max(delta, 0)) / period;
      loss = ((loss * (period - 1)) + Math.max(-delta, 0)) / period;
      result[index] = loss === 0 ? gain === 0 ? 50 : 100 : 100 - (100 / (1 + gain / loss));
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
      source: source || (interval === "1w" ? "completed_weekly_from_daily" : "market_ohlcv"),
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
    const signalSeries = new Array(slow - 1).fill(null).concat(emaSeries(macdSeries.slice(slow - 1), signal));
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
      improving_bars: consecutiveChanges(histogramSeries, 1),
      weakening_bars: consecutiveChanges(histogramSeries, -1),
      ...metadata({ indicator: "macd", interval, period: `${fast}/${slow}/${signal}`, lookback: slow + signal, bars, calculatedAt }),
    };
  }

  function consecutiveChanges(values, sign) {
    let count=0;
    for (let i=values.length-1;i>0;i-=1) { if (!Number.isFinite(values[i]) || !Number.isFinite(values[i-1]) || sign*(values[i]-values[i-1])<=0) break; count+=1; }
    return count;
  }

  function adxFeature(bars, interval, period, calculatedAt) {
    const args={indicator:"adx",interval,period,lookback:period*2,bars,calculatedAt};
    if (bars.length<args.lookback) return unavailableFeature(args);
    const tr=[],plus=[],minus=[];
    for (let i=1;i<bars.length;i+=1) {const up=bars[i].high-bars[i-1].high,down=bars[i-1].low-bars[i].low;tr.push(Math.max(bars[i].high-bars[i].low,Math.abs(bars[i].high-bars[i-1].close),Math.abs(bars[i].low-bars[i-1].close)));plus.push(up>down&&up>0?up:0);minus.push(down>up&&down>0?down:0);}
    const smooth=(values)=>{const out=new Array(values.length).fill(null);let value=mean(values.slice(0,period));out[period-1]=value;for(let i=period;i<values.length;i+=1){value=(value*(period-1)+values[i])/period;out[i]=value;}return out;};
    const range=smooth(tr),up=smooth(plus),down=smooth(minus),diPlus=range.map((value,i)=>value>0?100*up[i]/value:null),diMinus=range.map((value,i)=>value>0?100*down[i]/value:null);
    const dx=diPlus.map((value,i)=>Number.isFinite(value)&&Number.isFinite(diMinus[i])?value+diMinus[i]>0?100*Math.abs(value-diMinus[i])/(value+diMinus[i]):0:null);
    const adxValues=new Array(period-1).fill(null).concat(smooth(dx.slice(period-1))),adx=last(adxValues),plusDi=last(diPlus),minusDi=last(diMinus);
    if (![adx,plusDi,minusDi].every(Number.isFinite)) return unavailableFeature({...args,unavailableReason:"dependency_unavailable"});
    return {adx,plus_di:plusDi,minus_di:minusDi,trend_strength:adx<15?"no_trend":adx<22?"weak":adx<30?"developing":adx<40?"strong":"very_strong",directional_bias:plusDi>minusDi?"bullish":minusDi>plusDi?"bearish":"neutral",slope:slopeState(adxValues,3),smoothing:"wilder",...metadata(args)};
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
    if (bars.some((bar) => bar.volume_available === false)) return unavailableFeature({ indicator: "obv", interval, period: null, lookback, bars, calculatedAt, unavailableReason: "source_data_conflict" });
    if (bars.length < lookback + 1 || bars.some((bar) => !Number.isFinite(bar.volume))) return unavailableFeature({ indicator: "obv", interval, period: null, lookback, bars, calculatedAt });
    const series = [0];
    for (let index = 1; index < bars.length; index += 1) series.push(series[index - 1] + (bars[index].close > bars[index - 1].close ? bars[index].volume : bars[index].close < bars[index - 1].close ? -bars[index].volume : 0));
    const slope = slopeState(series, lookback);
    const priceReturn = (last(bars).close / bars[bars.length - 1 - lookback].close - 1) * 100;
    const divergence = priceReturn > 0 && slope.change < 0 ? "bearish_divergence" : priceReturn < 0 && slope.change > 0 ? "bullish_divergence" : "none";
    return { raw_value: last(series), slope, trend: slope.state, divergence, price_obv_confirmation: divergence === "none" ? slope.state === "rising" ? "confirming_uptrend" : slope.state === "falling" ? "confirming_downtrend" : "neutral" : "divergent", ...metadata({ indicator: "obv", interval, period: null, lookback, bars, calculatedAt }) };
  }

  function canonicalVolumeFeature(bars, shareBase, calculatedAt, interval = "1d") {
    const cfg = indicatorConfig().volume, suffix = interval === "1w" ? "w" : "d", horizon = interval === "1w" ? "weekly" : "daily";
    const invalid = bars.some((bar) => bar.volume_available === false || !Number.isFinite(bar.volume) || bar.volume < 0);
    if (!bars.length || invalid) return { availability: "unavailable", interval, current_volume: null, unavailable_reason: invalid ? "source_data_conflict" : "insufficient_history" };
    const volumes = bars.map((bar) => bar.volume);
    // Weekly totals are valid OBV inputs; RVOL compares volume per actual trading session.
    const normalized = interval === "1w" ? bars.map((bar) => bar.session_count > 0 ? bar.volume / bar.session_count : null) : volumes;
    const averagesFor = (values) => Object.fromEntries(cfg.averageWindows.map((n) => [`avg_${n}${suffix}`, values.length >= n && values.slice(-n).every(Number.isFinite) ? mean(values.slice(-n)) : null]));
    const averages = averagesFor(volumes), rvolAverages = averagesFor(normalized), current = last(volumes);
    const rvol = Object.fromEntries(cfg.rvolWindows.map((n) => [`rvol_${n}${suffix}`, rvolAverages[`avg_${n}${suffix}`] > 0 ? last(normalized) / rvolAverages[`avg_${n}${suffix}`] : null]));
    const obvByLookback = Object.fromEntries([...new Set([...cfg.obvAuxiliaryWindows, cfg.obv[horizon].lookback])].map((n) => [`${suffix}${n}`, obvFeature(bars, interval, n, calculatedAt)]));
    const obv = obvByLookback[`${suffix}${cfg.obv[horizon].lookback}`];
    const ratio = (a,b) => rvolAverages[`avg_${b}${suffix}`] > 0 ? rvolAverages[`avg_${a}${suffix}`] / rvolAverages[`avg_${b}${suffix}`] : null;
    const fast = ratio(5,20), slow = ratio(20,60), trend = fast == null || slow == null ? "unavailable" : fast > 1.1 && slow > 1 ? "expanding" : fast < .9 && slow < 1 ? "contracting" : "stable";
    const rv = rvol[`rvol_20${suffix}`], latest = last(bars), prior = bars.at(-2);
    const confirmation = !prior || rv == null ? "unavailable" : latest.close > prior.close && rv >= 1.2 && obv.trend === "rising" ? "bullish_confirmation" : latest.close < prior.close && rv >= 1.2 && obv.trend === "falling" ? "bearish_confirmation" : "neutral";
    return {
      availability: "available", source: interval === "1w" ? "completed_weekly_from_daily" : cfg.source, interval, completed: true,
      calculation_timestamp: calculatedAt, last_bar_timestamp: latest.timestamp, last_bar_end: latest.end_timestamp,
      current_volume: current, session_count: latest.session_count || 1, moving_average_volume: averages,
      rvol_basis: interval === "1w" ? "volume_per_trading_session" : "completed_session_total", rvol_average_volume: rvolAverages,
      relative_volume: { ...rvol, displayed_rvol: rv, state: stateFromRvol(rv), thresholds: RVOL_THRESHOLDS.map(([limit,state]) => ({ less_than: Number.isFinite(limit) ? limit : null, state })) },
      turnover: { ...Object.fromEntries(["current", ...cfg.rvolWindows].map((n) => [`turnover_${n === "current" ? "current" : `${n}${suffix}_avg`}`, shareBase > 0 && Number.isFinite(n === "current" ? current : averages[`avg_${n}${suffix}`]) ? (n === "current" ? current : averages[`avg_${n}${suffix}`]) / shareBase * 100 : null])), share_base: shareBase, availability: shareBase > 0 ? "available" : "unavailable" },
      obv: { ...obv, by_lookback: obvByLookback, trends: Object.fromEntries(Object.entries(obvByLookback).map(([key,v]) => [key,{ trend:v.trend, slope:v.slope, divergence:v.divergence, price_obv_confirmation:v.price_obv_confirmation }])) },
      trend: { volume_ma5_vs_ma20: fast, volume_ma20_vs_ma60: slow, volume_trend: trend, volume_expanding: trend === "expanding", volume_contracting: trend === "contracting", price_volume_confirmation: confirmation },
      accumulation_distribution: obv.availability !== "available" ? "unavailable" : obv.trend === "rising" ? "accumulation" : obv.trend === "falling" ? "distribution" : "balanced",
    };
  }

  function pricePositionFeatures(bars, currentPrice, calculatedAt, dailyMetadata = {}, interval = "1d") {
    if (!bars.length || !Number.isFinite(currentPrice)) return { availability: "unavailable", high_52w: null, low_52w: null, all_time_high: null };
    const annual = bars.slice(-indicatorConfig().historyPosition.annualBars[interval==="1w"?"weekly":"daily"]);
    const maxItem = (items, key) => items.reduce((winner, item) => item[key] > winner[key] ? item : winner, items[0]);
    const minItem = (items, key) => items.reduce((winner, item) => item[key] < winner[key] ? item : winner, items[0]);
    const high52 = maxItem(annual, "high"); const low52 = minItem(annual, "low"); const ath = maxItem(bars, "high");
    const distance = (price, reference) => Number.isFinite(reference) && reference !== 0 ? (price / reference - 1) * 100 : null;
    const range = high52.high - low52.low;
    return {
      availability: annual.length >= 2 ? "available" : "partial",
      source: interval==="1w"?"completed_weekly_from_daily":"daily_ohlcv",
      interval,
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

  function relativeStrengthFeatures(input = {}, horizon, bars = [], benchmarkContext = {}, calendar = null, calculatedAt = null) {
    const cfg = indicatorConfig().relativeStrength[horizon], suffix = horizon === "weekly" ? "w" : "d", interval = horizon === "weekly" ? "1w" : "1d";
    const core = benchmarkContext.market_context || benchmarkContext.market_engine || benchmarkContext || {};
    const benchmarks = core.benchmark_history || {};
    const stockByDate = new Map(bars.map((bar) => [bar.timestamp.slice(0,10),bar.close]));
    const asOf = bars.at(-1)?.timestamp.slice(0,10);
    const returns = {}, vsSpy = {}, vsQqq = {};
    const ownReturn = (items,n) => items.length > n && items.at(-n-1)?.close > 0 ? (items.at(-1).close/items.at(-n-1).close-1)*100 : null;
    for (const n of cfg.windows) {
      returns[`stock_${n}${suffix}`] = ownReturn(bars,n);
      for (const name of ["spy","qqq"]) {
        let series = normalizeBars(benchmarks[name] || {}, { priceOnly:true }).filter((bar) => confirmedBy(bar, calculatedAt));
        if (horizon === "weekly") series = completedWeeklyBars(series,{ asOf:calculatedAt,calendar });
        const aligned = series.filter((bar) => stockByDate.has(bar.timestamp.slice(0,10)) && bar.timestamp.slice(0,10) <= asOf);
        let excess = null;
        if (aligned.at(-1)?.timestamp.slice(0,10) === asOf && aligned.length > n) {
          const start = aligned.at(-n-1).timestamp.slice(0,10), base = stockByDate.get(start);
          if (base > 0) excess = (stockByDate.get(asOf)/base-1)*100 - ownReturn(aligned,n);
        }
        // Named Daily return inputs are allowed only at the identical completed close.
        if (excess == null && horizon === "daily" && input.as_of === asOf) excess = finite(input[`stock_vs_${name}_${n}d`]);
        (name === "spy" ? vsSpy : vsQqq)[`${suffix}${n}`] = excess;
      }
    }
    const n = cfg.primary, spy = vsSpy[`${suffix}${n}`], qqq = vsQqq[`${suffix}${n}`], average = mean([spy,qqq]);
    const fast = mean([vsSpy[`${suffix}${cfg.windows[0]}`],vsQqq[`${suffix}${cfg.windows[0]}`]]), slow = mean([vsSpy[`${suffix}${cfg.windows.at(-1)}`],vsQqq[`${suffix}${cfg.windows.at(-1)}`]]);
    const consistency = fast == null || slow == null ? "unavailable" : fast > slow + 1 ? "improving" : fast < slow - 1 ? "deteriorating" : "stable";
    return { interval, period:`${n}${suffix}`, primary_lookback: n, as_of: asOf || null, source:"aligned_completed_stock_and_benchmark_bars", availability:average == null ? "unavailable" : "available", returns, vs_spy:vsSpy,vs_qqq:vsQqq,
      primary:{ stock_return:returns[`stock_${n}${suffix}`],vs_spy:spy,vs_qqq:qqq,average }, consistency:{ value:consistency,state:consistency },consistency_state:consistency,
      state:average == null ? "unavailable" : average > 3 ? "outperforming" : average < -3 ? "underperforming" : "neutral" };
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
      current_position_ratio: (currentPrice - swing.low) / swing.range,
      known_at: bars[swing.end.index + config.pivot_bars]?.end_timestamp || null,
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

  function canonicalFibonacciStructure(dailyBars, weeklyBars, currentPrice) {
    return { daily:canonicalFibonacciHorizon(dailyBars,"daily",currentPrice), weekly:canonicalFibonacciHorizon(weeklyBars,"weekly",currentPrice) };
  }

  function fibonacciFeatures(dailyBars, weeklyBars, currentPrice) {
    const generatedStructure = canonicalFibonacciStructure(dailyBars,weeklyBars,currentPrice);
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
        premium_discount: Number.isFinite(item.current_position_ratio) ? { ratio:item.current_position_ratio, state:item.current_position_ratio < .5 ? "discount" : item.current_position_ratio > .5 ? "premium" : "equilibrium", anchor_low:item.swing_low,anchor_high:item.swing_high,known_at:item.known_at || null } : { state:"unavailable",ratio:null },
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
    return { daily:normalize(generatedStructure.daily), weekly:normalize(generatedStructure.weekly),structure:generatedStructure };
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
    const cfg = indicatorConfig().structure, smcCfg = indicatorConfig().smc, horizon = interval === "1w" ? "weekly" : "daily", pivot = cfg.pivotBars[interval];
    const completed = bars.filter((bar) => confirmedBy(bar,calculatedAt));
    const args = { indicator:"support_resistance",interval,period:pivot,lookback:Math.max(pivot*2+1,cfg.atrPeriod+1),bars:completed,calculatedAt };
    if (completed.length < args.lookback) return unavailableFeature(args);
    const volumeBars=interval==="1w"?completed.map(bar=>({...bar,volume:bar.session_count>0?bar.volume/bar.session_count:null})):completed;
    const atr = atrSeries(completed,cfg.atrPeriod), fast = validatedVolumeEma(volumeBars,cfg.volumeFast), slow = validatedVolumeEma(volumeBars,cfg.volumeSlow);
    const levels = [], events = [], sweeps = [], pending = [], usedBreaks = new Set();
    let direction = 0, protectedLow = null, protectedHigh = null, lastBos = null, lastChoch = null;
    const age = (i) => completed.length-1-i;
    const event = (kind,sign,level,bar,i,scale) => {
      const value = { kind,sign,level_id:level.id,reference_price:level.price,reference_known_at:level.known_at,reference_interval:interval,confirmation_interval:interval,age_interval:interval,
        timestamp:bar.end_timestamp,bar_timestamp:bar.timestamp,age_bars:age(i),confirmed:true,atr_at_event:scale,
        volume_source:indicatorConfig().volume.source,volume_oscillator:slow[i]>0 && Number.isFinite(fast[i]) ? (fast[i]/slow[i]-1)*100 : null };
      value.volume_confirmed = value.volume_oscillator == null ? null : value.volume_oscillator > cfg.volumeThreshold;
      events.push(value); if (events.length > cfg.maxEvents) events.shift(); return value;
    };
    const capture = (level) => level ? { id:level.id,price:level.price,pivot_at:level.pivot_at,known_at:level.known_at,atr_at_known:level.atr_at_known,interval } : null;
    for (let i=0;i<completed.length;i+=1) {
      const bar=completed[i], previous=completed[i-1], scale=atr[i-1];
      const known = levels.filter((level) => level.active && timestampMillis(level.known_at) <= timestampMillis(bar.timestamp));
      if (previous && scale > 0) {
        // A protected reference belongs to the last confirmed directional break, not the latest arbitrary wick.
        if (direction > 0 && protectedLow && bar.close < protectedLow.price-smcCfg.ordinaryInvalidationAtr*protectedLow.atr_at_known) {
          lastChoch=event("choch_down",-1,protectedLow,bar,i,protectedLow.atr_at_known); direction=0;
        } else if (direction < 0 && protectedHigh && bar.close > protectedHigh.price+smcCfg.ordinaryInvalidationAtr*protectedHigh.atr_at_known) {
          lastChoch=event("choch_up",1,protectedHigh,bar,i,protectedHigh.atr_at_known); direction=0;
        }
        for (const level of known) {
          const sign=level.original_role === "reduce" ? 1 : -1;
          if (Math.abs(bar.close-level.price)<=cfg.retestAtr*scale) level.touches+=1;
          if (!usedBreaks.has(level.id) && sign*(bar.close-level.price)>cfg.breakAtr*scale && sign*(previous.close-level.price)<=cfg.breakAtr*scale) {
            usedBreaks.add(level.id); level.break_at=bar.end_timestamp;level.break_index=i;level.break_atr=scale;level.role=sign>0?"support":"reduce";
            // Opposite structural direction is a change of character. A later break or retest is required for a confirmed reversal.
            const opposite=direction !== 0 && direction!==sign || lastChoch?.timestamp === bar.end_timestamp;
            const ev=event(opposite ? sign>0?"choch_up":"choch_down" : sign>0?"bos_up":"bos_down",sign,level,bar,i,scale);
            level.event=ev;
            if (opposite) { lastChoch=ev;direction=0; }
            else { lastBos=ev;direction=sign;
              const reference=[...known].reverse().find((ref)=>ref.original_role===(sign>0?"support":"reduce") && ref.atr_at_known>0);
              if (sign>0) protectedLow=capture(reference); else protectedHigh=capture(reference);
            }
          } else if (level.break_at && i>level.break_index) {
            const retained=sign*(bar.close-level.price)>cfg.breakAtr*level.break_atr;
            if (!retained && sign*(bar.close-level.price)<-cfg.breakAtr*level.break_atr) { level.event=event("failed_break",-sign,level,bar,i,level.break_atr);level.active=false; }
            else if (!level.retested && Math.abs((sign>0?bar.low:bar.high)-level.price)<=cfg.retestAtr*level.break_atr && retained) {
              level.retested=true;level.qualified=true;level.event=event(sign>0?"retest_up":"retest_down",sign,level,bar,i,level.break_atr);
            }
          }
          if (!level.break_at && (sign>0 ? bar.high>level.price+smcCfg.sweepPenetrationAtr*scale : bar.low<level.price-smcCfg.sweepPenetrationAtr*scale)) {
            if (!pending.some((item)=>item.id===level.id)) pending.push({ ...capture(level),sign:-sign,index:i,atr_at_event:scale });
          }
        }
        for (let k=pending.length-1;k>=0;k-=1) {
          const candidate=pending[k], elapsed=i-candidate.index;
          if (elapsed>smcCfg.sweepReclaimBars[horizon]) { pending.splice(k,1);continue; }
          if (candidate.sign*(bar.close-candidate.price)>0) {
            sweeps.push({ ...candidate,kind:candidate.sign>0?"sweep_low":"sweep_high",timestamp:bar.end_timestamp,bar_timestamp:bar.timestamp,age_bars:age(i),confirmed:true,reclaim_bars:elapsed,invalidated:false });
            if (sweeps.length>cfg.maxEvents) sweeps.shift(); pending.splice(k,1);
          }
        }
        sweeps.forEach((item)=>{ if (item.sign*(bar.close-item.price)<-smcCfg.ordinaryInvalidationAtr*item.atr_at_event) item.invalidated=true; });
      }
      // New pivots become known only after the right-side confirmation close.
      const j=i-pivot;
      if (j>=pivot) {
        const window=completed.slice(j-pivot,j+pivot+1);
        for (const role of ["support","reduce"]) {
          const key=role==="support"?"low":"high",price=completed[j][key];
          if (!window.every((item,k)=>k===pivot || (role==="support"?price<=item[key]:price>=item[key])) || !window.some((item)=>item[key]!==price)) continue;
          if (levels.some((level)=>level.active && level.original_role===role && Math.abs(level.price-price)<=Math.max(1e-8,price*1e-8))) continue;
          levels.push({id:`${interval}:${completed[j].timestamp}:${role}`,price,original_role:role,role,pivot_at:completed[j].timestamp,known_at:bar.end_timestamp,atr_at_known:atr[i],active:true,touches:1,qualified:false,break_at:null,retested:false});
          if (levels.length>cfg.maxLevels) levels.shift();
        }
      }
    }
    const end=completed.at(-1), latestAtr=last(atr), activeLevels=levels.filter((level)=>level.active);
    const compact = (level) => ({...capture(level),role:level.role,original_role:level.original_role,active:true,touches:level.touches,qualified:level.retested || level.touches>=cfg.minimumTouches,break_at:level.break_at,retested:level.retested,last_event:level.event?.age_bars<=cfg.maxAge?level.event:null});
    const held = lastBos && lastBos.age_bars>=smcCfg.heldBars && lastBos.age_bars<=cfg.maxAge && direction===lastBos.sign && completed.slice(-lastBos.age_bars).every((bar)=>lastBos.sign*(bar.close-lastBos.reference_price)>cfg.breakAtr*lastBos.atr_at_event);
    const retest = events.filter((item)=>lastBos && item.level_id===lastBos.level_id && item.timestamp>lastBos.timestamp && item.kind===(direction>0?"retest_up":"retest_down") && item.age_bars<=cfg.maxAge && (!lastChoch || lastBos.timestamp>lastChoch.timestamp)).at(-1);
    const support=[...activeLevels].reverse().find((level)=>level.role==="support" && level.price<=end.close+cfg.retestAtr*latestAtr);
    const resistance=[...activeLevels].reverse().find((level)=>level.role==="reduce" && level.price>=end.close-cfg.retestAtr*latestAtr);
    const repairCount = (reference,sign) => {
      if (!reference) return 0; let count=0;
      for (let i=completed.length-1;i>0;i-=1) {
        const bar=completed[i],prior=completed[i-1],scale=atr[i-1];
        if (timestampMillis(reference.known_at)>timestampMillis(bar.timestamp) || !(scale>0)) break;
        const reclaim=sign*(bar.close-reference.price)>=0 && sign*(bar.close-prior.close)>0 && Math.abs((sign>0?bar.low:bar.high)-reference.price)<=cfg.retestAtr*scale;
        const stopping=sign*(bar.close-prior.close)>=0 && sign*(bar.close-bar.open)>=0 && sign*((sign>0?bar.low:bar.high)-(sign>0?prior.low:prior.high))>=0;
        if (!(reclaim || (stopping && sign*(bar.close-reference.price)>=0))) break;
        count+=1;
      } return count;
    };
    const activeEvents=events.filter((item)=>item.age_bars<=cfg.maxAge);
    return { ...metadata(args),confirmed_bars:completed.length,reference_interval:interval,supporting_interval:null,state:activeEvents.at(-1)?.kind || "structure_ready",
      parameters:{pivot_left:pivot,pivot_right:pivot,break_atr:cfg.breakAtr,retest_atr:cfg.retestAtr,event_max_age:cfg.maxAge,volume_fast:cfg.volumeFast,volume_slow:cfg.volumeSlow,volume_threshold:cfg.volumeThreshold,volume_source:indicatorConfig().volume.source},levels:activeLevels.map(compact),support:support?compact(support):null,resistance:resistance?compact(resistance):null,
      events:activeEvents,last_event:activeEvents.at(-1)||null,volume_oscillator:last(slow)>0?(last(fast)/last(slow)-1)*100:null,
      smc:{availability:"available",direction:direction>0?"bullish":direction<0?"bearish":"unconfirmed",last_bos:lastBos,last_choch:lastChoch,
        protected_low:protectedLow?{...protectedLow,active:direction>0 || lastChoch?.sign<0 && lastChoch.age_bars<=cfg.maxAge && (!lastBos || lastBos.timestamp<lastChoch.timestamp)}:null,
        protected_high:protectedHigh?{...protectedHigh,active:direction<0}:null,
        bullish_confirmed:direction>0 && Boolean(held || retest),bearish_confirmed:direction<0 && Boolean(held || retest),held_break:held?lastBos:null,
        bullish_retest:direction>0?retest||null:null,bearish_retest:direction<0?retest||null:null,
        support_repair_bars:repairCount(support,1),resistance_failure_bars:repairCount(resistance,-1),sweeps:sweeps.filter((item)=>item.age_bars<=smcCfg.sweepAge[horizon] && !item.invalidated),signal_as_of:end.end_timestamp },
    };
  }

  function fvgFeature(bars, interval, calculatedAt) {
    const cfg=indicatorConfig().fvg, atr=atrSeries(bars,indicatorConfig().structure.atrPeriod), gaps=[];
    for (let i=2;i<bars.length;i+=1) {
      const first=bars[i-2],middle=bars[i-1],third=bars[i],scale=atr[i-2],body=Math.abs(middle.close-middle.open),span=middle.high-middle.low;
      if (!(scale>0) || body<cfg.bodyAtr*scale || !(span>0) || body/span<cfg.bodyShare) continue;
      const sign=third.low>first.high && middle.close>middle.open?1:third.high<first.low && middle.close<middle.open?-1:0;
      if (!sign) continue;
      const low=sign>0?first.high:third.high,high=sign>0?third.low:first.low;
      if (high-low<cfg.minimumGapAtr*scale) continue;
      let status="untouched",fill=0;
      for (let j=i+1;j<bars.length;j+=1) {
        const bar=bars[j];fill=Math.max(fill,Math.max(0,Math.min(1,sign>0?(high-bar.low)/(high-low):(bar.high-low)/(high-low))));
        if (sign>0?bar.close<low:bar.close>high) {status="invalidated";break;}
        status=fill>=1?"filled":fill>0?"partial":"untouched";
      }
      gaps.push({side:sign>0?"bullish":"bearish",low,high,known_at:third.end_timestamp,age_bars:bars.length-1-i,status,fill_fraction:fill});
      if (gaps.length>cfg.maximumGaps) gaps.shift();
    }
    return {availability:bars.length>=indicatorConfig().structure.atrPeriod+2?"available":"unavailable",interval,source:"completed_three_bar_gap",shadow_only:true,used_for_decision:false,calculation_timestamp:calculatedAt,gaps};
  }

  function horizonFeatureSet(horizon, sources, currentPrice, relativeStrength, fibonacci, calculatedAt, volume, benchmarkContext, calendar) {
    const config=HORIZON_CONFIG[horizon], primaryInterval=config.primary_intervals[0], primaryBars=sources[primaryInterval] || [], referencePrice=last(primaryBars)?.close ?? null;
    const indicators={ema:{},sma:{},rsi:{},macd:{},adx:{},atr:{},kdj:{},bollinger:{},obv:{}};
    const use=(interval)=>sources[interval] || [];
    Object.entries(config.ema || {}).forEach(([interval, periods]) => periods.forEach((period) => { indicators.ema[`ema_${period}_${interval}`] = movingAverageFeature(use(interval), interval, period, "ema", referencePrice, calculatedAt); }));
    Object.entries(config.sma || {}).forEach(([interval, periods]) => periods.forEach((period) => { indicators.sma[`sma_${period}_${interval}`] = movingAverageFeature(use(interval), interval, period, "sma", referencePrice, calculatedAt); }));
    Object.entries(config.rsi || {}).forEach(([interval, periods]) => periods.forEach((period) => { indicators.rsi[`rsi_${period}_${interval}`] = rsiFeature(use(interval), interval, period, calculatedAt); }));
    Object.entries(config.macd || {}).forEach(([interval, params]) => { indicators.macd[`macd_${interval}`] = macdFeature(use(interval), interval, params, calculatedAt); });
    Object.entries(config.adx || {}).forEach(([interval, period]) => { indicators.adx[`adx_${period}_${interval}`] = adxFeature(use(interval), interval, period, calculatedAt); });
    Object.entries(config.atr || {}).forEach(([interval, period]) => { indicators.atr[`atr_${period}_${interval}`] = atrFeature(use(interval), interval, period, calculatedAt); });
    Object.entries(config.kdj || {}).forEach(([interval, period]) => { indicators.kdj[`kdj_${period}_${interval}`] = kdjFeature(use(interval), interval, period, calculatedAt); });
    Object.entries(config.bollinger || {}).forEach(([interval, params]) => { indicators.bollinger[`bollinger_${interval}`] = bollingerFeature(use(interval), interval, params, calculatedAt); });
    const policy=indicatorConfig().volume.obv[horizon], suffix=primaryInterval==="1w"?"w":"d";
    const obv=volume.obv?.by_lookback?.[`${suffix}${policy.lookback}`] || unavailableFeature({indicator:"obv",interval:primaryInterval,lookback:policy.lookback,bars:[],calculatedAt,unavailableReason:volume.unavailable_reason});
    indicators.obv[`obv_${primaryInterval}`]={...obv,source:volume.source,volume_source:indicatorConfig().volume.source,completed:volume.availability==="available"};
    const squeeze=squeezeFeature(primaryBars,primaryInterval,calculatedAt), period=indicatorConfig().bollingerRsi.periods[horizon];
    const combo=bollingerRsiFeature(primaryBars,primaryInterval,horizon,indicators.rsi[`rsi_${period}_${primaryInterval}`] || {},indicators.bollinger[`bollinger_${primaryInterval}`] || {},calculatedAt);
    const structure=supportResistanceFeature(primaryBars,primaryInterval,[],null,calculatedAt);
    const primaryPeriods=engineConfig().horizons[horizon].primaryMaPeriods;
    const allMa=[...Object.values(indicators.ema),...Object.values(indicators.sma)], preferred=allMa.filter((item)=>primaryPeriods.includes(item.period));
    const macdValue=indicators.macd[`macd_${primaryInterval}`];
    const improving=macdValue?.improving_bars || 0, weakening=macdValue?.weakening_bars || 0;
    const missing=Object.entries(indicators).filter(([,group])=>Object.keys(group).length && Object.values(group).every((item)=>item.availability!=="available")).map(([key])=>key);
    return {horizon,horizon_label:config.label,indicator_version:indicatorConfig().version,trend_reference_price:referencePrice,signal_as_of:last(primaryBars)?.end_timestamp || null,
      price_position:pricePositionFeatures(primaryBars,referencePrice,calculatedAt,{},primaryInterval),
      primary_intervals:config.primary_intervals,supporting_intervals:[],
      trend:{moving_averages:{...indicators.ema,...indicators.sma},ma_structure:movingAverageStructure(preferred),adx:indicators.adx,support_resistance:structure,smc:structure.smc || {availability:"unavailable"}},
      momentum:{rsi:indicators.rsi,macd:indicators.macd,kdj:indicators.kdj,squeeze,improving_bars:improving,weakening_bars:weakening},
      volatility:{atr:indicators.atr,bollinger:indicators.bollinger,bollinger_rsi:combo},participation:{obv:indicators.obv,volume},
      relative_strength:relativeStrengthFeatures(relativeStrength,horizon,primaryBars,benchmarkContext,calendar,calculatedAt),fibonacci:fibonacci[horizon],fvg:fvgFeature(primaryBars,primaryInterval,calculatedAt),
      missing_families:missing,availability:primaryBars.length?missing.length?"partial":"available":"unavailable"};
  }

  function buildTechnicalFeatures({history={},currentPrice=null,relativeStrength={},benchmarkContext={},shareBase=null,calculatedAt=null}={}) {
    calculatedAt=calculatedAt || history.as_of || timestampNow();
    if (Number.isFinite(timestampMillis(history.as_of)) && timestampMillis(history.as_of)<timestampMillis(calculatedAt)) calculatedAt=history.as_of;
    const rawDaily=pickBars(history,"1d"), daily=rawDaily.filter((bar)=>confirmedBy(bar,calculatedAt));
    const unknown=rawDaily.some((bar)=>bar.completed==null || (bar.completed===true && !bar.end_timestamp)), rejected=(rawDaily.validation?.rejected_rows || history.excluded_invalid_rows || 0)>0;
    const weekly=completedWeeklyBars(daily,{asOf:calculatedAt,calendar:history.session_calendar}),sources={"1d":daily,"1w":weekly};
    const calendar=history.session_calendar || {},neededDaily=engineConfig().horizons.daily.primaryMaPeriods.at(-1),neededWeekly=engineConfig().horizons.weekly.primaryMaPeriods.at(-1);
    const dailyGaps=(calendar.missing_session_dates || []).some((date)=>date>=daily.at(-neededDaily)?.timestamp?.slice(0,10));
    const completeWeeks=new Set(calendar.completed_week_keys || []);
    const weeklyGaps=(calendar.closed_week_keys || []).slice(-neededWeekly).some((key)=>!completeWeeks.has(key));
    const price=finite(currentPrice) ?? last(daily)?.close ?? null, fibonacci=fibonacciFeatures(daily,weekly,price);
    const validVolume=unknown || rejected?[]:daily,volume=canonicalVolumeFeature(validVolume,finite(shareBase),calculatedAt),weeklyVolume=canonicalVolumeFeature(unknown || rejected?[]:weekly,finite(shareBase),calculatedAt,"1w");
    if (unknown || rejected) {volume.unavailable_reason=weeklyVolume.unavailable_reason=unknown?"completion_metadata_unavailable":"invalid_source_data";}
    const latest=last(rawDaily);
    volume.current_session=latest?.completed===false && timestampMillis(latest.timestamp)<=timestampMillis(calculatedAt)?{date:latest.timestamp,volume:latest.volume_available===false?null:latest.volume,availability:latest.volume_available===false?"unavailable":"provisional",used_for_decision:false}:null;
    return {schema_version:SCHEMA_VERSION,calculated_at:calculatedAt,execution_window_end:history.execution_window_end || null,
      source_intervals:Object.fromEntries(Object.entries(sources).map(([interval,bars])=>[interval,{interval,bar_count:bars.length,availability:bars.length?"available":"unavailable",available:!!bars.length,source:interval==="1w"?"completed_weekly_from_daily":history.source || "unverified_provider",first_bar_timestamp:bars[0]?.timestamp || null,last_bar_timestamp:last(bars)?.timestamp || null,last_bar_end:last(bars)?.end_timestamp || null,last_bar_completed:bars.length?true:null,as_of:history.as_of || calculatedAt,provider_as_of:history.provider_as_of || null,active_bar_usage:"completed_only",adjustment_basis:history.adjustment_basis || "unverified",volume_validation:history.volume_validation || null,freshness:history.freshness || null,validation:rawDaily.validation,weekly_completion:interval==="1w"?{source:history.session_calendar?.source || "unavailable"}:null}])),
      horizons:Object.fromEntries(Object.keys(HORIZON_CONFIG).map((key)=>[key,horizonFeatureSet(key,sources,price,relativeStrength,fibonacci,calculatedAt,key==="weekly"?weeklyVolume:volume,benchmarkContext,history.session_calendar)])),
      volume,weekly_volume:weeklyVolume,price_position:pricePositionFeatures(daily,price,calculatedAt,history.daily_history_metadata || {}),fibonacci:{daily:fibonacci.daily,weekly:fibonacci.weekly},fibonacci_structure:fibonacci.structure,
      data_quality:{price_basis_unverified:!["provider_ohlc_auto_adjust_false","provider_chart_quote_ohlc"].includes(history.adjustment_basis || history.adjustmentBasis),required_history_gaps:{daily:dailyGaps,weekly:weeklyGaps},daily_freshness:history.freshness || null,decision_volume_conflicts:daily.some((bar)=>bar.volume_available===false)?["1d"]:[],volume_conflicts:daily.some((bar)=>bar.volume_available===false)?["1d"]:[],completion_unavailable:unknown,rejected_daily_rows:rawDaily.validation?.rejected_rows || 0,daily_history:daily.length>=252?"available":daily.length?"partial":"unavailable",all_time_history:daily.length?"available_history":"unavailable",missing_intervals:Object.entries(sources).filter(([,bars])=>!bars.length).map(([interval])=>interval)} };
  }

  const api = { SCHEMA_VERSION, AVAILABILITY_REASONS, HORIZON_CONFIG, RVOL_THRESHOLDS, buildTechnicalFeatures, _test: { squeezeFeature, bollingerRsiFeature, supportResistanceFeature, fvgFeature, relativeStrengthFeatures, regressionEndpoint, smaSeries, normalizeBars, completedWeeklyBars, rsiSeries, emaSeries, atrSeries, atrFeature, kdjFeature, macdFeature, adxFeature, bollingerFeature, obvFeature, pricePositionFeatures, canonicalVolumeFeature, canonicalFibonacciHorizon, canonicalFibonacciStructure } };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.CanonicalTechnicalFeatures = api;
}(typeof globalThis !== "undefined" ? globalThis : window));
