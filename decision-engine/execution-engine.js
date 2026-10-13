(function createExecutionEngine(root) {
  "use strict";

  const engine = root.DecisionEngine || (root.DecisionEngine = {});
  const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
  const roundPrice = (value) => Number.isFinite(value) ? Math.round(value * 100) / 100 : null;
  const round = (value) => Number.isFinite(value) ? Math.round(value * 100) / 100 : null;
  const range = (low, high) => Number.isFinite(low) && Number.isFinite(high) && low > 0 && low < high && roundPrice(low) > 0 && roundPrice(low) < roundPrice(high)
    ? { low: roundPrice(low), high: roundPrice(high) } : null;
  const positiveAction = (action) => ["strong_buy", "buy", "accumulate"].includes(action);
  const executionIntent = (action) => ({ strong_buy: "enter", buy: "enter", accumulate: "add", hold: "hold", trim: "reduce", sell: "exit", short_sell: "short_enter" }[action] || "hold");

  // Granular states are kept for debug/presentation, but each resolves to one
  // user-facing Action Family. No later reconciliation may cross that family.
  const PRICE_STATES = Object.freeze([
    "IN_OPPORTUNITY_ZONE", "NEAR_OPPORTUNITY_ZONE", "NEUTRAL_ZONE", "NEAR_REDUCE_ZONE",
    "IN_REDUCE_ZONE", "BEYOND_REDUCE_ZONE", "BREAKDOWN_ZONE", "INVALID_LANDSCAPE",
  ]);
  const ACTION_FAMILIES = Object.freeze({
    opportunity: Object.freeze(["strong_buy", "buy", "accumulate", "hold"]),
    neutral: Object.freeze(["hold"]),
    reduce: Object.freeze(["trim", "sell", "hold"]),
    defensive: Object.freeze(["sell"]),
    short_entry: Object.freeze(["short_sell"]),
    unavailable: Object.freeze(["hold"]),
  });

  function actionFamilyForState(state) {
    // A Near state is analysis context only. It may affect confidence and
    // reasons, but it never permits an early entry or reduction action.
    // Exact range membership remains the sole normal Action-Family boundary.
    if (state === "IN_OPPORTUNITY_ZONE") return "opportunity";
    if (["NEAR_OPPORTUNITY_ZONE", "NEUTRAL_ZONE", "NEAR_REDUCE_ZONE"].includes(state)) return "neutral";
    if (["IN_REDUCE_ZONE", "BEYOND_REDUCE_ZONE"].includes(state)) return "reduce";
    if (state === "BREAKDOWN_ZONE") return "defensive";
    return "unavailable";
  }

  function nearestLevel(levels, center, side) {
    const candidates = (levels || []).filter((level) => Number.isFinite(level.price)
      && (side === "above" ? level.price > center : level.price < center));
    return candidates.sort((left, right) => Math.abs(left.price - center) - Math.abs(right.price - center))[0] || null;
  }

  function rangeDistance(price, value) {
    if (!value || !Number.isFinite(price)) return { available: false, within: false, edge: null, distancePct: null };
    if (price >= value.low && price <= value.high) return { available: true, within: true, edge: price, distancePct: 0 };
    const edge = price < value.low ? value.low : value.high;
    return { available: true, within: false, edge, distancePct: (edge - price) / price * 100 };
  }

  function confluenceWidth({ price, atr, horizon, confluence }) {
    const config = engine.config.execution;
    const structureConfig = engine.config.componentScales.opportunity.unifiedConfluence;
    const score = clamp((confluence?.confluence || confluence?.quality || 0) / structureConfig.qualityReference * engine.config.componentScales.opportunity.maxConfluenceScore, 0, engine.config.componentScales.opportunity.maxConfluenceScore);
    const ratio = score / Math.max(1, engine.config.componentScales.opportunity.maxConfluenceScore);
    const multiplier = config.confluenceWidthMultiplier.weak
      + (config.confluenceWidthMultiplier.strong - config.confluenceWidthMultiplier.weak) * ratio;
    const baseWidth = Math.max(atr * engine.config.horizons[horizon].rangeAtrWidth, price * 0.0025);
    const width = Math.min(baseWidth * multiplier, price * config.maxHalfWidthPct[horizon]);
    return { score: round(score), quality: round(confluence?.quality ?? confluence?.confluence ?? 0), multiplier: round(multiplier), baseWidth: roundPrice(baseWidth), width: roundPrice(width) };
  }

  function landscapeRange({ center, price, atr, horizon, confluence, halfWidth = null }) {
    if (!Number.isFinite(center)) return null;
    const width = confluenceWidth({ price, atr, horizon, confluence });
    const resolvedWidth = Number.isFinite(halfWidth) ? halfWidth : width.width;
    return {
      range: range(center - resolvedWidth, center + resolvedWidth),
      inputs: { center: roundPrice(center), ...width, width: roundPrice(resolvedWidth), members: confluence?.members?.length || 0, independentStructures: confluence?.independentStructures || 0, categories: (confluence?.categoryBreakdown || []).map((item) => item.category) },
    };
  }

  function compactCluster(cluster) {
    return cluster ? {
      center: roundPrice(cluster.center), confluence: round(cluster.confluence), quality: round(cluster.quality), roleAlignment: round(cluster.roleAlignment), distanceAtr: round(cluster.distanceAtr),
      members: (cluster.members || []).slice(0, 5).map((member) => ({ price: roundPrice(member.price), type: member.type, category: member.category || member.type, label: member.label })),
      categoryBreakdown: (cluster.categoryBreakdown || []).map((item) => ({ category: item.category, levelCount: item.levelCount, contribution: round(item.contribution), representative: { ...item.representative, price: roundPrice(item.representative?.price) } })),
    } : null;
  }

  function clustersFor(context, key, fallback) {
    const listed = Array.isArray(context?.[key]) ? context[key].filter((item) => Number.isFinite(item?.center)) : [];
    if (listed.length) return listed;
    return Number.isFinite(fallback?.center) ? [fallback] : [];
  }

  function bufferFor({ horizon, atr, support, resistance }) {
    const base = atr * engine.config.execution.landscape.neutralBufferAtr[horizon];
    const quality = clamp(((support?.quality || support?.confluence || 0) + (resistance?.quality || resistance?.confluence || 0)) / engine.config.componentScales.opportunity.unifiedConfluence.pairQualityReference, 0, 1);
    return base * (1.08 - quality * 0.20);
  }

  function contextualPressure({ technical = {}, risk = 0, exhaustionScore = 0, marketModifiers = {}, profile = {} } = {}) {
    const direction = technical.directionScore || 0;
    const confirmation = technical.confirmationScore || 0;
    const profileModifiers = profile.effectiveModifiers || {};
    const marketPressure = clamp((marketModifiers.riskAdd || 0) / 32, 0, 1) * (profileModifiers.marketSensitivity || 1);
    let bullishTrend = clamp((Math.max(0, direction) / 100) * 0.62 + (confirmation / 100) * 0.28 - (risk / 100) * 0.22 - (Math.max(0, -exhaustionScore) / 100) * 0.28 - marketPressure * 0.16, 0, 1);
    if (technical.entryEvidence?.independentWeakening && technical.entryEvidence.weakeningBars>=engine.config.indicators.smc.momentumRepairBars) bullishTrend*=1-engine.config.execution.landscape.contextualSelection.weakeningTrendDiscount;
    const bearishPressure = clamp((Math.max(0, -direction) / 100) * 0.52 + (risk / 100) * 0.22 + (Math.max(0, -exhaustionScore) / 100) * 0.18 + marketPressure * 0.18, 0, 1);
    return { bullishTrend: round(bullishTrend), bearishPressure: round(bearishPressure), marketPressure: round(marketPressure) };
  }

  function pairCandidates({ supportClusters, resistanceClusters, price, atr, horizon, context }) {
    const pairs = [];
    const policy = engine.config.execution.landscape.contextualSelection;
    const pressure = contextualPressure(context);
    const requiredReduceDistance = policy.minimumReduceDistanceAtr[horizon] + pressure.bullishTrend * policy.bullishTrendLiftAtr[horizon];
    supportClusters.forEach((support) => resistanceClusters.forEach((resistance) => {
      if (!(support.center < resistance.center)) return;
      const opportunity = landscapeRange({ center: support.center, price, atr, horizon, confluence: support });
      const reduce = landscapeRange({ center: resistance.center, price, atr, horizon, confluence: resistance });
      if (!opportunity?.range || !reduce?.range) return;
      const buffer = bufferFor({ horizon, atr, support, resistance });
      const separation = reduce.range.low - opportunity.range.high;
      const quality = (support.quality || support.confluence || 0) + (resistance.quality || resistance.confluence || 0);
      const supportDistanceAtr = Math.abs(price - support.center) / atr;
      const reduceDistanceAtr = Math.abs(resistance.center - price) / atr;
      // Strong trend selection prefers a further *existing* resistance cluster
      // over a stale nearby one; no synthetic centre is introduced.
      const prematureReduce = Math.max(0, requiredReduceDistance - Math.max(0, reduceDistanceAtr));
      const rank = quality
        - supportDistanceAtr * policy.supportDistancePenalty
        - reduceDistanceAtr * policy.reduceDistancePenalty
        - prematureReduce * policy.prematureReducePenalty
        + pressure.bearishPressure * Math.max(0, 1.5 - Math.max(0, reduceDistanceAtr)) * policy.bearishPressureProximityBonus;
      pairs.push({
        support, resistance, opportunity, reduce, buffer, separation, quality, rank,
        contextual: { ...pressure, requiredReduceDistance: round(requiredReduceDistance), supportDistanceAtr: round(supportDistanceAtr), reduceDistanceAtr: round(reduceDistanceAtr), prematureReduce: round(prematureReduce) },
        valid: separation + 0.000001 >= buffer,
      });
    }));
    return pairs.sort((left, right) => Number(right.valid) - Number(left.valid) || right.rank - left.rank);
  }

  function compressPair(pair, { price, atr, horizon }) {
    if (!pair || pair.resistance.center <= pair.support.center) return null;
    const buffer = bufferFor({ horizon, atr, support: pair.support, resistance: pair.resistance });
    const available = pair.resistance.center - pair.support.center - buffer;
    const minimum = atr * engine.config.execution.landscape.minimumHalfWidthAtr[horizon] * 2;
    if (!(available >= minimum)) return null;
    const targetHalfTotal = Math.min(available, pair.opportunity.inputs.width + pair.reduce.inputs.width);
    const proportion = pair.opportunity.inputs.width / Math.max(0.000001, pair.opportunity.inputs.width + pair.reduce.inputs.width);
    const opportunity = landscapeRange({ center: pair.support.center, price, atr, horizon, confluence: pair.support, halfWidth: targetHalfTotal * proportion });
    const reduce = landscapeRange({ center: pair.resistance.center, price, atr, horizon, confluence: pair.resistance, halfWidth: targetHalfTotal * (1 - proportion) });
    if (!opportunity?.range || !reduce?.range) return null;
    const separation = reduce.range.low - opportunity.range.high;
    return separation + 0.000001 >= buffer ? { ...pair, opportunity, reduce, buffer, separation, valid: true, rebuilt: "compressed_to_preserve_neutral_buffer" } : null;
  }

  function riskBoundary(technical = {}) {
    const reference=technical.smc?.protected_low;
    if (!(reference?.price>0) || !(reference?.atr_at_known>0) || reference.active===false) return null;
    const cfg=engine.config.indicators.smc;
    return {reference:reference.price,knownAt:reference.known_at,atrAtKnown:reference.atr_at_known,
      ordinary:reference.price-cfg.ordinaryInvalidationAtr*reference.atr_at_known,
      hard:reference.price-cfg.hardInvalidationAtr*reference.atr_at_known,
      materialBuffer:cfg.materialInvalidationAtr*reference.atr_at_known};
  }

  function confirmedBreakdown(technical = {}, price = null) {
    const boundary=riskBoundary(technical);
    const ordinary=boundary && technical.trendPrice < boundary.ordinary;
    const hard=boundary && Number.isFinite(price) && price < boundary.hard-boundary.materialBuffer;
    return Boolean(ordinary || hard);
  }

  function preliminaryInvalidation({technical,opportunityRange,atr}) {
    const boundary=riskBoundary(technical);
    if (boundary) return roundPrice(boundary.ordinary);
    const known=technical.structureSupport;
    if (known?.price>0 && known.atr_at_known>0 && known.price<=opportunityRange?.low+atr*engine.config.indicators.structure.retestAtr) return roundPrice(known.price-engine.config.indicators.smc.ordinaryInvalidationAtr*known.atr_at_known);
    const supports=(technical.executionContext?.levels || []).filter((item)=>item.role==="support" || item.role==="both");
    const level=Number.isFinite(opportunityRange?.low)?nearestLevel(supports,opportunityRange.low,"below"):null;
    return level ? roundPrice(level.price-atr*engine.config.execution.invalidationAtrBuffer):null;
  }

  function entryPlanForPair(pair,technical,atr) {
    const initial=pair.opportunity.range,invalidation=preliminaryInvalidation({technical,opportunityRange:initial,atr});
    const low=invalidation>0?Math.max(initial.low,roundPrice(invalidation+.01)):initial.low;
    // A live protected reference is not replaced by a lower stop just to make
    // a different cluster pass. Check every price in the remaining real zone.
    const obstacles=(technical.executionContext?.levels || []).filter((level)=>level.role==="reduce" && level.price>low).map((item)=>item.price);
    const target=roundPrice(Math.min(pair.reduce.range.low,...obstacles)),minimumR=engine.config.execution.rewardRisk.accumulate;
    const highest=invalidation>0 && pair.support.center>invalidation?Math.floor((target+minimumR*invalidation)/(1+minimumR)*100)/100:null;
    const opportunity=highest==null?null:range(low,Math.min(initial.high,highest));
    return {pair,initial,invalidation,target,opportunity};
  }

  function shortPlan({technical,price,horizon,profile}) {
    const empty={shortEntryRange:null,shortInvalidation:null,shortTarget:null,shortRewardRisk:null};
    if ((technical.dataQuality?.score || 0)<engine.config.actionPolicy.minimumDataQuality || !Number.isFinite(price)) return empty;
    if (horizon!=="daily" || profile?.isETF || !technical.smc?.bearish_confirmed) return empty;
    const reference=technical.smc.bearish_retest || technical.smc.held_break;
    if (!(reference?.reference_price>0) || !(reference.atr_at_event>0)) return empty;
    const cfg=engine.config.indicators.structure,atr=reference.atr_at_event,center=reference.reference_price;
    const protectedHigh=technical.smc.protected_high;
    const upper=protectedHigh?.price>center && protectedHigh.atr_at_known>0?protectedHigh.price+engine.config.indicators.smc.ordinaryInvalidationAtr*protectedHigh.atr_at_known:center+(cfg.retestAtr+engine.config.indicators.smc.ordinaryInvalidationAtr)*atr;
    const supports=[...(technical.executionContext?.levels || []).filter((item)=>item.role==="support" && item.type!=="moving_average"),...(technical.structureLevels || []).filter((item)=>item.role==="support")];
    const target=supports.filter((item)=>item.price<center-cfg.retestAtr*atr).sort((a,b)=>b.price-a.price)[0]?.price;
    if (!(target>0 && target<upper)) return empty;
    const stop=roundPrice(upper),down=roundPrice(target);
    const r=engine.config.execution.rewardRisk.short_sell,minimum=(down+r*stop)/(1+r);
    const entry=range(Math.max(center-cfg.retestAtr*atr,Math.ceil(minimum*100)/100),Math.min(center+cfg.retestAtr*atr,stop-.01));
    const rr=entry && price<stop && price>down?(price-down)/(stop-price):null;
    return {...empty,shortEntryRange:entry,shortInvalidation:stop,shortTarget:down,shortRewardRisk:rr,shortReference:{price:roundPrice(center),knownAt:reference.reference_known_at,confirmedAt:reference.timestamp},shortPlanInvalid:price>=stop};
  }

  function priceStateFor({ price, horizon, atr, opportunityRange, reduceRange, neutralBuffer = null, invalidation = null, breakdown = false }) {
    if (breakdown && Number.isFinite(price) && atr > 0) return "BREAKDOWN_ZONE";
    if (!Number.isFinite(price) || !Number.isFinite(atr) || atr <= 0) return "INVALID_LANDSCAPE";
    if (reduceRange && price>=reduceRange.low) return price<=reduceRange.high?"IN_REDUCE_ZONE":"BEYOND_REDUCE_ZONE";
    if (!opportunityRange || !reduceRange || !(opportunityRange.high < reduceRange.low)) return "INVALID_LANDSCAPE";
    if (breakdown) return "BREAKDOWN_ZONE";
    if (price >= opportunityRange.low && price <= opportunityRange.high) return "IN_OPPORTUNITY_ZONE";
    if (price >= reduceRange.low && price <= reduceRange.high) return "IN_REDUCE_ZONE";
    if (price > reduceRange.high) return "BEYOND_REDUCE_ZONE";
    const opportunity = rangeDistance(price, opportunityRange);
    const reduce = rangeDistance(price, reduceRange);
    const stateConfig = engine.config.execution.priceState;
    const opportunityDistance = opportunity.available ? Math.abs(opportunity.edge - price) : Infinity;
    const reduceDistance = reduce.available ? Math.abs(reduce.edge - price) : Infinity;
    const neutralCap = Number.isFinite(neutralBuffer)
      ? Math.max(atr * stateConfig.minimumNearAtr, neutralBuffer * stateConfig.neutralBufferNearShare)
      : Infinity;
    const nearOpportunity = opportunityDistance <= Math.min(atr * stateConfig.nearOpportunityAtr[horizon], neutralCap);
    const nearReduce = reduceDistance <= Math.min(atr * stateConfig.nearReduceAtr[horizon], neutralCap);
    if (nearOpportunity && nearReduce) return reduceDistance < opportunityDistance ? "NEAR_REDUCE_ZONE" : "NEAR_OPPORTUNITY_ZONE";
    if (nearOpportunity) return "NEAR_OPPORTUNITY_ZONE";
    if (nearReduce) return "NEAR_REDUCE_ZONE";
    return "NEUTRAL_ZONE";
  }

  function buildLandscape({price,horizon,technical={},context={}}={}) {
    const raw=technical.executionContext || {},atr=Number(technical.atr ?? raw.atr),boundary=riskBoundary(technical);
    const short=shortPlan({technical,price,horizon,profile:context.profile});
    const invalid=(reason)=>({priceLandscape:{opportunityRange:null,reduceRange:null,invalidation:null,hardInvalidation:boundary && technical.dataQuality?.score>=engine.config.actionPolicy.minimumDataQuality?roundPrice(boundary.hard):null,currentPrice:roundPrice(price),...short},priceState:"INVALID_LANDSCAPE",actionFamily:"unavailable",landscapeQuality:{state:"invalid",score:0,penalty:engine.config.execution.landscape.invalidQualityPenalty,reason},debug:{priceLandscapeInputs:{reason,candidateCounts:{opportunity:0,reduce:0}},guardrails:[reason]}});
    if (!Number.isFinite(price) || !(atr>0) || !engine.config.horizons[horizon]) return invalid("price_or_atr_unavailable");
    if ((technical.dataQuality?.score || 0)<engine.config.actionPolicy.minimumDataQuality) return invalid("untrusted_source_history");
    const bearish=technical.smc?.bearish_confirmed && technical.directionScore<=engine.config.actionPolicy.gates.sell.direction && technical.confirmationScore>=engine.config.actionPolicy.gates.sell.confirmation;
    const breakdown=confirmedBreakdown(technical,price);
    if (breakdown || bearish) {
      return {priceLandscape:{opportunityRange:null,reduceRange:range(price-atr*engine.config.execution.exitHalfWidthAtr,price+atr*engine.config.execution.exitHalfWidthAtr),invalidation:boundary?roundPrice(boundary.ordinary):null,hardInvalidation:boundary?roundPrice(boundary.hard):null,currentPrice:roundPrice(price),...short},priceState:"BREAKDOWN_ZONE",actionFamily:"defensive",landscapeQuality:{state:"high",score:1,penalty:0,reason:breakdown?"confirmed_structure_invalidation":"confirmed_bearish_structure"},debug:{priceLandscapeInputs:{breakdownExitAnchor:true,boundary},guardrails:[]}};
    }
    const supportClusters=clustersFor(raw,"supportClusters",raw.support),resistanceClusters=clustersFor(raw,"resistanceClusters",raw.resistance);
    const pairs=pairCandidates({supportClusters,resistanceClusters,price,atr,horizon,context:{...context,technical}});
    const candidates=pairs.map((pair)=>pair.valid?pair:compressPair(pair,{price,atr,horizon})).filter((pair)=>pair && pair.support.independentStructures>=engine.config.execution.minimumIndependentEntryCategories && pair.quality>=engine.config.execution.landscape.minimumPairQuality);
    const plans=candidates.map((pair)=>entryPlanForPair(pair,technical,atr));
    // Rank only executable entry zones. A failed top pair does not erase the
    // remaining independent structures; no centre or R threshold is changed.
    const selectedPlan=plans.find((plan)=>plan.opportunity) || plans[0];
    if (!selectedPlan) return invalid("no_independent_support_resistance_pair");
    const {pair:selected,initial,invalidation,target,opportunity}=selectedPlan;
    const state=priceStateFor({price,horizon,atr,opportunityRange:opportunity,reduceRange:selected.reduce.range,neutralBuffer:selected.buffer,invalidation});
    const rr=opportunity && price>invalidation && price<target?(target-price)/(price-invalidation):null;
    return {priceLandscape:{opportunityRange:opportunity,reduceRange:selected.reduce.range,invalidation,hardInvalidation:boundary?roundPrice(boundary.hard):null,currentPrice:roundPrice(price),entryTarget:roundPrice(target),rewardRisk:rr,...short,costsIncluded:false},priceState:state,actionFamily:actionFamilyForState(state),
      landscapeQuality:{state:opportunity?selected.rebuilt?"rebuilt":"high":"invalid",score:round(selected.quality),penalty:opportunity?0:engine.config.execution.landscape.invalidQualityPenalty,reason:opportunity?null:"insufficient_reward_risk",neutralBuffer:roundPrice(selected.buffer),separation:opportunity?roundPrice(selected.reduce.range.low-opportunity.high):null},
      debug:{priceLandscapeInputs:{structureModel:raw.structureModel,opportunity:selected.opportunity.inputs,reduce:selected.reduce.inputs,selectedSupport:compactCluster(selected.support),selectedReduce:compactCluster(selected.resistance),neutralBuffer:roundPrice(selected.buffer),originalOpportunity:initial,riskClipped:opportunity?.low!==initial.low || opportunity?.high!==initial.high,boundary,candidateCounts:{opportunity:supportClusters.length,reduce:resistanceClusters.length,rejectedRiskPairs:plans.filter((plan)=>!plan.opportunity).length}},guardrails:opportunity?[]:["insufficient_reward_risk"]}};
  }

  function decisionForPriceState({landscape,technical={},exhaustionScore=0,risk=0,marketModifiers={},profile={}}={}) {
    const state=landscape?.priceState || "INVALID_LANDSCAPE",family=actionFamilyForState(state),plans=landscape?.priceLandscape || {},gates=engine.config.actionPolicy.gates;
    const direction=technical.directionScore || 0,confirmation=technical.confirmationScore || 0,smc=technical.smc || {},evidence=technical.entryEvidence || {},mods=profile.effectiveModifiers || {},pg=mods.actionGates || {};
    const reasons={supporting:[],limiting:[]},guardrails=[];
    const result=(action,code,extra={})=>({action,priceState:state,actionFamily:action==="short_sell"?"short_entry":action==="sell"?"defensive":family,eligibleActions:[action],reasonCode:code,reasons:{supporting:action==="buy" || action==="strong_buy" || action==="accumulate"?[...reasons.supporting,{code,text:code}]:reasons.supporting,limiting:[...reasons.limiting,...(action==="hold" || action==="trim" || action==="sell" || action==="short_sell"?[{code,text:code}]:[])]},guardrails,...extra});
    if ((technical.dataQuality?.score || 0)<engine.config.actionPolicy.minimumDataQuality) return result("hold","waiting_required_data",{actionFamily:"unavailable",missing:technical.dataQuality?.missingCore || []});
    const inRange=(range)=>range && plans.currentPrice>=range.low && plans.currentPrice<=range.high;
    if (plans.shortPlanInvalid) reasons.limiting.push({code:"short_plan_invalidated",text:"short_plan_invalidated"});
    const shortBlocked=marketModifiers.entryPaused || marketModifiers.calendarUnavailable || marketModifiers.marketUnavailable || marketModifiers.shock;
    const shortQualified=!profile.isETF && technical.horizon==="daily" && smc.bearish_confirmed && direction<=gates.shortSell.direction && confirmation>=gates.shortSell.confirmation && !technical.dataQuality?.entryMissing?.length && risk<=gates.shortSell.riskMaximum && evidence.bearishMomentum && evidence.bearishConfirmation && !shortBlocked && inRange(plans.shortEntryRange) && !plans.shortPlanInvalid && plans.shortRewardRisk>=engine.config.execution.rewardRisk.short_sell;
    if (shortQualified) return result("short_sell","confirmed_short_entry",{alsoSupportsLongExit:true});
    if (confirmedBreakdown(technical,plans.currentPrice) || smc.bearish_confirmed && direction<=gates.sell.direction && confirmation>=gates.sell.confirmation) return result("sell","confirmed_long_exit");
    const reduce=["IN_REDUCE_ZONE","BEYOND_REDUCE_ZONE"].includes(state) || inRange(plans.reduceRange);
    const weakening=evidence.weakeningBars>=engine.config.indicators.smc.momentumRepairBars && (evidence.independentWeakening || smc.resistance_failure_bars>=engine.config.indicators.smc.repairBars || (smc.sweeps || []).some((item)=>item.sign<0));
    if (reduce && weakening) return result("trim","early_upside_exhaustion");
    if (state!=="IN_OPPORTUNITY_ZONE") return result("hold",reduce?"reduce_candidate_without_exhaustion":plans.opportunityRange?"price_outside_entry":"waiting_valid_landscape");
    if (technical.dataQuality?.entryMissing?.length) return result("hold","waiting_benchmark_confirmation");
    if (marketModifiers.marketUnavailable) return result("hold","waiting_market_context");
    if (marketModifiers.shock) return result("hold","market_shock_blocks_entry");
    if (profile.leveraged && (marketModifiers.entryPaused || marketModifiers.calendarUnavailable)) return result("hold",marketModifiers.entryPaused?"major_release_entry_pause":"waiting_event_calendar");
    const eventAdd=marketModifiers.confirmationAdd || 0;
    const common=plans.rewardRisk>=engine.config.execution.rewardRisk.buy && risk<=gates.buy.riskMaximum && exhaustionScore>-engine.config.execution.newEntryExhaustionMaximum;
    const buy=common && smc.bullish_confirmed && direction>=gates.buy.direction+(pg.buyDirection || 0) && confirmation>=gates.buy.confirmation+(pg.buyConfirmation || 0)+eventAdd;
    const strong=buy && !marketModifiers.calendarUnavailable && !marketModifiers.majorEventWindow && !marketModifiers.releaseDataPending && !marketModifiers.earningsNear && plans.rewardRisk>=engine.config.execution.rewardRisk.strong_buy && direction>=gates.strongBuy.direction+(pg.strongBuyDirection || 0) && confirmation>=gates.strongBuy.confirmation+(pg.strongBuyConfirmation || 0)+eventAdd && risk<=gates.strongBuy.riskMaximum && exhaustionScore>-gates.strongBuy.bullishExhaustionMaximum;
    if (strong) return result("strong_buy","strong_confirmed_right_entry");
    if (buy) return result("buy",smc.bullish_retest?"confirmed_pullback_entry":"confirmed_continuation_entry");
    const highRisk=profile.highRiskRepair===true;
    const required=highRisk?engine.config.indicators.smc.highRiskRepairBars:engine.config.indicators.smc.repairBars;
    const early=smc.support_repair_bars>=required && evidence.improvingBars>=engine.config.indicators.smc.momentumRepairBars && evidence.independentImprovement;
    if (!profile.leveraged && early && risk<=gates.accumulate.riskMaximum && plans.rewardRisk>=engine.config.execution.rewardRisk.accumulate && confirmation>=engine.config.actionPolicy.earlyConfirmation+eventAdd) return result("accumulate","early_support_repair",{repairBarsRequired:required});
    return result("hold",profile.leveraged?"waiting_strict_right_confirmation":"waiting_entry_confirmation");
  }

  function build({price,horizon,action="hold",technical={},landscape=null,context={}}={}) {
    const base=landscape || buildLandscape({price,horizon,technical,context});
    return {priceLandscape:{...base.priceLandscape,currentPrice:roundPrice(price)},executionIntent:executionIntent(action),priceState:base.priceState,actionFamily:action==="short_sell"?"short_entry":base.actionFamily,landscapeQuality:base.landscapeQuality,debug:{...base.debug,invalidationInputs:{source:action==="short_sell"?"independent_short_structure":"known_long_structure"}}};
  }

  engine.execution = Object.freeze({
    buildLandscape, build, decisionForPriceState, executionIntent, rangeDistance, priceStateFor, actionFamilyForState,
    PRICE_STATES, ACTION_FAMILIES, confirmedBreakdown, riskBoundary, shortPlan,
  });
}(globalThis));
