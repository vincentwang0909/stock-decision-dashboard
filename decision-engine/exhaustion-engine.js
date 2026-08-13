(function createExhaustionEngine(root) {
  "use strict";

  const engine = root.DecisionEngine || (root.DecisionEngine = {});
  function evaluate(technical = {}) {
    const { rsi = {}, bands = {}, atr = {} } = technical.raw || {};
    const overbought = Boolean(rsi.overbought || bands.price_position === "above_upper");
    const oversold = Boolean(rsi.oversold || bands.price_position === "below_lower");
    const expandingVolatility = atr.expansion_state === "expanding";
    const score = overbought ? 0.8 : oversold ? -0.65 : expandingVolatility ? 0.35 : 0;
    return {
      score,
      label: overbought ? "overbought" : oversold ? "oversold" : expandingVolatility ? "expanding" : "neutral",
      limiting: overbought ? ["Momentum is extended; avoid chasing the current move."] : [],
      supporting: oversold ? ["Downside exhaustion can improve entry quality if structure stabilizes."] : [],
    };
  }
  engine.exhaustion = Object.freeze({ evaluate });
}(globalThis));
