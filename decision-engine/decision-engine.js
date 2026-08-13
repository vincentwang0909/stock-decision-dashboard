(function createDecisionEngine(root) {
  "use strict";

  const engine = root.DecisionEngine || (root.DecisionEngine = {});
  const stateLabel = (score, positive, negative, neutral = "neutral") => score >= 0.25 ? positive : score <= -0.25 ? negative : neutral;
  const localized = (action, language) => engine.config.actionLabels[action]?.[language] || engine.config.actionLabels.hold[language];

  function actionFor({ edge, confirmation, risk, opportunity, coverage, requiresExtraConfirmation }) {
    if (coverage < 0.35) return "avoid";
    if (edge <= -0.55 && confirmation >= 0.45) return "sell";
    if (edge <= -0.22 || risk >= 0.78) return edge < -0.05 ? "trim" : "avoid";
    if (requiresExtraConfirmation && confirmation < 0.72) return edge > 0.18 ? "accumulate" : "hold";
    if (edge >= 0.72 && confirmation >= 0.78 && risk <= 0.42 && opportunity >= 0.08) return "strong_buy";
    if (edge >= 0.43 && confirmation >= 0.58 && risk <= 0.62) return "buy";
    if (edge >= 0.16 && risk <= 0.72) return "accumulate";
    return "hold";
  }

  function decideHorizon({ ticker, horizon, price, technicalFeatures, marketContext, classification, metadata, language = "en" }) {
    const technical = engine.technical.evaluate(technicalFeatures, horizon);
    const market = engine.market.evaluate(marketContext, metadata);
    const companyProfile = engine.companyProfile.build(classification);
    const exhaustion = engine.exhaustion.evaluate(technical);
    const edge = Math.max(-1, Math.min(1, technical.direction + market.directionAdjustment - exhaustion.score * 0.22));
    const risk = Math.max(0, Math.min(1, technical.risk + market.riskAdjustment + (companyProfile.executionProfile.requiresExtraConfirmation ? 0.08 : 0)));
    const action = actionFor({ edge, confirmation: technical.confirmation, risk, opportunity: technical.opportunity, coverage: technical.coverage, requiresExtraConfirmation: companyProfile.executionProfile.requiresExtraConfirmation });
    const confidence = engine.confidence.calculate({ technical, market, companyProfile });
    const execution = engine.execution.build({ price, atr: technical.atr, horizon, direction: edge, action });
    const stability = engine.stability.evaluate({ ticker, horizon, action, edge, confidence });
    return {
      horizon,
      action,
      actionLabel: localized(action, language),
      confidence,
      ...execution,
      states: {
        direction: { score: Math.round(edge * 100), label: stateLabel(edge, "bullish", "bearish") },
        confirmation: { score: Math.round(technical.confirmation * 100), label: technical.confirmation >= 0.7 ? "strong" : technical.confirmation >= 0.45 ? "moderate" : "weak" },
        risk: { score: Math.round(risk * 100), label: risk >= 0.72 ? "high" : risk <= 0.38 ? "low" : "normal" },
        priceOpportunity: { score: Math.round(technical.opportunity * 100), label: technical.opportunity >= 0.3 ? "favorable" : technical.opportunity <= -0.3 ? "extended" : "fair" },
        exhaustion: { score: Math.round(exhaustion.score * 100), label: exhaustion.label },
      },
      market,
      companyProfile,
      reasons: {
        supporting: [...technical.supporting, ...exhaustion.supporting].slice(0, 4),
        limiting: [...technical.limiting, ...exhaustion.limiting, ...market.reasons].slice(0, 4),
      },
      debug: { edge, technicalCoverage: technical.coverage, stability },
    };
  }

  function decide(input = {}) {
    const horizons = Object.fromEntries(["short", "mid", "long"].map((horizon) => [horizon, decideHorizon({ ...input, horizon })]));
    return { version: engine.config.version, ticker: input.ticker, horizons, generatedAt: new Date().toISOString() };
  }

  engine.decide = decide;
  engine.actionLabel = localized;
}(globalThis));
