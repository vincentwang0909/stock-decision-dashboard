"use strict";
const assert=require("node:assert/strict");
const {loadEngine,featureSet,market,clone}=require("./fixtures/decision-scenarios.js");
const e=loadEngine();
// YoY is exact-month display context, not a second directional/risk vote.
const macroBase=market(),macroAnnual=clone(macroBase);
macroAnnual.market_context.macro_actuals.cpi.headline.yoy_pct=8;
macroAnnual.market_context.macro_actuals.cpi.core.yoy_pct=5;
assert.deepEqual(e.market.forHorizon(e.market.evaluate(macroBase),"daily",{},{}),e.market.forHorizon(e.market.evaluate(macroAnnual),"daily",{},{}));
const decide=(features=featureSet(),price=99,classification={},context=market(),metadata={})=>e.decide({ticker:"TEST",price,classification,technicalFeatures:features,marketContext:context,metadata});
let result=decide();
assert.deepEqual(Object.keys(result.horizons),["daily","weekly"]);
assert.equal(result.version,"V2");assert.equal(result.action,undefined);
assert.equal(result.horizons.daily.action,"buy");
assert.equal(decide(featureSet(),98.5).horizons.daily.action,"strong_buy");
assert.equal(decide(featureSet(),98.5,{},market(),{daysToEarnings:1}).horizons.daily.action,"buy","known earnings proximity prevents Strong Buy without banning every ordinary entry");
assert.equal(result.horizons.weekly.action,"buy");
for (const value of Object.values(result.horizons)) {
  assert.equal(value.debug.confidenceComponents.action,value.action);
  assert(value.confidence>=0 && value.confidence<=100);
  assert(value.priceLandscape.opportunityRange.high<value.priceLandscape.reduceRange.low);
}
result=decide(featureSet({daily:"bear",weekly:"bull"}));
assert.equal(result.horizons.daily.action,"sell");assert.equal(result.horizons.weekly.action,"buy");
assert.equal(result.horizons.daily.priceLandscape.opportunityRange,null);
assert(Math.abs(result.horizons.daily.priceLandscape.reduceRange.low-99)<1,"Sell exits the current area");
assert.equal(decide(featureSet(),100).horizons.daily.action,"hold","bullish evidence alone cannot bypass price");
assert.equal(decide(featureSet(),110).horizons.daily.action,"hold","Reduce candidate with strong participation may Hold");
const tiring=featureSet({options:{daily:{weakeningBars:3,participationTrend:"falling",rsConsistency:"deteriorating",rsi:80}}});
assert.equal(decide(tiring,120).horizons.daily.action,"trim","pre-reversal reduction needs independent weakening");
const justRsi=featureSet({daily:"neutral",weekly:"neutral",options:{daily:{rsi:89}}});
assert.equal(decide(justRsi).horizons.daily.action,"hold");
const panic=decide(featureSet({daily:"neutral"}),99,{},market({fearGreed:5}));
const ordinary=decide(featureSet({daily:"neutral"}));
assert.equal(panic.horizons.daily.states.direction.score,ordinary.horizons.daily.states.direction.score);
assert.equal(panic.horizons.daily.action,"hold");
const shocked=decide(featureSet(),99,{},market({regime:"shock"}));
assert.equal(shocked.horizons.daily.action,"hold");
const bad=featureSet();bad.horizons.daily.trend.moving_averages.ema_50_1d.availability="unavailable";
result=decide(bad);
assert.equal(result.horizons.daily.action,"hold");assert.equal(result.horizons.daily.debug.actionFamily,"unavailable");
assert.equal(result.horizons.weekly.action,"buy");
assert(result.horizons.daily.confidence<=e.config.confidence.unavailableMaximum);
result=decide(featureSet(),80,{},market(),{quoteStale:true});
for(const d of Object.values(result.horizons)) {assert.equal(d.action,"hold");assert.equal(d.priceLandscape.reduceRange,null);}
result=decide(featureSet(),99,{isETF:true,leveraged:true,direction:"long"});
assert.equal(result.horizons.weekly.backgroundOnly,true);assert.equal(result.horizons.weekly.executionIntent,"background");
const original=decide();e.stability.clear();assert.deepEqual(decide().horizons,original.horizons,"restart does not change a decision");
const base=featureSet();const shadow=clone(base);shadow.horizons.daily.fvg={availability:"available",shadow_only:true,gaps:[{low:1,high:500,side:"bearish"}]};
assert.deepEqual(decide(shadow).horizons,decide(base).horizons,"FVG has zero live contribution");
const tags={primaryClassification:"Semiconductors",businessTrait:"HighGrowth",riskTrait:"HighVolatility",lifecycle:"Scaling"};
assert.equal(decide(base,99,tags).horizons.daily.states.direction.score,decide(base).horizons.daily.states.direction.score,"stock Direction is fixed across identities");
assert.throws(()=>e.decideHorizon({horizon:"short"}),/Unknown V2 horizon/);
assert(!e.config.actions.includes("avoid")&&!e.config.actions.includes("cover"));
// Publication windows use the next actual session and only become safe with a
// completed post-release Daily plus the right actual period/vintage.
const event={id:"cpi-2026-10-14",type:"cpi",at:"2026-10-14T12:30:00Z"};
const before=market({asOf:"2026-10-13T20:30:00Z",events:[event]});
const phase={latestDailyEnd:"2026-10-13T20:00:00Z",nextExecutionClose:"2026-10-14T20:00:00Z"};
let mod=e.market.forHorizon(e.market.evaluate(before),"daily",{},phase);
assert.equal(mod.majorEventWindow,true);assert.equal(mod.entryPaused,true);assert.equal(mod.confirmationAdd,5);
const after=market({asOf:"2026-10-14T20:30:00Z",events:[event]});
phase.latestDailyEnd="2026-10-14T20:00:00Z";phase.nextExecutionClose="2026-10-15T20:00:00Z";
mod=e.market.forHorizon(e.market.evaluate(after),"daily",{},phase);
assert.equal(mod.entryPaused,false,"first completed close plus verified current actual releases the pause");
after.market_context.macro_actuals.cpi.headline.period="2026-08";
mod=e.market.forHorizon(e.market.evaluate(after),"daily",{},phase);assert.equal(mod.releaseDataPending,true);
after.market_context.as_of="2026-10-18T20:30:00Z";
mod=e.market.forHorizon(e.market.evaluate(after),"daily",{},phase);assert.equal(mod.entryPaused,true,"time passing cannot heal missing actuals");
after.market_context.macro_actuals.as_of="2026-10-20T20:00:00Z";
assert.equal(e.market.forHorizon(e.market.evaluate(after),"daily",{},phase).macroRisk,0,"future vintages never enter macro risk");
const meeting=market({asOf:"2026-10-14T20:30:00Z",events:[{id:"fomc-fixture",type:"fomc",at:"2026-10-14T18:00:00Z"}]});
meeting.market_context.event_calendar.fomc_decision={meeting_id:"fomc-fixture",status:"available",as_of:null,released_at:"2026-10-14T18:00:00Z",target_range:{low:3.75,high:4},source:"https://www.federalreserve.gov/newsevents/pressreleases/monetary20261014a.htm"};
assert.equal(e.market.forHorizon(e.market.evaluate(meeting),"daily",{},phase).releaseDataPending,true,"undated FOMC actual cannot release the entry pause");
meeting.market_context.event_calendar.fomc_decision.as_of="2026-10-14T19:00:00Z";
assert.equal(e.market.forHorizon(e.market.evaluate(meeting),"daily",{},phase).releaseDataPending,false);
assert.equal(decide(featureSet(),99,{},{}).horizons.daily.action,"hold","absent market risk blocks new entries");
const staleMarket=market();staleMarket.stale=true;
assert.equal(decide(featureSet(),99,{},staleMarket).horizons.daily.action,"hold","source-level stale Market cannot be concealed by a valid Quote");
const undatedMarket=market();delete undatedMarket.market_context.as_of;
assert.equal(decide(featureSet(),99,{},undatedMarket,{asOf:"2026-10-09T20:30:00Z"}).horizons.daily.action,"hold","Quote time cannot stand in for Market provenance");
assert.equal(decide(featureSet({daily:"bear"}),99,{},{}).horizons.daily.action,"sell","real exit does not require fresh entry-market evidence");
console.log("Decision engine: independent horizons, final confidence, price, contrarian, trust, tags and ETF boundaries passed.");

