(function createCompanyProfileEngine(root) {
  "use strict";

  const engine = root.DecisionEngine || (root.DecisionEngine = {});
  const reviewCache = new Map();
  const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
  const unique = (values) => [...new Set((values || []).filter(Boolean))];
  function safeDate(value) {
    const date = value ? new Date(value) : null;
    return date && !Number.isNaN(date.getTime()) ? date : null;
  }

  function withinReviewCadence(lastReview, reviewDays, now) {
    const prior = safeDate(lastReview);
    return Boolean(prior && (now.getTime() - prior.getTime()) < reviewDays * 86400000);
  }

  function blankModifiers() {
    return {
      directionWeights: {}, confirmationWeights: {}, riskSensitivity: 1, exhaustionSensitivity: 1, marketSensitivity: 1,
      normalAtrTolerance: 1, strongBuyOpportunity: 1, rateSensitivity: 1, eventSensitivity: 1, longStability: 1,
      benchmarkWeights: { spy: 0.5, qqq: 0.5 },
    };
  }

  function addWeightDeltas(target, source = {}) {
    Object.entries(source).forEach(([key, delta]) => { target[key] = (target[key] || 0) + Number(delta || 0); });
  }

  function capMultiplier(value, special = false) {
    const [low, high] = engine.config.profile.modifierCaps[special ? "special" : "normal"];
    return clamp(value, low, high);
  }

  function effectiveModifiers(tags = []) {
    const config = engine.config.profile.tagModifiers;
    const aggregate = blankModifiers();
    const applied = [];
    tags.forEach((tag) => {
      const modifier = config[tag];
      if (!modifier) return;
      applied.push(tag);
      addWeightDeltas(aggregate.directionWeights, modifier.directionWeights);
      addWeightDeltas(aggregate.confirmationWeights, modifier.confirmationWeights);
      ["riskSensitivity", "exhaustionSensitivity", "marketSensitivity", "normalAtrTolerance", "strongBuyOpportunity", "rateSensitivity", "eventSensitivity", "longStability"].forEach((key) => {
        if (Number.isFinite(modifier[key])) aggregate[key] += modifier[key];
      });
    });
    Object.keys(aggregate.directionWeights).forEach((key) => { aggregate.directionWeights[key] = capMultiplier(1 + aggregate.directionWeights[key]) - 1; });
    Object.keys(aggregate.confirmationWeights).forEach((key) => { aggregate.confirmationWeights[key] = capMultiplier(1 + aggregate.confirmationWeights[key]) - 1; });
    ["riskSensitivity", "exhaustionSensitivity", "marketSensitivity", "normalAtrTolerance", "strongBuyOpportunity", "rateSensitivity", "eventSensitivity", "longStability"].forEach((key) => {
      aggregate[key] = capMultiplier(aggregate[key], key === "marketSensitivity" || key === "exhaustionSensitivity");
    });
    return { modifiers: aggregate, appliedModifierTags: applied };
  }

  function normalizeClassificationTags(classification = {}) {
    return unique([
      ...(classification.tags || classification.top_tags || []),
      ...(classification.staticTags || classification.static_tags || []),
    ]);
  }

  function cachedProfileState(ticker) {
    return reviewCache.get(String(ticker || "").toUpperCase()) || { currentDynamicTags: [], candidateTags: [], lifecycleTag: null, profileConfidence: null, lastProfileReview: null };
  }

  // Deliberately review-driven: this function is only called by an explicit
  // 3–6 month profile review workflow, never by quote refresh. A new tag is a
  // candidate on its first qualifying review and becomes active only after the
  // configured consecutive reviews have agreed.
  function review({ ticker, observedDynamicTags = [], lifecycleTag = null, profileConfidence = null, now = new Date() } = {}) {
    const key = String(ticker || "").toUpperCase();
    if (!key) return cachedProfileState(key);
    const prior = cachedProfileState(key);
    const config = engine.config.profile.review;
    if (withinReviewCadence(prior.lastProfileReview, config.dynamicReviewDays, now)) return prior;
    const observed = unique(observedDynamicTags).filter((tag) => engine.config.profile.dynamicTagNames.includes(tag));
    const candidateCounts = { ...(prior.candidateCounts || {}) };
    Object.keys(candidateCounts).forEach((tag) => { candidateCounts[tag] = observed.includes(tag) ? candidateCounts[tag] + 1 : 0; });
    observed.forEach((tag) => { candidateCounts[tag] = (candidateCounts[tag] || 0) + 1; });
    const currentDynamicTags = unique([
      ...(prior.currentDynamicTags || []).filter((tag) => observed.includes(tag)),
      ...observed.filter((tag) => candidateCounts[tag] >= config.requiredConsecutiveReviews),
    ]);
    const candidateTags = observed.filter((tag) => !currentDynamicTags.includes(tag));
    const lifecycleCanReview = !withinReviewCadence(prior.lastLifecycleReview, config.lifecycleReviewDays, now);
    const validLifecycle = engine.config.profile.lifecycleTagNames.includes(lifecycleTag) ? lifecycleTag : prior.lifecycleTag || null;
    const next = {
      currentDynamicTags,
      candidateTags,
      candidateCounts,
      lifecycleTag: lifecycleCanReview ? validLifecycle : prior.lifecycleTag || null,
      profileConfidence: Number.isFinite(profileConfidence) ? clamp(profileConfidence, 0, 1) : prior.profileConfidence,
      lastProfileReview: now.toISOString(),
      lastLifecycleReview: lifecycleCanReview ? now.toISOString() : prior.lastLifecycleReview || null,
    };
    reviewCache.set(key, next);
    while (reviewCache.size > config.cacheLimit) reviewCache.delete(reviewCache.keys().next().value);
    return next;
  }

  function build(classification = {}, ticker = "") {
    const sourceTags = normalizeClassificationTags(classification);
    const sourceDynamic = unique(classification.dynamicTags || classification.dynamic_tags || sourceTags.filter((tag) => engine.config.profile.dynamicTagNames.includes(tag)));
    const sourceLifecycle = classification.lifecycleTag || classification.lifecycle_tag || sourceTags.find((tag) => engine.config.profile.lifecycleTagNames.includes(tag)) || null;
    const state = cachedProfileState(ticker);
    const staticTags = sourceTags.filter((tag) => !engine.config.profile.dynamicTagNames.includes(tag) && !engine.config.profile.lifecycleTagNames.includes(tag));
    const dynamicTags = unique([...(state.currentDynamicTags || []), ...sourceDynamic]);
    const lifecycleTag = state.lifecycleTag || sourceLifecycle;
    const allTags = unique([...staticTags, ...dynamicTags, lifecycleTag]);
    const { modifiers, appliedModifierTags } = effectiveModifiers(allTags);
    return {
      category: classification.category || "Unclassified",
      categoryKey: classification.category_key || classification.category || "other",
      scoringProfile: classification.scoring_profile || "generic",
      staticTags,
      dynamicTags,
      lifecycleTag,
      candidateTags: state.candidateTags || [],
      tags: allTags,
      profileConfidence: Number.isFinite(classification.profileConfidence) ? clamp(classification.profileConfidence, 0, 1) : Number.isFinite(classification.profile_confidence) ? clamp(classification.profile_confidence, 0, 1) : Number.isFinite(state.profileConfidence) ? state.profileConfidence : allTags.length ? 0.76 : 0.48,
      lastProfileReview: state.lastProfileReview || classification.lastProfileReview || classification.last_profile_review || null,
      effectiveModifiers: modifiers,
      appliedModifierTags,
    };
  }

  // Profile changes are supplied by a deliberate 3–6 / 6–12 month review
  // workflow. Quote refreshes invoke only build(), so a single price move can
  // neither create nor replace a Dynamic or Lifecycle tag.
  function reviewProfile(input = {}) {
    return review(input);
  }

  engine.companyProfile = Object.freeze({ build, review: reviewProfile, clearReviews: () => reviewCache.clear(), _reviewCache: reviewCache });
}(globalThis));
