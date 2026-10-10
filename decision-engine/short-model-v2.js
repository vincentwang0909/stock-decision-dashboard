(function createStockShortV2(root) {
  "use strict";
  const engine = root.DecisionEngine;
  const clamp = (value, low = 0, high = 100) => Math.max(low, Math.min(high, value));
  const finite = (value) => value == null || typeof value === "boolean" || String(value).trim() === "" ? null : Number.isFinite(Number(value)) ? Number(value) : null;
  const available = (value) => value?.availability === "available";
  const round = (value) => engine.planningWidth.roundPrice(value);
  const mean = (values) => { const valid = values.filter(Number.isFinite); return valid.length ? valid.reduce((a, b) => a + b, 0) / valid.length : null; };
  const tanh = (value, scale) => Number.isFinite(value) ? 100 * Math.tanh(value / scale) : 0;
  const positive = (action) => ["strong_buy", "buy", "accumulate"].includes(action);
  const negative = (action) => ["trim", "sell"].includes(action);
  function blend(values, weights) {
    let numerator = 0, denominator = 0;
    values.forEach((value, index) => { if (Number.isFinite(value)) { numerator += value * weights[index]; denominator += weights[index]; } });
    return denominator ? numerator / denominator : 0;
  }
  function maScore(items, price, atr) {
    const { scales: s, groups } = engine.config.shortV2;
    const usable = items.filter((item) => available(item) && finite(item.value) != null).sort((a, b) => a.period - b.period);
    if (!usable.length) return null;
    const location = mean(usable.map((item) => tanh((price - item.value) / atr, s.maPrice))) || 0;
    const ordering = mean(usable.slice(1).map((item, index) => tanh((usable[index].value - item.value) / atr, s.maOrder))) || 0;
    const slopes = mean(usable.map((item) => finite(item.slope?.change) == null ? null : tanh(item.slope.change / Math.max(1, (item.slope.required_observations || 2) - 1) / atr, s.maSlope))) || 0;
    return clamp(location * groups.ma[0] + ordering * groups.ma[1] + slopes * groups.ma[2], -100, 100);
  }
  function macdScore(feature, atr) {
    if (!available(feature)) return { level: null, impulse: null, change: null };
    const { scales: s, groups } = engine.config.shortV2;
    return {
      level: finite(feature.macd_line) == null ? null : tanh(feature.macd_line / atr, s.macdLevel),
      impulse: finite(feature.histogram) == null ? null : tanh(feature.histogram / atr, s.macdImpulse),
      // Preserve the delivered V2 seed/missing-observation convention.
      change: finite(feature.histogram_change_3) == null ? null : tanh(((finite(feature.histogram_change_1) || 0) * groups.macdChange[0] + feature.histogram_change_3 * groups.macdChange[1] + (finite(feature.histogram_change_5) || 0) * groups.macdChange[2]) / atr, s.macdChange),
    };
  }
  function expandedZone(pair, atr) {
    const policy = engine.config.shortV2.policy;
    const support = pair.support, resistance = pair.resistance;
    const width = pair.opportunity.inputs.width, gap = pair.buffer;
    const limit = (resistance.center - support.center - gap) / 2;
    const entryWidth = Math.min(width + policy.near * atr, policy.extension * atr, limit);
    const exitWidth = Math.min(width + policy.near * atr, limit);
    return {
      support, resistance, width, gap,
      opportunityRange: { low: round(support.center - entryWidth), high: round(support.center + entryWidth) },
      reduceRange: { low: round(resistance.center - exitWidth), high: round(resistance.center + exitWidth) },
    };
  }
  function validPlanningZone(zone) {
    return engine.planningWidth.validLandscape(zone) && zone.reduceRange.low - zone.opportunityRange.high + 0.000001 >= zone.gap;
  }
  function prepare({ technicalFeatures, technical, price, market = {}, profile = {} }) {
    const config = engine.config.shortV2, s = config.scales, g = config.groups;
    const set = technicalFeatures?.horizons?.short || {}, raw = technical.raw || {};
    const atrValue = finite(raw.atr?.value), atr = atrValue > 0 ? atrValue : null;
    const mas = Object.values(set.trend?.moving_averages || {});
    const ma = atr ? maScore(mas.filter((item) => item.interval === "4h"), price, atr) : null;
    const earlyMa = atr ? maScore(mas.filter((item) => item.interval === "1h"), price, atr) : null;
    const mc = atr ? macdScore(set.momentum?.macd?.macd_4h, atr) : { level: null, impulse: null, change: null };
    const ec = atr ? macdScore(set.momentum?.macd?.macd_1h, atr) : { level: null, impulse: null, change: null };
    const rs = available(set.relative_strength) ? finite(technical.confirmationComponents?.relativeStrength?.score) : null;
    const obv = set.participation?.obv?.obv_4h || {};
    const obvTrend = available(obv) ? ({ rising: 100, falling: -100 }[obv.trend] || 0) : null;
    const divergence = available(obv) ? ({ bullish_divergence: 100, bearish_divergence: -100 }[obv.divergence] || 0) : null;
    const participationState = available(obv) ? ({ confirming_uptrend: 100, confirming_downtrend: -100 }[obv.price_obv_confirmation] || 0) : null;
    const participation = blend([obvTrend, divergence, participationState], g.obv);
    const rvol = finite(technicalFeatures.volume?.relative_volume?.displayed_rvol ?? technicalFeatures.volume?.relative_volume?.rvol_20d);
    const reliability = rvol == null ? s.rvolMissingReliability : clamp(s.rvolReliabilityBase + (rvol - s.rvolReliabilityOrigin) * s.rvolReliabilityScale, s.rvolReliabilityFloor, 1);
    const adx = technical.directionComponents?.adx?.available ? technical.directionComponents.adx.score : null;
    const acceleration = engine.technical.mixSqueeze(blend([mc.impulse, mc.change], g.acceleration), set.momentum?.squeeze, atr, "short", "acceleration");
    const momentum = engine.technical.mixSqueeze(blend([mc.level, mc.impulse, mc.change], g.macd), set.momentum?.squeeze, atr, "short");
    const early = blend([earlyMa, ec.impulse, ec.change], g.early);
    const direction = clamp(blend([ma, momentum, adx, early, rs], config.directionWeights), -100, 100);
    const rsi = finite(raw.rsi?.value), percentB = finite(raw.bands?.percent_b);
    const stretchHigh = Math.max(rsi == null ? 0 : clamp((rsi - s.oscillatorHigh) / (100 - s.oscillatorHigh)), percentB == null ? 0 : clamp((percentB - s.stretchBollingerHigh) * 100));
    const stretchLow = Math.max(rsi == null ? 0 : clamp((s.oscillatorLow - rsi) / s.oscillatorLow), percentB == null ? 0 : clamp((s.stretchBollingerLow - percentB) * 100));
    const combo = engine.config.indicators.integration.enabled && available(set.volatility?.bollinger_rsi) ? set.volatility.bollinger_rsi : {};
    const high = clamp(Math.max(finite(combo.high_extension) || 0, stretchHigh, rsi == null ? 0 : (rsi - s.stretchRsiHigh) * 100 / (100 - s.stretchRsiHigh)));
    const low = clamp(Math.max(finite(combo.low_extension) || 0, stretchLow, rsi == null ? 0 : (s.stretchRsiLow - rsi) * 100 / s.stretchRsiLow));
    const exhaustion = low * Math.max(0, acceleration) / 100 - high * Math.max(0, -acceleration) / 100;
    const riskParts = technical.riskComponents || {};
    const technicalRisk = clamp(clamp((riskParts.volatility || 0) * g.risk[0] + (riskParts.extension || 0) * g.risk[1] + (riskParts.eventShock || 0) * g.risk[2]) * clamp(profile.effectiveModifiers?.riskSensitivity || 1, s.profileRiskFloor, s.profileRiskCeiling));
    const days = finite(market.earnings?.daysToEarnings);
    const event = days != null && days >= 0 && days <= s.eventDays ? days <= s.immediateEventDays ? s.immediateEventRisk : s.nearEventRisk : 0;
    const confirmFor = (sign) => {
      const agree = (value) => Number.isFinite(value) ? clamp(50 + sign * value * 0.5) : null;
      const trendAgreement = engine.technical.eventConfirmation(blend([agree(ma), agree(momentum), agree(adx)], g.trendAgreement), set.trend?.support_resistance, sign);
      return clamp(blend([agree(rs), obvTrend == null ? null : clamp(50 + sign * participation * 0.5 * reliability), agree(early), trendAgreement], config.confirmationWeights));
    };
    const pivotLow = finite(raw.fibonacci?.swing_low);
    const structuralBreak = !!(["available", "stale_swing"].includes(raw.fibonacci?.status) && atr > 0 && pivotLow > 0 && price < pivotLow - s.breakBuffer * atr && (technical.baselineDirectionScore ?? technical.directionScore) <= s.baselineBreakDirection && (technical.baselineConfirmationScore ?? technical.confirmationScore) >= s.baselineBreakConfirmation);
    const original = engine.execution.buildLandscape({ price, horizon: "short", technical: { ...technical, useStructuralBreakdown: true, structuralBreakdown: { confirmed: structuralBreak } }, context: {
      risk: technical.riskScore, exhaustionScore: 0, marketModifiers: engine.market.forHorizon(market, "short", profile), profile, widthTransformEnabled: false,
      pairValidator: (pair) => validPlanningZone(expandedZone(pair, atr)),
    } });
    const inputs = original.debug?.priceLandscapeInputs || {};
    let zone = { valid: false, counts: inputs.candidateCounts || {} };
    if (original.priceLandscape?.opportunityRange && original.priceLandscape?.reduceRange) {
      zone = expandedZone({ support: inputs.selectedSupport, resistance: inputs.selectedReduce, opportunity: { inputs: inputs.opportunity }, buffer: inputs.neutralBuffer }, atr);
      zone.invalidation = Math.min(original.priceLandscape.invalidation, round(zone.opportunityRange.low - atr * s.breakBuffer));
      zone.quality = original.landscapeQuality.score;
      zone.counts = inputs.candidateCounts || {};
      zone.valid = validPlanningZone(zone);
    }
    return { price, atr, direction, upConfirmation: confirmFor(1), downConfirmation: confirmFor(-1), technicalRisk, risk: clamp(technicalRisk + event), exhaustion,
      event, days, quality: technical.dataQuality?.score || 0, pivotLow, structuralBreak,
      baselineDirection: technical.baselineDirectionScore ?? technical.directionScore, baselineConfirmation: technical.baselineConfirmationScore ?? technical.confirmationScore, zone,
      evidence: { ma, momentum, adx, early, relativeStrength: rs, participation, acceleration, macd: mc, rsi, percentB, rvol, volatility: riskParts.volatility || 0, extension: riskParts.extension || 0, eventShock: riskParts.eventShock || 0 },
      missingEvidence: [ma == null && "4h_ma", !available(set.momentum?.macd?.macd_4h) && "4h_macd", atr == null && "4h_atr", obvTrend == null && "4h_obv", rs == null && "relative_strength"].filter(Boolean),
      regime: market.regime || "unavailable", landscapeQuality: original.landscapeQuality,
    };
  }
  function evaluate(prepared, { widthTransformEnabled = engine.config.shortReduceWidth.enabled } = {}) {
    const p = prepared, policy = engine.config.shortV2.policy, s = engine.config.shortV2.scales;
    const zone = engine.planningWidth.transform(p.zone, { enabled: widthTransformEnabled, horizon: "short", breakdown: p.structuralBreak });
    let action = "hold", state = "INVALID_LANDSCAPE", why = "v2_wait", mode = "wait", room = null, rewardRisk = null;
    if (!p.atr || p.quality < s.qualityMinimum) { action = "hold"; why = "v2_missing"; }
    else if (p.structuralBreak) { action = "sell"; state = "BREAKDOWN_ZONE"; why = "v2_break"; mode = "defense"; }
    else if (!zone.valid) { action = "hold"; why = "v2_structure_missing"; }
    else {
      const o = zone.opportunityRange, r = zone.reduceRange;
      const toSupport = Math.max(o.low - p.price, p.price - o.high, 0) / p.atr;
      const toReduce = Math.max(r.low - p.price, p.price - r.high, 0) / p.atr;
      const near = Math.min(policy.near, (r.low - o.high) * s.nearNeutralShare / p.atr);
      room = (r.low - p.price) / p.atr;
      rewardRisk = Math.max(0, r.low - p.price) / Math.max(s.rewardRiskFloorAtr * p.atr, p.price - zone.invalidation);
      state = p.price >= o.low && p.price <= o.high ? "IN_OPPORTUNITY_ZONE" : p.price >= r.low && p.price <= r.high ? "IN_REDUCE_ZONE" : p.price > r.high ? "BEYOND_REDUCE_ZONE" : toSupport <= near ? "NEAR_OPPORTUNITY_ZONE" : toReduce <= near ? "NEAR_REDUCE_ZONE" : "NEUTRAL_ZONE";
      const entryLocation = toSupport === 0 && p.price < r.low && room >= s.minimumRoomAtr && Math.abs(p.price - zone.support.center) / p.atr <= policy.extension;
      const entryEvidence = (p.evidence.participation >= policy.entry || p.exhaustion > policy.exhaustionGate) && p.direction > s.entryDirectionFloor;
      const trendEntry = entryEvidence && p.upConfirmation >= policy.confirm && p.exhaustion > -policy.exhaustionGate;
      const eventBlocks = p.event >= s.nearEventRisk;
      if (entryLocation && trendEntry && p.risk <= policy.maxRisk && !eventBlocks && p.regime !== "shock") {
        mode = "trend"; why = "v2_entry";
        action = p.direction >= s.strongDirection && p.upConfirmation >= s.strongConfirmation && p.risk <= s.strongRisk && p.exhaustion > -s.strongExhaustion && rewardRisk >= s.strongRewardRisk ? "strong_buy" : p.direction >= s.buyDirection && p.upConfirmation >= s.buyConfirmation && rewardRisk >= s.buyRewardRisk ? "buy" : "accumulate";
      } else if (["IN_REDUCE_ZONE", "BEYOND_REDUCE_ZONE"].includes(state)) {
        if (p.direction <= policy.exit && p.downConfirmation >= policy.confirm) { action = p.direction < s.sellDirection ? "sell" : "trim"; why = "v2_weak_resistance"; mode = "reduce"; }
        else if (p.exhaustion <= -policy.exhaustionGate && p.evidence.acceleration < 0) { action = "trim"; why = "v2_exhausted_resistance"; mode = "reduce"; }
        else why = "v2_trend_resistance";
      } else if (eventBlocks) why = "v2_event";
      else if (entryLocation && p.regime === "shock") why = "v2_shock";
      else if (entryLocation && p.risk > policy.maxRisk) why = "v2_risk";
      else if (entryLocation) why = "v2_entry_unconfirmed";
      else why = "v2_location";
    }
    const confirmation = positive(action) ? p.upConfirmation : negative(action) ? p.downConfirmation : p.direction < 0 ? p.downConfirmation : p.upConfirmation;
    return { ...p, action, state, why, mode, room, rewardRisk, confirmation, zone, originalReduceHigh: p.zone.reduceRange?.high };
  }
  const texts = {
    v2_wait: "Evidence does not support a new action.", v2_missing: "Required technical evidence is unavailable.",
    v2_break: "Price broke confirmed swing support with bearish confirmation.", v2_structure_missing: "Independent price structures cannot form valid separated ranges.",
    v2_entry: "Trend and participation support entry inside structural support.", v2_weak_resistance: "Bearish evidence is confirmed in the reduce range.",
    v2_exhausted_resistance: "Price is stretched in the reduce range and marginal momentum is weakening.", v2_trend_resistance: "Resistance alone does not outweigh the continuing trend.",
    v2_event: "The recorded earnings window blocks a new entry.", v2_risk: "Entry location is suitable but execution risk exceeds the entry limit.",
    v2_entry_unconfirmed: "Support location is suitable but entry evidence is insufficient.", v2_location: "Current price lacks an entry location with sufficient room.",
    v2_shock: "A market shock blocks a new entry.",
  };
  function decide({ price, technicalFeatures, technical, market, profile, language, modelOptions = {} }) {
    const result = evaluate(prepare({ price, technicalFeatures, technical, market, profile }), modelOptions);
    const s = engine.config.shortV2.scales;
    const strength = positive(result.action) ? clamp(result.direction) : negative(result.action) ? clamp(-result.direction) : clamp(100 - Math.abs(result.direction));
    const agreement = positive(result.action) || negative(result.action) ? result.confirmation : clamp(100 - Math.abs(result.confirmation - 50) * s.holdConfirmationScale);
    const stability = technical.signalPersistence?.score || 0, weights = engine.config.confidence.weights;
    const components = { signalAgreement: round(agreement), actionStrength: round(strength), decisionStability: round(stability), dataQuality: result.quality };
    const base = agreement * weights.agreement + strength * weights.actionStrength + stability * weights.stability + result.quality * weights.dataQuality;
    const penalties = { event: result.event * s.eventConfidencePenalty, excessRisk: Math.max(0, result.risk - s.excessRiskStart) * s.excessRiskPenalty, landscape: result.landscapeQuality?.penalty || 0 };
    const tension = engine.config.indicators.confidence;
    penalties.priceTension = ["NEAR_OPPORTUNITY_ZONE", "NEUTRAL_ZONE", "NEAR_REDUCE_ZONE"].includes(result.state) && Math.abs(result.direction) >= tension.tensionStart
      ? engine.config.confidence.penalties.priceConflict * clamp((Math.abs(result.direction) - tension.tensionOrigin) / tension.tensionScale, tension.minimumTensionShare, 1) : 0;
    const confidence = Math.min(["v2_missing", "v2_structure_missing"].includes(result.why) ? engine.config.confidence.unavailableMaximum : 100, Math.round(clamp(base - penalties.event - penalties.excessRisk - penalties.landscape - penalties.priceTension)));
    let ranges = result.zone.valid && result.state !== "INVALID_LANDSCAPE" ? { opportunityRange: result.zone.opportunityRange, reduceRange: result.zone.reduceRange, invalidation: result.zone.invalidation, currentPrice: round(price) } : { opportunityRange: null, reduceRange: null, invalidation: null, currentPrice: round(price) };
    if (result.action === "sell" && result.structuralBreak) {
      const exit = { low: round(price - result.atr * s.exitHalfWidthAtr), high: round(price + result.atr * s.exitHalfWidthAtr) };
      ranges = { ...ranges, opportunityRange: ranges.opportunityRange?.high < exit.low ? ranges.opportunityRange : null, reduceRange: engine.planningWidth.validRange(exit) ? exit : null, invalidation: round(result.pivotLow + result.atr * s.breakBuffer) };
    } else if (negative(result.action) && result.zone.valid) {
      // Planning-width transformation never moves the pre-transform review threshold.
      ranges.invalidation = round(Math.max(price, result.originalReduceHigh) + result.atr * s.invalidBuffer);
    }
    const finalReason = { code: result.why, text: texts[result.why] };
    const supporting = positive(result.action) ? [finalReason] : [], limiting = positive(result.action) ? [] : [finalReason];
    const evidence = result.evidence, threshold = s.reasonEvidenceThreshold;
    if (evidence.ma > threshold) supporting.push({ code: "primary_moving_average_structure_is_constructive", text: "Primary moving-average structure is constructive." });
    if (evidence.relativeStrength > threshold) supporting.push({ code: "relative_strength_is_confirming_versus_the_selected_benchmarks", text: "Relative Strength is confirming versus the selected benchmarks." });
    if (evidence.participation > threshold) supporting.push({ code: "obv_and_volume_participation_are_confirming_accumulation", text: "OBV and volume participation are confirming accumulation." });
    if (evidence.ma < -threshold) limiting.push({ code: "primary_moving_average_structure_remains_bearish", text: "Primary moving-average structure remains bearish." });
    if (evidence.relativeStrength < -threshold) limiting.push({ code: "relative_strength_is_lagging_its_relevant_benchmarks", text: "Relative Strength is lagging its relevant benchmarks." });
    const signalSet = technicalFeatures?.horizons?.short || {};
    const sq = signalSet.momentum?.squeeze, structureEvent = signalSet.trend?.support_resistance?.last_event;
    if (available(sq) && sq.momentum > 0 && sq.change_3 > 0) supporting.push({ code: "squeeze_momentum_supports_upside", text: "Squeeze momentum is positive and strengthening." });
    if (available(sq) && sq.momentum < 0 && sq.change_3 < 0) limiting.push({ code: "squeeze_momentum_supports_downside", text: "Squeeze momentum is negative and strengthening." });
    if (structureEvent?.confirmed) (structureEvent.sign > 0 ? supporting : limiting).push({ code: structureEvent.sign > 0 ? "confirmed_structure_supports_upside" : "confirmed_structure_limits_upside", text: structureEvent.sign > 0 ? "An already-known structure has a confirmed upward event." : "An already-known structure has a confirmed downward or failed event." });
    const unavailable = ["v2_missing", "v2_structure_missing"].includes(result.why);
    const actionFamily = unavailable ? "unavailable" : result.structuralBreak ? "defensive" : positive(result.action) ? "opportunity" : negative(result.action) ? "reduce" : "neutral";
    const materialChangeReasons = [...(technical.materialSignals || []).filter((code) => code !== "major_support_breakdown"), ...(result.structuralBreak ? ["major_support_breakdown"] : []), ...(result.regime === "shock" ? ["market_shock"] : [])];
    return {
      horizon: "short", action: result.action, actionLabel: engine.actionLabel(result.action, language), confidence, executionIntent: engine.execution.executionIntent(result.action), priceLandscape: ranges,
      states: { direction: { score: Math.round(result.direction), label: result.direction >= s.directionLabelThreshold ? "Bullish" : result.direction <= -s.directionLabelThreshold ? "Bearish" : "Neutral" }, confirmation: { score: Math.round(result.confirmation), label: result.confirmation >= s.confirmationStrongLabel ? "Strong" : result.confirmation >= s.confirmationModerateLabel ? "Moderate" : "Weak" }, risk: { score: Math.round(result.risk), label: engine.config.risk.labels.find(([limit]) => result.risk < limit)?.[1] || "extreme" }, priceOpportunity: { score: round(result.rewardRisk == null ? 0 : clamp((result.rewardRisk - 1) * s.opportunityScoreScale, -100, 100)), label: result.room > s.opportunityRoomLabelAtr ? "Favorable" : "Fair" }, exhaustion: { score: Math.round(result.exhaustion), label: result.exhaustion > s.exhaustionLabelThreshold ? "Downside Exhaustion" : result.exhaustion < -s.exhaustionLabelThreshold ? "Upside Exhaustion" : "Neutral" } },
      profile, market: { ...market, horizonModifiers: { regime: result.regime, riskAdd: result.event, confidencePenalty: round(penalties.event), shock: result.regime === "shock", macroMultiplier: engine.config.shortV2.policy.macro } }, reasons: { supporting: supporting.slice(0, 5), limiting: limiting.slice(0, 5) },
      debug: { modelVersion: engine.config.version, pathVersion: engine.config.version, policyFamily: "stock_short", shortPolicy: { ...engine.config.shortV2.policy }, directionScore: round(result.direction), directionComponents: evidence,
        confirmationScore: round(result.confirmation), confirmationComponents: { upward: round(result.upConfirmation), downward: round(result.downConfirmation) }, riskScore: round(result.risk), riskComponents: { technical: result.technicalRisk, macro: 0, event: result.event }, exhaustionScore: round(result.exhaustion), exhaustionComponents: { gatedByRepair: true },
        structuralBreakdown: { confirmed: result.structuralBreak, reference: result.pivotLow, threshold: round(result.pivotLow == null ? null : result.pivotLow - result.atr * s.breakBuffer), baselineDirection: result.baselineDirection, baselineConfirmation: result.baselineConfirmation },
        priceState: result.state, actionFamily, priceStateFamily: engine.execution.actionFamilyForState(result.state), candidateAction: result.action, finalAction: result.action, decisionMode: result.mode, rewardRisk: round(result.rewardRisk), roomAtr: round(result.room), widthTransform: result.zone.widthTransform,
        confidenceComponents: { score: confidence, action: result.action, components, base: round(base), penalties, weights, profileConfidenceWeight: 0 },
        priceLandscapeInputs: { structureModel: "category_confluence_reused_stateless", selectedSupport: result.zone.support || null, selectedReduce: result.zone.resistance || null, neutralBuffer: round(result.zone.gap), candidateCounts: result.zone.counts || {}, policyStructure: engine.config.shortV2.policy.structure },
        indicatorAvailability: { squeeze: technicalFeatures?.horizons?.short?.momentum?.squeeze?.availability || "unavailable", structure: technicalFeatures?.horizons?.short?.trend?.support_resistance?.availability || "unavailable", bollingerRsi: technicalFeatures?.horizons?.short?.volatility?.bollinger_rsi?.availability || "unavailable" }, dataQuality: technical.dataQuality, missingEvidence: result.missingEvidence, landscapeQuality: result.landscapeQuality, guardrails: unavailable ? [result.why] : [], materialChangeReasons, stability: { score: stability, finalAction: result.action, source: "canonical_signal_persistence", identity: true },
      },
    };
  }
  engine.shortV2 = Object.freeze({ prepare, evaluate, decide, maScore, macdScore, blend });
}(globalThis));
