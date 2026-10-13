"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),vm=require("node:vm");
const {loadEngine,featureSet,market}=require("./fixtures/decision-scenarios.js");const e=loadEngine(),config=e.config;
assert.deepEqual(Object.keys(config.horizons),["daily","weekly"]);assert.equal(config.version,"V2");
assert.equal(config.shortV2,undefined);assert.equal(config.territories,undefined);assert.equal(config.compositeEdge,undefined);
assert.equal(config.indicators.integration.structureLevelsEnabled,false,"failed retention gate remains disabled");
const html=fs.readFileSync(path.join(__dirname,"..","index.html"),"utf8");
assert(!html.includes("short-model-v2.js")&&!html.includes("planning-width.js"));
assert(html.indexOf("decision-engine/config.js")<html.indexOf("technical-features.js"));
const context=vm.createContext({console,Date,Intl});
for(const m of html.matchAll(/<script src="\.\/([^"?]+)(?:\?[^\"]*)?"/g)) if(m[1]!=="main.js") vm.runInContext(fs.readFileSync(path.join(__dirname,"..",m[1]),"utf8"),context,{filename:m[1]});
for(const classification of [{},{isETF:true,direction:"long"},{isETF:true,direction:"inverse",leveraged:true}]) {
 const input={ticker:"PARITY",price:99,technicalFeatures:featureSet(),marketContext:market(),classification};
 const left=e.decide(input),right=context.DecisionEngine.decide(input);delete left.generatedAt;delete right.generatedAt;
 assert.deepEqual(JSON.parse(JSON.stringify(left)),JSON.parse(JSON.stringify(right)),"browser and Node share the same engine");
 for(const [h,d] of Object.entries(left.horizons)) {assert.equal(d.debug.pathVersion,"V2");assert.equal(d.debug.policyFamily,`${classification.isETF?"etf":"stock"}_${h}`);assert.equal(d.debug.confidenceComponents.action,d.action);}
}
console.log("Unified V2: one release, two independent frames and browser/Node parity passed.");
