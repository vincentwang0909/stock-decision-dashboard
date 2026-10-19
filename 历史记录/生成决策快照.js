#!/usr/bin/env node
"use strict";

// This process deliberately loads the same production modules used by
// audits and the Dashboard.  It is a one-shot EOD serializer, not a second
// recommendation implementation.  Its process lifetime bounds all temporary
// canonical features and Confluence candidates.
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const ROOT = path.resolve(__dirname, "..");
require(path.join(ROOT, "decision-engine", "config.js"));
require(path.join(ROOT, "decision-engine", "company-profile-classifier.js"));
const { buildTechnicalFeatures } = require(path.join(ROOT, "technical-features.js"));
const { marketCore, featureInputs, quoteFromItem } = require(path.join(ROOT, "decision-engine", "feature-inputs.js"));
const profiles = require(path.join(ROOT, "profile-definitions.js"));
require(path.join(ROOT, "decision-presentation.js"));

for (const file of [
  "technical-engine.js", "exhaustion-engine.js", "market-engine.js", "etf-profile.js", "company-profile.js",
  "execution-engine.js", "confidence-engine.js", "stability-engine.js", "horizon-model-v2.js", "decision-engine.js",
]) require(path.join(ROOT, "decision-engine", file));

const engine = globalThis.DecisionEngine;
const HORIZONS = ["daily", "weekly"];
const sha256 = value => crypto.createHash("sha256").update(value).digest("hex");
const RAW_SERIES_KEYS = new Set([
  "completed", "bar_end_timestamps", "timestamps", "opens", "highs", "lows", "closes", "volumes", "bars", "series", "macd_series", "signal_series", "histogram_series",
]);
const finite = (value) => value == null || typeof value === "boolean" || typeof value === "string" && !value.trim() ? null : Number.isFinite(Number(value)) ? Number(value) : null;
const rangeFields = (range) => ({ low: finite(range?.low), high: finite(range?.high) });

function latestDailyDate(quote) {
  const values = quote?.history?.timestamps || [];
  return values.length ? String(values.at(-1)).slice(0, 10) : null;
}

function availableQuote(quote) {
  return Number.isFinite(finite(quote?.price))
    && quote?.quote_status !== "unavailable"
    && quote?.history?.availability !== "unavailable"
    && !quote?.stale && quote?.dataStaleness !== "stale";
}

function featureFor(quote, market, recordedAtEt) {
  return buildTechnicalFeatures({ ...featureInputs(quote, market), calculatedAt: recordedAtEt });
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
  const fibonacciKey = horizon;
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
    price_position: set.price_position || (horizon === "daily" ? features?.price_position : null),
    fibonacci: fib,
    fvg: set.fvg,
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

// Evidence only: this never evaluates a gate or creates another recommendation.
function explanation(decision) {
  const debug = decision.debug || {}, final = debug.finalDecision || {};
  const code = final.reasonCode || "unavailable";
  return compact({
    schema: "decision-explanation.v1", action: decision.action, primary_reason: {
      code, en: rootReason(code, "en"), zh: rootReason(code, "zh"),
    },
    supporting: decision.reasons?.supporting || [], limiting: decision.reasons?.limiting || [],
    decision_trace: final, states: decision.states, signal_as_of: decision.signalAsOf,
    quote_as_of: decision.quoteAsOf, background_only: Boolean(decision.backgroundOnly),
    data_quality: debug.dataQuality, landscape_quality: debug.landscapeQuality,
    execution_plan: decision.priceLandscape, structure_inputs: debug.priceLandscapeInputs,
    components: { direction: debug.directionComponents, confirmation: debug.confirmationComponents,
      risk: debug.riskComponents, exhaustion: debug.exhaustionComponents },
    market_gates: debug.marketModifiers, effective_profile_modifiers: debug.effectiveProfileModifiers,
    stability: debug.stability,
  });
}

function rootReason(code, language) {
  return globalThis.DecisionPresentation.translateReason({ code }, language);
}

function runContext(input) {
  const names = ["technical-features.js", "market_data_validation.py", "server.py", "server_resources.py", "profile-definitions.js", "decision-presentation.js",
    "历史记录/生成决策快照.js", "历史记录/历史记录数据库.py", "历史记录/历史记录建表.sql", "requirements.txt", ...fs.readdirSync(path.join(ROOT, "decision-engine")).filter(name => name.endsWith(".js")).sort().map(name => `decision-engine/${name}`)];
  const hash = sha256;
  const files = Object.fromEntries(names.map(name => [name, hash(fs.readFileSync(path.join(ROOT, name)))]));
  const core = marketCore(input.marketContext || input.payload?.marketContext || input.payload?.market_context || {});
  const calendar = core.event_calendar || {};
  const events = Array.isArray(calendar.events) ? calendar.events : [];
  return {
    schema: "eod-history.v2", engine_version: engine.config.version, feature_schema: engine.config.indicators.version,
    runtime: { node: process.version, v8: process.versions.v8 },
    source_sha256: hash(JSON.stringify(files)), source_files: files,
    config_sha256: hash(JSON.stringify(engine.config)), config: engine.config,
    quote_payload_sha256: input.sourceHashes || {}, market_payload_sha256: hash(JSON.stringify(core)),
    commit: /^[a-f0-9]{40}$/i.test(process.env.RENDER_GIT_COMMIT || "") ? process.env.RENDER_GIT_COMMIT : null,
    recorded_at: input.recordedAtEt, market_as_of: core.as_of || core.updated_at || null,
    macro_actuals: compact(core.macro_actuals || null),
    event_calendar: { ...compact(Object.fromEntries(Object.entries(calendar).filter(([key]) => key !== "events"))),
      events: events.slice(0, 128).map(event => compact(event)), event_count: events.length, truncated: events.length > 128 },
    evidence_scope: "completed-frame retained structures and daily observations; not an intraday event archive",
  };
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
    market_context: null, technical_features: { model_diagnostics: { model_version: engine.config.version, unavailable_reason: reason, latest_daily_date: latest, required_market_date: marketDate, provider_error: quote?.error || null },
      decision_explanation: { schema: "decision-explanation.v1", action: null, unavailable_reason: reason,
        primary_reason: { code: "waiting_required_data", en: rootReason("waiting_required_data", "en"), zh: rootReason("waiting_required_data", "zh") } } }, supporting_reasons: [], limiting_reasons: [{ code: reason }], material_change: [],
    ...profileContext(classification, classification),
  };
}

