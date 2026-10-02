#!/usr/bin/env node
"use strict";

// Read-only horizon-source audit. It reproduces the dashboard's canonical
// Fibonacci structures from cached interval history, reports anchor duplicates,
// and verifies that no horizon shares a mutable Fibonacci object with another.
const { buildTechnicalFeatures } = require("../technical-features.js");

const HORIZONS = Object.freeze([
  ["short", "short_term"], ["mid", "mid_term"], ["long", "long_term"],
]);
const finite = (value) => value == null || value === "" ? null : Number.isFinite(Number(value)) ? Number(value) : null;
const round = (value, digits = 4) => Number.isFinite(value) ? Number(value.toFixed(digits)) : null;
function featureFor(quote, market) {
  return buildTechnicalFeatures({
    history: quote.history || {}, currentPrice: finite(quote.price), benchmarkContext: market, calculatedAt: quote.updatedAt || quote.history?.as_of || new Date().toISOString(),
    fibonacciStructure: quote.technical?.fibonacci_structure || {}, shareBase: quote.metadata?.sharesOutstanding || null,
  });
}
function anchors(fib) {
  if (!fib || !["available", "stale_swing"].includes(fib.status)) return null;
  return [fib.swing_low_date, round(fib.swing_low), fib.swing_high_date, round(fib.swing_high), fib.swing_direction].join("|");
}
function compact(horizon, fib) {
  return {
    horizon, status: fib?.status || "unavailable", sourceTimeframe: fib?.source_timeframe || null,
    lookbackBars: fib?.lookback_bars ?? null, sourceBarCount: fib?.source_bar_count ?? null,
    pivotHighCount: fib?.pivot_high_count ?? null, pivotLowCount: fib?.pivot_low_count ?? null,
    swingHigh: fib?.swing_high ?? null, swingHighDate: fib?.swing_high_date ?? null,
    swingLow: fib?.swing_low ?? null, swingLowDate: fib?.swing_low_date ?? null,
    swingDirection: fib?.swing_direction ?? null, fallbackUsed: Boolean(fib?.fallback_used),
    fallbackReason: fib?.fallback_reason || null, sourceObjectId: fib?.source_object_id || null,
    sourceBarHash: fib?.source_bar_hash || null, derivationId: fib?.derivation_id || null,
    anchors: anchors(fib),
  };
}
function duplicateCheck(structure) {
  const short = structure.short_term;
  const mid = structure.mid_term;
  const long = structure.long_term;
  const shortAnchor = anchors(short);
  const midAnchor = anchors(mid);
  const longAnchor = anchors(long);
  const sameShortMid = Boolean(shortAnchor && shortAnchor === midAnchor);
  const sameMidLong = Boolean(midAnchor && midAnchor === longAnchor);
  const sameAll = Boolean(sameShortMid && shortAnchor === longAnchor);
  const ids = [short?.derivation_id, mid?.derivation_id, long?.derivation_id];
  const objects = [short, mid, long];
  return {
    sameShortMid, sameMidLong, sameAll,
    independentlyDerived: new Set(ids.filter(Boolean)).size === ids.filter(Boolean).length,
    sharedObject: short === mid || mid === long || short === long,
    sameAnchorsExplanation: sameShortMid || sameMidLong ? "same anchors may be valid only when derivation IDs are distinct" : null,
  };
}

async function main() {
  const base = process.env.FIBONACCI_AUDIT_API || "http://127.0.0.1:4174";
  const watchlistResponse = await fetch(`${base}/api/watchlist`);
  if (!watchlistResponse.ok) throw new Error(`Watchlist API returned ${watchlistResponse.status}`);
  const watchlistPayload = await watchlistResponse.json();
  const watchlist = (watchlistPayload.items || watchlistPayload.watchlist || []).map((item) => typeof item === "string" ? item : item.ticker).filter(Boolean).map((ticker) => String(ticker).toUpperCase());
  // Fibonacci provenance is audited only for the canonical current universe.
  // A historical focus list must not resurrect a removed cache/profile symbol.
  const tickers = watchlist;
  const response = await fetch(`${base}/api/market-data?tickers=${encodeURIComponent(tickers.join(","))}&cache_only=1`);
  if (!response.ok) throw new Error(`Market-data API returned ${response.status}`);
  const payload = await response.json();
  const market = payload.marketContext || payload.market_context || {};
  const rows = Object.fromEntries((payload.items || []).map((item) => [item.ticker, item.analysis || item]));
  const records = {};
  const duplicateRows = [];
  const sourceCounts = {};
  let sharedObjectViolations = 0;
  for (const ticker of tickers) {
    const quote = rows[ticker] || {};
    if (!Number.isFinite(finite(quote.price)) || quote.history?.availability === "unavailable") {
      records[ticker] = { status: "unavailable", reason: quote.history?.unavailable_reason || quote.error || "No cached quote/history." };
      continue;
    }
    const features = featureFor(quote, market);
    const structure = features.fibonacci_structure || {};
    const duplicate = duplicateCheck(structure);
    const horizons = Object.fromEntries(HORIZONS.map(([horizon, key]) => [horizon, compact(horizon, structure[key])]));
    Object.values(horizons).forEach((item) => {
      const key = `${item.horizon}:${item.sourceTimeframe || "unavailable"}${item.fallbackUsed ? ":fallback" : ""}`;
      sourceCounts[key] = (sourceCounts[key] || 0) + 1;
    });
    if (duplicate.sharedObject) sharedObjectViolations += 1;
    if (duplicate.sameShortMid || duplicate.sameMidLong) duplicateRows.push({ ticker, ...duplicate, short: horizons.short, mid: horizons.mid, long: horizons.long });
    records[ticker] = { status: "available", price: finite(quote.price), horizons, duplicate };
  }
  console.log(JSON.stringify({
    generatedAt: new Date().toISOString(), cacheOnly: true, watchlist, records,
    sourceCounts, duplicateSummary: {
      sameShortMid: duplicateRows.filter((item) => item.sameShortMid).length,
      sameMidLong: duplicateRows.filter((item) => item.sameMidLong).length,
      sameAll: duplicateRows.filter((item) => item.sameAll).length,
      sharedObjectViolations, rows: duplicateRows,
    },
  }, null, 2));
}

main().catch((error) => { console.error(error.stack || error.message); process.exitCode = 1; });
