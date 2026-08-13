"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const main = fs.readFileSync(path.join(root, "main.js"), "utf8");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const css = fs.readFileSync(path.join(root, "styles.css"), "utf8");
const marketEngine = fs.readFileSync(path.join(root, "decision-engine", "market-engine.js"), "utf8");
const presentation = require(path.join(root, "decision-presentation.js"));

assert.match(main, /function buildRelativeStrength\(/);
assert.match(main, /function actionChip\(/);
for (const action of ["strong_buy", "buy", "accumulate", "hold", "trim", "sell", "avoid"]) assert.ok(presentation.actionTone[action], `Homepage action tone missing: ${action}`);
assert.match(main, /decision\.actionLabel/);
assert.match(main, /row\.ready && decision \? decision\.actionLabel : t\("unavailable"\)/);
assert.match(main, /stock_vs_spy_\$\{lookback\}d/);
assert.match(main, /stock_vs_qqq_\$\{lookback\}d/);
assert.match(main, /EMA 9|item\.indicator/);
assert.match(main, /change_5d/);
assert.match(main, /change_20d/);
assert.match(main, /renderFibonacciStructure/);
assert.match(main, /Fibonacci Structure/);
assert.match(main, /Volume \/ RVOL \/ OBV/);
for (const renderedTechnicalField of [
  "Histogram 1-bar",
  "Histogram 3-bar",
  "Histogram 5-bar",
  "Zero line",
  "ADX / DI",
  "ATR percentile",
  "Bandwidth percentile",
  "K / D / J slope",
  "Relative Strength",
  "vs QQQ · 20 / 60 / 120D",
  "Horizon OBV · 4H / 1D / 1W",
]) assert.match(main, new RegExp(renderedTechnicalField.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `Technical render field is missing: ${renderedTechnicalField}`);
assert.match(main, /fibonacciLevelTable/);
assert.match(main, /fib\.retracement_levels/);
assert.match(main, /fib\.extension_levels/);
assert.match(main, /technical-accordion/);
assert.match(main, /data-technical-horizon/);
assert.match(main, /data-fibonacci-horizon/);
assert.match(main, /data-technical-toggle/);
for (const presentationClass of ["stock-item-body", "decision-hero", "decision-core-grid", "detail-section-card", "decision-price-map", "company-model-grid"]) {
  assert.match(main, new RegExp(presentationClass), `restored presentation structure is missing: ${presentationClass}`);
}
assert.match(marketEngine, /source\.market_context/);
assert.doesNotMatch(marketEngine, /directionAdjustment/);
assert.equal(html.includes("Action Score"), false);
assert.match(main, /executionIntent/);
assert.match(main, /holdZone/);
assert.match(main, /execution-avoid-note/);
assert.doesNotMatch(main, /noExecutionPlan/);
assert.match(main, /recommendationConfidence/);
assert.match(main, /decisionHorizon/);
assert.match(main, /data-decision-horizon/);
assert.match(main, /renderDecisionPriceMap/);
assert.match(main, /renderCompanyModel/);
assert.match(main, /window\.__decisionDebug/);
assert.doesNotMatch(main, /Action Score|baseline score|final score|Top 3/);
assert.doesNotMatch(main, /decision\.confidence}%/);
assert.match(html, /decision-presentation\.js/);
assert.match(html, /decision-ui-v3/);
for (const token of ["--action-strong-buy", "--action-buy", "--action-accumulate", "--action-hold", "--action-trim", "--action-sell", "--action-avoid", "--space-xs", "--radius-lg"]) assert.match(css, new RegExp(token), `UI token is missing: ${token}`);
assert.match(css, /price-map-label\.top\.lane-1/);
assert.match(css, /price-map-label\.bottom\.lane-2/);
assert.match(css, /technical-family-grid/);
assert.match(css, /fibonacci-level-table/);
assert.match(css, /market-compact-grid/);
assert.doesNotMatch(presentation.priceMapModel.toString(), /fetch\(/, "presentation does not add API requests");

console.log("dashboard-regression.test.js: dashboard data and score-removal assertions passed");
