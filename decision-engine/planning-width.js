(function configurePlanningWidth(root) {
  "use strict";
  const engine = root.DecisionEngine;
  const roundPrice = (value) => Number.isFinite(value) ? Math.round(value * 100) / 100 : null;
  const validRange = (range) => Number.isFinite(range?.low) && Number.isFinite(range?.high) && range.low > 0 && range.low < range.high;
  const validLandscape = (zone) => validRange(zone?.opportunityRange) && validRange(zone?.reduceRange) && zone.opportunityRange.high < zone.reduceRange.low;
  function transform(zone, { horizon = "short", breakdown = false, enabled = engine.config.shortReduceWidth.enabled } = {}) {
    if (zone?.widthTransform) return zone;
    const config = engine.config.shortReduceWidth;
    const diagnostic = { version: config.version, enabled, factor: config.factor, applied: false };
    if (!enabled || horizon !== "short" || breakdown || !validLandscape(zone)) {
      diagnostic.reason = breakdown ? "defensive_exit_bypass" : horizon !== "short" ? "horizon_not_applicable" : !enabled ? "disabled_by_adoption_gate" : "invalid_landscape";
      return { ...zone, widthTransform: diagnostic };
    }
    const { low, high } = zone.reduceRange;
    const center = (low + high) / 2;
    const half = (high - low) / 2 * config.factor;
    const reduceRange = { low: roundPrice(center - half), high: roundPrice(center + half) };
    const valid = validRange(reduceRange) && reduceRange.low >= low && reduceRange.high <= high
      && Math.abs((reduceRange.low + reduceRange.high) / 2 - center) < 1e-8
      && reduceRange.high - reduceRange.low <= high - low + 1e-8;
    if (!valid) return { ...zone, widthTransform: { ...diagnostic, reason: "precision_invariant_failed" } };
    return { ...zone, reduceRange, widthTransform: { ...diagnostic, applied: true, center, originalWidth: roundPrice(high - low), finalWidth: roundPrice(reduceRange.high - reduceRange.low) } };
  }
  engine.planningWidth = Object.freeze({ transform, roundPrice, validRange, validLandscape });
}(globalThis));
