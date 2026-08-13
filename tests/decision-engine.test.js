const assert = require("node:assert/strict");
const path = require("node:path");

for (const file of [
  "config.js", "technical-engine.js", "exhaustion-engine.js", "market-engine.js", "company-profile.js",
  "execution-engine.js", "confidence-engine.js", "stability-engine.js", "decision-engine.js",
]) require(path.join(__dirname, "..", "decision-engine", file));

const engine = globalThis.DecisionEngine;
const unavailable = { availability: "unavailable" };
const clone = (value) => JSON.parse(JSON.stringify(value));

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

function decide(features, marketInput = market(), ticker = "TEST", classification = { tags: ["MegaCap"] }) {
  return engine.decide({ ticker, price: 100, technicalFeatures: features, marketContext: marketInput, classification, metadata: {}, language: "en" });
}

function action(decision, horizon = "short") { return decision.horizons[horizon].action; }

// 1. Strong bullish + confirmation + attractive price => Buy / Strong Buy candidate.
engine.stability.clear();
let result = decide(featureSet(), market({ regime: "risk_on" }), "BULL");
assert(["strong_buy", "buy"].includes(action(result)), "strong bullish scenario should be actionable");

// 2. Extreme extension plus deterioration is not chased as a Buy.
engine.stability.clear();
const tiringMacd = { ...macd("bull"), histogram: 0.12, histogram_change_1: -0.32, histogram_change_3: -0.42, histogram_change_5: -0.50, crossover_state: "bearish_cross", improving_or_deteriorating: "deteriorating", state: "decelerating_bullish" };
const extendedFeatures = featureSet({ options: { short: { rsi: 88, kdj: 112, percentB: 1.42, adverse: true, participationTrend: "falling", divergence: "bearish_divergence", rvol: 3.6, macd: tiringMacd, earlyMacd: tiringMacd } } });
extendedFeatures.volume.trend = { volume_trend: "expanding", price_volume_confirmation: "bearish_confirmation" };
result = decide(extendedFeatures, market(), "EXT");
assert(["hold", "trim", "avoid"].includes(action(result)), "bullish exhaustion must block a chase Buy");

// 3. Bearish direction plus repaired downside exhaustion can Accumulate.
engine.stability.clear();
const washoutFeatures = featureSet({ short: "bear", options: { short: { rsi: 14, kdj: -8, percentB: -0.22, macd: macd("recover"), participationTrend: "rising", divergence: "bullish_divergence", rsConsistency: "stable", rvol: 3.4 } } });
washoutFeatures.price_position.low_52w = 99;
washoutFeatures.fibonacci_structure.short_term.retracement_levels.r382.price = 99;
washoutFeatures.fibonacci_structure.short_term.retracement_levels.r618.price = 98.9;
washoutFeatures.horizons.short.volatility.bollinger.bollinger_4h.lower_band = 99;
result = decide(washoutFeatures, market({ fearGreed: 15 }), "WASHOUT");
assert.equal(action(result), "accumulate", "bearish exhaustion with structural support should allow Accumulate");

// 4. Clear bearish breakdown sells; 5. neutral with extreme risk avoids.
engine.stability.clear();
result = decide(featureSet({ short: "bear" }), market(), "BREAK");
assert.equal(action(result), "sell");
engine.stability.clear();
result = decide(featureSet({ short: "neutral", options: { short: { atrPct: 12, atrPercentile: 97, percentB: 1.4, rvol: 4.2 } } }), market(), "RISK");
assert.equal(action(result), "avoid");

// 6. A recovering structure can reach Buy with confirmation and confluence.
engine.stability.clear();
result = decide(featureSet({ short: "recover" }), market({ regime: "risk_on" }), "RECOVER");
assert(["buy", "strong_buy"].includes(action(result)), "recovering structure with confirmation should be buyable");

// 7–8. Market cannot overwrite stock direction; Shock blocks Strong Buy.
engine.stability.clear();
result = decide(featureSet(), market({ regime: "shock" }), "SHOCK");
assert.notEqual(action(result), "strong_buy");
engine.stability.clear();
result = decide(featureSet({ short: "bear" }), market({ regime: "risk_on" }), "WEAK");
assert(!["strong_buy", "buy", "accumulate"].includes(action(result)), "Risk-On does not turn a weak stock into Buy");

