const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const source = fs.readFileSync("main.js", "utf8");
const start = source.indexOf("function isMissingMetricValue");
const end = source.indexOf("function formatCompactVolume", start);

if (start < 0 || end < 0) {
  throw new Error("Fundamental formatter helpers were not found in main.js");
}

const context = {};
vm.runInNewContext(`${source.slice(start, end)}\nthis.helpers = { isMissingMetricValue, metricNumberOrNull, formatMetric, formatPercentage, formatRatio, formatMultiple };`, context);
const { helpers } = context;

test("fundamental formatters keep null, undefined, and NaN distinct from zero", () => {
  assert.equal(helpers.formatPercentage(null), "N/A");
  assert.equal(helpers.formatPercentage(undefined), "N/A");
  assert.equal(helpers.formatPercentage(Number.NaN), "N/A");
  assert.equal(helpers.formatPercentage(0), "0.0%");
  assert.equal(helpers.formatPercentage("0"), "0.0%");
  assert.equal(helpers.metricNumberOrNull(null), null);
  assert.equal(helpers.metricNumberOrNull(""), null);
  assert.equal(helpers.metricNumberOrNull(0), 0);
});

test("fundamental formatters preserve valid negative values", () => {
  assert.equal(helpers.formatPercentage(-0.153), "-15.3%");
  assert.equal(helpers.formatMultiple(-37.4), "-37.4");
  assert.equal(helpers.formatMultiple(0), "0.0");
  assert.equal(helpers.formatMultiple(null), "N/A");
});

test("ratio formatting distinguishes a verified low value from numeric zero", () => {
  assert.equal(helpers.formatRatio(0.02616), "0.03");
  assert.equal(helpers.formatRatio(0), "0.0");
  assert.equal(helpers.formatRatio(null), "N/A");
});
