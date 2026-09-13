#!/usr/bin/env node
"use strict";

// Read-only companion to classify-company-profiles.js. It is intentionally
// short-lived and has no SQLite/cache write path; live audit callers supply
// compact provider metadata and receive canonical classifier explanations.
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
require(path.join(ROOT, "decision-engine", "config.js"));
const classifier = require(path.join(ROOT, "decision-engine", "company-profile-classifier.js"));
require(path.join(ROOT, "decision-engine", "etf-profile.js"));
require(path.join(ROOT, "decision-engine", "company-profile.js"));
const profile = globalThis.DecisionEngine.profile;

const [inputPath, outputPath] = process.argv.slice(2);
if (!inputPath || !outputPath) throw new Error("Usage: explain-company-profiles.js <input.json> <output.json>");

const input = JSON.parse(fs.readFileSync(inputPath, "utf8"));
const rows = Object.entries(input.metadataByTicker || {}).map(([ticker, metadata]) => {
  const explanation = classifier.explain(metadata || {});
  if (explanation.isETF) return { ticker: String(ticker).toUpperCase(), type: "ETF" };
  const result = explanation.result;
  const effective = profile.build(result, ticker);
  return {
    ticker: String(ticker).toUpperCase(),
    type: "stock",
    result,
    source: explanation.source,
    businessCandidates: explanation.businessCandidates,
    lifecycleCandidates: explanation.lifecycleCandidates,
    effectiveModifiers: effective.effectiveModifiers,
    modifierProvenance: effective.modifierProvenance,
    modifierDimensionProvenance: effective.modifierDimensionProvenance,
  };
});

fs.writeFileSync(outputPath, JSON.stringify({ rows }), "utf8");