// 9. Horizons are independent, with no voting/averaging.
engine.stability.clear();
result = decide(featureSet({ short: "bear", mid: "bull", long: "bull" }), market(), "MIXED");
assert.equal(action(result, "short"), "sell");
assert(["buy", "strong_buy"].includes(action(result, "mid")));
assert(["buy", "strong_buy"].includes(action(result, "long")));

// 10–11. Hysteresis holds through a small move but material shock may flip immediately.
engine.stability.clear();
let stable = engine.stability.evaluate({ ticker: "STABLE", horizon: "short", candidateAction: "buy", edge: 60, confidence: 72 });
stable = engine.stability.evaluate({ ticker: "STABLE", horizon: "short", candidateAction: "hold", edge: 36, confidence: 70 });
assert.equal(stable.finalAction, "buy");
stable = engine.stability.evaluate({ ticker: "STABLE", horizon: "short", candidateAction: "sell", edge: -72, confidence: 81, materialChangeReasons: ["market_shock"] });
assert.equal(stable.finalAction, "sell");

// 12–14. Individual RSI, ATR, or Fear & Greed cannot decide direction/action alone.
engine.stability.clear();
result = decide(featureSet({ short: "neutral", options: { short: { rsi: 88 } } }), market(), "RSI");
assert(!["buy", "sell"].includes(action(result)), "RSI extreme alone cannot create Buy/Sell");
engine.stability.clear();
result = decide(featureSet({ short: "neutral", options: { short: { atrPct: 9, atrPercentile: 94 } } }), market(), "ATR");
assert.equal(result.horizons.short.states.direction.label, "Neutral", "ATR alone cannot be bearish direction");
engine.stability.clear();
const fear = decide(featureSet({ short: "neutral" }), market({ fearGreed: 95 }), "FEAR_A");
engine.stability.clear();
const normalFear = decide(featureSet({ short: "neutral" }), market({ fearGreed: 50 }), "FEAR_B");
assert.equal(fear.horizons.short.states.direction.score, normalFear.horizons.short.states.direction.score, "Fear & Greed has no direction vote");

// 15. A stale entry zone causes an execution/action consistency correction.
const staleExecution = engine.execution.build({ price: 100, horizon: "short", action: "buy", technical: { atr: 1, directionScore: 70, executionContext: { support: { center: 60, members: [] }, resistance: null, levels: [] } } });
assert.equal(staleExecution.actionCorrection, "accumulate");

// 16. Missing core inputs reduce genuine data quality and confidence.
engine.stability.clear();
const complete = decide(featureSet(), market(), "QUALITY_A");
const missingFeatures = featureSet();
missingFeatures.horizons.short.momentum.macd = { macd_4h: unavailable, macd_1h: unavailable };
missingFeatures.horizons.short.trend.adx = { adx_14_4h: unavailable };
missingFeatures.horizons.short.momentum.rsi = { rsi_6_4h: unavailable };
const missing = decide(missingFeatures, market(), "QUALITY_B");
assert(missing.horizons.short.debug.dataQuality.score < complete.horizons.short.debug.dataQuality.score);
assert(missing.horizons.short.confidence < complete.horizons.short.confidence);

// 17. Tag aggregation stays within caps; review promotes only after persistence.
const profile = engine.companyProfile.build({ tags: ["HighGrowth", "HighBeta", "HighVolatility", "CrowdedLeader", "CashCow", "MarketLeader"] }, "CAP");
assert(profile.effectiveModifiers.riskSensitivity <= 1.15 && profile.effectiveModifiers.riskSensitivity >= 0.85);
assert(profile.effectiveModifiers.marketSensitivity <= 1.2 && profile.effectiveModifiers.marketSensitivity >= 0.8);
engine.companyProfile.clearReviews();
const firstReview = engine.companyProfile.review({ ticker: "REVIEW", observedDynamicTags: ["HighMomentum"], now: new Date("2025-01-01T00:00:00Z") });
const secondReview = engine.companyProfile.review({ ticker: "REVIEW", observedDynamicTags: ["HighMomentum"], now: new Date("2025-04-02T00:00:00Z") });
assert(firstReview.candidateTags.includes("HighMomentum"));
assert(secondReview.currentDynamicTags.includes("HighMomentum"));

