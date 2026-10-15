"use strict";
const clone = (value) => JSON.parse(JSON.stringify(value));
function loadEngine() {
  for (const file of ["config", "company-profile-classifier", "technical-engine", "exhaustion-engine", "market-engine", "etf-profile", "company-profile", "execution-engine", "confidence-engine", "stability-engine", "horizon-model-v2", "decision-engine"]) require(`../../decision-engine/${file}.js`);
  return globalThis.DecisionEngine;
}
function ma(value, period, interval, slope = "rising") {
  return { availability: "available", indicator: "ema", value, period, interval, price_state: value < 100 ? "above" : "below", slope: { state: slope } };
}
function macd(mode = "bull") {
  const bull=mode==="bull",neutral=mode==="neutral",repair=mode==="recover",sign=bull?1:-1;
  return {availability:"available",macd_line:neutral?0:sign*.8,signal_line:neutral?0:sign*.5,histogram:neutral?0:sign*.3,
    histogram_change_1:neutral?0:repair?.03:sign*.05,histogram_change_3:neutral?0:repair?.08:sign*.12,histogram_change_5:neutral?0:repair?.10:sign*.20,
    above_or_below_zero:neutral?"at_zero":bull?"above_zero":"below_zero",crossover_state:neutral?"none":bull||repair?"bullish_cross":"bearish_cross",
    state:neutral?"neutral":bull?"accelerating_bullish":repair?"recovering_bearish":"accelerating_bearish",improving_or_deteriorating:bull||repair?"improving":neutral?"stable":"deteriorating",improving_bars:bull||repair?3:0,weakening_bars:bull||neutral?0:3};
}
function volume(mode="bull",options={},interval="1d") {
  const bull=mode==="bull" || mode==="recover",neutral=mode==="neutral",rvol=options.rvol ?? 1.4;
  return {availability:"available",interval,source:interval==="1w"?"completed_weekly_from_daily":"completed_daily_ohlcv",completed:true,current_volume:1_400_000,average_volume:1_000_000,last_bar_timestamp:"2026-10-09",current_session:null,
    relative_volume:{displayed_rvol:rvol,rvol_20d:rvol,rvol_5d:rvol,rvol_60d:rvol,baseline_window:20},
    trend:{volume_trend:"expanding",price_volume_confirmation:neutral?"mixed":bull?"bullish_confirmation":"bearish_confirmation"},
    average_volume_windows:{d5:1000000,d20:1000000,d60:1000000,d120:1000000,d250:1000000},average_turnover_windows:{d5:1,d20:1,d60:1,d120:1,d250:1},obv:{by_lookback:{}}};
}
function horizon(mode="bull",options={}) {
  const interval=options.primaryInterval || "1d",weekly=interval==="1w",period=weekly?21:14,bull=mode==="bull",neutral=mode==="neutral",repair=mode==="recover",slope=neutral?"flat":bull?"rising":"falling";
  const vals=options.ma || (neutral?[100,100,100,100]:bull?[99,98,94,90]:repair?[100.4,101,105,108]:[101,102,106,110]);
  const known="2026-09-25T20:00:00Z",at=weekly?"2026-10-09T20:00:00Z":"2026-10-09T20:00:00Z";
  const v=volume(mode,options,interval),m=options.macd || macd(mode);
  const ref={id:`${interval}:known`,interval,role:"support",role_confirmed:true,price:94,pivot_at:"2026-09-18",known_at:known,atr_at_known:options.atr || 1,active:bull};
  const bos={kind:bull?"bos_up":"bos_down",sign:bull?1:-1,reference_price:bull?99:100,reference_known_at:known,reference_interval:interval,confirmation_interval:interval,timestamp:"2026-10-08T20:00:00Z",bar_timestamp:"2026-10-08",age_bars:1,confirmed:true,atr_at_event:options.atr || 1,level_id:`${interval}:break`};
  const smc={availability:"available",direction:neutral||repair?"unconfirmed":bull?"bullish":"bearish",bullish_confirmed:bull,bearish_confirmed:!bull&&!neutral&&!repair,last_bos:neutral||repair?null:bos,last_choch:null,held_break:neutral||repair?null:bos,bullish_retest:null,bearish_retest:null,protected_low:ref,protected_high:{...ref,price:101.3,active:!bull&&!neutral&&!repair},support_repair_bars:repair?2:bull?3:0,resistance_failure_bars:0,sweeps:[],signal_as_of:at,...options.smc};
  const sr={availability:"available",interval,state:"structure_ready",levels:[{...ref,role:"support",price:94},{...ref,role:"reduce",price:110}],support:{...ref,price:94},resistance:{...ref,role:"reduce",price:110},events:[],last_event:null,parameters:{pivot_left:weekly?2:4,pivot_right:weekly?2:4,volume_fast:5,volume_slow:10,volume_threshold:20}};
  const rsBull=bull,rsNeutral=neutral;
  return {availability:"available",horizon:weekly?"weekly":"daily",signal_as_of:at,trend_reference_price:options.trendPrice ?? (mode==="bear"?99:100),primary_intervals:[interval],supporting_intervals:[],
    trend:{moving_averages:{[`ema_20_${interval}`]:ma(vals[0],20,interval,slope),[`ema_50_${interval}`]:ma(vals[1],50,interval,slope),[`sma_${weekly?200:100}_${interval}`]:{...ma(vals[2],weekly?200:100,interval,slope),indicator:"sma"},[`ema_10_${interval}`]:ma(vals[3],10,interval,slope)},ma_structure:{alignment:neutral?"mixed":bull?"bullish":"bearish"},adx:{[`adx_14_${interval}`]:{availability:"available",adx:neutral?13:41,plus_di:neutral?20:bull?39:9,minus_di:neutral?20:bull?9:39,slope:{state:slope}}},support_resistance:sr,smc},
    momentum:{rsi:{[`rsi_${period}_${interval}`]:{availability:"available",period,interval,value:options.rsi ?? (neutral?50:bull?63:repair?40:37),slope:{state:repair?"rising":slope},divergence:options.divergence || "none"}},macd:{[`macd_${interval}`]:m},kdj:{[`kdj_9_${interval}`]:{availability:"available",interval,k:bull?60:40,d:bull?55:45,j:options.kdj ?? (neutral?50:bull?66:34),state:slope,slope:{state:slope}}},squeeze:{availability:"unavailable"},improving_bars:options.improvingBars ?? m.improving_bars,weakening_bars:options.weakeningBars ?? m.weakening_bars},
    volatility:{atr:{[`atr_14_${interval}`]:{availability:"available",value:options.atr ?? 1,atr_pct:options.atrPct ?? 1,atr_percentile_pct:options.atrPercentile ?? 42,volatility_regime:"normal",expansion_state:"stable",slope:{state:"flat"}}},bollinger:{[`bollinger_${interval}`]:{availability:"available",lower_band:options.lowerBand ?? 99,middle_band:100,upper_band:options.upperBand ?? 110,percent_b:options.percentB ?? .55,bandwidth_pct:4,bandwidth_percentile:45,squeeze_state:"normal"}},bollinger_rsi:{availability:"unavailable"}},
    participation:{volume:v,obv:{[`obv_${interval}`]:{availability:"available",interval,lookback:weekly?12:20,trend:options.participationTrend ?? (neutral?"stable":bull||repair?"rising":"falling"),divergence:options.obvDivergence || "none",price_obv_confirmation:bull?"confirming_uptrend":repair?"mixed":"confirming_downtrend"}}},
    relative_strength:{availability:"available",primary:{stock_return:options.stockReturn ?? (rsNeutral?0:rsBull?12:-12),vs_spy:options.vsSpy ?? (rsNeutral?0:rsBull?9:-9),vs_qqq:options.vsQqq ?? (rsNeutral?0:rsBull?8:-8)},consistency_state:options.rsConsistency ?? (rsNeutral?"stable":rsBull||repair?"improving":"deteriorating"),consistency:{state:options.rsConsistency ?? (rsNeutral?"stable":rsBull||repair?"improving":"deteriorating")},returns:{},vs_spy:{},vs_qqq:{}},fvg:{availability:"available",shadow_only:true,gaps:[]}};
}
function featureSet({daily="bull",weekly="bull",options={}}={}) {
  const fib=(key)=>({status:"available",horizon:key,source_timeframe:key==="daily"?"1d":"1w",derivation_id:key,known_at:"2026-09-25T20:00:00Z",swing_low:94,swing_high:110,swing_direction:(key==="daily"?daily:weekly)==="bear"?"down_swing":"up_swing",retracement_levels:{r382:{price:99,label:"38.2%"},r618:{price:98.5,label:"61.8%"}},extension_levels:{e127:{price:116,label:"127.2%"}}});
  const d=horizon(daily,{...options.daily,primaryInterval:"1d"}),w=horizon(weekly,{...options.weekly,primaryInterval:"1w"});
  return {schema_version:"V2-daily-weekly",horizons:{daily:d,weekly:w},volume:d.participation.volume,weekly_volume:w.participation.volume,fibonacci_structure:{daily:fib("daily"),weekly:fib("weekly")},fibonacci:{daily:fib("daily"),weekly:fib("weekly")},price_position:{availability:"available",high_52w:120,low_52w:80,all_time_high:125,position_52w_pct:50,state:"mid_range"},data_quality:{daily_freshness:{state:"current"}},source_intervals:{"1d":{last_bar_end:"2026-10-09T20:00:00Z"},"1w":{last_bar_end:"2026-10-09T20:00:00Z"}},execution_window_end:"2026-10-12T20:00:00Z"};
}
function market({regime="normal",fearGreed=50,vix=18,events=[],asOf="2026-10-09T20:30:00Z"}={}) {
  const falling=regime==="risk_off" || regime==="shock",rising=regime==="risk_on";
  return {market_context:{as_of:asOf,source:"test_fixture",vix:{value:regime==="shock"?40:regime==="risk_off"?30:vix,change_5d:0,change_20d:0,trend:falling?"rising":"neutral"},equity_trend:Object.fromEntries(["spy","qqq"].map((k)=>[k,{value:100,trend:falling?"falling":rising?"rising":"neutral",...Object.fromEntries([5,20,60,120].map((n)=>[`change_${n}d_pct`,falling?-8:rising?6:0]))}])),fear_greed:{value:fearGreed,label:"Neutral"},ten_year_yield:{value:4.2,change_5d_bps:0,change_20d_bps:0,trend:"neutral"},event_calendar:{status:"available",valid_through:"2029-12-31",events},macro_actuals:{status:"available",as_of:asOf,cpi:{headline:{period:"2026-09",mom_pct:.2,previous_mom_pct:.2},core:{period:"2026-09",mom_pct:.2,previous_mom_pct:.2}},employment:{period:"2026-09",unemployment_change_pp:0,payroll_change_thousands:150,payroll_three_month_mean_thousands:150}}}};
}
function rawHistory(count=1100) {
  const result={timestamps:[],opens:[],highs:[],lows:[],closes:[],volumes:[],completed:[],bar_end_timestamps:[],freshness:{state:"current"},source:"test_fixture",adjustment_basis:"provider_ohlc_auto_adjust_false"},weeks=new Map();
  const date=new Date("2022-01-03T00:00:00Z");
  while (result.timestamps.length<count) {
    if (![0,6].includes(date.getUTCDay())) {
      const i=result.closes.length,stamp=date.toISOString().slice(0,10),value=100+i*.04+Math.sin(i/8)*7;
      result.timestamps.push(stamp);result.opens.push(value-.3);result.highs.push(value+1.2);result.lows.push(value-1.2);result.closes.push(value);result.volumes.push(1_000_000+(i%19)*20000);result.completed.push(true);result.bar_end_timestamps.push(`${stamp}T21:00:00Z`);
      const mon=new Date(date);mon.setUTCDate(date.getUTCDate()-date.getUTCDay()+1);const k=mon.toISOString().slice(0,10);weeks.set(k,(weeks.get(k)||0)+1);
    }
    date.setUTCDate(date.getUTCDate()+1);
  }
  result.session_calendar={source:"fixture_exchange_calendar",completed_week_keys:[...weeks].filter(([,n])=>n===5).map(([k])=>k),session_counts:Object.fromEntries([...weeks].map(([k])=>[k,5])),week_ends:Object.fromEntries([...weeks].map(([k])=>{const end=new Date(`${k}T21:00:00Z`);end.setUTCDate(end.getUTCDate()+4);return [k,end.toISOString()];}))};
  result.as_of=new Date(Date.parse(result.bar_end_timestamps.at(-1))+1800000).toISOString();result.execution_window_end=new Date(+date+21*3600000).toISOString();return result;
}
module.exports={loadEngine,clone,ma,macd,horizon,featureSet,market,rawHistory};
