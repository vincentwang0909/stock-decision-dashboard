#!/usr/bin/env node
"use strict";
// Offline evaluator boundary: this file alone may read labels/future observations.
const fs = require("node:fs"), path = require("node:path"), vm = require("node:vm");
const [inputPath, baselinePath, outputPath, referencePath, validationPath] = process.argv.slice(2);
if (!outputPath) throw new Error("Usage: final-model-replay.js inputs.jsonl baseline-repo output.jsonl [reference-v2] [frozen-validation-repo]");
const currentPath = path.resolve(__dirname, "..");
function loadEngine(directory) {
  let asOf = "2026-08-18T21:30:00-04:00";
  class SnapshotDate extends Date { constructor(...args) { super(...(args.length ? args : [asOf])); } static now() { return new Date(asOf).getTime(); } }
  const context = vm.createContext({ console, Date: SnapshotDate });
  const files = ["config.js", "company-profile-classifier.js", "technical-engine.js", "exhaustion-engine.js", "market-engine.js", "etf-profile.js", "company-profile.js", "planning-width.js", "execution-engine.js", "short-model-v2.js", "confidence-engine.js", "stability-engine.js", "horizon-model-v2.js", "decision-engine.js"];
  for (const file of files) { const source = path.join(directory, "decision-engine", file); if (fs.existsSync(source)) vm.runInContext(fs.readFileSync(source, "utf8"), context, { filename: source }); }
  return { engine: context.DecisionEngine, setTime: (value) => { asOf = value; } };
}
const baseline = loadEngine(baselinePath), current = loadEngine(currentPath), reference = referencePath ? loadEngine(referencePath) : null;
const validation = validationPath ? loadEngine(validationPath) : null;
const rows = fs.readFileSync(inputPath, "utf8").trim().split("\n").map(JSON.parse);
const byDateTicker = new Map(rows.map((row) => [`${row.date}:${row.ticker}`, row]));
const underlyingMap = { SQQQ: "QQQ", SPXU: "SPY", SOXS: "SOXX" }; // ETF architecture only, never ordinary stock parameters.
function calculate(runtime, row, widthTransformEnabled) {
  runtime.setTime(row.input.metadata.asOf);
  runtime.engine.stability.clear();
  const underlying = underlyingMap[row.ticker];
  const actual = underlying ? byDateTicker.get(`${row.date}:${underlying}`) : null;
  return runtime.engine.decide({ ...row.input, classification: { ...row.input.classification, underlyingTicker: underlying || null }, underlyingTechnicalFeatures: actual?.input.technicalFeatures || null, underlyingPrice: actual?.input.price ?? null, modelOptions: { widthTransformEnabled } });
}
function compact(value) {
  const landscape = value.priceLandscape, debug = value.debug;
  return { action: value.action, confidence: value.confidence, state: debug.priceState, family: debug.actionFamily, landscape, direction: debug.directionScore, confirmation: debug.confirmationScore, risk: debug.riskScore, exhaustion: debug.exhaustionScore, mode: debug.decisionMode || null,
    widthTransform: debug.widthTransform || null, confidenceComponents: debug.confidenceComponents, reasons: value.reasons, quality: debug.dataQuality, modelVersion: debug.modelVersion || baseline.engine.config.version };
}
const fd = fs.openSync(outputPath, "w");
const originalConfig = current.engine.config;
let count = 0;
for (const row of rows) {
  const before = calculate(baseline, row, false);
  // An earlier intermediate policy must come from an explicit frozen source.
  // The current engine has no V1 switch; absent historical input stays absent.
  const resourceAndValidation = validation ? calculate(validation, row, false) : null;
  const after = calculate(current, row, false), candidate = calculate(current, row, true);
  const historicalReference = reference ? calculate(reference, row, false) : null;
  for (const horizon of ["short", "mid", "long"]) {
    const interval = { short: "4h", mid: "1d", long: "1w" }[horizon];
    const set = row.input.technicalFeatures.horizons[{ short: "short", mid: "medium", long: "long" }[horizon]];
    const atr = set.volatility?.atr?.[`atr_14_${interval}`]?.value ?? null;
    fs.writeSync(fd, JSON.stringify({ date: row.date, ticker: row.ticker, assetType: row.assetType, historicalOriginalMatch: row.historicalOriginalMatch, horizon, price: row.input.price, atr, stored: row.stored[horizon], baseline: compact(before.horizons[horizon]), resourceAndValidation: resourceAndValidation ? compact(resourceAndValidation.horizons[horizon]) : null, current: compact(after.horizons[horizon]), candidate: compact(candidate.horizons[horizon]), reference: historicalReference ? compact(historicalReference.horizons[horizon]) : null }) + "\n");
    count++;
  }
}
fs.closeSync(fd);
console.log(JSON.stringify({ rows: count, baselineVersion: baseline.engine.config.version, currentVersion: originalConfig.version, frozenPolicy: originalConfig.shortV2.policy, widthFactor: originalConfig.shortReduceWidth.factor, outputPath, coldStart: true, historicalProfileSlots: "validated snapshot only; metadata unavailable", rawOHLCVRecalculation: false }));