// 18. Short fast noise changes Short, while Long ignores it because its inputs are Daily/Weekly.
engine.stability.clear();
const calm = featureSet({ short: "bull", mid: "bull", long: "bull" });
const noisy = clone(calm);
noisy.horizons.short.momentum.macd.macd_1h = macd("bear");
noisy.horizons.short.trend.moving_averages.ema_20_1h = ma(105, 20, "1h", "falling");
const calmDecision = decide(calm, market(), "LONG_NOISE_A");
engine.stability.clear();
const noisyDecision = decide(noisy, market(), "LONG_NOISE_B");
assert.notEqual(noisyDecision.horizons.short.states.direction.score, calmDecision.horizons.short.states.direction.score);
assert.equal(noisyDecision.horizons.long.states.direction.score, calmDecision.horizons.long.states.direction.score);

// 19. Correlated volatility observations are grouped: a wide band, high ATR
// percentile, and regime flag do not become independent extreme penalties.
const correlated = featureSet({ short: "neutral", options: { short: { atrPct: 6, atrPercentile: 95, rvol: 1.1 } } });
correlated.horizons.short.volatility.atr.atr_14_4h.volatility_regime = "high";
correlated.horizons.short.volatility.bollinger.bollinger_4h.bandwidth_percentile = 100;
engine.stability.clear();
const correlatedDecision = decide(correlated, market(), "CORRELATED_RISK");
assert(correlatedDecision.horizons.short.debug.riskComponents.volatility < 60, "correlated volatility group should not become extreme from percentile/width alone");
assert(correlatedDecision.horizons.short.states.risk.score < 50, "grouped volatility should not over-penalize one volatility episode");

// 20. First observation derives stability from canonical signal persistence,
// rather than treating no prior cached action as fully stable or unstable.
engine.stability.clear();
const weakFirst = engine.stability.evaluate({ ticker: "FIRST_WEAK", horizon: "short", candidateAction: "hold", edge: 0, confidence: 50, technical: { signalPersistence: { score: 43, components: { ma: 43 } } } });
const strongFirst = engine.stability.evaluate({ ticker: "FIRST_STRONG", horizon: "short", candidateAction: "hold", edge: 0, confidence: 50, technical: { signalPersistence: { score: 74, components: { ma: 74 } } } });
assert.equal(weakFirst.score, 43);
assert.equal(strongFirst.score, 74);
assert(weakFirst.score < strongFirst.score && weakFirst.firstObservation && strongFirst.firstObservation);

// 21–22. Hold is a neutral execution state, and Avoid is never rendered as a
// synthetic reduction/short plan just to fill a schema field.
const holdExecution = engine.execution.build({ price: 100, horizon: "short", action: "hold", technical: { atr: 2, executionContext: { support: { center: 98, members: [], confluence: 2 }, resistance: { center: 103, members: [], confluence: 2 }, levels: [] } } });
assert.equal(holdExecution.executionIntent, "hold");
assert.equal(holdExecution.targetRange, null);
assert.equal(holdExecution.invalidation, null);
const avoidExecution = engine.execution.build({ price: 100, horizon: "short", action: "avoid", technical: { atr: 2, executionContext: { support: null, resistance: null, levels: [] } } });
assert.equal(avoidExecution.executionIntent, "avoid");
assert.equal(avoidExecution.recommendedRange, null);
assert.equal(avoidExecution.targetRange, null);

// 23–24. Range centre remains structural while width is ATR-based but bounded;
// weak confluence cannot manufacture a giant, falsely precise entry range.
const wideLong = engine.execution.build({ price: 100, horizon: "long", action: "accumulate", technical: { atr: 30, directionScore: 55, executionContext: { support: { center: 97, members: [], confluence: 8 }, resistance: null, levels: [] } } });
assert((wideLong.recommendedRange.high - wideLong.recommendedRange.low) / 100 <= engine.config.execution.maxHalfWidthPct.long * 2 + 0.0001);
const weakConfluence = engine.execution.build({ price: 100, horizon: "mid", action: "buy", technical: { atr: 12, directionScore: 65, executionContext: { support: null, resistance: null, levels: [] } } });
assert.equal(weakConfluence.actionCorrection, "accumulate");
assert((weakConfluence.recommendedRange.high - weakConfluence.recommendedRange.low) / 100 <= engine.config.execution.maxHalfWidthPct.mid * 2 + 0.0001);

