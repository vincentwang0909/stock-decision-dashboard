(function configureDecisionEngine(root) {
  "use strict";

  const engine = root.DecisionEngine || (root.DecisionEngine = {});
  const freeze = (value) => Object.freeze(value);

  engine.config = freeze({
    version: "V2",
    indicators: freeze({
      version: "V2-daily-weekly",
      volume: freeze({
        source: "completed_daily_ohlcv",
        averageWindows: freeze([5, 20, 60, 120, 250]), rvolWindows: freeze([5, 20, 60]), obvAuxiliaryWindows: freeze([5, 20, 60]),
        obv: freeze({ daily: freeze({ interval: "1d", lookback: 20 }), weekly: freeze({ interval: "1w", lookback: 12 }) }),
        structureIntervals: freeze(["1d", "1w"]),
      }),
      squeeze: freeze({ length: 20, bbMultiplier: 2, kcMultiplier: 1.5, regressionLength: 20, levelScale: 0.4, changeScale: 0.045, levelShare: 0.60 }),
      structure: freeze({ pivotBars: freeze({ "1d": 4, "1w": 2 }), atrPeriod: 14, lookback: 120, maxLevels: 12, maxEvents: 6, maxAge: 6, breakAtr: 0.25, retestAtr: 0.35, volumeFast: 5, volumeSlow: 10, volumeThreshold: 20, minimumTouches: 2, maxEngineLevels: 2, minimumIndependentCategories: 2, breakEvidence: 50, retestEvidence: 85, confirmationShare: 0.15 }),
      bollingerRsi: freeze({ low: 35, high: 65, repairBars: 3, confirmationShare: 0.15, periods: freeze({ daily: 14, weekly: 21 }) }),
      integration: freeze({ enabled: true, squeezeShare: freeze({ daily: 0.20, weekly: 0.10 }), accelerationShare: 0.20, structureEnabled: true, structureLevelsEnabled: false, structureRetentionGate: "raw-replay-return-retention-failed" }),
      smc: freeze({ sweepPenetrationAtr: 0.10, sweepReclaimBars: freeze({ daily: 2, weekly: 1 }), sweepAge: freeze({ daily: 3, weekly: 2 }), heldBars: 1, ordinaryInvalidationAtr: 0.25, hardInvalidationAtr: 1.0, materialInvalidationAtr: 0.25, repairBars: 1, highRiskRepairBars: 2, momentumRepairBars: 2 }),
      fvg: freeze({ enabled: true, shadowOnly: true, bodyAtr: 0.80, bodyShare: 0.60, minimumGapAtr: 0.10, maximumGaps: 6 }),
      fibonacci: freeze({
        daily: freeze({ source_timeframe: "1d", lookback: 100, min_lookback: 60, max_lookback: 150, pivot_bars: 4, min_pivot_separation: 10, min_swing_pct: 10, stale_after_bars: 50 }),
        weekly: freeze({ source_timeframe: "1w", lookback: 104, min_lookback: 26, max_lookback: 130, pivot_bars: 2, min_pivot_separation: 5, min_swing_pct: 15, stale_after_bars: 26 }),
      }),
      relativeStrength: freeze({ daily: freeze({ primary: 20, windows: freeze([20, 60, 120]) }), weekly: freeze({ primary: 12, windows: freeze([4, 12, 26]) }) }),
      historyPosition: freeze({ annualBars: freeze({ daily: 252, weekly: 52 }) }),
      confidence: freeze({ tensionStart: 42, tensionOrigin: 38, tensionScale: 62, minimumTensionShare: 0.20 }),
    }),
    actions: freeze(["strong_buy", "buy", "accumulate", "hold", "trim", "sell", "short_sell"]),
    actionLabels: freeze({
      strong_buy: freeze({ en: "Strong Buy", zh: "强力买入" }),
      buy: freeze({ en: "Buy", zh: "买入" }),
      accumulate: freeze({ en: "Accumulate", zh: "逐步加仓" }),
      hold: freeze({ en: "Hold", zh: "等待／观察" }),
      trim: freeze({ en: "Trim", zh: "减仓" }),
      sell: freeze({ en: "Sell", zh: "卖出" }),
      short_sell: freeze({ en: "Short Sell", zh: "做空" }),
    }),
    horizons: freeze({
      daily: freeze({
        label: "Daily", technicalKey: "daily", fibonacciKey: "daily", primaryInterval: "1d", rsiPeriod: 14,
        directionWeights: freeze({ ma: 0.50, macd: 1 / 3, adx: 1 / 6 }),
        confirmationWeights: freeze({ relativeStrength: 0.35, participation: 0.30, rsi: 0.20, adx: 0.10, momentum: 0.05 }),
        marketSensitivity: 0.70, rangeAtrWidth: 0.85, structuralDistanceAtr: 2.8,
        primaryMaPeriods: freeze([20, 50]),
        features: freeze({ ema: freeze({ "1d": freeze([20, 50]) }), sma: freeze({ "1d": freeze([100, 200]) }), rsi: freeze({ "1d": freeze([14, 6]) }), macd: freeze({ "1d": freeze([12, 26, 9]) }), adx: freeze({ "1d": 14 }), atr: freeze({ "1d": 14 }), kdj: freeze({ "1d": 9 }), bollinger: freeze({ "1d": freeze([20, 2]) }) }),
      }),
      weekly: freeze({
        label: "Weekly", technicalKey: "weekly", fibonacciKey: "weekly", primaryInterval: "1w", rsiPeriod: 21,
        directionWeights: freeze({ ma: 10 / 19, macd: 6 / 19, adx: 3 / 19 }),
        confirmationWeights: freeze({ relativeStrength: 0.40, participation: 0.30, rsi: 0.20, adx: 0.10, momentum: 0 }),
        marketSensitivity: 0.40, rangeAtrWidth: 0.70, structuralDistanceAtr: 3.5,
        primaryMaPeriods: freeze([20, 50]),
        features: freeze({ ema: freeze({ "1w": freeze([10, 20, 50]) }), sma: freeze({ "1w": freeze([200]) }), rsi: freeze({ "1w": freeze([21, 14]) }), macd: freeze({ "1w": freeze([12, 26, 9]) }), adx: freeze({ "1w": 14 }), atr: freeze({ "1w": 14 }), kdj: freeze({ "1w": 9 }), bollinger: freeze({ "1w": freeze([20, 2]) }) }),
      }),
    }),
    componentScales: freeze({
      stateScores: freeze({ bullish: 58, bearish: -58, recovering: 28, deteriorating: -28, rising: 32, falling: -32, neutral: 0 }),
      ma: freeze({ priceAtrScale: 1.8, orderingAtrScale: 0.8, priceWeight: 0.36, orderingWeight: 0.40, slopeWeight: 0.20, persistenceWeight: 0.04 }),
      macd: freeze({ lineSignalAtrScale: 0.14, histogramAtrScale: 0.07, histogramChangeAtrScale: 0.045, zeroWeight: 0.24, spreadWeight: 0.27, histogramWeight: 0.20, changeWeight: 0.17, crossoverWeight: 0.07, stateWeight: 0.05 }),
      adx: freeze({ low: 15, fullStrength: 42, diSpreadScale: 0.55 }),
      relativeStrength: freeze({ benchmarkWeight: 0.65, stockReturnWeight: 0.35, returnScale: 4.2, persistenceBonus: 10 }),
      participation: freeze({ obvWeight: 0.38, divergenceWeight: 0.22, confirmationWeight: 0.18, rvolWeight: 0.12, volumeTrendWeight: 0.10 }),
      rsi: freeze({ healthyBullish: freeze([52, 70]), healthyBearish: freeze([30, 48]), extremeHigh: 78, extremeLow: 22, auxiliaryShare: 0.20 }),
      opportunity: freeze({
        confluenceBandAtr: 0.72, supportEligibilityAtr: 0.05, reduceEligibilityAtr: 0.25, clusterDedupAtr: 0.32, clusterCandidateLimit: 8,
        structuralLevelWeight: freeze({ fib: 0.65, moving_average: 0.80, swing: 1.0, price_structure: 1.10, bollinger: 0.65 }),
        // The Price Structure Engine is one category-aware confluence model.
        // More levels from one category improve localisation, but they must
        // not be treated as independent proof of a zone.
        unifiedConfluence: freeze({
          categoryForType: freeze({ fib: "fibonacci", swing: "swing", price_structure: "historical", moving_average: "moving_average", bollinger: "bollinger" }),
          categoryContributionCap: freeze({ fibonacci: 0.85, swing: 1.0, historical: 1.10, moving_average: 0.82, bollinger: 0.65 }),
          crossCategoryBonus: 0.30,
          categoryQualityFloor: 0.15,
          qualityReference: 3.2,
          pairQualityReference: 6.4,
          roleAlignmentWeight: 0.45,
        }),
        maxConfluenceScore: 62, extensionWeight: 24,
      }),
    }),
    risk: freeze({
      atrPct: freeze({ daily: freeze({ mild: 2.0, extreme: 11.0 }), weekly: freeze({ mild: 4.5, extreme: 24.5 }) }),
      atrPercentile: freeze({ elevated: 70, extreme: 92 }),
      volatilityRegime: freeze({ low: 0, normal: 0, elevated: 55, high: 75, extreme: 90, unavailable: 0 }),
      bollingerPercentB: freeze({ extended: 1.0, extreme: 1.25 }),
      bollingerWidthPercentile: freeze({ elevated: 75, extreme: 95 }),
      maExtensionAtr: freeze({ elevated: 2.0, extreme: 3.8 }),
      rsi: freeze({ elevatedHigh: 74, elevatedLow: 26, extremeHigh: 84, extremeLow: 16 }),
      kdj: freeze({ elevated: 90, extreme: 105 }),
      rvol: freeze({ elevated: 1.8, extreme: 3.2 }),
      // Correlated observations are combined inside their own group before the
      // groups are accumulated.  This prevents ATR%, ATR percentile, regime,
      // and Bollinger width from treating one volatility episode as four risks.
      groupBlend: freeze({ primary: 0.65, secondary: 0.25, tertiary: 0.10 }),
      nonlinearImpacts: freeze({ volatility: 0.34, extension: 0.30, eventShock: 0.25 }),
      extremeFloor: freeze({ volatility: 84, extension: 74, shock: 88 }),
      labels: freeze([[30, "normal"], [50, "mild"], [70, "elevated"], [85, "high"], [101, "extreme"]]),
    }),
    exhaustion: freeze({
      highRsi: 72, lowRsi: 28, extremeRsi: 82, extremeLowRsi: 18,
      highKdj: 88, lowKdj: 12, extensionPercentB: 1.05, downsidePercentB: -0.05,
      trendWithoutDeteriorationCap: 28, marketContrarianMax: 14, histogramChangeAtr: freeze({ start: 0.01, extreme: 0.35 }),
    }),
    market: freeze({
      vix: freeze({ cautious: 21, riskOff: 28, shock: 35, spike5d: 6, spike20d: 10 }),
      yields: freeze({ restrictive: 4.5, severe: 5.0, rising5dBps: 18, rising20dBps: 35 }),
      regimes: freeze({ risk_on: freeze({ riskAdd: 0, confidencePenalty: 0 }), normal: freeze({ riskAdd: 0, confidencePenalty: 0 }), cautious: freeze({ riskAdd: 10, confidencePenalty: 6 }), risk_off: freeze({ riskAdd: 22, confidencePenalty: 13 }), shock: freeze({ riskAdd: 38, confidencePenalty: 24 }) }),
      maxRiskAdd: freeze({ daily: 24, weekly: 18 }),
      earnings: freeze({ nearDays: 7, immediateDays: 2, nearRiskAdd: 12, immediateRiskAdd: 20, confidencePenalty: 10 }),
      fearGreed: freeze({ extremeGreed: 80, extremeFear: 20 }),
      events: freeze({ majorTypes: freeze(["fomc", "cpi", "employment"]), ordinaryConfirmationAdd: 5, ordinaryRiskAdd: 8 }),
      macro: freeze({ cpiStep: 0.10, unemploymentStep: 0.20, payrollDeteriorationShare: 0.25, fomcStepPp: 0.25, riskAddMaximum: 8, riskUnit: 4 }),
    }),
    actionPolicy: freeze({
      minimumDataQuality: 38, earlyConfirmation: 45,
      gates: freeze({ strongBuy: freeze({ direction: 62, confirmation: 76, riskMaximum: 42, bullishExhaustionMaximum: 28,  }), buy: freeze({ direction: 30, confirmation: 57, riskMaximum: 64 }), accumulate: freeze({ riskMaximum: 76 }), sell: freeze({ direction: -55, confirmation: 58 }), shortSell: freeze({ direction: -62, confirmation: 76, riskMaximum: 42 }) }),
    }),
    execution: freeze({
      rewardRisk: freeze({ buy: 1.5, accumulate: 1.5, strong_buy: 2, short_sell: 2 }),
      exitHalfWidthAtr: 0.20,
      newEntryExhaustionMaximum: 55,
      minimumIndependentEntryCategories: 2,
      // These are width and distance safety rails, not fixed-price ranges.
      // Centre still comes only from structural confluence; ATR determines the
      // unconstrained width before the horizon-specific normalisation below.
      maxHalfWidthPct: freeze({ daily: 0.045, weekly: 0.060 }),
      maxEntryCenterDistanceAtr: freeze({ daily: 1.45, weekly: 1.70 }),
      maxEntryCenterDistancePct: freeze({ daily: 0.055, weekly: 0.070 }),
      confluenceWidthMultiplier: freeze({ weak: 0.72, strong: 0.94 }),
      landscape: freeze({
        obstacles: freeze({ minimumReactionCategories: 2, reactionBars: 2 }),
        neutralBufferAtr: freeze({ daily: 0.62, weekly: 0.86 }),
        minimumHalfWidthAtr: freeze({ daily: 0.28, weekly: 0.34 }),
        weakQualityPenalty: 9,
        invalidQualityPenalty: 24,
        minimumPairQuality: 0.85,
        // Structural clusters remain the only zone centres.  These inputs
        // merely select between existing clusters as trend/risk conditions
        // evolve; they never shift a centre by a fixed percentage or ATR.
        contextualSelection: freeze({
          minimumReduceDistanceAtr: freeze({ daily: 0.95, weekly: 1.20 }),
          bullishTrendLiftAtr: freeze({ daily: 1.45, weekly: 1.85 }),
          prematureReducePenalty: 0.72, weakeningTrendDiscount: 0.65, reduceReferenceAtr: 1.5,
          supportDistancePenalty: 0.13,
          reduceDistancePenalty: 0.05,
          bearishPressureProximityBonus: 0.16,
        }),
      }),
      priceState: freeze({
        nearOpportunityAtr: freeze({ daily: 1.45, weekly: 1.70 }),
        nearReduceAtr: freeze({ daily: 1.15, weekly: 1.45 }),
        // Near-zone tolerance must never consume the entire deliberate
        // Neutral buffer between two actionable zones.
        neutralBufferNearShare: 0.42,
        minimumNearAtr: 0.15,
      }),
    }),
    stability: freeze({
      material: freeze({ atrShock: 82, majorBreakdown: -68, majorBreakout: 68 }),
      noHistory: freeze({ ma: 0.36, macd: 0.30, adx: 0.18, relativeStrength: 0.16, minimum: 42, maximum: 76, unavailable: 45 }),
    }),
    confidence: freeze({
      unavailableMaximum: 35,
      weights: freeze({ agreement: 0.35 / 0.90, actionStrength: 0.25 / 0.90, stability: 0.20 / 0.90, dataQuality: 0.10 / 0.90 }),
      profileConfidenceWeight: 0,
      penalties: freeze({ marketConflict: 18, exhaustionConflict: 16, eventUncertainty: 12, internalConflict: 18, priceConflict: 14, invalidLandscape: 18 }),
    }),
    profile: freeze({
      highRiskRepair: freeze({business: freeze(["Turnaround","EmergingGrowth"]),risk: freeze(["ExecutionRisk"]),lifecycle: freeze(["Emerging","Recovery"])}),
      // Company Profile V2.1 is deliberately a metadata-only, structural
      // classifier.  The numeric evidence requirements live here rather than
      // being hidden in classifier control flow so reviews and audits can
      // explain every result without touching recommendation parameters.
      schemaVersion: "2.1",
      classifier: freeze({
        sizeClass: freeze({ megaCapMarketCap: 200_000_000_000 }),
        business: freeze({
          // A structurally cyclical issuer needs corroborating cycle evidence
          // before it can qualify.  When that complete evidence ties a
          // current-growth score, preserve the more specific cycle context
          // instead of treating one YoY growth reading as dispositive.
          tieBreakOrder: freeze(["MarketLeader", "Cyclical", "HighGrowth", "MatureGrowth", "CashCow", "Defensive", "Turnaround", "EmergingGrowth"]),
          minimumEvidence: freeze({ MarketLeader: 3, HighGrowth: 3, MatureGrowth: 3, CashCow: 4, Defensive: 3, Cyclical: 3, Turnaround: 3, EmergingGrowth: 4 }),
          // Evidence weights are intentionally separate from the production Decision
          // Engine. They describe only slow-moving issuer metadata.
          points: freeze({
            leaderScale: 2, leaderMargin: 1, leaderLanguage: 2,
            highGrowthStrong: 2, highGrowthBase: 1, highGrowthScale: 1, highGrowthProfitability: 1, highGrowthScalableBusiness: 1,
            matureGrowthScale: 1, matureGrowthGrowth: 2, matureGrowthMargin: 1,
            cashCowScale: 1, cashCowMargin: 3, cashCowLowGrowth: 1,
            defensivePrimary: 2, defensiveMargin: 1,
            cyclicalStructuralPrimary: 1, cyclicalExposure: 2, cyclicalReboundGrowth: 1, cyclicalLanguage: 3, turnaroundLanguage: 3,
            emergingGrowthScale: 2, emergingGrowthGrowth: 2, emergingGrowthCondition: 1,
          }),
          thresholds: freeze({
            leaderMarketCap: 200_000_000_000, leaderMargin: 0.15,
            highGrowthStrong: 0.25, highGrowth: 0.18, highGrowthScaleFloor: 10_000_000_000, highGrowthProfitMarginFloor: 0,
            matureGrowthMarketCap: 40_000_000_000, matureGrowthLow: 0.04, matureGrowthHigh: 0.18, matureGrowthMargin: 0.10,
            cashCowMarketCap: 10_000_000_000, cashCowMargin: 0.20, cashCowGrowthCeiling: 0.18,
            defensiveMargin: 0.08,
            emergingGrowthMarketCap: 10_000_000_000, emergingGrowth: 0.25, emergingMarginCeiling: 0.05,
            cyclicalReboundGrowth: 0.25,
          }),
          // This is a bounded structural prior, never an automatic final
          // business trait.  Candidate selection still requires additional
          // issuer evidence and its normal sufficiency threshold.
          structuralCyclicalPrimaries: freeze(["Semiconductors", "Semiconductor Equipment", "Energy", "Materials", "Industrials", "Transportation & Logistics", "Capital Markets"]),
        }),
        lifecycle: freeze({
          tieBreakOrder: freeze(["Declining", "Recovery", "Emerging", "Scaling", "EstablishedLeader", "MatureLeader"]),
          minimumEvidence: freeze({ Declining: 3, Recovery: 3, Emerging: 4, Scaling: 3, EstablishedLeader: 4, MatureLeader: 4 }),
          points: freeze({
            decliningLanguage: 3, recoveryLanguage: 3,
            emergingScale: 2, emergingStage: 2,
            scalingGrowth: 2, scalingNonHugeScale: 1, scalingScalableBusiness: 1,
            establishedScale: 3, establishedMargin: 1, establishedBusinessLeader: 1,
            matureScale: 1, matureMargin: 1, matureGrowth: 2,
          }),
          thresholds: freeze({
            emergingMarketCap: 2_000_000_000,
            scalingGrowth: 0.18, scalingMarketCapCeiling: 200_000_000_000,
            establishedMarketCap: 200_000_000_000, establishedMargin: 0.08,
            matureMarketCap: 40_000_000_000, matureMargin: 0.10, matureGrowthFloor: 0, matureGrowthCeiling: 0.12,
          }),
        }),
        risk: freeze({ highBeta: 1.45, lowBeta: 0.75 }),
      }),
      review: freeze({ annualReviewMonth: 3, annualReviewDay: 31, timeZone: "America/New_York", cacheLimit: 300 }),
      modifierCaps: freeze({ normal: freeze([0.85, 1.15]), special: freeze([0.80, 1.20]) }),
      // These sources all encode the same broad issuer-maturity/stability
      // fact.  For weeklyStability, retain the strongest one rather than adding
      // all of them and immediately flattening distinct profiles at the cap.
      // Unlisted primary/risk contributions remain independent evidence.
      correlatedWeeklyStability: freeze({
        businessTrait: freeze(["MarketLeader", "MatureGrowth", "CashCow", "Defensive"]),
        lifecycle: freeze(["EstablishedLeader", "MatureLeader"]),
        sizeClass: freeze(["MegaCap"]),
      }),
      primaryClassificationModifiers: freeze({
        Semiconductors: freeze({ confirmationWeights: freeze({ relativeStrength: 0.06, participation: 0.05 }), normalAtrTolerance: 0.04, marketSensitivity: 0.05, benchmarkWeights: freeze({ qqq: 0.06 }) }),
        "Semiconductor Equipment": freeze({ confirmationWeights: freeze({ participation: 0.07 }), marketSensitivity: 0.06, benchmarkWeights: freeze({ qqq: 0.05 }) }),
        "Enterprise Software": freeze({ confirmationWeights: freeze({ relativeStrength: 0.04 }), marketSensitivity: 0.03, rateSensitivity: 0.03, benchmarkWeights: freeze({ qqq: 0.04 }) }),
        "Cloud Infrastructure": freeze({ confirmationWeights: freeze({ relativeStrength: 0.06, participation: 0.04 }), marketSensitivity: 0.05, benchmarkWeights: freeze({ qqq: 0.06 }) }),
        "Consumer Technology": freeze({ confirmationWeights: freeze({ relativeStrength: 0.04 }), marketSensitivity: 0.04, benchmarkWeights: freeze({ qqq: 0.04 }) }),
        "Internet Platforms": freeze({ confirmationWeights: freeze({ relativeStrength: 0.04 }), eventSensitivity: 0.04, marketSensitivity: 0.03, benchmarkWeights: freeze({ qqq: 0.04 }) }),
        "Media & Entertainment": freeze({ confirmationWeights: freeze({ participation: 0.04, relativeStrength: 0.03 }), eventSensitivity: 0.04, marketSensitivity: 0.04, benchmarkWeights: freeze({ qqq: 0.03 }) }),
        "E-Commerce": freeze({ confirmationWeights: freeze({ participation: 0.05 }), marketSensitivity: 0.06 }),
        "Digital Advertising": freeze({ confirmationWeights: freeze({ participation: 0.06 }), marketSensitivity: 0.06 }),
        "Telecommunications Infrastructure": freeze({ marketSensitivity: 0.04 }),
        "Capital Markets": freeze({ marketSensitivity: 0.08, rateSensitivity: 0.08, benchmarkWeights: freeze({ spy: 0.05 }) }),
        Banking: freeze({ marketSensitivity: 0.07, rateSensitivity: 0.12, benchmarkWeights: freeze({ spy: 0.06 }) }),
        "Digital Financial Services": freeze({ marketSensitivity: 0.07, rateSensitivity: 0.05, benchmarkWeights: freeze({ qqq: 0.03 }) }),
        Payments: freeze({ marketSensitivity: 0.04 }),
        Insurance: freeze({ rateSensitivity: 0.07, weeklyStability: 0.05 }),
        "Managed Care & Health Services": freeze({ marketSensitivity: -0.05, eventSensitivity: 0.07, weeklyStability: 0.06 }),
        Pharmaceuticals: freeze({ eventSensitivity: 0.09, actionGates: freeze({ buyConfirmation: 2, strongBuyConfirmation: 3 }) }),
        Biotechnology: freeze({ eventSensitivity: 0.14, riskSensitivity: 0.07, actionGates: freeze({ buyConfirmation: 5, strongBuyConfirmation: 7 }) }),
        "Medical Devices": freeze({ marketSensitivity: -0.02, eventSensitivity: 0.04, weeklyStability: 0.03 }),
        "Consumer Discretionary": freeze({ marketSensitivity: 0.07, confirmationWeights: freeze({ participation: 0.05 }) }),
        "Consumer Staples": freeze({ marketSensitivity: -0.07, weeklyStability: 0.08, actionGates: freeze({ buyConfirmation: 2 }) }),
        Retail: freeze({ marketSensitivity: 0.07, confirmationWeights: freeze({ participation: 0.06 }) }),
        Industrials: freeze({ marketSensitivity: 0.05 }),
        "Aerospace & Defense": freeze({ weeklyStability: 0.07, eventSensitivity: 0.04 }),
        "Transportation & Logistics": freeze({ marketSensitivity: 0.08, confirmationWeights: freeze({ participation: 0.06 }) }),
        Energy: freeze({ marketSensitivity: 0.07, confirmationWeights: freeze({ participation: 0.06 }) }),
        Utilities: freeze({ rateSensitivity: 0.14, marketSensitivity: -0.06, weeklyStability: 0.09 }),
        "Real Estate": freeze({ rateSensitivity: 0.16, marketSensitivity: -0.03, weeklyStability: 0.06 }),
        Materials: freeze({ marketSensitivity: 0.08, confirmationWeights: freeze({ participation: 0.06 }) }),
      }),
      // Size is deliberately internal.  It preserves only a small
      // noise/stability context and may never act as a visible Company Trait
      // or permission to take a bullish action.
      sizeClassModifiers: freeze({
        MegaCap: freeze({ riskSensitivity: -0.02, marketSensitivity: -0.02, weeklyStability: 0.03 }),
        NonMegaCap: freeze({}),
      }),
      businessTraitModifiers: freeze({
        MarketLeader: freeze({ confirmationWeights: freeze({ relativeStrength: 0.06 }), weeklyStability: 0.04 }),
        HighGrowth: freeze({ confirmationWeights: freeze({ relativeStrength: 0.05 }), marketSensitivity: 0.05, rateSensitivity: 0.04, exhaustionSensitivity: 0.05, actionGates: freeze({ buyConfirmation: 2 }) }),
        MatureGrowth: freeze({ weeklyStability: 0.05, normalAtrTolerance: -0.03 }),
        CashCow: freeze({ riskSensitivity: -0.04, marketSensitivity: -0.04, rateSensitivity: -0.03, weeklyStability: 0.08 }),
        Defensive: freeze({ marketSensitivity: -0.07, weeklyStability: 0.09, actionGates: freeze({ buyConfirmation: 2 }) }),
        Cyclical: freeze({ confirmationWeights: freeze({ participation: 0.06, relativeStrength: 0.03 }), marketSensitivity: 0.07, weeklyStability: -0.03, actionGates: freeze({ buyConfirmation: 2 }) }),
        Turnaround: freeze({ riskSensitivity: 0.06, weeklyStability: -0.06, actionGates: freeze({ buyConfirmation: 7, strongBuyConfirmation: 8 }) }),
        EmergingGrowth: freeze({ confirmationWeights: freeze({ relativeStrength: 0.04 }), riskSensitivity: 0.04, normalAtrTolerance: 0.03, weeklyStability: -0.04, actionGates: freeze({ buyConfirmation: 3, strongBuyConfirmation: 4 }) }),
      }),
      riskTraitModifiers: freeze({
        HighVolatility: freeze({ normalAtrTolerance: 0.10, exhaustionSensitivity: -0.05, actionGates: freeze({ buyConfirmation: 2 }) }),
        RegulatoryRisk: freeze({ eventSensitivity: 0.12, actionGates: freeze({ buyConfirmation: 3, strongBuyConfirmation: 4 }) }),
        InterestRateSensitive: freeze({ rateSensitivity: 0.12, marketSensitivity: 0.03 }),
        CommoditySensitive: freeze({ marketSensitivity: 0.07, actionGates: freeze({ buyConfirmation: 3 }) }),
        MacroSensitive: freeze({ marketSensitivity: 0.09, actionGates: freeze({ buyConfirmation: 3 }) }),
        CrowdedLeader: freeze({ exhaustionSensitivity: 0.11, riskSensitivity: 0.04, actionGates: freeze({ buyConfirmation: 2 }) }),
        ExecutionRisk: freeze({ riskSensitivity: 0.07, eventSensitivity: 0.08, weeklyStability: -0.04, actionGates: freeze({ buyConfirmation: 5, strongBuyConfirmation: 6 }) }),
        LowVolatility: freeze({ normalAtrTolerance: -0.07, exhaustionSensitivity: -0.03, weeklyStability: 0.07 }),
      }),
      lifecycleModifiers: freeze({
        Emerging: freeze({ riskSensitivity: 0.08, normalAtrTolerance: 0.06, weeklyStability: -0.07, actionGates: freeze({ buyConfirmation: 7, strongBuyConfirmation: 8 }) }),
        Scaling: freeze({ confirmationWeights: freeze({ relativeStrength: 0.04 }), normalAtrTolerance: 0.04, actionGates: freeze({ buyConfirmation: 2 }) }),
        EstablishedLeader: freeze({ confirmationWeights: freeze({ relativeStrength: 0.04 }), weeklyStability: 0.08 }),
        MatureLeader: freeze({ weeklyStability: 0.10, marketSensitivity: -0.04, exhaustionSensitivity: 0.04 }),
        Recovery: freeze({ confirmationWeights: freeze({ participation: 0.08 }), riskSensitivity: 0.05, weeklyStability: -0.06, actionGates: freeze({ buyConfirmation: 6, strongBuyConfirmation: 7 }) }),
        Declining: freeze({ riskSensitivity: 0.08, weeklyStability: -0.08, actionGates: freeze({ buyConfirmation: 8, strongBuyConfirmation: 9 }) }),
      }),
    }),
    etf: freeze({
      leveraged: freeze({
        modifierDelta: freeze({ riskSensitivity: 0.12, exhaustionSensitivity: 0.10, marketSensitivity: 0.16, normalAtrTolerance: 0.10 }),
        gates: freeze({ buyDirection: 4, buyConfirmation: 3, strongBuyDirection: 8, strongBuyConfirmation: 6 }),
        confidenceScale: freeze({ daily: 0.92, weekly: 0.86 }),
      }),
      inverse: freeze({ underlyingConfirmationImpact: 14, underlyingConflictImpact: 16 }),
    }),
  });
  if (typeof module !== "undefined" && module.exports) module.exports = engine.config;
}(globalThis));
