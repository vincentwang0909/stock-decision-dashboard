#!/usr/bin/env node
"use strict";

// This process deliberately loads the same browser/Node V1 modules used by
// audits and the Dashboard.  It is a one-shot EOD serializer, not a second
// recommendation implementation.  Its process lifetime bounds all temporary
// canonical features and Confluence candidates.
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
require(path.join(ROOT, "decision-engine", "config.js"));
require(path.join(ROOT, "decision-engine", "company-profile-classifier.js"));
const { buildTechnicalFeatures } = require(path.join(ROOT, "technical-features.js"));
const { marketCore, featureInputs, quoteFromItem } = require(path.join(ROOT, "decision-engine", "feature-inputs.js"));
const profiles = require(path.join(ROOT, "profile-definitions.js"));

for (const file of [
  "technical-engine.js", "exhaustion-engine.js", "market-engine.js", "etf-profile.js", "company-profile.js",
  "planning-width.js", "execution-engine.js", "short-model-v2.js", "confidence-engine.js", "stability-engine.js", "decision-engine.js",
]) require(path.join(ROOT, "decision-engine", file));

const engine = globalThis.DecisionEngine;
const HORIZONS = ["short", "mid", "long"];
const RAW_SERIES_KEYS = new Set([
  "completed", "bar_end_timestamps", "timestamps", "opens", "highs", "lows", "closes", "volumes", "bars", "series", "macd_series", "signal_series", "histogram_series",
]);
const finite = (value) => value == null || value === "" ? null : Number.isFinite(Number(value)) ? Number(value) : null;
const round = (value, digits = 6) => Number.isFinite(Number(value)) ? Number(Number(value).toFixed(digits)) : null;
const rangeFields = (range) => ({ low: finite(range?.low), high: finite(range?.high) });

function latestDailyDate(quote) {
  const values = quote?.history?.timestamps || [];
  return values.length ? String(values.at(-1)).slice(0, 10) : null;
}

function availableQuote(quote, marketDate) {
  return Number.isFinite(finite(quote?.price))
    && quote?.quote_status !== "unavailable"
    && quote?.history?.availability !== "unavailable"
    && !quote?.stale && quote?.dataStaleness !== "stale"
    && latestDailyDate(quote) === marketDate;
}

function featureFor(quote, market, recordedAtEt) {
  return buildTechnicalFeatures({ ...featureInputs(quote, market), calculatedAt: quote.updatedAt || recordedAtEt });
}

function compact(value, depth = 0) {
  if (value == null || typeof value === "string" || typeof value === "boolean" || Number.isFinite(value)) return value;
  if (depth > 9) return undefined;
  if (Array.isArray(value)) {
    // Technical feature arrays are calculation series.  No raw OHLCV or long
    // indicator series belongs in the history database.
    if (value.length > 32) return undefined;
    return value.map((item) => compact(item, depth + 1)).filter((item) => item !== undefined);
  }
  if (typeof value !== "object") return undefined;
  const result = {};
  for (const [key, item] of Object.entries(value)) {
    if (RAW_SERIES_KEYS.has(key) || /_series$/i.test(key) || /(^|_)raw(_|$)/i.test(key)) continue;
    const next = compact(item, depth + 1);
    if (next !== undefined) result[key] = next;
  }
  return result;
}

function horizonFeature(features, horizon) {
  const technicalKey = engine.config.horizons[horizon]?.technicalKey;
  const set = features?.horizons?.[technicalKey] || {};
  const fibonacciKey = { short: "short_term", mid: "mid_term", long: "long_term" }[horizon];
  const fib = features?.fibonacci_structure?.[fibonacciKey] || set.fibonacci || {};
  return compact({
    schema_version: features?.schema_version,
    calculated_at: features?.calculated_at,
    indicator_version: engine.config.indicators.version,
    trend_reference_price: set.trend_reference_price,
    horizon,
    availability: set.availability,
    primary_intervals: set.primary_intervals,
    supporting_intervals: set.supporting_intervals,
    source_intervals: features?.source_intervals,
    trend: set.trend,
    momentum: set.momentum,
    volatility: set.volatility,
    participation: set.participation,
    relative_strength: set.relative_strength,
    volume: features?.volume,
    price_position: features?.price_position,
    fibonacci: fib,
    missing_families: set.missing_families,
  });
}

