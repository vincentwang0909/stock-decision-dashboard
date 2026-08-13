const assert = require("node:assert/strict");
const path = require("node:path");
const { buildTechnicalFeatures } = require("../technical-features.js");

for (const file of [
  "config.js",
  "technical-engine.js",
  "exhaustion-engine.js",
  "market-engine.js",
  "company-profile.js",
  "execution-engine.js",
  "confidence-engine.js",
  "stability-engine.js",
  "decision-engine.js",
]) require(path.join(__dirname, "..", "decision-engine", file));

const daily = { opens: [], highs: [], lows: [], closes: [], volumes: [], timestamps: [] };
for (let index = 0; index < 320; index += 1) {
  const close = 100 + index * 0.18 + Math.sin(index / 8) * 2;
  daily.opens.push(close - 0.5);
  daily.highs.push(close + 1.2);
  daily.lows.push(close - 1.1);
  daily.closes.push(close);
  daily.volumes.push(1_000_000 + index * 500);
  daily.timestamps.push(new Date(Date.UTC(2025, 0, 1 + index)).toISOString());
}
const intraday = { opens: daily.opens.slice(-240), highs: daily.highs.slice(-240), lows: daily.lows.slice(-240), closes: daily.closes.slice(-240), volumes: daily.volumes.slice(-240), timestamps: daily.timestamps.slice(-240) };
const technicalFeatures = buildTechnicalFeatures({ history: { ...daily, intervals: { "1h": intraday, "4h": intraday } }, currentPrice: daily.closes.at(-1) });
const decision = globalThis.DecisionEngine.decide({
  ticker: "TEST",
  price: daily.closes.at(-1),
  technicalFeatures,
  marketContext: { market_engine: { vix: { value: 18 }, equity_trend: { spy: { trend: "rising" }, qqq: { trend: "rising" } } } },
  classification: { tags: ["Software", "Cloud"], category: "SoftwareCloud", scoring_profile: "software_cloud" },
  metadata: {},
  language: "zh",
});

assert.deepEqual(Object.keys(decision.horizons), ["short", "mid", "long"]);
for (const horizon of Object.values(decision.horizons)) {
  assert(globalThis.DecisionEngine.config.actions.includes(horizon.action));
  assert.equal(typeof horizon.actionLabel, "string");
  assert.equal(typeof horizon.confidence, "number");
  assert.deepEqual(Object.keys(horizon.states), ["direction", "confirmation", "risk", "priceOpportunity", "exhaustion"]);
  assert.equal(Object.hasOwn(horizon, "score_breakdown"), false);
  assert.equal(Object.hasOwn(horizon, "action_recommendation_score"), false);
}

console.log("decision-engine.test.js: all assertions passed");
