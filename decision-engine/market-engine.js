(function createMarketEngine(root) {
  "use strict";

  const engine = root.DecisionEngine || (root.DecisionEngine = {});
  const normalizeLabel = (value) => String(value || "").toLowerCase();
  function evaluate(marketContext = {}, metadata = {}) {
    const market = marketContext.market_engine || marketContext || {};
    const vix = Number(market.vix?.value ?? market.vix?.current_value);
    const fearGreed = normalizeLabel(market.fear_greed?.label ?? market.fearGreed?.label);
    const trend = market.equity_trend || {};
    const spyTrend = normalizeLabel(trend.spy?.trend);
    const qqqTrend = normalizeLabel(trend.qqq?.trend);
    const riskOff = vix >= 30 || fearGreed.includes("extreme fear") || (spyTrend === "falling" && qqqTrend === "falling");
    const riskOn = vix > 0 && vix < 20 && (spyTrend === "rising" || qqqTrend === "rising") && !fearGreed.includes("extreme greed");
    const earningsDate = metadata?.earningsDate || metadata?.earnings_date || null;
    const daysToEarnings = earningsDate ? Math.ceil((new Date(earningsDate).getTime() - Date.now()) / 86400000) : null;
    const earningsRisk = Number.isFinite(daysToEarnings) && daysToEarnings >= 0 && daysToEarnings <= 7;
    const directionAdjustment = riskOn ? 0.18 : riskOff ? -0.28 : 0;
    const riskAdjustment = (riskOff ? 0.35 : 0) + (earningsRisk ? 0.25 : 0) + (fearGreed.includes("extreme greed") ? 0.12 : 0);
    return {
      directionAdjustment,
      riskAdjustment,
      label: riskOff ? "risk_off" : riskOn ? "supportive" : "neutral",
      vix: Number.isFinite(vix) ? vix : null,
      fearGreed: market.fear_greed || market.fearGreed || {},
      spy: trend.spy || {},
      qqq: trend.qqq || {},
      earnings: { date: earningsDate, daysToEarnings, elevatedRisk: earningsRisk },
      reasons: [
        ...(riskOff ? ["Broad market conditions are risk-off."] : []),
        ...(riskOn ? ["SPY / QQQ conditions are supportive."] : []),
        ...(earningsRisk ? ["Earnings are close enough to increase execution risk."] : []),
      ],
    };
  }
  engine.market = Object.freeze({ evaluate });
}(globalThis));
