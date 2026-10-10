"use strict";
const assert = require("node:assert/strict");
for (const file of ["config", "company-profile-classifier", "technical-engine", "exhaustion-engine", "market-engine", "etf-profile", "company-profile", "planning-width", "execution-engine", "short-model-v2", "confidence-engine", "stability-engine", "horizon-model-v2", "decision-engine"]) require(`../decision-engine/${file}.js`);
const e = globalThis.DecisionEngine;
const { featureSet, market } = require("./fixtures/decision-scenarios.js");
const { _test } = require("../technical-features.js");
const fresh = { state: "current", latest_date: "2026-10-09", expected_completed_date: "2026-10-09" };
for (const classification of [{}, { isETF: true, leveraged: false, direction: "long" }]) {
  e.stability.clear();
  const features = featureSet(); features.data_quality = { daily_freshness: fresh };
  // Seed stability with valid data, then make the same ticker stale. An old
  // actionable family must never be retained over an unavailable decision.
  e.decide({ ticker: "TRUST", price: 100, technicalFeatures: features, marketContext: market(), classification });
  features.data_quality.daily_freshness = { ...fresh, state: "stale", latest_date: "2026-10-08" };
  const result = e.decide({ ticker: "TRUST", price: 100, technicalFeatures: features, marketContext: market(), classification });
  for (const decision of Object.values(result.horizons)) {
    assert.equal(decision.action, "hold");
    assert.equal(decision.executionIntent, "hold");
    assert.equal(decision.debug.actionFamily, "unavailable");
    assert.equal(decision.debug.dataQuality.score, 0);
    assert.equal(decision.priceLandscape.opportunityRange, null);
    assert.equal(decision.priceLandscape.reduceRange, null);
    assert(decision.confidence <= e.config.confidence.unavailableMaximum);
    assert(decision.debug.dataQuality.missingCore.includes("stale_daily_history"));
  }
}
const conflicted = featureSet(); conflicted.data_quality = { daily_freshness: fresh, volume_conflicts: ["4h"] };
const profile = { effectiveModifiers: { benchmarkWeights: { spy: .5, qqq: .5 }, directionWeights: {}, confirmationWeights: {} } };
const evaluated = e.technical.evaluate(conflicted, "short", 100, profile);
assert.equal(evaluated.dataQuality.score, 0);
assert(evaluated.dataQuality.missingCore.includes("source_data_conflict"));
assert(e.technical.evaluate(conflicted, "mid", 100, profile).dataQuality.score > 0, "valid Daily primary observations remain usable");
const arrays = { timestamps: ["2026-10-09T09:30:00-04:00"], opens: [100], highs: [102], lows: [99], closes: [101], volumes: [700], completed: [true], bar_end_timestamps: ["2026-10-09T13:30:00-04:00"], volume_validation: { status: "conflict" } };
const bars = _test.normalizeBars(arrays);
assert.equal(bars[0].close, 101);
assert.equal(bars[0].volume, 700, "never silently rescale source volume");
assert.equal(bars[0].volume_available, false);
assert.equal(_test.obvFeature(bars, "4h", 20, "2026-10-10T00:00:00Z").unavailable_reason, "source_data_conflict");
assert(!e.config.actions.includes("avoid"));
console.log("Data trust: stale snapshots, primary-volume conflicts, family stability, confidence and raw-data preservation passed.");
