(function createHorizonModelV2(root) {
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

  function reasons(technical, exhaustion, marketModifiers, underlyingContext = null, finalDecision = null) {
    const etfReason = underlyingContext?.alignment === "supporting" ? "Inverse underlying direction supports the ETF technical setup."
      : underlyingContext?.alignment === "limiting" ? "Underlying direction conflicts with the inverse ETF technical setup." : null;
    return {
      supporting: unique([...(finalDecision?.reasons?.supporting || []), ...technical.supporting, ...exhaustion.supporting, ...(etfReason && underlyingContext.alignment === "supporting" ? [etfReason] : [])]).slice(0, 5),
      limiting: unique([...(finalDecision?.reasons?.limiting || []), ...technical.limiting, ...exhaustion.limiting, ...(marketModifiers.reasons || []), ...(etfReason && underlyingContext.alignment === "limiting" ? [etfReason] : [])]).slice(0, 5),
    };
  }

  function underlyingDirection({ technicalFeatures, horizon, price, profile }) {
    if (!profile?.isETF || profile.direction !== "inverse" || !technicalFeatures || !Number.isFinite(price)) return null;
    const neutralProfile = { effectiveModifiers: { confirmationWeights: {}, benchmarkWeights: { spy: 0.5, qqq: 0.5 } } };
    const value = engine.technical.evaluate(technicalFeatures, horizon, price, neutralProfile);
    return Number.isFinite(value.directionScore) ? value.directionScore : null;
  }

  function decide({ ticker, horizon, price, technicalFeatures, market, profile, metadata, underlyingTechnicalFeatures, underlyingPrice, language = "en", modelOptions = {} }) {
    const horizonProfile = engine.profile.forHorizon(profile, horizon);
    let technical = engine.technical.evaluate(technicalFeatures, horizon, price, horizonProfile);
    const underlying = engine.etfProfile.underlyingContext({
      profile: horizonProfile,
      ownDirection: technical.directionScore,
      underlyingDirection: underlyingDirection({ technicalFeatures: underlyingTechnicalFeatures, horizon, price: underlyingPrice, profile: horizonProfile }),
    });
    if (underlying.available && underlying.adjustment) {
      technical = {
        ...technical,
        confirmationScore: clamp(technical.confirmationScore + underlying.adjustment, 0, 100),
        confirmationComponents: { ...technical.confirmationComponents, inverseUnderlying: underlying },
        signalAgreement: clamp(technical.signalAgreement + underlying.adjustment * 0.35, 0, 100),
      };
    }
    if (metadata?.quoteStale || metadata?.quoteUnavailable || !Number.isFinite(price)) {
      technical={...technical,dataQuality:{...technical.dataQuality,score:0,missingCore:[...(technical.dataQuality?.missingCore || []),"untrusted_quote"]}};
    }
    const marketModifiers = engine.market.forHorizon(market, horizon, horizonProfile, technical);
    const exhaustion = engine.exhaustion.evaluate({ technical, market, profile: horizonProfile, horizon });
    const riskAdjustment = adjustedRisk(technical, marketModifiers, horizonProfile);
    const risk = Math.round(riskAdjustment.score);
    // Structural clusters are selected with the already-computed Technical,
    // Market and Profile context. The resulting Price State is therefore a
    // core final-decision input, not a post-hoc execution decoration.
    const rawLandscape = engine.execution.buildLandscape({
      price, horizon, technical,
      context: { risk, exhaustionScore: exhaustion.score, marketModifiers, profile: horizonProfile, },
    });
    const backgroundOnly = Boolean(horizonProfile.leveraged && horizon === "weekly");
    const familyDecision = backgroundOnly ? { action:"hold",actionFamily:"background",priceState:rawLandscape.priceState,reasonCode:"leveraged_weekly_background",reasons:{supporting:[],limiting:[{code:"leveraged_weekly_background",text:"leveraged_weekly_background"}]},guardrails:[] } : engine.execution.decisionForPriceState({landscape:rawLandscape,technical,exhaustionScore:exhaustion.score,risk,marketModifiers,profile:horizonProfile});
    const actionBeforeStability=familyDecision.action;
    const materialChangeReasons=unique([...technical.materialSignals,...(marketModifiers.shock?["market_shock"]:[]),...(marketModifiers.entryPaused?["major_release_window"]:[])]);
    const stability=engine.stability.evaluate({ticker,horizon,candidateAction:familyDecision.action,actionFamily:familyDecision.actionFamily,materialChangeReasons,profile:horizonProfile,technical});
    const finalAction=stability.finalAction;
    const confidence=engine.confidence.calculate({action:finalAction,technical,marketModifiers,exhaustion,profile:horizonProfile,stability,finalDecision:familyDecision,landscapeQuality:rawLandscape.landscapeQuality});
    const execution = engine.execution.build({ price, horizon, action: finalAction, technical, landscape: rawLandscape, context: { risk, exhaustionScore: exhaustion.score, marketModifiers, profile: horizonProfile } });
    const guardrails = unique([...(rawLandscape.debug?.guardrails || []), ...(familyDecision.guardrails || []), ...(execution.debug?.guardrails || [])]);
    return {
      horizon,
      backgroundOnly, signalAsOf: technical.signalAsOf, quoteAsOf: metadata?.asOf || metadata?.as_of || null,
      action: finalAction,
      actionLabel: localized(finalAction, language),
      confidence: confidence.score,
      executionIntent: backgroundOnly ? "background" : execution.executionIntent,
      priceLandscape: execution.priceLandscape,
      states: {
        direction: { score: technical.directionScore, label: directionLabel(technical.directionScore) },
        confirmation: { score: technical.confirmationScore, label: confirmationLabel(technical.confirmationScore) },
        risk: { score: risk, label: riskLabel(risk) },
        priceOpportunity: { score: technical.priceOpportunityScore, label: opportunityLabel(technical.priceOpportunityScore) },
        exhaustion: { score: exhaustion.score, label: exhaustion.label },
      },
      market: { ...market, horizonModifiers: marketModifiers },
      profile: horizonProfile,
      reasons: reasons(technical, exhaustion, marketModifiers, underlying, familyDecision),
      debug: {
        directionScore: technical.directionScore, directionComponents: technical.directionComponents,
        confirmationScore: technical.confirmationScore, confirmationComponents: technical.confirmationComponents,
        riskScore: risk, riskComponents: { ...technical.riskComponents, marketRisk: marketModifiers.riskAdd, riskAdjustment: Object.fromEntries(Object.entries(riskAdjustment).map(([key, value]) => [key, Number.isFinite(value) ? Math.round(value * 100) / 100 : value])) },
        priceOpportunityScore: technical.priceOpportunityScore, priceComponents: technical.priceComponents,
        exhaustionScore: exhaustion.score, exhaustionComponents: exhaustion.components,
        marketRegime: market.regime, marketModifiers,
        appliedTraits: horizonProfile.companyTraits || [], appliedModifiers: horizonProfile.appliedModifiers || [], effectiveProfileModifiers: horizonProfile.effectiveModifiers,
        etfUnderlying: underlying,
        candidateAction: familyDecision.action, actionBeforeStability, finalAction,
        priceState: rawLandscape.priceState, actionFamily: familyDecision.actionFamily, landscapeQuality: rawLandscape.landscapeQuality, finalDecision: familyDecision,
        stability, guardrails, materialChangeReasons,
        modelVersion: engine.config.version, pathVersion: engine.config.version, policyFamily: `${horizonProfile.isETF ? "etf" : "stock"}_${horizon}`,
        confidenceComponents: confidence, priceLandscapeInputs: execution.debug?.priceLandscapeInputs || {}, invalidationInputs: execution.debug?.invalidationInputs || {},
        dataQuality: technical.dataQuality,
      },
    };
  }

  engine.horizonV2 = Object.freeze({ decide });
}(globalThis));
