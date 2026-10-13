#!/usr/bin/env node
"use strict";
// A supplied snapshot is read-only evidence. Never fetch or save production history.
const fs=require("node:fs"),path=require("node:path");
for(const file of ["config","company-profile-classifier","technical-engine","exhaustion-engine","market-engine","etf-profile","company-profile","execution-engine","confidence-engine","stability-engine","horizon-model-v2","decision-engine"])require(`../decision-engine/${file}.js`);
const engine=globalThis.DecisionEngine,{buildTechnicalFeatures}=require("../technical-features.js"),profiles=require("../profile-definitions.js");
const [input,output]=process.argv.slice(2);if(!input||!output)throw new Error("Usage: decision-audit.js <snapshot.json> <output.json>");
const snapshot=JSON.parse(fs.readFileSync(input)),market=snapshot.marketContext || {},items=snapshot.items || [],features=new Map(),quotes=new Map(items.map(x=>[x.ticker,x.analysis || x.quote || x]));
for(const [ticker,q] of quotes)features.set(ticker,buildTechnicalFeatures({history:q.history,currentPrice:q.price,benchmarkContext:market,calculatedAt:q.history?.as_of || q.updatedAt,shareBase:q.metadata?.sharesOutstanding}));
const rows=[],issues=[];
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
 }
}
const report={model:"V2",tickers:quotes.size,decisions:rows.length,scope:"frozen supplied sources; no outcome claims",actionCounts:rows.reduce((a,r)=>(a[r.action]=(a[r.action]||0)+1,a),{}),issueCount:issues.length,issues,rows};fs.writeFileSync(output,JSON.stringify(report));console.log(JSON.stringify({model:report.model,tickers:report.tickers,decisions:report.decisions,actionCounts:report.actionCounts,issues}));if(issues.length)process.exitCode=1;
