"use strict";
const clone = (value) => JSON.parse(JSON.stringify(value));
const unavailable = { availability: "unavailable" };

function ma(value, period, interval, slope = "rising") {
  return { availability: "available", indicator: "ema", period, interval, value, price_state: "above", slope: { state: slope } };
}

function macd(mode = "bull") {
  if (mode === "neutral") {
    return { availability: "available", macd_line: 0, signal_line: 0, histogram: 0, histogram_change_1: 0, histogram_change_3: 0, histogram_change_5: 0, above_or_below_zero: "at_zero", crossover_state: "none", improving_or_deteriorating: "stable", state: "neutral" };
  }
  const bull = mode === "bull" || mode === "recover";
  const recovering = mode === "recover";
  return {
    availability: "available", macd_line: bull ? 1.1 : -1.1, signal_line: bull ? 0.35 : -0.35,
    histogram: bull ? 0.75 : -0.75, histogram_change_1: recovering ? 0.20 : bull ? 0.12 : -0.12,
    histogram_change_3: recovering ? 0.34 : bull ? 0.18 : -0.18, histogram_change_5: recovering ? 0.42 : bull ? 0.22 : -0.22,
    above_or_below_zero: bull ? "above_zero" : "below_zero", crossover_state: recovering ? "bullish_cross" : bull ? "bullish_cross" : "bearish_cross",
    improving_or_deteriorating: recovering || bull ? "improving" : "deteriorating", state: recovering ? "recovering_bearish" : bull ? "accelerating_bullish" : "accelerating_bearish",
  };
}

function horizon(mode = "bull", options = {}) {
  const bull = mode === "bull" || mode === "recover";
  const neutral = mode === "neutral";
  const price = 100;
  const maValues = neutral ? [100.1, 100, 99.9] : bull ? [99, 97.8, 96.5] : [101, 102.2, 103.5];
  const slope = neutral ? "flat" : bull ? "rising" : "falling";
  const rsiValue = options.rsi ?? (neutral ? 50 : bull ? (mode === "recover" ? 54 : 63) : 37);
  const kdjValue = options.kdj ?? (neutral ? 50 : bull ? 66 : 34);
  const percentB = options.percentB ?? (neutral ? 0.5 : bull ? 0.55 : 0.42);
  const trend = neutral ? "stable" : bull ? "rising" : "falling";
  const divergence = options.divergence ?? "none";
  const participationTrend = options.participationTrend ?? trend;
  const adverse = options.adverse === true;
  const primaryInterval = options.primaryInterval || "1d";
  const earlyInterval = options.earlyInterval || "4h";
  const primaryMacd = options.macd || macd(mode);
  const earlyMacd = options.earlyMacd || macd(mode);
  return {
    trend: {
      moving_averages: {
        [`ema_20_${primaryInterval}`]: ma(maValues[0], 20, primaryInterval, slope),
        [`ema_50_${primaryInterval}`]: ma(maValues[1], 50, primaryInterval, slope),
        [`sma_100_${primaryInterval}`]: ma(maValues[2], 100, primaryInterval, slope),
        [`ema_20_${earlyInterval}`]: ma(maValues[0], 20, earlyInterval, slope),
        [`ema_50_${earlyInterval}`]: ma(maValues[1], 50, earlyInterval, slope),
      },
      ma_structure: { alignment: neutral ? "mixed" : bull ? (mode === "recover" ? "recovering" : "bullish") : "bearish" },
      adx: { [`adx_14_${primaryInterval}`]: neutral ? { availability: "available", adx: 13, plus_di: 20, minus_di: 20, slope: { state: "flat" } } : { availability: "available", adx: bull ? 37 : 41, plus_di: bull ? 39 : 9, minus_di: bull ? 10 : 40, slope: { state: slope } } },
    },
    momentum: {
      rsi: { [`rsi_${options.rsiPeriod || 14}_${primaryInterval}`]: { availability: "available", value: rsiValue, slope: { state: slope }, divergence: adverse ? (bull ? "bearish_divergence" : "bullish_divergence") : "none" }, [`rsi_6_4h`]: { availability: "available", value: rsiValue, slope: { state: slope }, divergence: "none" }, [`rsi_14_4h`]: { availability: "available", value: rsiValue, slope: { state: slope }, divergence: "none" }, [`rsi_21_1w`]: { availability: "available", value: rsiValue, slope: { state: slope }, divergence: "none" } },
      macd: { [`macd_${primaryInterval}`]: primaryMacd, [`macd_${earlyInterval}`]: earlyMacd, macd_4h: primaryMacd, macd_1h: earlyMacd, macd_1d: earlyMacd, macd_1w: primaryMacd },
      kdj: { [`kdj_9_${primaryInterval}`]: { availability: "available", k: kdjValue - 2, d: kdjValue - 4, j: kdjValue, state: trend, crossover_state: bull ? "bullish_cross" : "bearish_cross", slope: { state: slope } }, kdj_9_4h: { availability: "available", k: kdjValue - 2, d: kdjValue - 4, j: kdjValue, state: trend } },
    },
    volatility: {
      atr: { [`atr_14_${primaryInterval}`]: { availability: "available", value: options.atr ?? 1, atr_pct: options.atrPct ?? 1.1, atr_percentile_pct: options.atrPercentile ?? 42, volatility_regime: options.atrPct > 7 ? "high" : "normal", expansion_state: options.atrPct > 7 ? "expanding" : "stable", slope: { state: options.atrPct > 7 ? "rising" : "flat" } } },
      bollinger: { [`bollinger_${primaryInterval}`]: { availability: "available", lower_band: 98, middle_band: 100, upper_band: 102, percent_b: percentB, width: 4, width_percentile_pct: 45, squeeze_state: "normal" } },
    },
    participation: { obv: { [`obv_${primaryInterval}`]: { availability: "available", trend: participationTrend, divergence, price_obv_confirmation: participationTrend === "rising" ? "confirming_uptrend" : participationTrend === "falling" ? "confirming_downtrend" : "mixed" } } },
    relative_strength: {
      availability: "available", primary: { stock_return: options.stockReturn ?? (bull ? 12 : neutral ? 0 : -12), vs_spy: options.vsSpy ?? (bull ? 9 : neutral ? 0 : -9), vs_qqq: options.vsQqq ?? (bull ? 8 : neutral ? 0 : -8) },
      consistency: { state: options.rsConsistency ?? (bull ? "improving" : neutral ? "stable" : "deteriorating") },
    },
  };
}

