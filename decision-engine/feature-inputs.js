(function createFeatureInputs(root) {
"use strict";

// Shared inputs for building canonical technical features from a fetched quote.
//
// Shared by the browser, EOD recorder and decision.v1 serializer so they
// build features from exactly the same code. Two copies
// of this would be a second feature implementation by drift, which AGENTS.md
// rules out — `technical-features.js` must stay the one canonical producer, and
// its inputs have to be assembled identically by every caller.

const finite = (value) => (value == null || typeof value === "boolean" || String(value).trim() === "" ? null : Number.isFinite(Number(value)) ? Number(value) : null);

function marketCore(market) {
  return market?.market_context || market?.market_engine || market || {};
}

function returnPct(closes, lookback) {
  const values = (closes || []).map(finite);
  const latest = values.at(-1);
  const base = values.at(-1 - lookback);
  return Number.isFinite(latest) && Number.isFinite(base) && base !== 0 ? (latest / base - 1) * 100 : null;
}

function relativeStrengthFromBars(bars, market) {
  const quote = { history: { closes: bars.map((bar) => bar.close), timestamps: bars.map((bar) => bar.timestamp) } };
  const core = marketCore(market);
  const equity = core.equity_trend || { spy: core.spy_trend, qqq: core.qqq_trend };
  return Object.fromEntries([20, 60, 120].flatMap((days) => {
    const stock = returnPct(quote.history?.closes, days);
    const asOf = String(quote.history.timestamps.at(-1) || "").slice(0, 10);
    const against = (benchmark) => (!benchmark?.as_of || String(benchmark.as_of).slice(0, 10) === asOf) && stock != null && finite(benchmark?.[`change_${days}d_pct`]) != null
      ? stock - finite(benchmark[`change_${days}d_pct`]) : null;
    return [[`stock_return_${days}d`, stock], [`stock_vs_spy_${days}d`, against(equity.spy)], [`stock_vs_qqq_${days}d`, against(equity.qqq)]];
  }));
}

function relativeStrength(quote, market) {
  const canonical = root.CanonicalTechnicalFeatures || (typeof require !== "undefined" ? require("../technical-features.js") : null);
  return relativeStrengthFromBars(canonical._test.normalizeBars(quote.history || {}), market);
}

function featureInputs(quote, market) {
  return {
    history: quote.history || {},
    currentPrice: finite(quote.price),
    benchmarkContext: market,
    fibonacciStructure: quote.technical?.fibonacci_structure || {},
    shareBase: quote.metadata?.sharesOutstanding || null,
  };
}

function quoteFromItem(item) {
  return item?.analysis || item?.quote || item || {};
}

const api = { finite, marketCore, returnPct, relativeStrength, relativeStrengthFromBars, featureInputs, quoteFromItem };
root.CanonicalFeatureInputs = api;

if (typeof module !== "undefined" && module.exports) module.exports = api;

}(globalThis));
