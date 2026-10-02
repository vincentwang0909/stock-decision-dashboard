#!/usr/bin/env node
"use strict";
const fs=require("node:fs"),path=require("node:path");
const {_test:t}=require("../technical-features.js");
const [directory,output]=process.argv.slice(2);
const results=[];
for(const file of fs.readdirSync(directory).filter((file)=>file.endsWith(".json"))){
 const quote=JSON.parse(fs.readFileSync(path.join(directory,file),"utf8"));
 for(const [interval,source] of [["1d",quote.history],["1h",quote.history.intervals["1h"]],["4h",quote.history.intervals["4h"]]]){
  const bars=t.normalizeBars(source),closes=bars.map((bar)=>bar.close),values={};
  for(const [type,periods] of [["ema",[5,9,20,21,50,200]],["sma",[50,100,200]]]) for(const period of periods){
   const series=type==="ema"?t.emaSeries(closes,period):t.smaSeries(closes,period),lag=Math.min(5,Math.max(1,Math.floor(period/4)));
   values[`${type}_${period}`]=series.at(-1);
   values[`${type}_${period}_slope`]=Number.isFinite(series.at(-1-lag))?series.at(-1)-series.at(-1-lag):null;
  }
  for(const period of [6,14,21]) values[`rsi_${period}`]=t.rsiSeries(closes,period).at(-1);
  values.atr=t.atrFeature(bars,interval,14,quote.updatedAt);
  values.macd=t.macdFeature(bars,interval,[12,26,9],quote.updatedAt);
  values.adx=t.adxFeature(bars,interval,14,quote.updatedAt);
  values.bollinger=t.bollingerFeature(bars,interval,[20,2],quote.updatedAt);
  values.kdj=t.kdjFeature(bars,interval,9,quote.updatedAt);
  values.obv=t.obvFeature(bars,interval,20,quote.updatedAt);
  if(interval==="1d"){
   values.volume=t.canonicalVolumeFeature(bars,null,quote.updatedAt);
   const benchmark={market_context:{equity_trend:{spy:{as_of:bars.at(-1).timestamp,change_20d_pct:1.25,change_60d_pct:-2.5,change_120d_pct:3.75},qqq:{as_of:bars.at(-1).timestamp,change_20d_pct:-1.5,change_60d_pct:2.25,change_120d_pct:0}}}};
   values.relative_strength=require("../decision-engine/feature-inputs.js").relativeStrengthFromBars(bars,benchmark);
  }
  if(interval!=="1h") values.fibonacci=t.canonicalFibonacciHorizon(bars,interval==="4h"?"short_term":"mid_term",quote.price);
  if(interval==="1d") values.weekly_fibonacci=t.canonicalFibonacciHorizon(t.completedWeeklyBars(bars,{asOf:quote.updatedAt,calendar:quote.history.session_calendar}),"long_term",quote.price);
  for(const feature of Object.values(values)) if(feature&&typeof feature==="object") for(const key of Object.keys(feature)) if(key==="series"||key.endsWith("_series")) delete feature[key];
  results.push({ticker:quote.ticker,interval,bars:bars.length,values});
 }
}
fs.writeFileSync(output,JSON.stringify(results,null,2));
console.log(JSON.stringify({cases:results.length,output}));