function recordFor({ marketDate, recordedAtEt, ticker, quote, classification, features, decision, horizon, market }) {
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
    technical_features: { ...horizonFeature(features, horizon), current_observation: observation,
      decision_explanation: explanation(value), model_diagnostics: { model_version: engine.config.version, path_version: value.debug?.pathVersion || engine.config.version, policy_family: value.debug?.policyFamily || null, feature_version: features.schema_version,
      indicator_policy: { version: engine.config.indicators.version, structure_levels_enabled: engine.config.indicators.integration.structureLevelsEnabled, structure_retention_gate: engine.config.indicators.integration.structureRetentionGate },
      execution_plan: compact(value.priceLandscape), background_only: Boolean(value.backgroundOnly), signal_as_of:value.signalAsOf,
      confidence: compact(value.debug?.confidenceComponents), quality: compact(value.debug?.dataQuality) } },
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
  input.sourceHashes = {};
  const readQuote = (item) => {
    const quote = fileInput ? JSON.parse(fs.readFileSync(item.path, "utf8")) : quoteFromItem(item);
    input.sourceHashes[String(item.ticker).toUpperCase()] = sha256(JSON.stringify(quote));
    return quote;
  };
  // Keep features only for actual shared underlying symbols. Own features
  // are used for two horizons and then released; no duplicate normalization.
  const underlyingTickers = new Set(Object.values(profiles.etfs || {}).map((p) => p.underlyingTicker).filter(Boolean));
  const featuresByUnderlying = new Map();
  function underlyingFor(ticker) {
    if (featuresByUnderlying.has(ticker)) return featuresByUnderlying.get(ticker);
    const item = byTicker.get(ticker);
    if (!item) return null;
    const quote = readQuote(item);
    if (!availableQuote(quote) || latestDailyDate(quote) !== marketDate) return null;
    const result = { features: featureFor(quote, market, recordedAtEt), price: finite(quote.price) };
    featuresByUnderlying.set(ticker, result);
    return result;
  }
  for (const item of items) {
    const ticker = String(item.ticker || "").toUpperCase();
    if (!ticker) continue;
    const quote = readQuote(item);
    const classification = profiles.profileFor(ticker, quote.metadata || quote);
    if (!availableQuote(quote)) {
      for (const horizon of HORIZONS) yield unavailableRecord({ marketDate, recordedAtEt, ticker, classification, horizon, quote });
      continue;
    }
    const cachedUnderlying = featuresByUnderlying.get(ticker);
    const ownFeatures = cachedUnderlying?.features || featureFor(quote, market, recordedAtEt);
    if (underlyingTickers.has(ticker) && latestDailyDate(quote) === marketDate) featuresByUnderlying.set(ticker, { features: ownFeatures, price: finite(quote.price) });
    let underlying = null;
    const underlyingTicker = classification?.underlyingTicker || null;
    if (classification?.isETF && underlyingTicker) {
      underlying = underlyingTicker === ticker ? { features: ownFeatures, price: finite(quote.price) } : underlyingFor(String(underlyingTicker).toUpperCase());
    }
    const decision = engine.decide({
      ticker, price: finite(quote.price), technicalFeatures: ownFeatures, marketContext: market,
      classification, metadata: { ...(quote.metadata || {}), quoteStale: Boolean(quote.stale), asOf: quote.last_quote_time || quote.updatedAt || quote.metadata?.asOf || null }, language: "en",
      underlyingTechnicalFeatures: underlying?.features || null,
      underlyingPrice: underlying?.price ?? null,
    });
    for (const horizon of HORIZONS) {
      // A missing Monday outside the last completed week must not erase a
      // valid Weekly decision. Untrusted Quote still blocks both above.
      if (horizon === "daily" && latestDailyDate(quote) !== marketDate) {
        yield unavailableRecord({marketDate,recordedAtEt,ticker,classification,horizon,quote});
      } else yield recordFor({marketDate,recordedAtEt,ticker,quote,classification,features:ownFeatures,decision,horizon,market});
    }
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
    fs.writeSync(descriptor, `],"run_context":${JSON.stringify(runContext(input))},"resource_metrics":${JSON.stringify({ node_peak_rss_bytes: process.resourceUsage().maxRSS * 1024 })}}`);
  } finally { fs.closeSync(descriptor); }
}

try {
  main();
} catch (error) {
  console.error(`[EOD HISTORY] snapshot generation failed: ${error?.stack || error}`);
  process.exitCode = 1;
}
