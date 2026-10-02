#!/usr/bin/env node
"use strict";

// Read-only audit helper for the V1 decision object. It uses the same cached
// market-data payload and canonical technical normalization as the dashboard;
// it never requests a refresh or writes recommendation history.
const path = require("node:path");
const { buildTechnicalFeatures } = require("../technical-features.js");

for (const file of [
  "config.js", "technical-engine.js", "exhaustion-engine.js", "market-engine.js", "etf-profile.js", "company-profile.js",
  "planning-width.js", "execution-engine.js", "short-model-v2.js", "confidence-engine.js", "stability-engine.js", "decision-engine.js",
]) require(path.join(__dirname, "..", "decision-engine", file));

const DEFAULT_TICKERS = ["META", "MSFT", "NVDA", "MU", "AMZN", "GOOGL"];
const profiles = require("../profile-definitions.js");

const finite = (value) => value == null || value === "" ? null : Number.isFinite(Number(value)) ? Number(value) : null;

function summary(decision) {
  return Object.fromEntries(Object.entries(decision.horizons).map(([horizon, value]) => [horizon, {
    action: value.action, confidence: value.confidence,
    direction: value.states.direction.score, confirmation: value.states.confirmation.score,
    risk: value.states.risk.score, priceOpportunity: value.states.priceOpportunity.score, exhaustion: value.states.exhaustion.score,
    marketRegime: value.market.regime, candidateAction: value.debug.candidateAction, finalAction: value.debug.finalAction,
    priceState: value.debug.priceState, actionFamily: value.debug.actionFamily, landscapeQuality: value.debug.landscapeQuality,
    finalDecision: value.debug.finalDecision, stability: value.debug.stability, priceLandscape: value.priceLandscape,
    priceStateContract: strictPriceStateContract(value),
    supporting: value.reasons.supporting, limiting: value.reasons.limiting,
  }]));
}

function strictPriceStateContract(value) {
  const state = value.debug?.priceState;
  const action = value.action;
  const positive = ["strong_buy", "buy", "accumulate"].includes(action);
  const defensive = ["trim", "sell"].includes(action);
  const stockShortV2 = value.debug?.pathVersion === globalThis.DecisionEngine.config.shortV2.version;
  if (state === "IN_OPPORTUNITY_ZONE") return { expected: stockShortV2 ? "positive_or_wait" : "positive", valid: positive || (stockShortV2 && action === "hold") };
  if (["NEAR_OPPORTUNITY_ZONE", "NEUTRAL_ZONE", "NEAR_REDUCE_ZONE"].includes(state)) return { expected: "hold", valid: action === "hold" };
  if (["IN_REDUCE_ZONE", "BEYOND_REDUCE_ZONE"].includes(state)) return { expected: stockShortV2 ? "reduce_or_wait" : "reduce", valid: defensive || (stockShortV2 && action === "hold") };
  if (state === "BREAKDOWN_ZONE") return { expected: "defensive", valid: ["sell", "avoid"].includes(action) };
  return { expected: "avoid", valid: action === "avoid" };
}

async function main() {
  const base = process.env.DECISION_SHADOW_API || "http://127.0.0.1:4174";
  const tickers = process.argv.slice(2).length ? process.argv.slice(2).map((ticker) => ticker.toUpperCase()) : DEFAULT_TICKERS;
  const response = await fetch(`${base}/api/market-data?tickers=${encodeURIComponent(tickers.join(","))}&cache_only=1`);
  if (!response.ok) throw new Error(`Market-data API returned ${response.status}`);
  const payload = await response.json();
  const market = payload.marketContext || payload.market_context || {};
  const rows = Object.fromEntries((payload.items || []).map((item) => [item.ticker, item.analysis || item]));
  const output = {};
  for (const ticker of tickers) {
    const quote = rows[ticker] || {};
    const price = finite(quote.price);
    if (price == null || quote.history?.availability === "unavailable") {
      output[ticker] = { status: "unavailable", reason: quote.history?.unavailable_reason || quote.error || "No cached quote/history for shadow audit." };
      continue;
    }
    const technicalFeatures = buildTechnicalFeatures({
      history: quote.history || {}, currentPrice: price, benchmarkContext: market, calculatedAt: quote.updatedAt || quote.history?.as_of || new Date().toISOString(),
      fibonacciStructure: quote.technical?.fibonacci_structure || {}, shareBase: quote.metadata?.sharesOutstanding || null,
    });
    output[ticker] = { status: "available", price, ...summary(globalThis.DecisionEngine.decide({ ticker, price, technicalFeatures, marketContext: market, classification: profiles.profileFor(ticker, quote.metadata || {}), metadata: quote.metadata || {}, language: "en" })) };
  }
  console.log(JSON.stringify({ generatedAt: new Date().toISOString(), cacheOnly: true, tickers: output }, null, 2));
}

main().catch((error) => { console.error(error.stack || error.message); process.exitCode = 1; });
