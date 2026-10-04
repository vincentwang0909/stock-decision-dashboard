#!/usr/bin/env node
"use strict";
// Offline only. Replay completed native bars at each observed 1H close.
// Future 4H closes are used only to validate an already-recorded event;
// this is an event-timing audit, not a recommendation or trading backtest.
const fs = require("node:fs"), readline = require("node:readline");
const { _test: technical } = require("../technical-features.js");
const [inputFile, rawDirectory, outputFile] = process.argv.slice(2);
if (!outputFile) throw Error("Usage: structure-event-audit.js replay-inputs.jsonl raw-directory report.json");
const millis = (bar) => Date.parse(bar.end_timestamp);
const key = (event) => `${event.level_id}:${event.kind}`;
(async () => {
  const dates = new Map();
  for await (const line of readline.createInterface({ input: fs.createReadStream(inputFile), crlfDelay: Infinity })) {
    if (!line.trim()) continue;
    const row = JSON.parse(line);
    if (!dates.has(row.ticker)) dates.set(row.ticker, new Set());
    dates.get(row.ticker).add(row.date);
  }
  const report = { scope: "completed native 1H confirmation of previously known 4H references; no future input or action-return claims", tickers: dates.size, cutoffs: 0, earlyBreaks: 0, volumeConfirmed: 0, same4HBarConfirmed: 0, returnedAcrossReferenceAt4HClose: 0, leadMinutes: [], examples: [] };
  for (const [ticker, sessions] of dates) {
    const hourly = technical.normalizeBars(JSON.parse(fs.readFileSync(`${rawDirectory}/${ticker}-1h-365d.json`, "utf8")));
    const primary = technical.normalizeBars(JSON.parse(fs.readFileSync(`${rawDirectory}/${ticker}-4h-365d.json`, "utf8")));
    const firstEarly = new Map(), firstNative = new Map();
    for (const hour of hourly.filter((bar) => sessions.has(bar.timestamp.slice(0, 10)))) {
      const time = millis(hour), asOf = hour.end_timestamp;
      if (!Number.isFinite(time) || hour.completed !== true) continue;
      const a = primary.filter((bar) => millis(bar) <= time), b = hourly.filter((bar) => millis(bar) <= time);
      const native = technical.supportResistanceFeature(a, "4h", [], "1h", asOf);
      const early = technical.supportResistanceFeature(a, "4h", b, "1h", asOf);
      report.cutoffs++;
      for (const event of native.events || []) if (event.kind === "breakout_up" || event.kind === "breakdown_down") {
        if (!firstNative.has(key(event))) firstNative.set(key(event), event);
      }
      for (const event of early.events || []) if (event.confirmation_interval === "1h" && sessions.has(event.bar_timestamp.slice(0, 10)) && (event.kind === "breakout_up" || event.kind === "breakdown_down")) {
        if (!(Date.parse(event.reference_known_at) <= Date.parse(event.bar_timestamp) && Date.parse(event.timestamp) <= time)) throw Error("Event used future information");
        if (!firstEarly.has(key(event))) firstEarly.set(key(event), event);
      }
    }
    for (const [id, event] of firstEarly) {
      const enclosing = primary.find((bar) => millis(bar) > Date.parse(event.timestamp));
      if (!enclosing) continue;
      const native = firstNative.get(id), matched = native && Date.parse(native.timestamp) <= millis(enclosing) && Date.parse(native.timestamp) > Date.parse(event.timestamp);
      report.earlyBreaks++;
      if (event.volume_confirmed) report.volumeConfirmed++;
      if (event.sign * (enclosing.close - event.reference_price) <= 0) report.returnedAcrossReferenceAt4HClose++;
      if (matched) { report.same4HBarConfirmed++; report.leadMinutes.push((Date.parse(native.timestamp) - Date.parse(event.timestamp)) / 60000); }
      if (report.examples.length < 12) report.examples.push({ ticker, reference: event.reference_price, referenceKnownAt: event.reference_known_at, earlyAt: event.timestamp, nativeAt: matched ? native.timestamp : null, volumeConfirmed: event.volume_confirmed, returnedAcrossReference: event.sign * (enclosing.close - event.reference_price) <= 0 });
    }
  }
  const sorted = report.leadMinutes.sort((a, b) => a - b);
  report.medianLeadMinutes = sorted.length ? sorted[Math.floor(sorted.length / 2)] : null;
  fs.writeFileSync(outputFile, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ...report, examples: undefined, leadMinutes: undefined }));
})().catch((error) => { console.error(error); process.exitCode = 1; });
