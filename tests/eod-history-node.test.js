"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs"),os=require("node:os"),path=require("node:path"),{spawnSync}=require("node:child_process");
const {rawHistory,market}=require("./fixtures/decision-scenarios.js");const history=rawHistory(),date=history.timestamps.at(-1),temp=fs.mkdtempSync(path.join(os.tmpdir(),"eod-v2-"));
const rawKeys=new Set(["timestamps","opens","highs","lows","closes","volumes","bars","series","completed","bar_end_timestamps"]);
const hasRaw=v=>v&&typeof v==="object"&&(Array.isArray(v)?v.some(hasRaw):Object.entries(v).some(([k,c])=>rawKeys.has(k)||/_series$/.test(k)||hasRaw(c)));
try {
 const context=market();context.market_context.benchmark_history={spy:history,qqq:history};
 const stock={price:history.closes.at(-1),history,updatedAt:history.as_of,metadata:{quoteType:"EQUITY",classification:{primaryClassification:"Semiconductors",businessTrait:"HighGrowth",riskTrait:"HighVolatility",lifecycle:"EstablishedLeader",sizeClass:"MegaCap",profileStatus:"complete",profileSchemaVersion:"2.1"}}};
 const input={marketDate:date,recordedAtEt:history.as_of,payload:{items:[{ticker:"TEST",analysis:stock},{ticker:"TQQQ",analysis:{...stock,metadata:{quoteType:"ETF"}}},{ticker:"EMPTY",analysis:{price:null,history:{},metadata:{}}},{ticker:"STALE",analysis:{...stock,stale:true}}],marketContext:context}};
 const src=path.join(temp,"input.json"),dest=path.join(temp,"output.json"),runner=path.resolve(__dirname,"../历史记录/生成决策快照.js");
 const run=value=>{fs.writeFileSync(src,JSON.stringify(value));const r=spawnSync(process.execPath,["--max-old-space-size=128","--max-semi-space-size=4",runner,src,dest],{encoding:"utf8"});assert.equal(r.status,0,r.stderr);return JSON.parse(fs.readFileSync(dest));};
 const data=run(input);assert.equal(data.records.length,8);
 for(const row of data.records){assert(["daily","weekly"].includes(row.horizon));assert.equal(row.technical_features.model_diagnostics.model_version,"V2");assert.equal(hasRaw(row.technical_features),false);if(["EMPTY","STALE"].includes(row.ticker)){assert.equal(row.data_status,"unavailable");assert.equal(row.action,null);}}
 const s=data.records.find(x=>x.ticker==="TEST"&&x.horizon==="daily");assert.equal(s.size_class,"MegaCap");assert.equal(s.business_trait,"HighGrowth");assert.equal(s.technical_features.model_diagnostics.confidence.profileConfidenceWeight,0);
 const w=data.records.find(x=>x.ticker==="TEST"&&x.horizon==="weekly");
 assert.equal(s.technical_features.price_position.interval,"1d");assert.equal(w.technical_features.price_position.interval,"1w","Weekly history preserves its own completed-week historical structure");
 assert.equal(data.records.find(x=>x.ticker==="TQQQ"&&x.horizon==="weekly").technical_features.model_diagnostics.background_only,true);
 const manifest={...input,format:"ticker-files-v1",marketContext:context,items:input.payload.items.map((x,i)=>{const p=path.join(temp,`q${i}.json`);fs.writeFileSync(p,JSON.stringify(x.analysis));return{ticker:x.ticker,path:p};})};delete manifest.payload;
 const manifestResult=run(manifest);
 const {resource_metrics: metricA,...inlineState}=data,{resource_metrics:metricB,...fileState}=manifestResult;
 assert.deepEqual(fileState,inlineState,"bounded handoff and inline decisions/context are identical");
 assert(metricA.node_peak_rss_bytes>0 && metricB.node_peak_rss_bytes>0);
 assert.match(data.run_context.source_sha256,/^[a-f0-9]{64}$/);
 assert.match(data.run_context.config_sha256,/^[a-f0-9]{64}$/);
 assert.equal(data.run_context.config.version,"V2");
 assert.equal(hasRaw(data.run_context),false);
 for (const row of data.records) {
   const why=row.technical_features.decision_explanation;
   assert.equal(why.action,row.action);
   assert(why.primary_reason.code && why.primary_reason.en && why.primary_reason.zh);
   if(row.data_status!=="unavailable") {
     assert.equal(why.states.direction.score,row.direction);
     assert.equal(why.signal_as_of,row.technical_features.model_diagnostics.signal_as_of);
     assert.equal(why.decision_trace.reasonCode,why.primary_reason.code);
     assert.equal(row.technical_features.fvg.shadow_only,true);
     assert.equal(row.technical_features.fvg.used_for_decision,false);
     assert.equal(why.execution_plan.currentPrice,row.current_price);
   }
 }
 const mondayHistory=structuredClone(history),lastDate=new Date(date+'T00:00:00Z');
 while(lastDate.getUTCDay()!==1)lastDate.setUTCDate(lastDate.getUTCDate()+1);
 if(lastDate.toISOString().slice(0,10)===date)lastDate.setUTCDate(lastDate.getUTCDate()+7);
 const monday=lastDate.toISOString().slice(0,10),at=monday+'T23:00:00Z';
 mondayHistory.as_of=at;mondayHistory.freshness={state:'stale',latest_date:date,expected_completed_date:monday};mondayHistory.weekly_freshness={state:'current'};
 const late=run({marketDate:monday,recordedAtEt:at,payload:{items:[{ticker:'LATE_DAILY',analysis:{...stock,history:mondayHistory,updatedAt:at,last_quote_time:at}}],marketContext:context}});
 assert.equal(late.records.find(r=>r.horizon==='daily').data_status,'unavailable');
 assert.notEqual(late.records.find(r=>r.horizon==='weekly').data_status,'unavailable','missing Daily outside completed week cannot erase trusted Weekly snapshot');
 assert(late.records.find(r=>r.horizon==='weekly').technical_features.model_diagnostics.signal_as_of);
 console.log("EOD: two compact rows per ticker, missing/stale explicit, profile context and bounded serializer parity passed.");
}finally{fs.rmSync(temp,{recursive:true,force:true});}
