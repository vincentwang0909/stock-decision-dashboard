(function configureDecisionEngine(root) {
  "use strict";

  const engine = root.DecisionEngine || (root.DecisionEngine = {});
  engine.config = Object.freeze({
    version: "decision-engine-v1-skeleton",
    horizons: Object.freeze({
      short: Object.freeze({ label: "1–30 days", technicalKey: "short", rangeAtr: 1.0, targetAtr: 2.0 }),
      mid: Object.freeze({ label: "1–6 months", technicalKey: "medium", rangeAtr: 1.75, targetAtr: 3.5 }),
      long: Object.freeze({ label: "> 6 months", technicalKey: "long", rangeAtr: 2.5, targetAtr: 5.0 }),
    }),
    actions: Object.freeze(["strong_buy", "buy", "accumulate", "hold", "trim", "sell", "avoid"]),
    actionLabels: Object.freeze({
      strong_buy: { en: "Strong Buy", zh: "强力买入" },
      buy: { en: "Buy", zh: "买入" },
      accumulate: { en: "Accumulate", zh: "逐步加仓" },
      hold: { en: "Hold", zh: "持有" },
      trim: { en: "Trim", zh: "减仓" },
      sell: { en: "Sell", zh: "卖出" },
      avoid: { en: "Avoid", zh: "回避" },
    }),
    stabilityCacheLimit: 300,
  });
}(globalThis));
