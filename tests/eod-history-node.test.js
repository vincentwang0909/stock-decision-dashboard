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
 assert.deepEqual(run(manifest),data,"bounded handoff and inline snapshots are identical");
 console.log("EOD: two compact rows per ticker, missing/stale explicit, profile context and bounded serializer parity passed.");
}finally{fs.rmSync(temp,{recursive:true,force:true});}
