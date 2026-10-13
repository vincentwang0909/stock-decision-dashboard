#!/usr/bin/env node
"use strict";
// A supplied snapshot is read-only evidence. Never fetch or save production history.
const fs=require("node:fs"),path=require("node:path");
for(const file of ["config","company-profile-classifier","technical-engine","exhaustion-engine","market-engine","etf-profile","company-profile","execution-engine","confidence-engine","stability-engine","horizon-model-v2","decision-engine"])require(`../decision-engine/${file}.js`);
const engine=globalThis.DecisionEngine,{buildTechnicalFeatures,_test:canonical}=require("../technical-features.js"),profiles=require("../profile-definitions.js");
const [input,output,...options]=process.argv.slice(2);if(!input||!output)throw new Error("Usage: decision-audit.js <snapshot.json> <output.json> [--baseline=<audit.json>] [--accumulate-study]");
const snapshot=JSON.parse(fs.readFileSync(input)),market=snapshot.marketContext || {},items=snapshot.items || [],features=new Map(),quotes=new Map(items.map(x=>[x.ticker,x.analysis || x.quote || x]));
for(const [ticker,q] of quotes)features.set(ticker,buildTechnicalFeatures({history:q.history,currentPrice:q.price,benchmarkContext:market,calculatedAt:q.history?.as_of || q.updatedAt,shareBase:q.metadata?.sharesOutstanding}));
const rows=[],issues=[],study=[];
// This companion is offline only. It does not install another production
// policy, alter global config or pretend current macro vintages were known earlier.
function previousTechnical(q,horizon,profile) {
 const h=q.history,daily=canonical.normalizeBars(h,{priceOnly:true}).filter(b=>b.completed===true && Date.parse(b.end_timestamp)<=Date.parse(h.as_of));
 const bars=horizon==="daily"?daily:canonical.completedWeeklyBars(daily,{asOf:h.as_of,calendar:h.session_calendar}),previous=bars.at(-2);
 if(!previous)return null;
 const at=previous.end_timestamp;
 const past=(source)=>{
  const index=(source.bar_end_timestamps || []).findLastIndex(t=>Date.parse(t)<=Date.parse(at)),value={...source,as_of:at};
  if(index<0)return null;
  delete value.intervals;delete value.weekly_freshness;
  for(const key of ["timestamps","opens","highs","lows","closes","volumes","completed","bar_end_timestamps"])value[key]=(source[key] || []).slice(0,index+1);
  value.freshness={state:"current",latest_date:value.timestamps.at(-1),expected_completed_date:value.timestamps.at(-1)};
  return value;
 };
 const history=past(h);if(!history)return null;
 const benchmarks=Object.fromEntries(Object.entries(market.market_context?.benchmark_history || {}).map(([key,value])=>[key,past(value)]).filter(([,value])=>value));
 const f=buildTechnicalFeatures({history,currentPrice:previous.close,benchmarkContext:{market_context:{benchmark_history:benchmarks}},calculatedAt:at});
 const technical=engine.technical.evaluate(f,horizon,previous.close,profile);
 return technical.dataQuality.score>=engine.config.actionPolicy.minimumDataQuality?technical:null;
}
for(const [ticker,q] of quotes) {
 const classification=profiles.profileFor(ticker,q.metadata || {}),underlying=classification.underlyingTicker;
 const decision=engine.decide({ticker,price:q.price,technicalFeatures:features.get(ticker),marketContext:market,classification,metadata:{...(q.metadata || {}),asOf:q.updatedAt,quoteStale:Boolean(q.stale)},underlyingTechnicalFeatures:features.get(underlying),underlyingPrice:quotes.get(underlying)?.price});
 for(const [h,d] of Object.entries(decision.horizons)) {
  const p=d.priceLandscape,entry=["strong_buy","buy","accumulate"].includes(d.action);
  const fail=(code)=>issues.push({ticker,horizon:h,code});
  if(entry && !(p.opportunityRange&&q.price>=p.opportunityRange.low&&q.price<=p.opportunityRange.high&&p.rewardRisk>=engine.config.execution.rewardRisk[d.action]))fail("invalid_long_entry");
  if(p.opportunityRange&&p.reduceRange&&p.opportunityRange.high>=p.reduceRange.low)fail("overlapping_ranges");
  if(d.action==="short_sell"&&!(h==="daily"&&!classification.isETF&&p.shortEntryRange&&q.price>=p.shortEntryRange.low&&q.price<=p.shortEntryRange.high&&p.shortInvalidation>q.price&&p.shortRewardRisk>=2))fail("invalid_short_entry");
  if(d.debug.dataQuality.score===0&&(d.action!=="hold"||p.opportunityRange||p.reduceRange))fail("untrusted_action_or_plan");
  if(classification.leveraged&&h==="weekly"&&(!d.backgroundOnly||d.executionIntent!=="background"))fail("leveraged_weekly_execution");
  if(d.debug.confidenceComponents.action!==d.action)fail("pre_action_confidence");
  rows.push({ticker,horizon:h,action:d.action,signalAsOf:d.signalAsOf,quoteAsOf:d.quoteAsOf,direction:d.states.direction.score,confirmation:d.states.confirmation.score,risk:d.states.risk.score,confidence:d.confidence,priceState:d.debug.priceState,landscape:p,neutralGapAtr:p.opportunityRange&&p.reduceRange?(p.reduceRange.low-p.opportunityRange.high)/features.get(ticker).horizons[h].volatility.atr[`atr_14_${h==="daily"?"1d":"1w"}`].value:null,missing:d.debug.dataQuality.missingCore,entryMissing:d.debug.dataQuality.entryMissing,reason:d.debug.finalDecision.reasonCode});
  if(options.includes("--accumulate-study") && !classification.leveraged && !d.profile.highRiskRepair) {
   const current=engine.technical.evaluate(features.get(ticker),h,q.price,d.profile),previous=previousTechnical(q,h,d.profile);
   const volumeImproves=t=>t.confirmationComponents.participation.score>0 && (t.raw.obv.divergence==="bullish_divergence" || t.raw.volume.trend?.price_volume_confirmation==="bullish_confirmation");
   const rsImproves=t=>t.confirmationComponents.relativeStrength.score>0 && t.raw.relativeStrength.consistency?.state==="improving";
   const groups={momentum:current.entryEvidence.improvingBars>=engine.config.indicators.smc.momentumRepairBars,participation:Boolean(previous && volumeImproves(current) && volumeImproves(previous)),relativeStrength:Boolean(previous && rsImproves(current) && rsImproves(previous))};
   const improving=Object.values(groups).some(Boolean),technical={...current,entryEvidence:{...current.entryEvidence,improvingBars:improving?engine.config.indicators.smc.momentumRepairBars:0,independentImprovement:improving}};
   const candidate=engine.execution.decisionForPriceState({technical,landscape:{priceState:d.debug.priceState,priceLandscape:p},risk:d.states.risk.score,exhaustionScore:d.states.exhaustion.score,marketModifiers:d.market.horizonModifiers,profile:d.profile});
   study.push({ticker,horizon:h,productionAction:d.action,candidateAction:candidate.action,changed:candidate.action!==d.action,groups,previousEvidenceAvailable:Boolean(previous),scope:"offline candidate only; current position/market/R/data/price-repair gates unchanged"});
  }
 }
}
const baselineFile=options.find(value=>value.startsWith("--baseline="))?.slice("--baseline=".length);
const baseline=baselineFile?JSON.parse(fs.readFileSync(baselineFile)):null;
const comparison=baseline?rows.map(row=>{const old=baseline.rows.find(value=>value.ticker===row.ticker && value.horizon===row.horizon);return old?{ticker:row.ticker,horizon:row.horizon,previousAction:old.action,action:row.action,actionChanged:old.action!==row.action,landscapeChanged:JSON.stringify(old.landscape)!==JSON.stringify(row.landscape),previousLandscape:old.landscape,landscape:row.landscape}:null;}).filter(Boolean):[];
const report={model:"V2",tickers:quotes.size,decisions:rows.length,scope:"frozen supplied sources; no outcome claims",actionCounts:rows.reduce((a,r)=>(a[r.action]=(a[r.action]||0)+1,a),{}),issueCount:issues.length,issues,comparison,accumulateStudy:study,rows};fs.writeFileSync(output,JSON.stringify(report));console.log(JSON.stringify({model:report.model,tickers:report.tickers,decisions:report.decisions,actionCounts:report.actionCounts,actionChanges:comparison.filter(row=>row.actionChanged).length,landscapeChanges:comparison.filter(row=>row.landscapeChanged).length,accumulateStudyChanges:study.filter(row=>row.changed),issues}));if(issues.length)process.exitCode=1;
