(function createMarketEngine(root) {
  "use strict";

  const engine = root.DecisionEngine || (root.DecisionEngine = {});
  const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
  const finite = (value) => value == null || typeof value === "boolean" || String(value).trim() === "" ? null : Number.isFinite(Number(value)) ? Number(value) : null;
  const lower = (value) => String(value || "").toLowerCase();

  function resolveContext(source = {}) {
    return source.market_context || source.market_engine || source || {};
  }

  function compareFomcActuals(calendar = {}, asOf) {
    const at=Date.parse(asOf);
    const releases=(calendar.events || []).filter(event=>event.type==="fomc" && Number.isFinite(Date.parse(event.at)) && Date.parse(event.at)<=at).sort((a,b)=>Date.parse(a.at)-Date.parse(b.at));
    const normalize=(actual,event)=>{
      const low=finite(actual?.target_range?.low),high=finite(actual?.target_range?.high);
      const released=Date.parse(actual?.released_at),known=Date.parse(actual?.as_of);
      if (actual?.status!=="available" || !event || actual.meeting_id!==event.id || released!==Date.parse(event.at) || !Number.isFinite(at) || !Number.isFinite(known) || known<released || known>at || !Number.isFinite(low) || !Number.isFinite(high) || !(low>=0 && high>low && high<=100) || !String(actual.source || "").startsWith("https://www.federalreserve.gov/newsevents/pressreleases/monetary")) return null;
      return {meetingId:actual.meeting_id,releasedAt:actual.released_at,asOf:actual.as_of,targetRange:{low,high},source:actual.source};
    };
    const current=normalize(calendar.fomc_decision,releases.at(-1));
    const previous=current?normalize(calendar.fomc_decision?.previous_decision,releases.at(-2)):null;
    if (!current || !previous) return {status:"unavailable",reason:current?"previous_actual_missing":"current_actual_unverified",current,previous:null,lowerChangePp:null,upperChangePp:null};
    const lowerChangePp=current.targetRange.low-previous.targetRange.low,upperChangePp=current.targetRange.high-previous.targetRange.high;
    const direction=lowerChangePp===0 && upperChangePp===0?"unchanged":lowerChangePp>=0 && upperChangePp>=0?"raised":lowerChangePp<=0 && upperChangePp<=0?"lowered":"range_changed";
    return {status:"available",current,previous,lowerChangePp,upperChangePp,direction};
  }

  function indexScore(index = {}) {
    const changes = [5, 20, 60, 120].map((days) => finite(index[`change_${days}d_pct`]));
    const weights = [0.18, 0.30, 0.30, 0.22];
    const available = changes.filter(Number.isFinite);
    const numeric = available.length
      ? changes.reduce((sum, value, indexPosition) => sum + (Number.isFinite(value) ? Math.tanh(value / 5) * 100 * weights[indexPosition] : 0), 0) / weights.reduce((sum, weight, indexPosition) => sum + (Number.isFinite(changes[indexPosition]) ? weight : 0), 0)
      : null;
    const trend = lower(index.trend);
    const interpreted = trend === "rising" ? 30 : trend === "falling" ? -30 : 0;
    const observed = available.length > 0 || (finite(index.value) != null && ["rising", "falling", "neutral"].includes(trend));
    return { score: Number.isFinite(numeric) ? clamp(numeric * 0.78 + interpreted * 0.22, -100, 100) : interpreted, available: observed, changes, trend: observed ? index.trend || "neutral" : "unavailable" };
  }

  function yieldStance(yieldData = {}) {
    const value = finite(yieldData.value);
    const change5 = finite(yieldData.change_5d_bps);
    const change20 = finite(yieldData.change_20d_bps);
    const config = engine.config.market.yields;
    if (!Number.isFinite(value) && !Number.isFinite(change5) && !Number.isFinite(change20)) return { label: "unavailable", riskAdd: 0, available: false, value, change5, change20 };
    if (value >= config.severe || change20 >= config.rising20dBps * 1.35) return { label: "severe", riskAdd: 12, available: true, value, change5, change20 };
    if (value >= config.restrictive || change5 >= config.rising5dBps || change20 >= config.rising20dBps) return { label: "restrictive", riskAdd: 6, available: true, value, change5, change20 };
    if (lower(yieldData.trend) === "falling") return { label: "supportive", riskAdd: -2, available: true, value, change5, change20 };
    return { label: "neutral", riskAdd: 0, available: true, value, change5, change20 };
  }

  function earnings(metadata = {}) {
    const configured = finite(metadata.daysToEarnings ?? metadata.days_to_earnings);
    const date = metadata.earningsDate || metadata.earnings_date || metadata.next_earnings_date || null;
    const asOf = metadata.asOf || metadata.as_of || null;
    const referenceTime = asOf ? new Date(asOf).getTime() : Date.now();
    const inferred = date ? Math.ceil((new Date(date).getTime() - referenceTime) / 86400000) : null;
    const daysToEarnings = Number.isFinite(configured) ? configured : inferred;
    const config = engine.config.market.earnings;
    const immediate = Number.isFinite(daysToEarnings) && daysToEarnings >= 0 && daysToEarnings <= config.immediateDays;
    const near = Number.isFinite(daysToEarnings) && daysToEarnings >= 0 && daysToEarnings <= config.nearDays;
    return { date, daysToEarnings, immediate, near, riskAdd: immediate ? config.immediateRiskAdd : near ? config.nearRiskAdd : 0, confidencePenalty: near ? config.confidencePenalty : 0 };
  }

  function evaluate(marketContext = {}, metadata = {}) {
    const context = resolveContext(marketContext);
    const vixData = context.vix || {};
    const vix = finite(vixData.value ?? vixData.current_value);
    const vix5 = finite(vixData.change_5d ?? vixData.change_5d_pct);
    const vix20 = finite(vixData.change_20d ?? vixData.change_20d_pct);
    const spy = indexScore(context.equity_trend?.spy || context.spy_trend || {});
    const qqq = indexScore(context.equity_trend?.qqq || context.qqq_trend || {});
    const synchronizedBreakdown = spy.score <= -34 && qqq.score <= -34;
    const synchronizedStrength = spy.score >= 24 && qqq.score >= 24;
    const vixConfig = engine.config.market.vix;
    const vixShock = vix >= vixConfig.shock || vix5 >= vixConfig.spike5d * 1.5 || vix20 >= vixConfig.spike20d * 1.35;
    const vixRiskOff = vix >= vixConfig.riskOff || vix5 >= vixConfig.spike5d || vix20 >= vixConfig.spike20d;
    const vixCautious = vix >= vixConfig.cautious || lower(vixData.trend) === "rising";
    let regime = "normal";
    if (vixShock || (synchronizedBreakdown && vixRiskOff)) regime = "shock";
    else if (synchronizedBreakdown || vixRiskOff) regime = "risk_off";
    else if (vixCautious || (spy.score < -10 && qqq.score < -10)) regime = "cautious";
    else if (synchronizedStrength && Number.isFinite(vix) && vix < vixConfig.cautious) regime = "risk_on";
    if (!Number.isFinite(vix) && !spy.available && !qqq.available) regime = "unavailable";
    const yieldData = yieldStance(context.ten_year_yield || context.tenYearYield || context.us_10y || {});
    const fearGreed = context.fear_greed || context.fearGreed || {};
    const fearGreedValue = finite(fearGreed.value ?? fearGreed.score);
    const earningsRisk = earnings(metadata);
    const regimeConfig = engine.config.market.regimes[regime] || engine.config.market.regimes.normal;
    const reasons = [];
    if (regime === "shock") reasons.push("Systemic volatility or synchronized index breakdown creates a market shock.");
    else if (regime === "risk_off") reasons.push("SPY/QQQ trend or volatility backdrop is risk-off.");
    else if (regime === "cautious") reasons.push("Market volatility or broad trend calls for more cautious execution.");
    if (yieldData.label === "restrictive" || yieldData.label === "severe") reasons.push("10Y yield backdrop is restrictive for rate-sensitive risk.");
    if (regime === "unavailable") reasons.push("Market context is unavailable; its risk regime cannot be verified.");
    if (earningsRisk.near) reasons.push("Earnings proximity raises event uncertainty.");
    return {
      regime, label: regime.replace(/_/g, "-").replace(/(^|-)([a-z])/g, (_, separator, char) => `${separator}${char.toUpperCase()}`),
      riskAddBase: regimeConfig.riskAdd, confidencePenaltyBase: regimeConfig.confidencePenalty,
      vix: { value: vix, change5d: vix5, change20d: vix20, trend: vixData.trend || "unavailable", shock: vixShock },
      spy, qqq, synchronizedBreakdown, synchronizedStrength, yield: yieldData,
      fearGreed: { value: fearGreedValue, label: fearGreed.label || "unavailable", trend: fearGreed.trend || "unavailable" },
      eventCalendar: context.event_calendar || {status:"unavailable",events:[]}, macroActuals: context.macro_actuals || {status:"unavailable"},
      fomcActualComparison: compareFomcActuals(context.event_calendar || {},context.as_of || context.updated_at || marketContext.updatedAt || marketContext.updated_at),
      earnings: earningsRisk, reasons, provenance: { asOf: context.as_of || context.updated_at || marketContext.updatedAt || marketContext.updated_at || null, source: context.source || marketContext.source || "unverified", units: { vix: "index_points", yield: "percent", yieldChanges: "basis_points", equityChanges: "percent" }, availability: regime === "unavailable" ? "unavailable" : context.stale || marketContext.stale || marketContext.status === "stale" ? "stale" : "available", timestampAlignment: "per-field timestamps required; legacy snapshots may be unverified" },
      dataQuality: Math.round(([Number.isFinite(vix), spy.available, qqq.available, yieldData.available, Number.isFinite(fearGreedValue)].filter(Boolean).length / 5) * 100),
    };
  }

  // Market adjusts risk and confidence only.  It deliberately never contributes
  // a directional vote; a Risk-On market cannot turn a weak stock into a Buy.
  function forHorizon(market = {}, horizon = "daily", profile = {}, technical = {}) {
    const baseSensitivity = engine.config.horizons[horizon]?.marketSensitivity ?? 1;
    const modifier = profile.effectiveModifiers?.marketSensitivity || 1;
    const rateSensitivity = profile.effectiveModifiers?.rateSensitivity || 1;
    const eventSensitivity = profile.effectiveModifiers?.eventSensitivity || 1;
    const eventCfg=engine.config.market.events,macroCfg=engine.config.market.macro;
    const calendar=market.eventCalendar || {},start=Date.parse(technical.latestDailyEnd),end=Date.parse(technical.nextExecutionClose),asOf=Date.parse(market.provenance?.asOf);
    const asOfDay=Number.isFinite(asOf)?new Intl.DateTimeFormat("sv-SE",{timeZone:"America/New_York",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date(asOf)):null;
    const calendarUnavailable=calendar.status!=="available" || !Number.isFinite(start) || !Number.isFinite(end) || !calendar.valid_through || asOfDay && calendar.valid_through<asOfDay;
    const crossing=calendarUnavailable?[]:(calendar.events || []).filter((event)=>eventCfg.majorTypes.includes(event.type) && Number.isFinite(Date.parse(event.at)) && Date.parse(event.at)>start && Date.parse(event.at)<=end);
    const majorEventWindow=crossing.length>0;
    const actual=market.macroActuals || {},core=actual.cpi?.core || {},jobs=actual.employment || {};
    const actualValid=actual.status==="available" && Number.isFinite(Date.parse(actual.as_of)) && (!Number.isFinite(asOf) || Date.parse(actual.as_of)<=asOf);
    const inflationRisk=actualValid && Number.isFinite(core.mom_pct) && Number.isFinite(core.previous_mom_pct) ? Math.max(0,(core.mom_pct-core.previous_mom_pct)/macroCfg.cpiStep):0;
    const jobRisk=actualValid && Number.isFinite(jobs.unemployment_change_pp) && jobs.unemployment_change_pp>=macroCfg.unemploymentStep && Number.isFinite(jobs.payroll_change_thousands) && Number.isFinite(jobs.payroll_three_month_mean_thousands) && jobs.payroll_change_thousands<jobs.payroll_three_month_mean_thousands*(1-macroCfg.payrollDeteriorationShare)?1:0;
    const fomcComparison=market.fomcActualComparison || compareFomcActuals(calendar,market.provenance?.asOf);
    const fomcRisk=fomcComparison.status==="available"?Math.max(0,fomcComparison.lowerChangePp,fomcComparison.upperChangePp)/macroCfg.fomcStepPp*rateSensitivity:null;
    const macroRisk=Math.min(macroCfg.riskAddMaximum,Math.max(inflationRisk,jobRisk,fomcRisk ?? 0)*macroCfg.riskUnit);
    // Keep the latest known release of each type pending until its actual is
    // verified. Elapsed time alone cannot make an unavailable release safe.
    const recentReleases=eventCfg.majorTypes.map(type=>(calendar.events || []).filter(event=>event.type===type && Date.parse(event.at)<=start).sort((a,b)=>Date.parse(b.at)-Date.parse(a.at))[0]).filter(Boolean);
    const releaseDataPending=recentReleases.some((recentRelease)=>{
      const stamp=new Date(recentRelease.at),expected=new Date(Date.UTC(stamp.getUTCFullYear(),stamp.getUTCMonth()-1,1)).toISOString().slice(0,7);
      const period=recentRelease.type==="cpi"?actual.cpi?.headline?.period:actual.employment?.period;
      return recentRelease.type==="fomc"?fomcComparison.current?.meetingId!==recentRelease.id:!actualValid || !period || period<expected || Date.parse(actual.as_of)<Date.parse(recentRelease.at);
    });
    const eventRisk=majorEventWindow?eventCfg.ordinaryRiskAdd*eventSensitivity:0;
    // Overlapping market, rate and macro stress are one regime group; issuer/release event uncertainty is separate.
    const regimeRisk=Math.max((market.riskAddBase || 0)*modifier,(market.yield?.riskAdd || 0)*rateSensitivity,macroRisk);
    const uncappedRiskAdd=regimeRisk*baseSensitivity+Math.max((market.earnings?.riskAdd || 0)*eventSensitivity,eventRisk);
    const riskAdd=clamp(uncappedRiskAdd,-4,engine.config.market.maxRiskAdd[horizon]);
    return {
      marketUnavailable: market.regime==="unavailable" || market.provenance?.availability==="stale" || !Number.isFinite(Date.parse(market.provenance?.asOf)),
      majorEventWindow, earningsNear: market.earnings?.near === true, entryPaused: majorEventWindow || releaseDataPending, releaseDataPending, calendarUnavailable, crossingEvents: crossing, macroRisk: Math.round(macroRisk), fomcRisk,
      confirmationAdd: (majorEventWindow || releaseDataPending || calendarUnavailable || !actualValid) ? eventCfg.ordinaryConfirmationAdd * eventSensitivity : 0,
      regime: market.regime || "normal", sensitivity: baseSensitivity * modifier,
      riskAdd: Math.round(riskAdd), uncappedRiskAdd: Math.round(uncappedRiskAdd), marketRiskCap: engine.config.market.maxRiskAdd[horizon] ?? 24,
      confidencePenalty: Math.round((market.confidencePenaltyBase || 0) * baseSensitivity * modifier + (market.earnings?.confidencePenalty || 0) * eventSensitivity),
      shock: market.regime === "shock", reasons: [...(market.reasons || []), ...(fomcRisk>0 ? [{code:"fomc_actual_tightening",text:"fomc_actual_tightening"}] : []), ...(majorEventWindow ? [{code:"major_release_entry_pause",text:"major_release_entry_pause"}] : []), ...(actual.status !== "available" ? [{code:"macro_actuals_unavailable",text:"macro_actuals_unavailable"}] : [])],
    };
  }

  engine.market = Object.freeze({ evaluate, forHorizon });
}(globalThis));
