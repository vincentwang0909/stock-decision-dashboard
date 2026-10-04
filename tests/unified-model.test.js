"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { featureSet, market } = require("./fixtures/decision-scenarios.js");
for (const file of ["config", "company-profile-classifier", "technical-engine", "exhaustion-engine", "market-engine", "etf-profile", "company-profile", "planning-width", "execution-engine", "short-model-v2", "confidence-engine", "stability-engine", "horizon-model-v2", "decision-engine"]) require(`../decision-engine/${file}.js`);
const engine = globalThis.DecisionEngine;
const profiles = require("../profile-definitions.js");
const originalConfig = engine.config;

assert.equal(Object.hasOwn(engine.config.shortV2, "enabled"), false, "production has no old Short version switch");
assert.equal(Object.hasOwn(engine.config.shortV2, "version"), false, "policy settings do not create a second engine version");
for (const classification of [{ businessTrait: "HighGrowth" }, profiles.profileFor("QQQ"), profiles.profileFor("SQQQ")]) {
  engine.stability.clear();
  const decision = engine.decide({ ticker: "UNIFIED", price: 100, technicalFeatures: featureSet(), marketContext: market(), classification });
  assert.equal(decision.version, engine.config.version);
  for (const [horizon, value] of Object.entries(decision.horizons)) {
    assert.equal(value.debug.modelVersion, decision.version);
    assert.equal(value.debug.pathVersion, decision.version);
    assert.equal(value.debug.policyFamily, `${classification.isETF ? "etf" : "stock"}_${horizon}`);
    assert.equal(value.debug.confidenceComponents.action, value.action, "final confidence still follows final action");
  }
}

// Old caller configuration cannot redirect ordinary-stock Short into the
// strict-family ETF policy. Its current stock policy remains the only route.
engine.config = { ...originalConfig, shortV2: { ...originalConfig.shortV2, enabled: false } };
const stock = engine.decide({ ticker: "NO_FALLBACK", price: 100, technicalFeatures: featureSet(), marketContext: market() });
assert.equal(stock.horizons.short.debug.policyFamily, "stock_short");
assert.throws(() => engine.horizonV2.decide({ ticker: "WRONG_ROUTE", horizon: "short", price: 100, technicalFeatures: featureSet(), market: engine.market.evaluate(market()), profile: engine.profile.build({}, "WRONG_ROUTE") }), /Ordinary-stock Short/);
engine.config = originalConfig;

const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
assert(html.includes("horizon-model-v2.js") && html.indexOf("horizon-model-v2.js") < html.indexOf("decision-engine/decision-engine.js"), "browser loads all horizon policies before the common entry");
// Execute the actual browser module order without Node's require fallback.
// This catches a missing or late import that isolated engine tests miss.
const RealDate = Date;
class ComparisonDate extends RealDate {
  constructor(...args) { super(...(args.length ? args : ["2026-10-04T20:30:00Z"])); }
  static now() { return RealDate.parse("2026-10-04T20:30:00Z"); }
}
const browser = vm.createContext({ console, Date: ComparisonDate });
for (const match of html.matchAll(/<script src="\.\/([^"?]+)(?:\?[^\"]*)?"/g)) {
  if (match[1] === "main.js") continue;
  vm.runInContext(fs.readFileSync(path.join(__dirname, "..", match[1]), "utf8"), browser, { filename: match[1] });
}
const browserInput = { ticker: "BROWSER_PARITY", price: 100, technicalFeatures: featureSet(), marketContext: market() };
engine.stability.clear();
let nodeDecision;
try {
  globalThis.Date = ComparisonDate;
  nodeDecision = engine.decide(browserInput);
} finally {
  globalThis.Date = RealDate;
}
const browserDecision = browser.DecisionEngine.decide(browserInput);
delete nodeDecision.generatedAt;
delete browserDecision.generatedAt;
assert.deepEqual(JSON.parse(JSON.stringify(browserDecision)), JSON.parse(JSON.stringify(nodeDecision)), "actual browser imports and Node produce the same current decision");
assert.equal(fs.existsSync(path.join(__dirname, "..", "decision-v1")), false, "the old API directory is removed");
assert.equal(fs.existsSync(path.join(__dirname, "..", "decision-api", "emit-decision.js")), true);
console.log("Unified model: one release, independent policies, no old Short fallback, final confidence and browser/API loading passed.");