function compactMarket(market, decision) {
  const core = marketCore(market);
  const equity = core.equity_trend || { spy: core.spy_trend, qqq: core.qqq_trend };
  const modifiers = decision?.market?.horizonModifiers || {};
  return compact({
    regime: decision?.market?.regime || core.regime || modifiers.regime,
    impact: modifiers.impact || modifiers.context || null,
    vix: core.vix || core.vix_context || null,
    equity_trend: { spy: equity.spy || null, qqq: equity.qqq || null },
    fear_greed: core.fear_greed || core.fearGreed || null,
    us_10y: core.us_10y || core.ten_year_yield || core.yield_10y || null,
    earnings: core.earnings || decision?.market?.earnings || null,
    market_modifiers: modifiers,
    material_change: decision?.debug?.materialChangeReasons || [],
  });
}

function profileContext(classification, horizonProfile) {
  const profile = horizonProfile || classification || {};
  const isETF = Boolean(classification?.isETF || profile.isETF);
  return {
    asset_type: isETF ? "ETF" : "stock",
    primary_classification: isETF ? null : (profile.primaryClassification || classification?.primaryClassification || null),
    lifecycle: isETF ? null : (profile.lifecycle || classification?.lifecycle || null),
    size_class: isETF ? null : (profile.sizeClass || classification?.sizeClass || null),
    company_traits: isETF ? null : (profile.companyTraits || classification?.companyTraits || []),
    business_trait: isETF ? null : (profile.businessTrait || classification?.businessTrait || null),
    risk_trait: isETF ? null : (profile.riskTrait || classification?.riskTrait || null),
    profile_status: isETF ? null : (profile.profileStatus || classification?.profileStatus || null),
    profile_source: isETF ? null : (profile.profileSource || classification?.profileSource || null),
    applied_profile_modifiers: isETF ? null : {
      applied: profile.appliedModifiers || [],
      effective: profile.effectiveModifiers || {},
      profile_confidence: profile.profileConfidence ?? classification?.profileConfidence ?? null,
      last_profile_review: profile.lastProfileReview || classification?.lastProfileReview || null,
      business_trait: profile.businessTrait || classification?.businessTrait || null,
      risk_trait: profile.riskTrait || classification?.riskTrait || null,
      profile_status: profile.profileStatus || classification?.profileStatus || null,
      profile_source: profile.profileSource || classification?.profileSource || null,
      size_class: profile.sizeClass || classification?.sizeClass || null,
    },
    leveraged: isETF ? Boolean(profile.leveraged ?? classification?.leveraged) : null,
    etf_direction: isETF ? (profile.direction || classification?.direction || null) : null,
    underlying: isETF ? (profile.underlying || classification?.underlying || null) : null,
    etf_modifiers: isETF ? {
      applied: profile.appliedModifiers || [],
      effective: profile.effectiveModifiers || {},
      underlying_ticker: profile.underlyingTicker || classification?.underlyingTicker || null,
    } : null,
  };
}

function unavailableRecord({ marketDate, recordedAtEt, ticker, classification, horizon, quote }) {
  const latest = latestDailyDate(quote);
  const reason = latest && latest !== marketDate ? "stale_daily_session" : quote?.stale || quote?.dataStaleness === "stale" ? "provider_refresh_failed_or_stale_quote" : "daily_source_unavailable";
  return {
    market_date: marketDate, recorded_at_et: recordedAtEt, ticker, horizon,
    data_status: "unavailable", action: null, confidence: null, price_state: "INVALID_LANDSCAPE", current_price: null,
    opportunity_low: null, opportunity_high: null, reduce_low: null, reduce_high: null, invalidation: null,
    landscape_quality: null, direction: null, confirmation: null, risk: null, exhaustion: null, market_regime: null,
    market_context: null, technical_features: { model_diagnostics: { model_version: engine.config.version, unavailable_reason: reason, latest_daily_date: latest, required_market_date: marketDate, provider_error: quote?.error || null } }, supporting_reasons: [], limiting_reasons: [{ code: reason }], material_change: [],
    ...profileContext(classification, classification),
  };
}

