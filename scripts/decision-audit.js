#!/usr/bin/env node
"use strict";

// Read-only calibration audit.  This script builds the same canonical feature
// objects as the dashboard, asks the existing engine for decisions, prints a
// compact JSON report, and exits.  It never refreshes the provider, mutates the
// watchlist, or persists recommendation history.
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { buildTechnicalFeatures } = require("../technical-features.js");

for (const file of [
  "config.js", "technical-engine.js", "exhaustion-engine.js", "market-engine.js", "company-profile.js",
  "execution-engine.js", "confidence-engine.js", "stability-engine.js", "decision-engine.js",
]) require(path.join(__dirname, "..", "decision-engine", file));

const decisionEngine = globalThis.DecisionEngine;
const ACTIONS = [...decisionEngine.config.actions];
const HORIZONS = ["short", "mid", "long"];
const finite = (value) => value == null || value === "" ? null : Number.isFinite(Number(value)) ? Number(value) : null;
const clone = (value) => JSON.parse(JSON.stringify(value));
const mean = (values) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
const round = (value, digits = 2) => Number.isFinite(value) ? Number(value.toFixed(digits)) : null;
const quantile = (values, fraction) => {
  const sorted = values.filter(Number.isFinite).sort((left, right) => left - right);
  if (!sorted.length) return null;
  const position = (sorted.length - 1) * fraction;
  const low = Math.floor(position);
  const high = Math.ceil(position);
  return sorted[low] + (sorted[high] - sorted[low]) * (position - low);
};
const distribution = (values) => {
  const valid = values.filter(Number.isFinite);
  return valid.length ? Object.fromEntries([
    ["count", valid.length], ["min", round(Math.min(...valid))], ["p10", round(quantile(valid, 0.10))],
    ["p25", round(quantile(valid, 0.25))], ["median", round(quantile(valid, 0.50))],
    ["p75", round(quantile(valid, 0.75))], ["p90", round(quantile(valid, 0.90))],
    ["max", round(Math.max(...valid))], ["mean", round(mean(valid))],
  ]) : { count: 0, min: null, p10: null, p25: null, median: null, p75: null, p90: null, max: null, mean: null };
};

function classifications() {
  const source = fs.readFileSync(path.join(__dirname, "..", "main.js"), "utf8");
  const match = source.match(/const CLASSIFICATION_PROFILES = Object\.freeze\((\{[\s\S]*?\})\);\n\nconst DEFAULT_WATCHLIST/);
  if (!match) throw new Error("Unable to read CLASSIFICATION_PROFILES from main.js");
  return vm.runInNewContext(`(${match[1]})`);
}

const CLASSIFICATIONS = classifications();
const returnPct = (closes, lookback) => {
  const values = (closes || []).map(finite).filter((value) => value != null);
  const latest = values.at(-1);
  const base = values.at(-1 - lookback);
  return Number.isFinite(latest) && Number.isFinite(base) && base !== 0 ? (latest / base - 1) * 100 : null;
};
const marketCore = (market) => market?.market_context || market?.market_engine || market || {};
function relativeStrength(quote, market) {
  const core = marketCore(market);
  const equity = core.equity_trend || { spy: core.spy_trend, qqq: core.qqq_trend };
  return Object.fromEntries([20, 60, 120].flatMap((days) => {
    const stock = returnPct(quote.history?.closes, days);
    const against = (benchmark) => stock != null && finite(benchmark?.[`change_${days}d_pct`]) != null ? stock - finite(benchmark[`change_${days}d_pct`]) : null;
    return [[`stock_return_${days}d`, stock], [`stock_vs_spy_${days}d`, against(equity.spy)], [`stock_vs_qqq_${days}d`, against(equity.qqq)]];
  }));
}
function profileFor(ticker, quote = {}) {
  const known = CLASSIFICATIONS[ticker];
  const upstream = quote.metadata?.classification || quote.classification || {};
  return {
    tags: [...new Set([...(known?.tags || []), ...(upstream.tags || upstream.top_tags || [])])],
    category: upstream.category || known?.category || quote.metadata?.sector || "Unclassified",
    category_key: upstream.category_key || known?.category || "other",
    scoring_profile: upstream.scoring_profile || known?.scoring_profile || "generic",
    profileConfidence: upstream.profileConfidence ?? upstream.profile_confidence,
  };
}
function featureFor(quote, market) {
  const price = finite(quote.price);
  return buildTechnicalFeatures({
    history: quote.history || {}, currentPrice: price, relativeStrength: relativeStrength(quote, market),
    fibonacciStructure: quote.technical?.fibonacci_structure || {}, shareBase: quote.metadata?.sharesOutstanding || null,
  });
}
function decisionFor(ticker, quote, market, technicalFeatures = featureFor(quote, market), price = finite(quote.price)) {
  return decisionEngine.decide({ ticker, price, technicalFeatures, marketContext: market, classification: profileFor(ticker, quote), metadata: quote.metadata || {}, language: "en" });
}

