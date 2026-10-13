"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs"),os=require("node:os"),path=require("node:path"),{spawnSync}=require("node:child_process");
const {rawHistory,market}=require("./fixtures/decision-scenarios.js");
const temp=fs.mkdtempSync(path.join(os.tmpdir(),"decision-v2-api-"));
try {
 const history=rawHistory(),quote={ticker:"TEST",price:history.closes.at(-1),history,updatedAt:history.as_of,metadata:{quoteType:"EQUITY"}},context=market();context.market_context.benchmark_history={spy:history,qqq:history};
 const input={items:[{ticker:"TEST",analysis:quote},{ticker:"TQQQ",analysis:{...quote,ticker:"TQQQ",metadata:{quoteType:"ETF"}}},{ticker:"EMPTY",analysis:{ticker:"EMPTY",price:null,history:{},metadata:{}}}],marketContext:context};
 const file=path.join(temp,"input.json"),output=path.join(temp,"output.json");fs.writeFileSync(file,JSON.stringify(input));
 const r=spawnSync(process.execPath,[path.resolve(__dirname,"../decision-api/emit-decision.js"),file,output],{encoding:"utf8"});assert.equal(r.status,0,r.stderr);
 const data=JSON.parse(fs.readFileSync(output));assert.deepEqual(data.errors,{});
 for(const [ticker,decision] of Object.entries(data.decisions)) {
  assert.equal(decision.contractVersion,"decision.v2");assert.equal(decision.modelVersion,"V2");assert.equal(decision.action,undefined);assert.deepEqual(Object.keys(decision.horizons),["daily","weekly"]);
  for(const d of Object.values(decision.horizons)) {
   assert(d.confidence>=0&&d.confidence<=100);assert.equal(d.costsIncluded,false);
   for(const band of [d.opportunityRange,d.reduceRange,d.shortEntryRange])if(band)assert(band.low>0&&band.low<band.high);
   if(d.opportunityRange&&d.reduceRange)assert(d.opportunityRange.high<d.reduceRange.low);
   if(d.action==="short_sell")assert(d.shortEntryRange&&d.shortInvalidation>d.shortEntryRange.high&&d.rewardRisk>=2);
  }
 }
 assert.equal(data.decisions.TQQQ.horizons.weekly.backgroundOnly,true);assert.equal(data.decisions.TQQQ.horizons.weekly.opportunityRange,null);
 assert.equal(data.decisions.EMPTY.horizons.daily.action,"hold");assert.equal(data.decisions.EMPTY.horizons.daily.reduceRange,null);
 console.log("Decision API: V2 format, two frames, nullable plans, independent shorts and leveraged background passed.");
}finally{fs.rmSync(temp,{recursive:true,force:true});}
