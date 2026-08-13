/* Lightweight, testable presentation helpers for the Decision UI. */
(function createDecisionPresentation(root) {
  "use strict";

  const finite = (value) => Number.isFinite(Number(value)) ? Number(value) : null;
  const validRange = (range) => finite(range?.low) != null && finite(range?.high) != null;
  const actionIntent = Object.freeze({ strong_buy: "enter", buy: "enter", accumulate: "add", hold: "hold", trim: "reduce", sell: "exit", avoid: "avoid" });

  const REASONS = Object.freeze({
    obv_participation_improving: { en: "OBV participation is improving.", zh: "OBV 参与度正在改善。" },
    obv_participation_weakening: { en: "OBV participation is weakening.", zh: "OBV 参与度正在走弱。" },
    moving_average_structure_bearish: { en: "Moving-average structure is bearish.", zh: "均线结构偏空。" },
    moving_average_structure_bullish: { en: "Moving-average structure is bullish.", zh: "均线结构偏多。" },
    relative_strength_improving: { en: "Relative strength is improving.", zh: "相对强弱正在改善。" },
    relative_strength_deteriorating: { en: "Relative strength is deteriorating.", zh: "相对强弱正在恶化。" },
    bearish_exhaustion_developing: { en: "Downside exhaustion is developing.", zh: "下行衰竭迹象正在形成。" },
    bullish_exhaustion_developing: { en: "Upside exhaustion is developing.", zh: "上行衰竭迹象正在形成。" },
    market_regime_cautious: { en: "Market regime is cautious.", zh: "市场风险环境偏谨慎。" },
    market_regime_risk_off: { en: "Market regime is risk-off.", zh: "市场处于风险规避状态。" },
    price_below_major_trend: { en: "Price remains below major trend structure.", zh: "价格仍低于主要趋势结构。" },
    primary_moving_average_structure_is_constructive: { en: "Primary moving-average structure is constructive.", zh: "主要均线结构具有建设性。" },
    primary_macd_structure_supports_the_current_upside_direction: { en: "Primary MACD structure supports the current upside direction.", zh: "主要 MACD 结构支持当前上行方向。" },
    relative_strength_is_confirming_versus_the_selected_benchmarks: { en: "Relative Strength is confirming versus the selected benchmarks.", zh: "相对强弱正在确认并跑赢所选基准。" },
    obv_and_volume_participation_are_confirming_accumulation: { en: "OBV and volume participation are confirming accumulation.", zh: "OBV 与成交量参与度正在确认资金吸筹。" },
    several_technical_structures_form_nearby_support_confluence: { en: "Several technical structures form nearby support confluence.", zh: "多个技术结构在附近形成支撑共振。" },
    primary_moving_average_structure_remains_bearish: { en: "Primary moving-average structure remains bearish.", zh: "主要均线结构仍然偏空。" },
    primary_macd_structure_still_confirms_downside_momentum: { en: "Primary MACD structure still confirms downside momentum.", zh: "主要 MACD 结构仍在确认下行动量。" },
    relative_strength_is_lagging_its_relevant_benchmarks: { en: "Relative Strength is lagging its relevant benchmarks.", zh: "相对强弱落后于相关基准。" },
    obv_or_price_volume_behavior_indicates_distribution: { en: "OBV or price-volume behavior indicates distribution.", zh: "OBV 或量价行为显示派发迹象。" },
    price_is_extended_into_layered_resistance_rather_than_support: { en: "Price is extended into layered resistance rather than support.", zh: "价格延伸至多层阻力，而非支撑区域。" },
    volatility_or_extension_risk_is_elevated: { en: "Volatility or extension risk is elevated.", zh: "波动或价格延伸风险偏高。" },
    downside_exhaustion_is_developing_while_repair_evidence_is_appearing: { en: "Downside exhaustion is developing while repair evidence is appearing.", zh: "下行衰竭正在形成，同时出现修复证据。" },
    upside_is_extended_and_marginal_momentum_participation_is_weakening: { en: "Upside is extended and marginal momentum/participation is weakening.", zh: "上行已延伸，边际动量与参与度正在走弱。" },
    systemic_volatility_or_synchronized_index_breakdown_creates_a_market_shock: { en: "Systemic volatility or synchronized index breakdown creates a market shock.", zh: "系统性波动或指数同步破位形成市场冲击。" },
    spy_qqq_trend_or_volatility_backdrop_is_risk_off: { en: "SPY/QQQ trend or volatility backdrop is risk-off.", zh: "SPY／QQQ 趋势或波动背景处于风险规避状态。" },
    market_volatility_or_broad_trend_calls_for_more_cautious_execution: { en: "Market volatility or broad trend calls for more cautious execution.", zh: "市场波动或整体趋势要求更谨慎执行。" },
    "10y_yield_backdrop_is_restrictive_for_rate_sensitive_risk": { en: "10Y yield backdrop is restrictive for rate-sensitive risk.", zh: "10 年期收益率环境限制利率敏感型风险。" },
    earnings_proximity_raises_event_uncertainty: { en: "Earnings proximity raises event uncertainty.", zh: "财报临近提高事件不确定性。" },
  });

  function normalizeReason(reason) {
    if (reason && typeof reason === "object") return { code: String(reason.code || ""), text: String(reason.text || reason.label || ""), params: reason.params || {} };
    const text = String(reason || "");
    const code = text.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
    return { code, text, params: {} };
  }

  function translateReason(reason, language = "en") {
    const normalized = normalizeReason(reason);
    const matched = REASONS[normalized.code];
    if (matched) return matched[language === "zh" ? "zh" : "en"];
    return normalized.text || normalized.code || "—";
  }

  function reasonList(items, language = "en", maximum = 5) {
    return (Array.isArray(items) ? items : []).slice(0, maximum).map((item) => translateReason(item, language));
  }

  function executionSemantics(decision = {}) {
    const intent = decision.executionIntent || actionIntent[decision.action] || "hold";
    const labels = {
      enter: { range: "recommendedEntryRange", target: "targetRange", risk: "invalidation" },
      add: { range: "recommendedAddRange", target: "targetRange", risk: "invalidation" },
      hold: { range: "holdZone", target: "structuralReference", risk: null },
      reduce: { range: "recommendedReductionRange", target: "nextStructuralZone", risk: "riskReference" },
      exit: { range: "recommendedExitRange", target: "downsideStructuralTarget", risk: "recoveryInvalidation" },
      avoid: { range: "avoidNoEntry", target: null, risk: "structuralReference" },
    };
    return { intent, ...(labels[intent] || labels.hold) };
  }

  function priceMapModel({ currentPrice, decision = {} } = {}) {
    const current = finite(currentPrice);
    const execution = executionSemantics(decision);
    const points = [];
    if (validRange(decision.recommendedRange)) points.push({ id: "range", low: finite(decision.recommendedRange.low), high: finite(decision.recommendedRange.high), labelKey: execution.range });
    if (validRange(decision.targetRange)) points.push({ id: "target", low: finite(decision.targetRange.low), high: finite(decision.targetRange.high), labelKey: execution.target || "targetRange" });
    const invalidation = finite(decision.invalidation);
    if (invalidation != null) points.push({ id: "invalidation", value: invalidation, labelKey: execution.risk || "invalidation" });
    const structural = decision.debug?.recommendedRangeInputs?.structuralReference || decision.debug?.recommendedRangeInputs?.avoidReference;
    if (execution.intent === "avoid" && finite(structural?.center) != null) points.push({ id: "reference", value: finite(structural.center), labelKey: "structuralReference" });
    if (execution.intent === "hold") {
      if (finite(structural?.support) != null) points.push({ id: "support", value: finite(structural.support), labelKey: "structuralReference" });
      if (finite(structural?.resistance) != null) points.push({ id: "resistance", value: finite(structural.resistance), labelKey: "structuralReference" });
    }
    if (current != null) points.push({ id: "current", value: current, labelKey: "currentPrice" });
    const values = points.flatMap((point) => point.value != null ? [point.value] : [point.low, point.high]).filter(Number.isFinite);
    if (!values.length) return { execution, points: [], min: null, max: null, position: () => null };
    let min = Math.min(...values);
    let max = Math.max(...values);
    const padding = Math.max(Math.abs(current || max || 1) * 0.025, (max - min) * 0.12, 0.01);
    if (min === max) { min -= padding; max += padding; } else { min -= padding; max += padding; }
    const position = (value) => Math.max(0, Math.min(100, ((value - min) / (max - min)) * 100));
    return {
      execution,
      min,
      max,
      points: points.map((point) => point.value != null
        ? { ...point, position: position(point.value) }
        : { ...point, start: position(Math.min(point.low, point.high)), end: position(Math.max(point.low, point.high)) }),
      position,
    };
  }

  function positionGuidance(action, language = "en") {
    const messages = {
      strong_buy: { en: "High-conviction conditions and favorable execution support a more active allocation.", zh: "高一致性信号与有利执行条件支持更积极的仓位配置。" },
      buy: { en: "Current conditions support a normal entry.", zh: "当前条件支持正常介入。" },
      accumulate: { en: "Add exposure in stages rather than establishing a full position at once.", zh: "适合分批增加暴露，而非一次性建立完整仓位。" },
      hold: { en: "There is not enough evidence to add or reduce exposure now.", zh: "当前没有足够证据增加或减少风险暴露。" },
      trim: { en: "Risk/reward has deteriorated; consider reducing part of the exposure.", zh: "当前风险收益恶化，可考虑减少部分暴露。" },
      sell: { en: "The structure supports materially reducing risk exposure.", zh: "当前结构支持明显降低风险暴露。" },
      avoid: { en: "Current conditions do not support establishing a new position.", zh: "当前条件不适合建立新仓位。" },
    };
    return messages[action]?.[language === "zh" ? "zh" : "en"] || messages.hold[language === "zh" ? "zh" : "en"];
  }

  const api = Object.freeze({ actionIntent, executionSemantics, normalizeReason, translateReason, reasonList, priceMapModel, positionGuidance });
  root.DecisionPresentation = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
}(globalThis));