function indicator(features, horizon, group, key) {
  const config = decisionEngine.config.horizons[horizon];
  const set = features?.horizons?.[config.technicalKey] || {};
  const interval = key === "ma" && config.maInterval ? config.maInterval : config.primaryInterval;
  if (group === "rsi") return set.momentum?.rsi?.[`rsi_${config.rsiPeriod}_${config.primaryInterval}`];
  if (group === "macd") return set.momentum?.macd?.[`macd_${config.primaryInterval}`];
  if (group === "atr") return set.volatility?.atr?.[`atr_14_${config.primaryInterval}`];
  if (group === "rs") return set.relative_strength?.primary;
  if (group === "ma") return Object.values(set.trend?.moving_averages || {}).filter((item) => item?.interval === interval);
  return null;
}
function nudge(features, horizon, kind) {
  const copy = clone(features);
  if (kind === "rsi") {
    const item = indicator(copy, horizon, "rsi");
    if (Number.isFinite(item?.value)) item.value += 2;
  } else if (kind === "macd") {
    const item = indicator(copy, horizon, "macd");
    if (item) ["histogram", "histogram_change_1", "histogram_change_3", "histogram_change_5"].forEach((key) => { if (Number.isFinite(item[key])) item[key] += Math.max(0.002, Math.abs(item[key]) * 0.05); });
  } else if (kind === "atr") {
    const item = indicator(copy, horizon, "atr");
    if (item) { if (Number.isFinite(item.value)) item.value *= 1.05; if (Number.isFinite(item.atr_pct)) item.atr_pct *= 1.05; if (Number.isFinite(item.atr_percentile_pct)) item.atr_percentile_pct = Math.min(100, item.atr_percentile_pct + 2); }
  } else if (kind === "rs") {
    const item = indicator(copy, horizon, "rs");
    if (item) ["stock_return", "vs_spy", "vs_qqq"].forEach((key) => { if (Number.isFinite(item[key])) item[key] += 1; });
  }
  return copy;
}
function rangeWidthPct(value, price) {
  return Number.isFinite(value?.recommendedRange?.low) && Number.isFinite(value?.recommendedRange?.high) && Number.isFinite(price) && price > 0
    ? (value.recommendedRange.high - value.recommendedRange.low) / price * 100 : null;
}
function concise(value, price) {
  return {
    action: value.action, confidence: value.confidence, direction: value.states.direction.score,
    confirmation: value.states.confirmation.score, risk: value.states.risk.score,
    priceOpportunity: value.states.priceOpportunity.score, exhaustion: value.states.exhaustion.score,
    marketRegime: value.market.regime, executionIntent: value.executionIntent || null,
    recommendedRange: value.recommendedRange, targetRange: value.targetRange, invalidation: value.invalidation,
    supporting: value.reasons.supporting, limiting: value.reasons.limiting,
    rangeWidthPct: round(rangeWidthPct(value, price)), rawEdge: value.debug.rawEdge,
    edgeBeforeMarket: value.debug.edgeBeforeMarket ?? null, edgeAfterMarket: value.debug.edgeAfterMarket ?? value.debug.adjustedEdge,
    marketRiskAdd: value.debug.marketModifiers?.riskAdd ?? null, riskComponents: value.debug.riskComponents,
    exhaustionComponents: value.debug.exhaustionComponents, confidenceComponents: value.debug.confidenceComponents,
    appliedTags: value.debug.appliedTags,
    effectiveProfileModifiers: value.debug.effectiveProfileModifiers,
  };
}
function emptyActions() { return Object.fromEntries([...ACTIONS, "unavailable"].map((action) => [action, 0])); }

