"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const main = fs.readFileSync(path.join(root, "main.js"), "utf8");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const marketEngine = fs.readFileSync(path.join(root, "decision-engine", "market-engine.js"), "utf8");

assert.match(main, /function buildRelativeStrength\(/);
assert.match(main, /stock_vs_spy_\$\{lookback\}d/);
assert.match(main, /stock_vs_qqq_\$\{lookback\}d/);
assert.match(main, /EMA 9|item\.indicator/);
assert.match(main, /change_5d/);
assert.match(main, /change_20d/);
for (const presentationClass of ["stock-item-body", "decision-hero", "decision-core-grid", "detail-overview-card", "detail-section-card"]) {
  assert.match(main, new RegExp(presentationClass), `restored presentation structure is missing: ${presentationClass}`);
}
assert.match(marketEngine, /marketContext\.market_context/);
assert.equal(html.includes("Action Score"), false);

console.log("dashboard-regression.test.js: dashboard data and score-removal assertions passed");
