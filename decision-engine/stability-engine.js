(function createStabilityEngine(root) {
  "use strict";

  const engine = root.DecisionEngine || (root.DecisionEngine = {});
  const cache = new Map();
  function evaluate({ ticker, horizon, action, edge, confidence }) {
    const key = `${ticker}:${horizon}`;
    const previous = cache.get(key);
    const material = !previous || previous.previousAction !== action || Math.abs((previous.previousEdge || 0) - edge) >= 0.25;
    const next = {
      previousAction: action,
      previousEdge: edge,
      previousConfidence: confidence,
      lastMaterialChange: material ? new Date().toISOString() : previous.lastMaterialChange,
    };
    cache.set(key, next);
    while (cache.size > engine.config.stabilityCacheLimit) cache.delete(cache.keys().next().value);
    return { persistent: !material, lastMaterialChange: next.lastMaterialChange };
  }
  engine.stability = Object.freeze({ evaluate });
}(globalThis));
