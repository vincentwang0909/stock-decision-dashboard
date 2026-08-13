"use strict";

const assert = require("node:assert/strict");
const presentation = require("../decision-presentation.js");

const range = (low, high) => ({ low, high });
const plan = (action, overrides = {}) => ({
  action,
  executionIntent: presentation.actionIntent[action],
  recommendedRange: range(100, 105), targetRange: range(115, 120), invalidation: 96,
  ...overrides,
});

assert.equal(presentation.executionSemantics(plan("buy")).range, "recommendedEntryRange");
assert.equal(presentation.executionSemantics(plan("accumulate")).range, "recommendedAddRange");
assert.equal(presentation.executionSemantics(plan("hold")).range, "holdZone");
assert.equal(presentation.executionSemantics(plan("trim")).range, "recommendedReductionRange");
assert.equal(presentation.executionSemantics(plan("sell")).range, "recommendedExitRange");
assert.equal(presentation.executionSemantics(plan("avoid")).range, "avoidNoEntry");
assert.deepEqual(presentation.actionTone, {
  strong_buy: "strong-buy", buy: "buy", accumulate: "accumulate", hold: "hold", trim: "trim", sell: "sell", avoid: "avoid",
});

for (const [name, currentPrice, decision] of [
  ["range below current", 110, plan("buy", { recommendedRange: range(100, 105) })],
  ["range contains current", 103, plan("buy", { recommendedRange: range(100, 105) })],
  ["range above current", 95, plan("buy", { recommendedRange: range(100, 105) })],
  ["sell natural ordering", 100, plan("sell", { recommendedRange: range(102, 106), targetRange: range(88, 92), invalidation: 109 })],
  ["hold null target and invalidation", 100, plan("hold", { targetRange: null, invalidation: null })],
  ["avoid no plan", 100, plan("avoid", { recommendedRange: null, targetRange: null, invalidation: null })],
]) {
  const model = presentation.priceMapModel({ currentPrice, decision });
  assert.ok(model.points.some((point) => point.id === "current"), `${name}: current price is missing`);
  assert.ok(model.min < model.max, `${name}: usable scale is missing`);
  model.points.forEach((point) => {
    const values = point.value == null ? [point.start, point.end] : [point.position];
    values.forEach((value) => assert.ok(value >= 0 && value <= 100, `${name}: map point escaped scale`));
  });
}

const closeLabels = presentation.layoutPriceMap([
  { id: "range", start: 48, end: 52 },
  { id: "current", position: 53 },
  { id: "reference", position: 54 },
  { id: "invalidation", position: 55 },
], 9).labels;
for (let index = 0; index < closeLabels.length; index += 1) {
  for (let compared = index + 1; compared < closeLabels.length; compared += 1) {
    const left = closeLabels[index];
    const right = closeLabels[compared];
    if (Math.abs(left.anchor - right.anchor) < 9) assert.notEqual(`${left.labelSide}-${left.labelLane}`, `${right.labelSide}-${right.labelLane}`, "close Price Map labels require separate lanes");
  }
}
assert.ok(presentation.layoutPriceMap(closeLabels).trackHeight >= 140, "dense Price Map gains vertical label room");

const holdWithReferences = plan("hold", {
  targetRange: null,
  invalidation: null,
  debug: { recommendedRangeInputs: { structuralReference: { support: 99.8, resistance: 100.2 } } },
});
const holdMap = presentation.priceMapModel({ currentPrice: 100, decision: holdWithReferences });
assert.equal(holdMap.legend.filter((entry) => entry.labelKey === "structuralReference").length, 1, "Price Map legend deduplicates structural references");

const profile = presentation.profileGroups({
  staticTags: ["MegaCap", "AIInfrastructure", "MegaCap"], dynamicTags: [], lifecycleTag: null, candidateTags: [],
}, "AIInfrastructure");
assert.deepEqual(profile.staticTags, ["MegaCap"]);
assert.equal(profile.visible.dynamic, false);
assert.equal(profile.visible.lifecycle, false);
assert.equal(profile.visible.candidate, false);

const stablePresentationDecision = plan("buy", {
  debug: { recommendedRangeInputs: { structuralReference: { support: 99, resistance: 107 } } },
});
const beforePresentation = structuredClone(stablePresentationDecision);
presentation.executionSemantics(stablePresentationDecision);
presentation.priceMapModel({ currentPrice: 103, decision: stablePresentationDecision });
presentation.profileGroups({ staticTags: ["MegaCap", "AIInfrastructure"] }, "AIInfrastructure");
assert.deepEqual(stablePresentationDecision, beforePresentation, "presentation helpers must not mutate V1 decision values");

assert.equal(presentation.translateReason("OBV and volume participation are confirming accumulation.", "zh"), "OBV 与成交量参与度正在确认资金吸筹。");
assert.equal(presentation.translateReason("Unmapped provider wording.", "zh"), "Unmapped provider wording.");
assert.equal(presentation.reasonList(["a", "b", "c", "d", "e", "f"], "en", 5).length, 5);
assert.match(presentation.positionGuidance("hold", "en"), /not enough evidence/i);
assert.match(presentation.positionGuidance("avoid", "zh"), /不适合/);

console.log("decision-ui.test.js: execution semantics, price-map, and bilingual fallback assertions passed");