function recordFor({ marketDate, recordedAtEt, ticker, quote, classification, features, decision, horizon, market, shadow = null }) {
  const value = decision.horizons[horizon];
  const daily = quote.history || {};
  const lastIndex = (daily.timestamps || []).length - 1;
  const observation = lastIndex < 0 ? null : { timestamp: daily.timestamps[lastIndex], open: finite(daily.opens?.[lastIndex]), high: finite(daily.highs?.[lastIndex]), low: finite(daily.lows?.[lastIndex]), close: finite(daily.closes?.[lastIndex]), volume: finite(daily.volumes?.[lastIndex]), quote_price: finite(quote.price), quote_as_of: quote.updatedAt, currency: quote.metadata?.currency || daily.currency || null, adjustment_basis: daily.adjustment_basis || daily.adjustmentBasis || null, price_basis_alignment: quote.metadata?.historyBasisAlignment || "unverified_cross_endpoint" };
  const landscape = value.priceLandscape || {};
  const opportunity = rangeFields(landscape.opportunityRange);
  const reduce = rangeFields(landscape.reduceRange);
  return {
    market_date: marketDate,
    recorded_at_et: recordedAtEt,
    ticker,
    horizon,
    data_status: value.debug?.dataQuality?.missingCore?.length ? "partial" : "available",
    action: value.action,
    confidence: finite(value.confidence),
    price_state: value.debug?.priceState || null,
    current_price: finite(landscape.currentPrice ?? quote.price),
    opportunity_low: opportunity.low,
    opportunity_high: opportunity.high,
    reduce_low: reduce.low,
    reduce_high: reduce.high,
    invalidation: finite(landscape.invalidation),
    landscape_quality: finite(value.debug?.landscapeQuality?.score),
    direction: finite(value.states?.direction?.score),
    confirmation: finite(value.states?.confirmation?.score),
    risk: finite(value.states?.risk?.score),
    exhaustion: finite(value.states?.exhaustion?.score),
    market_regime: value.market?.regime || value.debug?.marketRegime || null,
    market_context: compactMarket(market, value),
    technical_features: { ...horizonFeature(features, horizon), current_observation: observation, model_diagnostics: { model_version: engine.config.version, path_version: value.debug?.pathVersion || "legacy-v1", feature_version: features.schema_version,
      indicator_policy: { version: engine.config.indicators.version, structure_levels_enabled: engine.config.indicators.integration.structureLevelsEnabled, structure_retention_gate: engine.config.indicators.integration.structureRetentionGate },
      confidence: compact(value.debug?.confidenceComponents), quality: compact(value.debug?.dataQuality), width_comparison: horizon === "short" ? shadow : null } },
    supporting_reasons: value.reasons?.supporting || [],
    limiting_reasons: value.reasons?.limiting || [],
    material_change: value.debug?.materialChangeReasons || [],
    ...profileContext(classification, value.profile),
  };
}

