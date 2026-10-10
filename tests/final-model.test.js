"use strict";
const assert = require("node:assert/strict");
const { _test } = require("../technical-features.js");
for (const file of ["config", "company-profile-classifier", "technical-engine", "exhaustion-engine", "market-engine", "etf-profile", "company-profile", "planning-width", "execution-engine", "short-model-v2", "confidence-engine", "stability-engine", "horizon-model-v2", "decision-engine"]) require(`../decision-engine/${file}.js`);
const e = globalThis.DecisionEngine;
const zone = { valid: true, support: { center: 100 }, resistance: { center: 110 }, opportunityRange: { low: 99, high: 101 }, reduceRange: { low: 108, high: 112 }, invalidation: 98, gap: 1 };
const original = JSON.stringify(zone);
const transformed = e.planningWidth.transform(zone, { enabled: true });
assert.deepEqual(transformed.reduceRange, { low: 108.01, high: 111.99 });
assert.deepEqual(transformed.opportunityRange, zone.opportunityRange);
assert.equal(transformed.invalidation, zone.invalidation);
assert.equal(JSON.stringify(zone), original);
assert.deepEqual(e.planningWidth.transform(transformed, { enabled: true }), transformed, "no second shrink");
for (const options of [{ horizon: "mid" }, { horizon: "long" }, { breakdown: true }]) assert.deepEqual(e.planningWidth.transform(zone, { enabled: true, ...options }).reduceRange, zone.reduceRange);
for (let cents = 1; cents < 1000; cents++) {
  const value = e.planningWidth.transform({ ...zone, reduceRange: { low: 109, high: 109 + cents / 100 } }, { enabled: true });
  assert(value.reduceRange.low >= 109 && value.reduceRange.high <= 109 + cents / 100);
  assert(Math.abs((value.reduceRange.low + value.reduceRange.high) / 2 - (218 + cents / 100) / 2) < 1e-8);
}
const prepared = { price: 100, atr: 1, zone, direction: 35, upConfirmation: 65, downConfirmation: 35, risk: 30, exhaustion: 0, event: 0, quality: 100, structuralBreak: false, regime: "normal", evidence: { participation: 60, acceleration: 20 } };
assert.equal(e.shortV2.evaluate(prepared).action, "buy");
assert.equal(e.shortV2.evaluate({ ...prepared, price: 101.01 }).action, "hold");
assert.equal(e.shortV2.evaluate({ ...prepared, upConfirmation: 49 }).action, "hold");
assert.equal(e.shortV2.evaluate({ ...prepared, event: 18 }).why, "v2_event");
assert.equal(e.shortV2.evaluate({ ...prepared, regime: "shock" }).action, "hold");
assert.equal(e.shortV2.evaluate({ ...prepared, price: 110 }).action, "hold", "stock Short V2 permits continuing-trend Hold in Reduce");
assert.equal(e.shortV2.evaluate({ ...prepared, price: 110, direction: -50, downConfirmation: 80 }).action, "sell");
assert.equal(e.shortV2.evaluate({ ...prepared, price: 110, direction: 8, downConfirmation: 60 }).action, "trim");
assert.equal(e.shortV2.evaluate({ ...prepared, structuralBreak: true }, { widthTransformEnabled: true }).zone.widthTransform.reason, "defensive_exit_bypass");
assert.equal(e.shortV2.evaluate({ ...prepared, quality: 59, structuralBreak: true }).action, "hold");
assert.equal(e.shortV2.evaluate({ ...prepared, price: 105 }).state, "NEUTRAL_ZONE");
assert.equal(e.config.shortV2.scales.baselineBreakDirection, -68);
assert.equal(e.config.shortV2.scales.baselineBreakConfirmation, 52);
assert.equal(e.config.confidence.profileConfidenceWeight, 0);
assert(Math.abs(Object.values(e.config.confidence.weights).reduce((a,b) => a+b,0)-1)<1e-12);