function featureSet({ short = "bull", mid = "bull", long = "bull", options = {} } = {}) {
  const shortSet = horizon(short, { ...options.short, primaryInterval: "4h", earlyInterval: "1h", rsiPeriod: 6 });
  const mediumSet = horizon(mid, { ...options.mid, primaryInterval: "1d", earlyInterval: "4h", rsiPeriod: 14 });
  const longSet = horizon(long, { ...options.long, primaryInterval: "1w", earlyInterval: "1d", rsiPeriod: 21 });
  // The canonical long MA family is intentionally Daily while MACD/ADX/RSI are Weekly.
  longSet.trend.moving_averages = { ...horizon(long, { ...options.long, primaryInterval: "1d", earlyInterval: "1d", rsiPeriod: 21 }).trend.moving_averages };
  return {
    availability: "available", horizons: { short: shortSet, medium: mediumSet, long: longSet },
    volume: { availability: "available", current_volume: 1_500_000, average_volume: 1_000_000, relative_volume: { displayed_rvol: options.rvol ?? 1.45, rvol_20d: options.rvol ?? 1.45 }, trend: { volume_trend: "expanding", price_volume_confirmation: "bullish_confirmation" } },
    price_position: { availability: "available", high_52w: 120, low_52w: 80, position_52w_pct: 50, state: "mid_range" },
    fibonacci_structure: {
      short_term: { status: "available", swing_low: 97, swing_high: 112, retracement_levels: { r382: { price: 99, label: "38.2%" }, r618: { price: 98.5, label: "61.8%" } }, extension_levels: { e127: { price: 116, label: "127.2%" } } },
      mid_term: { status: "available", swing_low: 94, swing_high: 120, retracement_levels: { r382: { price: 99, label: "38.2%" }, r618: { price: 97.5, label: "61.8%" } }, extension_levels: { e127: { price: 126, label: "127.2%" } } },
      long_term: { status: "available", swing_low: 82, swing_high: 125, retracement_levels: { r382: { price: 99, label: "38.2%" }, r618: { price: 96, label: "61.8%" } }, extension_levels: { e127: { price: 136, label: "127.2%" } } },
    },
  };
}

function market({ regime = "normal", fearGreed = 50, vix = 18 } = {}) {
  const falling = regime === "risk_off" || regime === "shock";
  const rising = regime === "risk_on";
  return { market_context: {
    vix: { value: regime === "shock" ? Math.max(40, vix) : regime === "risk_off" ? Math.max(30, vix) : vix, change_5d: regime === "shock" ? 12 : 0, change_20d: regime === "shock" ? 18 : 0, trend: falling ? "rising" : "neutral" },
    equity_trend: { spy: { trend: falling ? "falling" : rising ? "rising" : "neutral", change_5d_pct: falling ? -4 : rising ? 3 : 0, change_20d_pct: falling ? -8 : rising ? 5 : 0, change_60d_pct: falling ? -12 : rising ? 8 : 0, change_120d_pct: falling ? -15 : rising ? 12 : 0 }, qqq: { trend: falling ? "falling" : rising ? "rising" : "neutral", change_5d_pct: falling ? -5 : rising ? 4 : 0, change_20d_pct: falling ? -9 : rising ? 6 : 0, change_60d_pct: falling ? -13 : rising ? 10 : 0, change_120d_pct: falling ? -16 : rising ? 14 : 0 } },
    fear_greed: { value: fearGreed, label: fearGreed >= 80 ? "Extreme Greed" : fearGreed <= 20 ? "Extreme Fear" : "Neutral" }, ten_year_yield: { value: 4.2, change_5d_bps: 0, change_20d_bps: 0, trend: "neutral" },
  } };
}


module.exports = { ma, macd, featureSet, market };
