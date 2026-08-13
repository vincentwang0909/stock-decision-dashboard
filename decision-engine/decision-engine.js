(function createDecisionEngine(root) {
  "use strict";

  const engine = root.DecisionEngine || (root.DecisionEngine = {});
  const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
  const localized = (action, language) => engine.config.actionLabels[action]?.[language] || engine.config.actionLabels[action]?.en || engine.config.actionLabels.hold.en;
  const unique = (values) => [...new Set(values.filter(Boolean))];

  function directionLabel(score) {
    return score >= 65 ? "Strong Bullish" : score >= 25 ? "Bullish" : score <= -65 ? "Strong Bearish" : score <= -25 ? "Bearish" : "Neutral";
  }

  function confirmationLabel(score) {
    return score >= 75 ? "Strong" : score >= 50 ? "Moderate" : "Weak";
  }

  function opportunityLabel(score) {
    return score >= 34 ? "Favorable" : score <= -34 ? "Extended" : "Fair";
  }

  function riskLabel(score) {
    return engine.config.risk.labels.find(([limit]) => score < limit)?.[1] || "extreme";
  }

  function adjustedRisk(technical, marketModifiers, profile) {
    const profileModifiers = profile.effectiveModifiers || {};
    const volatility = technical.riskComponents?.volatility || 0;
    const normalAtrTolerance = profileModifiers.normalAtrTolerance || 1;
    // A high-beta/static volatility profile can soften normal volatility only;
    // it does not erase independently corroborated extreme-risk overrides.
    const toleranceOffset = volatility * Math.max(0, 1 - 1 / normalAtrTolerance) * 0.62;
    const baseRisk = Math.max(0, (technical.riskScore || 0) - toleranceOffset);
    const profileRisk = baseRisk * (profileModifiers.riskSensitivity || 1);
    const components = technical.riskComponents || {};
    const extremeFloor = components.extremeOverride ? technical.riskScore || 0 : 0;
    const marketRiskAdd = marketModifiers.riskAdd || 0;
    return {
      score: clamp(Math.max(profileRisk, extremeFloor) + marketRiskAdd, 0, 100),
      baseRisk, profileRisk, toleranceOffset, marketRiskAdd, extremeFloor,
    };
  }

  function opportunityEdge(technical, exhaustion, risk) {
    const config = engine.config.edge;
    const direction = technical.directionScore || 0;
    const confirmation = technical.confirmationScore || 0;
    const directional = (direction / 100) * (config.directionTrustFloor + (confirmation / 100) * config.directionTrustConfirmationWeight);
    const price = (technical.priceOpportunityScore || 0) / 100 * config.priceOpportunityWeight;
    // Exhaustion is deliberately nonlinear only around meaningful extremes.
    const exhaustionMagnitude = Math.max(0, Math.abs(exhaustion.score || 0) - 22) / 78;
    const contrarian = Math.sign(exhaustion.score || 0) * exhaustionMagnitude * engine.config.exhaustion.contrarianEdgeWeight;
    const raw = directional + price + contrarian;
    const excessRisk = clamp(((risk - config.riskPenaltyStart) / Math.max(1, 100 - config.riskPenaltyStart)), 0, 1);
    const riskPenalty = raw > 0 ? (excessRisk ** config.riskPenaltyPower) * config.riskPenaltyMax : 0;
    return {
      directional: directional * 100, price: price * 100, contrarian: contrarian * 100,
      rawEdge: clamp(raw * 100, -100, 100), adjustedEdge: clamp((raw - riskPenalty) * 100, -100, 100), riskPenalty: riskPenalty * 100,
    };
  }

  function actionFor({ edge, technical, exhaustion, risk, marketModifiers, profile }) {
    const policy = engine.config.actionPolicy;
    const gates = policy.gates;
    const direction = technical.directionScore || 0;
    const confirmation = technical.confirmationScore || 0;
    const opportunity = technical.priceOpportunityScore || 0;
    const dataQuality = technical.dataQuality?.score || 0;
    const guardrails = [];
    if (dataQuality < policy.minimumDataQuality) return { action: "avoid", guardrails: ["core_technical_data_incomplete"] };
    if (risk >= gates.neutralAvoidRisk && Math.abs(direction) < 45) return { action: "avoid", guardrails: ["extreme_risk_without_directional_edge"] };
    if (risk >= gates.extremeRisk && Math.abs(direction) < 62) return { action: "avoid", guardrails: ["risk_extreme_guardrail"] };
    // A bearish direction is allowed to remain bearish while a sufficiently
    // repaired washout becomes an Accumulate.  This is intentionally gated by
    // structural opportunity and data quality, never by RSI alone.
    if (direction <= -25 && exhaustion.score >= gates.bearishContrarianAccumulate.exhaustion
      && opportunity >= gates.bearishContrarianAccumulate.priceOpportunity
      && dataQuality >= gates.bearishContrarianAccumulate.dataQuality
      && risk <= gates.accumulate.riskMaximum) {
      return { action: "accumulate", guardrails: ["bearish_exhaustion_contrarian_entry"] };
    }
    if (direction <= gates.sell.direction && confirmation >= gates.sell.confirmation) {
      return { action: "sell", guardrails };
    }
    if (exhaustion.score <= -60 && direction >= 18) {
      return { action: (risk >= 50 || opportunity <= -18) ? "trim" : "hold", guardrails: ["bullish_exhaustion_guardrail"] };
    }
    const opportunityGate = gates.strongBuy.priceOpportunity * (profile.effectiveModifiers?.strongBuyOpportunity || 1);
    const strongBuy = edge >= policy.territories.strongBuy
      && direction >= gates.strongBuy.direction && confirmation >= gates.strongBuy.confirmation
      && opportunity >= opportunityGate && risk <= gates.strongBuy.riskMaximum
      && exhaustion.score > -gates.strongBuy.bullishExhaustionMaximum && marketModifiers.regime !== "shock";
    if (strongBuy) return { action: "strong_buy", guardrails };
    if (marketModifiers.regime === "shock" && edge >= policy.territories.strongBuy) guardrails.push("market_shock_blocks_strong_buy");
    if (edge >= policy.territories.buy && direction >= gates.buy.direction && confirmation >= gates.buy.confirmation && risk <= gates.buy.riskMaximum) return { action: "buy", guardrails };
    if (edge >= policy.territories.accumulate && risk <= gates.accumulate.riskMaximum) return { action: "accumulate", guardrails };
    if (edge <= policy.territories.sell && confirmation >= gates.sell.confirmation) return { action: "sell", guardrails };
    if (edge <= policy.territories.trim || (risk >= 72 && direction <= 15)) return { action: edge < policy.territories.trim ? "trim" : "avoid", guardrails };
    return { action: "hold", guardrails };
  }

  function applyConfidenceGate(action, confidence) {
    const minimum = engine.config.actionPolicy.gates.confidenceMinimum;
    if (action === "strong_buy" && confidence < minimum.strong_buy) return "buy";
    if (action === "buy" && confidence < minimum.buy) return "accumulate";
    if (action === "accumulate" && confidence < minimum.accumulate) return "hold";
    return action;
  }

  function reasons(technical, exhaustion, marketModifiers) {
    return {
      supporting: unique([...technical.supporting, ...exhaustion.supporting]).slice(0, 5),
      limiting: unique([...technical.limiting, ...exhaustion.limiting, ...(marketModifiers.reasons || [])]).slice(0, 5),
    };
  }

  function decideHorizon({ ticker, horizon, price, technicalFeatures, market, companyProfile, metadata, language = "en" }) {
    const technical = engine.technical.evaluate(technicalFeatures, horizon, price, companyProfile);
    const marketModifiers = engine.market.forHorizon(market, horizon, companyProfile);
    const exhaustion = engine.exhaustion.evaluate({ technical, market, companyProfile, horizon });
    const riskAdjustment = adjustedRisk(technical, marketModifiers, companyProfile);
    const risk = Math.round(riskAdjustment.score);
    const edgeBeforeMarket = opportunityEdge(technical, exhaustion, riskAdjustment.profileRisk);
    const edge = opportunityEdge(technical, exhaustion, risk);
    const candidate = actionFor({ edge: edge.adjustedEdge, technical, exhaustion, risk, marketModifiers, profile: companyProfile });
    const provisionalConfidence = engine.confidence.calculate({ action: candidate.action, edge: edge.adjustedEdge, technical, marketModifiers, exhaustion, companyProfile });
    let actionBeforeStability = applyConfidenceGate(candidate.action, provisionalConfidence.score);
    let execution = engine.execution.build({ price, horizon, action: actionBeforeStability, technical });
    const guardrails = [...candidate.guardrails, ...(execution.debug?.guardrails || [])];
    if (execution.actionCorrection && execution.actionCorrection !== actionBeforeStability) {
      actionBeforeStability = execution.actionCorrection;
      guardrails.push("range_action_consistency_correction");
      execution = engine.execution.build({ price, horizon, action: actionBeforeStability, technical });
    }
    const materialChangeReasons = unique([
      ...technical.materialSignals,
      ...(marketModifiers.shock ? ["market_shock"] : []),
    ]);
    const stability = engine.stability.evaluate({ ticker, horizon, candidateAction: actionBeforeStability, edge: edge.adjustedEdge, confidence: provisionalConfidence.score, materialChangeReasons, profile: companyProfile, technical });
    const finalAction = stability.finalAction;
    if (finalAction !== actionBeforeStability) execution = engine.execution.build({ price, horizon, action: finalAction, technical });
    const confidence = engine.confidence.calculate({ action: finalAction, edge: edge.adjustedEdge, technical, marketModifiers, exhaustion, companyProfile, stability });
    return {
      horizon,
      action: finalAction,
      actionLabel: localized(finalAction, language),
      confidence: confidence.score,
      executionIntent: execution.executionIntent,
      recommendedRange: execution.recommendedRange,
      targetRange: execution.targetRange,
      invalidation: execution.invalidation,
      states: {
        direction: { score: technical.directionScore, label: directionLabel(technical.directionScore) },
        confirmation: { score: technical.confirmationScore, label: confirmationLabel(technical.confirmationScore) },
        risk: { score: risk, label: riskLabel(risk) },
        priceOpportunity: { score: technical.priceOpportunityScore, label: opportunityLabel(technical.priceOpportunityScore) },
        exhaustion: { score: exhaustion.score, label: exhaustion.label },
      },
      market: { ...market, horizonModifiers: marketModifiers },
      companyProfile,
      reasons: reasons(technical, exhaustion, marketModifiers),
      debug: {
        directionScore: technical.directionScore, directionComponents: technical.directionComponents,
        confirmationScore: technical.confirmationScore, confirmationComponents: technical.confirmationComponents,
        riskScore: risk, riskComponents: { ...technical.riskComponents, marketRisk: marketModifiers.riskAdd, riskAdjustment: Object.fromEntries(Object.entries(riskAdjustment).map(([key, value]) => [key, Number.isFinite(value) ? Math.round(value * 100) / 100 : value])) },
        priceOpportunityScore: technical.priceOpportunityScore, priceComponents: technical.priceComponents,
        exhaustionScore: exhaustion.score, exhaustionComponents: exhaustion.components,
        marketRegime: market.regime, marketModifiers,
        appliedTags: companyProfile.tags, effectiveProfileModifiers: companyProfile.effectiveModifiers,
        rawEdge: Math.round(edge.rawEdge), adjustedEdge: Math.round(edge.adjustedEdge), edgeBeforeMarket: Math.round(edgeBeforeMarket.adjustedEdge), edgeAfterMarket: Math.round(edge.adjustedEdge), directionalOpportunity: Math.round(edge.directional), priceOpportunityContribution: Math.round(edge.price), contrarianContribution: Math.round(edge.contrarian), riskPenalty: Math.round(edge.riskPenalty),
        candidateAction: candidate.action, actionBeforeStability, finalAction,
        guardrails: unique([...guardrails, ...(execution.debug?.guardrails || [])]), materialChangeReasons,
        confidenceComponents: confidence, recommendedRangeInputs: execution.debug?.recommendedRangeInputs || {}, targetInputs: execution.debug?.targetInputs || {}, invalidationInputs: execution.debug?.invalidationInputs || {},
        dataQuality: technical.dataQuality,
      },
    };
  }

  function decide(input = {}) {
    const companyProfile = engine.companyProfile.build(input.classification || {}, input.ticker);
    const market = engine.market.evaluate(input.marketContext || {}, input.metadata || {});
    const horizons = Object.fromEntries(["short", "mid", "long"].map((horizon) => [horizon, decideHorizon({ ...input, horizon, market, companyProfile })]));
    return { version: engine.config.version, ticker: input.ticker, horizons, generatedAt: new Date().toISOString() };
  }

  engine.decide = decide;
  engine.actionLabel = localized;
}(globalThis));