function bars(count) {
  return Array.from({ length: count }, (_, i) => ({ timestamp: new Date(Date.UTC(2025,0,1+i)).toISOString(), open: 100+i*.1, high: 101+i*.1, low: 99+i*.1, close: 100+i*.1, volume: i%2?0:100 }));
}
for (const [count, window, available] of [[72,60,false],[73,60,true],[132,120,false],[133,120,true],[262,250,false],[263,250,true]]) {
  const feature = _test.atrFeature(bars(count), "4h", 14, "2026-10-01");
  assert.equal(Number.isFinite(feature[`atr_percentile_${window}`]), available);
  assert.equal(feature.atr_percentiles[`d${window}`].required_bars, 13+window);
}
for (const count of [11,12]) {
  const feature = _test.kdjFeature(bars(count), "4h", 9, "2026-10-01");
  assert.equal(feature.required_bars,12);
  assert.equal(feature.availability, count===12?"available":"unavailable");
}
const invalid = bars(8);
invalid[1].close=invalid[1].high+1;
invalid[2].timestamp=invalid[0].timestamp;
invalid[3].volume=-1;
invalid[4].open=null;
invalid[5].low=0;
const clean = _test.normalizeBars({ timestamps: invalid.map((bar)=>bar.timestamp), ...Object.fromEntries(["open","high","low","close","volume"].map((key)=>[`${key}s`,invalid.map((bar)=>bar[key])])) });
assert.equal(clean.length,3);
assert.equal(clean.validation.rejected_rows,5);
const constant = bars(100).map((bar)=>({...bar,open:100,high:100,low:100,close:100,volume:0}));
assert.equal(_test.adxFeature(constant,"1d",14,"2026-10-01").availability,"unavailable");
assert.equal(_test.atrFeature(constant,"1d",14,"2026-10-01").value,0);
// Independent Wilder recurrence, including first TR and exact tie convention.
const source = bars(263);
const tr = source.map((bar,i)=>i?Math.max(bar.high-bar.low,Math.abs(bar.high-source[i-1].close),Math.abs(bar.low-source[i-1].close)):bar.high-bar.low);
let atr = tr.slice(0,14).reduce((a,b)=>a+b,0)/14;
const series = Array(13).fill(null).concat([atr]);
for(let i=14;i<tr.length;i++){atr=(atr*13+tr[i])/14;series.push(atr);}
assert.deepEqual(_test.atrSeries(source,14),series);
const percentages=series.flatMap((value,i)=>value==null?[]:[value/source[i].close*100]);
assert.equal(_test.atrFeature(source,"4h",14,"2026-10-01").atr_percentile_250,percentages.filter((value)=>value<=percentages.at(-1)).length/250*100);
// The defensive branch reads the ORIGINAL technical-engine thresholds.
const pivotTechnical={raw:{atr:{value:1},fibonacci:{status:"available",swing_low:100}},directionComponents:{},confirmationComponents:{},riskComponents:{},dataQuality:{score:100},executionContext:{levels:[]},directionScore:-68,confirmationScore:52};
const pivotFeatures={horizons:{short:{}},volume:{}};
for(const [direction,confirmation,price,expected] of [[-68,52,99.74,true],[-67.99,90,99.74,false],[-90,51.99,99.74,false],[-90,90,99.75,false],[-45,48,99,false]]){
 const p=e.shortV2.prepare({technicalFeatures:pivotFeatures,technical:{...pivotTechnical,directionScore:direction,confirmationScore:confirmation},price,market:{regime:"normal"},profile:{}});
 assert.equal(p.structuralBreak,expected);
}
// Confidence must describe the final action, using downward support for Sell.
const sell=e.shortV2.decide({price:99,technicalFeatures:pivotFeatures,technical:{...pivotTechnical,signalPersistence:{score:70}},market:{regime:"normal"},profile:{profileConfidence:.82},language:"en"});
assert.equal(sell.action,"sell");assert.equal(sell.debug.confidenceComponents.action,sell.action);
assert.equal(sell.debug.confidenceComponents.profileConfidenceWeight,0);
assert.equal(sell.debug.confirmationScore,sell.debug.confirmationComponents.downward);
assert(Math.abs(sell.priceLandscape.reduceRange.low-99)<=.3);
const withoutProfileScore=e.shortV2.decide({price:99,technicalFeatures:pivotFeatures,technical:{...pivotTechnical,signalPersistence:{score:70}},market:{regime:"normal"},profile:{profileConfidence:0},language:"en"});
assert.equal(sell.confidence,withoutProfileScore.confidence);
const invalidDates=bars(3);invalidDates[0].timestamp="2026-02-30";invalidDates[1].timestamp="2026-10-01T13:00:00";
const arrays={timestamps:invalidDates.map(b=>b.timestamp),...Object.fromEntries(["open","high","low","close","volume"].map(k=>[`${k}s`,invalidDates.map(b=>b[k])]))};
assert.equal(_test.normalizeBars(arrays).length,1);
const unfinished={...arrays,timestamps:bars(3).map(b=>b.timestamp),last_bar_completed:false};
assert.equal(_test.normalizeBars(unfinished).at(-1).completed,false);
// Width transforms leave the ETF/legacy reduction invalidation reference intact.
const technical={atr:1,executionContext:{levels:[{price:112.005,label:"recovery",category:"swing"}]}};
const base={priceLandscape:{opportunityRange:{low:99,high:101},reduceRange:{low:108,high:112},invalidation:98},debug:{priceLandscapeInputs:{originalReduceHigh:112}}};
const narrowed={...base,priceLandscape:{...base.priceLandscape,reduceRange:{low:108.01,high:111.99}}};
assert.equal(e.execution.build({price:110,horizon:"short",action:"trim",technical,landscape:base}).priceLandscape.invalidation,e.execution.build({price:110,horizon:"short",action:"trim",technical,landscape:narrowed}).priceLandscape.invalidation);
const presentation=require("../decision-presentation.js");
assert(!presentation.priceMapModel({decision:{action:"avoid",priceLandscape:{currentPrice:null,invalidation:null,opportunityRange:{low:null,high:null}}}}).points.length);
console.log("Final model: width, action boundaries, ATR/KDJ counts, OHLCV and degenerate-data checks passed.");
