(function createDecisionEngine(root) {
  "use strict";

  const engine = root.DecisionEngine || (root.DecisionEngine = {});
  const localized = (action, language) => engine.config.actionLabels[action]?.[language] || engine.config.actionLabels[action]?.en || engine.config.actionLabels.hold.en;

  // One production release, with independently evaluated horizon/asset policies.
  // There is no version switch or ordinary-stock Short fallback.
  function decideHorizon(input) {
    if (input.horizon === "short" && !input.profile?.isETF) {
      const profile = engine.profile.forHorizon(input.profile, input.horizon);
      const technical = engine.technical.evaluate(input.technicalFeatures, input.horizon, input.price, profile);
      return engine.shortV2.decide({ ...input, technical, profile });
    }
    return engine.horizonV2.decide(input);
  }

  function decide(input = {}) {
    const profile = engine.profile.build(input.classification || {}, input.ticker);
    const market = engine.market.evaluate(input.marketContext || {}, input.metadata || {});
    const horizons = Object.fromEntries(["short", "mid", "long"].map((horizon) => [horizon, decideHorizon({ ...input, horizon, market, profile })]));
    return { version: engine.config.version, ticker: input.ticker, horizons, generatedAt: new Date().toISOString() };
  }

  engine.decide = decide;
  engine.decideHorizon = decideHorizon;
  engine.actionLabel = localized;
}(globalThis));
