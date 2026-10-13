#!/usr/bin/env node
"use strict";
const fs=require('node:fs');const {buildTechnicalFeatures}=require('../technical-features.js');
const file=process.argv[2];if(!file)throw new Error('Usage: fibonacci-audit.js <snapshot.json>');const snapshot=JSON.parse(fs.readFileSync(file));let count=0;const failures=[];
for(const item of snapshot.items || []) {const q=item.analysis || item.quote || item,f=buildTechnicalFeatures({history:q.history,currentPrice:q.price,benchmarkContext:snapshot.marketContext,calculatedAt:q.history?.as_of || q.updatedAt});
 for(const h of ['daily','weekly']) {const x=f.fibonacci_structure[h];count++;if(x.source_timeframe!==(h==='daily'?'1d':'1w')||x.fallback_used)failures.push({ticker:item.ticker,horizon:h,code:'wrong_source'});if(x.known_at&&Date.parse(x.known_at)>Date.parse(f.calculated_at))failures.push({ticker:item.ticker,horizon:h,code:'future_anchor'});}
 if(f.fibonacci_structure.daily===f.fibonacci_structure.weekly)failures.push({ticker:item.ticker,code:'shared_object'});
}console.log(JSON.stringify({count,failures}));if(failures.length)process.exitCode=1;
