(function createFeatureInputs(root) {
"use strict";

// Shared inputs for building canonical technical features from a fetched quote.
//
// Shared by the browser, EOD recorder and decision serializer so they
// build features from exactly the same code. Two copies
// of this would be a second feature implementation by drift, which AGENTS.md
// rules out — `technical-features.js` must stay the one canonical producer, and
// its inputs have to be assembled identically by every caller.

const finite = (value) => (value == null || typeof value === "boolean" || String(value).trim() === "" ? null : Number.isFinite(Number(value)) ? Number(value) : null);

function marketCore(market) {
  return market?.market_context || market?.market_engine || market || {};
}

function featureInputs(quote, market) {
  return {
    history: quote.history || {},
    currentPrice: finite(quote.price),
    benchmarkContext: market,
    calculatedAt: quote.history?.as_of || quote.updatedAt || null,
    shareBase: quote.metadata?.sharesOutstanding || null,
  };
}

function quoteFromItem(item) {
  return item?.analysis || item?.quote || item || {};
}

const api = { finite, marketCore, featureInputs, quoteFromItem };
root.CanonicalFeatureInputs = api;

if (typeof module !== "undefined" && module.exports) module.exports = api;

}(globalThis));
