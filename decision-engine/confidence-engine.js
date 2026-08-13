(function createConfidenceEngine(root) {
  "use strict";

  const engine = root.DecisionEngine || (root.DecisionEngine = {});
  function calculate({ technical, market, companyProfile }) {
    const dataCoverage = technical.coverage || 0;
    const agreement = Math.max(0, 1 - Math.abs(technical.direction - (technical.opportunity * 0.6)) / 1.6);
    const marketPenalty = market.riskAdjustment || 0;
    const profilePenalty = companyProfile.executionProfile.requiresExtraConfirmation ? 0.10 : 0;
    return Math.round(Math.max(0, Math.min(100, (dataCoverage * 55 + agreement * 35 + 10 - marketPenalty * 28 - profilePenalty * 100))));
  }
  engine.confidence = Object.freeze({ calculate });
}(globalThis));
