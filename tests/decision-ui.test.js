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

assert.equal(presentation.translateReason("OBV and volume participation are confirming accumulation.", "zh"), "OBV 与成交量参与度正在确认资金吸筹。");
assert.equal(presentation.translateReason("Unmapped provider wording.", "zh"), "Unmapped provider wording.");
assert.equal(presentation.reasonList(["a", "b", "c", "d", "e", "f"], "en", 5).length, 5);
assert.match(presentation.positionGuidance("hold", "en"), /not enough evidence/i);
assert.match(presentation.positionGuidance("avoid", "zh"), /不适合/);

console.log("decision-ui.test.js: execution semantics, price-map, and bilingual fallback assertions passed");