// Only completed official actuals enter the historical comparison.
const fomcHistory=market({asOf:"2026-10-14T20:30:00Z",events:[{id:"fomc-prior",type:"fomc",at:"2026-09-16T18:00:00Z"},{id:"fomc-current",type:"fomc",at:"2026-10-14T18:00:00Z"}]});
const previousActual={status:"available",meeting_id:"fomc-prior",released_at:"2026-09-16T18:00:00Z",as_of:"2026-09-16T18:01:00Z",target_range:{low:3.5,high:3.75},source:"https://www.federalreserve.gov/newsevents/pressreleases/monetary20260916a.htm"};
fomcHistory.market_context.event_calendar.fomc_decision={status:"available",meeting_id:"fomc-current",released_at:"2026-10-14T18:00:00Z",as_of:"2026-10-14T18:01:00Z",target_range:{low:3.75,high:4},source:"https://www.federalreserve.gov/newsevents/pressreleases/monetary20261014a.htm",previous_decision:previousActual};
let observed=e.market.evaluate(fomcHistory);assert.equal(observed.fomcActualComparison.status,"available");assert.equal(observed.fomcActualComparison.upperChangePp,.25);assert.equal(observed.fomcActualComparison.direction,"raised");
assert.equal(e.market.forHorizon(observed,"daily",{},phase).macroRisk,4);
assert(e.market.forHorizon(observed,"daily",{},phase).reasons.some(r=>r.code==="fomc_actual_tightening"));
const hugeHike=clone(fomcHistory);hugeHike.market_context.event_calendar.fomc_decision.target_range={low:5,high:5.25};assert.equal(e.market.forHorizon(e.market.evaluate(hugeHike),"daily",{},phase).macroRisk,e.config.market.macro.riskAddMaximum);
const rateCut=clone(fomcHistory);rateCut.market_context.event_calendar.fomc_decision.target_range={low:3.25,high:3.5};assert.equal(e.market.forHorizon(e.market.evaluate(rateCut),"daily",{},phase).macroRisk,0);assert.equal(e.market.evaluate(rateCut).fomcActualComparison.direction,"lowered");
assert.equal(decide(featureSet({daily:"neutral"}),99,{},rateCut).horizons.daily.action,"hold","actual easing alone cannot create an entry");
for(const change of [v=>v.previous_decision=null,v=>v.previous_decision.as_of="2026-10-15T00:00:00Z",v=>v.target_range.low=null,v=>v.target_range.low=true,v=>v.previous_decision.meeting_id="wrong",v=>v.as_of="2026-10-15T00:00:00Z",v=>v.source="https://unverified.example/monetary"]){const broken=clone(fomcHistory);change(broken.market_context.event_calendar.fomc_decision);const result=e.market.evaluate(broken);assert.equal(result.fomcActualComparison.status,"unavailable");assert.equal(e.market.forHorizon(result,"daily",{},phase).fomcRisk,null);}
const ignoredProbability=clone(fomcHistory);ignoredProbability.market_context.fomc_expectations={status:"available",probabilities:{cut:100}};assert.deepEqual(e.market.evaluate(ignoredProbability),observed,"obsolete probability data is ignored and not exposed");

const overlappingHike=clone(fomcHistory);overlappingHike.market_context.ten_year_yield.value=6;const overlappingUnchanged=clone(overlappingHike);overlappingUnchanged.market_context.event_calendar.fomc_decision.previous_decision.target_range={low:3.75,high:4};assert.equal(e.market.forHorizon(e.market.evaluate(overlappingHike),"daily",{},phase).riskAdd,e.market.forHorizon(e.market.evaluate(overlappingUnchanged),"daily",{},phase).riskAdd,"overlapping rate risks are combined by max, not added twice");
