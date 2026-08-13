(function createCompanyProfileEngine(root) {
  "use strict";

  const engine = root.DecisionEngine || (root.DecisionEngine = {});
  function build(classification = {}) {
    const tags = [...new Set(classification.tags || classification.top_tags || [])];
    const tagSet = new Set(tags);
    const defensive = tagSet.has("Defensive") || tagSet.has("MegaCap") || tagSet.has("CashCow");
    const speculative = ["Speculative", "NewlyListed", "IPO", "Meme", "HighVolatility"].some((tag) => tagSet.has(tag));
    const rateSensitive = tagSet.has("InterestRateSensitive") || tagSet.has("REIT");
    return {
      category: classification.category || "Unclassified",
      categoryKey: classification.category_key || classification.category || "other",
      tags,
      scoringProfile: classification.scoring_profile || "generic",
      executionProfile: {
        riskTolerance: speculative ? "low" : defensive ? "normal" : "standard",
        requiresExtraConfirmation: speculative,
        rateSensitive,
      },
    };
  }
  engine.companyProfile = Object.freeze({ build });
}(globalThis));
