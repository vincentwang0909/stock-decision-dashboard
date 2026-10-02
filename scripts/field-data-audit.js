#!/usr/bin/env node
"use strict";
// Read-only field inventory. Raw series never enter the output or the model.
const fs=require('node:fs'),path=require('node:path');
require('../decision-engine/config.js');require('../decision-engine/company-profile-classifier.js');
const {featureInputs}=require('../decision-engine/feature-inputs.js');
const canonical=require('../technical-features.js'),profiles=require('../profile-definitions.js');
const [quoteDirectory,marketFile,outputDirectory]=process.argv.slice(2);
const marketPath=fs.statSync(marketFile).isDirectory()?path.join(marketFile,fs.readdirSync(marketFile).find(x=>x.endsWith('.json'))):marketFile;
const receipt=JSON.parse(fs.readFileSync(marketPath,'utf8')),market=receipt.payload||receipt.value||receipt;
const rows=[],summary=[],skip=new Set(['series','macd_series','signal_series','histogram_series','availability','available','indicator','period','params','lookback','interval','calculation_timestamp','last_bar_timestamp','required_bars','available_bars','bar_count','required_observations','available_observations','unavailable_reason','reason','required_observation_detail','calculated_at']);
function emit(ticker,horizon,features,field,value,owner={}){
 const interval=owner.interval||owner.source_timeframe||'shared';const source=features.source_intervals?.[interval]||{};
 const reason=owner.unavailable_reason||owner.reason||(value==null?'not_recorded':null);
 const status=value==null?(reason||'unavailable'):value===false?'normal_false':value===true?'triggered_true':value===0?'normal_zero':Number.isFinite(value)?'numeric':'categorical';
 rows.push({ticker,horizon,interval,field,value:value==null?'':String(value),status,required_bars:owner.required_bars??'',available_bars:owner.available_bars??source.bar_count??'',required_observations:owner.required_observations??'',available_observations:owner.available_observations??'',source:source.source||owner.source||'canonical_shared_context',as_of:source.as_of||features.calculated_at||'',last_bar:source.last_bar_timestamp||'',method:owner.method||source.bar_method||owner.indicator||'',adjustment_basis:source.adjustment_basis||'',currency:source.currency||'',quality_reason:reason||''});
}
function walk(ticker,horizon,features,value,field='',owner={}){
 if(value==null||typeof value!=='object'){emit(ticker,horizon,features,field,value,owner);return;}
 if(Array.isArray(value))return;
 const context=value.indicator||value.interval||value.required_bars!=null||value.required_observations!=null?{...owner,...value}:owner;
 for(const [key,item] of Object.entries(value))if(!skip.has(key)&&!key.endsWith('_series')&&!Array.isArray(item))walk(ticker,horizon,features,item,field?`${field}.${key}`:key,context);
 if(value.indicator==='kdj')for(const flag of ['overbought','oversold'])if(!Object.hasOwn(value,flag))emit(ticker,horizon,features,`${field}.${flag}`,null,context);
}
for(const file of fs.readdirSync(quoteDirectory).filter(x=>x.endsWith('.json')).sort()){
 const cache=JSON.parse(fs.readFileSync(path.join(quoteDirectory,file),'utf8')),quote=cache.quote||cache;
 const ticker=quote.ticker||file.slice(0,-5),features=canonical.buildTechnicalFeatures(featureInputs(quote,market)),profile=profiles.profileFor(ticker,quote.metadata||{});
 const item={ticker,as_of:quote.updatedAt,feature_version:features.schema_version,asset_type:profile.isETF?'ETF':'stock',source_intervals:features.source_intervals,profile,atr:{},kdj:{}};
 for(const [horizon,key,interval] of [['short','short','4h'],['mid','medium','1d'],['long','long','1w']]){
  const set=features.horizons[key];walk(ticker,horizon,features,set);walk(ticker,horizon,features,features.volume,'daily_volume');walk(ticker,horizon,features,features.price_position,'history_position');
  const atr=set.volatility.atr[`atr_14_${interval}`];item.atr[horizon]={bars:atr.available_bars,observations:Math.max(0,(atr.available_bars||0)-13),value:atr.value,percentiles:{}};
  for(const window of [60,120,250]){
   const value=atr[`atr_percentile_${window}`],meta=atr.atr_percentiles?.[`d${window}`]||{interval,required_bars:13+window,available_bars:atr.available_bars,required_observations:window,available_observations:Math.max(0,(atr.available_bars||0)-13),unavailable_reason:atr.unavailable_reason};
   item.atr[horizon].percentiles[window]={value:value??null,reason:meta.unavailable_reason||null,available:meta.available_observations,required:window};
   emit(ticker,horizon,features,`atr_percentile_${window}`,value,meta);
  }
  item.kdj[horizon]=Object.fromEntries(Object.entries(set.momentum.kdj).map(([name,x])=>[name,{bars:x.available_bars,required:x.required_bars,k:x.k,d:x.d,j:x.j,overbought:x.overbought??null,oversold:x.oversold??null}]));
  if(horizon==='long')emit(ticker,horizon,features,'kdj',null,{unavailable_reason:'not_applicable',source:'horizon_configuration'});
  for(const slot of ['primaryClassification','businessTrait','riskTrait','lifecycle'])emit(ticker,horizon,features,`profile.${slot}`,profile.isETF?null:profile[slot],{source:profile.profileSource||'current_metadata_classifier',unavailable_reason:profile.isETF?'not_applicable':profile[slot]==null?'insufficient_metadata':null});
  walk(ticker,horizon,features,market.market_context||market,'market_context');
 }
 summary.push(item);
}
const fields=Object.keys(rows[0]),escape=x=>`"${String(x??'').replaceAll('"','""')}"`;
fs.mkdirSync(outputDirectory,{recursive:true});fs.writeFileSync(path.join(outputDirectory,'field-inventory.csv'),[fields.join(','),...rows.map(row=>fields.map(key=>escape(row[key])).join(','))].join('\n'));
fs.writeFileSync(path.join(outputDirectory,'field-summary.json'),JSON.stringify({tickers:summary.length,fields:rows.length,scope:'current returned source bars; legitimate missing stays missing; no historical raw reconstruction',by_status:rows.reduce((a,r)=>(a[r.status]=(a[r.status]||0)+1,a),{}),tickers_detail:summary},null,2));
console.log(JSON.stringify({tickers:summary.length,fields:rows.length,outputDirectory}));
