(function createExecutionEngine(root) {
  "use strict";

  const engine = root.DecisionEngine || (root.DecisionEngine = {});
  const finiteRange = (low, high) => Number.isFinite(low) && Number.isFinite(high) ? { low: Math.min(low, high), high: Math.max(low, high) } : { low: null, high: null };
  function build({ price, atr, horizon, direction, action }) {
    if (!Number.isFinite(price) || !Number.isFinite(atr) || atr <= 0) return { recommendedRange: finiteRange(null, null), targetRange: finiteRange(null, null), invalidation: null };
    const config = engine.config.horizons[horizon];
    const isNegative = ["trim", "sell", "avoid"].includes(action) || direction < 0;
    const recommendedRange = isNegative
      ? finiteRange(price + atr * 0.25, price + atr * config.rangeAtr)
      : finiteRange(price - atr * config.rangeAtr, price + atr * 0.25);
    const targetRange = isNegative
      ? finiteRange(price - atr * config.targetAtr, price - atr * config.rangeAtr)
      : finiteRange(price + atr * config.rangeAtr, price + atr * config.targetAtr);
    return {
      recommendedRange,
      targetRange,
      invalidation: isNegative ? price + atr * (config.rangeAtr + 0.75) : price - atr * (config.rangeAtr + 0.75),
    };
  }
  engine.execution = Object.freeze({ build });
}(globalThis));