function* iterateRecords(input) {
  const marketDate = input.marketDate;
  const recordedAtEt = input.recordedAtEt;
  const payload = input.payload || {};
  const fileInput = input.format === "ticker-files-v1";
  const market = input.marketContext || payload.marketContext || payload.market_context || {};
  const items = fileInput ? input.items : payload.quotes && Object.keys(payload.quotes).length ? Object.entries(payload.quotes).map(([ticker, quote]) => ({ ticker, analysis: quote })) : payload.items || [];
  const byTicker = new Map(items.map((item) => [String(item.ticker || "").toUpperCase(), item]));
  const readQuote = (item) => fileInput ? JSON.parse(fs.readFileSync(item.path, "utf8")) : quoteFromItem(item);
  // Keep features only for actual shared underlying symbols. Own features
  // are used for three horizons and then released; no duplicate normalization.
  const underlyingTickers = new Set(Object.values(profiles.etfs || {}).map((p) => p.underlyingTicker).filter(Boolean));
  const featuresByUnderlying = new Map();
  function underlyingFor(ticker) {
    if (featuresByUnderlying.has(ticker)) return featuresByUnderlying.get(ticker);
    const item = byTicker.get(ticker);
    if (!item) return null;
    const quote = readQuote(item);
    if (!availableQuote(quote, marketDate)) return null;
    const result = { features: featureFor(quote, market, recordedAtEt), price: finite(quote.price) };
    featuresByUnderlying.set(ticker, result);
    return result;
  }
  for (const item of items) {
    const ticker = String(item.ticker || "").toUpperCase();
    if (!ticker) continue;
    const quote = readQuote(item);
    const classification = profiles.profileFor(ticker, quote.metadata || quote);
    if (!availableQuote(quote, marketDate)) {
      for (const horizon of HORIZONS) yield unavailableRecord({ marketDate, recordedAtEt, ticker, classification, horizon, quote });
      continue;
    }
    const cachedUnderlying = featuresByUnderlying.get(ticker);
    const ownFeatures = cachedUnderlying?.features || featureFor(quote, market, recordedAtEt);
    if (underlyingTickers.has(ticker)) featuresByUnderlying.set(ticker, { features: ownFeatures, price: finite(quote.price) });
    let underlying = null;
    const underlyingTicker = classification?.underlyingTicker || null;
    if (classification?.isETF && underlyingTicker) {
      underlying = underlyingTicker === ticker ? { features: ownFeatures, price: finite(quote.price) } : underlyingFor(String(underlyingTicker).toUpperCase());
    }
    const decision = engine.decide({
      ticker, price: finite(quote.price), technicalFeatures: ownFeatures, marketContext: market,
      classification, metadata: quote.metadata || {}, language: "en",
      underlyingTechnicalFeatures: underlying?.features || null,
      underlyingPrice: underlying?.price ?? null,
    });
    // Frozen daily shadow only. It never supplies a live action and performs
    // no parameter search; canonical features/market/underlying are reused.
    const shortInput = { ticker, horizon: "short", price: finite(quote.price), technicalFeatures: ownFeatures, market: decision.horizons.short.market, profile: engine.profile.build(classification, ticker), metadata: quote.metadata || {}, underlyingTechnicalFeatures: underlying?.features || null, underlyingPrice: underlying?.price ?? null, language: "en" };
    if (engine.config.shortReduceWidth.enabled) engine.stability.clear();
    const base = engine.config.shortReduceWidth.enabled ? engine.decideHorizon({ ...shortInput, modelOptions: { widthTransformEnabled: false } }) : decision.horizons.short;
    engine.stability.clear(); // Compare the candidate at the same cold EOD state.
    const candidate = engine.decideHorizon({ ticker, horizon: "short", price: finite(quote.price), technicalFeatures: ownFeatures, market: base.market, profile: engine.profile.build(classification, ticker), metadata: quote.metadata || {}, underlyingTechnicalFeatures: underlying?.features || null, underlyingPrice: underlying?.price ?? null, language: "en", modelOptions: { widthTransformEnabled: true } });
    const diagnosis = (value) => compact({ action: value.action, confidence: value.confidence, state: value.debug?.priceState, landscape: value.priceLandscape, direction: value.debug?.directionScore, confirmation: value.debug?.confirmationScore, risk: value.debug?.riskScore, exhaustion: value.debug?.exhaustionScore, room_atr: value.debug?.roomAtr, reward_risk: value.debug?.rewardRisk, width_transform: value.debug?.widthTransform });
    const shadow = { shadow_only: true, factor: engine.config.shortReduceWidth.factor, production_enabled: engine.config.shortReduceWidth.enabled, version: engine.config.shortReduceWidth.version, frozen_short_policy: engine.config.shortV2.policy, baseline: diagnosis(base), candidate: diagnosis(candidate) };
    for (const horizon of HORIZONS) yield recordFor({ marketDate, recordedAtEt, ticker, quote, classification, features: ownFeatures, decision, horizon, market, shadow });
  }
}

function main() {
  const [inputPath, outputPath] = process.argv.slice(2);
  if (!inputPath || !outputPath) throw new Error("Usage: 生成决策快照.js <input.json> <output.json>");
  const input = JSON.parse(fs.readFileSync(inputPath, "utf8"));
  const descriptor = fs.openSync(outputPath, "w");
  try {
    fs.writeSync(descriptor, JSON.stringify({ marketDate: input.marketDate, recordedAtEt: input.recordedAtEt }).slice(0, -1) + ",\"records\":[");
    let first = true;
    for (const record of iterateRecords(input)) {
      fs.writeSync(descriptor, (first ? "" : ",") + JSON.stringify(record));
      first = false;
    }
    fs.writeSync(descriptor, "]}");
  } finally { fs.closeSync(descriptor); }
}

try {
  main();
} catch (error) {
  console.error(`[EOD HISTORY] snapshot generation failed: ${error?.stack || error}`);
  process.exitCode = 1;
}
