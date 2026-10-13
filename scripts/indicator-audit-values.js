#!/usr/bin/env node
"use strict";
// Read-only values from completed source bars. Raw audit output belongs outside the repository.
const fs=require("node:fs"),path=require("node:path");const {_test:t}=require("../technical-features.js");
const [directory,output]=process.argv.slice(2);if(!directory||!output)throw new Error("Usage: indicator-audit-values.js <quotes-directory> <output.json>");
const results=[];
for(const file of fs.readdirSync(directory).filter(x=>x.endsWith('.json'))) {
 const saved=JSON.parse(fs.readFileSync(path.join(directory,file))),q=saved.quote || saved,h=q.history,at=h.as_of || q.updatedAt;
 const daily=t.normalizeBars(h,{priceOnly:true}).filter(x=>x.completed===true && Date.parse(x.end_timestamp)<=Date.parse(at));
 const weekly=t.completedWeeklyBars(daily,{asOf:at,calendar:h.session_calendar});
 for(const [interval,bars] of [["1d",daily],["1w",weekly]]) {
  const closes=bars.map(x=>x.close),values={};
  for(const [kind,periods] of [["ema",[10,20,50]],["sma",[100,200]]])for(const n of periods)values[`${kind}_${n}`]=(kind==='ema'?t.emaSeries(closes,n):t.smaSeries(closes,n)).at(-1) ?? null;
  for(const n of [6,14,21])values[`rsi_${n}`]=t.rsiSeries(closes,n).at(-1) ?? null;
  for(const name of ['atr','adx','kdj'])values[name]=t[`${name}Feature`](bars,interval,name==='kdj'?9:14,at);
  values.macd=t.macdFeature(bars,interval,[12,26,9],at);values.bollinger=t.bollingerFeature(bars,interval,[20,2],at);
  values.obv=t.obvFeature(bars,interval,interval==='1w'?12:20,at);values.volume=t.canonicalVolumeFeature(bars,null,at,interval);
  values.fibonacci=t.canonicalFibonacciHorizon(bars,interval==='1d'?'daily':'weekly',closes.at(-1));
  for(const feature of Object.values(values))if(feature&&typeof feature==='object')for(const k of Object.keys(feature))if(k==='series'||k.endsWith('_series'))delete feature[k];
  results.push({ticker:q.ticker || file.slice(0,-5),interval,bars:bars.length,asOf:at,values});
 }
}
fs.writeFileSync(output,JSON.stringify(results));console.log(JSON.stringify({cases:results.length,output}));
