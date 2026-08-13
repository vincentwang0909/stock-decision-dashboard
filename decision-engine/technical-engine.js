(function createTechnicalEngine(root) {
  "use strict";

  const engine = root.DecisionEngine || (root.DecisionEngine = {});
  const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
  const firstAvailable = (group = {}) => Object.values(group).find((item) => item?.availability === "available") || {};
  const signed = (condition, positive = 1, negative = -1) => condition === true ? positive : condition === false ? negative : 0;

  function technicalState(features = {}, horizon = "short") {
    const featureSet = features?.horizons?.[engine.config.horizons[horizon].technicalKey] || {};
    const trend = featureSet.trend || {};
    const momentum = featureSet.momentum || {};
    const volatility = featureSet.volatility || {};
    const participation = featureSet.participation || {};
    const ma = trend.ma_structure || {};
    const rsi = firstAvailable(momentum.rsi);
    const macd = firstAvailable(momentum.macd);
    const adx = firstAvailable(trend.adx);
    const atr = firstAvailable(volatility.atr);
    const bands = firstAvailable(volatility.bollinger);
    const obv = firstAvailable(participation.obv);
    const rs = featureSet.relative_strength || {};
    const maDirection = ma.alignment?.includes("bullish") ? 1 : ma.alignment?.includes("bearish") ? -1 : 0;
    const macdDirection = macd.above_or_below_zero === "above" && macd.crossover_state !== "bearish_cross" ? 1 : macd.above_or_below_zero === "below" && macd.crossover_state !== "bullish_cross" ? -1 : 0;
    const rsiDirection = Number.isFinite(rsi.value) ? signed(rsi.value >= 55, 0.65, -0.65) : 0;
    const obvDirection = obv.trend === "rising" ? 0.45 : obv.trend === "falling" ? -0.45 : 0;
    const rsDirection = rs.state === "outperforming" ? 0.45 : rs.state === "underperforming" ? -0.45 : 0;
    const direction = clamp((maDirection * 0.36) + (macdDirection * 0.24) + (rsiDirection * 0.18) + (obvDirection * 0.12) + (rsDirection * 0.10), -1, 1);
    const confirmationInputs = [ma.alignment !== "unavailable", Number.isFinite(rsi.value), Number.isFinite(macd.histogram), Number.isFinite(adx.adx), obv.availability === "available", rs.availability === "available"];
    const confirmation = confirmationInputs.filter(Boolean).length / confirmationInputs.length;
    const trendStrength = Number.isFinite(adx.adx) ? clamp((adx.adx - 15) / 25, 0, 1) : 0.35;
    const extensionRisk = (Number.isFinite(rsi.value) && (rsi.value >= 75 || rsi.value <= 25)) || ["above_upper", "below_lower"].includes(bands.price_position) ? 0.7 : 0.2;
    const volatilityRisk = atr.volatility_regime === "high" || atr.volatility_regime === "extreme" ? 0.7 : atr.volatility_regime === "low" ? 0.25 : 0.45;
    const risk = clamp((extensionRisk * 0.45) + (volatilityRisk * 0.35) + ((1 - confirmation) * 0.20), 0, 1);
    const oversold = Boolean(rsi.oversold || bands.price_position === "below_lower");
    const overbought = Boolean(rsi.overbought || bands.price_position === "above_upper");
    const opportunity = oversold ? 0.65 : overbought ? -0.65 : direction * 0.35;
    const supporting = [];
    const limiting = [];
    if (maDirection > 0) supporting.push("Moving-average structure is constructive.");
    if (maDirection < 0) limiting.push("Moving-average structure is bearish.");
    if (macdDirection > 0) supporting.push("MACD confirms positive momentum.");
    if (macdDirection < 0) limiting.push("MACD remains below its bullish confirmation state.");
    if (obv.trend === "rising") supporting.push("OBV participation is improving.");
    if (obv.trend === "falling") limiting.push("OBV participation is deteriorating.");
    if (oversold) supporting.push("Price is technically stretched to the downside.");
    if (overbought) limiting.push("Price is technically extended to the upside.");
    return {
      direction,
      confirmation,
      risk,
      opportunity,
      atr: Number.isFinite(atr.value) ? atr.value : null,
      trendStrength,
      coverage: confirmation,
      supporting,
      limiting,
      raw: { ma, rsi, macd, adx, atr, bands, obv, relativeStrength: rs },
    };
  }

  engine.technical = Object.freeze({ evaluate: technicalState });
}(globalThis));