// 25–26. A normal small edge move remains hysteretic; a material shock bypasses
// it immediately instead of leaving a stale Buy locked in cache.
engine.stability.clear();
let perturbed = engine.stability.evaluate({ ticker: "PERTURB", horizon: "mid", candidateAction: "buy", edge: 60, confidence: 70, technical: { signalPersistence: { score: 66 } } });
perturbed = engine.stability.evaluate({ ticker: "PERTURB", horizon: "mid", candidateAction: "hold", edge: 37, confidence: 68, technical: { signalPersistence: { score: 65 } } });
assert.equal(perturbed.finalAction, "buy");
perturbed = engine.stability.evaluate({ ticker: "PERTURB", horizon: "mid", candidateAction: "sell", edge: -72, confidence: 80, materialChangeReasons: ["atr_volume_shock"], technical: { signalPersistence: { score: 65 } } });
assert.equal(perturbed.finalAction, "sell");

// 27–28. Market and tag modifiers are capped centrally, even if several tags
// or an event coincide.
const cappedMarket = engine.market.forHorizon({ regime: "shock", riskAddBase: 38, yield: { riskAdd: 12 }, earnings: { riskAdd: 20, confidencePenalty: 10 } }, "long", { effectiveModifiers: { marketSensitivity: 1.2, rateSensitivity: 1.15, eventSensitivity: 1.12 } });
assert(cappedMarket.riskAdd <= engine.config.market.maxRiskAdd.long);
const capProfile = engine.companyProfile.build({ tags: ["HighGrowth", "HighBeta", "HighVolatility", "CrowdedLeader", "CashCow", "MarketLeader", "EstablishedLeader", "RegulatoryRisk"] }, "CAP_ALL");
for (const key of ["riskSensitivity", "marketSensitivity", "exhaustionSensitivity", "normalAtrTolerance", "strongBuyOpportunity", "eventSensitivity"]) {
  const [low, high] = engine.config.profile.modifierCaps[["marketSensitivity", "exhaustionSensitivity"].includes(key) ? "special" : "normal"];
  assert(capProfile.effectiveModifiers[key] >= low && capProfile.effectiveModifiers[key] <= high, `${key} must remain capped`);
}

for (const decision of [complete, missing, calmDecision, noisyDecision]) {
  for (const horizonDecision of Object.values(decision.horizons)) {
    assert(engine.config.actions.includes(horizonDecision.action));
    assert.equal(typeof horizonDecision.confidence, "number");
    assert(["enter", "add", "hold", "reduce", "exit", "avoid"].includes(horizonDecision.executionIntent));
    assert.deepEqual(Object.keys(horizonDecision.states), ["direction", "confirmation", "risk", "priceOpportunity", "exhaustion"]);
    assert.equal(Object.hasOwn(horizonDecision, "score_breakdown"), false);
    assert.equal(Object.hasOwn(horizonDecision, "action_recommendation_score"), false);
    assert.equal(Object.hasOwn(horizonDecision.debug, "finalScore"), false);
    for (const key of ["directionComponents", "confirmationComponents", "riskComponents", "priceComponents", "exhaustionComponents", "marketRegime", "marketModifiers", "appliedTags", "effectiveProfileModifiers", "rawEdge", "adjustedEdge", "edgeBeforeMarket", "edgeAfterMarket", "candidateAction", "actionBeforeStability", "finalAction", "guardrails", "materialChangeReasons", "confidenceComponents", "recommendedRangeInputs", "targetInputs", "invalidationInputs", "dataQuality"]) assert(Object.hasOwn(horizonDecision.debug, key), `V1 debug field missing: ${key}`);
  }
}

// Performance guardrails: large raw indicator series remain in the canonical
// feature source, not in decisions or the bounded hysteresis cache.
const seriesFeatures = featureSet();
seriesFeatures.horizons.short.momentum.macd.macd_4h.macd_series = Array(20_000).fill(1);
engine.stability.clear();
const compactDecision = decide(seriesFeatures, market(), "SERIES_GUARD");
assert(Buffer.byteLength(JSON.stringify(compactDecision)) < 60_000, "decision output must not clone raw indicator history");
for (let index = 0; index < engine.config.stability.cacheLimit + 5; index += 1) engine.stability.evaluate({ ticker: `BOUND_${index}`, horizon: "short", candidateAction: "hold", edge: 0, confidence: 50 });
assert(engine.stability._cache.size <= engine.config.stability.cacheLimit, "stability cache must remain bounded");

console.log("decision-engine.test.js: 28 V1 scenario assertions passed");
