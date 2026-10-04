#!/usr/bin/env node
"use strict";
// Offline only: neither the Dashboard nor the EOD recorder loads this evaluator.
// Both engines receive completed, as-of-cut raw bars; future labels are read
// only by outcome(), after the production decision has finished.
const fs = require("node:fs"), path = require("node:path"), vm = require("node:vm"), readline = require("node:readline");
const [inputFile, baselineDir, rawDir, outputFile] = process.argv.slice(2);
if (!outputFile) throw Error("Usage: indicator-replay.js inputs.jsonl baseline-dir raw-dir output.json");
function runtime(directory) {
  let stamp;
  class SnapshotDate extends Date { constructor(...args) { super(...(args.length ? args : [stamp])); } static now() { return Date.parse(stamp); } }
  const ctx = vm.createContext({ console, Date: SnapshotDate });
  for (const file of ["decision-engine/config.js", "decision-engine/company-profile-classifier.js", "decision-engine/feature-inputs.js", "technical-features.js", ...["technical-engine", "exhaustion-engine", "market-engine", "etf-profile", "company-profile", "planning-width", "execution-engine", "short-model-v2", "confidence-engine", "stability-engine", "decision-engine"].map((name) => `decision-engine/${name}.js`)]) vm.runInContext(fs.readFileSync(path.join(directory, file), "utf8"), ctx, { filename: file });
  return { ctx, calculate(row) {
    stamp = row.input.metadata.asOf; ctx.DecisionEngine.stability.clear();
    const features = ctx.CanonicalTechnicalFeatures.buildTechnicalFeatures({ history: row.history, currentPrice: row.input.price, benchmarkContext: row.input.marketContext, calculatedAt: stamp });
    return { features, decision: ctx.DecisionEngine.decide({ ...row.input, technicalFeatures: features }) };
  } };
}
const baseline = runtime(baselineDir), current = runtime(path.resolve(__dirname, ".."));
const report = { scope: "raw-bar replay; cold-start action stability; historical frozen market/profile inputs; overlapping fixed-window observations are not independent trades", snapshots: 0, decisions: 0, changed: {}, baseline: {}, current: {}, outcomes: {}, invariantFailures: [], timingFailures: [], availability: {}, model: current.ctx.DecisionEngine.config.version };
const previous = new Map();
function count(group, key) { group[key] = (group[key] || 0) + 1; }
function compact(d) { return { action: d.action, state: d.debug.priceState, direction: d.debug.directionScore, confidence: d.confidence, landscape: JSON.stringify(d.priceLandscape) }; }
function check(d, ticker, date, horizon) {
  const p = d.priceLandscape, state = d.debug.priceState, positive = ["strong_buy", "buy", "accumulate"].includes(d.action), negative = ["trim", "sell"].includes(d.action);
  const fail = (reason) => report.invariantFailures.push({ ticker, date, horizon, reason });
  if (positive && !(p.opportunityRange && p.currentPrice >= p.opportunityRange.low && p.currentPrice <= p.opportunityRange.high)) fail("positive_outside_opportunity");
  if (negative && state !== "BREAKDOWN_ZONE" && !(p.reduceRange && p.currentPrice >= p.reduceRange.low)) fail("reduce_outside_range");
  if (["NEAR_OPPORTUNITY_ZONE", "NEUTRAL_ZONE", "NEAR_REDUCE_ZONE"].includes(state) && d.action !== "hold") fail("near_neutral_action");
  if (p.opportunityRange && p.reduceRange && !(p.opportunityRange.high < p.reduceRange.low)) fail("overlap");
  if (!(d.confidence >= 0 && d.confidence <= 100)) fail("confidence");
}
function outcome(row, results) {
  const file = path.join(rawDir, `${row.ticker}-1d-10y.json`);
  if (!fs.existsSync(file)) return;
  const raw = JSON.parse(fs.readFileSync(file, "utf8")), i = raw.timestamps.findIndex((date) => date.slice(0, 10) === row.date);
  if (i < 0) return;
  for (const name of ["baseline", "current"]) {
    if (row.input.classification?.isETF || !["strong_buy", "buy", "accumulate"].includes(results[name].decision.horizons.short.action)) continue;
    for (const days of [5, 10, 20]) {
      const entry = raw.opens[i + 1], exit = raw.closes[i + days];
      const key = `${name}:${days}`, record = report.outcomes[key] || (report.outcomes[key] = { observations: 0, immature: 0, sumNetPct: 0, costPct: 0.2 });
      if (!(entry > 0 && exit > 0)) { record.immature++; continue; }
      record.observations++; record.sumNetPct += (exit / entry - 1) * 100 - record.costPct;
    }
  }
}
(async () => {
  for await (const line of readline.createInterface({ input: fs.createReadStream(inputFile), crlfDelay: Infinity })) {
    if (!line.trim()) continue;
    const row = JSON.parse(line), results = { baseline: baseline.calculate(row), current: current.calculate(row) }; report.snapshots++;
    for (const horizon of ["short", "mid", "long"]) {
      const a = results.baseline.decision.horizons[horizon], b = results.current.decision.horizons[horizon]; report.decisions++;
      check(b, row.ticker, row.date, horizon);
      if (a.action !== b.action) count(report.changed, `${horizon}:action`);
      if (a.debug.priceState !== b.debug.priceState) count(report.changed, `${horizon}:state`);
      const key = `${row.ticker}:${horizon}`, prev = previous.get(key);
      for (const name of ["baseline", "current"]) {
        const now = compact(results[name].decision.horizons[horizon]); count(report[name], `${horizon}:observations`);
        if (prev) { count(report[name], `${horizon}:pairs`); if (prev[name].action !== now.action) count(report[name], `${horizon}:switches`); if (prev[name].landscape !== now.landscape) count(report[name], `${horizon}:landscape_changes`); }
      }
      previous.set(key, { baseline: compact(a), current: compact(b) });
      const set = results.current.features.horizons[{ short: "short", mid: "medium", long: "long" }[horizon]];
      for (const [name, feature] of [["squeeze", set.momentum.squeeze], ["structure", set.trend.support_resistance], ["combo", set.volatility.bollinger_rsi]]) count(report.availability, `${horizon}:${name}:${feature.availability}`);
      for (const event of set.trend.support_resistance.events || []) if (!(Date.parse(event.reference_known_at) <= Date.parse(event.bar_timestamp) && Date.parse(event.timestamp) <= Date.parse(row.input.metadata.asOf))) report.timingFailures.push({ ticker: row.ticker, date: row.date, horizon, event });
    }
    outcome(row, results);
  }
  for (const record of Object.values(report.outcomes)) record.meanNetPct = record.observations ? record.sumNetPct / record.observations : null;
  fs.writeFileSync(outputFile, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
  if (report.invariantFailures.length || report.timingFailures.length) process.exitCode = 1;
})().catch((error) => { console.error(error); process.exitCode = 1; });