async function main() {
  const base = process.env.DECISION_AUDIT_API || "http://127.0.0.1:4174";
  const watchlistResponse = await fetch(`${base}/api/watchlist`);
  if (!watchlistResponse.ok) throw new Error(`Watchlist API returned ${watchlistResponse.status}`);
  const watchlistPayload = await watchlistResponse.json();
  const tickers = (watchlistPayload.items || watchlistPayload.watchlist || []).map((item) => typeof item === "string" ? item : item.ticker).filter(Boolean).map((ticker) => String(ticker).toUpperCase());
  const requestedSix = ["META", "MSFT", "NVDA", "MU", "AMZN", "GOOGL"];
  const auditTickers = [...new Set([...tickers, ...requestedSix])];
  const response = await fetch(`${base}/api/market-data?tickers=${encodeURIComponent(auditTickers.join(","))}&cache_only=1`);
  if (!response.ok) throw new Error(`Market-data API returned ${response.status}`);
  const payload = await response.json();
  const market = payload.marketContext || payload.market_context || {};
  const rows = Object.fromEntries((payload.items || []).map((item) => [item.ticker, item.analysis || item]));
  const actionDistribution = Object.fromEntries(HORIZONS.map((horizon) => [horizon, emptyActions()]));
  const stateValues = Object.fromEntries(HORIZONS.map((horizon) => [horizon, { direction: [], confirmation: [], risk: [], priceOpportunity: [], exhaustion: [], confidence: [], rangeWidthPct: [] }]));
  const highRisk = [];
  const highExhaustion = [];
  const perTicker = {};
  const valid = [];
  for (const ticker of auditTickers) {
    const onWatchlist = tickers.includes(ticker);
    const quote = rows[ticker] || {};
    const price = finite(quote.price);
    if (!Number.isFinite(price) || quote.history?.availability === "unavailable") {
      if (onWatchlist) HORIZONS.forEach((horizon) => { actionDistribution[horizon].unavailable += 1; });
      perTicker[ticker] = { status: "unavailable", reason: quote.history?.unavailable_reason || quote.error || "No cached quote/history." };
      continue;
    }
    decisionEngine.stability.clear();
    const features = featureFor(quote, market);
    const decision = decisionFor(ticker, quote, market, features, price);
    const horizons = {};
    HORIZONS.forEach((horizon) => {
      const value = decision.horizons[horizon];
      if (onWatchlist) actionDistribution[horizon][value.action] += 1;
      horizons[horizon] = concise(value, price);
      if (onWatchlist) {
        ["direction", "confirmation", "risk", "priceOpportunity", "exhaustion"].forEach((state) => stateValues[horizon][state].push(value.states[state].score));
        stateValues[horizon].confidence.push(value.confidence);
        const width = rangeWidthPct(value, price);
        if (Number.isFinite(width)) stateValues[horizon].rangeWidthPct.push(width);
        if (value.states.risk.score >= 70) highRisk.push({ ticker, horizon, price, risk: value.states.risk.score, components: value.debug.riskComponents, market: value.debug.marketModifiers, profile: value.debug.effectiveProfileModifiers });
        if (Math.abs(value.states.exhaustion.score) >= 50) highExhaustion.push({ ticker, horizon, price, exhaustion: value.states.exhaustion.score, action: value.action, components: value.debug.exhaustionComponents, direction: value.states.direction.score, priceOpportunity: value.states.priceOpportunity.score });
      }
    });
    perTicker[ticker] = { status: "available", price, horizons };
    if (onWatchlist) valid.push({ ticker, quote, price, features, decision });
  }
  const perturbation = Object.fromEntries(HORIZONS.map((horizon) => [horizon, { tests: 0, flips: 0, flipRatePct: null }]));
  const kinds = ["price", "rsi", "macd", "atr", "rs"];
  for (const item of valid) {
    for (const horizon of HORIZONS) {
      for (const kind of kinds) {
        decisionEngine.stability.clear();
        const baseDecision = decisionFor(item.ticker, item.quote, market, item.features, item.price);
        const movedPrice = kind === "price" ? item.price * 1.005 : item.price;
        const moved = decisionFor(item.ticker, item.quote, market, nudge(item.features, horizon, kind), movedPrice);
        perturbation[horizon].tests += 1;
        if (baseDecision.horizons[horizon].action !== moved.horizons[horizon].action) perturbation[horizon].flips += 1;
      }
    }
  }
  Object.values(perturbation).forEach((entry) => { entry.flipRatePct = entry.tests ? round(entry.flips / entry.tests * 100) : null; });
  const marketAudit = valid.flatMap((item) => HORIZONS.map((horizon) => {
    const value = item.decision.horizons[horizon];
    return { ticker: item.ticker, horizon, edgeBeforeMarket: value.debug.edgeBeforeMarket ?? null, edgeAfterMarket: value.debug.edgeAfterMarket ?? value.debug.adjustedEdge, difference: value.debug.edgeBeforeMarket == null ? null : round((value.debug.edgeAfterMarket ?? value.debug.adjustedEdge) - value.debug.edgeBeforeMarket), marketRiskAdd: value.debug.marketModifiers?.riskAdd, regime: value.market.regime };
  }));
  const marketImpactDistribution = Object.fromEntries(HORIZONS.map((horizon) => {
    const values = marketAudit.filter((item) => item.horizon === horizon);
    return [horizon, { edgeDifference: distribution(values.map((item) => item.difference)), riskAdd: distribution(values.map((item) => item.marketRiskAdd)) }];
  }));
  const summary = Object.fromEntries(HORIZONS.map((horizon) => [horizon, Object.fromEntries(Object.entries(stateValues[horizon]).map(([key, values]) => [key, distribution(values)]))]));
  const requestedTickers = Object.fromEntries(requestedSix.filter((ticker) => perTicker[ticker]).map((ticker) => [ticker, perTicker[ticker]]));
  const tagAudit = Object.fromEntries(["META", "MSFT", "NVDA", "AMZN", "GOOGL"].filter((ticker) => perTicker[ticker]?.status === "available").map((ticker) => {
    const value = perTicker[ticker].horizons.short;
    return [ticker, { appliedTags: value.appliedTags, effectiveProfileModifiers: value.effectiveProfileModifiers }];
  }));
  console.log(JSON.stringify({
    generatedAt: new Date().toISOString(), cacheOnly: true, watchlistTickers: tickers, validTickerCount: valid.length,
    unavailableTickerCount: tickers.length - valid.length, actionDistribution, distributions: summary,
    riskAtLeast70: highRisk, exhaustionAbsoluteAtLeast50: highExhaustion,
    perturbation, marketAudit, marketImpactDistribution, tagAudit, requestedTickers, perTicker,
  }, null, 2));
}

main().catch((error) => { console.error(error.stack || error.message); process.exitCode = 1; });
