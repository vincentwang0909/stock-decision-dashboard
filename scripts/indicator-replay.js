#!/usr/bin/env node
"use strict";
// Causal offline diagnostics on supplied source bars. Latest macro vintages,
// current issuer tags and outcomes are never presented as a validated backtest.
const fs=require("node:fs"),path=require("node:path");
for(const file of ["config","company-profile-classifier","technical-engine","exhaustion-engine","market-engine","etf-profile","company-profile","execution-engine","confidence-engine","stability-engine","horizon-model-v2","decision-engine"])require(`../decision-engine/${file}.js`);
const e=globalThis.DecisionEngine,{buildTechnicalFeatures,_test:t}=require("../technical-features.js"),profiles=require("../profile-definitions.js");
const [input,output]=process.argv.slice(2);if(!input||!output)throw new Error("Usage: indicator-replay.js <snapshot.json> <output.json>");
const s=JSON.parse(fs.readFileSync(input)),core=s.marketContext?.market_context || {},rows=[],issues=[];
const slice=(h,i,at)=>{
 const q={...h};delete q.intervals;
 for(const k of ['timestamps','opens','highs','lows','closes','volumes','completed','bar_end_timestamps'])q[k]=(h[k] || []).slice(0,i+1);
 q.as_of=at;q.freshness={state:'current',latest_date:q.timestamps.at(-1),expected_completed_date:q.timestamps.at(-1)};
 const calendar=h.session_calendar || {},knownWeeks=Object.keys(calendar.week_ends || {}).filter(k=>Date.parse(calendar.week_ends[k])<=Date.parse(at));
 q.session_calendar={...calendar,closed_week_keys:(calendar.closed_week_keys || []).filter(k=>knownWeeks.includes(k)),completed_week_keys:(calendar.completed_week_keys || []).filter(k=>knownWeeks.includes(k)),missing_session_dates:(calendar.missing_session_dates || []).filter(d=>d<=at.slice(0,10))};
 return q;
};
const benchmarkAt=(h,at)=>{const i=(h.bar_end_timestamps || []).findLastIndex(x=>Date.parse(x)<=Date.parse(at));return slice(h,i,at);};
const indexAt=h=>({as_of:h.as_of,...Object.fromEntries([5,20,60,120].map(n=>[`change_${n}d_pct`,h.closes?.length>n?(h.closes.at(-1)/h.closes.at(-1-n)-1)*100:null]))});
for(const item of s.items || []) {
 const q=item.analysis || item.quote || item,h=q.history,classification=profiles.profileFor(item.ticker,q.metadata || {});if(!h?.closes?.length)continue;
 const daily=t.normalizeBars(h,{priceOnly:true}),weekly=t.completedWeeklyBars(daily,{asOf:h.as_of,calendar:h.session_calendar});
 for(const horizon of ['daily','weekly']) {
  const bars=horizon==='daily'?daily:weekly,windows=horizon==='daily'?[5,20,60]:[4,12,26];
  const start=Math.max(horizon==='daily'?260:55,bars.length-(horizon==='daily'?220:60));
  let count=0;
  for(let j=start;j<bars.length-windows.at(-1) && count<28;j+=(horizon==='daily'?5:2),count++) {
   const b=bars[j],i=h.timestamps.indexOf(b.timestamp),at=b.end_timestamp;if(i<0)continue;
   const past=slice(h,i,at),benchmarks=Object.fromEntries(Object.entries(core.benchmark_history || {}).map(([k,v])=>[k,benchmarkAt(v,at)]));
   const market={market_context:{as_of:at,source:'historical_technical_only',equity_trend:Object.fromEntries(Object.entries(benchmarks).map(([k,h])=>[k,indexAt(h)])),benchmark_history:benchmarks,event_calendar:{status:'unavailable',events:[]},macro_actuals:{status:'unavailable'},fomc_expectations:{status:'unavailable'}}};
   const f=buildTechnicalFeatures({history:past,currentPrice:b.close,benchmarkContext:market,calculatedAt:at});
   const d=e.decide({ticker:item.ticker,price:b.close,technicalFeatures:f,marketContext:market,classification,metadata:{asOf:at}}).horizons[horizon],p=d.priceLandscape,atr=f.horizons[horizon].volatility.atr[`atr_14_${horizon==='daily'?'1d':'1w'}`].value;
   const smc=f.horizons[horizon].trend.smc || {};
   for(const ref of [smc.last_bos,smc.last_choch,smc.protected_low,smc.protected_high])if(ref && [ref.timestamp,ref.known_at,ref.reference_known_at].filter(Boolean).some(v=>Date.parse(v)>Date.parse(at)))issues.push({ticker:item.ticker,horizon,date:b.timestamp,code:'future_structure_reference'});
   const entering=['buy','accumulate','strong_buy'].includes(d.action);if(entering&&!(p.opportunityRange&&b.close>=p.opportunityRange.low&&b.close<=p.opportunityRange.high&&p.rewardRisk>=e.config.execution.rewardRisk[d.action]))issues.push({ticker:item.ticker,horizon,date:b.timestamp,code:'entry_invariant'});
   const future=Object.fromEntries(windows.map(n=>{const next=bars.slice(j+1,j+n+1),high=Math.max(...next.map(x=>x.high)),low=Math.min(...next.map(x=>x.low));return[n,{closeChangePct:(next.at(-1).close/b.close-1)*100,mfePct:(high/b.close-1)*100,maePct:(low/b.close-1)*100,mfeAtr:atr>0?(high-b.close)/atr:null,maeAtr:atr>0?(low-b.close)/atr:null,barsToHigh:next.findIndex(x=>x.high===high)+1,barsToLow:next.findIndex(x=>x.low===low)+1}];}));
   // Direction changes wait for the next own close. Recheck the frozen plan at
   // the next regular-session open, rather than assuming a same-close fill.
   const next=bars[j+1],longAtOpen=entering&&p.opportunityRange&&next.open>=p.opportunityRange.low&&next.open<=p.opportunityRange.high&&next.open>p.invalidation&&p.entryTarget>next.open&&(p.entryTarget-next.open)/(next.open-p.invalidation)>=e.config.execution.rewardRisk[d.action];
   rows.push({ticker:item.ticker,horizon,date:b.timestamp,action:d.action,reason:d.debug.finalDecision.reasonCode,landscapeReason:d.debug.landscapeQuality.reason,confirmation:d.states.confirmation.score,risk:d.states.risk.score,direction:d.states.direction.score,atrAtSignal:atr,priceState:d.debug.priceState,signalAsOf:d.signalAsOf,earlyRepairBars:smc.support_repair_bars,quote:b.close,range:p.opportunityRange,rewardRisk:p.rewardRisk,nextOpen:next.open,longAtNextOpen:Boolean(longAtOpen),knownAt:smc.protected_low?.known_at || smc.last_bos?.reference_known_at || null,future,missedBullishEntry:d.action==='hold'&&smc.bullish_confirmed&&d.states.direction.score>=e.config.actionPolicy.gates.buy.direction&&d.debug.finalDecision.reasonCode==='price_outside_entry'});
  }
 }
}
const actions=rows.reduce((a,r)=>(a[r.action]=(a[r.action]||0)+1,a),{}),report={model:'V2',records:rows.length,actions,issueCount:issues.length,issues,windows:{daily:[5,20,60],weekly:[4,12,26]},labelConvention:'future highs/lows use fixed ATR at signal; entering plans rechecked at next regular open; no same-close fill',limitations:['frozen issuer classification is not historically point-in-time','no original historical macro/event snapshots: new short and leveraged entry pauses remain active','not a transaction P&L or profitability validation; commissions/slippage/borrow are not known','outcomes never enter production'],earlyAccumulate:rows.filter(r=>r.action==='accumulate').map(r=>({ticker:r.ticker,date:r.date,horizon:r.horizon,labels:r.future})),earlyTrim:rows.filter(r=>r.action==='trim').map(r=>({ticker:r.ticker,date:r.date,horizon:r.horizon,labels:r.future})),blockedByPriceCount:rows.filter(r=>r.missedBullishEntry).length,rows};fs.writeFileSync(output,JSON.stringify(report));console.log(JSON.stringify({records:report.records,actions,issueCount:issues.length,blockedByPrice:report.blockedByPriceCount}));if(issues.length)process.exitCode=1;
