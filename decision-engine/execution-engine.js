(function createExecutionEngine(root) {
  "use strict";

  const engine = root.DecisionEngine || (root.DecisionEngine = {});
  const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
  const roundPrice = (value) => Number.isFinite(value) ? Math.round(value * 100) / 100 : null;
  const round = (value) => Number.isFinite(value) ? Math.round(value * 100) / 100 : null;
  const range = (low, high) => Number.isFinite(low) && Number.isFinite(high)
    ? { low: roundPrice(Math.min(low, high)), high: roundPrice(Math.max(low, high)) } : { low: null, high: null };
  const positiveAction = (action) => ["strong_buy", "buy", "accumulate"].includes(action);
  const negativeAction = (action) => ["trim", "sell"].includes(action);
  const executionIntent = (action) => ({ strong_buy: "enter", buy: "enter", accumulate: "add", hold: "hold", trim: "reduce", sell: "exit", avoid: "avoid" }[action] || "hold");

  function nearestLevel(levels, center, side, minimumDistance = 0) {
    const candidates = (levels || []).filter((level) => Number.isFinite(level.price)
      && (side === "above" ? level.price > center + minimumDistance : level.price < center - minimumDistance));
    return candidates.sort((left, right) => Math.abs(left.price - center) - Math.abs(right.price - center))[0] || null;
  }

  function build({ price, horizon, action, technical = {} } = {}) {
    const config = engine.config.horizons[horizon];
    const executionConfig = engine.config.execution;
    const atr = Number(technical.atr);
    const context = technical.executionContext || {};
    const support = context.support || null;
    const resistance = context.resistance || null;
    const levels = context.levels || [];
    const intent = executionIntent(action);
    if (!Number.isFinite(price) || !Number.isFinite(atr) || atr <= 0 || !config) {
      return {
        recommendedRange: range(null, null), targetRange: range(null, null), invalidation: null,
        executionIntent: intent, actionCorrection: null,
        debug: { recommendedRangeInputs: { reason: "price_or_atr_unavailable" }, targetInputs: {}, invalidationInputs: {}, guardrails: ["execution_data_unavailable"] },
      };
    }
    const supportDistance = support ? (price - support.center) / atr : null;
    const resistanceDistance = resistance ? (resistance.center - price) / atr : null;
    const withinEntryDistance = (distance, level) => Number.isFinite(distance) && level
      && distance >= -executionConfig.actionableRangeToleranceAtr
      && distance <= Math.min(executionConfig.staleRangeDistanceAtr, executionConfig.maxEntryCenterDistanceAtr[horizon])
      && Math.abs(level.center - price) / price <= executionConfig.maxEntryCenterDistancePct[horizon];
    const supportIsActionable = withinEntryDistance(supportDistance, support);
    const resistanceIsActionable = withinEntryDistance(resistanceDistance, resistance);
    let center = price;
    let rangeRole = "current_structure";
    if (positiveAction(action) && supportIsActionable) { center = support.center; rangeRole = "support_confluence"; }
    if (negativeAction(action) && resistanceIsActionable) { center = resistance.center; rangeRole = "resistance_confluence"; }
    // Breakdown sells and downside-risk trims remain executable at the current
    // structure; they never wait for an unrealistic, distant rebound.
    if (negativeAction(action) && (!resistanceIsActionable || technical.directionScore <= -55)) { center = price; rangeRole = "current_breakdown_structure"; }
    if (action === "avoid") {
      const avoidReference = support || resistance || null;
      return {
        recommendedRange: null, targetRange: null, invalidation: null,
        executionIntent: intent, actionCorrection: null,
        debug: {
          recommendedRangeInputs: { role: "avoid_no_execution_plan", avoidReference: avoidReference ? { center: roundPrice(avoidReference.center), members: avoidReference.members?.length || 0 } : null },
          targetInputs: {}, invalidationInputs: {}, guardrails: ["avoid_has_no_short_or_exit_plan"],
        },
      };
    }
    const selectedConfluence = positiveAction(action) ? support : negativeAction(action) ? resistance : null;
    const confluenceScore = selectedConfluence ? clamp((selectedConfluence.confluence || 0) / 3.2 * engine.config.componentScales.opportunity.maxConfluenceScore, 0, engine.config.componentScales.opportunity.maxConfluenceScore) : 0;
    const confluenceRatio = confluenceScore / Math.max(1, engine.config.componentScales.opportunity.maxConfluenceScore);
    const confluenceWidth = executionConfig.confluenceWidthMultiplier.weak
      + (executionConfig.confluenceWidthMultiplier.strong - executionConfig.confluenceWidthMultiplier.weak) * confluenceRatio;
    const baseWidth = Math.max(atr * config.rangeAtrWidth, price * 0.0025);
    const widthMultiplier = action === "hold" ? executionConfig.holdWidthMultiplier : confluenceWidth;
    const width = Math.min(baseWidth * widthMultiplier, price * executionConfig.maxHalfWidthPct[horizon]);
    const recommendedRange = range(center - width, center + width);

    if (action === "hold") {
      return {
        recommendedRange, targetRange: null, invalidation: null,
        executionIntent: intent, actionCorrection: null,
        debug: {
          recommendedRangeInputs: { center: roundPrice(center), width: roundPrice(width), role: "current_hold_zone", confluenceScore: round(confluenceScore), structuralReference: { support: support ? roundPrice(support.center) : null, resistance: resistance ? roundPrice(resistance.center) : null } },
          targetInputs: { semantic: "optional_structural_reference_only" }, invalidationInputs: { semantic: "no_active_trade_invalidation" }, guardrails: ["hold_has_no_directional_target"],
        },
      };
    }

    const isPositive = positiveAction(action);
    const targetLevel = nearestLevel(levels, isPositive ? recommendedRange.high : recommendedRange.low, isPositive ? "above" : "below", atr * config.structuralDistanceAtr);
    const fallbackTarget = center + (isPositive ? 1 : -1) * atr * config.targetAtr;
    const targetCenter = targetLevel && Math.abs(targetLevel.price - center) >= atr * 0.6 ? targetLevel.price : fallbackTarget;
    const targetRange = range(targetCenter - atr * executionConfig.targetBandAtr, targetCenter + atr * executionConfig.targetBandAtr);
    const invalidationLevel = isPositive
      ? nearestLevel(levels, recommendedRange.low, "below")
      : nearestLevel(levels, recommendedRange.high, "above");
    const invalidation = roundPrice((invalidationLevel?.price ?? (isPositive ? recommendedRange.low : recommendedRange.high)) + (isPositive ? -1 : 1) * atr * executionConfig.invalidationAtrBuffer);
    const entry = (recommendedRange.low + recommendedRange.high) / 2;
    const targetMid = (targetRange.low + targetRange.high) / 2;
    const reward = Math.abs(targetMid - entry);
    const risk = Math.abs(entry - invalidation);
    const rewardRisk = risk > 0 ? reward / risk : null;
    const minimumRewardRisk = engine.config.execution.minRewardRisk[action];
    const guardrails = [];
    let actionCorrection = null;
    if (positiveAction(action) && support && !supportIsActionable) {
      actionCorrection = action === "strong_buy" ? "buy" : action === "buy" ? "accumulate" : "hold";
      guardrails.push("stale_support_range");
    }
    if (positiveAction(action) && confluenceScore < executionConfig.minimumConfluenceForFormalEntry && ["strong_buy", "buy"].includes(action)) {
      actionCorrection = action === "strong_buy" ? "buy" : "accumulate";
      guardrails.push("weak_confluence_blocks_formal_entry");
    }
    if (positiveAction(action) && Number.isFinite(minimumRewardRisk) && Number.isFinite(rewardRisk) && rewardRisk < minimumRewardRisk) {
      actionCorrection = action === "strong_buy" ? "buy" : action === "buy" ? "accumulate" : "hold";
      guardrails.push("reward_risk_below_gate");
    }
    if (negativeAction(action) && Math.abs(center - price) / atr > executionConfig.staleRangeDistanceAtr) {
      center = price;
      guardrails.push("sell_range_reset_to_current_structure");
    }
    return {
      recommendedRange,
      targetRange,
      invalidation,
      executionIntent: intent,
      actionCorrection,
      debug: {
        recommendedRangeInputs: { center: roundPrice(center), width: roundPrice(width), widthPct: round(width / price * 100), baseWidth: roundPrice(baseWidth), confluenceWidthMultiplier: round(widthMultiplier), confluenceScore: round(confluenceScore), role: rangeRole, support: support ? { center: roundPrice(support.center), distanceAtr: roundPrice(supportDistance), members: support.members.length } : null, resistance: resistance ? { center: roundPrice(resistance.center), distanceAtr: roundPrice(resistanceDistance), members: resistance.members.length } : null },
        targetInputs: { selectedLevel: targetLevel ? { price: roundPrice(targetLevel.price), label: targetLevel.label } : null, fallbackTarget: roundPrice(fallbackTarget), rewardRisk: Number.isFinite(rewardRisk) ? Math.round(rewardRisk * 100) / 100 : null },
        invalidationInputs: { structuralLevel: invalidationLevel ? { price: roundPrice(invalidationLevel.price), label: invalidationLevel.label } : null, atrBuffer: roundPrice(atr * executionConfig.invalidationAtrBuffer) },
        guardrails,
      },
    };
  }

  engine.execution = Object.freeze({ build });
}(globalThis));
