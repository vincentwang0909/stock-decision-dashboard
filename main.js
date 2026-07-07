const API_BASE = window.location.protocol === "file:" ? "http://127.0.0.1:4173" : window.location.origin;
const API_URL = `${API_BASE}/api/market-data`;
const WATCHLIST_API_URL = `${API_BASE}/api/watchlist`;
const SYMBOL_SEARCH_API_URL = `${API_BASE}/api/symbol-search`;
const PRICE_CACHE_KEY = "stock-dashboard-market-cache-v9";
const WATCHLIST_CACHE_KEY = "stock-dashboard-watchlist-v1";
const WATCHLIST_SESSION_KEY = "stock-dashboard-watchlist-session-v1";
const WATCHLIST_MIGRATION_KEY = "stock-dashboard-watchlist-migration-v2";
const LANGUAGE_CACHE_KEY = "stock-dashboard-language-v1";
const PRICE_REFRESH_MS = 60 * 60 * 1000;
const WATCHLIST_SYNC_MS = 60 * 1000;
const MARKET_DATA_BATCH_SIZE = 25;
const LIVE_REFRESH_BATCH_SIZE = 5;
const REQUIRED_DEFAULT_TICKERS = ["300657", "002463", "603005", "600522"];
const CALIBRATION_CONFIG = {
  rating_thresholds: {
    strong_buy: 85,
    buy: 70,
    hold: 55,
    sell: 40,
  },
  missing_data_neutral_score: 50,
  max_penalty_per_module: 15,
  max_total_penalty: 25,
};
const PENALTY_CONFIG = {
  max_single_penalty: 5,
  max_module_penalty: 10,
  max_total_penalty: 20,
  missing_data_max_penalty: 3,
};
const PENALTY_PROFILE_WEIGHTS = {
  MegaCap: { technical: 1.0, valuation: 1.0, fundamental: 1.2, options: 0.8, market_context: 0.8, data_quality: 0.5 },
  CashCow: { technical: 0.8, valuation: 1.0, fundamental: 1.3, options: 0.7, market_context: 0.8, data_quality: 0.5 },
  Growth: { technical: 1.1, valuation: 0.5, fundamental: 1.0, options: 0.9, market_context: 1.0, data_quality: 0.5 },
  HighGrowth: { technical: 1.1, valuation: 0.45, fundamental: 1.0, options: 0.9, market_context: 1.0, data_quality: 0.5 },
  HighMultiple: { technical: 1.1, valuation: 0.3, fundamental: 1.1, options: 1.0, market_context: 1.1, data_quality: 0.5 },
  StoryStock: { technical: 1.2, valuation: 0.25, fundamental: 0.8, options: 1.0, market_context: 1.3, data_quality: 0.5 },
  Momentum: { technical: 1.3, valuation: 0.3, fundamental: 0.8, options: 1.1, market_context: 1.1, data_quality: 0.5 },
  IPO: { technical: 1.2, valuation: 0.2, fundamental: 0.6, options: 0.9, market_context: 1.4, data_quality: 0.5 },
  NewlyListed: { technical: 1.2, valuation: 0.2, fundamental: 0.6, options: 0.9, market_context: 1.4, data_quality: 0.5 },
  Speculative: { technical: 1.3, valuation: 0.2, fundamental: 0.6, options: 1.1, market_context: 1.4, data_quality: 0.5 },
  REIT: { technical: 0.7, valuation: 0.8, fundamental: 1.3, options: 0.6, market_context: 1.4, data_quality: 0.5 },
  Dividend: { technical: 0.6, valuation: 0.8, fundamental: 1.4, options: 0.5, market_context: 1.2, data_quality: 0.5 },
  Crypto: { technical: 1.2, valuation: 0.3, fundamental: 0.7, options: 1.0, market_context: 1.5, data_quality: 0.5 },
  InterestRateSensitive: { technical: 0.8, valuation: 0.8, fundamental: 1.0, options: 0.7, market_context: 1.5, data_quality: 0.5 },
  Energy: { technical: 1.0, valuation: 0.7, fundamental: 1.1, options: 0.7, market_context: 1.3, data_quality: 0.5 },
  Cyclical: { technical: 1.0, valuation: 0.7, fundamental: 1.0, options: 0.7, market_context: 1.4, data_quality: 0.5 },
};
const PROFILE_WEIGHT_DEFAULTS = { technical: 1, valuation: 1, fundamental: 1, options: 1, market_context: 1, data_quality: 0.5 };
const DEV_MODE = ["localhost", "127.0.0.1"].includes(window.location.hostname) || window.location.protocol === "file:";
const PROFILE_DEBUG_MODE = new URLSearchParams(window.location.search).get("debugTags") === "1";

const DEFAULT_WATCHLIST = [
  "NVDA",
  "TSLA",
  "AMD",
  "BABA",
  "GOOGL",
  "AMZN",
  "AAPL",
  "CRCL",
  "FFAI",
  "HIMS",
  "MPT",
  "META",
  "MSFT",
  "NFLX",
  "PLTR",
  "NOW",
  "SOFI",
  "TEM",
  "XE",
  "ZETA",
  "300657",
  "002463",
  "603005",
  "600522",
];

const I18N = {
  en: {
    appTitle: "Stock Decision Dashboard",
    refresh: "Auto refresh every 1 hour",
    refreshNow: "Refresh Now",
    refreshing: "Refreshing...",
    lastRefresh: "Last refresh",
    nextRefresh: "Next refresh",
    partialCachedQuotes: "Some quotes are cached",
    lastUpdate: "last update",
    syncedAt: "synced",
    marketDataAt: "market data",
    stocks: "Stocks",
    sharedWatchlistHint: "Shared Watchlist: everyone viewing this Dashboard sees the same stock list.",
    watchlistSyncFailed: "Shared list sync failed. Showing cached data.",
    ticker: "Search symbol or name",
    addStock: "Add Stock",
    addSelected: "Add Selected",
    removeStock: "Remove Stock",
    removeShort: "Remove",
    price: "Price",
    longTermRating: "Mid / Long-Term Action (30-365D)",
    currentActionShort: "Short-Term Action (1-30D)",
    currentAction: "Short-Term Action (1-30D)",
    signalMix: "AI Score",
    heroGuide: "<strong>Action</strong> = mid / long-term accumulation view. <strong>Tactical</strong> = short-term support / resistance timing. <strong>Signal Mix</strong> = indicator blend, not a direct buy rating.",
    action: "AI Suggestion",
    analysisTitle: "Support / Resistance Analysis",
    analysisDesc: "Tactical read only. Weighted by historical pivots, volume profile, moving averages, Fibonacci, and Bollinger bands.",
    howTitle: "How the Signals Work",
    howBody: "<strong>Action</strong> is the patient mid / long-term stance. <strong>Tactical Buy / Hold / Sell</strong> is the short-term level read. <strong>Signal Mix</strong> is just the blended indicator balance and can stay high even when the stock is not yet in a good ambush entry zone.",
    howSmall: "Examples: a stock can show high Signal Mix because the trend is healthy, while Action still stays Hold if price is too extended from support.",
    tactical: "Tactical",
    company: "Company",
    mixShort: "Mix",
    buyWord: "buy",
    holdWord: "hold",
    sellWord: "sell",
    indicators: "indicators",
    fallbackRefresh: "Auto refresh every 1 hour • using seeded fallback",
    unavailableRefresh: "Price source unavailable",
    staleRefresh: "Using last successful refresh",
    noMarketDataAdd: "has no available market data and could not be added.",
    noMarketData: "No market data",
    priceUnavailable: "Price unavailable",
    searchHintIdle: "Search by ticker, company name, or A-share code, then pick one result.",
    searchHintLoading: "Searching candidates...",
    searchHintEmpty: "No matching stocks found yet.",
    searchHintSelected: "Selected",
    searchMarketUs: "US",
    searchMarketCn: "A-share",
    searchExchange: "Exchange",
    currentPrice: "Current Price",
    supportStrength: "Support Strength",
    resistanceStrength: "Resistance Strength",
    priceToSupport: "Price to Support",
    priceToResistance: "Price to Resistance",
    riskReward: "Risk / Reward",
    reading: "Reading",
    bestSupport: "Best Support",
    bestResistance: "Best Resistance",
    supportGap: "Support Gap",
    resistanceGap: "Resistance Gap",
    supportLevel: "Support level",
    resistanceLevel: "Resistance level",
    pe: "PE",
    forwardPe: "Forward PE",
    filterAll: "All",
    filterUs: "US",
    filterCn: "A-shares",
    filterMegaCap: "Mega Cap",
    filterGrowth: "Growth",
    filterSpeculative: "Speculative",
    filterDividend: "Dividend",
    filterValue: "Value",
    sortAiScore: "Overall AI Score",
    sortShortScore: "Short-Term Score",
    sortMidScore: "Mid-Term Score",
    sortLongScore: "Long-Term Score",
    sortTicker: "Ticker",
    sortStockType: "Stock Type",
    sortDayMove: "Day Move",
    marketCap: "Market Cap",
    closeDetail: "Close detail",
    updatedAtShort: "Updated",
    compositeScore: "Composite Score",
    todayClose: "Today Close",
    prevClose: "Prev Close",
    mainFlow: "Main Flow",
    valuationState: "Valuation",
    sectionPriceVolume: "Price & Volume",
    sectionRsi: "RSI Momentum",
    sectionMacd: "MACD Trend",
    sectionSupport: "Support / Resistance",
    sectionValuation: "Valuation & Multiple",
    buyingPressure: "buying pressure",
    sellingPressure: "selling pressure",
    neutralFlow: "mixed flow",
    low: "Low",
    moderate: "Moderate",
    elevated: "Elevated",
    expensive: "Expensive",
    fair: "Fair",
    attractive: "Attractive",
    aiScore: "AI Score",
    overallAiScore: "Composite AI Score",
    ruleBasedScore: "Rule-Based Score",
    upside: "Upside",
    sortRisk: "Risk",
    signalConsensus: "Signal Consensus",
    confidence: "Signal Consensus",
    confidenceHelp: "Based on how aligned the buy, hold, and sell signals are.",
    currentSuggestion: "Current Suggestion",
    dayMove: "Today's Move",
    aiAnalysis: "AI Analysis",
    stockType: "Stock Type",
    modelUsed: "Model Used",
    watchlistFit: "Watchlist Fit",
    qualityScore: "Quality Score",
    growthScore: "Growth Score",
    valuationScore: "Valuation Score",
    investmentThesis: "Investment Thesis",
    whyOwn: "Why It Can Work",
    whatToWatch: "What To Watch",
    longTermFit: "Long-Term Fit",
    modelWeights: "Model Weights",
    ratingSource: "Score Source",
    operatingMargin: "Operating Margin",
    debtRatio: "Debt Ratio",
    cashReserve: "Cash Reserve",
    fcfGrowth: "FCF Growth",
    analystView: "Analyst View",
    guidance: "Guidance",
    pegRatio: "PEG Ratio",
    evEbitda: "EV / EBITDA",
    psRatio: "PS Ratio",
    valuationConclusion: "Valuation Conclusion",
    technicalRisks: "Technical Watch-outs",
    fundamentalRisks: "Fundamental Watch-outs",
    flowRisks: "Money Flow Watch-outs",
    megaCap: "Mega Cap",
    growthType: "Growth",
    valueType: "Value",
    dividendType: "Dividend",
    speculativeType: "Speculative",
    turnaroundType: "Turnaround",
    megaCapModel: "Mega Cap Model",
    growthModel: "Growth Model",
    valueModel: "Value Model",
    dividendModel: "Dividend Model",
    speculativeModel: "Speculative Model",
    turnaroundModel: "Turnaround Model",
    highQualityBusiness: "High-quality business",
    fastGrowingBusiness: "High-growth profile",
    reasonableValuation: "Reasonably valued",
    richlyValued: "Richly valued",
    undervalued: "Undervalued",
    fairlyValued: "Fairly valued",
    overvalued: "Overvalued",
    suitableForWatchlist: "Suitable for a long-term watchlist",
    suitableForAccumulation: "Suitable for patient accumulation",
    needsMoreProof: "Needs more proof before a long-term position",
    unsuitableForLongTerm: "Less suitable for long-term ownership right now",
    coreReasons: "Core Reasons",
    keyRisks: "Key Risks",
    targetPrice: "Target Price",
    stopPrice: "Stop Price",
    upsidePotential: "Upside Potential",
    scoreBreakdown: "Score Breakdown",
    weights: "Weights",
    finalScore: "Final Score",
    yesterday: "Yesterday",
    today: "Today",
    scoreChange: "Score Change",
    scoreTrend: "Score Trend",
    actionPlan: "Action Plan",
    waitZone: "Wait Zone",
    reevaluate: "Re-evaluate",
    positionPlan: "Position Plan",
    firstEntry: "First Entry",
    secondEntry: "Second Entry",
    riskRewardRatio: "Risk / Reward",
    targetRating: "Target Rating",
    bullishFactors: "Bullish Factors",
    bearishFactors: "Bearish Factors",
    hoverForMore: "Hover for more",
    improving: "Improving",
    softening: "Softening",
    technicalScore: "Technical",
    fundamentalScore: "Fundamental",
    moneyFlowScore: "Money Flow",
    riskScore: "Risk",
    tabSummary: "Overview",
    tabTechnical: "Technical",
    tabFundamental: "Fundamental",
    tabFlow: "Money Flow",
    tabOptions: "Options",
    tabNews: "News / Market Context",
    tabRisk: "Risk",
    trendAnalysis: "Trend Analysis",
    shortTermTrend: "Short-Term Trend",
    midTermTrend: "Mid-Term Trend",
    longTermTrend: "Long-Term Trend",
    technicalConclusion: "Technical Conclusion",
    fundamentalConclusion: "Fundamental Conclusion",
    flowConclusion: "Money Flow Conclusion",
    riskLevel: "Risk Level",
    riskConclusion: "Risk Review",
    valuation: "Valuation",
    revenueGrowth: "Revenue Growth",
    profitGrowth: "EPS Growth",
    freeCashFlow: "Free Cash Flow",
    volumeRatio: "Volume Ratio",
    capitalFlow: "Capital Flow",
    aiRatingScaleStrongBuy: "Strong Buy",
    aiRatingScaleBuy: "Buy",
    aiRatingScaleHold: "Hold",
    aiRatingScaleSell: "Sell",
    aiRatingScaleStrongSell: "Strong Sell",
    aiRatingScaleShort: "Short",
    currentBuyCondition: "Buy Trigger",
    shortTermPlan: "Short-Term Action",
    longTermPlan: "Mid / Long-Term Action (30-365D)",
    shortSupport: "Short-Term Support",
    shortResistance: "Short-Term Resistance",
    longSupport: "Long-Term Support",
    longResistance: "Long-Term Resistance",
    buyWhen: "Buy when",
    waitZone: "Wait Zone",
    supportResistanceRead: "Support / Resistance Read",
    distanceToSupport: "Distance to Support",
    distanceToResistance: "Distance to Resistance",
    supportLevelShort: "S",
    resistanceLevelShort: "R",
    longSupportShort: "Long S",
    longResistanceShort: "Long R",
    newlyListedType: "Newly Listed",
    newlyListedModel: "Newly Listed Model",
    technicalSummary: "Technical Summary",
    fundamentalSummary: "Fundamental Summary",
    moneyFlowSummary: "Money Flow Summary",
    qualitySummary: "Quality Summary",
    growthSummary: "Growth Summary",
    valuationSummary: "Valuation Summary",
    absorption: "Accumulation",
    launch: "Launch",
    markup: "Markup",
    shakeout: "Shakeout",
    distribution: "Distribution",
    decline: "Decline",
    moneyFlowBehavior: "Money Flow Pattern",
    moneyFlowStage: "Flow Stage",
    neutralSetup: "Wait for a cleaner entry",
    scoreOutOf100: "/100",
    noSignalReason: "Waiting for a fresh market snapshot.",
    optionsMarket: "Options Market",
    callWall: "Call Wall",
    putWall: "Put Wall",
    gammaFlip: "Gamma Flip",
    nearestExpiry: "Nearest Expiry",
    optionBias: "Options Read",
    optionCoverage: "Coverage",
    optionsSummary: "Options Summary",
    optionsUnavailable: "Options wall data is not available for this symbol yet.",
    callOi: "Call OI",
    putOi: "Put OI",
    optionsSupportive: "Options positioning is acting as support.",
    optionsCapped: "Options positioning is acting as resistance.",
    optionsNeutral: "Options positioning is mixed.",
    aiDecision: "AI Decision",
    shortTerm: "Short-Term (1-30D)",
    midTerm: "Mid-Term (30-90D)",
    longTerm: "Long-Term (90-180D)",
    confidencePct: "Confidence",
    idealBuyZone: "Ideal Buy Zone",
    buyZoneReason: "Why this zone",
    supportLevels: "Support Levels",
    resistanceLevels: "Resistance Levels",
    nearestSupport: "Nearest Support",
    strongestSupport: "Strongest Support",
    nearestResistance: "Nearest Resistance",
    strongestResistance: "Strongest Resistance",
    strategyMatrix: "Strategy Matrix",
    buyStock: "Buy Stock",
    addPosition: "Add Position",
    cashSecuredPut: "Cash-Secured Put / Sell Put",
    coveredCall: "Covered Call",
    takeProfit: "Take Profit",
    waitNoAction: "Wait / No Action",
    recommended: "Recommended",
    neutral: "Neutral",
    avoid: "Avoid",
    suggestedZone: "Suggested Zone",
    suggestedStrike: "Suggested Strike",
    suggestedDte: "Suggested DTE",
    riskNote: "Risk Note",
    topReasons: "Top Reasons",
    volumeConfirmation: "Volume Confirmation",
    trend: "Trend",
    momentum: "Momentum",
    technicalSummaryTitle: "Technical Summary",
    quality: "Quality",
    growth: "Growth",
    financialHealth: "Financial Health",
    fundamentalSummaryTitle: "Fundamental Summary",
    keyStrengths: "Key Strengths",
    keyRisksTitle: "Key Risks",
    marketContext: "Market Context",
    macro: "Macro",
    sectorTheme: "Sector / Theme",
    newsSentiment: "News Sentiment",
    institutionalInsider: "Institutional / Insider",
    dataUnavailable: "Data unavailable",
    companyProfile: "Company Profile",
    profileTags: "Profile Tags",
    rating: "Rating",
    summary: "Summary",
    explanation: "Explanation",
    overallFundamentalView: "Overall Fundamental View",
    shortSqueezeRisk: "Short Squeeze Risk",
    shortInterestPct: "Short Interest % Float",
    shortInterestShares: "Short Interest Shares",
    daysToCover: "Days to Cover",
    borrowFee: "Borrow Fee / Cost to Borrow",
    utilization: "Utilization",
    floatShares: "Float",
    recentPriceMomentum: "Recent Price Momentum",
    recentVolumeSpike: "Recent Volume Spike",
    squeezeRisk: "Squeeze Risk",
    missingSource: "Missing source",
    suggestedSource: "Suggested source",
    source: "Source",
    strength: "Strength",
    weak: "Weak",
    medium: "Medium",
    strong: "Strong",
    reasons: "Reasons",
    bullishReasons: "Bullish Reasons",
    bearishReasons: "Bearish / Risk Reasons",
    scoreLabel: "Score",
    stars: "Stars",
    assignmentRisk: "Assignment Risk",
    longTermActionLabel: "Long-Term View",
    currentOperationLabel: "Short-Term View",
    marketContextSummary: "Market Context Summary",
    profileCategory: "Category",
    premiumYield: "Premium Yield",
    maxPain: "Max Pain",
    impliedVolatility: "Implied Volatility",
    historicVolatility: "Historic Volatility",
    ivPercentile: "IV Percentile",
    ivRank: "IV Rank",
    netGex: "Net GEX",
    optionsFlow: "Options Flow",
    relativeVolume: "Relative Volume",
    closePosition: "Close Position",
    obv: "OBV",
    kdj: "KDJ",
    macdHistogram: "MACD Histogram",
    trendScore: "Trend Score",
    momentumScore: "Momentum Score",
    volumeConfirmationScore: "Volume Confirmation Score",
    financialHealthScore: "Financial Health Score",
    macroScore: "Macro Score",
    sectorScore: "Sector Score",
    newsScore: "News Score",
    institutionalScore: "Institutional Score",
    profileAdjustment: "Profile Adjustment",
    supportConfluenceBonus: "Support confluence bonus",
    technicalContribution: "Technical contribution",
    fundamentalContribution: "Fundamental contribution",
    optionsContribution: "Options contribution",
    marketContribution: "Market-context contribution",
    penalties: "Penalties",
    broadMacroNews: "Broad Macro News",
    companyNews: "Company News",
    treasuryYield: "Treasury Yield",
    economicCalendar: "Economic Calendar",
    federalFundsRate: "Fed Funds Rate",
    fomcRatePath: "FOMC Rate Path",
    companyNewsAnalysis: "Company News Analysis",
    addedPositions: "Added",
    reducedPositions: "Reduced",
    soldOutPositions: "Sold Out",
    shortPositions: "Short",
    idealBuyZoneHelp: "This zone is estimated from support, moving averages, options walls, and volatility. It does not guarantee price will return there.",
    sanityWarning: "Sanity warning",
    pivotZone: "Pivot Zone",
    missingData: "Missing data",
    warnings: "Warnings",
  },
  zh: {
    appTitle: "股票决策面板",
    refresh: "每 1 小时自动刷新",
    refreshNow: "立即刷新",
    refreshing: "刷新中...",
    lastRefresh: "上次刷新",
    nextRefresh: "下次刷新",
    partialCachedQuotes: "部分行情使用缓存",
    lastUpdate: "最后更新",
    syncedAt: "同步于",
    marketDataAt: "行情时间",
    stocks: "股票列表",
    sharedWatchlistHint: "共享 Watchlist：所有访问这个 Dashboard 的人都会看到同一个股票列表。",
    watchlistSyncFailed: "共享列表同步失败，当前显示缓存数据。",
    ticker: "搜索代码 / 缩写 / 名称",
    addStock: "添加股票",
    addSelected: "添加已选股票",
    removeStock: "删除股票",
    removeShort: "移除",
    price: "价格",
    longTermRating: "中长期操作（30-365天）",
    currentActionShort: "短期操作（1-30天）",
    currentAction: "短期操作（1-30天）",
    signalMix: "AI评分",
    heroGuide: "<strong>中长线</strong> = 中长期埋伏 / 持仓建议。 <strong>短线战术</strong> = 短期支撑阻力位置判断。 <strong>信号强度</strong> = 指标综合强弱，不等于直接买点。",
    action: "AI建议",
    analysisTitle: "支撑 / 阻力分析",
    analysisDesc: "仅用于短线战术判断。综合历史高低点、成交量分布、均线、斐波那契和布林带。",
    howTitle: "信号说明",
    howBody: "<strong>中长线</strong> 代表中长期、偏耐心的仓位建议。<strong>短线战术买入 / 观望 / 卖出</strong> 代表短期位置判断。<strong>信号强度</strong> 只是指标综合强弱，即使它较高，也不一定已经到了理想埋伏区。",
    howSmall: "例如：一只股票趋势很强，所以信号强度很高，但如果离支撑太远，中长线建议仍然可能是观望。",
    tactical: "短线战术",
    company: "公司",
    mixShort: "强度",
    buyWord: "买入",
    holdWord: "观望",
    sellWord: "卖出",
    indicators: "个指标",
    fallbackRefresh: "每 1 小时自动刷新一次 • 当前使用本地回退数据",
    unavailableRefresh: "行情源暂时不可用",
    staleRefresh: "当前使用上一次成功刷新结果",
    noMarketDataAdd: "没有可用的市场数据，无法添加。",
    noMarketData: "暂无行情数据",
    priceUnavailable: "价格暂不可用",
    searchHintIdle: "输入代码、缩写或公司名称，先从候选里点选，再添加。",
    searchHintLoading: "正在搜索候选股票...",
    searchHintEmpty: "暂时没有匹配到股票。",
    searchHintSelected: "已选择",
    searchMarketUs: "美股",
    searchMarketCn: "A股",
    searchExchange: "交易所",
    currentPrice: "当前价格",
    supportStrength: "支撑强度",
    resistanceStrength: "阻力强度",
    priceToSupport: "距支撑位",
    priceToResistance: "距阻力位",
    riskReward: "盈亏比",
    reading: "解读",
    bestSupport: "最佳支撑",
    bestResistance: "最佳阻力",
    supportGap: "第二支撑",
    resistanceGap: "第二阻力",
    supportLevel: "支撑位",
    resistanceLevel: "阻力位",
    pe: "市盈率",
    forwardPe: "远期市盈率",
    filterAll: "全部",
    filterUs: "美股",
    filterCn: "A股",
    filterMegaCap: "超大盘",
    filterGrowth: "成长股",
    filterSpeculative: "投机型",
    filterDividend: "分红型",
    filterValue: "价值股",
    sortAiScore: "AI总分",
    sortShortScore: "短期评分",
    sortMidScore: "中期评分",
    sortLongScore: "长期评分",
    sortTicker: "股票代码",
    sortStockType: "股票类型",
    sortDayMove: "今日涨跌",
    marketCap: "市值",
    closeDetail: "关闭详情",
    updatedAtShort: "更新于",
    compositeScore: "综合评分",
    todayClose: "今日收盘",
    prevClose: "昨日收盘",
    mainFlow: "主力资金",
    valuationState: "估值状态",
    sectionPriceVolume: "价格与成交量",
    sectionRsi: "RSI 超买超卖",
    sectionMacd: "MACD 趋势",
    sectionSupport: "支撑与阻力",
    sectionValuation: "估值与倍数",
    buyingPressure: "偏强买盘",
    sellingPressure: "偏弱卖压",
    neutralFlow: "多空均衡",
    low: "低",
    moderate: "中",
    elevated: "高",
    expensive: "偏贵",
    fair: "合理",
    attractive: "偏便宜",
    aiScore: "AI评分",
    overallAiScore: "综合AI分",
    ruleBasedScore: "规则分数",
    upside: "上涨空间",
    sortRisk: "风险",
    signalConsensus: "信号共识",
    confidence: "信号一致性",
    confidenceHelp: "根据买入、观望、卖出信号的一致程度计算。",
    currentSuggestion: "当前建议",
    dayMove: "今日涨跌",
    aiAnalysis: "AI分析总结",
    stockType: "股票分类",
    modelUsed: "当前模型",
    watchlistFit: "观察名单适配度",
    qualityScore: "质量评分",
    growthScore: "成长评分",
    valuationScore: "估值评分",
    investmentThesis: "投资逻辑",
    whyOwn: "看多逻辑",
    whatToWatch: "需要注意",
    longTermFit: "长期持有适配度",
    modelWeights: "模型权重",
    ratingSource: "评分来源",
    operatingMargin: "营业利润率",
    debtRatio: "资产负债率",
    cashReserve: "现金储备",
    fcfGrowth: "自由现金流增长",
    analystView: "分析师预期",
    guidance: "业绩指引",
    pegRatio: "PEG",
    evEbitda: "EV / EBITDA",
    psRatio: "市销率",
    valuationConclusion: "估值结论",
    technicalRisks: "技术面注意点",
    fundamentalRisks: "基本面注意点",
    flowRisks: "资金面注意点",
    megaCap: "超大盘",
    growthType: "成长股",
    valueType: "价值股",
    dividendType: "分红型",
    speculativeType: "投机型",
    turnaroundType: "困境反转",
    megaCapModel: "超大盘模型",
    growthModel: "成长模型",
    valueModel: "价值模型",
    dividendModel: "分红模型",
    speculativeModel: "投机模型",
    turnaroundModel: "反转模型",
    highQualityBusiness: "高质量企业",
    fastGrowingBusiness: "高速成长",
    reasonableValuation: "估值合理",
    richlyValued: "估值偏高",
    undervalued: "低估",
    fairlyValued: "合理",
    overvalued: "高估",
    suitableForWatchlist: "适合长期观察名单",
    suitableForAccumulation: "适合耐心分批布局",
    needsMoreProof: "还需要更多验证",
    unsuitableForLongTerm: "当前不适合长期持有",
    coreReasons: "核心原因",
    keyRisks: "主要风险",
    targetPrice: "目标价",
    stopPrice: "止损价",
    upsidePotential: "上涨空间",
    scoreBreakdown: "评分构成",
    weights: "权重",
    finalScore: "最终综合评分",
    yesterday: "昨天",
    today: "今天",
    scoreChange: "评分变化",
    scoreTrend: "评分趋势",
    actionPlan: "行动建议",
    waitZone: "等待区间",
    reevaluate: "重新评估",
    positionPlan: "建仓建议",
    firstEntry: "第一仓位",
    secondEntry: "第二仓位",
    riskRewardRatio: "风险收益比",
    targetRating: "评级",
    bullishFactors: "看多因素",
    bearishFactors: "看空因素",
    hoverForMore: "悬停查看",
    improving: "改善中",
    softening: "走弱中",
    technicalScore: "技术面",
    fundamentalScore: "基本面",
    moneyFlowScore: "资金面",
    riskScore: "风险",
    tabSummary: "总览",
    tabTechnical: "技术面",
    tabFundamental: "基本面",
    tabFlow: "资金面",
    tabOptions: "期权市场",
    tabNews: "新闻 / 市场环境",
    tabRisk: "风险",
    trendAnalysis: "趋势分析",
    shortTermTrend: "短期趋势",
    midTermTrend: "中期趋势",
    longTermTrend: "长期趋势",
    technicalConclusion: "技术面结论",
    fundamentalConclusion: "基本面结论",
    flowConclusion: "资金面结论",
    riskLevel: "风险等级",
    riskConclusion: "风险解读",
    valuation: "估值",
    revenueGrowth: "营收增长",
    profitGrowth: "利润增长",
    freeCashFlow: "自由现金流",
    volumeRatio: "量比",
    capitalFlow: "资金流向",
    aiRatingScaleStrongBuy: "强烈买入",
    aiRatingScaleBuy: "买入",
    aiRatingScaleHold: "持有 / 观望",
    aiRatingScaleSell: "卖出",
    aiRatingScaleStrongSell: "强烈卖出",
    aiRatingScaleShort: "做空",
    currentBuyCondition: "买入触发条件",
    shortTermPlan: "短线操作",
    longTermPlan: "中长期操作（30-365天）",
    shortSupport: "短线支撑",
    shortResistance: "短线压力",
    longSupport: "中长线支撑",
    longResistance: "中长线压力",
    buyWhen: "买入条件",
    waitZone: "等待位置",
    supportResistanceRead: "支撑 / 压力解读",
    distanceToSupport: "距离支撑位",
    distanceToResistance: "距离压力位",
    supportLevelShort: "S",
    resistanceLevelShort: "R",
    longSupportShort: "长S",
    longResistanceShort: "长R",
    newlyListedType: "新上市",
    newlyListedModel: "新股模型",
    technicalSummary: "技术面总结",
    fundamentalSummary: "基本面总结",
    moneyFlowSummary: "资金面总结",
    qualitySummary: "质量总结",
    growthSummary: "成长总结",
    valuationSummary: "估值总结",
    absorption: "吸筹",
    launch: "启动",
    markup: "拉升",
    shakeout: "洗盘",
    distribution: "派发",
    decline: "下跌",
    moneyFlowBehavior: "资金行为判断",
    moneyFlowStage: "资金阶段",
    neutralSetup: "等待更好的埋伏位置",
    scoreOutOf100: "/100",
    noSignalReason: "等待最新行情刷新。",
    optionsMarket: "期权市场",
    callWall: "Call Wall",
    putWall: "Put Wall",
    gammaFlip: "Gamma Flip",
    nearestExpiry: "最近到期日",
    optionBias: "期权解读",
    optionCoverage: "覆盖范围",
    optionsSummary: "期权总结",
    optionsUnavailable: "这个标的不提供可用的期权墙位数据。",
    callOi: "Call 持仓量",
    putOi: "Put 持仓量",
    optionsSupportive: "期权持仓结构偏支撑。",
    optionsCapped: "期权持仓结构偏压制。",
    optionsNeutral: "期权持仓结构中性。",
    aiDecision: "AI决策",
    shortTerm: "短期（1-30天）",
    midTerm: "中期（30-90天）",
    longTerm: "长期（90-180天）",
    confidencePct: "置信度",
    idealBuyZone: "理想买入区间",
    buyZoneReason: "区间依据",
    supportLevels: "支撑位",
    resistanceLevels: "压力位",
    nearestSupport: "最近支撑",
    strongestSupport: "最强支撑",
    nearestResistance: "最近压力",
    strongestResistance: "最强压力",
    strategyMatrix: "策略矩阵",
    buyStock: "直接买股票",
    addPosition: "加仓",
    cashSecuredPut: "Sell Put / 现金担保卖沽",
    coveredCall: "Covered Call",
    takeProfit: "止盈 / 减仓",
    waitNoAction: "等待 / 不操作",
    recommended: "推荐",
    neutral: "中性",
    avoid: "回避",
    suggestedZone: "建议区间",
    suggestedStrike: "建议行权价",
    suggestedDte: "建议到期",
    riskNote: "风险提示",
    topReasons: "核心原因",
    volumeConfirmation: "量能确认",
    trend: "趋势",
    momentum: "动量",
    technicalSummaryTitle: "技术面总结",
    quality: "质量",
    growth: "成长",
    financialHealth: "财务健康",
    fundamentalSummaryTitle: "基本面总结",
    keyStrengths: "核心优势",
    keyRisksTitle: "主要风险",
    marketContext: "市场环境",
    macro: "宏观",
    sectorTheme: "行业 / 主题",
    newsSentiment: "新闻情绪",
    institutionalInsider: "机构 / Insider",
    dataUnavailable: "数据暂不可用",
    companyProfile: "公司画像",
    profileTags: "画像标签",
    rating: "评级",
    summary: "总结",
    explanation: "说明",
    overallFundamentalView: "整体基本面判断",
    shortSqueezeRisk: "逼空风险",
    shortInterestPct: "卖空占流通股比例",
    shortInterestShares: "卖空股数",
    daysToCover: "回补天数",
    borrowFee: "借券费率 / 做空成本",
    utilization: "利用率",
    floatShares: "流通股本",
    recentPriceMomentum: "近期价格动能",
    recentVolumeSpike: "近期成交量放大",
    squeezeRisk: "逼空风险等级",
    missingSource: "缺失数据源",
    suggestedSource: "建议数据源",
    source: "来源",
    strength: "强度",
    weak: "弱",
    medium: "中",
    strong: "强",
    reasons: "原因",
    bullishReasons: "看多因素",
    bearishReasons: "看空 / 风险因素",
    scoreLabel: "评分",
    stars: "星级",
    assignmentRisk: "被行权风险",
    longTermActionLabel: "长期判断",
    currentOperationLabel: "短期判断",
    marketContextSummary: "市场环境总结",
    profileCategory: "类别",
    premiumYield: "权利金收益率",
    maxPain: "Max Pain",
    impliedVolatility: "隐含波动率",
    historicVolatility: "历史波动率",
    ivPercentile: "IV 百分位",
    ivRank: "IV Rank",
    netGex: "净 GEX",
    optionsFlow: "期权资金流",
    relativeVolume: "相对成交量",
    closePosition: "收盘位置",
    obv: "OBV",
    kdj: "KDJ",
    macdHistogram: "MACD 柱",
    trendScore: "趋势评分",
    momentumScore: "动量评分",
    volumeConfirmationScore: "量能确认评分",
    financialHealthScore: "财务健康评分",
    macroScore: "宏观评分",
    sectorScore: "行业评分",
    newsScore: "新闻评分",
    institutionalScore: "机构评分",
    profileAdjustment: "画像修正",
    supportConfluenceBonus: "支撑共振加分",
    technicalContribution: "技术面贡献",
    fundamentalContribution: "基本面贡献",
    optionsContribution: "期权贡献",
    marketContribution: "市场环境贡献",
    penalties: "惩罚项",
    broadMacroNews: "大环境新闻",
    companyNews: "公司新闻",
    treasuryYield: "美债利率",
    economicCalendar: "经济日历",
    federalFundsRate: "美国基准利率",
    fomcRatePath: "FOMC 利率变化",
    companyNewsAnalysis: "公司新闻分析",
    addedPositions: "加仓机构",
    reducedPositions: "减持机构",
    soldOutPositions: "清仓机构",
    shortPositions: "做空机构",
    idealBuyZoneHelp: "该区间基于支撑、均线、期权墙和波动率估算，不代表价格一定会回到该区间。",
    sanityWarning: "异常提醒",
    pivotZone: "中性枢轴区",
    missingData: "缺失数据",
    warnings: "提示",
  },
};

const COMPANY_NAME_MAP = {
  NVDA: { en: "NVIDIA", zh: "英伟达" },
  TSLA: { en: "Tesla", zh: "特斯拉" },
  AMD: { en: "AMD", zh: "超威半导体" },
  BABA: { en: "Alibaba", zh: "阿里巴巴" },
  GOOGL: { en: "Google", zh: "谷歌" },
  AMZN: { en: "Amazon", zh: "亚马逊" },
  AAPL: { en: "Apple", zh: "苹果" },
  CRCL: { en: "Circle", zh: "Circle" },
  FFAI: { en: "Faraday Future AI", zh: "法拉第未来" },
  HIMS: { en: "Hims & Hers", zh: "Hims & Hers" },
  MPT: { en: "Medical Properties Trust", zh: "医疗地产信托" },
  META: { en: "Meta", zh: "Meta" },
  MSFT: { en: "Microsoft", zh: "微软" },
  NFLX: { en: "Netflix", zh: "奈飞" },
  PLTR: { en: "Palantir", zh: "Palantir" },
  NOW: { en: "ServiceNow", zh: "ServiceNow" },
  SOFI: { en: "SoFi", zh: "SoFi" },
  TEM: { en: "Tempus AI", zh: "Tempus AI" },
  XE: { en: "XE", zh: "XE" },
  ZETA: { en: "Zeta Global", zh: "Zeta Global" },
  "002463": { en: "Hudian Corp.", zh: "沪电股份" },
  "300657": { en: "Hongxin Electronics", zh: "先导基电" },
  "603005": { en: "Anji Microelectronics", zh: "晶方科技" },
  "600522": { en: "Jiangsu Zhongtian Technology", zh: "中天科技" },
  "600641": { en: "Shanghai Vital Deeptech", zh: "万业企业" },
};

const PROFILE_TAG_LABELS = {
  MegaCap: { en: "Mega Cap", zh: "超大盘" },
  LargeCap: { en: "Large Cap", zh: "大盘" },
  MidCap: { en: "Mid Cap", zh: "中盘" },
  SmallCap: { en: "Small Cap", zh: "小盘" },
  MicroCap: { en: "Micro Cap", zh: "微盘" },
  Growth: { en: "Growth", zh: "成长" },
  HighGrowth: { en: "High Growth", zh: "高成长" },
  Mature: { en: "Mature", zh: "成熟型" },
  Declining: { en: "Declining", zh: "下滑" },
  Value: { en: "Value", zh: "价值" },
  ReasonableValuation: { en: "Reasonable Valuation", zh: "估值合理" },
  HighMultiple: { en: "High Multiple", zh: "高估值" },
  ExtremeValuation: { en: "Extreme Valuation", zh: "极高估值" },
  CashCow: { en: "Cash Cow", zh: "现金牛" },
  ProfitableGrowth: { en: "Profitable Growth", zh: "盈利成长" },
  UnprofitableGrowth: { en: "Unprofitable Growth", zh: "亏损成长" },
  CashBurn: { en: "Cash Burn", zh: "烧钱" },
  AI: { en: "AI", zh: "AI" },
  Semiconductor: { en: "Semiconductor", zh: "半导体" },
  AIInfrastructure: { en: "AI Infrastructure", zh: "AI基础设施" },
  Cloud: { en: "Cloud", zh: "云" },
  Ecommerce: { en: "E-commerce", zh: "电商" },
  Software: { en: "Software", zh: "软件" },
  Banking: { en: "Banking", zh: "银行" },
  AutoManufacturer: { en: "Auto Manufacturer", zh: "汽车制造" },
  RealEstate: { en: "Real Estate", zh: "房地产" },
  Industrial: { en: "Industrial", zh: "工业" },
  Advertising: { en: "Advertising", zh: "广告" },
  Crypto: { en: "Crypto", zh: "加密" },
  Stablecoin: { en: "Stablecoin", zh: "稳定币" },
  InterestRateSensitive: { en: "Rate Sensitive", zh: "利率敏感" },
  REIT: { en: "REIT", zh: "REIT" },
  Dividend: { en: "Dividend", zh: "分红" },
  IPO: { en: "IPO", zh: "新股" },
  Speculative: { en: "Speculative", zh: "投机" },
  StoryStock: { en: "Story Stock", zh: "叙事股" },
  Turnaround: { en: "Turnaround", zh: "反转" },
  Energy: { en: "Energy", zh: "能源" },
  Healthcare: { en: "Healthcare", zh: "医疗健康" },
  Biotech: { en: "Biotech", zh: "生物科技" },
  Fintech: { en: "Fintech", zh: "金融科技" },
  Defense: { en: "Defense", zh: "国防" },
  Consumer: { en: "Consumer", zh: "消费" },
  Cyclical: { en: "Cyclical", zh: "周期" },
  HighDebtRisk: { en: "High Debt Risk", zh: "高债务风险" },
  HighVolatility: { en: "High Volatility", zh: "高波动" },
  ChinaADR: { en: "China ADR", zh: "中概股" },
  USListed: { en: "US-listed", zh: "美股上市" },
  Global: { en: "Global", zh: "全球业务" },
  ChinaExposure: { en: "China Exposure", zh: "中国业务暴露" },
  HealthcareExposure: { en: "Healthcare Exposure", zh: "医疗客户暴露" },
  ConsumerExposure: { en: "Consumer Exposure", zh: "消费业务暴露" },
  FinancialExposure: { en: "Financial Exposure", zh: "金融客户暴露" },
  Meme: { en: "Meme", zh: "Meme" },
  Momentum: { en: "Momentum", zh: "动量" },
  EV: { en: "EV", zh: "电动车" },
  AShare: { en: "A Share", zh: "A股" },
  ChinaMarket: { en: "China Market", zh: "中国市场" },
  Cybersecurity: { en: "Cybersecurity", zh: "网络安全" },
  HealthcareServices: { en: "Healthcare Services", zh: "医疗服务" },
  NewlyListed: { en: "Newly Listed", zh: "新上市" },
};

const INDICATOR_LABELS = {
  ema12: { en: "EMA12", zh: "EMA12" },
  ema26: { en: "EMA26", zh: "EMA26" },
  macd: { en: "MACD", zh: "MACD" },
  rsi: { en: "RSI", zh: "RSI" },
  fibonacci: { en: "Fibonacci", zh: "斐波那契" },
  ma20: { en: "MA20", zh: "MA20" },
  ma50: { en: "MA50", zh: "MA50" },
  ma200: { en: "MA200", zh: "MA200" },
  volume: { en: "Volume", zh: "成交量" },
  upper: { en: "Upper Band", zh: "上轨" },
  middle: { en: "Middle Band", zh: "中轨" },
  lower: { en: "Lower Band", zh: "下轨" },
  rev: { en: "Revenue Growth", zh: "营收增长" },
  eps: { en: "EPS Growth", zh: "每股收益增长" },
  gross: { en: "Gross Margin", zh: "毛利率" },
  fcf: { en: "Free Cash Flow", zh: "自由现金流" },
  roe: { en: "ROE", zh: "净资产收益率" },
};

const GROUP_LABELS = {
  ema: { en: "EMA", zh: "指数均线" },
  momentum: { en: "Momentum", zh: "动量" },
  ma: { en: "MA", zh: "均线" },
  volume: { en: "Volume", zh: "成交量" },
  volatility: { en: "Volatility", zh: "波动区间" },
  fundamentals: { en: "Fundamentals", zh: "基本面" },
};

const indicatorDefs = [
  { key: "ema12", label: "EMA12", group: "tech", format: formatCurrency },
  { key: "ema26", label: "EMA26", group: "tech", format: formatCurrency },
  { key: "macd", label: "MACD", group: "tech", format: formatSignedCurrency },
  { key: "rsi", label: "RSI", group: "tech", format: formatOneDecimal },
  { key: "fibonacci", label: "Fibonacci", group: "tech", format: formatPercentage },
  { key: "ma20", label: "MA20", group: "tech", format: formatCurrency },
  { key: "ma50", label: "MA50", group: "tech", format: formatCurrency },
  { key: "ma200", label: "MA200", group: "tech", format: formatCurrency },
  { key: "volume", label: "Volume", group: "tech", format: formatCompactVolume },
  { key: "upper", label: "Upper Band", group: "tech", format: formatCurrency },
  { key: "middle", label: "Middle Band", group: "tech", format: formatCurrency },
  { key: "lower", label: "Lower Band", group: "tech", format: formatCurrency },
  { key: "rev", label: "Revenue Growth", group: "fundamental", format: formatPercentage },
  { key: "eps", label: "EPS Growth", group: "fundamental", format: formatPercentage },
  { key: "gross", label: "Gross Margin", group: "fundamental", format: formatPercentage },
  { key: "fcf", label: "Free Cash Flow", group: "fundamental", format: formatBillions },
  { key: "roe", label: "ROE", group: "fundamental", format: formatPercentage },
];

const signalGroupDefs = [
  { key: "ema", label: "EMA", keys: ["ema12", "ema26"], filter: "tech" },
  { key: "momentum", label: "Momentum", keys: ["macd", "rsi", "fibonacci"], filter: "tech" },
  { key: "ma", label: "MA", keys: ["ma20", "ma50", "ma200"], filter: "tech" },
  { key: "volume", label: "Volume", keys: ["volume"], filter: "tech" },
  { key: "volatility", label: "Volatility", keys: ["upper", "middle", "lower"], filter: "tech" },
  { key: "fundamentals", label: "Fundamentals", keys: ["rev", "eps", "gross", "fcf", "roe"], filter: "fundamental" },
];

const groups = indicatorDefs;

const profileByTicker = {
  NVDA: { seedPrice: 140, growth: 0.95, quality: 0.92, cash: 0.9, volatility: 0.72, sentiment: 0.9, note: "AI demand stays the main driver." },
  TSLA: { seedPrice: 250, growth: 0.58, quality: 0.45, cash: 0.3, volatility: 0.92, sentiment: 0.38, note: "Big upside, but momentum can turn fast." },
  AMD: { seedPrice: 140, growth: 0.72, quality: 0.72, cash: 0.68, volatility: 0.74, sentiment: 0.66, note: "Strong chip cycle, but still trend sensitive." },
  BABA: { seedPrice: 110, growth: 0.22, quality: 0.36, cash: 0.52, volatility: 0.55, sentiment: 0.22, note: "Valuation is appealing, but risk remains high." },
  GOOGL: { seedPrice: 180, growth: 0.88, quality: 0.9, cash: 0.94, volatility: 0.35, sentiment: 0.84, note: "High quality compounder with steady trend support." },
  AMZN: { seedPrice: 190, growth: 0.9, quality: 0.85, cash: 0.84, volatility: 0.42, sentiment: 0.8, note: "Earnings power is usually more important than short-term noise." },
  AAPL: { seedPrice: 210, growth: 0.62, quality: 0.92, cash: 0.9, volatility: 0.34, sentiment: 0.63, note: "Defensive growth with a premium multiple." },
  CRCL: { seedPrice: 120, growth: 0.56, quality: 0.58, cash: 0.5, volatility: 0.8, sentiment: 0.46, note: "Watch the chart closely; this one can move quickly." },
  FFAI: { seedPrice: 1.4, growth: 0.12, quality: 0.14, cash: -0.4, volatility: 0.96, sentiment: 0.12, note: "Very speculative and highly sensitive to price swings." },
  HIMS: { seedPrice: 60, growth: 0.7, quality: 0.54, cash: 0.42, volatility: 0.76, sentiment: 0.58, note: "Growth is strong, but valuation can run ahead." },
  MPT: { seedPrice: 4, growth: 0.08, quality: 0.2, cash: -0.2, volatility: 0.6, sentiment: 0.12, note: "Yield story matters more than momentum here." },
  META: { seedPrice: 560, growth: 0.86, quality: 0.92, cash: 0.95, volatility: 0.44, sentiment: 0.82, note: "Great example of a winner you still need to manage." },
  MSFT: { seedPrice: 470, growth: 0.82, quality: 0.96, cash: 0.95, volatility: 0.3, sentiment: 0.9, note: "Quality plus consistency usually deserves patience." },
  NFLX: { seedPrice: 650, growth: 0.66, quality: 0.8, cash: 0.7, volatility: 0.56, sentiment: 0.66, note: "Momentum and content cycle both matter." },
  PLTR: { seedPrice: 140, growth: 0.8, quality: 0.7, cash: 0.62, volatility: 0.86, sentiment: 0.74, note: "High momentum, high volatility, very sentiment driven." },
  NOW: { seedPrice: 900, growth: 0.78, quality: 0.88, cash: 0.78, volatility: 0.45, sentiment: 0.84, note: "Premium software compounder with strong trend quality." },
  SOFI: { seedPrice: 12, growth: 0.62, quality: 0.42, cash: 0.15, volatility: 0.86, sentiment: 0.44, note: "A story stock, so price action matters a lot." },
  TEM: { seedPrice: 55, growth: 0.18, quality: 0.24, cash: -0.1, volatility: 0.8, sentiment: 0.16, note: "Needs stronger proof of execution." },
  XE: { seedPrice: 20, growth: 0.4, quality: 0.38, cash: 0.18, volatility: 0.5, sentiment: 0.34, note: "Smaller-cap names can be noisy around key levels." },
  ZETA: { seedPrice: 25, growth: 0.52, quality: 0.5, cash: 0.35, volatility: 0.6, sentiment: 0.48, note: "Middle of the road until trend improves." },
};

const detailSparkPaths = {
  buy: "M0 94 L28 88 L56 80 L84 82 L112 74 L140 68 L168 58 L196 52 L224 44 L252 38 L280 42 L308 54 L336 66 L360 74",
  hold: "M0 90 L28 88 L56 84 L84 82 L112 80 L140 76 L168 72 L196 70 L224 68 L252 66 L280 66 L308 68 L336 70 L360 72",
  sell: "M0 42 L28 48 L56 54 L84 60 L112 66 L140 72 L168 78 L196 84 L224 90 L252 96 L280 100 L308 104 L336 108 L360 112",
};

const signalScoreMap = { buy: 1, hold: 0.5, sell: 0 };
let currentLanguage = loadLanguage();

function t(key) {
  return I18N[currentLanguage]?.[key] ?? I18N.en[key] ?? key;
}

function loadLanguage() {
  try {
    const cached = localStorage.getItem(LANGUAGE_CACHE_KEY);
    if (cached === "zh" || cached === "en") return cached;
  } catch {
    // ignore
  }
  return "en";
}

function persistLanguage(value) {
  try {
    localStorage.setItem(LANGUAGE_CACHE_KEY, value);
  } catch {
    // ignore
  }
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function mean(values) {
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function stdDev(values) {
  if (values.length < 2) return 0;
  const avg = mean(values);
  const variance = mean(values.map((value) => (value - avg) ** 2));
  return Math.sqrt(variance);
}

function ema(values, period) {
  if (values.length === 0) return null;
  const multiplier = 2 / (period + 1);
  let current = values[0];
  for (let i = 1; i < values.length; i += 1) {
    current = (values[i] - current) * multiplier + current;
  }
  return current;
}

function rsi(values, period = 14) {
  if (values.length <= period) return 50;
  let gains = 0;
  let losses = 0;
  for (let i = 1; i <= period; i += 1) {
    const diff = values[i] - values[i - 1];
    if (diff >= 0) gains += diff;
    else losses -= diff;
  }
  gains /= period;
  losses /= period;
  for (let i = period + 1; i < values.length; i += 1) {
    const diff = values[i] - values[i - 1];
    gains = ((gains * (period - 1)) + Math.max(diff, 0)) / period;
    losses = ((losses * (period - 1)) + Math.max(-diff, 0)) / period;
  }
  if (losses === 0) return 100;
  const rs = gains / losses;
  return 100 - 100 / (1 + rs);
}

function atr(highs, lows, closes, period = 14) {
  if (!highs.length || !lows.length || !closes.length) return null;
  const trueRanges = [];
  for (let i = 0; i < closes.length; i += 1) {
    const high = highs[i];
    const low = lows[i];
    const previousClose = i > 0 ? closes[i - 1] : closes[i];
    if (![high, low, previousClose].every(Number.isFinite)) continue;
    trueRanges.push(Math.max(
      high - low,
      Math.abs(high - previousClose),
      Math.abs(low - previousClose),
    ));
  }
  if (!trueRanges.length) return null;
  return mean(trueRanges.slice(-period)) ?? null;
}

function obv(closes, volumes) {
  if (!closes.length || !volumes.length) return null;
  let value = 0;
  for (let i = 1; i < closes.length; i += 1) {
    const volume = volumes[i] ?? 0;
    if (!Number.isFinite(volume)) continue;
    if (closes[i] > closes[i - 1]) value += volume;
    else if (closes[i] < closes[i - 1]) value -= volume;
  }
  return value;
}

function obvTrend(closes, volumes, period = 20) {
  if (!closes.length || !volumes.length || closes.length <= period + 1) return "unavailable";
  const end = obv(closes, volumes);
  const start = obv(closes.slice(0, -period), volumes.slice(0, -period));
  if (!Number.isFinite(end) || !Number.isFinite(start)) return "unavailable";
  const delta = end - start;
  const avgVolume = mean(volumes.slice(-period)) ?? 0;
  const threshold = Math.max(avgVolume * 0.5, 1);
  if (delta > threshold) return "rising";
  if (delta < -threshold) return "falling";
  return "neutral";
}

function finiteOrNull(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function positiveOrNull(value) {
  const numeric = finiteOrNull(value);
  return numeric != null && numeric > 0 ? numeric : null;
}

function averageLast(values, period) {
  const sample = values.slice(-period).filter((value) => Number.isFinite(value) && value >= 0);
  return sample.length ? mean(sample) : null;
}

function turnoverFromVolume(volume, shareBase) {
  const vol = positiveOrNull(volume);
  const shares = positiveOrNull(shareBase);
  return vol != null && shares != null ? (vol / shares) * 100 : null;
}

function upDownVolumeStats(closes, volumes, period) {
  if (!closes.length || !volumes.length || closes.length < 2) {
    return { upVolume: null, downVolume: null, ratio: null };
  }
  let upVolume = 0;
  let downVolume = 0;
  const start = Math.max(1, closes.length - period);
  for (let index = start; index < closes.length; index += 1) {
    const close = closes[index];
    const previousClose = closes[index - 1];
    const volume = volumes[index];
    if (![close, previousClose, volume].every(Number.isFinite)) continue;
    if (close > previousClose) upVolume += volume;
    else if (close < previousClose) downVolume += volume;
  }
  let ratio = null;
  if (downVolume > 0) ratio = upVolume / downVolume;
  else if (upVolume > 0) ratio = 9.99;
  return {
    upVolume: upVolume || null,
    downVolume: downVolume || null,
    ratio: ratio != null ? Number(ratio.toFixed(2)) : null,
  };
}

function volumeStageFromScore(score) {
  if (score >= 82) return "Strong Confirmation";
  if (score >= 64) return "Positive Confirmation";
  if (score <= 25) return "Very Weak Confirmation";
  if (score <= 42) return "Weak Confirmation";
  return "Neutral";
}

function localizedVolumeStage(stage) {
  if (currentLanguage !== "zh") return stage;
  return ({
    "Strong Confirmation": "强确认",
    "Positive Confirmation": "偏强",
    Neutral: "中性",
    "Weak Confirmation": "偏弱",
    "Very Weak Confirmation": "很弱",
  }[stage] || stage);
}

function weightedComponentScore(parts, weights) {
  const entries = Object.entries(weights);
  const totalWeight = entries.reduce((sum, [, weight]) => sum + weight, 0);
  if (!totalWeight) return 50;
  const weighted = entries.reduce((sum, [key, weight]) => sum + (neutralScore(parts[key]) * weight), 0);
  return clamp(Math.round(weighted / totalWeight), 0, 100);
}

function isSmallSpeculativeProfile(row, companyProfile) {
  const tags = companyProfile?.tags || companyProfile?.top_tags || [];
  const marketCap = row?.marketCap ?? null;
  return tags.some((tag) => ["SmallCap", "MicroCap", "Speculative", "HighVolatility", "IPO", "NewlyListed", "StoryStock"].includes(tag))
    || (Number.isFinite(marketCap) && marketCap < 5e9);
}

function turnoverActivityScore(turnoverRate, row, companyProfile) {
  if (!Number.isFinite(turnoverRate)) return 50;
  const marketType = schemaMarketTypeForTicker(row);
  const smallSpeculative = isSmallSpeculativeProfile(row, companyProfile);
  if (marketType === "CN_A_SHARE") {
    if (turnoverRate < 1) return 35;
    if (turnoverRate < 3) return 55;
    if (turnoverRate < 7) return 72;
    if (turnoverRate < 15) return 82;
    if (turnoverRate < 25) return 68;
    return 45;
  }
  if (smallSpeculative) {
    if (turnoverRate < 2) return 48;
    if (turnoverRate < 5) return 68;
    if (turnoverRate < 15) return 82;
    if (turnoverRate < 30) return 62;
    return 40;
  }
  if (turnoverRate < 0.5) return 38;
  if (turnoverRate < 1.5) return 58;
  if (turnoverRate < 3) return 74;
  if (turnoverRate < 5) return 82;
  return 56;
}

function scoreRelativeVolume(value) {
  if (!Number.isFinite(value)) return 50;
  if (value >= 2) return 88;
  if (value >= 1.5) return 78;
  if (value >= 1.2) return 65;
  if (value >= 0.8) return 52;
  return 38;
}

function scoreCloseLocation(value) {
  if (!Number.isFinite(value)) return 50;
  if (value >= 0.75) return 82;
  if (value >= 0.58) return 65;
  if (value >= 0.42) return 52;
  if (value >= 0.25) return 36;
  return 22;
}

function scoreObvTrendValue(value) {
  if (value === "rising") return 75;
  if (value === "falling") return 30;
  if (value === "neutral") return 52;
  return 50;
}

function scoreRatioConfirmation(value) {
  if (!Number.isFinite(value)) return 50;
  if (value >= 1.4) return 78;
  if (value >= 1.1) return 62;
  if (value >= 0.9) return 52;
  if (value >= 0.65) return 38;
  return 25;
}

function classifyVolumePriceBehavior({
  move,
  relativeVolume,
  turnoverRate,
  turnoverScore,
  closePosition,
  obvTrendValue,
  brokeResistance = false,
}) {
  const highTurnover = Number.isFinite(turnoverScore) && turnoverScore >= 72;
  const overheatedTurnover = Number.isFinite(turnoverRate) && turnoverScore <= 56 && turnoverRate > 5;
  if (move > 1 && brokeResistance && (relativeVolume ?? 1) < 1.2 && !highTurnover && obvTrendValue !== "rising") {
    return {
      key: "weak_breakout",
      score: 36,
      label: currentLanguage === "zh" ? "假突破风险" : "Weak Breakout Risk",
      summary: currentLanguage === "zh" ? "突破缺少量能、换手率和 OBV 确认。" : "Breakout lacks volume, turnover, and OBV confirmation.",
    };
  }
  if (move >= 2 && (relativeVolume ?? 1) >= 1.8 && (highTurnover || overheatedTurnover) && closePosition < 0.55 && obvTrendValue !== "rising") {
    return {
      key: "distribution_risk",
      score: 28,
      label: currentLanguage === "zh" ? "出货风险" : "Distribution Risk",
      summary: currentLanguage === "zh" ? "高换手巨量但收盘回落，OBV 未同步走强。" : "Heavy turnover and volume faded into the close without OBV confirmation.",
    };
  }
  if (move <= -2.5 && (relativeVolume ?? 1) >= 2 && highTurnover && closePosition <= 0.3 && obvTrendValue === "falling") {
    return {
      key: "panic_selling",
      score: 22,
      label: currentLanguage === "zh" ? "恐慌下跌" : "Panic Selling",
      summary: currentLanguage === "zh" ? "放量高换手下跌且收在低位，OBV 走弱。" : "High-volume, high-turnover selloff closed weak with falling OBV.",
    };
  }
  if (move > 0.5 && (relativeVolume ?? 1) >= 1.5 && closePosition > 0.7 && obvTrendValue === "rising" && highTurnover && !overheatedTurnover) {
    return {
      key: "strong_accumulation",
      score: 86,
      label: currentLanguage === "zh" ? "强吸筹信号" : "Strong Accumulation Signal",
      summary: currentLanguage === "zh" ? "上涨放量、收盘位置高、OBV 上升，换手活跃但未过热。" : "Higher volume, strong close, rising OBV, and healthy turnover confirm demand.",
    };
  }
  if (move < 0 && (relativeVolume ?? 1) < 0.9 && closePosition >= 0.45 && obvTrendValue !== "falling") {
    return {
      key: "healthy_pullback",
      score: 62,
      label: currentLanguage === "zh" ? "健康回调" : "Healthy Pullback",
      summary: currentLanguage === "zh" ? "下跌缩量、收盘不弱，OBV 没有明显流出。" : "Lower-volume decline held reasonably well without clear OBV outflow.",
    };
  }
  return {
    key: "neutral",
    score: 50,
    label: currentLanguage === "zh" ? "量价中性" : "Neutral Price / Volume",
    summary: currentLanguage === "zh" ? "量价关系没有给出强方向确认。" : "Price/volume relationship does not provide strong directional confirmation.",
  };
}

function scoreVolumeHorizon({
  movePct = 0,
  closePosition = 0.5,
  relativeVolume = null,
  turnoverRate = null,
  averageTurnover = null,
  obvTrendValue = "unavailable",
  upDownVolumeRatio = null,
  volumeTrendRatio = null,
  includeDailyMove = true,
}) {
  let score = 50;
  const direction = movePct > 0.25 ? 1 : movePct < -0.25 ? -1 : closePosition >= 0.58 ? 1 : closePosition <= 0.42 ? -1 : 0;

  if (includeDailyMove) {
    if (movePct >= 3) score += 14;
    else if (movePct >= 0.75) score += 7;
    else if (movePct <= -3) score -= 14;
    else if (movePct <= -0.75) score -= 7;
    if (closePosition >= 0.72) score += 8;
    else if (closePosition <= 0.28) score -= 8;
  } else {
    if (closePosition >= 0.72 && direction > 0) score += 3;
    else if (closePosition <= 0.28 && direction < 0) score -= 3;
  }

  if (Number.isFinite(relativeVolume)) {
    if (relativeVolume >= 1.6 && direction !== 0) score += direction * 10;
    else if (relativeVolume >= 1.2 && direction !== 0) score += direction * 6;
    else if (relativeVolume < 0.75 && movePct < 0) score += 5;
    else if (relativeVolume < 0.75 && movePct > 0) score -= 4;
  }

  if (Number.isFinite(turnoverRate)) {
    const turnoverRatio = Number.isFinite(averageTurnover) && averageTurnover > 0 ? turnoverRate / averageTurnover : null;
    if (Number.isFinite(turnoverRatio) && turnoverRatio >= 1.4 && direction !== 0) score += direction * 7;
    else if (Number.isFinite(turnoverRatio) && turnoverRatio <= 0.75 && movePct < 0) score += 3;
    else if (!Number.isFinite(turnoverRatio) && turnoverRate >= 3 && direction !== 0) score += direction * 4;
  }

  if (obvTrendValue === "rising") score += 8;
  else if (obvTrendValue === "falling") score -= 8;

  if (Number.isFinite(upDownVolumeRatio)) {
    if (upDownVolumeRatio >= 1.35) score += 8;
    else if (upDownVolumeRatio >= 1.12) score += 4;
    else if (upDownVolumeRatio <= 0.65) score -= 8;
    else if (upDownVolumeRatio <= 0.88) score -= 4;
  }

  if (Number.isFinite(volumeTrendRatio)) {
    if (volumeTrendRatio >= 1.15 && direction > 0) score += 5;
    else if (volumeTrendRatio >= 1.15 && direction < 0) score -= 5;
    else if (volumeTrendRatio <= 0.82 && movePct < 0) score += 3;
  }

  return clamp(Math.round(score), 0, 100);
}

function computeKdj(highs, lows, closes, period = 9) {
  if (closes.length < period || highs.length < period || lows.length < period) {
    return { k: 50, d: 50, j: 50 };
  }
  let k = 50;
  let d = 50;
  for (let i = period - 1; i < closes.length; i += 1) {
    const highWindow = Math.max(...highs.slice(i - period + 1, i + 1));
    const lowWindow = Math.min(...lows.slice(i - period + 1, i + 1));
    const rsv = highWindow === lowWindow ? 50 : ((closes[i] - lowWindow) / (highWindow - lowWindow)) * 100;
    k = (2 / 3) * k + (1 / 3) * rsv;
    d = (2 / 3) * d + (1 / 3) * k;
  }
  const j = 3 * k - 2 * d;
  return { k, d, j };
}

function localizedProfileTag(tag) {
  return PROFILE_TAG_LABELS[tag]?.[currentLanguage] ?? tag;
}

function localizedProfileEvidence(tag, evidence) {
  if (currentLanguage !== "zh") return evidence;
  const text = String(evidence || "");
  const exact = {
    "market cap >= 200B": "市值大于等于 200B",
    "market cap 10B-200B": "市值处于 10B-200B 区间",
    "market cap 2B-10B": "市值处于 2B-10B 区间",
    "market cap 300M-2B": "市值处于 300M-2B 区间",
    "market cap < 300M": "市值低于 300M",
    "six-digit A-share ticker": "6 位 A股代码",
    "company identity indicates China-based ADR / ADS listing": "公司身份显示为中国公司在美 ADR / ADS 上市",
    "China appears as revenue, manufacturing, supply chain, or market exposure rather than company identity": "中国更多体现为收入、制造、供应链或市场暴露，不是公司身份",
    "sector / industry / description points to chips or semiconductors": "行业、主营或描述指向芯片 / 半导体业务",
    "weak semiconductor keyword evidence": "仅有较弱的半导体关键词证据",
    "core description indicates direct AI product or infrastructure exposure": "主营描述显示直接 AI 产品或 AI 基础设施暴露",
    "description links products to AI compute or data-center infrastructure": "产品与 AI 算力或数据中心基础设施直接相关",
    "core business includes cloud platform / SaaS / hyperscale infrastructure": "核心业务包含云平台、SaaS 或超大规模云基础设施",
    "sector / description indicates software business model": "行业或主营描述显示软件商业模式",
    "description indicates e-commerce or marketplace business": "主营描述显示电商或平台 marketplace 业务",
    "sector / description indicates consumer exposure": "行业或主营描述显示消费业务暴露",
    "description / industry indicates REIT": "描述或行业显示 REIT 属性",
    "real estate business model": "主营为房地产相关商业模式",
    "REIT business model is rate sensitive": "REIT 商业模式对利率更敏感",
    "sector / core description indicates banking / lending / fintech business": "行业或主营描述显示银行、借贷或金融科技业务",
    "core description directly references crypto / blockchain / stablecoin / digital assets": "主营描述直接涉及加密资产、区块链、稳定币或数字资产",
    "sector / core description indicates vehicle manufacturing": "行业或主营描述显示整车制造业务",
    "industry / description indicates EV or auto manufacturing": "行业或主营描述显示电动车或汽车制造业务",
    "sector / description indicates energy exposure": "行业或主营描述显示能源业务暴露",
    "sector / industry or core business indicates healthcare": "行业或主营业务明确属于医疗健康",
    "description indicates biotech / drug development": "主营描述显示生物科技或药物研发业务",
    "description indicates defense / aerospace exposure": "主营描述显示国防或航空航天业务暴露",
    "positive free cash flow and strong margins": "自由现金流为正且利润率较强",
    "revenue growth >= 25% with positive cash flow": "营收增速大于等于 25%，且现金流为正",
    "revenue growth >= 10%": "营收增速大于等于 10%",
    "growth supported by positive free cash flow": "增长由正自由现金流支撑",
    "recent listing / limited trading history": "上市时间较短或交易历史有限",
    "valuation multiples are elevated versus broad market norms": "估值倍数高于市场常规水平",
    "high realized volatility or large recent move": "实际波动较高或近期涨跌幅较大",
    "weak cash flow / earnings and high uncertainty": "现金流或盈利较弱，业务不确定性较高",
    "debt metrics indicate elevated balance-sheet risk": "债务指标显示资产负债表风险偏高",
  };
  return exact[text] || text;
}

function localizedDashboardText(value) {
  if (value == null) return value;
  if (currentLanguage !== "zh") return value;
  const text = String(value);
  const exact = {
    "Market environment is balanced.": "市场环境整体均衡。",
    "Market context is neutral.": "市场环境中性。",
    "Price is trading near a strong support.": "价格靠近强支撑位。",
    "Weak Momentum": "动能偏弱",
    "Healthy Bullish": "健康偏多",
    "Bullish": "偏多",
    "Bearish": "偏弱",
    "Neutral": "中性",
    "Oversold": "超卖",
    "Overbought": "超买",
    "Upper Band": "接近布林上轨",
    "Lower Band": "接近布林下轨",
    "Middle Band": "接近布林中轨",
    "Near middle band": "接近布林中轨",
    "rising": "上行",
    "falling": "下行",
    "flat": "走平",
    "supportive": "偏支持",
    "cautious": "偏谨慎",
    "Extreme Fear": "极度恐慌",
    "Fear": "恐慌",
    "Greed": "贪婪",
    "Extreme Greed": "极度贪婪",
    "Low": "低",
    "Medium": "中等",
    "High": "高",
    "Elevated": "偏高",
    "low": "低",
    "medium": "中等",
    "high": "高",
    "unavailable": "数据暂不可用",
    "Primary Buy Zone": "主要买入区",
    "Current Entry Stop": "当前价止损",
  };
  if (exact[text]) return exact[text];
  return text
    .replaceAll("Market environment is balanced.", "市场环境整体均衡。")
    .replaceAll("Primary Buy Zone", "主要买入区")
    .replaceAll("Current Entry Stop", "当前价止损")
    .replaceAll("Weak Momentum", "动能偏弱")
    .replaceAll("Rising", "上行")
    .replaceAll("Falling", "下行")
    .replaceAll("Neutral", "中性")
    .replaceAll("Bullish", "偏多")
    .replaceAll("Bearish", "偏弱");
}

function localizedScoreItemName(name) {
  if (currentLanguage !== "zh") return name;
  const labels = {
    near_strong_support: "靠近强支撑",
    near_put_wall: "靠近 Put Wall 支撑",
    near_gamma_flip_support: "靠近 Gamma Flip 支撑",
    oversold_at_support: "支撑附近超卖",
    price_inside_ideal_buy_zone: "价格位于买入区",
    price_below_ma20: "价格低于 MA20",
    price_below_ma50: "价格低于 MA50",
    price_below_ma200: "价格低于 MA200",
    ma_bearish_stack: "均线结构偏空",
    macd_bearish: "MACD 偏空",
    rsi_weak: "RSI 偏弱",
    volume_no_confirmation: "量能未确认",
    support_breakdown: "跌破支撑",
    bearish_options_structure: "期权结构偏弱",
    price_below_gamma_flip: "价格低于 Gamma Flip",
    call_wall_too_close: "Call Wall 压力较近",
    put_wall_broken: "Put Wall 支撑失效",
    risk_off_regime: "市场风险偏谨慎",
    sector_weakness: "行业表现偏弱",
    rate_pressure_profile: "利率压力较高",
    extreme_greed: "市场过度贪婪",
    regulation_risk: "监管风险",
    missing_critical_data: "关键数据缺失",
    ideal_buy_zone_outlier: "买入区偏离过大",
    pe_too_high: "PE 偏高",
    forward_pe_too_high: "Forward PE 偏高",
    peg_too_high: "PEG 偏高",
    ps_too_high: "PS 偏高",
    ev_ebitda_too_high: "EV/EBITDA 偏高",
    price_fcf_too_high: "Price/FCF 偏高",
    revenue_growth_slowing: "营收增速放缓",
    eps_growth_slowing: "EPS 增速放缓",
    free_cash_flow_weak: "自由现金流偏弱",
    debt_too_high: "债务压力偏高",
    margin_deterioration: "利润率恶化",
    cash_flow_instability: "现金流稳定性不足",
    growth_execution: "成长兑现较好",
    cash_cow_quality: "现金牛质量较高",
    dividend_cover: "分红覆盖较好",
    speculative_catalyst: "投机催化较强",
    risk_on_tape: "市场风险偏好较强",
    yield_relief: "利率压力缓和",
    contrarian_fear: "恐慌后的逆向机会",
  };
  return labels[name] || String(name || "").replaceAll("_", " ");
}

function strengthLabelForSide(strength, side) {
  if (currentLanguage !== "zh") return localizedStrength(strength);
  if (side === "resistance") {
    if (strength === "strong") return "强压力";
    if (strength === "medium") return "中等压力";
    return "弱压力";
  }
  if (strength === "strong") return "强支撑";
  if (strength === "medium") return "中等支撑";
  return "弱支撑";
}

function latest(values) {
  return values.length ? values[values.length - 1] : null;
}

function inferCurrencyCode(subject, exchangeName = "") {
  const normalizedExchange = String(exchangeName || "").toUpperCase();
  const raw = typeof subject === "string"
    ? subject
    : typeof subject?.symbol === "string"
      ? subject.symbol
      : typeof subject?.ticker === "string"
        ? subject.ticker
        : "";
  const normalized = raw.toUpperCase();

  if (
    normalized.endsWith(".SZ")
    || normalized.endsWith(".SS")
    || /^\d{6}$/.test(normalized)
    || normalizedExchange === "SZ"
    || normalizedExchange === "SH"
    || normalizedExchange === "SS"
  ) {
    return "CNY";
  }
  return "USD";
}

function formatCurrency(value, currencyCode = "USD") {
  if (value == null || !Number.isFinite(Number(value))) return "—";
  const symbol = currencyCode === "CNY" ? "¥" : "$";
  return `${symbol}${Number(value).toFixed(2)}`;
}

function formatCurrentPrice(value, currencyCode = "USD") {
  if (value == null || !Number.isFinite(Number(value))) return t("priceUnavailable");
  return formatCurrency(value, currencyCode);
}

function formatOptionStrike(value, currencyCode = "USD") {
  if (value == null || !Number.isFinite(Number(value))) return "—";
  const symbol = currencyCode === "CNY" ? "¥" : "$";
  const numeric = Number(value);
  let text = "";
  if (Math.abs(numeric - Math.round(numeric)) < 1e-6) {
    text = String(Math.round(numeric));
  } else if (Math.abs((numeric * 2) - Math.round(numeric * 2)) < 1e-6) {
    text = numeric.toFixed(1);
  } else {
    text = numeric.toFixed(2).replace(/\.?0+$/, "");
  }
  return `${symbol}${text}`;
}

function formatSignedCurrency(value, currencyCode = "USD") {
  if (value == null || !Number.isFinite(Number(value))) return "—";
  const symbol = currencyCode === "CNY" ? "¥" : "$";
  return `${value >= 0 ? "+" : "-"}${symbol}${Math.abs(Number(value)).toFixed(2)}`;
}

function formatOneDecimal(value) {
  return value == null ? "—" : Number(value).toFixed(1);
}

function formatPercentage(value) {
  return value == null ? "—" : `${(Number(value) * 100).toFixed(1)}%`;
}

function formatPercentValue(value, decimals = 2) {
  if (value == null || !Number.isFinite(Number(value))) return "—";
  return `${Number(value).toFixed(decimals)}%`;
}

function formatBillions(value) {
  if (value == null) return "—";
  const abs = Math.abs(Number(value));
  const suffix = abs >= 1 ? "B" : "M";
  const scaled = abs >= 1 ? abs : abs * 1000;
  return `${value >= 0 ? "+" : "-"}${scaled.toFixed(1)}${suffix}`;
}

function formatLargeCurrency(value, currencyCode = "USD") {
  if (value == null || !Number.isFinite(Number(value))) return "—";
  const num = Number(value);
  const symbol = currencyCode === "CNY" ? "¥" : "$";
  if (currentLanguage === "zh") {
    if (Math.abs(num) >= 1e12) return `${symbol}${(num / 1e12).toFixed(2)}万亿`;
    if (Math.abs(num) >= 1e11) return `${symbol}${(num / 1e11).toFixed(2)}千亿`;
    if (Math.abs(num) >= 1e8) return `${symbol}${(num / 1e8).toFixed(2)}亿`;
  }
  if (Math.abs(num) >= 1e12) return `${symbol}${(num / 1e12).toFixed(2)}T`;
  if (Math.abs(num) >= 1e9) return `${symbol}${(num / 1e9).toFixed(1)}B`;
  if (Math.abs(num) >= 1e6) return `${symbol}${(num / 1e6).toFixed(1)}M`;
  return formatCurrency(num, currencyCode);
}

function formatRatio(value) {
  if (value == null || !Number.isFinite(Number(value))) return "—";
  return Number(value).toFixed(1);
}

function formatCompactVolume(value) {
  if (value == null) return "—";
  const abs = Math.abs(Number(value));
  if (abs >= 1e9) return `${(value / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${(value / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `${(value / 1e3).toFixed(1)}K`;
  return Number(value).toFixed(0);
}

function signalLabel(value) {
  return localizedActionLabel(value.charAt(0).toUpperCase() + value.slice(1));
}

function localizedActionLabel(value) {
  if (currentLanguage === "zh") {
    if (value === "Strong Buy") return "强烈买入";
    if (value === "Buy") return "买入";
    if (value === "Weak Hold") return "弱持有 / 减仓观察";
    if (value === "Reduce") return "减仓";
    if (value === "Short") return "做空";
    if (value === "Strong Sell") return "强烈卖出";
    if (value === "Sell") return "卖出";
    if (value === "Hold") return "持有 / 观望";
    if (value === "N/A") return "无数据";
  }
  if (value === "Hold") return "Hold / Watch";
  if (value === "Sell") return "Sell / Reduce";
  return value;
}

function localizedTrendLabel(value) {
  if (currentLanguage === "zh") {
    if (value === "up") return "走强";
    if (value === "down") return "走弱";
    if (value === "flat") return "横盘";
  }
  return value?.toUpperCase?.() ?? value;
}

function localizedIndicatorLabel(key, fallback = key) {
  return INDICATOR_LABELS[key]?.[currentLanguage] ?? fallback;
}

function localizedGroupLabel(key, fallback = key) {
  return GROUP_LABELS[key]?.[currentLanguage] ?? fallback;
}

function companyNameForTicker(ticker, market = {}) {
  const mapped = COMPANY_NAME_MAP[ticker];
  if (mapped?.[currentLanguage]) return mapped[currentLanguage];
  if (currentLanguage === "zh" && mapped?.zh) return mapped.zh;
  if (currentLanguage === "en" && mapped?.en) return mapped.en;
  return market.longName || market.shortName || ticker;
}

function exchangeCodeForTicker(ticker, market = {}) {
  const raw = market.symbol?.split(".")?.[1] || market.exchangeName;
  if (raw) return raw;
  if (/^\d{6}$/.test(ticker)) {
    if (ticker.startsWith("6")) return "SH";
    if (ticker.startsWith("0") || ticker.startsWith("3")) return "SZ";
  }
  return "—";
}

function signalClass(signal) {
  return signal;
}

function signalArrow(signal) {
  if (signal === "buy") return "↑";
  if (signal === "sell") return "↓";
  return "—";
}

function seedFromTicker(ticker) {
  return ticker.split("").reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
}

function mulberry32(seed) {
  return function next() {
    let t = seed += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function defaultProfileForTicker(ticker) {
  const rand = mulberry32(seedFromTicker(ticker));
  const seedPrice = Math.max(1.5, 15 + rand() * 320);
  return {
    seedPrice,
    growth: 0.15 + rand() * 0.7,
    quality: 0.2 + rand() * 0.6,
    cash: -0.2 + rand() * 1.0,
    volatility: 0.35 + rand() * 0.55,
    sentiment: 0.2 + rand() * 0.6,
    note: "Custom ticker added manually.",
  };
}

function profileForTicker(ticker) {
  return profileByTicker[ticker] || defaultProfileForTicker(ticker);
}

function syntheticHistory(ticker, seedPrice, volatility) {
  const rand = mulberry32(seedFromTicker(ticker));
  const closes = [];
  const highs = [];
  const lows = [];
  const volumes = [];
  let price = seedPrice * (0.84 + rand() * 0.2);
  for (let day = 0; day < 252; day += 1) {
    const drift = (rand() - 0.5) * volatility * 0.06 + (day / 252 - 0.5) * 0.004;
    price = Math.max(0.5, price * (1 + drift));
    const spread = Math.max(price * (0.01 + volatility * 0.02), 0.05);
    closes.push(price);
    highs.push(price + spread * (0.4 + rand()));
    lows.push(Math.max(0.1, price - spread * (0.4 + rand())));
    volumes.push(Math.round(250000 + rand() * 2500000 * (0.5 + volatility)));
  }
  return { closes, highs, lows, volumes };
}

function normalizeHistory(history, fallbackPrice, volatility, ticker, allowSynthetic = true) {
  const closes = Array.isArray(history?.closes) ? history.closes.filter((value) => Number.isFinite(value)) : [];
  const highs = Array.isArray(history?.highs) ? history.highs.filter((value) => Number.isFinite(value)) : [];
  const lows = Array.isArray(history?.lows) ? history.lows.filter((value) => Number.isFinite(value)) : [];
  const volumes = Array.isArray(history?.volumes) ? history.volumes.filter((value) => Number.isFinite(value)) : [];

  if (closes.length >= 30 && highs.length >= 30 && lows.length >= 30 && volumes.length >= 30) {
    return {
      closes: closes.slice(-252),
      highs: highs.slice(-252),
      lows: lows.slice(-252),
      volumes: volumes.slice(-252),
      synthetic: false,
    };
  }

  if (!allowSynthetic) {
    return {
      closes,
      highs,
      lows,
      volumes,
      synthetic: false,
    };
  }

  return {
    ...syntheticHistory(ticker, fallbackPrice, volatility),
    synthetic: true,
  };
}

function classify(value, lower, upper, reversed = false) {
  if (value == null || Number.isNaN(value)) return { signal: "hold", trend: "flat" };
  if (!reversed) {
    if (value <= lower) return { signal: "sell", trend: "down" };
    if (value >= upper) return { signal: "buy", trend: "up" };
  } else {
    if (value <= lower) return { signal: "buy", trend: "up" };
    if (value >= upper) return { signal: "sell", trend: "down" };
  }
  return { signal: "hold", trend: "flat" };
}

function volumeCompositeSignal(changePercent, volumeRatio, closePosition) {
  const strongUp = changePercent >= 3;
  const mildUp = changePercent >= 0.8 && changePercent < 3;
  const mildDown = changePercent <= -0.8 && changePercent > -3;
  const strongDown = changePercent <= -3;
  const highClose = closePosition >= 0.7;
  const lowClose = closePosition <= 0.3;
  const midClose = closePosition > 0.3 && closePosition < 0.7;
  const heavyVolume = volumeRatio >= 1.3;
  const hugeVolume = volumeRatio >= 1.8;
  const lightVolume = volumeRatio <= 0.85;

  if (strongUp && heavyVolume && highClose) return { signal: "buy", trend: "up", reason: "大涨 + 放量 + 收在高位" };
  if (strongUp && lightVolume && highClose) return { signal: "hold", trend: "flat", reason: "大涨 + 缩量 + 仍收在高位" };
  if (strongUp && heavyVolume && !highClose) return { signal: "sell", trend: "down", reason: "大涨 + 放量 + 收盘回落" };

  if (mildUp && heavyVolume && highClose) return { signal: "buy", trend: "up", reason: "小涨 + 放量 + 收在高位" };
  if (mildUp && hugeVolume && !highClose) return { signal: "sell", trend: "down", reason: "小涨 + 巨量 + 收盘不强" };
  if (mildUp && lightVolume && midClose) return { signal: "hold", trend: "flat", reason: "小涨 + 缩量 + 中性收盘" };

  if (strongDown && heavyVolume && lowClose) return { signal: "sell", trend: "down", reason: "下跌 + 放量 + 收在低位" };
  if (strongDown && lightVolume && !lowClose) return { signal: "hold", trend: "flat", reason: "下跌 + 缩量 + 收稳" };
  if (mildDown && heavyVolume && lowClose) return { signal: "sell", trend: "down", reason: "小跌 + 放量 + 收在低位" };
  if (mildDown && lightVolume && !lowClose) return { signal: "hold", trend: "flat", reason: "小跌 + 缩量 + 收稳" };

  if (heavyVolume && highClose && changePercent >= 0) return { signal: "buy", trend: "up", reason: "放量且收在高位" };
  if (heavyVolume && lowClose && changePercent < 0) return { signal: "sell", trend: "down", reason: "放量但收在低位" };
  if (lightVolume && midClose) return { signal: "hold", trend: "flat", reason: "缩量且收盘中性" };

  return { signal: "hold", trend: "flat", reason: "组合信号中性" };
}

function normalizeScore(value, max = 100) {
  return clamp(Math.round(value), 0, max);
}

function sliceTail(values, count) {
  return Array.isArray(values) ? values.slice(-count).filter((value) => Number.isFinite(value)) : [];
}

function countTouches(level, highs, lows, closes, tolerancePct = 0.012) {
  const tolerance = Math.max(level * tolerancePct, 0.01);
  let touches = 0;
  for (let index = 0; index < closes.length; index += 1) {
    const high = highs[index];
    const low = lows[index];
    const close = closes[index];
    if (
      (Number.isFinite(high) && Number.isFinite(low) && low <= level + tolerance && high >= level - tolerance) ||
      (Number.isFinite(close) && Math.abs(close - level) <= tolerance)
    ) {
      touches += 1;
    }
  }
  return touches;
}

function addCandidate(list, side, price, weight, source, label, meta = {}) {
  if (!Number.isFinite(price) || !Number.isFinite(weight) || weight <= 0) return;
  list.push({
    side,
    price,
    weight,
    source,
    label,
    meta,
  });
}

function buildHistoricalCandidates(closes, highs, lows, close) {
  const candidates = [];
  const windows = [
    { count: 63, share: 0.5 },
    { count: 126, share: 0.3 },
    { count: 252, share: 0.2 },
  ];

  windows.forEach(({ count, share }) => {
    const start = Math.max(0, closes.length - count);
    const closeSlice = closes.slice(start);
    const highSlice = highs.slice(start);
    const lowSlice = lows.slice(start);
    const length = closeSlice.length;
    if (!length) return;

    const pad = Math.min(3, Math.max(2, Math.floor(length / 20)));
    for (let i = pad; i < length - pad; i += 1) {
      const windowLows = lowSlice.slice(i - pad, i + pad + 1);
      const windowHighs = highSlice.slice(i - pad, i + pad + 1);
      const low = lowSlice[i];
      const high = highSlice[i];
      const lowTouches = countTouches(low, highs, lows, closes);
      const highTouches = countTouches(high, highs, lows, closes);
      const recency = 0.75 + (i / Math.max(1, length - 1)) * 0.25;
      if (Number.isFinite(low) && low <= Math.min(...windowLows) + 1e-9) {
        const weight = 35 * share * recency * (1 + Math.min(4, Math.max(0, lowTouches - 1)) * 0.08);
        addCandidate(candidates, low <= close ? "support" : "resistance", low, weight, "historical", `${count / 21}m pivot low`, { touches: lowTouches, window: count });
      }
      if (Number.isFinite(high) && high >= Math.max(...windowHighs) - 1e-9) {
        const weight = 35 * share * recency * (1 + Math.min(4, Math.max(0, highTouches - 1)) * 0.08);
        addCandidate(candidates, high >= close ? "resistance" : "support", high, weight, "historical", `${count / 21}m pivot high`, { touches: highTouches, window: count });
      }
    }

    const windowLow = Math.min(...lowSlice);
    const windowHigh = Math.max(...highSlice);
    const lowTouches = countTouches(windowLow, highs, lows, closes);
    const highTouches = countTouches(windowHigh, highs, lows, closes);
    addCandidate(candidates, windowLow <= close ? "support" : "resistance", windowLow, 35 * share * 0.7 * (1 + Math.min(4, Math.max(0, lowTouches - 1)) * 0.06), "historical", `${count / 21}m swing low`, { touches: lowTouches, window: count });
    addCandidate(candidates, windowHigh >= close ? "resistance" : "support", windowHigh, 35 * share * 0.7 * (1 + Math.min(4, Math.max(0, highTouches - 1)) * 0.06), "historical", `${count / 21}m swing high`, { touches: highTouches, window: count });
  });

  return candidates;
}

function buildVolumeProfileCandidates(closes, highs, lows, volumes, close) {
  const candidates = [];
  if (!closes.length || !highs.length || !lows.length || !volumes.length) return candidates;

  const rangeLow = Math.min(...lows);
  const rangeHigh = Math.max(...highs);
  const bandRange = Math.max(rangeHigh - rangeLow, Math.max(close * 0.01, 1));
  const binCount = clamp(Math.round(Math.min(30, Math.max(18, Math.sqrt(closes.length) * 2.5))), 18, 30);
  const binSize = bandRange / binCount;
  const bins = Array.from({ length: binCount }, () => 0);

  for (let i = 0; i < closes.length; i += 1) {
    const low = lows[i];
    const high = highs[i];
    const volume = volumes[i];
    if (!Number.isFinite(low) || !Number.isFinite(high) || !Number.isFinite(volume)) continue;

    const startBin = clamp(Math.floor((low - rangeLow) / binSize), 0, binCount - 1);
    const endBin = clamp(Math.floor((high - rangeLow) / binSize), 0, binCount - 1);
    const span = Math.max(1, endBin - startBin + 1);
    for (let bin = startBin; bin <= endBin; bin += 1) {
      bins[bin] += volume / span;
    }
  }

  const maxVolume = Math.max(...bins, 0);
  if (!maxVolume) return candidates;

  const nodes = bins.map((volume, index) => ({
    price: rangeLow + (index + 0.5) * binSize,
    volume,
  }));

  const below = nodes.filter((node) => node.price <= close).sort((a, b) => b.volume - a.volume).slice(0, 3);
  const above = nodes.filter((node) => node.price >= close).sort((a, b) => b.volume - a.volume).slice(0, 3);

  below.forEach((node, index) => {
    const closeness = clamp(1 - ((close - node.price) / close) / 0.22, 0.4, 1);
    const weight = 30 * (node.volume / maxVolume) * closeness * (index === 0 ? 1 : 0.86);
    addCandidate(candidates, "support", node.price, weight, "volume", `Volume node ${index + 1}`, { volume: node.volume });
  });

  above.forEach((node, index) => {
    const closeness = clamp(1 - ((node.price - close) / close) / 0.22, 0.4, 1);
    const weight = 30 * (node.volume / maxVolume) * closeness * (index === 0 ? 1 : 0.86);
    addCandidate(candidates, "resistance", node.price, weight, "volume", `Volume node ${index + 1}`, { volume: node.volume });
  });

  return candidates;
}

function buildMovingAverageCandidates(close, technicals) {
  const candidates = [];
  const maDefs = [
    { label: "MA20", value: technicals.ma20 },
    { label: "MA50", value: technicals.ma50 },
    { label: "MA100", value: technicals.ma100 },
    { label: "MA200", value: technicals.ma200 },
  ];

  maDefs.forEach((item) => {
    if (!Number.isFinite(item.value)) return;
    const side = item.value <= close ? "support" : "resistance";
    const distancePct = Math.abs(close - item.value) / Math.max(close, 1);
    const closeness = clamp(1 - distancePct / 0.08, 0.4, 1);
    const weight = 20 * 0.25 * closeness;
    addCandidate(candidates, side, item.value, weight, "ma", item.label, { distancePct });
  });

  return candidates;
}

function buildFibonacciCandidates(close, rangeLow, rangeHigh) {
  const candidates = [];
  const range = rangeHigh - rangeLow;
  if (!Number.isFinite(range) || range <= 0) return candidates;

  const fibMap = new Map([
    [0.236, 1.0],
    [0.382, 1.0],
    [0.5, 0.85],
    [0.618, 1.0],
    [0.786, 0.95],
  ]);

  fibMap.forEach((strength, ratio) => {
    const price = rangeLow + range * ratio;
    const side = price <= close ? "support" : "resistance";
    const distancePct = Math.abs(close - price) / Math.max(close, 1);
    const closeness = clamp(1 - distancePct / 0.14, 0.45, 1);
    const weight = 10 * strength * closeness;
    addCandidate(candidates, side, price, weight, "fib", `Fib ${Math.round(ratio * 1000) / 10}%`, { ratio });
  });

  return candidates;
}

function buildBollingerCandidates(close, technicals) {
  const candidates = [];
  if (Number.isFinite(technicals.lowerBand)) {
    const lowerDistance = Math.abs(close - technicals.lowerBand) / Math.max(close, 1);
    addCandidate(candidates, "support", technicals.lowerBand, 5 * clamp(1 - lowerDistance / 0.12, 0.5, 1), "bollinger", "Lower band", { band: "lower" });
  }
  if (Number.isFinite(technicals.middleBand)) {
    const side = technicals.middleBand <= close ? "support" : "resistance";
    const middleDistance = Math.abs(close - technicals.middleBand) / Math.max(close, 1);
    addCandidate(candidates, side, technicals.middleBand, 2.5 * clamp(1 - middleDistance / 0.12, 0.5, 1), "bollinger", "Middle band", { band: "middle" });
  }
  if (Number.isFinite(technicals.upperBand)) {
    const upperDistance = Math.abs(close - technicals.upperBand) / Math.max(close, 1);
    addCandidate(candidates, "resistance", technicals.upperBand, 5 * clamp(1 - upperDistance / 0.12, 0.5, 1), "bollinger", "Upper band", { band: "upper" });
  }

  return candidates;
}

function buildOptionsCandidates(close, optionsMarket) {
  const candidates = [];
  if (!optionsMarket?.available) return candidates;

  const callWall = optionsMarket.callWall?.strike;
  const putWall = optionsMarket.putWall?.strike;
  const gammaFlip = optionsMarket.gammaFlip?.strike;
  const callOi = optionsMarket.callWall?.openInterest ?? 0;
  const putOi = optionsMarket.putWall?.openInterest ?? 0;
  const totalCallOi = optionsMarket.totalCallOpenInterest ?? callOi;
  const totalPutOi = optionsMarket.totalPutOpenInterest ?? putOi;
  const callWeight = 15 * clamp(callOi / Math.max(totalCallOi, 1), 0.45, 1);
  const putWeight = 15 * clamp(putOi / Math.max(totalPutOi, 1), 0.45, 1);

  if (Number.isFinite(putWall)) {
    addCandidate(
      candidates,
      putWall <= close ? "support" : "resistance",
      putWall,
      putWeight,
      "options",
      "Put wall",
      { openInterest: putOi },
    );
  }

  if (Number.isFinite(callWall)) {
    addCandidate(
      candidates,
      callWall >= close ? "resistance" : "support",
      callWall,
      callWeight,
      "options",
      "Call wall",
      { openInterest: callOi },
    );
  }

  if (Number.isFinite(gammaFlip)) {
    const gammaWeight = 11 * clamp(1 - Math.abs(close - gammaFlip) / Math.max(close * 0.08, 0.01), 0.4, 1);
    addCandidate(
      candidates,
      gammaFlip <= close ? "support" : "resistance",
      gammaFlip,
      gammaWeight,
      "options",
      "Gamma flip",
      { balance: optionsMarket.gammaFlip?.balance ?? null },
    );
  }

  return candidates;
}

function clusterSideCandidates(candidates, close, side) {
  const sourceCaps = { historical: 35, volume: 30, ma: 20, fib: 10, bollinger: 5, options: 15 };
  const tolerance = Math.max(close * 0.012, 0.01);
  const sorted = candidates
    .filter((item) => item.side === side && Number.isFinite(item.price) && Number.isFinite(item.weight) && item.weight > 0)
    .sort((a, b) => (side === "support" ? b.price - a.price : a.price - b.price));

  const clusters = [];
  sorted.forEach((item) => {
    const last = clusters[clusters.length - 1];
    if (last && Math.abs(last.price - item.price) <= tolerance) {
      last.items.push(item);
      last.totalWeight += item.weight;
      last.price = last.items.reduce((sum, candidate) => sum + candidate.price * candidate.weight, 0) / last.totalWeight;
      last.sourceWeights[item.source] = (last.sourceWeights[item.source] || 0) + item.weight;
      return;
    }

    clusters.push({
      price: item.price,
      totalWeight: item.weight,
      items: [item],
      sourceWeights: { [item.source]: item.weight },
    });
  });

  return clusters
    .map((cluster) => {
      const score = normalizeScore(
        Object.entries(cluster.sourceWeights).reduce(
          (sum, [source, weight]) => sum + Math.min(weight, sourceCaps[source] || weight),
          0,
        ),
      );
      return {
        price: cluster.price,
        score,
        labels: [...new Set(cluster.items.map((item) => item.label))],
        sources: [...new Set(cluster.items.map((item) => item.source))],
        items: cluster.items,
      };
    })
    .sort((a, b) => (side === "support" ? b.price - a.price : a.price - b.price));
}

function computeSupportResistanceAnalysis(close, history, technicals) {
  const closes = sliceTail(history?.closes, 252);
  const highs = sliceTail(history?.highs, 252);
  const lows = sliceTail(history?.lows, 252);
  const volumes = sliceTail(history?.volumes, 252);

  const rangeLow = Number.isFinite(technicals.rangeLow) ? technicals.rangeLow : (lows.length ? Math.min(...lows) : close);
  const rangeHigh = Number.isFinite(technicals.rangeHigh) ? technicals.rangeHigh : (highs.length ? Math.max(...highs) : close);

  const candidates = [
    ...buildHistoricalCandidates(closes, highs, lows, close),
    ...buildVolumeProfileCandidates(closes, highs, lows, volumes, close),
    ...buildMovingAverageCandidates(close, technicals),
    ...buildFibonacciCandidates(close, rangeLow, rangeHigh),
    ...buildBollingerCandidates(close, technicals),
    ...buildOptionsCandidates(close, technicals.optionsMarket),
  ];

  let support = clusterSideCandidates(candidates, close, "support").filter((item) => item.price <= close).slice(0, 3);
  let resistance = clusterSideCandidates(candidates, close, "resistance").filter((item) => item.price >= close).slice(0, 3);

  const fallbackSupport = [0.96, 0.92, 0.88].map((factor, index) => ({
    price: close * factor,
    score: 20 - index * 3,
    labels: ["Fallback"],
    sources: ["fallback"],
    items: [],
  }));
  const fallbackResistance = [1.04, 1.08, 1.12].map((factor, index) => ({
    price: close * factor,
    score: 20 - index * 3,
    labels: ["Fallback"],
    sources: ["fallback"],
    items: [],
  }));

  while (support.length < 3) support.push(fallbackSupport[support.length]);
  while (resistance.length < 3) resistance.push(fallbackResistance[resistance.length]);

  support = support.filter((item) => Number.isFinite(item.price)).slice(0, 3);
  resistance = resistance.filter((item) => Number.isFinite(item.price)).slice(0, 3);

  const bestSupport = support[0] || null;
  const bestResistance = resistance[0] || null;
  const supportStrength = bestSupport ? bestSupport.score : 0;
  const resistanceStrength = bestResistance ? bestResistance.score : 0;
  const supportDistancePct = bestSupport ? Math.max(0, ((close - bestSupport.price) / close) * 100) : null;
  const resistanceDistancePct = bestResistance ? Math.max(0, ((bestResistance.price - close) / close) * 100) : null;
  const riskReward = supportDistancePct && supportDistancePct > 0 && resistanceDistancePct != null
    ? resistanceDistancePct / supportDistancePct
    : null;

  let judgment = "Hold";
  if (bestSupport && bestResistance) {
    if (supportStrength >= 65 && supportDistancePct != null && supportDistancePct <= 6 && (riskReward == null || riskReward >= 1.2) && supportStrength >= resistanceStrength) {
      judgment = "Buy";
    } else if (resistanceStrength >= 65 && resistanceDistancePct != null && resistanceDistancePct <= 6 && (riskReward == null || riskReward <= 1.1) && resistanceStrength >= supportStrength) {
      judgment = "Sell";
    } else if (supportStrength >= resistanceStrength + 8 && riskReward != null && riskReward >= 1.35) {
      judgment = "Buy";
    } else if (resistanceStrength >= supportStrength + 8 && riskReward != null && riskReward < 0.95) {
      judgment = "Sell";
    }
  }

  return {
    currentPrice: close,
    support,
    resistance,
    supportStrength,
    resistanceStrength,
    supportDistancePct,
    resistanceDistancePct,
    riskReward,
    judgment,
  };
}

function deriveLevels(close, history, technicals) {
  const analysis = computeSupportResistanceAnalysis(close, history, technicals);
  return {
    support: analysis.support.map((item) => item.price),
    resistance: analysis.resistance.map((item) => item.price),
    analysis,
  };
}

function makeNoDataMetrics(ticker) {
  return {
    price: null,
    previousClose: null,
    change: null,
    changePercent: null,
    shortName: null,
    longName: null,
    symbol: null,
    exchangeName: null,
    trailingPE: null,
    forwardPE: null,
    marketCap: null,
    metadata: {},
    updatedAt: null,
    score: null,
    action: "N/A",
    summary: `${ticker} has no market data`,
    note: "No valid market data was returned for this ticker.",
    dominant: "hold",
    research: null,
    noData: true,
    indicators: [],
    indicatorMap: {},
    technicals: {
      support: [],
      resistance: [],
      optionsMarket: null,
    },
  };
}

function fundamentalSignals(profile, pricePressure) {
  const revenueGrowth = clamp(0.04 + profile.growth * 0.24 + pricePressure * 0.02, 0, 0.45);
  const epsGrowth = clamp(0.02 + profile.growth * 0.2 + pricePressure * 0.015, 0, 0.4);
  const grossMargin = clamp(0.18 + profile.quality * 0.35, 0, 0.7);
  const freeCashFlow = profile.cash * 8 + pricePressure * 2;
  const roe = clamp(0.03 + profile.quality * 0.22, 0, 0.45);

  const rev = classify(revenueGrowth, 0.08, 0.18);
  const eps = classify(epsGrowth, 0.05, 0.15);
  const gross = classify(grossMargin, 0.32, 0.45);
  const fcf = freeCashFlow > 2 ? { signal: "buy", trend: "up" } : freeCashFlow < 0 ? { signal: "sell", trend: "down" } : { signal: "hold", trend: "flat" };
  const roeSignal = classify(roe, 0.12, 0.2);

  return {
    indicators: [
      { key: "rev", value: revenueGrowth, signal: rev.signal, trend: rev.trend },
      { key: "eps", value: epsGrowth, signal: eps.signal, trend: eps.trend },
      { key: "gross", value: grossMargin, signal: gross.signal, trend: gross.trend },
      { key: "fcf", value: freeCashFlow, signal: fcf.signal, trend: fcf.trend },
      { key: "roe", value: roe, signal: roeSignal.signal, trend: roeSignal.trend },
    ],
  };
}

function computeIndicators(ticker, snapshot, profile) {
  const market = snapshot?.[ticker] ?? {};
  const fallbackPrice = profile.seedPrice;
  const allowSynthetic = false;
  const currencyCode = inferCurrencyCode(market.symbol ?? ticker, market.exchangeName);
  const history = normalizeHistory(market.history, fallbackPrice, profile.volatility, ticker, allowSynthetic);
  const closes = history.closes;
  const highs = history.highs;
  const lows = history.lows;
  const volumes = history.volumes;

  const close = Number.isFinite(market.price) ? market.price : latest(closes);
  if (!Number.isFinite(close)) {
    return makeNoDataMetrics(ticker);
  }
  const optionsMarket = market.optionsMarket ?? null;

  const previousClose = Number.isFinite(market.previousClose) ? market.previousClose : (closes.length > 1 ? closes[closes.length - 2] : close);
  const change = close - previousClose;
  const changePercent = previousClose ? (change / previousClose) * 100 : 0;

  const ema12 = ema(closes.slice(-60), 12) ?? close;
  const ema26 = ema(closes.slice(-120), 26) ?? close;
  const ma10 = mean(closes.slice(-10)) ?? close;
  const ma20 = mean(closes.slice(-20)) ?? close;
  const ma50 = mean(closes.slice(-50)) ?? close;
  const ma100 = mean(closes.slice(-100)) ?? close;
  const ma200 = mean(closes.slice(-200)) ?? close;
  const macd = ema12 - ema26;
  const macdSignalLine = ema(closes.slice(-90).map((_, index, arr) => {
    const sample = arr.slice(0, index + 1);
    return (ema(sample, 12) ?? sample[sample.length - 1]) - (ema(sample, 26) ?? sample[sample.length - 1]);
  }), 9) ?? 0;
  const macdHistogram = macd - macdSignalLine;
  const rsi14 = rsi(closes, 14);
  const kdjValue = computeKdj(highs, lows, closes);
  const vol20 = mean(volumes.slice(-20)) ?? latest(volumes) ?? 0;
  const latestVolume = latest(volumes) ?? 0;
  const volumeRatio = vol20 ? latestVolume / vol20 : 1;
  const obvValue = obv(closes, volumes);
  const atr14 = atr(highs, lows, closes, 14);
  const latestHigh = latest(highs);
  const latestLow = latest(lows);
  const closePosition = Number.isFinite(latestHigh) && Number.isFinite(latestLow) && latestHigh !== latestLow
    ? clamp((close - latestLow) / (latestHigh - latestLow), 0, 1)
    : 0.5;
  const upperBand = ma20 + stdDev(closes.slice(-20)) * 2;
  const middleBand = ma20;
  const lowerBand = ma20 - stdDev(closes.slice(-20)) * 2;
  const recentLows = lows.slice(-252).filter((value) => Number.isFinite(value));
  const recentHighs = highs.slice(-252).filter((value) => Number.isFinite(value));
  const rangeLow = recentLows.length ? Math.min(...recentLows) : close;
  const rangeHigh = recentHighs.length ? Math.max(...recentHighs) : close;
  const { support, resistance, analysis: srAnalysis } = deriveLevels(close, history, { ma20, ma50, ma100, ma200, upperBand, middleBand, lowerBand, rangeLow, rangeHigh, optionsMarket });
  const fibPosition = rangeHigh > rangeLow ? (close - rangeLow) / (rangeHigh - rangeLow) : 0.5;
  const pricePressure = clamp((close - ma20) / Math.max(ma20, 1), -0.25, 0.25);

  const ema12Signal = close > ema12 && ema12 > ema26 ? { signal: "buy", trend: "up" } : close < ema12 && ema12 < ema26 ? { signal: "sell", trend: "down" } : { signal: "hold", trend: "flat" };
  const ema26Signal = close > ema26 ? { signal: "buy", trend: ema12 >= ema26 ? "up" : "flat" } : close < ema26 ? { signal: "sell", trend: ema12 <= ema26 ? "down" : "flat" } : { signal: "hold", trend: "flat" };
  const macdSignalState = macd > 0.15 ? { signal: "buy", trend: "up" } : macd < -0.15 ? { signal: "sell", trend: "down" } : { signal: "hold", trend: "flat" };
  const rsiSignal = rsi14 < 35 ? { signal: "buy", trend: "up" } : rsi14 > 70 ? { signal: "sell", trend: "down" } : { signal: "hold", trend: "flat" };
  const fibSignal = fibPosition < 0.38 ? { signal: "buy", trend: "up" } : fibPosition > 0.78 ? { signal: "sell", trend: "down" } : { signal: "hold", trend: "flat" };
  const ma20Signal = close > ma20 * 1.01 ? { signal: "buy", trend: "up" } : close < ma20 * 0.99 ? { signal: "sell", trend: "down" } : { signal: "hold", trend: "flat" };
  const ma50Signal = close > ma50 * 1.015 ? { signal: "buy", trend: "up" } : close < ma50 * 0.985 ? { signal: "sell", trend: "down" } : { signal: "hold", trend: "flat" };
  const ma200Signal = close > ma200 * 1.02 ? { signal: "buy", trend: "up" } : close < ma200 * 0.98 ? { signal: "sell", trend: "down" } : { signal: "hold", trend: "flat" };
  const volumeSignal = volumeCompositeSignal(changePercent, volumeRatio, closePosition);
  const upperSignal = close > upperBand && volumeRatio > 1.1 ? { signal: "buy", trend: "up" } : close > upperBand ? { signal: "sell", trend: "down" } : close < middleBand ? { signal: "sell", trend: "down" } : { signal: "hold", trend: "flat" };
  const middleSignal = close > middleBand ? { signal: "buy", trend: "up" } : close < middleBand ? { signal: "sell", trend: "down" } : { signal: "hold", trend: "flat" };
  const lowerSignal = close < lowerBand && rsi14 < 40 ? { signal: "buy", trend: "up" } : close < lowerBand ? { signal: "hold", trend: "flat" } : { signal: "sell", trend: "down" };

  const fundamental = fundamentalSignals(profile, pricePressure);
  const indicatorSignals = [
    { key: "ema12", value: ema12, signal: ema12Signal.signal, trend: ema12Signal.trend },
    { key: "ema26", value: ema26, signal: ema26Signal.signal, trend: ema26Signal.trend },
    { key: "macd", value: macd, signal: macdSignalState.signal, trend: macdSignalState.trend },
    { key: "rsi", value: rsi14, signal: rsiSignal.signal, trend: rsiSignal.trend },
    { key: "fibonacci", value: fibPosition, signal: fibSignal.signal, trend: fibSignal.trend },
    { key: "ma20", value: ma20, signal: ma20Signal.signal, trend: ma20Signal.trend },
    { key: "ma50", value: ma50, signal: ma50Signal.signal, trend: ma50Signal.trend },
    { key: "ma200", value: ma200, signal: ma200Signal.signal, trend: ma200Signal.trend },
    { key: "volume", value: latestVolume, signal: volumeSignal.signal, trend: volumeSignal.trend, reason: volumeSignal.reason },
    { key: "upper", value: upperBand, signal: upperSignal.signal, trend: upperSignal.trend },
    { key: "middle", value: middleBand, signal: middleSignal.signal, trend: middleSignal.trend },
    { key: "lower", value: lowerBand, signal: lowerSignal.signal, trend: lowerSignal.trend },
    ...fundamental.indicators,
  ];

  const weights = [1.05, 1.05, 1.15, 1.0, 0.9, 1.0, 0.95, 0.95, 0.9, 1.0, 1.0, 1.0, 0.95, 0.95, 0.95, 0.95, 0.95];
  const weightedScore = indicatorSignals.reduce((sum, item, index) => sum + signalScoreMap[item.signal] * weights[index], 0);
  const maxScore = weights.reduce((sum, weight) => sum + weight, 0);
  const profileTilt = clamp((profile.sentiment - 0.5) * 0.15, -0.08, 0.08);
  const score = Math.round(clamp((weightedScore / maxScore + profileTilt) * 100, 0, 100));
  const action = determineSetupAction({
    score,
    srAnalysis,
    rsi14,
    fibPosition,
    price: close,
    ma20,
    ma50,
    changePercent,
    profile,
    optionsMarket,
  });
  const dominant = action.toLowerCase();
  const note = action === "Buy"
    ? `${ticker} is near support and fits a patient accumulation setup. This is a staggered-entry zone, not a breakout chase.`
    : action === "Sell"
      ? `${ticker} is extended into resistance or losing its medium-term trend. Better to avoid adding here and consider trimming strength.`
      : `${ticker} is not yet at an attractive ambush zone. Better to stay patient and wait for a cleaner pullback.`;

  const summary = `${ticker} snapshot`;

  const indicators = indicatorSignals.map((item) => {
    const def = indicatorDefs.find((entry) => entry.key === item.key);
    return {
      ...item,
      label: localizedIndicatorLabel(item.key, def?.label ?? item.key),
      display: def?.format ? def.format(item.value, currencyCode) : String(item.value),
      reason: item.reason,
    };
  });

  return {
    price: close,
    previousClose,
    change,
    changePercent,
    shortName: market.shortName ?? null,
    longName: market.longName ?? null,
    symbol: market.symbol ?? null,
    exchangeName: market.exchangeName ?? null,
    metadata: market.metadata ?? {},
    trailingPE: Number.isFinite(market.trailingPE) ? market.trailingPE : null,
    forwardPE: Number.isFinite(market.forwardPE) ? market.forwardPE : null,
    marketCap: Number.isFinite(market.marketCap) ? market.marketCap : null,
    currencyCode,
    updatedAt: market.updatedAt ?? null,
    score,
    action,
    summary,
    note,
    dominant,
    indicators,
    indicatorMap: Object.fromEntries(indicators.map((item) => [item.key, item])),
    technicals: {
      ema12,
      ema26,
      macd,
      macdSignal: macdSignalLine,
      macdHistogram,
      rsi14,
      kdj: kdjValue,
      fibPosition,
      ma10,
      ma20,
      ma50,
      ma100,
      ma200,
      latestVolume,
      vol20,
      volumeRatio,
      obv: obvValue,
      atr14,
      closePosition,
      upperBand,
      middleBand,
      lowerBand,
      rangeLow,
      rangeHigh,
      optionsMarket,
      support,
      resistance,
      history,
      pricePressure,
      srAnalysis,
    },
    noData: false,
  };
}

function createRowState(ticker) {
  return {
    ticker,
    profile: profileForTicker(ticker),
    shortName: null,
    longName: null,
    symbol: null,
    exchangeName: null,
    metadata: {},
    trailingPE: null,
    forwardPE: null,
    marketCap: null,
    currencyCode: inferCurrencyCode(ticker),
    updatedAt: null,
    previousClose: null,
    price: null,
    score: 50,
    action: "Hold",
    currentAction: "Hold",
    midTermRating: "Hold",
    longTermRating: "Hold",
    stockType: "growth",
    stockTypeLabel: t("growthType"),
    summary: `${ticker} is waiting for the next refresh.`,
    note: "Waiting for live data.",
    dominant: "hold",
    research: null,
    decisionModel: null,
    indicators: indicatorDefs.map((def) => ({
      key: def.key,
      label: localizedIndicatorLabel(def.key, def.label),
      value: null,
      display: "—",
      signal: "hold",
      trend: "flat",
    })),
    technicals: null,
  };
}

function isWatchlistMigrationDone() {
  try {
    return localStorage.getItem(WATCHLIST_MIGRATION_KEY) === "done";
  } catch {
    return false;
  }
}

function markWatchlistMigrationDone() {
  try {
    localStorage.setItem(WATCHLIST_MIGRATION_KEY, "done");
  } catch {
    // ignore
  }
}

function loadWatchlist() {
  return normalizeWatchlist(loadWatchlistItems().map((item) => item.ticker));
}

function loadWatchlistItems() {
  try {
    const sessionRaw = JSON.parse(sessionStorage.getItem(WATCHLIST_SESSION_KEY) || "null");
    if (Array.isArray(sessionRaw) && sessionRaw.length) {
      return normalizeWatchlistItems(sessionRaw);
    }
    const raw = JSON.parse(localStorage.getItem(WATCHLIST_CACHE_KEY) || "null");
    if (Array.isArray(raw) && raw.length) {
      return normalizeWatchlistItems(raw);
    }
  } catch {
    // ignore
  }
  return normalizeWatchlistItems(DEFAULT_WATCHLIST);
}

function persistWatchlist() {
  try {
    const payload = JSON.stringify(watchlistItems.length ? watchlistItems : normalizeWatchlistItems(watchlistTickers));
    localStorage.setItem(WATCHLIST_CACHE_KEY, payload);
    sessionStorage.setItem(WATCHLIST_SESSION_KEY, payload);
  } catch {
    // ignore storage failures
  }
}

function setWatchlistSyncWarning(visible) {
  const warning = document.querySelector("#watchlistSyncWarning");
  if (!warning) return;
  warning.hidden = !visible;
  warning.textContent = t("watchlistSyncFailed");
}

function applySharedWatchlist(nextWatchlist, { rerender = true, refreshPrices = false, refreshMode = "cache" } = {}) {
  const normalizedItems = normalizeWatchlistItems(nextWatchlist);
  const normalized = normalizeWatchlist(normalizedItems.map((item) => item.ticker));
  const changed = JSON.stringify(normalized) !== JSON.stringify(watchlistTickers);
  watchlistItems = normalizedItems;
  watchlistTickers = normalized;
  persistWatchlist();
  syncTickerRows();
  setWatchlistSyncWarning(false);
  if (rerender) render();
  if (refreshPrices) refreshSnapshot({ mode: refreshMode });
  return changed;
}

async function fetchSharedWatchlist() {
  const response = await fetch(WATCHLIST_API_URL, { cache: "no-store" });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const payload = await response.json();
  return normalizeWatchlistItems(payload.items || payload.watchlist || []);
}

async function syncWatchlistFromServer({ rerender = true, refreshPrices = false } = {}) {
  try {
    const serverWatchlist = await fetchSharedWatchlist();
    return applySharedWatchlist(serverWatchlist, { rerender, refreshPrices, refreshMode: "cache" });
  } catch (error) {
    console.warn("Shared watchlist sync failed:", error);
    setWatchlistSyncWarning(true);
    return false;
  }
}

function searchMarketLabel(market) {
  return market === "cn" ? t("searchMarketCn") : t("searchMarketUs");
}

function clearSymbolSearch({ keepInput = false } = {}) {
  symbolSearchResults = [];
  symbolSearchSelection = null;
  symbolSearchLoading = false;
  if (!keepInput) symbolSearchQuery = "";
  renderSymbolSearchMenu();
}

function renderSymbolSearchMenu() {
  const menu = document.querySelector("#symbolSearchMenu");
  const hint = document.querySelector("#symbolSearchHint");
  const input = document.querySelector("#tickerInput");
  const addButton = document.querySelector("#addStockButton");
  if (!menu || !hint || !input || !addButton) return;

  addButton.textContent = t("addSelected");
  addButton.disabled = !symbolSearchSelection;

  if (symbolSearchLoading) {
    hint.textContent = t("searchHintLoading");
  } else if (symbolSearchSelection) {
    hint.textContent = `${t("searchHintSelected")}：${symbolSearchSelection.symbolDisplay} · ${symbolSearchSelection.name}`;
  } else if (symbolSearchQuery.trim()) {
    hint.textContent = symbolSearchResults.length ? t("searchHintIdle") : t("searchHintEmpty");
  } else {
    hint.textContent = t("searchHintIdle");
  }

  if (!symbolSearchResults.length) {
    menu.hidden = true;
    menu.innerHTML = "";
    return;
  }

  menu.hidden = false;
  menu.innerHTML = symbolSearchResults.map((item) => `
    <button class="symbol-search-item${symbolSearchSelection?.ticker === item.ticker ? " active" : ""}" type="button" data-symbol-choice="${item.ticker}">
      <div class="symbol-search-copy">
        <div class="symbol-search-topline">
          <span class="symbol-search-symbol">${item.symbolDisplay}</span>
          <span class="symbol-search-pill ${item.market}">${searchMarketLabel(item.market)}</span>
        </div>
        <div class="symbol-search-name">${item.name}</div>
      </div>
      <div class="symbol-search-meta">${t("searchExchange")} ${item.exchange}</div>
    </button>
  `).join("");

  menu.querySelectorAll("[data-symbol-choice]").forEach((button) => {
    button.addEventListener("click", () => {
      const ticker = button.getAttribute("data-symbol-choice");
      const selected = symbolSearchResults.find((item) => item.ticker === ticker);
      if (!selected) return;
      symbolSearchSelection = selected;
      input.value = selected.ticker;
      renderSymbolSearchMenu();
    });
  });
}

async function fetchSymbolCandidates(query) {
  const response = await fetch(`${SYMBOL_SEARCH_API_URL}?q=${encodeURIComponent(query)}&limit=10`, { cache: "no-store" });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const payload = await response.json();
  return Array.isArray(payload.candidates) ? payload.candidates : [];
}

async function runSymbolSearch(rawQuery) {
  const query = String(rawQuery || "").trim();
  symbolSearchQuery = query;
  symbolSearchSelection = null;
  if (!query) {
    clearSymbolSearch({ keepInput: true });
    return;
  }

  const token = ++symbolSearchRequestToken;
  symbolSearchLoading = true;
  symbolSearchResults = [];
  renderSymbolSearchMenu();

  try {
    const candidates = await fetchSymbolCandidates(query);
    if (token !== symbolSearchRequestToken) return;
    symbolSearchResults = candidates;
  } catch (error) {
    if (token !== symbolSearchRequestToken) return;
    console.warn("Symbol search failed:", error);
    symbolSearchResults = [];
  } finally {
    if (token === symbolSearchRequestToken) {
      symbolSearchLoading = false;
      renderSymbolSearchMenu();
    }
  }
}

function normalizeTickerInput(value) {
  return String(value || "").replace(/[\u200B-\u200D\uFEFF]/g, "").trim().toUpperCase().replace(/[^A-Z0-9.-]/g, "");
}

function inferWatchlistMarketType(ticker, marketType = null) {
  const requested = String(marketType || "").trim().toUpperCase();
  if (requested === "US" || requested === "CN_A_SHARE") return requested;
  return /^\d{6}$/.test(ticker) ? "CN_A_SHARE" : "US";
}

function normalizeWatchlistItem(item) {
  const rawTicker = typeof item === "object" && item !== null ? item.ticker : item;
  const ticker = normalizeTickerInput(String(rawTicker || ""));
  if (!ticker) return null;
  return {
    id: typeof item === "object" && item !== null ? item.id ?? null : null,
    ticker,
    market_type: inferWatchlistMarketType(ticker, typeof item === "object" && item !== null ? item.market_type : null),
    created_at: typeof item === "object" && item !== null ? item.created_at || item.createdAt || null : null,
  };
}

function normalizeWatchlistItems(list) {
  const seen = new Set();
  return (Array.isArray(list) ? list : [])
    .map(normalizeWatchlistItem)
    .filter((item) => {
      if (!item) return false;
      const key = `${item.ticker}:${item.market_type}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function normalizeWatchlist(list) {
  const seen = new Set();
  return (Array.isArray(list) ? list : [])
    .map((ticker) => normalizeTickerInput(String(ticker)))
    .filter((ticker) => {
      if (!ticker || seen.has(ticker)) return false;
      seen.add(ticker);
      return true;
    });
}

let watchlistItems = loadWatchlistItems();
let watchlistTickers = normalizeWatchlist(watchlistItems.map((item) => item.ticker));
if (!isWatchlistMigrationDone()) {
  watchlistItems = normalizeWatchlistItems([...watchlistItems, ...REQUIRED_DEFAULT_TICKERS]);
  watchlistTickers = normalizeWatchlist(watchlistItems.map((item) => item.ticker));
  markWatchlistMigrationDone();
  persistWatchlist();
}
let tickerRows = watchlistTickers.map(createRowState);
let selectedTicker = watchlistTickers.includes("META") ? "META" : watchlistTickers[0] || null;
let currentSnapshot = null;
let sortState = { key: "score", dir: "desc" };
let marketFilter = "all";
let modalOpen = false;
let detailActiveTab = "summary";
let symbolSearchResults = [];
let symbolSearchQuery = "";
let symbolSearchSelection = null;
let symbolSearchLoading = false;
let symbolSearchRequestToken = 0;
let symbolSearchDebounce = null;
let refreshRequestInFlight = false;
let refreshQueued = false;

function syncTickerRows() {
  const previousRows = new Map(tickerRows.map((row) => [row.ticker, row]));
  tickerRows = watchlistTickers.map((ticker) => previousRows.get(ticker) || createRowState(ticker));

  if (!watchlistTickers.includes(selectedTicker)) {
    selectedTicker = watchlistTickers[0] || null;
  }
}

function sortRows(rows) {
  const dir = sortState.dir === "desc" ? -1 : 1;

  return [...rows].sort((a, b) => {
    const aDecision = a.decisionModel || buildDecisionModel(a);
    const bDecision = b.decisionModel || buildDecisionModel(b);
    let left;
    let right;

    switch (sortState.key) {
      case "ticker":
        left = a.ticker || "";
        right = b.ticker || "";
        break;
      case "change":
        left = Number.isFinite(a.changePercent) ? a.changePercent : Number.NEGATIVE_INFINITY;
        right = Number.isFinite(b.changePercent) ? b.changePercent : Number.NEGATIVE_INFINITY;
        break;
      case "score":
        left = Number.isFinite(a.score) ? a.score : Number.NEGATIVE_INFINITY;
        right = Number.isFinite(b.score) ? b.score : Number.NEGATIVE_INFINITY;
        break;
      case "shortScore":
        left = aDecision.ai_decision?.short_term?.score ?? Number.NEGATIVE_INFINITY;
        right = bDecision.ai_decision?.short_term?.score ?? Number.NEGATIVE_INFINITY;
        break;
      case "midScore":
        left = aDecision.ai_decision?.mid_term?.score ?? Number.NEGATIVE_INFINITY;
        right = bDecision.ai_decision?.mid_term?.score ?? Number.NEGATIVE_INFINITY;
        break;
      case "longScore":
        left = aDecision.ai_decision?.long_term?.score ?? Number.NEGATIVE_INFINITY;
        right = bDecision.ai_decision?.long_term?.score ?? Number.NEGATIVE_INFINITY;
        break;
      case "type":
        left = aDecision.company_profile?.category || "";
        right = bDecision.company_profile?.category || "";
        break;
      default:
        left = Number.isFinite(a.score) ? a.score : Number.NEGATIVE_INFINITY;
        right = Number.isFinite(b.score) ? b.score : Number.NEGATIVE_INFINITY;
        break;
    }

    if (typeof left === "string" && typeof right === "string") {
      return dir * left.localeCompare(right, undefined, { numeric: true, sensitivity: "base" });
    }

    if (left === right) return dir * a.ticker.localeCompare(b.ticker, undefined, { numeric: true, sensitivity: "base" });
    return dir * ((left > right) - (left < right));
  });
}

function marketTypeForTicker(tickerOrRow) {
  const ticker = typeof tickerOrRow === "string" ? tickerOrRow : tickerOrRow?.ticker;
  return /^\d{6}$/.test(String(ticker || "")) ? "cn" : "us";
}

function schemaMarketTypeForTicker(tickerOrRow) {
  return marketTypeForTicker(tickerOrRow) === "cn" ? "CN_A_SHARE" : "US";
}

function isCnAShare(tickerOrRow) {
  return schemaMarketTypeForTicker(tickerOrRow) === "CN_A_SHARE";
}

function isUsMarket(tickerOrRow) {
  return schemaMarketTypeForTicker(tickerOrRow) === "US";
}

function matchesFilter(row) {
  if (marketFilter === "all") return true;
  if (marketFilter === "us" || marketFilter === "cn") return marketTypeForTicker(row) === marketFilter;
  return (row.decisionModel || buildDecisionModel(row)).company_profile?.category_key === marketFilter;
}

function setRefreshChip(text) {
  const refreshChip = document.querySelector(".refresh-chip span");
  if (refreshChip) refreshChip.textContent = text;
}

function updateManualRefreshButton() {
  const button = document.querySelector("#manualRefreshButton");
  if (!button) return;
  button.disabled = false;
  button.textContent = refreshRequestInFlight ? t("refreshing") : t("refreshNow");
}

function formatSnapshotTimestamp(updatedAt) {
  if (!updatedAt) return null;
  const ts = new Date(updatedAt);
  if (Number.isNaN(ts.getTime())) return null;
  const locale = currentLanguage === "zh" ? "zh-CN" : "en-US";
  return ts.toLocaleString(locale, { dateStyle: "medium", timeStyle: "short" });
}

function formatSnapshotClockTime(updatedAt) {
  if (!updatedAt) return null;
  const ts = new Date(updatedAt);
  if (Number.isNaN(ts.getTime())) return null;
  const locale = currentLanguage === "zh" ? "zh-CN" : "en-US";
  return ts.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit", hour12: false });
}

function formatRefreshDateTime(updatedAt) {
  if (!updatedAt) return null;
  const ts = new Date(updatedAt);
  if (Number.isNaN(ts.getTime())) return null;
  if (currentLanguage === "zh") {
    return ts.toLocaleString("zh-CN", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).replace(/\s+/g, " ");
  }
  return ts.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).replace(",", "");
}

function normalizedRefreshStatus(snapshot) {
  if (!snapshot) return null;
  const status = snapshot.refresh_status || {};
  const lastRefresh = status.last_successful_live_refresh_at
    || status.last_successful_cache_update_at
    || status.last_any_successful_ticker_refresh_at
    || status.last_dashboard_refresh
    || null;
  const nextRefresh = status.next_auto_refresh_at
    || status.next_dashboard_refresh
    || (lastRefresh ? new Date(new Date(lastRefresh).getTime() + PRICE_REFRESH_MS).toISOString() : null);
  const totalTickers = Number.isFinite(status.total_tickers) ? status.total_tickers : Object.keys(snapshot.quotes || {}).length;
  const successCount = Number.isFinite(status.success_count)
    ? status.success_count
    : Object.values(snapshot.quotes || {}).filter((quote) => quote?.price != null).length;
  const failedCount = Number.isFinite(status.failed_count)
    ? status.failed_count
    : Array.isArray(snapshot.failed) ? snapshot.failed.length : 0;
  const usedCacheCount = Number.isFinite(status.used_cache_count) ? status.used_cache_count : 0;
  const unavailableCount = Number.isFinite(status.unavailable_count)
    ? status.unavailable_count
    : Object.values(snapshot.quotes || {}).filter((quote) => quote?.quote_status === "unavailable").length;
  const staleQuoteCount = Number.isFinite(status.stale_quote_count)
    ? status.stale_quote_count
    : Object.values(snapshot.quotes || {}).filter((quote) => quote?.stale || quote?.dataStaleness === "stale").length;
  const staleCacheCount = Number.isFinite(status.stale_cache_count) ? status.stale_cache_count : 0;
  return {
    refresh_interval_minutes: Number.isFinite(status.refresh_interval_minutes) ? status.refresh_interval_minutes : 60,
    last_dashboard_refresh: lastRefresh,
    next_dashboard_refresh: nextRefresh,
    is_refreshing: typeof status.is_refreshing === "boolean" ? status.is_refreshing : false,
    is_cache_only: typeof status.is_cache_only === "boolean" ? status.is_cache_only : false,
    is_force_refresh: typeof status.is_force_refresh === "boolean" ? status.is_force_refresh : false,
    is_auto_refresh: typeof status.is_auto_refresh === "boolean" ? status.is_auto_refresh : false,
    total_tickers: totalTickers,
    success_count: successCount,
    failed_count: failedCount,
    used_cache_count: usedCacheCount,
    unavailable_count: unavailableCount,
    has_stale_quotes: typeof status.has_stale_quotes === "boolean" ? status.has_stale_quotes : staleQuoteCount > 0,
    stale_quote_count: staleQuoteCount,
    stale_cache_count: staleCacheCount,
    is_partial: typeof status.is_partial === "boolean" ? status.is_partial : (successCount > 0 && successCount < totalTickers),
    is_loading_live_data: typeof status.is_loading_live_data === "boolean" ? status.is_loading_live_data : (successCount > 0 && successCount < totalTickers && failedCount === 0),
  };
}

function refreshChipText(snapshot, fallbackText = t("refresh")) {
  if (!snapshot) return fallbackText;
  const status = normalizedRefreshStatus(snapshot);
  if (!status) return fallbackText;
  const lastRefresh = formatRefreshDateTime(status.last_dashboard_refresh);
  const nextRefresh = formatRefreshDateTime(status.next_dashboard_refresh);
  const seen = new Set();
  const parts = [];
  const addPart = (value) => {
    const text = String(value || "").trim();
    if (!text || seen.has(text)) return;
    seen.add(text);
    parts.push(text);
  };
  addPart(currentLanguage === "zh" ? "每 1 小时自动刷新" : "Refreshes every 1 hour");
  if (status.is_refreshing) {
    addPart(currentLanguage === "zh" ? "正在刷新行情..." : "Refreshing quotes...");
  } else if (status.success_count === 0 && status.total_tickers > 0) {
    addPart(currentLanguage === "zh" ? "刷新失败，当前显示缓存或暂无价格" : "Refresh failed, showing cache or no prices");
  } else if (status.is_loading_live_data) {
    addPart(currentLanguage === "zh" ? "部分股票数据正在更新，已先显示可用数据" : "Some stock data is still updating; available data is shown first");
  } else if (status.is_partial) {
    addPart(currentLanguage === "zh" ? "部分刷新成功" : "Partial refresh succeeded");
  } else if (status.is_cache_only && status.success_count > 0 && !status.has_stale_quotes) {
    addPart(currentLanguage === "zh" ? "已显示缓存数据" : "Showing cached data");
  } else if (status.success_count > 0 && status.is_force_refresh) {
    addPart(currentLanguage === "zh" ? "刷新成功" : "Refresh succeeded");
  }
  if (lastRefresh) addPart(`${t("lastRefresh")} ${lastRefresh}`);
  if (status.stale_quote_count > 0 || status.stale_cache_count > 0) addPart(t("partialCachedQuotes"));
  if (status.failed_count > 0 || status.unavailable_count > 0) addPart(currentLanguage === "zh" ? "部分行情暂不可用" : "Some quotes are unavailable");
  if (nextRefresh) addPart(`${t("nextRefresh")} ${nextRefresh}`);
  return parts.join(" • ");
}

function refreshStatusForTimestamp(timestamp, { hasStaleQuotes = false, staleQuoteCount = 0, isRefreshing = false } = {}) {
  const base = timestamp ? new Date(timestamp) : null;
  const safeBase = base && !Number.isNaN(base.getTime()) ? base : null;
  return {
    refresh_interval_minutes: 60,
    last_dashboard_refresh: safeBase ? safeBase.toISOString() : null,
    next_dashboard_refresh: safeBase ? new Date(safeBase.getTime() + PRICE_REFRESH_MS).toISOString() : null,
    is_refreshing: isRefreshing,
    has_stale_quotes: hasStaleQuotes,
    stale_quote_count: staleQuoteCount,
  };
}

function setRefreshChipForAttempt({ stale = false, message = "" } = {}) {
  const currentStatus = normalizedRefreshStatus(currentSnapshot);
  const priorRefreshTime = currentStatus?.last_dashboard_refresh || null;
  const snapshotForChip = {
    quotes: currentSnapshot?.quotes || {},
    refresh_status: {
      ...(currentSnapshot?.refresh_status || {}),
      ...refreshStatusForTimestamp(priorRefreshTime, {
        hasStaleQuotes: stale,
        staleQuoteCount: stale ? Math.max(1, tickerRows.length) : 0,
        isRefreshing: true,
      }),
    },
  };
  setRefreshChip(refreshChipText(snapshotForChip));
}

function markCurrentSnapshotRefreshAttemptFailed() {
  const staleQuoteCount = Math.max(1, Object.keys(currentSnapshot?.quotes || {}).length || tickerRows.length);
  if (currentSnapshot) {
    currentSnapshot = {
      ...currentSnapshot,
      refresh_status: {
        ...(currentSnapshot.refresh_status || {}),
        hasStaleQuotes: true,
        has_stale_quotes: true,
        stale_quote_count: staleQuoteCount,
        failed_count: Math.max(currentSnapshot.refresh_status?.failed_count || 0, 1),
        is_refreshing: false,
      },
    };
    persistSnapshot(currentSnapshot);
  }
  setRefreshChipForAttempt({ stale: true, message: t("staleRefresh") });
}

function chunkArray(items, size) {
  const chunks = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function uniqueList(values) {
  return [...new Set((values || []).filter(Boolean))];
}

function mergeMarketSnapshots(baseSnapshot, patchSnapshot, requestedTickers = []) {
  if (!patchSnapshot) return baseSnapshot;
  const safeBaseSnapshot = baseSnapshot || { quotes: {}, failed: [], refresh_status: {} };
  const quotes = {
    ...(safeBaseSnapshot.quotes || {}),
    ...(patchSnapshot.quotes || {}),
  };
  const orderedTickers = requestedTickers.length ? requestedTickers : Object.keys(quotes);
  const failedByTicker = new Map();
  [...(safeBaseSnapshot.failed || []), ...(patchSnapshot.failed || [])].forEach((failure) => {
    if (!failure) return;
    failedByTicker.set(failure.ticker || failure.symbol || JSON.stringify(failure), failure);
  });
  const baseStatus = safeBaseSnapshot.refresh_status || {};
  const patchStatus = patchSnapshot.refresh_status || {};
  const quoteValues = Object.values(quotes || {});
  const successCount = quoteValues.filter((quote) => quote?.price != null).length;
  const unavailableCount = quoteValues.filter((quote) => quote?.quote_status === "unavailable").length;
  const staleQuoteCount = quoteValues.filter((quote) => quote?.stale || quote?.dataStaleness === "stale" || quote?.quote_status === "stale").length;
  const status = {
    ...baseStatus,
    ...patchStatus,
    total_tickers: orderedTickers.length,
    success_count: successCount,
    failed_count: failedByTicker.size,
    unavailable_count: unavailableCount,
    unavailable_quote_count: unavailableCount,
    stale_quote_count: staleQuoteCount,
    has_stale_quotes: staleQuoteCount > 0 || unavailableCount > 0,
    is_partial: successCount > 0 && successCount < orderedTickers.length,
    live_attempted_tickers: uniqueList([...(baseStatus.live_attempted_tickers || []), ...(patchStatus.live_attempted_tickers || [])]),
    live_success_tickers: uniqueList([...(baseStatus.live_success_tickers || []), ...(patchStatus.live_success_tickers || [])]),
    live_failed_tickers: uniqueList([...(baseStatus.live_failed_tickers || []), ...(patchStatus.live_failed_tickers || [])]),
    deferred_live_tickers: uniqueList([...(baseStatus.deferred_live_tickers || []), ...(patchStatus.deferred_live_tickers || [])]),
    cache_only_tickers: uniqueList([...(baseStatus.cache_only_tickers || []), ...(patchStatus.cache_only_tickers || [])]),
    requested_tickers: orderedTickers,
    processed_tickers: orderedTickers.filter((ticker) => quotes[ticker]),
    missing_from_request: orderedTickers.filter((ticker) => !quotes[ticker]),
  };
  return {
    ...safeBaseSnapshot,
    ...patchSnapshot,
    quotes,
    data: quotes,
    items: orderedTickers.filter((ticker) => quotes[ticker]).map((ticker) => ({
      ticker,
      market_type: schemaMarketTypeForTicker(ticker),
      price: quotes[ticker]?.price ?? null,
      quote_status: quotes[ticker]?.quote_status || "unavailable",
      quote_source: quotes[ticker]?.quote_source || null,
      analysis: quotes[ticker],
      error: quotes[ticker]?.error || null,
    })),
    failed: [...failedByTicker.values()],
    requested_tickers: orderedTickers,
    processed_tickers: status.processed_tickers,
    missing_from_request: status.missing_from_request,
    refresh_status: status,
  };
}

function applyLanguage() {
  document.title = t("appTitle");
  const headerTitle = document.querySelector(".brand h1");
  if (headerTitle) headerTitle.textContent = t("appTitle");
  const stocksTitle = document.querySelector("#stocksTitle");
  if (stocksTitle) stocksTitle.textContent = t("stocks");
  const sharedWatchlistHint = document.querySelector("#sharedWatchlistHint");
  if (sharedWatchlistHint) sharedWatchlistHint.textContent = t("sharedWatchlistHint");
  const watchlistSyncWarning = document.querySelector("#watchlistSyncWarning");
  if (watchlistSyncWarning) watchlistSyncWarning.textContent = t("watchlistSyncFailed");
  const tickerInputLabel = document.querySelector("#tickerInputLabel");
  if (tickerInputLabel) tickerInputLabel.textContent = t("ticker");
  const tickerInput = document.querySelector("#tickerInput");
  if (tickerInput) tickerInput.placeholder = currentLanguage === "zh" ? "例如 BABA / 阿里巴巴 / 300657" : "e.g. BABA / Alibaba / 300657";
  const addStockButton = document.querySelector("#addStockButton");
  if (addStockButton) addStockButton.textContent = t("addSelected");
  updateManualRefreshButton();
  const sortTickerLabel = document.querySelector("#sortTickerLabel");
  if (sortTickerLabel) sortTickerLabel.textContent = t("sortTicker");
  const sortMixLabel = document.querySelector("#sortMixLabel");
  if (sortMixLabel) sortMixLabel.textContent = t("sortAiScore");
  const sortShortLabel = document.querySelector("#sortShortLabel");
  if (sortShortLabel) sortShortLabel.textContent = t("sortShortScore");
  const sortMidLabel = document.querySelector("#sortMidLabel");
  if (sortMidLabel) sortMidLabel.textContent = t("sortMidScore");
  const sortLongLabel = document.querySelector("#sortLongLabel");
  if (sortLongLabel) sortLongLabel.textContent = t("sortLongScore");
  const sortTypeLabel = document.querySelector("#sortTypeLabel");
  if (sortTypeLabel) sortTypeLabel.textContent = t("sortStockType");
  const sortChangeLabel = document.querySelector("#sortChangeLabel");
  if (sortChangeLabel) sortChangeLabel.textContent = t("sortDayMove");
  const filterAll = document.querySelector('.filter-btn[data-market-filter="all"]');
  const filterUs = document.querySelector('.filter-btn[data-market-filter="us"]');
  const filterCn = document.querySelector('.filter-btn[data-market-filter="cn"]');
  const filterMegaCap = document.querySelector('.filter-btn[data-market-filter="megaCap"]');
  const filterGrowth = document.querySelector('.filter-btn[data-market-filter="growth"]');
  const filterSpeculative = document.querySelector('.filter-btn[data-market-filter="speculative"]');
  const filterDividend = document.querySelector('.filter-btn[data-market-filter="dividend"]');
  const filterValue = document.querySelector('.filter-btn[data-market-filter="value"]');
  if (filterAll) filterAll.textContent = t("filterAll");
  if (filterUs) filterUs.textContent = t("filterUs");
  if (filterCn) filterCn.textContent = t("filterCn");
  if (filterMegaCap) filterMegaCap.textContent = t("filterMegaCap");
  if (filterGrowth) filterGrowth.textContent = t("filterGrowth");
  if (filterSpeculative) filterSpeculative.textContent = t("filterSpeculative");
  if (filterDividend) filterDividend.textContent = t("filterDividend");
  if (filterValue) filterValue.textContent = t("filterValue");
  const heroGuide = document.querySelector("#heroGuide");
  if (heroGuide) heroGuide.innerHTML = t("heroGuide");
  const detailPriceLabel = document.querySelector("#detailPriceLabel");
  if (detailPriceLabel) detailPriceLabel.textContent = t("price");
  const detailActionLabel = document.querySelector("#detailActionLabel");
  if (detailActionLabel) detailActionLabel.textContent = t("action");
  const detailMixLabel = document.querySelector("#detailMixLabel");
  if (detailMixLabel) detailMixLabel.textContent = t("signalMix");
  const analysisTitle = document.querySelector("#analysisTitle");
  if (analysisTitle) analysisTitle.textContent = t("analysisTitle");
  const analysisDesc = document.querySelector("#analysisDesc");
  if (analysisDesc) analysisDesc.textContent = t("analysisDesc");
  const levelSpans = document.querySelectorAll(".hero-levels .level-card > span");
  if (levelSpans[0]) levelSpans[0].textContent = t("supportLevel");
  if (levelSpans[1]) levelSpans[1].textContent = t("resistanceLevel");
  const analysisLabels = document.querySelectorAll(".analysis-panel .analysis-label");
  if (analysisLabels[0]) analysisLabels[0].textContent = t("currentPrice");
  if (analysisLabels[1]) analysisLabels[1].textContent = t("reading");
  const analysisRows = document.querySelectorAll(".analysis-row > span");
  if (analysisRows[0]) analysisRows[0].textContent = t("supportStrength");
  if (analysisRows[1]) analysisRows[1].textContent = t("resistanceStrength");
  if (analysisRows[2]) analysisRows[2].textContent = t("priceToSupport");
  if (analysisRows[3]) analysisRows[3].textContent = t("priceToResistance");
  if (analysisRows[4]) analysisRows[4].textContent = t("riskReward");
  if (analysisRows[5]) analysisRows[5].textContent = t("bestSupport");
  if (analysisRows[6]) analysisRows[6].textContent = t("bestResistance");
  if (analysisRows[7]) analysisRows[7].textContent = t("supportGap");
  if (analysisRows[8]) analysisRows[8].textContent = t("resistanceGap");
  const howTitle = document.querySelector("#howTitle");
  if (howTitle) howTitle.textContent = t("howTitle");
  const howBody = document.querySelector("#howBody");
  if (howBody) howBody.innerHTML = t("howBody");
  const howSmall = document.querySelector("#howSmall");
  if (howSmall) howSmall.textContent = t("howSmall");
  document.querySelectorAll(".lang-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.lang === currentLanguage);
  });
  document.querySelectorAll(".filter-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.marketFilter === marketFilter);
  });
  renderSymbolSearchMenu();
}

function summarizeRow(row) {
  const counts = row.indicators.reduce((acc, item) => {
    acc[item.signal] += 1;
    return acc;
  }, { buy: 0, hold: 0, sell: 0 });

  return `${row.ticker}: ${counts.buy} buy, ${counts.hold} hold, ${counts.sell} sell signals.`;
}

function countDominantSignal(row) {
  const counts = row.indicators.reduce((acc, item) => {
    acc[item.signal] += 1;
    return acc;
  }, { buy: 0, hold: 0, sell: 0 });

  if (counts.buy >= counts.hold && counts.buy >= counts.sell) return "buy";
  if (counts.sell >= counts.buy && counts.sell >= counts.hold) return "sell";
  return "hold";
}

function formatChangePercent(value) {
  if (value == null || Number.isNaN(value)) return "—";
  const numeric = Number(value);
  return `${numeric >= 0 ? "+" : ""}${numeric.toFixed(1)}%`;
}

function determineSetupAction({ score, srAnalysis, rsi14, fibPosition, price, ma20, ma50, changePercent, profile, optionsMarket }) {
  const supportDistance = srAnalysis?.supportDistancePct;
  const resistanceDistance = srAnalysis?.resistanceDistancePct;
  const supportStrength = srAnalysis?.supportStrength ?? 0;
  const resistanceStrength = srAnalysis?.resistanceStrength ?? 0;
  const riskReward = srAnalysis?.riskReward;
  const optionsRead = buildOptionsRead({ price, technicals: { optionsMarket } });

  const nearSupport = supportDistance != null && supportDistance <= 3.2;
  const atSupport = supportDistance != null && supportDistance <= 1.2;
  const nearResistance = resistanceDistance != null && resistanceDistance <= 1.6;
  const strongSupport = supportStrength >= 48;
  const strongResistance = resistanceStrength >= 62;
  const goodReward = riskReward != null && riskReward >= 1.35;
  const poorReward = riskReward != null && riskReward < 0.9;
  const extended = price > ma20 * 1.04 || rsi14 >= 65 || fibPosition >= 0.8 || changePercent >= 3.5;
  const washedOut = rsi14 <= 45 || fibPosition <= 0.4;
  const trendBroken = price < ma50 * 0.95;
  const trendHealthy = price >= ma50 * 0.98;
  const qualityName = (profile?.quality ?? 0) >= 0.55 && (profile?.growth ?? 0) >= 0.45 && (profile?.cash ?? 0) >= 0;
  const optionsSupportive = optionsRead.signal === "buy";
  const optionsCapped = optionsRead.signal === "sell";

  if (atSupport && strongSupport && washedOut && !extended && !trendBroken && qualityName && score >= 74 && !optionsCapped) {
    return "Strong Buy";
  }

  if (nearSupport && strongSupport && goodReward && washedOut && trendHealthy && score >= 58 && !optionsCapped) {
    return "Buy";
  }

  if (score >= 72 && atSupport && !extended && trendHealthy && qualityName && !optionsCapped) {
    return "Buy";
  }

  if (optionsSupportive && nearSupport && trendHealthy && score >= 55 && !extended) {
    return score >= 74 ? "Strong Buy" : "Buy";
  }

  if (nearResistance && strongResistance && extended && poorReward && score < 30) {
    return "Strong Sell";
  }

  if ((nearResistance && strongResistance && (extended || poorReward)) || (optionsCapped && nearResistance)) {
    return "Sell";
  }

  if (trendBroken && score < 20 && !nearSupport) {
    return "Short";
  }

  if (trendBroken && score < 38 && !nearSupport) {
    return "Strong Sell";
  }

  return "Hold";
}

function scoreToBand(score) {
  if (!Number.isFinite(score)) return { tone: "hold", label: localizedActionLabel("Hold") };
  if (score >= CALIBRATION_CONFIG.rating_thresholds.strong_buy) return { tone: "buy", label: t("aiRatingScaleStrongBuy") };
  if (score >= CALIBRATION_CONFIG.rating_thresholds.buy) return { tone: "buy", label: t("aiRatingScaleBuy") };
  if (score >= CALIBRATION_CONFIG.rating_thresholds.hold) return { tone: "hold", label: t("aiRatingScaleHold") };
  if (score >= CALIBRATION_CONFIG.rating_thresholds.sell) return { tone: "sell", label: t("aiRatingScaleSell") };
  return { tone: "sell", label: t("aiRatingScaleStrongSell") };
}

function scoreValue(score) {
  return Number.isFinite(score) ? `${Math.round(score)}${t("scoreOutOf100")}` : "—";
}

function signalToScore(signal) {
  return Math.round((signalScoreMap[signal] ?? 0.5) * 100);
}

function averageScoreFromSignals(items) {
  const valid = items.filter((item) => item && item.signal);
  if (!valid.length) return 50;
  return Math.round(valid.reduce((sum, item) => sum + signalToScore(item.signal), 0) / valid.length);
}

function countSignals(row) {
  return row.indicators.reduce((acc, item) => {
    acc[item.signal] += 1;
    return acc;
  }, { buy: 0, hold: 0, sell: 0 });
}

function buildConsensus(row) {
  const counts = countSignals(row);
  const total = Math.max(1, counts.buy + counts.hold + counts.sell);
  const dominantCount = Math.max(counts.buy, counts.hold, counts.sell);
  const confidence = Math.round((dominantCount / total) * 100);
  const dominant = dominantCount === counts.buy ? "buy" : dominantCount === counts.sell ? "sell" : "hold";
  return { counts, total, confidence, dominant };
}

function buildMainReason(row) {
  const sr = row.technicals?.srAnalysis;
  const tech = row.technicals || {};
  const optionsRead = row.research?.optionsRead || buildOptionsRead(row);
  if (row.noData) return t("noSignalReason");
  if (optionsRead.signal === "buy" && optionsRead.putWallDistancePct != null && optionsRead.putWallDistancePct <= 2.5) {
    return currentLanguage === "zh"
      ? `股价靠近 Put Wall ${formatCurrency(optionsRead.putWall, row.currencyCode)}，短线有期权支撑。`
      : `Price is close to the put wall at ${formatCurrency(optionsRead.putWall, row.currencyCode)}, which can help near-term support.`;
  }
  if (optionsRead.signal === "sell" && optionsRead.callWallDistancePct != null && optionsRead.callWallDistancePct <= 2) {
    return currentLanguage === "zh"
      ? `股价靠近 Call Wall ${formatCurrency(optionsRead.callWall, row.currencyCode)}，上方期权压力较大。`
      : `Price is close to the call wall at ${formatCurrency(optionsRead.callWall, row.currencyCode)}, which can cap near-term upside.`;
  }
  if (row.action === "Buy" && sr?.supportDistancePct != null && sr.supportDistancePct <= 3) {
    return currentLanguage === "zh" ? "股价接近支撑区，适合分批建仓。" : "Price is close to support, which favors staged accumulation.";
  }
  if (row.action === "Sell" && sr?.resistanceDistancePct != null && sr.resistanceDistancePct <= 3) {
    return currentLanguage === "zh" ? "股价接近压力区，风险收益比不理想。" : "Price is near resistance and risk/reward looks less favorable.";
  }
  if (tech.pricePressure < 0 && tech.ma200 && row.price > tech.ma200) {
    return currentLanguage === "zh" ? "长期趋势未破坏，但短线信号仍需确认。" : "The long-term trend is intact, but short-term confirmation is still missing.";
  }
  if ((row.indicatorMap?.macd?.signal || "hold") === "buy" && row.action === "Hold") {
    return currentLanguage === "zh" ? "趋势正在改善，但当前买点仍不够理想。" : "Trend is improving, but the current entry still looks suboptimal.";
  }
  return row.note || t("neutralSetup");
}

function buildProfessionalReasonLines(row) {
  const research = row.research || buildLongTermResearch(row);
  const lines = [];
  const tech = row.technicals || {};
  lines.push(`${t("stockType")}: ${research.stockTypeLabel}`);
  if (row.price != null && tech.ma200 != null) {
    lines.push(row.price >= tech.ma200
      ? (currentLanguage === "zh" ? "长期趋势仍站在 MA200 上方" : "Long-term trend remains above MA200")
      : (currentLanguage === "zh" ? "长期趋势跌破 MA200，需要更谨慎" : "Long-term trend is below MA200 and needs more caution"));
  }
  if (research.optionsRead?.available) {
    lines.push(
      research.optionsRead.signal === "buy"
        ? (currentLanguage === "zh" ? "期权墙位偏支撑，短线更利于等回踩观察" : "Options walls are more supportive, which favors buying pullbacks.")
        : research.optionsRead.signal === "sell"
          ? (currentLanguage === "zh" ? "期权墙位偏压制，短线更适合等待突破确认" : "Options walls are acting as resistance, so waiting for a breakout is cleaner.")
          : (currentLanguage === "zh" ? "期权墙位中性，仍以趋势和支撑阻力为主" : "Options walls are mixed, so trend and price levels matter more.")
    );
  }
  lines.push(`${t("longTermFit")}: ${research.longTermFit}`);
  return lines.slice(0, 3);
}

function buildDimensionScores(row) {
  const map = row.indicatorMap || {};
  const technical = averageScoreFromSignals([
    map.ema12, map.ema26, map.macd, map.rsi, map.fibonacci, map.ma20, map.ma50, map.ma200, map.upper, map.middle, map.lower,
  ]);
  const fundamental = averageScoreFromSignals([map.rev, map.eps, map.gross, map.fcf, map.roe]);

  const flowInputs = [
    map.volume,
    { signal: Number.isFinite(row.changePercent) ? (row.changePercent >= 1 ? "buy" : row.changePercent <= -1 ? "sell" : "hold") : "hold" },
    { signal: (row.technicals?.volumeRatio ?? 1) >= 1.2 ? "buy" : (row.technicals?.volumeRatio ?? 1) <= 0.85 ? "sell" : "hold" },
  ];
  const moneyFlow = averageScoreFromSignals(flowInputs);

  let riskPenalty = 0;
  if ((row.technicals?.rsi14 ?? 50) >= 70) riskPenalty += 18;
  if ((row.technicals?.rsi14 ?? 50) <= 32) riskPenalty += 10;
  if ((row.technicals?.srAnalysis?.resistanceDistancePct ?? 99) <= 2) riskPenalty += 12;
  if ((row.technicals?.srAnalysis?.supportDistancePct ?? 0) >= 6) riskPenalty += 10;
  if (row.price != null && row.technicals?.ma50 != null && row.price < row.technicals.ma50) riskPenalty += 14;
  if (row.price != null && row.technicals?.ma200 != null && row.price < row.technicals.ma200) riskPenalty += 12;
  if ((row.trailingPE ?? 0) >= 35) riskPenalty += 10;
  if ((row.forwardPE ?? 0) >= 30) riskPenalty += 6;
  if (map.fcf?.signal === "sell") riskPenalty += 12;
  if ((row.changePercent ?? 0) <= -4) riskPenalty += 12;
  const risk = clamp(100 - riskPenalty, 5, 95);

  return {
    overall: Number.isFinite(row.score) ? row.score : 50,
    technical,
    fundamental,
    moneyFlow,
    risk,
  };
}

function riskLevelFromScore(score) {
  if (score >= 70) return t("low");
  if (score >= 45) return t("moderate");
  return t("elevated");
}

function metricScore(value, low, high) {
  if (!Number.isFinite(value)) return 50;
  if (high === low) return clamp(Math.round(value), 0, 100);
  return clamp(Math.round(((value - low) / (high - low)) * 100), 0, 100);
}

function inverseMetricScore(value, low, high) {
  return 100 - metricScore(value, low, high);
}

function scoreBucketLabel(score) {
  if (score >= CALIBRATION_CONFIG.rating_thresholds.strong_buy) return "Strong Buy";
  if (score >= CALIBRATION_CONFIG.rating_thresholds.buy) return "Buy";
  if (score >= CALIBRATION_CONFIG.rating_thresholds.hold) return "Hold";
  if (score >= CALIBRATION_CONFIG.rating_thresholds.sell) return "Sell";
  return "Strong Sell";
}

function stockTypeConfig(type) {
  const configs = {
    megaCap: {
      label: t("megaCap"),
      modelLabel: t("megaCapModel"),
      weights: { fundamental: 0.35, quality: 0.3, growth: 0.15, technical: 0.1, moneyFlow: 0.1 },
    },
    growth: {
      label: t("growthType"),
      modelLabel: t("growthModel"),
      weights: { growth: 0.3, fundamental: 0.25, quality: 0.2, technical: 0.15, moneyFlow: 0.1 },
    },
    value: {
      label: t("valueType"),
      modelLabel: t("valueModel"),
      weights: { fundamental: 0.3, quality: 0.25, valuation: 0.25, growth: 0.1, technical: 0.05, moneyFlow: 0.05 },
    },
    dividend: {
      label: t("dividendType"),
      modelLabel: t("dividendModel"),
      weights: { fundamental: 0.3, quality: 0.3, valuation: 0.2, moneyFlow: 0.1, technical: 0.1 },
    },
    speculative: {
      label: t("speculativeType"),
      modelLabel: t("speculativeModel"),
      weights: { technical: 0.35, moneyFlow: 0.3, growth: 0.2, fundamental: 0.15 },
    },
    turnaround: {
      label: t("turnaroundType"),
      modelLabel: t("turnaroundModel"),
      weights: { fundamental: 0.25, quality: 0.2, growth: 0.2, technical: 0.2, moneyFlow: 0.15 },
    },
    newlyListed: {
      label: t("newlyListedType"),
      modelLabel: t("newlyListedModel"),
      weights: { technical: 0.3, moneyFlow: 0.25, growth: 0.2, fundamental: 0.15, quality: 0.1 },
    },
  };
  return configs[type] || configs.growth;
}

function buildResearchMetrics(row) {
  const profile = row.profile || profileForTicker(row.ticker);
  const map = row.indicatorMap || {};
  const revenueGrowth = map.rev?.value ?? null;
  const epsGrowth = map.eps?.value ?? null;
  const grossMargin = map.gross?.value ?? null;
  const freeCashFlow = map.fcf?.value ?? null;
  const roe = map.roe?.value ?? null;
  const operatingMargin = clamp(0.05 + profile.quality * 0.2 + profile.cash * 0.06 + profile.growth * 0.05, 0.02, 0.42);
  const debtRatio = clamp(0.72 - profile.cash * 0.23 - profile.quality * 0.12 + profile.volatility * 0.05, 0.18, 0.88);
  const cashReserve = clamp(0.07 + profile.cash * 0.52 + profile.quality * 0.06, 0.04, 0.74);
  const fcfGrowth = clamp((freeCashFlow ?? 0) / 16 + profile.growth * 0.12 + profile.sentiment * 0.04, -0.18, 0.42);
  const analystView = clamp(0.04 + profile.growth * 0.18 + profile.sentiment * 0.1, -0.08, 0.36);
  const guidance = clamp(0.02 + profile.growth * 0.16 + profile.quality * 0.06, -0.08, 0.32);
  const pe = Number.isFinite(row.trailingPE) ? row.trailingPE : null;
  const forwardPe = Number.isFinite(row.forwardPE) ? row.forwardPE : null;
  const peg = Number.isFinite(row.metadata?.pegRatio)
    ? row.metadata.pegRatio
    : (forwardPe != null && (epsGrowth ?? 0) > 0 ? forwardPe / Math.max((epsGrowth ?? 0) * 100, 1) : null);
  const evEbitda = Number.isFinite(row.metadata?.enterpriseToEbitda)
    ? row.metadata.enterpriseToEbitda
    : (pe != null ? clamp(pe * (0.65 + profile.quality * 0.18), 4, 60) : null);
  const psRatio = clamp(1.2 + profile.growth * 7.5 + profile.quality * 1.4 + profile.sentiment * 0.8, 0.8, 18);

  return {
    revenueGrowth: Number.isFinite(row.metadata?.revenueGrowth) ? row.metadata.revenueGrowth : revenueGrowth,
    epsGrowth,
    grossMargin,
    freeCashFlow,
    roe,
    operatingMargin,
    debtRatio,
    cashReserve,
    fcfGrowth,
    analystView,
    guidance,
    pe,
    forwardPe,
    peg,
    evEbitda,
    psRatio,
  };
}

function buildQualityScore(metrics) {
  const parts = [
    metricScore((metrics.roe ?? 0) * 100, 5, 25),
    metricScore((metrics.grossMargin ?? 0) * 100, 20, 60),
    metricScore(metrics.operatingMargin * 100, 8, 30),
    metricScore(metrics.freeCashFlow ?? 0, -2, 8),
    inverseMetricScore(metrics.debtRatio * 100, 35, 80),
    metricScore(metrics.cashReserve * 100, 10, 45),
  ];
  return clamp(Math.round(mean(parts) ?? 50), 0, 100);
}

function buildGrowthScore(metrics) {
  const parts = [
    metricScore((metrics.revenueGrowth ?? 0) * 100, 3, 28),
    metricScore((metrics.epsGrowth ?? 0) * 100, 2, 24),
    metricScore(metrics.fcfGrowth * 100, -5, 22),
    metricScore(metrics.guidance * 100, 0, 20),
    metricScore(metrics.analystView * 100, 0, 24),
  ];
  return clamp(Math.round(mean(parts) ?? 50), 0, 100);
}

function buildValuationScore(metrics, profile) {
  const parts = [];
  if (metrics.pe != null) parts.push(inverseMetricScore(metrics.pe, 12, 48));
  if (metrics.forwardPe != null) parts.push(inverseMetricScore(metrics.forwardPe, 10, 40));
  if (metrics.peg != null) parts.push(inverseMetricScore(metrics.peg, 0.8, 2.8));
  if (metrics.evEbitda != null) parts.push(inverseMetricScore(metrics.evEbitda, 8, 28));
  if (metrics.psRatio != null) parts.push(inverseMetricScore(metrics.psRatio, 2.5, 14));
  if (!parts.length) {
    parts.push(inverseMetricScore(18 + profile.growth * 28 - profile.cash * 6, 10, 40));
  }
  return clamp(Math.round(mean(parts) ?? 50), 0, 100);
}

function valuationStateFromScore(score) {
  if (score >= 67) return t("undervalued");
  if (score >= 40) return t("fairlyValued");
  return t("overvalued");
}

function classifyStockType(row, dims, metrics, qualityScore, growthScore, valuationScore) {
  const marketCap = row.marketCap ?? 0;
  const price = row.price ?? 0;
  const pe = metrics.pe;
  const forwardPe = metrics.forwardPe;
  const historyCount = row.technicals?.history?.closes?.length ?? 0;
  const revenueGrowth = metrics.revenueGrowth ?? 0;
  const epsGrowth = metrics.epsGrowth ?? 0;
  const veryRichValuation = (pe ?? 0) >= 60 || (forwardPe ?? 0) >= 45 || valuationScore <= 35;
  const strongGrowthProfile = growthScore >= 68 || revenueGrowth >= 0.16 || epsGrowth >= 0.14 || (row.profile?.growth ?? 0) >= 0.68;
  const unstableQuality = qualityScore < 40 && dims.fundamental < 40;

  if (historyCount > 0 && historyCount < 120) return "newlyListed";
  if (price < 5 || (((pe ?? 80) > 80 || (forwardPe ?? 80) > 60) && growthScore < 60) || ((row.profile?.cash ?? 0) < 0 && dims.fundamental < 40)) return "speculative";
  if (qualityScore < 40 && growthScore < 45 && dims.technical < 55) return "turnaround";
  if ((pe ?? 999) < 18 && valuationScore >= 60 && qualityScore >= 50) return "value";
  if ((row.profile?.cash ?? 0) > 0.45 && qualityScore >= 68 && growthScore < 58) return "dividend";
  if (strongGrowthProfile && (veryRichValuation || marketCap < 500_000_000_000 || qualityScore < 78)) return "growth";
  if (marketCap >= 500_000_000_000 && !veryRichValuation && !unstableQuality) return "megaCap";
  if (strongGrowthProfile) return "growth";
  return marketCap >= 150_000_000_000 ? "megaCap" : "value";
}

function weightedResearchScore(weights, scores) {
  let total = 0;
  let weightSum = 0;
  Object.entries(weights).forEach(([key, weight]) => {
    const value = scores[key];
    if (!Number.isFinite(value)) return;
    total += value * weight;
    weightSum += weight;
  });
  return weightSum ? Math.round(total / weightSum) : 50;
}

function longTermActionFromScore(score) {
  return scoreBucketLabel(score);
}

function longTermFitFromScore(score, action) {
  if (action === "Buy" && score >= 72) return t("suitableForAccumulation");
  if (score >= 58) return t("suitableForWatchlist");
  if (score >= 40) return t("needsMoreProof");
  return t("unsuitableForLongTerm");
}

function buildInvestmentThesis(row, dims, metrics, research) {
  const own = [];
  const watch = [];

  if (research.stockType === "megaCap") own.push(currentLanguage === "zh" ? "龙头平台属性强，经营韧性更高" : "Platform scale and operating resilience remain strong");
  if (research.stockType === "growth") own.push(currentLanguage === "zh" ? "成长逻辑仍在，市场愿意为增速付溢价" : "Growth remains the main reason investors are willing to pay up");
  if ((metrics.revenueGrowth ?? 0) >= 0.14) own.push(currentLanguage === "zh" ? "营收增长仍在健康区间" : "Revenue growth is still running at a healthy clip");
  if ((metrics.epsGrowth ?? 0) >= 0.12) own.push(currentLanguage === "zh" ? "利润扩张能力仍在改善" : "EPS growth still points to improving earnings power");
  if ((metrics.freeCashFlow ?? 0) > 0) own.push(currentLanguage === "zh" ? "自由现金流为正，长期容错率更高" : "Free cash flow is positive, which improves long-term durability");
  if (research.qualityScore >= 75) own.push(currentLanguage === "zh" ? "企业质量较高，适合长期跟踪" : "Business quality is strong enough for long-term monitoring");

  if ((metrics.pe ?? 0) >= 35 || research.valuationScore < 40) watch.push(currentLanguage === "zh" ? "当前估值不便宜，需要更好的进入位置" : "Valuation is still rich, so entry price matters");
  if ((row.technicals?.rsi14 ?? 50) >= 68) watch.push(currentLanguage === "zh" ? "RSI 偏热，短线不适合追高" : "RSI is elevated, which argues against chasing");
  if (row.price != null && row.technicals?.ma50 != null && row.price < row.technicals.ma50) watch.push(currentLanguage === "zh" ? "价格跌破 MA50，趋势确认还不够" : "Price is below MA50, so trend confirmation is incomplete");
  if ((metrics.freeCashFlow ?? 0) < 0) watch.push(currentLanguage === "zh" ? "自由现金流为负，长期兑现需要继续观察" : "Negative free cash flow lowers long-term confidence");
  if ((row.technicals?.srAnalysis?.resistanceDistancePct ?? 99) <= 2.5) watch.push(currentLanguage === "zh" ? "股价接近压力位，短期波动可能加大" : "Price is close to resistance, which can increase near-term volatility");
  if (research.stockType === "speculative") watch.push(currentLanguage === "zh" ? "投机属性较强，更适合观察名单而非重仓" : "Speculative profile makes this better for a watchlist than a core position");

  return {
    own: own.slice(0, 4),
    watch: watch.slice(0, 4),
    summary: row.profile?.note || t("neutralSetup"),
  };
}

function buildOptionsRead(row) {
  const options = row.technicals?.optionsMarket;
  const price = row.price ?? 0;
  const volatilityFallback = computeOptionsVolatilityFallback(row, options);
  if (!options?.available) {
    return {
      available: false,
      summary: t("optionsUnavailable"),
      signal: "hold",
      scoreAdjustment: 0,
      longScoreAdjustment: 0,
      callWall: null,
      putWall: null,
      gammaFlip: null,
      callWallDistancePct: null,
      putWallDistancePct: null,
      gammaFlipDistancePct: null,
      impliedVolatility: volatilityFallback.impliedVolatility,
      historicVolatility: volatilityFallback.historicVolatility,
      ivPercentile: volatilityFallback.ivPercentile,
      ivRank: volatilityFallback.ivRank,
      netGex: Number.isFinite(options?.netGammaExposure) ? options.netGammaExposure : null,
    };
  }

  const callWall = options.callWall?.strike ?? null;
  const putWall = options.putWall?.strike ?? null;
  const gammaFlip = options.gammaFlip?.strike ?? null;
  const callWallDistancePct = Number.isFinite(callWall) && price > 0 ? ((callWall - price) / price) * 100 : null;
  const putWallDistancePct = Number.isFinite(putWall) && price > 0 ? ((price - putWall) / price) * 100 : null;
  const gammaFlipDistancePct = Number.isFinite(gammaFlip) && price > 0 ? ((price - gammaFlip) / price) * 100 : null;

  const nearCallWall = callWallDistancePct != null && callWallDistancePct >= 0 && callWallDistancePct <= 2;
  const nearPutWall = putWallDistancePct != null && putWallDistancePct >= 0 && putWallDistancePct <= 2.5;
  const aboveGamma = gammaFlip == null ? null : price >= gammaFlip;
  let signal = "hold";
  let summary = t("optionsNeutral");
  let scoreAdjustment = 0;
  let longScoreAdjustment = 0;

  if (nearPutWall && aboveGamma !== false) {
    signal = "buy";
    summary = t("optionsSupportive");
    scoreAdjustment = 6;
    longScoreAdjustment = 3;
  } else if (nearCallWall || aboveGamma === false) {
    signal = "sell";
    summary = t("optionsCapped");
    scoreAdjustment = -8;
    longScoreAdjustment = -4;
  }

  return {
    available: true,
    summary,
    signal,
    scoreAdjustment,
    longScoreAdjustment,
    callWall,
    putWall,
    gammaFlip,
    callWallDistancePct,
    putWallDistancePct,
    gammaFlipDistancePct,
    impliedVolatility: options.impliedVolatility ?? volatilityFallback.impliedVolatility,
    historicVolatility: options.historicVolatility ?? volatilityFallback.historicVolatility,
    ivPercentile: options.ivPercentile ?? volatilityFallback.ivPercentile,
    ivRank: options.ivRank ?? volatilityFallback.ivRank,
    netGex: options.netGammaExposure ?? null,
    nearestExpiry: options.nearestExpiry ?? null,
    coverage: options.coverage ?? null,
    totalCallOpenInterest: options.totalCallOpenInterest ?? null,
    totalPutOpenInterest: options.totalPutOpenInterest ?? null,
  };
}

function buildLongTermResearch(row) {
  if (row.noData) {
    return {
      technical: 50,
      fundamental: 50,
      moneyFlow: 50,
      risk: 50,
      qualityScore: 50,
      growthScore: 50,
      valuationScore: 50,
      overallScore: 50,
      longTermRating: "Hold",
      currentAction: "Hold",
      stockType: "growth",
      stockTypeLabel: t("growthType"),
      modelLabel: t("growthModel"),
      weights: stockTypeConfig("growth").weights,
      valuationState: t("fairlyValued"),
      longTermFit: t("needsMoreProof"),
      metrics: buildResearchMetrics(row),
      thesis: { own: [], watch: [t("noSignalReason")], summary: t("noSignalReason") },
    };
  }

  const dims = buildDimensionScores(row);
  const metrics = buildResearchMetrics(row);
  const qualityScore = buildQualityScore(metrics);
  const growthScore = buildGrowthScore(metrics);
  const valuationScore = buildValuationScore(metrics, row.profile || profileForTicker(row.ticker));
  const fundamental = clamp(Math.round(((dims.fundamental * 0.45) + (qualityScore * 0.3) + (growthScore * 0.15) + (valuationScore * 0.1))), 0, 100);
  const stockType = classifyStockType(row, dims, metrics, qualityScore, growthScore, valuationScore);
  const config = stockTypeConfig(stockType);
  const optionsRead = buildOptionsRead(row);
  const componentScores = {
    technical: dims.technical,
    fundamental,
    moneyFlow: dims.moneyFlow,
    quality: qualityScore,
    growth: growthScore,
    valuation: valuationScore,
  };
  const overallScore = clamp(weightedResearchScore(config.weights, componentScores) + optionsRead.longScoreAdjustment, 0, 100);
  const longTermRating = longTermActionFromScore(overallScore);
  const currentAction = determineSetupAction({
    score: overallScore,
    srAnalysis: row.technicals?.srAnalysis,
    rsi14: row.technicals?.rsi14 ?? 50,
    fibPosition: row.technicals?.fibPosition ?? 0.5,
    price: row.price ?? 0,
    ma20: row.technicals?.ma20 ?? row.price ?? 0,
    ma50: row.technicals?.ma50 ?? row.price ?? 0,
    changePercent: row.changePercent ?? 0,
    profile: row.profile,
    optionsMarket: row.technicals?.optionsMarket,
  });
  const longTermFit = longTermFitFromScore(overallScore, longTermRating);
  const thesis = buildInvestmentThesis(row, { ...dims, fundamental }, metrics, {
    stockType,
    qualityScore,
    growthScore,
    valuationScore,
  });

  return {
    ...dims,
    fundamental,
    qualityScore,
    growthScore,
    valuationScore,
    overallScore,
    longTermRating,
    currentAction,
    stockType,
    stockTypeLabel: config.label,
    modelLabel: config.modelLabel,
    weights: config.weights,
    valuationState: valuationStateFromScore(valuationScore),
    longTermFit,
    metrics,
    thesis,
    optionsRead,
  };
}

function compactLevelList(values, count = 2) {
  return values.filter((value) => Number.isFinite(value)).slice(0, count);
}

function buildDecisionLevels(row) {
  const tech = row.technicals || {};
  const sr = tech.srAnalysis || {};
  const optionsRead = row.research?.optionsRead || buildOptionsRead(row);
  const shortSupportPool = [
    ...(sr.support || []).map((item) => item.price),
    optionsRead.putWall,
    Number.isFinite(optionsRead.gammaFlip) && optionsRead.gammaFlip <= (row.price ?? Number.POSITIVE_INFINITY) ? optionsRead.gammaFlip : null,
  ].filter((value) => Number.isFinite(value) && value <= (row.price ?? Number.POSITIVE_INFINITY));
  const shortResistancePool = [
    ...(sr.resistance || []).map((item) => item.price),
    optionsRead.callWall,
    Number.isFinite(optionsRead.gammaFlip) && optionsRead.gammaFlip >= (row.price ?? 0) ? optionsRead.gammaFlip : null,
  ].filter((value) => Number.isFinite(value) && value >= (row.price ?? 0));
  const shortSupport = [...new Set(shortSupportPool.map((value) => Number(value.toFixed(2))))].sort((a, b) => b - a).slice(0, 2);
  const shortResistance = [...new Set(shortResistancePool.map((value) => Number(value.toFixed(2))))].sort((a, b) => a - b).slice(0, 2);
  const longSupportPool = [
    tech.ma200,
    tech.ma100,
    tech.rangeLow,
    optionsRead.putWall,
    Number.isFinite(optionsRead.gammaFlip) && optionsRead.gammaFlip <= (row.price ?? Number.POSITIVE_INFINITY) ? optionsRead.gammaFlip : null,
    (sr.support || [])[2]?.price,
    (sr.support || [])[1]?.price,
  ].filter((value) => Number.isFinite(value) && value <= (row.price ?? Number.POSITIVE_INFINITY));
  const longResistancePool = [
    tech.rangeHigh,
    tech.ma50 > (row.price ?? 0) ? tech.ma50 : null,
    tech.upperBand > (row.price ?? 0) ? tech.upperBand : null,
    optionsRead.callWall,
    Number.isFinite(optionsRead.gammaFlip) && optionsRead.gammaFlip >= (row.price ?? 0) ? optionsRead.gammaFlip : null,
    (sr.resistance || [])[2]?.price,
    (sr.resistance || [])[1]?.price,
  ].filter((value) => Number.isFinite(value) && value >= (row.price ?? 0));

  const longSupport = [...new Set(longSupportPool.map((value) => Number(value.toFixed(2))))].sort((a, b) => b - a).slice(0, 2);
  const longResistance = [...new Set(longResistancePool.map((value) => Number(value.toFixed(2))))].sort((a, b) => a - b).slice(0, 2);
  const nearestSupport = shortSupport[0] ?? longSupport[0] ?? null;
  const nearestResistance = shortResistance[0] ?? longResistance[0] ?? null;
  return {
    shortSupport,
    shortResistance,
    longSupport,
    longResistance,
    callWall: optionsRead.callWall,
    putWall: optionsRead.putWall,
    gammaFlip: optionsRead.gammaFlip,
    supportDistancePct: nearestSupport != null && row.price ? ((row.price - nearestSupport) / row.price) * 100 : null,
    resistanceDistancePct: nearestResistance != null && row.price ? ((nearestResistance - row.price) / row.price) * 100 : null,
  };
}

function moneyFlowStageSummary(row) {
  const reason = row.indicatorMap?.volume?.reason || "";
  const lower = reason.toLowerCase();
  if (reason.includes("大涨 + 放量 + 收在高位")) return { behavior: reason, stage: t("markup") };
  if (reason.includes("小涨 + 放量 + 收在高位")) return { behavior: reason, stage: t("launch") };
  if (reason.includes("大涨 + 放量 + 收盘回落") || reason.includes("巨量 + 收盘不强")) return { behavior: reason, stage: t("distribution") };
  if (reason.includes("缩量 + 收稳") || reason.includes("缩量且收盘中性")) return { behavior: reason, stage: t("shakeout") };
  if (reason.includes("下跌 + 放量 + 收在低位") || reason.includes("小跌 + 放量 + 收在低位")) return { behavior: reason, stage: t("decline") };
  if (reason.includes("放量且收在高位") || lower.includes("supportive")) return { behavior: reason, stage: t("absorption") };
  return { behavior: reason || (currentLanguage === "zh" ? "组合信号中性" : "Flow is mixed"), stage: t("shakeout") };
}

function buildTargetStop(row) {
  const sr = row.technicals?.srAnalysis;
  const support = sr?.support || [];
  const resistance = sr?.resistance || [];
  const currentPrice = row.price ?? 0;
  const targetSource = resistance.find((item) => item.price > currentPrice * 1.02) || resistance[0];
  const stopSource = support.find((item) => item.price < currentPrice * 0.99) || support[0];
  const target = targetSource?.price ?? currentPrice * 1.08;
  const stop = stopSource?.price ?? currentPrice * 0.92;
  const upside = currentPrice > 0 ? ((target - currentPrice) / currentPrice) * 100 : null;
  const downside = currentPrice > 0 ? ((currentPrice - stop) / currentPrice) * 100 : null;
  const riskReward = downside && downside > 0 && upside != null ? upside / downside : null;
  const rating = riskReward == null ? t("moderate") : riskReward >= 2 ? (currentLanguage === "zh" ? "偏积极" : "Constructive") : riskReward >= 1.2 ? (currentLanguage === "zh" ? "中性" : "Neutral") : (currentLanguage === "zh" ? "偏弱" : "Weak");
  return { target, stop, upside, downside, riskReward, rating };
}

function buildAiReasons(row) {
  const positives = [];
  const warnings = [];
  const map = row.indicatorMap || {};
  const tech = row.technicals || {};
  const sr = tech.srAnalysis || {};
  const optionsRead = row.research?.optionsRead || buildOptionsRead(row);
  const companyNews = row.companyNews || {};
  const macroNews = row.globalMarketContext?.broad_macro_news || {};

  if (map.macd?.signal === "buy") positives.push(currentLanguage === "zh" ? "MACD 偏多" : "MACD trend is supportive");
  if ((tech.ema12 ?? 0) > (tech.ema26 ?? 0)) positives.push(currentLanguage === "zh" ? "EMA 仍保持上行结构" : "EMA structure is still positive");
  if (row.price != null && tech.ma50 != null && row.price > tech.ma50) positives.push(currentLanguage === "zh" ? "股价站上 MA50" : "Price remains above MA50");
  if (map.rev?.signal === "buy" && map.eps?.signal === "buy") positives.push(currentLanguage === "zh" ? "营收和利润增长仍然健康" : "Revenue and EPS growth remain healthy");
  if (map.fcf?.signal === "buy") positives.push(currentLanguage === "zh" ? "自由现金流为正" : "Free cash flow remains positive");
  if ((sr.supportDistancePct ?? 99) <= 3 && (sr.supportStrength ?? 0) >= 50) positives.push(currentLanguage === "zh" ? "距离强支撑不远" : "Price is not far from a stronger support zone");
  if (optionsRead.signal === "buy" && Number.isFinite(optionsRead.putWall)) positives.push(currentLanguage === "zh" ? `Put Wall 支撑在 ${formatCurrency(optionsRead.putWall, row.currencyCode)}` : `Put wall support sits near ${formatCurrency(optionsRead.putWall, row.currencyCode)}`);
  if (companyNews.sentiment === "bullish" && companyNews.key_catalysts?.length) positives.push(companyNews.key_catalysts[0]);

  if ((tech.rsi14 ?? 50) >= 68) warnings.push(currentLanguage === "zh" ? "RSI 偏高，不适合追涨" : "RSI is elevated, so chasing strength is less attractive");
  if (row.price != null && tech.ma20 != null && row.price < tech.ma20) warnings.push(currentLanguage === "zh" ? "价格跌破 MA20，短线动能转弱" : "Price is below MA20, which weakens short-term momentum");
  if ((sr.resistanceDistancePct ?? 99) <= 2) warnings.push(currentLanguage === "zh" ? "股价接近压力区" : "Price is already close to resistance");
  if (map.fcf?.signal === "sell") warnings.push(currentLanguage === "zh" ? "自由现金流为负" : "Free cash flow is negative");
  if ((row.trailingPE ?? 0) >= 35) warnings.push(currentLanguage === "zh" ? "估值偏高" : "Valuation is rich");
  if ((row.changePercent ?? 0) <= -3) warnings.push(currentLanguage === "zh" ? "单日跌幅较大，情绪偏弱" : "The latest selloff shows weaker short-term sentiment");
  if (optionsRead.signal === "sell" && Number.isFinite(optionsRead.callWall)) warnings.push(currentLanguage === "zh" ? `Call Wall 压力在 ${formatCurrency(optionsRead.callWall, row.currencyCode)}` : `Call wall resistance sits near ${formatCurrency(optionsRead.callWall, row.currencyCode)}`);
  if (companyNews.sentiment === "bearish" && companyNews.risk_events?.length) warnings.push(companyNews.risk_events[0]);
  if (macroNews.sentiment === "bearish" && macroNews.major_events?.length) {
    warnings.push(currentLanguage === "zh" ? `大环境偏空：${macroNews.major_events[0].headline}` : `Broader macro flow is risk-off: ${macroNews.major_events[0].headline}`);
  }

  return {
    positives: positives.slice(0, 4),
    warnings: warnings.slice(0, 4),
  };
}

function buildTrendSummary(row) {
  const tech = row.technicals || {};
  return [
    {
      label: t("shortTermTrend"),
      value: Number.isFinite(tech.ema12) && Number.isFinite(tech.ema26)
        ? `${formatCurrency(tech.ema12, row.currencyCode)} ${tech.ema12 > tech.ema26 ? ">" : "<"} ${formatCurrency(tech.ema26, row.currencyCode)}`
        : "—",
      signal: tech.ema12 > tech.ema26 ? "buy" : tech.ema12 < tech.ema26 ? "sell" : "hold",
      note: currentLanguage === "zh"
        ? (tech.ema12 > tech.ema26 ? "短期均线仍偏多" : tech.ema12 < tech.ema26 ? "短期均线转弱" : "短期均线中性")
        : (tech.ema12 > tech.ema26 ? "Short-term EMA trend is positive" : tech.ema12 < tech.ema26 ? "Short-term EMA trend is weakening" : "Short-term EMA trend is neutral"),
    },
    {
      label: t("midTermTrend"),
      value: Number.isFinite(tech.ma50) && row.price != null
        ? `${formatCurrency(row.price, row.currencyCode)} ${row.price > tech.ma50 ? ">" : "<"} ${formatCurrency(tech.ma50, row.currencyCode)}`
        : "—",
      signal: row.price > tech.ma50 ? "buy" : row.price < tech.ma50 ? "sell" : "hold",
      note: currentLanguage === "zh"
        ? (row.price > tech.ma50 ? "价格高于 MA50" : "价格低于 MA50")
        : (row.price > tech.ma50 ? "Price remains above MA50" : "Price is below MA50"),
    },
    {
      label: t("longTermTrend"),
      value: Number.isFinite(tech.ma200) && row.price != null
        ? `${formatCurrency(row.price, row.currencyCode)} ${row.price > tech.ma200 ? ">" : "<"} ${formatCurrency(tech.ma200, row.currencyCode)}`
        : "—",
      signal: row.price > tech.ma200 ? "buy" : row.price < tech.ma200 ? "sell" : "hold",
      note: currentLanguage === "zh"
        ? (row.price > tech.ma200 ? "长期趋势仍在 MA200 上方" : "长期趋势跌破 MA200")
        : (row.price > tech.ma200 ? "Long-term trend is still above MA200" : "Long-term trend is below MA200"),
    },
  ];
}

function buildTechnicalConclusion(row, score) {
  if (score >= 70) return currentLanguage === "zh" ? "技术趋势整体偏多，适合继续跟踪中期趋势是否延续。" : "Technicals support the medium-term trend and remain worth tracking.";
  if (score >= 45) return currentLanguage === "zh" ? "技术面中性，说明趋势没有明显破坏，但也缺少强确认。" : "Technicals are mixed, which means the trend is intact but not fully confirmed.";
  return currentLanguage === "zh" ? "技术结构偏弱，当前更像等待而不是主动加仓的阶段。" : "Technical structure is weak, so patience matters more than aggressive adds.";
}

function buildFundamentalConclusion(row, research) {
  if ((research.qualityScore ?? 50) >= 75 && (research.growthScore ?? 50) >= 65) {
    return currentLanguage === "zh" ? "质量和成长兼备，符合优质成长股思路。" : "Business quality and growth both support a longer-duration growth thesis.";
  }
  if ((research.fundamental ?? 50) >= 55) {
    return currentLanguage === "zh" ? "基本面可以支撑继续观察，但估值和兑现节奏仍要跟踪。" : "Fundamentals justify staying engaged, though execution and valuation still need monitoring.";
  }
  return currentLanguage === "zh" ? "基本面支撑不够强，长期持有的容错率有限。" : "Fundamentals are not strong enough to offer much long-term margin of safety.";
}

function buildFlowConclusion(row, score) {
  const reason = row.indicatorMap?.volume?.reason;
  if (reason && currentLanguage === "zh") return reason;
  if (reason) return reason;
  if (score >= 65) return currentLanguage === "zh" ? "资金和量能配合较好，说明市场承接尚可。" : "Flow and volume remain supportive, which suggests healthy sponsorship.";
  if (score >= 45) return currentLanguage === "zh" ? "资金面中性，说明市场还在等待更多催化。" : "Money flow is neutral and still waiting for stronger catalysts.";
  return currentLanguage === "zh" ? "资金承接偏弱，说明市场对当前价格并不积极。" : "Money flow is weak, which points to less enthusiastic sponsorship at current levels.";
}

function buildRiskReasons(row, riskScore) {
  const reasons = [];
  const tech = row.technicals || {};
  if ((tech.rsi14 ?? 50) >= 68) reasons.push(currentLanguage === "zh" ? "RSI 接近超买" : "RSI is close to overbought");
  if ((row.trailingPE ?? 0) >= 35) reasons.push(currentLanguage === "zh" ? "PE 高于常规舒适区间" : "PE is above a comfortable valuation range");
  if ((row.forwardPE ?? 0) >= 30) reasons.push(currentLanguage === "zh" ? "远期市盈率仍偏高" : "Forward PE is still elevated");
  if (row.indicatorMap?.fcf?.signal === "sell") reasons.push(currentLanguage === "zh" ? "自由现金流为负" : "Free cash flow is negative");
  if ((tech.srAnalysis?.resistanceDistancePct ?? 99) <= 2.5) reasons.push(currentLanguage === "zh" ? "股价接近压力位" : "Price is close to resistance");
  if (row.price != null && tech.ma50 != null && row.price < tech.ma50) reasons.push(currentLanguage === "zh" ? "价格跌破 MA50" : "Price is below MA50");
  if ((row.changePercent ?? 0) <= -3) reasons.push(currentLanguage === "zh" ? "近期波动放大" : "Recent volatility has expanded");
  if (!reasons.length) {
    reasons.push(riskScore >= 70
      ? (currentLanguage === "zh" ? "当前主要风险不突出。" : "No single risk factor is dominating right now.")
      : (currentLanguage === "zh" ? "风险暂时可控，但需要继续观察。" : "Risks are manageable, but still worth monitoring."));
  }
  return reasons.slice(0, 4);
}

function buildDetailPayload(row) {
  const research = row.research || buildLongTermResearch(row);
  const consensus = buildConsensus(row);
  const levels = buildDecisionLevels(row);
  const optionsRead = research.optionsRead || buildOptionsRead(row);
  const flowStage = moneyFlowStageSummary(row);
  const technicalConclusion = buildTechnicalConclusion(row, research.technical);
  const fundamentalConclusion = buildFundamentalConclusion(row, research);
  const flowConclusion = buildFlowConclusion(row, research.moneyFlow);
  const technicalRisks = buildRiskReasons(row, research.risk).slice(0, 3);
  const fundamentalRisks = [
    (research.valuationScore ?? 50) < 40 ? (currentLanguage === "zh" ? "估值仍偏高，需要更高兑现度" : "Valuation is still rich and needs stronger execution") : null,
    (research.metrics.freeCashFlow ?? 0) < 0 ? (currentLanguage === "zh" ? "自由现金流仍为负" : "Free cash flow is still negative") : null,
    (research.metrics.debtRatio ?? 0) > 0.62 ? (currentLanguage === "zh" ? "资产负债率偏高" : "Debt load looks elevated") : null,
  ].filter(Boolean);
  const flowRisks = [
    (row.technicals?.volumeRatio ?? 1) < 0.85 ? (currentLanguage === "zh" ? "量比偏低，说明承接一般" : "Volume ratio is light, which suggests softer sponsorship") : null,
    (row.changePercent ?? 0) <= -3 ? (currentLanguage === "zh" ? "最近单日跌幅较大，情绪转弱" : "Recent downside move shows weaker near-term sentiment") : null,
    row.indicatorMap?.volume?.signal === "sell" ? (currentLanguage === "zh" ? "成交量结构偏弱" : "Volume structure is leaning weak") : null,
  ].filter(Boolean);
  const scoreDelta = clamp(
    Math.round(
      ((row.changePercent ?? 0) * 0.45)
      + (((research.technical ?? 50) - (research.fundamental ?? 50)) / 28)
      + (((research.moneyFlow ?? 50) - 50) / 22),
    ),
    -8,
    8,
  );
  const previousScore = clamp((research.overallScore ?? 50) - scoreDelta, 0, 100);
  const scoreBreakdown = Object.entries(research.weights).map(([key, weight]) => ({
    key,
    label: key === "technical"
      ? t("technicalScore")
      : key === "fundamental"
        ? t("fundamentalScore")
        : key === "moneyFlow"
          ? t("moneyFlowScore")
          : key === "quality"
            ? t("qualityScore")
            : key === "growth"
              ? t("growthScore")
              : t("valuationScore"),
    value: key === "technical"
      ? research.technical
      : key === "fundamental"
        ? research.fundamental
        : key === "moneyFlow"
          ? research.moneyFlow
          : key === "quality"
            ? research.qualityScore
            : key === "growth"
              ? research.growthScore
              : research.valuationScore,
    weight,
  }));
  const currentActionReason = row.action === "Buy" || row.action === "Strong Buy"
    ? (optionsRead.signal === "buy" && Number.isFinite(optionsRead.putWall)
      ? (currentLanguage === "zh" ? `短线更接近 Put Wall 支撑 ${formatCurrency(optionsRead.putWall, row.currencyCode)}，可以围绕关键位分批观察。` : `Price is close to the put wall support near ${formatCurrency(optionsRead.putWall, row.currencyCode)}, which allows more controlled scaling.`)
      : (currentLanguage === "zh" ? "短期价格位置更接近支撑区，可以围绕关键位分批观察。" : "Short-term price is closer to support, which allows more controlled scaling."))
    : row.action === "Hold"
      ? (optionsRead.signal === "sell" && Number.isFinite(optionsRead.callWall)
        ? (currentLanguage === "zh" ? `上方 Call Wall ${formatCurrency(optionsRead.callWall, row.currencyCode)} 仍在压制，优先等回踩支撑或突破确认。` : `The call wall near ${formatCurrency(optionsRead.callWall, row.currencyCode)} is still capping price, so waiting for support or a confirmed breakout is cleaner.`)
        : (currentLanguage === "zh" ? "当前买点一般，优先等回踩支撑或突破确认后再看。" : "The entry is average here, so it is better to wait for support or a confirmed breakout."))
      : (currentLanguage === "zh" ? "短期先等价格重新站稳关键位，再评估是否参与。" : "Wait for price to reclaim key levels before reconsidering a short-term entry.");
  const buyTrigger = Number.isFinite(optionsRead.callWall)
    ? (currentLanguage === "zh"
      ? `放量突破 ${formatCurrency(optionsRead.callWall, row.currencyCode)}（Call Wall）`
      : `Break above the call wall at ${formatCurrency(optionsRead.callWall, row.currencyCode)} on stronger volume`)
    : levels.shortResistance[0] != null
      ? (currentLanguage === "zh"
        ? `放量突破 ${formatCurrency(levels.shortResistance[0], row.currencyCode)}`
        : `Break above ${formatCurrency(levels.shortResistance[0], row.currencyCode)} on stronger volume`)
      : t("noSignalReason");
  const waitZone = Number.isFinite(optionsRead.putWall)
    ? formatCurrency(optionsRead.putWall, row.currencyCode)
    : levels.shortSupport[0] != null
      ? formatCurrency(levels.shortSupport[0], row.currencyCode)
      : "—";
  const shortTermPlan = row.action === "Hold"
    ? (optionsRead.signal === "sell" && Number.isFinite(optionsRead.callWall)
      ? (currentLanguage === "zh" ? `不追高，优先观察 ${formatCurrency(optionsRead.callWall, row.currencyCode)} 一带是否被有效突破。` : `Do not chase. Watch for a clean break above ${formatCurrency(optionsRead.callWall, row.currencyCode)} first.`)
      : (currentLanguage === "zh" ? `不追高，优先等待回踩 ${waitZone} 附近或突破后再看。` : `Do not chase. Prefer a pullback toward ${waitZone} or a confirmed breakout.`))
    : row.action.includes("Buy")
      ? (currentLanguage === "zh" ? `可以小仓位试探，优先围绕 ${waitZone} 分批观察。` : `A small starter position is reasonable around ${waitZone}.`)
      : (currentLanguage === "zh" ? "先观察结构修复，不急着逆势加仓。" : "Wait for structure repair before getting involved.");
  const longTermPlan = research.longTermRating === "Buy" || research.longTermRating === "Strong Buy"
    ? (optionsRead.signal === "sell" && Number.isFinite(optionsRead.callWall)
      ? (currentLanguage === "zh" ? `长期逻辑仍可跟踪，但更适合等待突破 ${formatCurrency(optionsRead.callWall, row.currencyCode)} 或回踩支撑后再分批布局。` : `The long-term thesis is still workable, but entries look better after a break above ${formatCurrency(optionsRead.callWall, row.currencyCode)} or a pullback into support.`)
      : (currentLanguage === "zh" ? "适合分批建仓，不建议一次性满仓。" : "Suitable for staged accumulation rather than a full-size entry."))
    : research.longTermRating === "Hold"
      ? (currentLanguage === "zh" ? "适合继续放在观察名单，等估值或买点更有利。" : "Keep it on the watchlist and wait for a better entry or valuation.")
      : (currentLanguage === "zh" ? "长期吸引力不足，除非逻辑明显改善。" : "Long-term appeal is limited unless the thesis improves materially.");

  return {
    dims: {
      overall: research.overallScore,
      technical: research.technical,
      fundamental: research.fundamental,
      moneyFlow: research.moneyFlow,
      quality: research.qualityScore,
      growth: research.growthScore,
      valuation: research.valuationScore,
    },
    consensus,
    research,
    technicalConclusion,
    fundamentalConclusion,
    flowConclusion,
    trendSummary: buildTrendSummary(row),
    previousScore,
    scoreDelta,
    scoreBreakdown,
    reasonLines: buildProfessionalReasonLines(row),
    technicalRisks,
    fundamentalRisks,
    flowRisks,
    optionsRead,
    levels,
    flowStage,
    currentActionReason,
    buyTrigger,
    waitZone,
    shortTermPlan,
    longTermPlan,
  };
}

function levelStrengthLabel(score) {
  if (score >= 70) return "strong";
  if (score >= 45) return "medium";
  return "weak";
}

function localizedStrength(value) {
  if (value === "strong") return t("strong");
  if (value === "medium") return t("medium");
  return t("weak");
}

function ratingTone(value) {
  const normalized = String(value || "").toLowerCase();
  if (normalized.includes("buy")) return "buy";
  if (normalized.includes("weak hold")) return "hold";
  if (normalized.includes("reduce")) return "sell";
  if (normalized.includes("sell") || normalized === "short") return "sell";
  return "hold";
}

function normalizeWeights(weights) {
  const entries = Object.entries(weights);
  const total = entries.reduce((sum, [, value]) => sum + value, 0) || 1;
  return Object.fromEntries(entries.map(([key, value]) => [key, value / total]));
}

function ratingDirection(score) {
  if (!Number.isFinite(score)) return 0;
  if (score >= 70) return 1;
  if (score >= 55) return 0;
  return -1;
}

function makeUnavailableBlock(fields = {}) {
  return { available: false, ...fields };
}

function calculateConfidence(values, missingCount = 0) {
  const valid = values.filter(Number.isFinite);
  if (!valid.length) return 35;
  const directions = valid.map(ratingDirection);
  const directionalVotes = directions.filter((value) => value !== 0);
  const consensus = directionalVotes.length
    ? Math.max(
      directionalVotes.filter((value) => value > 0).length,
      directionalVotes.filter((value) => value < 0).length,
    ) / directionalVotes.length
    : 0.5;
  const spread = stdDev(valid) ?? 0;
  const score = 40 + consensus * 42 + Math.max(0, 18 - spread * 0.35) - missingCount * 6;
  return clamp(Math.round(score), 25, 95);
}

function neutralScore(value) {
  return Number.isFinite(value) ? value : CALIBRATION_CONFIG.missing_data_neutral_score;
}

function classificationBucketKey(primaryCategory, tags = []) {
  if (primaryCategory === "MegaCap") return "megaCap";
  if (["Growth", "HighGrowth"].includes(primaryCategory)) return "growth";
  if (["Speculative", "IPO", "NewlyListed"].includes(primaryCategory)) return "speculative";
  if (["Dividend", "REIT"].includes(primaryCategory)) return "dividend";
  if (primaryCategory === "Value") return "value";
  if (tags.includes("MegaCap")) return "megaCap";
  if (tags.includes("Growth") || tags.includes("HighGrowth")) return "growth";
  if (tags.includes("Speculative") || tags.includes("IPO") || tags.includes("NewlyListed")) return "speculative";
  if (tags.includes("Dividend") || tags.includes("REIT")) return "dividend";
  if (tags.includes("Value")) return "value";
  return "growth";
}

function companyProfileTextBlob(row) {
  return [
    row.shortName,
    row.longName,
    row.metadata?.sector,
    row.metadata?.industry,
    row.metadata?.businessSummary,
  ].filter(Boolean).join(" ").toLowerCase();
}

function companyProfileSectorBlob(row) {
  return [
    row.metadata?.sector,
    row.metadata?.industry,
  ].filter(Boolean).join(" ").toLowerCase();
}

function countRegexMatches(text, regex) {
  if (!text) return 0;
  const matches = String(text).match(regex);
  return matches ? matches.length : 0;
}

function computeReturnPct(closes, lookback) {
  if (!Array.isArray(closes) || closes.length <= lookback) return null;
  const current = closes[closes.length - 1];
  const previous = closes[closes.length - 1 - lookback];
  if (!Number.isFinite(current) || !Number.isFinite(previous) || previous === 0) return null;
  return ((current - previous) / previous) * 100;
}

function computeAnnualizedVolatility(closes, lookback) {
  if (!Array.isArray(closes) || closes.length <= lookback + 1) return null;
  const slice = closes.slice(-lookback);
  const returns = [];
  for (let i = 1; i < slice.length; i += 1) {
    const prev = slice[i - 1];
    const next = slice[i];
    if (!Number.isFinite(prev) || !Number.isFinite(next) || prev === 0) continue;
    returns.push((next - prev) / prev);
  }
  const sigma = stdDev(returns);
  return Number.isFinite(sigma) ? sigma * Math.sqrt(252) * 100 : null;
}

function computeParkinsonVolatility(highs, lows, lookback) {
  if (!Array.isArray(highs) || !Array.isArray(lows) || highs.length < lookback || lows.length < lookback) return null;
  const highSlice = highs.slice(-lookback);
  const lowSlice = lows.slice(-lookback);
  const squaredLogRanges = [];
  for (let i = 0; i < highSlice.length; i += 1) {
    const high = highSlice[i];
    const low = lowSlice[i];
    if (!Number.isFinite(high) || !Number.isFinite(low) || high <= 0 || low <= 0 || high < low) continue;
    squaredLogRanges.push(Math.log(high / low) ** 2);
  }
  if (!squaredLogRanges.length) return null;
  const averageRange = mean(squaredLogRanges);
  return Number.isFinite(averageRange)
    ? Math.sqrt(averageRange / (4 * Math.log(2))) * Math.sqrt(252) * 100
    : null;
}

function computeHistoricVolatilityBlend(history) {
  const closes = history?.closes || [];
  const highs = history?.highs || [];
  const lows = history?.lows || [];
  const hv20 = computeAnnualizedVolatility(closes, 20);
  if (Number.isFinite(hv20)) return hv20;
  const components = [
    [computeAnnualizedVolatility(closes, 30), 0.65],
    [computeParkinsonVolatility(highs, lows, 20), 0.35],
  ].filter(([value]) => Number.isFinite(value));
  if (!components.length) return null;
  const totalWeight = components.reduce((sum, [, weight]) => sum + weight, 0);
  return components.reduce((sum, [value, weight]) => sum + value * weight, 0) / totalWeight;
}

function computeRollingHistoricVolSeries(history, minHistory = 40) {
  const closes = history?.closes || [];
  const highs = history?.highs || [];
  const lows = history?.lows || [];
  const length = Math.min(closes.length, highs.length, lows.length);
  const series = [];
  for (let endIndex = minHistory; endIndex <= length; endIndex += 1) {
    const value = computeHistoricVolatilityBlend({
      closes: closes.slice(0, endIndex),
      highs: highs.slice(0, endIndex),
      lows: lows.slice(0, endIndex),
    });
    if (Number.isFinite(value)) series.push(value);
  }
  return series;
}

function computeMedian(values) {
  const filtered = (values || []).filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
  if (!filtered.length) return null;
  const mid = Math.floor(filtered.length / 2);
  return filtered.length % 2 ? filtered[mid] : (filtered[mid - 1] + filtered[mid]) / 2;
}

function computeIvHistoryProxySeries(rollingSeries) {
  if (!rollingSeries.length) return [];
  const medianHv = computeMedian(rollingSeries);
  if (!Number.isFinite(medianHv) || medianHv <= 0) return [];
  const volOfVol = stdDev(rollingSeries);
  const normalizedVolOfVol = Number.isFinite(volOfVol) ? volOfVol / medianHv : 0;
  const basePremium = clamp(1.05 + (Math.min(medianHv, 100) / 100) * 0.18 + Math.min(normalizedVolOfVol, 1) * 0.08, 1.04, 1.28);
  const regimeReactivity = clamp(0.34 + Math.min(normalizedVolOfVol, 1) * 0.10 + (Math.min(medianHv, 100) / 100) * 0.06, 0.32, 0.52);
  const anchor = medianHv * basePremium;
  return rollingSeries.map((hv) => Math.max(anchor + ((hv - medianHv) * regimeReactivity), medianHv * 0.55));
}

function computeImpliedVolatilityProxy(row, options, history, historicVolatility) {
  if (Number.isFinite(options?.impliedVolatility)) return options.impliedVolatility;
  if (!Number.isFinite(historicVolatility)) return null;
  const rollingSeries = computeRollingHistoricVolSeries(history);
  const proxySeries = computeIvHistoryProxySeries(rollingSeries);
  const medianProxyIv = computeMedian(proxySeries);
  const medianHv = computeMedian(rollingSeries);
  const dailyMoveBoost = Number.isFinite(row.changePercent) ? Math.min(Math.abs(row.changePercent) / 40, 0.08) : 0;
  if (Number.isFinite(medianProxyIv) && Number.isFinite(medianHv) && medianHv > 0) {
    const regimeAdjustment = (historicVolatility - medianHv) * 0.38;
    return medianProxyIv + regimeAdjustment + (historicVolatility * dailyMoveBoost);
  }
  return historicVolatility * 1.08;
}

function computeOptionsVolatilityFallback(row, options) {
  const history = row.technicals?.history || row.history || {};
  const historicVolatility = Number.isFinite(options?.historicVolatility)
    ? options.historicVolatility
    : computeHistoricVolatilityBlend(history);
  const impliedVolatility = computeImpliedVolatilityProxy(row, options, history, historicVolatility);
  const rollingSeries = computeRollingHistoricVolSeries(history);
  const ivProxySeries = computeIvHistoryProxySeries(rollingSeries);
  let ivRank = Number.isFinite(options?.ivRank) ? options.ivRank : null;
  let ivPercentile = Number.isFinite(options?.ivPercentile) ? options.ivPercentile : null;

  if ((!Number.isFinite(ivRank) || !Number.isFinite(ivPercentile)) && Number.isFinite(impliedVolatility) && ivProxySeries.length) {
    const minValue = Math.min(...ivProxySeries);
    const maxValue = Math.max(...ivProxySeries);
    if (!Number.isFinite(ivRank) && maxValue > minValue) {
      ivRank = clamp(((impliedVolatility - minValue) / (maxValue - minValue)) * 100, 0, 100);
    }
    if (!Number.isFinite(ivPercentile)) {
      const belowCount = ivProxySeries.filter((value) => value <= impliedVolatility).length;
      ivPercentile = clamp((belowCount / ivProxySeries.length) * 100, 0, 100);
    }
  }

  return {
    impliedVolatility: Number.isFinite(impliedVolatility) ? impliedVolatility : null,
    historicVolatility: Number.isFinite(historicVolatility) ? historicVolatility : null,
    ivPercentile: Number.isFinite(ivPercentile) ? ivPercentile : null,
    ivRank: Number.isFinite(ivRank) ? ivRank : null,
  };
}

function yearsSinceIsoDate(value) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return (Date.now() - parsed.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
}

function pushProfileTag(tagSet, reasons, tag, reason) {
  if (!tagSet.has(tag)) tagSet.add(tag);
  if (reason) reasons.push(reason);
}

function selectPrimaryCategory(tags) {
  const set = new Set(tags);
  if (set.has("REIT")) return "REIT";
  if (set.has("Dividend")) return "Dividend";
  if (set.has("IPO")) return "IPO";
  if (set.has("NewlyListed")) return "NewlyListed";
  if (set.has("Speculative")) return "Speculative";
  if (set.has("MegaCap")) return "MegaCap";
  if (set.has("CashCow")) return "CashCow";
  if (set.has("HighGrowth")) return "HighGrowth";
  if (set.has("Growth")) return "Growth";
  if (set.has("StoryStock")) return "StoryStock";
  if (set.has("HighMultiple")) return "HighMultiple";
  if (set.has("Value")) return "Value";
  if (set.has("Cyclical")) return "Cyclical";
  if (set.has("Turnaround")) return "Turnaround";
  if (set.has("LargeCap")) return "LargeCap";
  if (set.has("MidCap")) return "MidCap";
  if (set.has("SmallCap")) return "SmallCap";
  return "Growth";
}

function buildProfilePenaltyWeights(tags, primaryCategory) {
  const buckets = [primaryCategory, ...tags].filter((tag) => PENALTY_PROFILE_WEIGHTS[tag]);
  if (!buckets.length) return { ...PROFILE_WEIGHT_DEFAULTS };
  const total = { ...PROFILE_WEIGHT_DEFAULTS };
  Object.keys(total).forEach((key) => { total[key] = 0; });
  buckets.forEach((tag) => {
    const weights = PENALTY_PROFILE_WEIGHTS[tag];
    Object.keys(total).forEach((key) => {
      total[key] += weights?.[key] ?? PROFILE_WEIGHT_DEFAULTS[key];
    });
  });
  Object.keys(total).forEach((key) => {
    total[key] = Number((total[key] / buckets.length).toFixed(2));
  });
  return total;
}

function buildScoringImpact(tags, primaryCategory) {
  const notes = [];
  const add = (text) => { if (!notes.includes(text)) notes.push(text); };
  if (tags.includes("HighMultiple") || tags.includes("StoryStock")) {
    add(currentLanguage === "zh" ? "估值惩罚权重下调，更重视成长、动量和新闻催化。" : "Valuation penalties are reduced while growth, momentum, and news matter more.");
  }
  if (tags.includes("Growth") || tags.includes("HighGrowth")) {
    add(currentLanguage === "zh" ? "成长放缓会被重点检查，收入和利润趋势权重更高。" : "Growth slowdown is watched more closely, with higher weight on revenue and EPS trends.");
  }
  if (tags.includes("MegaCap") || tags.includes("CashCow")) {
    add(currentLanguage === "zh" ? "现金流、利润率和估值纪律更重要，单日波动影响更小。" : "Cash flow, margins, and valuation discipline matter more than single-day noise.");
  }
  if (tags.includes("REIT") || tags.includes("Dividend") || tags.includes("InterestRateSensitive")) {
    add(currentLanguage === "zh" ? "债务、分红安全和利率环境权重更高。" : "Debt, dividend safety, and rates sensitivity carry more weight.");
  }
  if (tags.includes("IPO") || tags.includes("NewlyListed") || tags.includes("Speculative")) {
    add(currentLanguage === "zh" ? "历史数据不足会降低置信度，但不会因为 PE 缺失被直接重罚。" : "Limited history lowers confidence, but missing PE does not trigger a heavy penalty.");
  }
  if (tags.includes("Crypto")) {
    add(currentLanguage === "zh" ? "监管、流动性和宏观环境对评分影响更大。" : "Regulation, liquidity, and macro conditions have a larger impact.");
  }
  if (tags.includes("Cyclical") || tags.includes("Energy") || tags.includes("Semiconductor")) {
    add(currentLanguage === "zh" ? "行业周期、现金流和市场环境会更多影响评分。" : "Cycle, cash flow, and macro backdrop have a bigger influence on the model.");
  }
  if (!notes.length) {
    add(currentLanguage === "zh" ? "当前按中性权重处理，重点看技术、基本面和市场环境是否一致。" : "The model uses balanced weights and looks for agreement across technicals, fundamentals, and market context.");
  }
  return notes;
}

function buildProfileTagAudit(row, rawTags, context) {
  const sector = String(row.metadata?.sector || "").toLowerCase();
  const industry = String(row.metadata?.industry || "").toLowerCase();
  const description = String(row.metadata?.businessSummary || "").toLowerCase();
  const nameBlob = `${row.shortName || ""} ${row.longName || ""}`.toLowerCase();
  const sectorIndustryBlob = `${sector} ${industry}`;
  const coreBlob = `${sectorIndustryBlob} ${description} ${nameBlob}`;
  const rawSet = new Set(rawTags || []);
  const evidenceMap = {};
  const exposureMap = {};
  const rejected = [];
  const addEvidence = (tag, confidence, evidence, source = "core") => {
    if (!tag) return;
    evidenceMap[tag] ??= { confidence: 0, evidence: [], source_types: [] };
    evidenceMap[tag].confidence = Math.max(evidenceMap[tag].confidence, clamp(Math.round(confidence), 0, 100));
    evidenceMap[tag].evidence.push(...[].concat(evidence).filter(Boolean));
    evidenceMap[tag].source_types.push(source);
  };
  const addExposure = (tag, confidence, evidence, source = "exposure") => {
    if (!tag) return;
    exposureMap[tag] ??= { confidence: 0, evidence: [], source_types: [] };
    exposureMap[tag].confidence = Math.max(exposureMap[tag].confidence, clamp(Math.round(confidence), 0, 100));
    exposureMap[tag].evidence.push(...[].concat(evidence).filter(Boolean));
    exposureMap[tag].source_types.push(source);
  };
  const rejectTag = (tag, reason) => {
    if (!tag) return;
    rejected.push({
      tag,
      confidence: evidenceMap[tag]?.confidence ?? 0,
      reason,
      evidence: evidenceMap[tag]?.evidence || [],
    });
    delete evidenceMap[tag];
  };
  const {
    marketCap,
    revenueGrowth,
    freeCashFlow,
    operatingMargin,
    grossMargin,
    debtRatio,
    forwardPe,
    pe,
    psRatio,
    evSales,
    dividendYield,
    return30,
    return90,
    volatility30,
    relativeVolume,
    nearHigh,
    likelyIPO,
    reitLike,
  } = context;
  const country = String(row.metadata?.country || "").toLowerCase();
  const exchangeName = String(row.exchangeName || row.metadata?.exchange || "").toLowerCase();
  const quoteType = String(row.metadata?.quoteType || "").toLowerCase();
  const isUsListed = !isCnAShare(row) && /nasdaq|nyse|amex|nms|ngm|ncm|nyq|ase|nas/i.test(exchangeName);
  const directChinaCountry = /china|hong kong|prc/i.test(country);
  const caymanWithChinaBusiness = /cayman islands/i.test(country)
    && /(china-based|chinese company|people'?s republic of china|headquarter(?:ed|s)?\s+(?:in|at)\s+[^.]{0,80}(china|hong kong|shanghai|beijing|hangzhou|shenzhen|guangzhou))/i.test(description);
  const chinaIdentity = directChinaCountry || caymanWithChinaBusiness
    || /headquarter(?:ed|s)?\s+(?:in|at)\s+[^.]{0,80}(china|hong kong|shanghai|beijing|hangzhou|shenzhen|guangzhou)/i.test(description)
    || /(china-based|chinese company|people'?s republic of china)/i.test(description);
  const chinaExposure = /china|chinese|shanghai|beijing|shenzhen|hong kong/i.test(description);
  const adrIdentity = /adr|ads|american depositary/i.test(`${description} ${quoteType} ${exchangeName}`) || (isUsListed && chinaIdentity);
  const healthcareCore = /healthcare|health care|biotechnology|biotech|pharmaceutical|pharma|medical|medical device|health insurance|managed care|hospital|life sciences/i.test(sectorIndustryBlob)
    || /^(?:.*\b)(operates|provides|develops|manufactures|markets|sells|offers).{0,120}(healthcare services|medical devices|pharmaceuticals|therapeutics|clinical|hospital|health insurance|biotech|telehealth)/i.test(description);
  const healthcareExposure = !healthcareCore && /healthcare|health care|hospital|clinic|medical|life sciences/i.test(description);
  const autoCore = /auto manufacturers|automobile manufacturers|automotive|auto parts|vehicles/i.test(sectorIndustryBlob)
    || /(designs|develops|manufactures|sells|leases).{0,140}(electric vehicles|vehicles|automobiles|cars|trucks)/i.test(description);
  const evCore = autoCore && /electric vehicle|battery electric| evs\b|ev manufacturer|electric cars/i.test(description);
  const fintechCore = /financial technology|credit services|payments|capital markets|financial data|consumer finance|mortgage finance/i.test(sectorIndustryBlob)
    || /(operates|provides|offers).{0,140}(payments|payment network|digital banking|loans|lending|consumer finance|financial technology|brokerage|trading platform)/i.test(description);
  const bankingCore = /banks|banking|regional banks|diversified banks|commercial banks/i.test(sectorIndustryBlob)
    || /\bbank holding company\b|\bcommercial bank\b|\bprovides banking\b/i.test(description);
  const cryptoCore = /crypto|blockchain|digital asset/i.test(sectorIndustryBlob)
    || /(operates|provides|offers|issues).{0,140}(cryptocurrency|digital asset|blockchain|stablecoin|usd coin|usdc|crypto exchange)/i.test(description);
  const cloudCore = /software|internet content|information technology|communication services/i.test(sectorIndustryBlob)
    && /cloud platform|cloud infrastructure|cloud computing|saas|software-as-a-service|hyperscale|hyperscaler|azure|aws|google cloud/i.test(description);
  const softwareCore = /software|application software|infrastructure software|systems software|enterprise software/i.test(sectorIndustryBlob)
    || /(develops|provides|offers).{0,120}(software|software platform|enterprise platform|operating system|productivity applications)/i.test(description);
  const ecommerceCore = /internet retail|specialty retail|e-commerce|ecommerce/i.test(sectorIndustryBlob)
    || /e-commerce|ecommerce|online marketplace|online retail|marketplace|retail platform|consumer-to-manufacturer/i.test(description);

  if (Number.isFinite(marketCap)) {
    if (marketCap >= 200_000_000_000) addEvidence("MegaCap", 96, "market cap >= 200B", "market_cap");
    else if (marketCap >= 10_000_000_000) addEvidence("LargeCap", 92, "market cap 10B-200B", "market_cap");
    else if (marketCap >= 2_000_000_000) addEvidence("MidCap", 90, "market cap 2B-10B", "market_cap");
    else if (marketCap >= 300_000_000) addEvidence("SmallCap", 88, "market cap 300M-2B", "market_cap");
    else addEvidence("MicroCap", 88, "market cap < 300M", "market_cap");
  }

  if (isCnAShare(row)) {
    addEvidence("AShare", 96, "six-digit A-share ticker", "market");
    addExposure("ChinaMarket", 90, "China A-share market model", "market");
  } else if (isUsListed) {
    addExposure("USListed", 86, "US exchange listing", "market");
  }
  if (chinaIdentity && adrIdentity && !isCnAShare(row)) {
    addEvidence("ChinaADR", 88, "company identity indicates China-based ADR / ADS listing", "market");
  } else if (chinaExposure && !isCnAShare(row)) {
    addExposure("ChinaExposure", 58, "China appears as revenue, manufacturing, supply chain, or market exposure rather than company identity", "exposure");
  }

  const semiconductorCore = /semiconductor|semiconductors|chip|chips|gpu|cpu|processor|memory|dram|nand|foundry|wafer|fabless|integrated circuit|silicon|semiconductor equipment|semiconductor material/i.test(coreBlob);
  if (semiconductorCore || rawSet.has("Semiconductor")) {
    addEvidence("Semiconductor", semiconductorCore ? 94 : 65, semiconductorCore ? "sector / industry / description points to chips or semiconductors" : "weak semiconductor keyword evidence", semiconductorCore ? "core" : "weak");
  }
  if (/gpu|ai accelerator|data center|datacenter|accelerated computing|ai server|memory|dram|hbm|networking.*data center|cloud ai infrastructure|inference|training/i.test(coreBlob) && (semiconductorCore || /cloud|data center|datacenter|infrastructure/i.test(coreBlob))) {
    addEvidence("AIInfrastructure", 88, "description links products to AI compute or data-center infrastructure", "description");
  }
  if (/artificial intelligence platform|ai platform|generative ai|machine learning platform|accelerated computing|ai infrastructure|ai accelerator|gpu|copilot|large language model|llm/i.test(coreBlob)) {
    addEvidence("AI", /gpu|ai accelerator|ai infrastructure|generative ai|ai platform/i.test(coreBlob) ? 84 : 68, "core description indicates direct AI product or infrastructure exposure", "description");
  }
  if (cloudCore) {
    addEvidence("Cloud", 84, "core business includes cloud platform / SaaS / hyperscale infrastructure", "description");
  }
  if (softwareCore) {
    addEvidence("Software", 80, "sector / description indicates software business model", "core");
  }
  if (ecommerceCore) {
    addEvidence("Ecommerce", 86, "description indicates e-commerce or marketplace business", "description");
    addEvidence("Consumer", 78, "consumer-facing commerce model", "description");
  } else if (!autoCore && /retail|consumer products|consumer goods|restaurant|apparel|merchant|shopping|household|personal care/i.test(coreBlob)) {
    addEvidence("Consumer", 78, "sector / description indicates consumer exposure", "core");
  } else if (/consumer|retail|merchant|shopping/i.test(description)) {
    addExposure("ConsumerExposure", 54, "consumer terms appear as customer or market exposure rather than core consumer business", "exposure");
  }
  if (/reit|real estate investment trust|property trust/i.test(coreBlob) || reitLike) {
    addEvidence("REIT", 95, "description / industry indicates REIT", "core");
    addEvidence("RealEstate", 88, "real estate business model", "core");
    addEvidence("InterestRateSensitive", 88, "REIT business model is rate sensitive", "business_model");
  }
  if (bankingCore || fintechCore) {
    addEvidence(bankingCore ? "Banking" : "Fintech", 82, "sector / core description indicates banking / lending / fintech business", "core");
    addEvidence("InterestRateSensitive", /mortgage|lending|consumer finance|bank/i.test(`${sectorIndustryBlob} ${description}`) ? 82 : 72, "lending / banking model is rate sensitive", "business_model");
  } else if (/bank|banking|mortgage|lending|consumer finance|personal loans|financial services|payments|fintech/i.test(description)) {
    addExposure("FinancialExposure", 55, "financial keywords appear as product, customer, or market exposure rather than core business", "exposure");
  }
  if (cryptoCore) {
    addEvidence("Crypto", 90, "core description directly references crypto / blockchain / stablecoin / digital assets", "description");
    if (/stablecoin|usd coin|usdc/i.test(description)) addEvidence("Stablecoin", 88, "core description references stablecoin / USDC", "description");
    addEvidence("Fintech", 76, "crypto financial infrastructure model", "description");
    addEvidence("InterestRateSensitive", 76, "stablecoin / crypto financial model can be rate sensitive", "business_model");
  } else if (/crypto|cryptocurrency|blockchain|bitcoin|stablecoin|digital asset|digital assets|crypto exchange|usd coin|usdc/i.test(description)) {
    addExposure("Crypto", 55, "crypto appears as holding, customer, or news exposure rather than core business", "exposure");
  }
  if (autoCore) {
    addEvidence("AutoManufacturer", 88, "sector / core description indicates vehicle manufacturing", "core");
  }
  if (evCore) {
    addEvidence("EV", 90, "industry / description indicates EV or auto manufacturing", "core");
  }
  if (/oil|gas|lng|drilling|shale|energy|solar|renewable/i.test(coreBlob)) {
    addEvidence("Energy", 84, "sector / description indicates energy exposure", "core");
  }
  if (healthcareCore) {
    addEvidence("Healthcare", 86, "sector / industry or core business indicates healthcare", "core");
  } else if (healthcareExposure) {
    addExposure("HealthcareExposure", 58, "healthcare appears as customer or market exposure rather than core business", "exposure");
  }
  if (/biotech|clinical trial|fda|drug development|therapeutics/i.test(coreBlob)) {
    addEvidence("Biotech", 86, "description indicates biotech / drug development", "description");
  }
  if (/defense|aerospace|military|government contract|national security/i.test(coreBlob)) {
    addEvidence("Defense", 84, "description indicates defense / aerospace exposure", "description");
  }

  if ((freeCashFlow ?? 0) > 0 && (operatingMargin ?? 0) >= 0.15 && (grossMargin ?? 0) >= 0.35) addEvidence("CashCow", 84, "positive free cash flow and strong margins", "financial");
  if ((revenueGrowth ?? 0) >= 0.25 && (freeCashFlow ?? 0) > 0) addEvidence("HighGrowth", 80, "revenue growth >= 25% with positive cash flow", "financial");
  else if ((revenueGrowth ?? 0) >= 0.1) addEvidence("Growth", 76, "revenue growth >= 10%", "financial");
  if ((revenueGrowth ?? 0) >= 0.1 && (freeCashFlow ?? 0) > 0) addEvidence("ProfitableGrowth", 78, "growth supported by positive free cash flow", "financial");
  if (likelyIPO) addEvidence("NewlyListed", 82, "listing / trading history is short", "history");
  if (likelyIPO) addEvidence("IPO", 72, "recent IPO / limited public history", "history");
  if ((freeCashFlow ?? 0) < 0) addEvidence("CashBurn", 78, "free cash flow is negative", "financial");
  if ((volatility30 ?? 0) >= 55) addEvidence("HighVolatility", 78, "30D annualized volatility is elevated", "technical");
  if ((debtRatio ?? 0) > 0.7) addEvidence("HighDebtRisk", 82, "debt ratio is elevated", "financial");
  if ((dividendYield ?? 0) >= 0.03) addEvidence("Dividend", 80, "dividend yield >= 3%", "financial");
  if (rawSet.has("Speculative") && (evidenceMap.MicroCap || evidenceMap.SmallCap || evidenceMap.CashBurn || evidenceMap.HighVolatility)) addEvidence("Speculative", 78, "small / volatile / cash-burning profile", "combined");
  if (!likelyIPO && ((forwardPe ?? -1) > 50 || (pe ?? -1) > 60 || (psRatio ?? -1) > 10 || (evSales ?? -1) > 10)) addEvidence("HighMultiple", 78, "valuation multiples exceed high-multiple thresholds", "valuation");
  if ((return30 ?? 0) > 20 || (return90 ?? 0) > 35 || (nearHigh && (relativeVolume ?? 1) >= 1.15)) addEvidence("Momentum", 78, "30D / 90D return or near-high volume confirms momentum", "technical");
  if (semiconductorCore || /memory|industrial|materials|auto|travel|commodity/i.test(coreBlob)) addEvidence("Cyclical", semiconductorCore ? 76 : 68, "business has cyclical exposure", "core");

  if ((rawSet.has("ChinaADR") || chinaExposure) && !evidenceMap.ChinaADR && !isCnAShare(row)) {
    rejectTag("ChinaADR", "China appears as sales, manufacturing, supply-chain, or market exposure, not China ADR company identity.");
  }
  if ((rawSet.has("Healthcare") || healthcareExposure) && !healthcareCore) {
    rejectTag("Healthcare", "Healthcare appears as customer / market exposure, not core healthcare business.");
  }
  if ((rawSet.has("Fintech") || /payments|financial services|banking customers|finance customers/i.test(description)) && !fintechCore && !bankingCore) {
    rejectTag("Fintech", "Financial keywords appear as customer / product exposure, not core fintech business.");
  }
  if ((rawSet.has("Crypto") || /crypto|bitcoin|blockchain|stablecoin/i.test(description)) && !cryptoCore) {
    rejectTag("Crypto", "Crypto appears as holding, news, customer, or market exposure, not core crypto business.");
  }
  if ((rawSet.has("EV") || /electric vehicle|ev demand|ev customer|tesla/i.test(description)) && !evCore) {
    rejectTag("EV", "EV evidence is customer, demand, or supply-chain exposure, not core EV manufacturing.");
  }
  if ((rawSet.has("Banking") || /banking customer|banking product|financial customer/i.test(description)) && !bankingCore) {
    rejectTag("Banking", "Banking appears as customer / product exposure, not core banking business.");
  }

  if (evidenceMap.EV && !evCore) {
    rejectTag("EV", "EV evidence is not tied to core auto / EV business.");
  }
  if (evidenceMap.Crypto && !cryptoCore) {
    rejectTag("Crypto", "Crypto evidence is not tied to core business.");
  }
  if (evidenceMap.AI && evidenceMap.AI.confidence < 75) rejectTag("AI", "AI evidence is too generic.");
  if (evidenceMap.Cloud && !cloudCore) rejectTag("Cloud", "Cloud evidence is not tied to core business.");
  if (evidenceMap.ChinaADR && !chinaIdentity) rejectTag("ChinaADR", "China reference is exposure-only and does not establish China ADR identity.");
  if (evidenceMap.Healthcare && !healthcareCore) rejectTag("Healthcare", "Healthcare reference is exposure-only and does not establish healthcare as core business.");
  if (evidenceMap.REIT) {
    ["Growth", "HighGrowth", "Momentum"].forEach((tag) => {
      if (evidenceMap[tag] && evidenceMap[tag].confidence < 86) rejectTag(tag, "REIT profile takes priority over generic growth / momentum tag.");
    });
  }
  if (evidenceMap.MegaCap && evidenceMap.CashCow && evidenceMap.Speculative) rejectTag("Speculative", "Mega-cap cash-cow profile conflicts with speculative tag.");
  if (evidenceMap.NewlyListed && evidenceMap.HighMultiple && evidenceMap.HighMultiple.confidence < 85) rejectTag("HighMultiple", "Newly listed / limited data; valuation tag confidence is not high enough.");
  if (evidenceMap.Semiconductor && evidenceMap.EV && evidenceMap.EV.confidence < 92) rejectTag("EV", "Semiconductor core business is stronger than weak EV evidence.");

  Object.entries(evidenceMap).forEach(([tag, payload]) => {
    payload.evidence = [...new Set(payload.evidence)].slice(0, 4);
    payload.source_types = [...new Set(payload.source_types)];
    if (payload.source_types.length === 1 && payload.source_types[0] === "weak") payload.confidence = Math.min(payload.confidence, 60);
  });
  Object.entries(exposureMap).forEach(([, payload]) => {
    payload.evidence = [...new Set(payload.evidence)].slice(0, 4);
    payload.source_types = [...new Set(payload.source_types)];
    payload.confidence = clamp(Math.min(payload.confidence, 74), 40, 74);
  });
  Object.keys(evidenceMap).forEach((tag) => {
    if ((evidenceMap[tag]?.confidence ?? 0) < 60) rejectTag(tag, "confidence below display threshold");
  });

  const fullTags = Object.keys(evidenceMap).filter((tag) => evidenceMap[tag].confidence >= 60);
  const groupOrder = {
    size: ["MegaCap", "LargeCap", "MidCap", "SmallCap", "MicroCap"],
    core: ["Software", "Cloud", "Semiconductor", "AIInfrastructure", "EV", "AutoManufacturer", "Ecommerce", "Consumer", "REIT", "Banking", "Fintech", "Energy", "Healthcare", "Biotech", "Crypto", "Industrial", "Defense", "RealEstate", "AI"],
    quality: ["CashCow", "ProfitableGrowth", "HighGrowth", "Growth", "Dividend", "Turnaround", "Speculative"],
    risk: ["HighMultiple", "ExtremeValuation", "HighVolatility", "HighDebtRisk", "CashBurn", "NewlyListed"],
    cycle: ["Cyclical", "InterestRateSensitive"],
    geography: ["ChinaADR", "AShare"],
  };
  const priority = (tag) => {
    const entries = Object.entries(groupOrder);
    for (let groupIndex = 0; groupIndex < entries.length; groupIndex += 1) {
      const index = entries[groupIndex][1].indexOf(tag);
      if (index >= 0) return 100 - groupIndex * 15 - index * 0.25;
    }
    return 1;
  };
  const pickFromGroup = (selected, groupName, maxCount = 1) => {
    const candidates = groupOrder[groupName]
      .filter((tag) => fullTags.includes(tag) && (evidenceMap[tag]?.confidence ?? 0) >= 75 && !selected.includes(tag))
      .sort((a, b) => (evidenceMap[b].confidence - evidenceMap[a].confidence) || priority(b) - priority(a));
    candidates.slice(0, maxCount).forEach((tag) => {
      if (selected.length < 6) selected.push(tag);
    });
  };
  const topTags = [];
  pickFromGroup(topTags, "size", 1);
  pickFromGroup(topTags, "geography", 1);
  pickFromGroup(topTags, "core", 3);
  pickFromGroup(topTags, "quality", 2);
  pickFromGroup(topTags, "risk", 1);
  pickFromGroup(topTags, "cycle", 1);
  fullTags
    .filter((tag) => (evidenceMap[tag]?.confidence ?? 0) >= 75 && !topTags.includes(tag))
    .sort((a, b) => priority(b) - priority(a) || evidenceMap[b].confidence - evidenceMap[a].confidence)
    .forEach((tag) => {
      if (topTags.length < 6) topTags.push(tag);
    });
  if (topTags.length > 6) topTags.length = 6;
  return {
    top_tags: topTags,
    full_tags: fullTags.sort((a, b) => priority(b) - priority(a) || evidenceMap[b].confidence - evidenceMap[a].confidence),
    exposure_tags: Object.keys(exposureMap).filter((tag) => exposureMap[tag].confidence >= 40)
      .sort((a, b) => exposureMap[b].confidence - exposureMap[a].confidence),
    rejected_tags: rejected,
    tag_evidence: evidenceMap,
    exposure_evidence: exposureMap,
  };
}

function buildCompanyProfile(row, research) {
  const metrics = research.metrics || {};
  const closes = row.technicals?.history?.closes || [];
  const textBlob = companyProfileTextBlob(row);
  const sectorBlob = companyProfileSectorBlob(row);
  const businessSummary = String(row.metadata?.businessSummary || "").toLowerCase();
  const marketCap = row.marketCap ?? null;
  const beta = row.metadata?.beta ?? null;
  const revenueGrowth = metrics.revenueGrowth ?? null;
  const epsGrowth = metrics.epsGrowth ?? null;
  const fcfGrowth = metrics.fcfGrowth ?? null;
  const freeCashFlow = metrics.freeCashFlow ?? row.metadata?.freeCashflow ?? null;
  const netIncomeProxy = Number.isFinite(metrics.epsGrowth) ? metrics.epsGrowth : null;
  const operatingMargin = metrics.operatingMargin ?? row.metadata?.operatingMargins ?? null;
  const grossMargin = metrics.grossMargin ?? row.metadata?.grossMargins ?? null;
  const roe = metrics.roe ?? row.metadata?.returnOnEquity ?? null;
  const debtRatio = metrics.debtRatio ?? (Number.isFinite(row.metadata?.debtToEquity) ? row.metadata.debtToEquity / 100 : null);
  const cashRatio = metrics.cashReserve ?? row.metadata?.currentRatio ?? null;
  const pe = metrics.pe ?? row.trailingPE ?? null;
  const forwardPe = metrics.forwardPe ?? row.forwardPE ?? null;
  const peg = metrics.peg ?? null;
  const psRatio = metrics.psRatio ?? row.metadata?.priceToSalesTrailing12Months ?? null;
  const evEbitda = metrics.evEbitda ?? row.metadata?.enterpriseToEbitda ?? null;
  const evSales = row.metadata?.enterpriseToRevenue ?? null;
  const dividendYield = row.metadata?.dividendYield ?? null;
  const payoutRatio = row.metadata?.payoutRatio ?? null;
  const ipoAgeYears = yearsSinceIsoDate(row.metadata?.ipoDate);
  const return30 = computeReturnPct(closes, 30);
  const return90 = computeReturnPct(closes, 90);
  const volatility30 = computeAnnualizedVolatility(closes, 30);
  const volatility90 = computeAnnualizedVolatility(closes, 90);
  const currentPrice = row.price ?? null;
  const high52 = row.technicals?.rangeHigh ?? null;
  const low52 = row.technicals?.rangeLow ?? null;
  const nearHigh = Number.isFinite(currentPrice) && Number.isFinite(high52) && high52 > 0 ? currentPrice >= high52 * 0.9 : false;
  const nearLow = Number.isFinite(currentPrice) && Number.isFinite(low52) && low52 > 0 ? currentPrice <= low52 * 1.15 : false;
  const relativeVolume = row.technicals?.volumeRatio ?? null;
  const tagSet = new Set();
  const reasons = [];
  const missing = [];
  const reitLike = /reit|real estate investment trust|地产信托|property trust|healthcare real estate|medical office|skilled nursing/i.test(textBlob);
  const healthcareSectorMatch = /healthcare|medical|hospital|pharma|pharmaceutical|biotech|life sciences/i.test(sectorBlob);
  const rateSensitiveKeywordCount = countRegexMatches(
    `${sectorBlob} ${businessSummary}`,
    /\breit\b|\bdividend\b|\bmortgage\b|\bbank(?:ing)?\b|\bfintech\b|\bpayments\b|\butility\b|\btreasury\b|\brate-sensitive\b|\bstablecoin\b|\bcrypto\b|\bconsumer finance\b|\bpersonal loans\b/gi,
  );
  const healthcareOperatorKeywordCount = countRegexMatches(
    businessSummary,
    /\bhospital\b|\btelehealth\b|\bpharma(?:ceutical)?\b|\bbiotech\b|\bmedical device\b|\bclinical\b|\bdrug\b/gi,
  );
  const evKeywordCount = countRegexMatches(
    textBlob,
    /\belectric vehicle(?:s)?\b|\bev manufacturer\b|\bev maker\b|\bbattery electric vehicle\b|\bvehicle deliveries\b|\bautomaker\b|\bauto manufacturing\b|\bvehicle manufacturing\b/gi,
  );
  const evIndustryKeywordCount = countRegexMatches(
    `${sectorBlob} ${businessSummary}`,
    /\bauto(?:mobile)?\b|\bautomotive\b|\bcar maker\b|\bvehicle manufacturer\b|\bev manufacturer\b|\bev maker\b|\bvehicle manufacturing\b|\bauto manufacturing\b/gi,
  );
  const storyThemeKeywordCount = countRegexMatches(
    textBlob,
    /\bartificial intelligence\b|\bgenerative ai\b|\bcrypto\b|\bstablecoin\b|\bspace\b|\bquantum\b|\brobot(?:ics)?\b|\bautonomous\b|\belectric vehicle\b|\bev platform\b/gi,
  );

  if (!Number.isFinite(marketCap)) missing.push("market_cap");
  if (!Number.isFinite(revenueGrowth) && !Number.isFinite(epsGrowth) && !Number.isFinite(fcfGrowth)) missing.push("growth_metrics");
  if (!Number.isFinite(pe) && !Number.isFinite(forwardPe) && !Number.isFinite(psRatio)) missing.push("valuation_metrics");
  if (!textBlob) missing.push("company_metadata");

  if (isCnAShare(row)) {
    pushProfileTag(tagSet, reasons, "AShare", currentLanguage === "zh" ? "6 位数字代码识别为 A股。" : "Six-digit numeric ticker is classified as an A-share.");
    pushProfileTag(tagSet, reasons, "ChinaMarket", currentLanguage === "zh" ? "该股票使用中国 A股市场模型。" : "This stock uses the China A-share model.");
  }

  if (Number.isFinite(marketCap)) {
    if (marketCap >= 200_000_000_000) pushProfileTag(tagSet, reasons, "MegaCap", currentLanguage === "zh" ? "市值大于等于 200B" : "Market cap is above $200B");
    else if (marketCap >= 10_000_000_000) pushProfileTag(tagSet, reasons, "LargeCap", currentLanguage === "zh" ? "市值位于 10B-200B" : "Market cap sits between $10B and $200B");
    else if (marketCap >= 2_000_000_000) pushProfileTag(tagSet, reasons, "MidCap", currentLanguage === "zh" ? "市值位于 2B-10B" : "Market cap sits between $2B and $10B");
    else if (marketCap >= 300_000_000) pushProfileTag(tagSet, reasons, "SmallCap", currentLanguage === "zh" ? "市值位于 300M-2B" : "Market cap sits between $300M and $2B");
    else pushProfileTag(tagSet, reasons, "MicroCap", currentLanguage === "zh" ? "市值低于 300M" : "Market cap is below $300M");
  }

  if (Number.isFinite(revenueGrowth) || Number.isFinite(epsGrowth) || Number.isFinite(fcfGrowth)) {
    if ((revenueGrowth ?? -1) >= 0.25 || (epsGrowth ?? -1) >= 0.25 || (fcfGrowth ?? -1) >= 0.25) {
      pushProfileTag(tagSet, reasons, "HighGrowth", currentLanguage === "zh" ? "增长指标大于等于 25%" : "Growth metrics are running above 25%");
    } else if ((revenueGrowth ?? -1) >= 0.1) {
      pushProfileTag(tagSet, reasons, "Growth", currentLanguage === "zh" ? "营收增长大于等于 10%" : "Revenue growth is above 10%");
    } else if ((revenueGrowth ?? -1) >= 0) {
      pushProfileTag(tagSet, reasons, "Mature", currentLanguage === "zh" ? "营收增长处于成熟区间" : "Revenue growth is in a mature range");
    } else {
      pushProfileTag(tagSet, reasons, "Declining", currentLanguage === "zh" ? "营收增长为负" : "Revenue growth is negative");
    }
  }

  const hasPositiveIncomeProxy = (netIncomeProxy ?? -1) > 0;
  if ((freeCashFlow ?? 0) > 0 && (operatingMargin ?? 0) >= 0.15 && (grossMargin ?? 0) >= 0.35 && (revenueGrowth ?? 0) >= 0) {
    pushProfileTag(tagSet, reasons, "CashCow", currentLanguage === "zh" ? "自由现金流和利润率较强" : "Free cash flow and margins are strong");
  }
  if ((revenueGrowth ?? 0) >= 0.1 && hasPositiveIncomeProxy && (freeCashFlow ?? 0) > 0) {
    pushProfileTag(tagSet, reasons, "ProfitableGrowth", currentLanguage === "zh" ? "成长和盈利兼具" : "Growth is supported by profits and free cash flow");
  }
  if ((revenueGrowth ?? 0) >= 0.15 && (!hasPositiveIncomeProxy || (freeCashFlow ?? 0) <= 0)) {
    pushProfileTag(tagSet, reasons, "UnprofitableGrowth", currentLanguage === "zh" ? "增长较快但盈利质量还不稳" : "Growth is fast but earnings quality is still unstable");
  }
  if ((freeCashFlow ?? 0) < 0 && !hasPositiveIncomeProxy) {
    pushProfileTag(tagSet, reasons, "CashBurn", currentLanguage === "zh" ? "自由现金流和盈利都偏弱" : "Free cash flow and earnings both look weak");
  }

  const likelyIPO = (ipoAgeYears != null && ipoAgeYears <= 3) || closes.length < 180;
  if (likelyIPO) {
    pushProfileTag(tagSet, reasons, "IPO", currentLanguage === "zh" ? "上市时间较短或历史数据不足 3 年" : "Listing history is shorter than roughly three years");
    pushProfileTag(tagSet, reasons, "NewlyListed", currentLanguage === "zh" ? "财务历史仍然较短" : "Financial history is still relatively short");
  }

  const speculativeBase = (
    (tagSet.has("SmallCap") || tagSet.has("MicroCap"))
    && ((freeCashFlow ?? 0) <= 0 || !hasPositiveIncomeProxy)
    && ((volatility30 ?? 0) >= 45 || (beta ?? 0) >= 1.5 || likelyIPO)
  );
  if (speculativeBase) {
    pushProfileTag(tagSet, reasons, "Speculative", currentLanguage === "zh" ? "小盘、高波动、盈利和现金流稳定性不足" : "Small cap, high volatility, and weaker cash-flow visibility make it speculative");
  }

  const valuationExempt = reitLike || tagSet.has("IPO") || tagSet.has("NewlyListed") || tagSet.has("Speculative") || tagSet.has("UnprofitableGrowth");
  if (!valuationExempt) {
    if ((forwardPe ?? -1) > 100 || (pe ?? -1) > 150 || (psRatio ?? -1) > 25 || (evSales ?? -1) > 25) {
      pushProfileTag(tagSet, reasons, "ExtremeValuation", currentLanguage === "zh" ? "估值倍数处于极高区间" : "Valuation multiples are in an extreme range");
    } else if ((forwardPe ?? -1) > 50 || (pe ?? -1) > 60 || (psRatio ?? -1) > 10 || (evSales ?? -1) > 10) {
      pushProfileTag(tagSet, reasons, "HighMultiple", currentLanguage === "zh" ? "远期 PE / PS 处于高倍数区间" : "Forward PE / PS sits in a high-multiple range");
    } else if (((forwardPe ?? -1) > 0 && (forwardPe ?? 0) < 20) || ((pe ?? -1) > 0 && (pe ?? 0) < 20)) {
      pushProfileTag(tagSet, reasons, "Value", currentLanguage === "zh" ? "传统估值处于偏低区间" : "Traditional valuation multiples look relatively low");
    } else if (((forwardPe ?? -1) >= 20 && (forwardPe ?? 0) <= 40) || ((peg ?? -1) >= 0.8 && (peg ?? 0) <= 2)) {
      pushProfileTag(tagSet, reasons, "ReasonableValuation", currentLanguage === "zh" ? "估值相对合理" : "Valuation looks broadly reasonable");
    }
  }

  if (reitLike) {
    pushProfileTag(tagSet, reasons, "REIT", currentLanguage === "zh" ? "公司描述包含 REIT / 地产信托特征" : "Business description matches REIT characteristics");
  }
  if ((dividendYield ?? 0) >= 0.03) pushProfileTag(tagSet, reasons, "Dividend", currentLanguage === "zh" ? "股息率大于等于 3%" : "Dividend yield is above 3%");
  if (tagSet.has("REIT") || tagSet.has("Dividend") || rateSensitiveKeywordCount >= 1) {
    pushProfileTag(tagSet, reasons, "InterestRateSensitive", currentLanguage === "zh" ? "对利率环境更敏感" : "The business is more sensitive to interest-rate conditions");
  }

  if ((return30 ?? 0) > 20 || (relativeVolume ?? 0) > 1.5 || (beta ?? 0) > 1.5 || nearHigh) {
    pushProfileTag(tagSet, reasons, "Momentum", currentLanguage === "zh" ? "近期动量、量能或 Beta 偏高" : "Recent momentum, volume, or beta points to a momentum profile");
  }
  if ((tagSet.has("HighMultiple") || tagSet.has("ExtremeValuation")) && (storyThemeKeywordCount >= 1 || tagSet.has("Momentum"))) {
    pushProfileTag(tagSet, reasons, "StoryStock", currentLanguage === "zh" ? "估值更多依赖未来叙事和情绪催化" : "Valuation depends heavily on future narrative and sentiment catalysts");
  }
  if (nearLow && (revenueGrowth ?? 0) >= 0 && (operatingMargin ?? 0) >= 0.05 && (fcfGrowth ?? 0) > -0.05) {
    pushProfileTag(tagSet, reasons, "Turnaround", currentLanguage === "zh" ? "价格偏离高点较多，但经营数据有企稳迹象" : "Price is far below prior highs while operating metrics are stabilizing");
  }

  if (/artificial intelligence|machine learning|generative ai|data platform|copilot|\bai\b/i.test(textBlob)) pushProfileTag(tagSet, reasons, "AI", currentLanguage === "zh" ? "公司描述或主题包含 AI" : "Company description or theme includes AI");
  if (/semiconductor|chip|gpu|memory|foundry|wafer|fab/i.test(textBlob)) pushProfileTag(tagSet, reasons, "Semiconductor", currentLanguage === "zh" ? "公司属于半导体 / 芯片链条" : "Business exposure points to semiconductors");
  if (/\bcloud\b|\bsaas\b|\bazure\b|\baws\b|\bgcp\b|\bcloud platform\b|\bcloud computing\b/i.test(textBlob)) pushProfileTag(tagSet, reasons, "Cloud", currentLanguage === "zh" ? "公司描述包含云 / SaaS 业务" : "Cloud / SaaS keywords are present");
  if (/advertising|ads|search/i.test(textBlob)) pushProfileTag(tagSet, reasons, "Advertising", currentLanguage === "zh" ? "业务与广告相关" : "Advertising-related business exposure is visible");
  if (/crypto|blockchain|bitcoin|stablecoin|digital asset|exchange/i.test(textBlob)) pushProfileTag(tagSet, reasons, "Crypto", currentLanguage === "zh" ? "业务与加密 / 稳定币相关" : "Business is tied to crypto / stablecoin themes");
  if (/stablecoin/i.test(textBlob)) pushProfileTag(tagSet, reasons, "Stablecoin", currentLanguage === "zh" ? "业务与稳定币相关" : "Business is tied to stablecoins");
  if (/oil|gas|lng|drilling|shale|energy/i.test(textBlob)) pushProfileTag(tagSet, reasons, "Energy", currentLanguage === "zh" ? "业务与能源周期相关" : "Business is tied to the energy cycle");
  if (!reitLike && (healthcareSectorMatch || healthcareOperatorKeywordCount >= 2)) {
    pushProfileTag(tagSet, reasons, "Healthcare", currentLanguage === "zh" ? "行业或主营业务与医疗健康相关" : "Sector or core business points to healthcare");
  }
  if (/biotech|clinical trial|fda|drug/i.test(textBlob)) pushProfileTag(tagSet, reasons, "Biotech", currentLanguage === "zh" ? "业务与生物科技 / 药物研发相关" : "Business belongs to biotech / drug development");
  if (/digital banking|lending|payments|fintech|personal finance/i.test(textBlob)) pushProfileTag(tagSet, reasons, "Fintech", currentLanguage === "zh" ? "业务与金融科技相关" : "Business belongs to fintech");
  if (/defense|aerospace|military|government contract|national security/i.test(textBlob)) pushProfileTag(tagSet, reasons, "Defense", currentLanguage === "zh" ? "业务与国防 / 政府合同相关" : "Business exposure points to defense / government contracts");
  if (/retail|e-commerce|consumer|restaurant|apparel/i.test(textBlob)) pushProfileTag(tagSet, reasons, "Consumer", currentLanguage === "zh" ? "业务与消费相关" : "Business belongs to consumer sectors");
  if (tagSet.has("Semiconductor") || tagSet.has("Energy") || /\bauto\b|\btravel\b|\bindustrial\b|\bmaterials\b|\bmemory\b/i.test(textBlob)) pushProfileTag(tagSet, reasons, "Cyclical", currentLanguage === "zh" ? "业务带有明显周期属性" : "Business has cyclical characteristics");
  if (evKeywordCount >= 2 || (evKeywordCount >= 1 && evIndustryKeywordCount >= 1)) {
    pushProfileTag(tagSet, reasons, "EV", currentLanguage === "zh" ? "主营描述明确指向电动车 / 汽车制造。" : "Core business text clearly points to EV or auto manufacturing.");
  }

  const rawTags = Array.from(tagSet);
  const tagAudit = buildProfileTagAudit(row, rawTags, {
    marketCap,
    revenueGrowth,
    freeCashFlow,
    operatingMargin,
    grossMargin,
    debtRatio,
    forwardPe,
    pe,
    psRatio,
    evSales,
    dividendYield,
    return30,
    return90,
    volatility30,
    relativeVolume,
    nearHigh,
    likelyIPO,
    reitLike,
  });
  const tags = tagAudit.full_tags.length ? tagAudit.full_tags : rawTags.slice(0, 5);
  const primaryCategory = selectPrimaryCategory(tagAudit.top_tags.length ? tagAudit.top_tags : tags);
  const avgTagConfidence = mean((tagAudit.top_tags.length ? tagAudit.top_tags : tags).map((tag) => tagAudit.tag_evidence[tag]?.confidence).filter(Number.isFinite)) ?? 55;
  const classificationConfidence = clamp(Math.round(avgTagConfidence - (missing.length * 3)), 35, 96);
  const penaltyWeights = buildProfilePenaltyWeights(tags, primaryCategory);
  const scoringImpact = buildScoringImpact(tags, primaryCategory);
  const classificationReasons = tagAudit.top_tags
    .flatMap((tag) => (tagAudit.tag_evidence[tag]?.evidence || []).map((item) => `${localizedProfileTag(tag)}: ${localizedProfileEvidence(tag, item)}`))
    .slice(0, 5);

  return {
    primary_category: primaryCategory,
    primary_category_label: localizedProfileTag(primaryCategory),
    category_key: classificationBucketKey(primaryCategory, tags),
    category: localizedProfileTag(primaryCategory),
    tags,
    tags_label: (tagAudit.top_tags.length ? tagAudit.top_tags : tags).slice(0, 6).map(localizedProfileTag),
    top_tags: tagAudit.top_tags,
    top_tags_label: tagAudit.top_tags.map(localizedProfileTag),
    full_tags: tagAudit.full_tags,
    full_tags_label: tagAudit.full_tags.map(localizedProfileTag),
    exposure_tags: tagAudit.exposure_tags,
    exposure_tags_label: tagAudit.exposure_tags.map(localizedProfileTag),
    rejected_tags: tagAudit.rejected_tags,
    tag_evidence: tagAudit.tag_evidence,
    exposure_evidence: tagAudit.exposure_evidence,
    classification_confidence: classificationConfidence,
    classification_reasons: [...new Set(classificationReasons.length ? classificationReasons : reasons)].slice(0, 5),
    missing_classification_data: missing,
    penalty_profile_weights: penaltyWeights,
    scoring_impact: scoringImpact,
  };
}

function levelSourceLabel(item) {
  if (!item) return "";
  if (item.source === "ma") return item.label;
  if (item.source === "fib") return item.label;
  if (item.source === "bollinger") return item.label;
  if (item.source === "options") return item.label;
  if (item.source === "volume") return currentLanguage === "zh" ? "成交量密集区" : "Volume cluster";
  if (item.source === "historical") return item.label;
  if (item.source === "atr") return "ATR";
  return item.label || item.source || "";
}

function ratingRank(rating) {
  const map = {
    Short: 0,
    "Strong Sell": 1,
    Sell: 2,
    Hold: 3,
    Buy: 4,
    "Strong Buy": 5,
  };
  return map[rating] ?? 3;
}

function ratingAtLeast(rating, target) {
  return ratingRank(rating) >= ratingRank(target);
}

function zoneDistancePct(price, low, high) {
  if (!Number.isFinite(price) || !Number.isFinite(low) || !Number.isFinite(high)) return null;
  if (price >= low && price <= high) return 0;
  const boundary = price < low ? low : high;
  return Math.abs((price - boundary) / Math.max(price, 1)) * 100;
}

function isPriceInsideIdealBuyZone(price, zone) {
  return Number.isFinite(price) && Number.isFinite(zone?.low) && Number.isFinite(zone?.high) && price >= zone.low && price <= zone.high;
}

function isPriceNearIdealBuyZone(price, zone, thresholdPct = 2) {
  const distance = zoneDistancePct(price, zone?.low, zone?.high);
  return distance != null && distance <= thresholdPct;
}

function marketStateFromScores(shortScore, midScore, longScore, technicalState) {
  const blended = mean([shortScore, midScore, longScore]) ?? 50;
  if (blended >= 82 || technicalState === "Strong Bullish") return "Strong Bullish";
  if (blended >= 68) return "Bullish";
  if (blended >= 55) return "Neutral";
  if (blended >= 40) return "Bearish";
  return "Strong Bearish";
}

function supportResistanceSourceQuality(label = "") {
  const normalized = String(label).toLowerCase();
  if (normalized.includes("ma200")) return 2;
  if (normalized.includes("ma20") || normalized.includes("ma50") || normalized.includes("ma100")) return 1;
  if (normalized.includes("fib 38.2") || normalized.includes("fib 50") || normalized.includes("fib 61.8")) return 2;
  if (normalized.includes("fib")) return 1;
  if (normalized.includes("previous high") || normalized.includes("previous low")) return 1;
  if (normalized.includes("swing high") || normalized.includes("swing low")) return 1;
  if (normalized.includes("成交量密集区") || normalized.includes("volume cluster")) return 2;
  if (normalized.includes("put wall") || normalized.includes("call wall")) return 2;
  if (normalized.includes("gamma flip")) return 2;
  if (normalized.includes("upper band") || normalized.includes("lower band") || normalized.includes("middle band") || normalized.includes("布林")) return 1;
  if (normalized.includes("atr")) return 1;
  return 1;
}

function supportResistanceStrengthBand(points) {
  if (points >= 6) return "strong";
  if (points >= 3) return "medium";
  return "weak";
}

function computeLevelStrength(item, currentPrice) {
  const sources = [...new Set((item.sources || []).filter(Boolean))];
  let points = 0;

  if (sources.length >= 3) points += 3;
  else if (sources.length === 2) points += 2;
  else if (sources.length === 1) points += 1;

  points += sources.reduce((sum, source) => sum + supportResistanceSourceQuality(source), 0);

  const distancePct = Number.isFinite(currentPrice) && Number.isFinite(item.price)
    ? Math.abs((item.price - currentPrice) / Math.max(currentPrice, 1)) * 100
    : null;
  if (distancePct != null && distancePct <= 3) points += 2;
  else if (distancePct != null && distancePct <= 7) points += 1;

  const rawItems = item.raw_items || [];
  if (rawItems.length >= 2) points += 2;
  else if (rawItems.length === 1) points += 1;

  const hasVolumeCluster = sources.some((source) => /volume cluster|成交量密集区/i.test(source))
    || rawItems.some((raw) => raw?.source === "volume");
  if (hasVolumeCluster) points += 2;

  const strength = supportResistanceStrengthBand(points);
  const score = clamp(Math.round(18 + points * 11), 0, 100);
  return {
    points,
    score,
    strength,
    distance_pct: distancePct,
    has_volume_cluster: hasVolumeCluster,
    test_count: rawItems.length,
  };
}

function applyVolumeConfirmationToLevelStrength(strengthInfo, item, currentPrice, side, row) {
  const tech = row.technicals || {};
  const distancePct = Number.isFinite(currentPrice) && Number.isFinite(item.price)
    ? Math.abs((item.price - currentPrice) / Math.max(currentPrice, 1)) * 100
    : null;
  if (distancePct == null || distancePct > 3.5) return strengthInfo;

  let points = strengthInfo.points;
  const notes = [];
  const volumeRatio = tech.volumeRatio ?? 1;
  const closePosition = tech.closePosition ?? 0.5;
  const obv20 = obvTrend(tech.history?.closes || [], tech.history?.volumes || [], 20);
  const changePct = row.changePercent ?? 0;

  if (side === "support") {
    if (changePct > 0.4 && volumeRatio >= 1.2) {
      points += 2;
      notes.push(currentLanguage === "zh" ? "支撑附近放量反弹" : "volume-backed rebound near support");
    }
    if (["rising", "neutral"].includes(obv20)) {
      points += 1;
      notes.push(currentLanguage === "zh" ? "OBV 稳定或上升" : "OBV stable or rising");
    }
    if (volumeRatio >= 1.2 && closePosition >= 0.6) {
      points += 1;
      notes.push(currentLanguage === "zh" ? "高换手/放量且收盘偏强" : "active participation with a strong close");
    }
    if (changePct < -0.8 && volumeRatio >= 1.2 && closePosition <= 0.4) {
      points -= 2;
      notes.push(currentLanguage === "zh" ? "放量跌破风险" : "volume-backed support-break risk");
    }
    if (closePosition <= 0.35) {
      points -= 1;
      notes.push(currentLanguage === "zh" ? "支撑附近收盘偏弱" : "weak close near support");
    }
  } else if (side === "resistance") {
    if (changePct > 0.5 && volumeRatio >= 1.2 && closePosition < 0.55) {
      points += 2;
      notes.push(currentLanguage === "zh" ? "压力附近放量冲高回落" : "volume-backed fade near resistance");
    }
    if (volumeRatio >= 1.4 && obv20 !== "rising") {
      points += 2;
      notes.push(currentLanguage === "zh" ? "高量但 OBV 未确认" : "high volume without OBV confirmation");
    }
    if ((item.raw_items || []).length >= 2) {
      points += 2;
      notes.push(currentLanguage === "zh" ? "多次突破失败" : "multiple failed tests");
    }
    if (currentPrice > item.price * 1.005 && volumeRatio < 1.2) {
      points += 1;
      notes.push(currentLanguage === "zh" ? "突破量能不足" : "weak breakout volume");
    }
  }

  const adjustedPoints = Math.max(0, points);
  return {
    ...strengthInfo,
    points: adjustedPoints,
    score: clamp(Math.round(18 + adjustedPoints * 11), 0, 100),
    strength: supportResistanceStrengthBand(adjustedPoints),
    volume_notes: notes,
  };
}

function dedupeLevels(items, side, price) {
  const tolerance = Math.max((price || 1) * 0.0075, 0.01);
  const output = [];
  items.forEach((item) => {
    if (!Number.isFinite(item.price)) return;
    const exists = output.some((entry) => Math.abs(entry.price - item.price) <= tolerance);
    if (!exists) output.push(item);
  });
  return output.sort((a, b) => (side === "support" ? b.price - a.price : a.price - b.price));
}

function classifyLevelSide(levelPrice, currentPrice) {
  if (!Number.isFinite(levelPrice) || !Number.isFinite(currentPrice) || currentPrice <= 0) return null;
  if (levelPrice < currentPrice * 0.995) return "support";
  if (levelPrice > currentPrice * 1.005) return "resistance";
  return "pivot";
}

function buildSupportResistanceSchema(row) {
  const tech = row.technicals || {};
  const sr = tech.srAnalysis || {};
  const price = row.price ?? 0;
  const options = row.research?.optionsRead || buildOptionsRead(row);
  const fibs = [0.236, 0.382, 0.5, 0.618, 0.786]
    .map((ratio) => tech.rangeLow != null && tech.rangeHigh != null ? tech.rangeLow + (tech.rangeHigh - tech.rangeLow) * ratio : null)
    .filter(Number.isFinite);
  const extras = [
    { side: "support", price: tech.ma20, score: 54, sources: ["MA20"], explanation: currentLanguage === "zh" ? "价格接近 MA20 支撑。" : "Price is near MA20 support." },
    { side: "support", price: tech.ma50, score: 62, sources: ["MA50"], explanation: currentLanguage === "zh" ? "价格接近 MA50 支撑。" : "Price is near MA50 support." },
    { side: "support", price: tech.ma200, score: 72, sources: ["MA200"], explanation: currentLanguage === "zh" ? "价格接近 MA200 长期支撑。" : "Price is near MA200 long-term support." },
    { side: "support", price: tech.lowerBand, score: 42, sources: [currentLanguage === "zh" ? "布林下轨" : "Lower Band"], explanation: currentLanguage === "zh" ? "接近布林下轨。" : "Price is near the lower Bollinger band." },
    { side: "support", price: options.putWall, score: 74, sources: ["Put Wall"], explanation: currentLanguage === "zh" ? "期权 Put Wall 提供潜在支撑。" : "Put wall can provide structural support." },
    { side: "support", price: options.gammaFlip && options.gammaFlip <= price ? options.gammaFlip : null, score: 64, sources: ["Gamma Flip"], explanation: currentLanguage === "zh" ? "Gamma Flip 下方通常更容易形成支撑。" : "Gamma flip below spot can help support." },
    { side: "resistance", price: tech.upperBand, score: 42, sources: [currentLanguage === "zh" ? "布林上轨" : "Upper Band"], explanation: currentLanguage === "zh" ? "接近布林上轨。" : "Price is near the upper Bollinger band." },
    { side: "resistance", price: options.callWall, score: 76, sources: ["Call Wall"], explanation: currentLanguage === "zh" ? "期权 Call Wall 形成上方压力。" : "Call wall is acting as overhead resistance." },
    { side: "resistance", price: options.gammaFlip && options.gammaFlip >= price ? options.gammaFlip : null, score: 64, sources: ["Gamma Flip"], explanation: currentLanguage === "zh" ? "Gamma Flip 上方容易变成压力位。" : "Gamma flip above spot can become resistance." },
  ];

  fibs.forEach((fibValue, index) => {
    extras.push({
      side: fibValue <= price ? "support" : "resistance",
      price: fibValue,
      score: 50,
      sources: [`Fib ${[23.6, 38.2, 50, 61.8, 78.6][index]}%`],
      explanation: currentLanguage === "zh" ? "关键斐波那契回撤位。" : "Key Fibonacci retracement level.",
    });
  });

  if (Number.isFinite(tech.atr14)) {
    extras.push({
      side: "support",
      price: price - tech.atr14,
      score: 34,
      sources: ["ATR"],
      explanation: currentLanguage === "zh" ? "ATR 下沿参考位。" : "ATR-based downside reference.",
    });
    extras.push({
      side: "resistance",
      price: price + tech.atr14,
      score: 34,
      sources: ["ATR"],
      explanation: currentLanguage === "zh" ? "ATR 上沿参考位。" : "ATR-based upside reference.",
    });
  }

  const rawLevels = [
    ...((sr.support || []).map((cluster) => ({
      side_hint: "support",
      price: cluster.price,
      score: cluster.score,
      raw_items: cluster.items || [],
      sources: [...new Set((cluster.items || []).map(levelSourceLabel).filter(Boolean))],
      explanation: currentLanguage === "zh"
        ? `该价位被多次测试，来源包括 ${(cluster.items || []).map(levelSourceLabel).filter(Boolean).slice(0, 3).join("、") || "历史位置"}。`
        : `This level has been tested repeatedly with confirmation from ${(cluster.items || []).map(levelSourceLabel).filter(Boolean).slice(0, 3).join(", ") || "historical structure"}.`,
    }))),
    ...((sr.resistance || []).map((cluster) => ({
      side_hint: "resistance",
      price: cluster.price,
      score: cluster.score,
      raw_items: cluster.items || [],
      sources: [...new Set((cluster.items || []).map(levelSourceLabel).filter(Boolean))],
      explanation: currentLanguage === "zh"
        ? `该价位附近有明显压力，来源包括 ${(cluster.items || []).map(levelSourceLabel).filter(Boolean).slice(0, 3).join("、") || "历史位置"}。`
        : `This zone shows notable resistance from ${(cluster.items || []).map(levelSourceLabel).filter(Boolean).slice(0, 3).join(", ") || "historical structure"}.`,
    }))),
    ...extras.filter((item) => Number.isFinite(item.price)),
  ];

  const classified = rawLevels.reduce((acc, item) => {
    const side = classifyLevelSide(item.price, price) || item.side_hint;
    if (side === "support") acc.support.push(item);
    else if (side === "resistance") acc.resistance.push(item);
    else if (side === "pivot") {
      acc.pivot.push({
        ...item,
        explanation: currentLanguage === "zh"
          ? `${item.explanation || "该价位"} 更接近当前价格，先视作中性枢轴区。`
          : `${item.explanation || "This level"} is sitting close to spot, so it is treated as a pivot zone for now.`,
        sources: [...new Set([...(item.sources || []), t("pivotZone")])],
      });
    }
    return acc;
  }, { support: [], resistance: [], pivot: [] });

  const supportCandidates = dedupeLevels(classified.support, "support", price);
  while (supportCandidates.length < 5 && Number.isFinite(price)) {
    const step = supportCandidates.length + 1;
    supportCandidates.push({
      price: price * (1 - step * 0.025),
      sources: ["ATR / Percent fallback"],
      explanation: currentLanguage === "zh" ? "备用支撑位，来源于波动区间回退。" : "Fallback support from volatility / percent spacing.",
      score: 30,
    });
  }
  const resistanceCandidates = dedupeLevels(classified.resistance, "resistance", price);
  while (resistanceCandidates.length < 5 && Number.isFinite(price)) {
    const step = resistanceCandidates.length + 1;
    resistanceCandidates.push({
      price: price * (1 + step * 0.025),
      sources: ["ATR / Percent fallback"],
      explanation: currentLanguage === "zh" ? "备用压力位，来源于波动区间回退。" : "Fallback resistance from volatility / percent spacing.",
      score: 30,
    });
  }

  const supports = supportCandidates.slice(0, 5).map((item, index) => {
    const strengthInfo = applyVolumeConfirmationToLevelStrength(computeLevelStrength(item, price), item, price, "support", row);
    const sources = item.sources?.length ? item.sources : [currentLanguage === "zh" ? "技术结构" : "Technical structure"];
    return {
      level: `S${index + 1}`,
      price: Number(item.price.toFixed(2)),
      strength: strengthInfo.strength,
      strength_label: strengthLabelForSide(strengthInfo.strength, "support"),
      source: sources,
      sources,
      explanation: item.explanation,
      score: strengthInfo.score,
      points: strengthInfo.points,
      distance_pct: strengthInfo.distance_pct,
      test_count: strengthInfo.test_count,
      has_volume_cluster: strengthInfo.has_volume_cluster,
      volume_notes: strengthInfo.volume_notes || [],
    };
  });
  const resistances = resistanceCandidates.slice(0, 5).map((item, index) => {
    const strengthInfo = applyVolumeConfirmationToLevelStrength(computeLevelStrength(item, price), item, price, "resistance", row);
    const sources = item.sources?.length ? item.sources : [currentLanguage === "zh" ? "技术结构" : "Technical structure"];
    return {
      level: `R${index + 1}`,
      price: Number(item.price.toFixed(2)),
      strength: strengthInfo.strength,
      strength_label: strengthLabelForSide(strengthInfo.strength, "resistance"),
      source: sources,
      sources,
      explanation: item.explanation,
      score: strengthInfo.score,
      points: strengthInfo.points,
      distance_pct: strengthInfo.distance_pct,
      test_count: strengthInfo.test_count,
      has_volume_cluster: strengthInfo.has_volume_cluster,
      volume_notes: strengthInfo.volume_notes || [],
    };
  });

  const pivots = dedupeLevels(classified.pivot, "resistance", price).slice(0, 3).map((item, index) => ({
    level: `P${index + 1}`,
    price: Number(item.price.toFixed(2)),
    strength: computeLevelStrength(item, price).strength,
    source: item.sources?.length ? item.sources : [t("pivotZone")],
    explanation: item.explanation,
  }));

  return { supports, resistances, pivots };
}

function primaryZoneMaxDrawdownPct(companyProfile, row) {
  const tags = companyProfile?.tags || [];
  if (isCnAShare(row)) return 15;
  if (hasAnyTag(tags, ["Speculative", "HighVolatility", "IPO", "NewlyListed"])) return 18;
  if (hasAnyTag(tags, ["Growth", "HighGrowth", "HighMultiple", "Momentum", "StoryStock"])) return 12;
  if (hasAnyTag(tags, ["REIT", "Dividend"])) return 12;
  if (hasAnyTag(tags, ["MegaCap", "CashCow"])) return 10;
  return 12;
}

function makeBuyZone(low, high, confidence, sources, summary, status = "available") {
  const normalizedLow = Number.isFinite(low) ? Number(Math.min(low, high).toFixed(2)) : null;
  const normalizedHigh = Number.isFinite(high) ? Number(Math.max(low, high).toFixed(2)) : null;
  return {
    low: normalizedLow,
    high: normalizedHigh,
    confidence: clamp(Math.round(confidence || 0), 0, 100),
    status: normalizedLow != null && normalizedHigh != null ? status : "unavailable",
    sources: [...new Set((sources || []).filter(Boolean))].slice(0, 6),
    reason: [...new Set((sources || []).filter(Boolean))].slice(0, 6),
    summary: summary || t("dataUnavailable"),
  };
}

function weightedZoneFromCandidates(candidates, currentPrice, { minDrawdownPct = 0, maxDrawdownPct = 20, fallback = null } = {}) {
  const valid = candidates
    .filter((item) => Number.isFinite(item.price) && item.price > 0)
    .map((item) => ({
      ...item,
      drawdownPct: ((currentPrice - item.price) / Math.max(currentPrice, 1)) * 100,
    }))
    .filter((item) => item.drawdownPct >= minDrawdownPct && item.drawdownPct <= maxDrawdownPct);
  if (!valid.length) return fallback;
  const totalWeight = valid.reduce((sum, item) => sum + (item.weight || 1), 0) || 1;
  const center = valid.reduce((sum, item) => sum + item.price * (item.weight || 1), 0) / totalWeight;
  const priceStd = stdDev(valid.map((item) => item.price)) || 0;
  const spread = Math.max(
    currentPrice * 0.006,
    Math.min(currentPrice * 0.025, priceStd || currentPrice * 0.015),
  );
  return {
    low: center - spread,
    high: center + spread,
    sources: [...new Set(valid.sort((a, b) => (b.weight || 1) - (a.weight || 1)).slice(0, 5).map((item) => item.source))],
    candidate_count: valid.length,
    source_count: [...new Set(valid.map((item) => item.source).filter(Boolean))].length,
    avg_weight: totalWeight / valid.length,
    total_weight: totalWeight,
    price_std: priceStd,
    center,
  };
}

function computeBuyZoneConfidence(kind, zoneRaw, low, high, currentPrice, context = {}) {
  if (!zoneRaw || !Number.isFinite(low) || !Number.isFinite(high) || !Number.isFinite(currentPrice) || currentPrice <= 0) {
    return kind === "primary" ? 42 : 0;
  }

  const {
    isUs = false,
    optionsAvailable = false,
    strongTrend = false,
    maxDrawdownPct = 20,
    companyProfile = null,
  } = context;
  const tags = companyProfile?.tags || [];
  const widthPct = ((high - low) / currentPrice) * 100;
  const centerPrice = zoneRaw.center ?? ((low + high) / 2);
  const drawdownPct = ((currentPrice - centerPrice) / currentPrice) * 100;
  const sourceCount = zoneRaw.source_count ?? zoneRaw.sources?.length ?? 0;
  const candidateCount = zoneRaw.candidate_count ?? 0;
  const avgWeight = zoneRaw.avg_weight ?? 1;
  const priceStd = zoneRaw.price_std ?? 0;

  const sourceTarget = kind === "primary" ? 5 : kind === "deep" ? 4 : 4;
  const candidateTarget = kind === "primary" ? 8 : kind === "deep" ? 6 : 5;
  const sourceScore = clamp((sourceCount / sourceTarget) * 16, 0, 16);
  const candidateScore = clamp((candidateCount / candidateTarget) * 16, 0, 16);
  const weightScore = clamp(((avgWeight - 0.85) / 0.7) * 12, 0, 12);
  const clusterScore = clamp((1 - (priceStd / Math.max(currentPrice * 0.03, 0.75))) * 18, 0, 18);

  let widthTarget = 2.2;
  let drawdownTarget = Math.min(Math.max(maxDrawdownPct * 0.33, 1.5), 6);
  let base = 24;
  let marketBonus = 0;

  if (kind === "deep") {
    widthTarget = 4.6;
    drawdownTarget = Math.min(Math.max(maxDrawdownPct * 0.55, 10), 18);
    base = 22;
  } else if (kind === "momentum") {
    widthTarget = 2.8;
    drawdownTarget = 0.8;
    base = 25;
    if (strongTrend) marketBonus += 6;
  } else if (kind === "primary" && isUs && optionsAvailable) {
    marketBonus += 4;
  }

  if (hasAnyTag(tags, ["Speculative", "HighVolatility", "IPO", "NewlyListed"])) {
    marketBonus -= kind === "deep" ? 2 : 3;
  }
  if (hasAnyTag(tags, ["MegaCap", "CashCow"]) && kind === "primary") {
    marketBonus += 2;
  }

  const widthScore = clamp(14 - Math.abs(widthPct - widthTarget) * 3.2, 0, 14);
  const distanceScore = clamp(14 - Math.abs(drawdownPct - drawdownTarget) * (kind === "deep" ? 0.9 : 2.2), 0, 14);

  const total = base + sourceScore + candidateScore + weightScore + clusterScore + widthScore + distanceScore + marketBonus;
  const caps = {
    primary: [40, 88],
    deep: [34, 82],
    momentum: [38, 86],
  };
  const [minScore, maxScore] = caps[kind] || [35, 88];
  return clamp(Math.round(total), minScore, maxScore);
}

function buildBuyZones(row, supportResistance, companyProfile = null) {
  const tech = row.technicals || {};
  const options = row.research?.optionsRead || buildOptionsRead(row);
  const currentPrice = row.price ?? 0;
  const isUs = isUsMarket(row);
  const atrValue = Number.isFinite(tech.atr14) ? tech.atr14 : Math.max(currentPrice * 0.025, 0.5);
  const fib382 = tech.rangeLow != null && tech.rangeHigh != null ? tech.rangeLow + (tech.rangeHigh - tech.rangeLow) * 0.382 : null;
  const fib50 = tech.rangeLow != null && tech.rangeHigh != null ? tech.rangeLow + (tech.rangeHigh - tech.rangeLow) * 0.5 : null;
  const fib618 = tech.rangeLow != null && tech.rangeHigh != null ? tech.rangeLow + (tech.rangeHigh - tech.rangeLow) * 0.618 : null;
  const fib786 = tech.rangeLow != null && tech.rangeHigh != null ? tech.rangeLow + (tech.rangeHigh - tech.rangeLow) * 0.786 : null;
  const recentSwingLow = Math.min(...(tech.history?.lows || []).slice(-30).filter(Number.isFinite));
  const majorSwingLow = Math.min(...(tech.history?.lows || []).slice(-180).filter(Number.isFinite));
  const primaryMax = Math.min(20, primaryZoneMaxDrawdownPct(companyProfile, row));
  const addCandidate = (list, price, weight, source) => {
    if (!Number.isFinite(price) || !Number.isFinite(currentPrice) || currentPrice <= 0) return;
    if (price > currentPrice * 1.06) return;
    list.push({ price, weight, source });
  };

  const primaryCandidates = [];
  supportResistance.supports.slice(0, 3).forEach((level, index) => addCandidate(primaryCandidates, level.price, 1.8 - index * 0.25, level.level));
  addCandidate(primaryCandidates, tech.ma20, 1.25, "MA20");
  addCandidate(primaryCandidates, tech.ma50, 1.35, "MA50");
  addCandidate(primaryCandidates, tech.ma100, 1.1, "MA100");
  addCandidate(primaryCandidates, tech.middleBand, 0.9, currentLanguage === "zh" ? "布林中轨" : "Bollinger Middle");
  addCandidate(primaryCandidates, tech.lowerBand, 0.95, currentLanguage === "zh" ? "布林下轨" : "Bollinger Lower");
  addCandidate(primaryCandidates, currentPrice - atrValue, 1.05, "ATR");
  addCandidate(primaryCandidates, fib382, 1.0, "Fib 38.2%");
  addCandidate(primaryCandidates, fib50, 0.95, "Fib 50%");
  addCandidate(primaryCandidates, recentSwingLow, 1.0, "Recent Swing Low");
  if (isUs) {
    addCandidate(primaryCandidates, options.putWall, 1.45, "Put Wall");
    addCandidate(primaryCandidates, options.gammaFlip && options.gammaFlip <= currentPrice ? options.gammaFlip : null, 1.15, "Gamma Flip");
  }

  const primaryRaw = weightedZoneFromCandidates(primaryCandidates, currentPrice, { minDrawdownPct: -1, maxDrawdownPct: primaryMax });
  const primaryFallbackHigh = currentPrice - Math.min(atrValue * 0.45, currentPrice * 0.025);
  const primaryFallbackLow = primaryFallbackHigh - Math.max(atrValue * 0.5, currentPrice * 0.012);
  const primary = primaryRaw
    ? makeBuyZone(
      Math.max(primaryRaw.low, currentPrice * (1 - primaryMax / 100)),
      Math.min(primaryRaw.high, currentPrice * 1.01),
      computeBuyZoneConfidence(
        "primary",
        primaryRaw,
        Math.max(primaryRaw.low, currentPrice * (1 - primaryMax / 100)),
        Math.min(primaryRaw.high, currentPrice * 1.01),
        currentPrice,
        { isUs, optionsAvailable: options.available, maxDrawdownPct: primaryMax, companyProfile },
      ),
      primaryRaw.sources,
      currentLanguage === "zh" ? "接近当前价附近的支撑共振，适合等待回踩确认。" : "Near-current support confluence for a practical pullback entry.",
    )
    : makeBuyZone(
      primaryFallbackLow,
      primaryFallbackHigh,
      42,
      ["ATR"],
      currentLanguage === "zh" ? "缺少足够支撑锚点，暂用 ATR 附近作为保守参考。" : "Limited support anchors; using an ATR-based fallback.",
    );

  const deepCandidates = [];
  addCandidate(deepCandidates, tech.ma200, 1.7, "MA200");
  addCandidate(deepCandidates, fib618, 1.25, "Fib 61.8%");
  addCandidate(deepCandidates, fib786, 1.15, "Fib 78.6%");
  addCandidate(deepCandidates, majorSwingLow, 1.3, "Major Swing Low");
  addCandidate(deepCandidates, tech.rangeLow, 1.2, "52W Support");
  supportResistance.supports.filter((level) => level.strength === "strong").forEach((level) => addCandidate(deepCandidates, level.price, 1.1, `${level.level} Strong Support`));
  addCandidate(deepCandidates, currentPrice - atrValue * 3, 0.9, "Long-Term ATR");
  const deepMax = hasAnyTag(companyProfile?.tags || [], ["Speculative", "HighVolatility", "IPO", "NewlyListed"]) ? 45 : 35;
  const deepRaw = weightedZoneFromCandidates(deepCandidates, currentPrice, { minDrawdownPct: 8, maxDrawdownPct: deepMax });
  const deep = deepRaw
    ? makeBuyZone(
      deepRaw.low,
      deepRaw.high,
      computeBuyZoneConfidence(
        "deep",
        deepRaw,
        deepRaw.low,
        deepRaw.high,
        currentPrice,
        { isUs, optionsAvailable: options.available, maxDrawdownPct: deepMax, companyProfile },
      ),
      deepRaw.sources,
      currentLanguage === "zh" ? "深度回调区，不是当前默认买入区。" : "Deep pullback reference, not the default current entry zone.",
    )
    : makeBuyZone(
      null,
      null,
      0,
      [],
      currentLanguage === "zh" ? "没有足够可靠的深度回调锚点。" : "No reliable deep-pullback anchors are available.",
      "unavailable",
    );

  const momentumShareBase = positiveOrNull(row.metadata?.floatShares ?? row.floatShares)
    ?? positiveOrNull(row.metadata?.sharesOutstanding ?? row.sharesOutstanding)
    ?? (positiveOrNull(row.marketCap) && positiveOrNull(row.price) ? row.marketCap / row.price : null);
  const momentumTurnoverScore = turnoverActivityScore(
    turnoverFromVolume(tech.latestVolume ?? latest(tech.history?.volumes || []), momentumShareBase),
    row,
    companyProfile,
  );
  const strongTrend = Number.isFinite(currentPrice)
    && currentPrice > (tech.ma20 ?? Number.POSITIVE_INFINITY)
    && (tech.ma20 ?? 0) >= (tech.ma50 ?? Number.POSITIVE_INFINITY) * 0.995
    && (tech.macd ?? 0) > 0
    && (tech.macdHistogram ?? 0) >= 0
    && ["rising", "neutral"].includes(obvTrend(tech.history?.closes || [], tech.history?.volumes || [], 20))
    && (tech.volumeRatio ?? 1) >= 1.2
    && (tech.closePosition ?? 0.5) >= 0.6
    && momentumTurnoverScore >= 55
    && momentumTurnoverScore <= 85;
  const momentumCandidates = [];
  if (strongTrend) {
    const r1 = supportResistance.resistances[0]?.price;
    addCandidate(momentumCandidates, tech.ma10, 1.2, "MA10");
    addCandidate(momentumCandidates, tech.ma20, 1.1, "MA20");
    addCandidate(momentumCandidates, currentPrice, 0.9, currentLanguage === "zh" ? "现价回踩确认" : "Spot Retest");
    if (Number.isFinite(r1) && Math.abs((r1 - currentPrice) / Math.max(currentPrice, 1)) * 100 <= 5) addCandidate(momentumCandidates, r1, 1.25, "Breakout / R1 Retest");
    addCandidate(momentumCandidates, tech.middleBand, 0.8, currentLanguage === "zh" ? "布林中轨" : "Bollinger Middle");
    addCandidate(momentumCandidates, tech.upperBand && currentPrice >= tech.upperBand * 0.98 ? tech.upperBand : null, 0.7, "Upper Band Retest");
  }
  const momentumRaw = strongTrend
    ? weightedZoneFromCandidates(momentumCandidates, currentPrice, { minDrawdownPct: -5, maxDrawdownPct: 8 })
    : null;
  const momentum = momentumRaw
    ? makeBuyZone(
      Math.max(momentumRaw.low, currentPrice * 0.97),
      Math.min(momentumRaw.high, currentPrice * 1.05),
      computeBuyZoneConfidence(
        "momentum",
        momentumRaw,
        Math.max(momentumRaw.low, currentPrice * 0.97),
        Math.min(momentumRaw.high, currentPrice * 1.05),
        currentPrice,
        { isUs, optionsAvailable: options.available, strongTrend, maxDrawdownPct: 8, companyProfile },
      ),
      momentumRaw.sources,
      currentLanguage === "zh" ? "强趋势下的突破 / 回踩确认区，需放量站稳。" : "Breakout or retest entry zone for a confirmed strong trend.",
    )
    : makeBuyZone(
      null,
      null,
      0,
      [],
      currentLanguage === "zh" ? "未触发：量能或趋势确认不足。" : "Not triggered: volume or trend confirmation is insufficient.",
      "unavailable",
    );

  return {
    primary_buy_zone: {
      ...primary,
      purpose: currentLanguage === "zh" ? "回调到合理支撑区分批买入，偏稳健。" : "Staged pullback entry near reasonable support.",
      outlier_detected: false,
      warning: null,
    },
    deep_pullback_zone: {
      ...deep,
      purpose: currentLanguage === "zh" ? "大幅回调后的长期低吸区，不代表现在必须等到这里。" : "Longer-term deep-pullback accumulation area, not a requirement to wait for it now.",
    },
    momentum_entry_zone: momentum,
  };
}

function buildIdealBuyZone(row, supportResistance, companyProfile = null) {
  return buildBuyZones(row, supportResistance, companyProfile).primary_buy_zone;
}

function atrStopMultiplier(row, companyProfile) {
  const tags = companyProfile?.tags || [];
  if (isCnAShare(row)) {
    if (hasAnyTag(tags, ["HighVolatility", "Speculative", "Momentum", "StoryStock"])) return 2.5;
    return 2.0;
  }
  if (hasAnyTag(tags, ["HighVolatility", "Speculative", "NewlyListed", "IPO", "Crypto", "StoryStock"])) return 2.5;
  if (hasAnyTag(tags, ["Semiconductor", "AIInfrastructure", "AI"])) return 2.0;
  if (hasAnyTag(tags, ["Growth", "HighGrowth", "Software", "Healthcare", "Consumer"])) return 1.7;
  if (hasAnyTag(tags, ["REIT", "Dividend"])) return 1.45;
  if (hasAnyTag(tags, ["MegaCap", "CashCow"])) return 1.5;
  return 1.8;
}

function buyZoneStopBuffer(row, companyProfile) {
  const tags = companyProfile?.tags || [];
  if (isCnAShare(row)) {
    if (hasAnyTag(tags, ["HighVolatility", "Speculative", "Momentum", "StoryStock"])) return 0.955;
    return 0.978;
  }
  if (hasAnyTag(tags, ["Speculative", "HighVolatility", "NewlyListed", "IPO", "Crypto", "StoryStock"])) return 0.955;
  if (hasAnyTag(tags, ["Semiconductor", "AIInfrastructure", "HighGrowth"])) return 0.98;
  if (hasAnyTag(tags, ["Software", "Growth", "ProfitableGrowth", "LargeCap"])) return 0.982;
  if (hasAnyTag(tags, ["REIT", "Dividend"])) return 0.988;
  if (hasAnyTag(tags, ["MegaCap", "CashCow"])) return 0.988;
  return 0.98;
}

function buildRecommendedBuyPlan(row, buyZones, aiDecision, technical, supportResistance = null) {
  const shortRating = aiDecision?.short_term?.rating || "Hold";
  const midRating = aiDecision?.mid_term?.rating || "Hold";
  const bearishWatch = ["Sell", "Strong Sell", "Short"].includes(shortRating) && ["Sell", "Strong Sell", "Short"].includes(midRating);
  const primary = { ...(buyZones.primary_buy_zone || {}) };
  primary.purpose = currentLanguage === "zh" ? "回调到合理支撑区分批买入，偏稳健。" : "Staged pullback entry near reasonable support.";
  if (bearishWatch && primary.status === "available") {
    primary.plan_type = "watch";
    primary.title = currentLanguage === "zh" ? "观察买入区" : "Watch Buy Zone";
    primary.confidence = clamp((primary.confidence ?? 50) - 12, 0, 100);
    primary.summary = currentLanguage === "zh"
      ? "短期和中期评级偏弱，该区间先作为观察区，等待量能和趋势重新确认。"
      : "Short and mid-term ratings are weak, so this zone is for watching until volume and trend confirm.";
  } else {
    primary.plan_type = "primary";
    primary.title = currentLanguage === "zh" ? "主要买入区" : "Primary Buy Zone";
  }

  const tech = row.technicals || {};
  const volume = technical?.volume_confirmation || {};
  const price = row.price ?? null;
  const r1 = supportResistance?.resistances?.[0]?.price ?? null;
  const hasTrend = Number.isFinite(price) && Number.isFinite(tech.ma20) && price > tech.ma20;
  const maStructure = Number.isFinite(tech.ma20) && Number.isFinite(tech.ma50) && tech.ma20 >= tech.ma50 * 0.995;
  const macdImproving = Number.isFinite(tech.macdHistogram) && tech.macdHistogram >= 0;
  const obvOk = ["rising", "neutral"].includes(volume.obv_trend_20d);
  const relVolOk = (volume.relative_volume_20d ?? 0) >= 1.2;
  const closeOk = (volume.close_location_pct ?? 0) >= 60;
  const turnoverScore = turnoverActivityScore(volume.turnover_rate, row, null);
  const turnoverOk = turnoverScore >= 55 && turnoverScore <= 85;
  const nearBreakout = Number.isFinite(r1) && Number.isFinite(price)
    ? Math.abs((r1 - price) / Math.max(price, 1)) * 100 <= 5
    : Number.isFinite(tech.ma10) && Number.isFinite(price)
      ? Math.abs((price - tech.ma10) / Math.max(price, 1)) * 100 <= 3
      : false;
  const missingConditions = [
    !relVolOk ? (currentLanguage === "zh" ? "20D 量比不足 1.2" : "20D relative volume is below 1.2") : null,
    !obvOk ? (currentLanguage === "zh" ? "OBV 20D 尚未确认" : "OBV 20D has not confirmed") : null,
    !closeOk ? (currentLanguage === "zh" ? "收盘位置不足 60%" : "Close location is below 60%") : null,
    !maStructure ? (currentLanguage === "zh" ? "MA20 / MA50 趋势结构不足" : "MA20 / MA50 trend structure is not strong enough") : null,
    !macdImproving ? (currentLanguage === "zh" ? "MACD histogram 尚未改善" : "MACD histogram is not improving") : null,
    !hasTrend ? (currentLanguage === "zh" ? "价格尚未站上 MA20" : "Price is not above MA20") : null,
    !turnoverOk ? (currentLanguage === "zh" ? "换手率未处于健康活跃区间" : "Turnover is not in a healthy active range") : null,
    !nearBreakout ? (currentLanguage === "zh" ? "价格尚未接近 R1 突破或 MA10 / MA20 回踩确认" : "Price is not near R1 breakout or MA10 / MA20 retest") : null,
  ].filter(Boolean).slice(0, 3);
  const triggerConditions = [
    currentLanguage === "zh" ? "放量突破 R1" : "Break above R1 on volume",
    currentLanguage === "zh" ? "或回踩 MA20 后重新站上" : "Or reclaim MA20 after a retest",
    currentLanguage === "zh" ? "OBV / 量比 / 收盘位置确认" : "OBV / relative volume / close location confirm",
  ];
  const momentumRaw = buyZones.momentum_entry_zone || {};
  const momentumTriggered = momentumRaw.status === "available" && momentumRaw.low != null && momentumRaw.high != null;
  const invalidMomentum = bearishWatch
    || (Number.isFinite(price) && Number.isFinite(tech.ma50) && price < tech.ma50 && Number.isFinite(tech.ma20) && tech.ma20 < tech.ma50)
    || (volume.obv_trend_20d === "falling" && (volume.close_location_pct ?? 50) < 45);
  const invalidReasons = [
    Number.isFinite(price) && Number.isFinite(tech.ma20) && Number.isFinite(tech.ma50) && price < tech.ma20 && price < tech.ma50
      ? (currentLanguage === "zh" ? "价格低于 MA20 / MA50" : "Price is below MA20 / MA50")
      : null,
    Number.isFinite(tech.ma20) && Number.isFinite(tech.ma50) && tech.ma20 < tech.ma50
      ? (currentLanguage === "zh" ? "MA20 低于 MA50，趋势结构偏弱" : "MA20 is below MA50, so trend structure is weak")
      : null,
    volume.obv_trend_20d === "falling" ? (currentLanguage === "zh" ? "OBV 20D 偏弱" : "OBV 20D is weak") : null,
    (volume.relative_volume_20d ?? 0) < 1.2 ? (currentLanguage === "zh" ? "20D 量比不足 1.2" : "20D relative volume is below 1.2") : null,
    (volume.close_location_pct ?? 50) < 45 ? (currentLanguage === "zh" ? "收盘位置偏弱" : "Close location is weak") : null,
    bearishWatch ? (currentLanguage === "zh" ? "短期和中期评级偏弱" : "Short and mid-term ratings are weak") : null,
  ].filter(Boolean).slice(0, 3);
  const momentum = momentumTriggered
    ? {
      ...momentumRaw,
      status: "triggered",
      zone: { low: momentumRaw.low, high: momentumRaw.high },
      plan_type: "momentum",
      title: currentLanguage === "zh" ? "动量买入" : "Momentum Entry",
      trigger_status: "triggered",
      trigger_price: Number.isFinite(r1) ? r1 : momentumRaw.high,
      purpose: currentLanguage === "zh" ? "突破或回踩确认后的趋势买入，偏趋势交易。" : "Trend entry after breakout or retest confirmation.",
      meaning: currentLanguage === "zh" ? "趋势突破条件已满足，可以考虑趋势买入。" : "Trend-breakout conditions are met; a trend entry can be considered.",
      missing_conditions: [],
      trigger_conditions: triggerConditions,
      reason: currentLanguage === "zh" ? "趋势、量能、OBV 和收盘位置已经满足动量入场条件。" : "Trend, volume, OBV, and close location meet momentum-entry conditions.",
      action: currentLanguage === "zh" ? "按仓位计划分批买入，并使用当前价止损控制风险。" : "Scale in according to the position plan and use the Current Entry Stop for risk control.",
    }
    : {
      low: null,
      high: null,
      zone: null,
      confidence: invalidMomentum ? 0 : 35,
      status: invalidMomentum ? "invalid" : "waiting",
      plan_type: "momentum",
      title: currentLanguage === "zh" ? "动量买入" : "Momentum Entry",
      trigger_status: invalidMomentum ? "invalid" : "waiting",
      trigger_price: Number.isFinite(r1) ? r1 : (Number.isFinite(tech.ma20) ? tech.ma20 : null),
      purpose: currentLanguage === "zh" ? "突破或回踩确认后的趋势买入，偏趋势交易。" : "Trend entry after breakout or retest confirmation.",
      meaning: currentLanguage === "zh"
        ? (invalidMomentum ? "趋势结构不足，或量能 / OBV 不支持趋势买入。" : "如果股价放量突破该位置，说明趋势可能转强。")
        : (invalidMomentum ? "Trend structure is insufficient, or volume / OBV does not support a trend entry." : "A high-volume break above this level would suggest the trend may be strengthening."),
      sources: [],
      summary: currentLanguage === "zh"
        ? (invalidMomentum ? "不适用：趋势结构或资金流明显破坏。" : "未触发 / 等待触发：量能或突破确认不足。")
        : (invalidMomentum ? "Invalid: trend structure or money flow is materially broken." : "Not triggered / waiting: volume or breakout confirmation is insufficient."),
      missing_conditions: missingConditions.length ? missingConditions : [currentLanguage === "zh" ? "等待明确突破或回踩确认" : "Awaiting a clear breakout or retest confirmation"],
      trigger_conditions: triggerConditions,
      reason: invalidMomentum
        ? invalidReasons
        : missingConditions,
      top_invalid_reasons: invalidReasons,
      action: invalidMomentum
        ? (currentLanguage === "zh" ? "不要追涨，优先关注主要买入区或等待重新企稳。" : "Do not chase; focus on the Primary Buy Zone or wait for stabilization.")
        : (currentLanguage === "zh" ? "暂不追高，等待放量突破或回踩确认。" : "Do not chase; wait for a high-volume breakout or retest confirmation."),
    };

  const deep = {
    ...(buyZones.deep_pullback_zone || {}),
    plan_type: "deep_pullback",
    title: currentLanguage === "zh" ? "深度回调区" : "Deep Pullback Zone",
    purpose: currentLanguage === "zh" ? "大幅回调后的长期低吸区，不代表现在必须等到这里。" : "Longer-term deep-pullback accumulation area, not a requirement to wait for it now.",
  };

  return {
    primary_buy_zone: primary,
    momentum_entry: momentum,
    deep_pullback_zone: deep,
    summary: currentLanguage === "zh"
      ? "推荐买入计划区分正常回调、动量突破和深度回调三种场景。"
      : "Recommended buy plan separates pullback, momentum, and deep-pullback scenarios.",
  };
}

function buildStopLossPlan(row, buyZones, supportResistance, companyProfile, aiDecision, technical) {
  const price = row.price ?? null;
  const atr = Number.isFinite(row.technicals?.atr14) ? row.technicals.atr14 : (Number.isFinite(price) ? price * 0.035 : null);
  if (!Number.isFinite(price) || !Number.isFinite(atr)) {
    return {
      current_entry_stop: {
        price: null,
        stop_type: "unavailable",
        stop_distance_pct: null,
        risk_level: "unavailable",
        based_on: [],
        invalidation_reason: t("dataUnavailable"),
        action_if_triggered: t("dataUnavailable"),
      },
      buy_zone_stop: {
        price: null,
        stop_type: "unavailable",
        stop_distance_pct_from_zone_low: null,
        applies_to_zone: "Primary Buy Zone",
        risk_level: "unavailable",
        based_on: [],
        invalidation_reason: t("dataUnavailable"),
        action_if_triggered: t("dataUnavailable"),
      },
    };
  }

  const primary = buyZones.primary_buy_zone || {};
  const multiplier = atrStopMultiplier(row, companyProfile);
  const nearestSupport = supportResistance.supports.find((level) => Number.isFinite(level.price) && level.price < price);
  const swingLow = Math.min(...(row.technicals?.history?.lows || []).slice(-30).filter(Number.isFinite));
  const maBase = [row.technicals?.ma20, row.technicals?.ma50].filter((value) => Number.isFinite(value) && value < price).sort((a, b) => b - a)[0];
  const putWall = !isCnAShare(row) && Number.isFinite(row.research?.optionsRead?.putWall) && row.research.optionsRead.putWall < price
    ? row.research.optionsRead.putWall * 0.985
    : null;
  const candidates = [
    { value: nearestSupport?.price ? nearestSupport.price * 0.985 : null, type: "support_stop", source: nearestSupport?.level || "Support" },
    { value: price - atr * multiplier, type: "atr_stop", source: `ATR x ${multiplier.toFixed(1)}` },
    { value: Number.isFinite(maBase) ? maBase * 0.985 : null, type: "ma_stop", source: maBase === row.technicals?.ma20 ? "MA20" : "MA50" },
    { value: Number.isFinite(row.technicals?.lowerBand) ? row.technicals.lowerBand * 0.985 : null, type: "bollinger_stop", source: "Bollinger Lower" },
    { value: Number.isFinite(swingLow) ? swingLow * 0.985 : null, type: "swing_low_stop", source: "Recent Swing Low" },
    { value: putWall, type: "put_wall_stop", source: "Put Wall" },
  ].filter((item) => Number.isFinite(item.value) && item.value > 0 && item.value < price);
  const chosen = candidates.sort((a, b) => b.value - a.value)[0];
  const currentStop = chosen?.value ?? price - atr * multiplier;
  const currentDistancePct = ((price - currentStop) / price) * 100;
  const shortWeak = ["Sell", "Strong Sell", "Short"].includes(aiDecision?.short_term?.rating);
  const midWeak = ["Sell", "Strong Sell", "Short"].includes(aiDecision?.mid_term?.rating);
  const volumeRisk = ["distribution_risk", "panic_selling", "weak_breakout"].includes(technical?.volume_confirmation?.behavior_key);
  let currentRiskLevel = currentDistancePct <= 4 ? "low" : currentDistancePct <= 8 ? "medium" : "high";
  if ((shortWeak && midWeak) || volumeRisk) currentRiskLevel = currentRiskLevel === "low" ? "medium" : "high";

  const zoneLow = Number.isFinite(primary.low) ? primary.low : null;
  const buffer = buyZoneStopBuffer(row, companyProfile);
  const supportBelowZone = supportResistance.supports
    .filter((level) => Number.isFinite(level.price) && Number.isFinite(zoneLow) && level.price < zoneLow)
    .map((level) => ({ value: level.price * 0.985, type: "support_below_zone", source: level.level }));
  const zoneCandidates = [
    { value: Number.isFinite(zoneLow) ? zoneLow * buffer : null, type: "zone_buffer_stop", source: `Primary Low x ${buffer.toFixed(3)}` },
    { value: Number.isFinite(zoneLow) ? zoneLow - atr * Math.min(multiplier, 2.4) * 0.55 : null, type: "zone_atr_stop", source: "Primary Low - ATR buffer" },
    ...supportBelowZone,
  ].filter((item) => Number.isFinite(item.value) && Number.isFinite(zoneLow) && item.value > 0 && item.value < zoneLow);
  const zoneChosen = zoneCandidates.sort((a, b) => b.value - a.value)[0];
  const buyZoneStop = zoneChosen?.value ?? (Number.isFinite(zoneLow) ? zoneLow * buffer : null);
  const zoneDistancePct = Number.isFinite(zoneLow) && Number.isFinite(buyZoneStop)
    ? ((zoneLow - buyZoneStop) / zoneLow) * 100
    : null;
  let zoneRiskLevel = zoneDistancePct == null ? "unavailable" : zoneDistancePct <= 2.5 ? "low" : zoneDistancePct <= 6 ? "medium" : "high";
  if ((shortWeak && midWeak) || volumeRisk) zoneRiskLevel = zoneRiskLevel === "low" ? "medium" : "high";
  const priceBelowZone = Number.isFinite(zoneLow) && price < zoneLow;
  return {
    // Backward-compatible headline fields; UI now displays the scenario-specific stops below.
    recommended_stop: Number(currentStop.toFixed(2)),
    stop_type: chosen?.type || "atr_stop",
    stop_distance_pct: Number(currentDistancePct.toFixed(1)),
    risk_level: currentRiskLevel,
    current_entry_stop: {
      price: Number(currentStop.toFixed(2)),
      stop_type: chosen?.type || "atr_stop",
      stop_distance_pct: Number(currentDistancePct.toFixed(1)),
      applies_to: currentLanguage === "zh" ? "当前价附近买入 / 已持有" : "Current-price entry / existing position",
      risk_level: currentRiskLevel,
      based_on: candidates.slice(0, 4).map((item) => item.source),
      invalidation_reason: currentLanguage === "zh"
        ? `跌破 ${formatCurrency(currentStop, row.currencyCode)}，说明当前这笔入场失败。`
        : `A break below ${formatCurrency(currentStop, row.currencyCode)} means the current entry has failed.`,
      action_if_triggered: currentLanguage === "zh"
        ? "减仓、退出，或等待重新确认。"
        : "Reduce, exit, or wait for fresh confirmation.",
    },
    buy_zone_stop: {
      price: Number.isFinite(buyZoneStop) ? Number(buyZoneStop.toFixed(2)) : null,
      stop_type: zoneChosen?.type || "zone_buffer_stop",
      stop_distance_pct_from_zone_low: Number.isFinite(zoneDistancePct) ? Number(zoneDistancePct.toFixed(1)) : null,
      applies_to_zone: "Primary Buy Zone",
      risk_level: zoneRiskLevel,
      based_on: zoneCandidates.slice(0, 4).map((item) => item.source),
      invalidation_reason: Number.isFinite(buyZoneStop)
        ? (currentLanguage === "zh"
          ? `跌破 ${formatCurrency(buyZoneStop, row.currencyCode)}，说明买入区支撑失败。`
          : `A break below ${formatCurrency(buyZoneStop, row.currencyCode)} means the buy-zone support has failed.`)
        : t("dataUnavailable"),
      action_if_triggered: priceBelowZone
        ? (currentLanguage === "zh" ? "停止加仓，减仓或止损；等待重新计算。" : "Stop adding, reduce or stop out; wait for recalculation.")
        : (currentLanguage === "zh" ? "停止加仓，减仓或止损。" : "Stop adding, reduce, or stop out."),
    },
  };
}

function buildVolumeConfirmation(row, companyProfile = null, supportResistance = null) {
  const tech = row.technicals || {};
  const metadata = row.metadata || {};
  const move = row.changePercent ?? 0;
  const closePosition = tech.closePosition ?? 0.5;
  const closes = tech.history?.closes || [];
  const volumes = tech.history?.volumes || [];
  const todayVolume = positiveOrNull(tech.latestVolume ?? latest(volumes));
  const avgVolume5d = averageLast(volumes, 5);
  const avgVolume10d = averageLast(volumes, 10);
  const avgVolume20d = averageLast(volumes, 20) ?? tech.vol20 ?? null;
  const avgVolume50d = averageLast(volumes, 50);
  const avgVolume60d = averageLast(volumes, 60);
  const avgVolume120d = averageLast(volumes, 120);
  const avgVolume250d = averageLast(volumes, 250);
  const relativeVolume5d = todayVolume != null && avgVolume5d ? todayVolume / avgVolume5d : null;
  const relativeVolume20d = todayVolume != null && avgVolume20d ? todayVolume / avgVolume20d : (tech.volumeRatio ?? null);
  const relativeVolume60d = todayVolume != null && avgVolume60d ? todayVolume / avgVolume60d : null;
  const floatShares = positiveOrNull(metadata.floatShares ?? metadata.float_shares ?? row.floatShares);
  const reportedSharesOutstanding = positiveOrNull(metadata.sharesOutstanding ?? metadata.shares_outstanding ?? row.sharesOutstanding);
  const estimatedSharesOutstanding = positiveOrNull(row.marketCap) && positiveOrNull(row.price)
    ? row.marketCap / row.price
    : null;
  const sharesOutstanding = reportedSharesOutstanding ?? estimatedSharesOutstanding;
  const shareBase = floatShares ?? sharesOutstanding;
  const shareBaseSource = floatShares
    ? "float_shares"
    : reportedSharesOutstanding
      ? "shares_outstanding"
      : estimatedSharesOutstanding
        ? "market_cap_price_estimate"
        : null;
  const turnoverRate = turnoverFromVolume(todayVolume, shareBase);
  const avgTurnover5d = turnoverFromVolume(avgVolume5d, shareBase);
  const avgTurnover20d = turnoverFromVolume(avgVolume20d, shareBase);
  const avgTurnover60d = turnoverFromVolume(avgVolume60d, shareBase);
  const avgTurnover120d = turnoverFromVolume(avgVolume120d, shareBase);
  const obvTrend5d = obvTrend(closes, volumes, 5);
  const obvTrend20d = obvTrend(closes, volumes, 20);
  const obvTrend60d = obvTrend(closes, volumes, 60);
  const upDown20d = upDownVolumeStats(closes, volumes, 20);
  const upDown60d = upDownVolumeStats(closes, volumes, 60);
  const volumeTrendRatio60 = avgVolume60d && avgVolume120d ? avgVolume60d / avgVolume120d : null;
  const volumeTrendRatio120 = avgVolume120d && avgVolume250d ? avgVolume120d / avgVolume250d : null;
  const turnoverScore = turnoverActivityScore(turnoverRate, row, companyProfile);
  const brokeResistance = supportResistance?.resistances?.[0]?.price
    && Number.isFinite(row.price)
    && row.price > supportResistance.resistances[0].price * 1.005;
  const behaviorSignal = classifyVolumePriceBehavior({
    move,
    relativeVolume: relativeVolume20d ?? relativeVolume5d,
    turnoverRate,
    turnoverScore,
    closePosition,
    obvTrendValue: obvTrend5d,
    brokeResistance,
  });
  const shortComponents = {
    relative_volume: scoreRelativeVolume(relativeVolume5d ?? relativeVolume20d),
    turnover_rate: turnoverScore,
    close_location: scoreCloseLocation(closePosition),
    obv_trend: scoreObvTrendValue(obvTrend5d),
    volume_price_behavior: behaviorSignal.score,
  };
  const midComponents = {
    volume_20d_vs_60d: Number.isFinite(volumeTrendRatio60) ? scoreRelativeVolume(volumeTrendRatio60) : scoreRelativeVolume(relativeVolume20d ?? relativeVolume60d),
    turnover_20d_vs_60d: Number.isFinite(avgTurnover20d) && Number.isFinite(avgTurnover60d) && avgTurnover60d > 0
      ? scoreRelativeVolume(avgTurnover20d / avgTurnover60d)
      : turnoverActivityScore(avgTurnover20d ?? turnoverRate, row, companyProfile),
    obv_20d_60d: Math.round(mean([scoreObvTrendValue(obvTrend20d), scoreObvTrendValue(obvTrend60d)]) ?? 50),
    up_volume_vs_down_volume: scoreRatioConfirmation(upDown60d.ratio ?? upDown20d.ratio),
    volume_price_behavior: behaviorSignal.score,
  };
  const longComponents = {
    obv_3m_6m: scoreObvTrendValue(obvTrend60d),
    volume_60d_120d_250d: Math.round(mean([
      Number.isFinite(volumeTrendRatio60) ? scoreRelativeVolume(volumeTrendRatio60) : null,
      Number.isFinite(volumeTrendRatio120) ? scoreRelativeVolume(volumeTrendRatio120) : null,
    ].filter(Number.isFinite)) ?? 50),
    turnover_60d_120d: Number.isFinite(avgTurnover60d) && Number.isFinite(avgTurnover120d) && avgTurnover120d > 0
      ? scoreRelativeVolume(avgTurnover60d / avgTurnover120d)
      : turnoverActivityScore(avgTurnover60d ?? turnoverRate, row, companyProfile),
    accumulation_distribution: Math.round(mean([
      scoreRatioConfirmation(upDown60d.ratio),
      behaviorSignal.score,
      scoreCloseLocation(closePosition),
    ]) ?? 50),
  };
  const shortScore = weightedComponentScore(shortComponents, {
    relative_volume: 25,
    turnover_rate: 25,
    close_location: 20,
    obv_trend: 20,
    volume_price_behavior: 10,
  });
  const midScore = weightedComponentScore(midComponents, {
    volume_20d_vs_60d: 25,
    turnover_20d_vs_60d: 20,
    obv_20d_60d: 25,
    up_volume_vs_down_volume: 20,
    volume_price_behavior: 10,
  });
  const longScore = weightedComponentScore(longComponents, {
    obv_3m_6m: 35,
    volume_60d_120d_250d: 25,
    turnover_60d_120d: 20,
    accumulation_distribution: 20,
  });
  const score = clamp(Math.round(shortScore * 0.45 + midScore * 0.35 + longScore * 0.2), 0, 100);
  const stage = volumeStageFromScore(score);
  const localizedStage = localizedVolumeStage(stage);

  const behavior = behaviorSignal.summary;

  const missingFields = [];
  if (todayVolume == null) missingFields.push("today_volume");
  if (avgVolume20d == null) missingFields.push("avg_volume_20d");
  if (avgVolume60d == null) missingFields.push("avg_volume_60d");
  if (shareBase == null) missingFields.push("float_shares_or_shares_outstanding");
  if (turnoverRate == null) missingFields.push("turnover_rate");
  if (obvTrend60d === "unavailable") missingFields.push("obv_trend_60d");
  if (upDown60d.ratio == null) missingFields.push("up_down_volume_ratio_60d");
  let confidence = 92 - missingFields.length * 6;
  if (shareBase == null) confidence -= 8;
  if (volumes.length < 60) confidence -= 8;
  if (volumes.length < 120) confidence -= 4;
  confidence = clamp(Math.round(confidence), 42, 94);

  const makePeriodSignal = (horizon, periodScore, relVolume, avgTurnover, obvTrendValue, upDownRatio, note) => {
    const periodStage = volumeStageFromScore(periodScore);
    return {
      horizon,
      score: periodScore,
      status: periodStage,
      status_label: localizedVolumeStage(periodStage),
      label: periodStage,
      label_localized: localizedVolumeStage(periodStage),
      relative_volume: Number.isFinite(relVolume) ? Number(relVolume.toFixed(2)) : null,
      turnover_rate: Number.isFinite(avgTurnover) ? Number(avgTurnover.toFixed(2)) : null,
      obv_trend: obvTrendValue,
      up_down_volume_ratio: Number.isFinite(upDownRatio) ? Number(upDownRatio.toFixed(2)) : null,
      summary: note,
    };
  };

  return {
    score,
    volume_signal_score: score,
    status: stage,
    status_label: localizedStage,
    label: stage,
    label_localized: localizedStage,
    behavior,
    behavior_label: behaviorSignal.label,
    behavior_key: behaviorSignal.key,
    volume_price_behavior_score: behaviorSignal.score,
    stage: localizedStage,
    money_flow_core_score: score,
    money_flow_core: {
      short_term: {
        score: shortScore,
        components: shortComponents,
        weights: {
          relative_volume: 25,
          turnover_rate: 25,
          close_location: 20,
          obv_trend: 20,
          volume_price_behavior: 10,
        },
      },
      mid_term: {
        score: midScore,
        components: midComponents,
        weights: {
          volume_20d_vs_60d: 25,
          turnover_20d_vs_60d: 20,
          obv_20d_60d: 25,
          up_volume_vs_down_volume: 20,
          volume_price_behavior: 10,
        },
      },
      long_term: {
        score: longScore,
        components: longComponents,
        weights: {
          obv_3m_6m: 35,
          volume_60d_120d_250d: 25,
          turnover_60d_120d: 20,
          accumulation_distribution: 20,
        },
      },
    },
    today_change_pct: move,
    today_volume: todayVolume,
    avg_volume_5d: avgVolume5d,
    avg_volume_10d: avgVolume10d,
    avg_volume_20d: avgVolume20d,
    avg_volume_50d: avgVolume50d,
    avg_volume_60d: avgVolume60d,
    avg_volume_120d: avgVolume120d,
    avg_volume_250d: avgVolume250d,
    average_volume: avgVolume20d,
    relative_volume_5d: Number.isFinite(relativeVolume5d) ? Number(relativeVolume5d.toFixed(2)) : null,
    relative_volume_20d: Number.isFinite(relativeVolume20d) ? Number(relativeVolume20d.toFixed(2)) : null,
    relative_volume_60d: Number.isFinite(relativeVolume60d) ? Number(relativeVolume60d.toFixed(2)) : null,
    relative_volume: Number.isFinite(relativeVolume20d) ? Number(relativeVolume20d.toFixed(2)) : null,
    float_shares: floatShares,
    shares_outstanding: sharesOutstanding,
    share_base_source: shareBaseSource,
    turnover_rate: Number.isFinite(turnoverRate) ? Number(turnoverRate.toFixed(2)) : null,
    avg_turnover_5d: Number.isFinite(avgTurnover5d) ? Number(avgTurnover5d.toFixed(2)) : null,
    avg_turnover_20d: Number.isFinite(avgTurnover20d) ? Number(avgTurnover20d.toFixed(2)) : null,
    avg_turnover_60d: Number.isFinite(avgTurnover60d) ? Number(avgTurnover60d.toFixed(2)) : null,
    avg_turnover_120d: Number.isFinite(avgTurnover120d) ? Number(avgTurnover120d.toFixed(2)) : null,
    obv: tech.obv ?? null,
    close_position: closePosition,
    close_location_pct: Number((closePosition * 100).toFixed(1)),
    obv_trend_5d: obvTrend5d,
    obv_trend_20d: obvTrend20d,
    obv_trend_60d: obvTrend60d,
    up_volume_20d: upDown20d.upVolume,
    down_volume_20d: upDown20d.downVolume,
    up_down_volume_ratio_20d: upDown20d.ratio,
    up_volume_60d: upDown60d.upVolume,
    down_volume_60d: upDown60d.downVolume,
    up_down_volume_ratio_60d: upDown60d.ratio,
    short_term_volume_signal: makePeriodSignal(
      "1-30 days",
      shortScore,
      relativeVolume5d ?? relativeVolume20d,
      turnoverRate,
      obvTrend5d,
      upDown20d.ratio,
      currentLanguage === "zh" ? "短期更重视当日量价、5/20日量比、换手率和 OBV。" : "Short term emphasizes daily price/volume, 5/20D relative volume, turnover, and OBV.",
    ),
    mid_term_volume_signal: makePeriodSignal(
      "1-3 months",
      midScore,
      relativeVolume20d ?? relativeVolume60d,
      avgTurnover20d,
      obvTrend20d,
      upDown60d.ratio,
      currentLanguage === "zh" ? "中期更重视20/60日量能、平均换手率和上涨/下跌成交量。" : "Mid term emphasizes 20/60D participation, average turnover, and up/down volume.",
    ),
    long_term_volume_signal: makePeriodSignal(
      "3-6 months",
      longScore,
      relativeVolume60d,
      avgTurnover60d,
      obvTrend60d,
      upDown60d.ratio,
      currentLanguage === "zh" ? "长期更重视60日以上资金趋势和持续性。" : "Long term emphasizes 60D+ participation trend and persistence.",
    ),
    confidence,
    missing_fields: missingFields,
    price_volume_pattern: behavior,
    summary: currentLanguage === "zh"
      ? `${localizedStage}：${behavior}。置信度 ${confidence}%`
      : `${stage}: ${behavior}. Confidence ${confidence}%`,
  };
}

function buildTechnicalModule(row, supportResistance, companyProfile = null) {
  const tech = row.technicals || {};
  const price = row.price ?? 0;
  const volumeConfirmation = buildVolumeConfirmation(row, companyProfile, supportResistance);
  const aboveMa20 = Number.isFinite(tech.ma20) && price > tech.ma20;
  const aboveMa50 = Number.isFinite(tech.ma50) && price > tech.ma50;
  const aboveMa200 = Number.isFinite(tech.ma200) && price > tech.ma200;
  const bullishMaStack = Number.isFinite(tech.ma10) && Number.isFinite(tech.ma20) && Number.isFinite(tech.ma50) && tech.ma10 > tech.ma20 && tech.ma20 > tech.ma50;
  const bearishMaStack = Number.isFinite(tech.ma10) && Number.isFinite(tech.ma20) && Number.isFinite(tech.ma50) && tech.ma10 < tech.ma20 && tech.ma20 < tech.ma50;
  const maStructureScore = bullishMaStack && aboveMa20 && aboveMa50
    ? 78
    : bearishMaStack && !aboveMa20 && !aboveMa50
      ? 28
      : Math.round(mean([
        aboveMa20 ? 62 : 38,
        aboveMa50 ? 66 : 34,
        aboveMa200 ? 70 : 36,
      ]) ?? 50);
  const macdScore = (tech.macd ?? 0) > 0 && (tech.macdHistogram ?? 0) > 0
    ? 72
    : (tech.macd ?? 0) < 0 && (tech.macdHistogram ?? 0) < 0
      ? 32
      : (tech.macdHistogram ?? 0) > 0
        ? 58
        : 45;
  const rsiValue = tech.rsi14 ?? 50;
  const rsiScore = !Number.isFinite(rsiValue)
    ? 50
    : rsiValue >= 50 && rsiValue <= 68
      ? 66
      : rsiValue > 75
        ? 45
        : rsiValue < 35
          ? 38
          : 52;
  const kdjJ = tech.kdj?.j ?? 50;
  const kdjScore = !Number.isFinite(kdjJ)
    ? 50
    : kdjJ >= 40 && kdjJ <= 78
      ? 60
      : kdjJ > 90
        ? 42
        : kdjJ < 20
          ? 40
          : 52;
  const priceTrendComponents = {
    ma_structure: maStructureScore,
    macd: macdScore,
    rsi: rsiScore,
    kdj: kdjScore,
  };
  const priceTrendConfirmScore = weightedComponentScore(priceTrendComponents, {
    ma_structure: 40,
    macd: 25,
    rsi: 20,
    kdj: 15,
  });
  const longTrendConfirmScore = Math.round(mean([
    aboveMa200 ? 74 : 34,
    Number.isFinite(tech.ma50) && Number.isFinite(tech.ma200) && tech.ma50 > tech.ma200 ? 70 : 38,
    maStructureScore,
    macdScore,
  ]) ?? priceTrendConfirmScore);
  const trendScore = priceTrendConfirmScore;

  const rsiState = (tech.rsi14 ?? 50) >= 72 ? "Overbought" : (tech.rsi14 ?? 50) <= 34 ? "Oversold" : (tech.rsi14 ?? 50) >= 55 ? "Healthy Bullish" : "Neutral";
  const kdjState = (tech.kdj?.j ?? 50) >= 85 ? "Overbought" : (tech.kdj?.j ?? 50) <= 20 ? "Oversold" : "Neutral";
  const volatilityScore = price >= (tech.middleBand ?? price) && price <= (tech.upperBand ?? price * 2)
    ? 60
    : price > (tech.upperBand ?? Number.POSITIVE_INFINITY)
      ? (volumeConfirmation.money_flow_core?.short_term?.score ?? 50) >= 70 ? 58 : 42
      : price < (tech.lowerBand ?? Number.NEGATIVE_INFINITY)
        ? 40
        : 50;
  const nearestSupport = supportResistance.supports?.[0];
  const nearestResistance = supportResistance.resistances?.[0];
  const nearSupport = nearestSupport?.price && Number.isFinite(price) ? Math.abs((price - nearestSupport.price) / Math.max(price, 1)) * 100 <= 3 : false;
  const nearResistance = nearestResistance?.price && Number.isFinite(price) ? Math.abs((nearestResistance.price - price) / Math.max(price, 1)) * 100 <= 3 : false;
  const supportResistanceScore = nearSupport && (volumeConfirmation.money_flow_core?.short_term?.score ?? 50) >= 45
    ? 66
    : nearResistance && (volumeConfirmation.money_flow_core?.short_term?.score ?? 50) < 65
      ? 38
      : Math.round(mean([
        nearestSupport?.score,
        nearestResistance?.score != null ? 100 - nearestResistance.score : null,
      ].filter(Number.isFinite)) ?? 52);
  const momentumScore = Math.round(mean([macdScore, rsiScore, kdjScore, volatilityScore]) ?? 50);
  const shortTechnicalScore = weightedComponentScore({
    money_flow_core: volumeConfirmation.money_flow_core.short_term.score,
    price_trend_confirm: priceTrendConfirmScore,
    support_resistance: supportResistanceScore,
    volatility_bollinger_atr: volatilityScore,
  }, {
    money_flow_core: 55,
    price_trend_confirm: 20,
    support_resistance: 15,
    volatility_bollinger_atr: 10,
  });
  const midTechnicalScore = weightedComponentScore({
    money_flow_core: volumeConfirmation.money_flow_core.mid_term.score,
    price_trend_confirm: priceTrendConfirmScore,
    support_resistance: supportResistanceScore,
    volatility_bollinger_atr: volatilityScore,
  }, {
    money_flow_core: 45,
    price_trend_confirm: 30,
    support_resistance: 15,
    volatility_bollinger_atr: 10,
  });
  const longTechnicalScore = weightedComponentScore({
    long_term_money_flow_obv: volumeConfirmation.money_flow_core.long_term.score,
    long_trend_confirm: longTrendConfirmScore,
    support_resistance: supportResistanceScore,
    volatility_regime: volatilityScore,
  }, {
    long_term_money_flow_obv: 35,
    long_trend_confirm: 40,
    support_resistance: 20,
    volatility_regime: 5,
  });
  const technicalScore = clamp(Math.round(shortTechnicalScore * 0.35 + midTechnicalScore * 0.35 + longTechnicalScore * 0.3), 0, 100);
  const summary = technicalScore >= 70
    ? (currentLanguage === "zh" ? "技术结构偏强，主要由量能/换手率和趋势验证共同支撑。" : "Technicals are constructive, led by money-flow confirmation and trend validation.")
    : technicalScore >= 55
      ? (currentLanguage === "zh" ? "技术面中性偏稳，仍需要量能或趋势给出更明确确认。" : "Technicals are stable, but need clearer money-flow or trend confirmation.")
      : (currentLanguage === "zh" ? "技术面偏弱，主要因为量能/换手率或趋势验证不足。" : "Technicals are weak mainly because money flow or trend validation is insufficient.");

  return {
    technical_score: technicalScore,
    technical_analysis: {
      money_flow_core_score: volumeConfirmation.money_flow_core_score,
      price_trend_confirm_score: priceTrendConfirmScore,
      long_trend_confirm_score: longTrendConfirmScore,
      volatility_score: volatilityScore,
      support_resistance_score: supportResistanceScore,
      final_technical_score: technicalScore,
      components: {
        price_trend_confirm: priceTrendComponents,
        money_flow_core: volumeConfirmation.money_flow_core,
      },
      short_term: {
        money_flow_core_score: volumeConfirmation.money_flow_core.short_term.score,
        price_trend_confirm_score: priceTrendConfirmScore,
        volatility_score: volatilityScore,
        support_resistance_score: supportResistanceScore,
        final_technical_score: shortTechnicalScore,
        weights: { money_flow_core: 55, price_trend_confirm: 20, support_resistance: 15, volatility_bollinger_atr: 10 },
      },
      mid_term: {
        money_flow_core_score: volumeConfirmation.money_flow_core.mid_term.score,
        price_trend_confirm_score: priceTrendConfirmScore,
        volatility_score: volatilityScore,
        support_resistance_score: supportResistanceScore,
        final_technical_score: midTechnicalScore,
        weights: { money_flow_core: 45, price_trend_confirm: 30, support_resistance: 15, volatility_bollinger_atr: 10 },
      },
      long_term: {
        long_term_money_flow_obv_score: volumeConfirmation.money_flow_core.long_term.score,
        long_trend_confirm_score: longTrendConfirmScore,
        support_resistance_score: supportResistanceScore,
        volatility_regime_score: volatilityScore,
        final_technical_score: longTechnicalScore,
        weights: { long_term_money_flow_obv: 35, long_trend_confirm: 40, support_resistance: 20, volatility_regime: 5 },
      },
    },
    trend_score: trendScore,
    momentum_score: momentumScore,
    volume_confirmation_score: volumeConfirmation.score,
    volume_signal_score: volumeConfirmation.score,
    short_term_signal: scoreBucketLabel(shortTechnicalScore),
    mid_term_signal: scoreBucketLabel(midTechnicalScore),
    long_term_signal: scoreBucketLabel(longTechnicalScore),
    trend: {
      state: trendScore >= 80 ? "Strong Bullish" : trendScore >= 65 ? "Bullish" : trendScore >= 45 ? "Neutral" : trendScore >= 30 ? "Bearish" : "Strong Bearish",
      ma10: tech.ma10 ?? null,
      ma20: tech.ma20 ?? null,
      ma50: tech.ma50 ?? null,
      ma100: tech.ma100 ?? null,
      ma200: tech.ma200 ?? null,
      macd: tech.macd ?? null,
      fibonacci: tech.fibPosition ?? null,
    },
    momentum: {
      state: momentumScore >= 70 ? "Healthy Bullish" : momentumScore >= 55 ? "Neutral" : momentumScore >= 35 ? "Weak Momentum" : "Oversold",
      rsi: tech.rsi14 ?? null,
      kdj: tech.kdj ?? null,
      macd_histogram: tech.macdHistogram ?? null,
      bollinger_position: price >= (tech.upperBand ?? Number.POSITIVE_INFINITY)
        ? "Upper Band"
        : price <= (tech.lowerBand ?? Number.NEGATIVE_INFINITY)
          ? "Lower Band"
          : currentLanguage === "zh" ? "中轨附近" : "Near middle band",
      rsi_state: rsiState,
      kdj_state: kdjState,
    },
    volume_confirmation: volumeConfirmation,
    volume_signal: volumeConfirmation,
    summary,
  };
}

function buildFundamentalModule(row, research) {
  const metrics = research.metrics || {};
  const quality = {
    score: research.qualityScore ?? 50,
    roe: metrics.roe ?? null,
    gross_margin: metrics.grossMargin ?? null,
    operating_margin: metrics.operatingMargin ?? null,
    net_margin: row.profile ? clamp((metrics.operatingMargin ?? 0) * 0.82, 0, 0.34) : null,
    debt_ratio: metrics.debtRatio ?? null,
    cash_ratio: metrics.cashReserve ?? null,
  };
  const growth = {
    score: research.growthScore ?? 50,
    revenue_growth: metrics.revenueGrowth ?? null,
    eps_growth: metrics.epsGrowth ?? null,
    free_cash_flow_growth: metrics.fcfGrowth ?? null,
    forward_guidance: metrics.guidance ?? null,
    analyst_growth_expectation: metrics.analystView ?? null,
  };
  const valuation = {
    score: research.valuationScore ?? 50,
    pe: metrics.pe ?? null,
    forward_pe: metrics.forwardPe ?? null,
    peg: metrics.peg ?? null,
    ps_ratio: metrics.psRatio ?? null,
    ev_ebitda: metrics.evEbitda ?? null,
    price_fcf: Number.isFinite(metrics.freeCashFlow) && Number.isFinite(row.marketCap) && metrics.freeCashFlow !== 0
      ? Math.abs((row.marketCap / 1e9) / metrics.freeCashFlow)
      : null,
    state: research.valuationState,
  };
  const financialHealthScore = clamp(Math.round(mean([
    metricScore(metrics.freeCashFlow ?? 0, -3, 8),
    metricScore((metrics.cashReserve ?? 0) * 100, 8, 45),
    inverseMetricScore((metrics.debtRatio ?? 0.6) * 100, 30, 80),
    metricScore((metrics.operatingMargin ?? 0) * 100, 6, 28),
  ]) ?? 50), 0, 100);
  const financialHealth = {
    score: financialHealthScore,
    free_cash_flow: metrics.freeCashFlow ?? null,
    cash_reserve: metrics.cashReserve ?? null,
    debt: metrics.debtRatio ?? null,
    capital_expenditure: row.profile ? clamp((row.profile.growth ?? 0.3) * 0.12, 0.02, 0.18) : null,
    cash_flow_stability: row.profile ? clamp((row.profile.cash ?? 0.2) * 100, 20, 90) : null,
  };
  const strengths = [];
  const risks = [];
  if ((quality.score ?? 0) >= 75) strengths.push(currentLanguage === "zh" ? "企业质量较高" : "Business quality is strong");
  if ((growth.score ?? 0) >= 70) strengths.push(currentLanguage === "zh" ? "成长仍在健康区间" : "Growth profile remains healthy");
  if ((metrics.freeCashFlow ?? 0) > 0) strengths.push(currentLanguage === "zh" ? "自由现金流为正" : "Free cash flow is positive");
  if ((valuation.score ?? 50) >= 60) strengths.push(currentLanguage === "zh" ? "估值处于更可接受区间" : "Valuation looks more reasonable");
  if ((valuation.score ?? 50) < 40) risks.push(currentLanguage === "zh" ? "估值偏高" : "Valuation remains rich");
  if ((metrics.freeCashFlow ?? 0) < 0) risks.push(currentLanguage === "zh" ? "自由现金流为负" : "Free cash flow is negative");
  if ((metrics.debtRatio ?? 0) > 0.62) risks.push(currentLanguage === "zh" ? "债务压力偏高" : "Debt load is elevated");
  if ((growth.score ?? 50) < 45) risks.push(currentLanguage === "zh" ? "成长兑现还不够强" : "Growth execution still looks soft");
  return {
    fundamental_score: research.fundamental ?? 50,
    quality,
    growth,
    valuation,
    financial_health: financialHealth,
    financial_health_score: financialHealthScore,
    summary: buildFundamentalConclusion(row, research),
    key_strengths: strengths.slice(0, 4),
    key_risks: risks.slice(0, 4),
  };
}

function strategyTone(action) {
  if (action === "Recommended") return "buy";
  if (action === "Avoid") return "sell";
  return "hold";
}

function dataUnavailableSource(missingSource, suggestedSource) {
  return {
    status: t("dataUnavailable"),
    missing_source: missingSource,
    suggested_source: suggestedSource,
  };
}

function buildShortSqueezeBlock(row) {
  const shortData = row.research?.shortInterest || row.shortInterest || row.profile?.shortInterest || {};
  const shortInterestPct = shortData.short_interest_percent_float ?? shortData.shortInterestPercentFloat ?? null;
  const shortInterestShares = shortData.short_interest_shares ?? shortData.shortInterestShares ?? null;
  const daysToCover = shortData.days_to_cover ?? shortData.daysToCover ?? null;
  const borrowFee = shortData.borrow_fee ?? shortData.borrowFee ?? null;
  const utilization = shortData.utilization ?? null;
  const floatShares = shortData.float ?? shortData.floatShares ?? null;
  const recentPriceMomentum = row.changePercent ?? null;
  const recentVolumeSpike = row.technicals?.volumeRatio ?? null;
  const hasCoreData = [shortInterestPct, shortInterestShares, daysToCover, borrowFee, utilization].some(Number.isFinite);

  if (!hasCoreData) {
    return {
      short_interest_pct_float: null,
      short_interest_shares: null,
      days_to_cover: null,
      borrow_fee: null,
      utilization: null,
      float: null,
      recent_price_momentum: recentPriceMomentum,
      recent_volume_spike: recentVolumeSpike,
      squeeze_risk: null,
      explanation: currentLanguage === "zh"
        ? "当前没有可用的卖空数据源，无法可靠判断逼空风险。"
        : "Short-interest feeds are unavailable, so squeeze risk cannot be judged reliably yet.",
      source_info: {
        short_interest: dataUnavailableSource("Nasdaq / FINRA / NYSE / Cboe", "Nasdaq Short Interest / FINRA / Fintel / Polygon"),
        borrow_fee: dataUnavailableSource("Prime broker / Fintel / Ortex", "Fintel / Ortex / Massive"),
      },
    };
  }

  let risk = "Low";
  if ((shortInterestPct ?? 0) > 30 || (((borrowFee ?? 0) > 20) && ((utilization ?? 0) > 85) && ((recentPriceMomentum ?? 0) > 3))) {
    risk = "Extreme";
  } else if ((shortInterestPct ?? 0) >= 15 || (((daysToCover ?? 0) > 5) && (((borrowFee ?? 0) > 8) || ((recentVolumeSpike ?? 0) >= 1.5)))) {
    risk = "High";
  } else if ((shortInterestPct ?? 0) >= 5 || (daysToCover ?? 0) >= 2 || (recentVolumeSpike ?? 0) >= 1.2) {
    risk = "Medium";
  }

  const explanationParts = [];
  if (Number.isFinite(shortInterestPct)) explanationParts.push(currentLanguage === "zh" ? `卖空占比 ${formatOneDecimal(shortInterestPct)}%` : `Short interest ${formatOneDecimal(shortInterestPct)}%`);
  if (Number.isFinite(daysToCover)) explanationParts.push(currentLanguage === "zh" ? `回补天数 ${formatOneDecimal(daysToCover)}` : `Days to cover ${formatOneDecimal(daysToCover)}`);
  if (Number.isFinite(borrowFee)) explanationParts.push(currentLanguage === "zh" ? `借券费率 ${formatOneDecimal(borrowFee)}%` : `Borrow fee ${formatOneDecimal(borrowFee)}%`);
  if (Number.isFinite(recentVolumeSpike)) explanationParts.push(currentLanguage === "zh" ? `量比 ${formatRatio(recentVolumeSpike)}` : `Relative volume ${formatRatio(recentVolumeSpike)}`);

  return {
    short_interest_pct_float: shortInterestPct,
    short_interest_shares: shortInterestShares,
    days_to_cover: daysToCover,
    borrow_fee: borrowFee,
    utilization,
    float: floatShares,
    recent_price_momentum: recentPriceMomentum,
    recent_volume_spike: recentVolumeSpike,
    squeeze_risk: risk,
    explanation: explanationParts.join(" · "),
    source_info: {
      short_interest: dataUnavailableSource("Nasdaq / FINRA / NYSE / Cboe", "Nasdaq Short Interest / FINRA / Fintel / Polygon"),
      borrow_fee: dataUnavailableSource("Prime broker / Fintel / Ortex", "Fintel / Ortex / Massive"),
    },
  };
}

function inferOptionStrikeStep(currentPrice, rawStrike) {
  const reference = Math.abs(Number.isFinite(rawStrike) ? rawStrike : currentPrice);
  if (reference < 25) return 0.5;
  if (reference < 200) return 1;
  if (reference < 500) return 2.5;
  if (reference < 1000) return 5;
  return 10;
}

function snapToOptionStrike(rawStrike, currentPrice) {
  if (!Number.isFinite(rawStrike)) return null;
  const step = inferOptionStrikeStep(currentPrice, rawStrike);
  const snapped = Math.round(rawStrike / step) * step;
  const decimals = step < 1 ? 1 : step === 2.5 ? 1 : 0;
  return Number(snapped.toFixed(decimals));
}

function choosePlanStrike(candidates, target, side, currentPrice) {
  const valid = candidates
    .filter((item) => Number.isFinite(item.price))
    .filter((item) => side === "put" ? item.price < currentPrice : item.price > currentPrice);
  if (!valid.length) return null;
  valid.sort((a, b) => Math.abs(a.price - target) - Math.abs(b.price - target));
  const chosen = valid[0];
  return {
    strike: snapToOptionStrike(chosen.price, currentPrice),
    sources: [...new Set(chosen.sources || [chosen.source].flat().filter(Boolean))],
  };
}

function buildOptionsStrategies(row, optionsRead, idealBuyZone, supportResistance, decisionHints = {}) {
  const shortTermRating = decisionHints.shortTermRating || "Hold";
  const longTermRating = decisionHints.longTermRating || "Hold";
  const tags = decisionHints.companyProfile?.tags || [];
  const price = row.price ?? 0;
  const buyZones = decisionHints.buyZones || {};
  const primaryZone = buyZones.primary_buy_zone || idealBuyZone;
  const deepZone = buyZones.deep_pullback_zone || {};
  const momentumZone = buyZones.momentum_entry_zone || {};
  const atr = Number.isFinite(row.technicals?.atr14) ? row.technicals.atr14 : Math.max(price * 0.035, 0.5);
  const ivRank = optionsRead.ivRank ?? null;
  const premiumWeak = Number.isFinite(ivRank) && ivRank < 30;
  const bearishShortTerm = ["Sell", "Strong Sell", "Short"].includes(shortTermRating);
  const bullishLongTerm = ["Buy", "Strong Buy"].includes(longTermRating);
  const volume = decisionHints.technical?.volume_confirmation || {};
  const volumeDistributionRisk = ["distribution_risk", "panic_selling"].includes(volume.behavior_key)
    || (["falling"].includes(volume.obv_trend_20d) && (volume.close_location_pct ?? 50) < 45);
  const strongVolumeBreakout = volume.behavior_key === "strong_accumulation" && (volume.relative_volume_20d ?? 0) >= 1.2;
  const speculativeProfile = hasAnyTag(tags, ["Speculative", "HighVolatility", "NewlyListed", "IPO", "Crypto", "StoryStock"]);
  const semAiProfile = hasAnyTag(tags, ["Semiconductor", "AIInfrastructure", "AI", "HighGrowth"]);
  const megaCashProfile = hasAnyTag(tags, ["MegaCap", "CashCow"]);
  const reitDividendProfile = hasAnyTag(tags, ["REIT", "Dividend", "InterestRateSensitive"]);

  if (!optionsRead.available) {
    const status = isCnAShare(row) ? "not_supported" : "unavailable";
    return {
      sell_put_plan: { status, plans: [] },
      covered_call_plan: { status, plans: [] },
      cash_secured_put: {
        recommendation: "Neutral",
        suggested_dte: t("dataUnavailable"),
        suggested_strike: null,
        assignment_risk: t("dataUnavailable"),
        suggested_zone: t("dataUnavailable"),
        premium_yield: null,
        reason: t("optionsUnavailable"),
      },
      covered_call: {
        recommendation: "Neutral",
        suggested_dte: t("dataUnavailable"),
        suggested_strike: null,
        assignment_risk: t("dataUnavailable"),
        suggested_zone: t("dataUnavailable"),
        premium_yield: null,
        reason: t("optionsUnavailable"),
      },
    };
  }

  const supportCandidates = [
    { price: supportResistance.supports[1]?.price, sources: ["S2", ...(supportResistance.supports[1]?.sources || supportResistance.supports[1]?.source || [])] },
    { price: supportResistance.supports[2]?.price, sources: ["S3", ...(supportResistance.supports[2]?.sources || supportResistance.supports[2]?.source || [])] },
    { price: supportResistance.supports[3]?.price, sources: ["S4", ...(supportResistance.supports[3]?.sources || supportResistance.supports[3]?.source || [])] },
    { price: optionsRead.putWall, sources: ["Put Wall"] },
    { price: primaryZone.low, sources: ["Primary Buy Zone"] },
    { price: primaryZone.high, sources: ["Primary Buy Zone"] },
    { price: deepZone.status === "available" ? deepZone.high : null, sources: ["Deep Pullback Zone"] },
    { price: price - atr, sources: ["ATR"] },
    { price: price - atr * 1.35, sources: ["ATR"] },
  ];
  const resistanceCandidates = [
    { price: supportResistance.resistances[1]?.price, sources: ["R2", ...(supportResistance.resistances[1]?.sources || supportResistance.resistances[1]?.source || [])] },
    { price: supportResistance.resistances[2]?.price, sources: ["R3", ...(supportResistance.resistances[2]?.sources || supportResistance.resistances[2]?.source || [])] },
    { price: supportResistance.resistances[3]?.price, sources: ["R4", ...(supportResistance.resistances[3]?.sources || supportResistance.resistances[3]?.source || [])] },
    { price: optionsRead.callWall, sources: ["Call Wall"] },
    { price: momentumZone.status === "available" ? momentumZone.high : null, sources: ["Momentum Entry Zone"] },
    { price: price + atr, sources: ["ATR"] },
    { price: price + atr * 1.35, sources: ["ATR"] },
  ];
  const putConservativeMultiplier = speculativeProfile
    ? 1.85
    : semAiProfile
      ? 1.45
      : reitDividendProfile
        ? 1.25
        : megaCashProfile
          ? 0.9
          : 1.15;
  const volumeRiskShift = volumeDistributionRisk ? 0.45 : 0;
  const put30Target = Number.isFinite(primaryZone.low)
    ? Math.min(primaryZone.low, price - atr * (0.65 + volumeRiskShift), price - atr * putConservativeMultiplier * 0.75)
    : price - atr * (putConservativeMultiplier + volumeRiskShift);
  const put45Target = Number.isFinite(deepZone.high)
    ? Math.min(deepZone.high, price - atr * (premiumWeak ? 1.15 : 1.45) * putConservativeMultiplier)
    : price - atr * (premiumWeak ? 1.15 : 1.45) * putConservativeMultiplier;
  const put30 = choosePlanStrike(supportCandidates, put30Target, "put", price);
  const put45 = choosePlanStrike(supportCandidates, put45Target, "put", price);
  const callDistanceBoost = (bullishLongTerm || semAiProfile || strongVolumeBreakout) ? 0.35 : 0;
  const weakBounceTighten = volume.behavior_key === "weak_breakout" || ((volume.relative_volume_20d ?? 1) < 0.9 && (row.changePercent ?? 0) > 0) ? -0.15 : 0;
  const call30 = choosePlanStrike(resistanceCandidates, price + atr * Math.max(0.85, (bullishLongTerm ? 1.25 : 1) + callDistanceBoost + weakBounceTighten), "call", price);
  const call45 = choosePlanStrike(resistanceCandidates, price + atr * Math.max(1.15, (bullishLongTerm ? 1.6 : 1.4) + callDistanceBoost), "call", price);
  const putRisk = bearishShortTerm || volumeDistributionRisk || speculativeProfile ? "high" : premiumWeak ? "medium" : "low";
  const callRisk = bullishLongTerm || strongVolumeBreakout || speculativeProfile ? "medium" : "low";
  const avoidSellPut = volumeDistributionRisk || (speculativeProfile && bearishShortTerm);
  const sellPutPlans = [put30, put45].map((plan, index) => ({
    dte: index === 0 ? 30 : 45,
    suggested_strike: plan?.strike ?? null,
    risk_level: putRisk,
    assignment_risk: bearishShortTerm || volumeDistributionRisk ? "high" : index === 0 ? "medium" : "low",
    reason: plan?.strike
      ? (currentLanguage === "zh"
        ? `${index === 0 ? "30D" : "45D"} 行权价低于现价，贴近 ${plan.sources.slice(0, 3).join(" / ")}，定位为相对保守、较低被行权概率方案。${premiumWeak ? " 当前 IV Rank 偏低，权利金环境较弱。" : ""}${bearishShortTerm ? " 短期趋势偏弱，Sell Put 需更保守。" : ""}${volumeDistributionRisk ? " 量能出现出货/弱承接，行权价已下移且风险提高。" : ""}${speculativeProfile ? " 投机/高波动画像要求更远 OTM。" : ""}`
        : `${index === 0 ? "30D" : "45D"} strike is below spot and near ${plan.sources.slice(0, 3).join(" / ")}, designed as a relatively conservative lower-assignment-probability setup.${premiumWeak ? " IV rank is low, so premium quality is weaker." : ""}${bearishShortTerm ? " Short-term trend risk argues for a more conservative put strike." : ""}${volumeDistributionRisk ? " Distribution / weak sponsorship shifts the strike lower and raises risk." : ""}${speculativeProfile ? " Speculative / high-volatility profile requires farther OTM strikes." : ""}`)
      : t("dataUnavailable"),
    sources: plan?.sources || [],
  }));
  const coveredCallPlans = [call30, call45].map((plan, index) => ({
    dte: index === 0 ? 30 : 45,
    suggested_strike: plan?.strike ?? null,
    risk_level: callRisk,
    assignment_risk: bullishLongTerm ? "medium" : "low",
    reason: plan?.strike
      ? (currentLanguage === "zh"
        ? `${index === 0 ? "30D" : "45D"} 行权价高于现价，贴近 ${plan.sources.slice(0, 3).join(" / ")}，用于较低被行权概率的 Covered Call。${bullishLongTerm || semAiProfile ? " 长期偏多/高成长画像，因此 strike 保持更远，避免过早限制上涨空间。" : ""}${strongVolumeBreakout ? " 量能强突破，Covered Call 更保守或上移。" : ""}${premiumWeak ? " 当前 IV Rank 偏低，权利金吸引力一般。" : ""}`
        : `${index === 0 ? "30D" : "45D"} strike is above spot and near ${plan.sources.slice(0, 3).join(" / ")}, intended as a lower-assignment-probability covered call.${bullishLongTerm || semAiProfile ? " Long-term / high-growth setup keeps the strike farther out." : ""}${strongVolumeBreakout ? " Strong volume breakout shifts covered calls farther out or conservative." : ""}${premiumWeak ? " Low IV rank makes premium less attractive." : ""}`)
      : t("dataUnavailable"),
    sources: plan?.sources || [],
  }));
  const cspStrike = sellPutPlans[0]?.suggested_strike ?? null;
  const ccStrike = coveredCallPlans[0]?.suggested_strike ?? null;
  const cspRecommended = Boolean(cspStrike) && !bearishShortTerm && !avoidSellPut && ratingAtLeast(longTermRating, "Hold");
  const ccRecommended = Boolean(ccStrike) && shortTermRating !== "Strong Buy" && !strongVolumeBreakout;

  return {
    sell_put_plan: {
      status: "available",
      plans: sellPutPlans,
    },
    covered_call_plan: {
      status: "available",
      plans: coveredCallPlans,
    },
    cash_secured_put: {
      recommendation: cspRecommended ? "Recommended" : (avoidSellPut || speculativeProfile || bearishShortTerm) ? "Avoid" : ratingAtLeast(longTermRating, "Buy") ? "Neutral" : "Avoid",
      suggested_dte: "30D / 45D",
      suggested_strike: Number.isFinite(cspStrike) ? cspStrike : null,
      strike_distance_pct: Number.isFinite(cspStrike) && row.price ? Number((((row.price - cspStrike) / row.price) * 100).toFixed(1)) : null,
      ideal_buy_zone_relation: Number.isFinite(cspStrike) && cspStrike >= primaryZone.low && cspStrike <= primaryZone.high
        ? (currentLanguage === "zh" ? "位于主要买入区内" : "Inside the Primary Buy Zone")
        : (currentLanguage === "zh" ? "低于主要买入区，偏保守" : "Below the Primary Buy Zone, more conservative"),
      support_relation: supportResistance.supports[1]?.price
        ? `${supportResistance.supports[1].level} ${formatCurrency(supportResistance.supports[1].price, row.currencyCode)}`
        : t("dataUnavailable"),
      premium_yield: null,
      assignment_risk: cspRecommended ? (currentLanguage === "zh" ? "中等" : "Medium") : (currentLanguage === "zh" ? "偏高" : "Elevated"),
      reason: cspRecommended
        ? (currentLanguage === "zh" ? "行权价低于现价并靠近支撑 / Put Wall / ATR，属于相对保守的 Sell Put 方案。" : "The strike is below spot and anchored to support / put wall / ATR for a relatively conservative sell-put setup.")
        : avoidSellPut
          ? (currentLanguage === "zh" ? "量能出货/弱承接或短期趋势偏弱，Sell Put 暂时回避。" : "Distribution / weak sponsorship or bearish short-term trend makes sell puts unattractive for now.")
          : ratingAtLeast(longTermRating, "Buy")
          ? (currentLanguage === "zh" ? "长期逻辑仍成立，但当前行权价和理想埋伏区还不够贴近，先保持中性。" : "The long-term thesis still works, but the strike is not close enough to the ideal buy zone yet.")
          : (currentLanguage === "zh" ? "中长期条件还不够扎实，Sell Put 先回避。" : "The mid / long-term setup is not stable enough for a cash-secured put yet."),
    },
    covered_call: {
      recommendation: longTermRating === "Strong Buy" || strongVolumeBreakout ? "Avoid" : ccRecommended ? "Recommended" : "Neutral",
      suggested_dte: "30D / 45D",
      suggested_strike: Number.isFinite(ccStrike) ? ccStrike : null,
      strike_distance_pct: Number.isFinite(ccStrike) && row.price ? Number((((ccStrike - row.price) / row.price) * 100).toFixed(1)) : null,
      resistance_relation: supportResistance.resistances[1]?.price
        ? `${supportResistance.resistances[1].level} ${formatCurrency(supportResistance.resistances[1].price, row.currencyCode)}`
        : t("dataUnavailable"),
      call_wall_relation: Number.isFinite(optionsRead.callWall) ? formatCurrency(optionsRead.callWall, row.currencyCode) : t("dataUnavailable"),
      premium_yield: null,
      assignment_risk: ccRecommended ? (currentLanguage === "zh" ? "较低" : "Low") : (currentLanguage === "zh" ? "中等" : "Medium"),
      reason: longTermRating === "Strong Buy" || strongVolumeBreakout
        ? (currentLanguage === "zh" ? "长期趋势或量能突破较强，过早卖 Covered Call 可能限制上涨空间。" : "Long-term upside or volume breakout looks strong, so a covered call can cap gains too early.")
        : ccRecommended
          ? (currentLanguage === "zh" ? "行权价高于现价并参考压力位 / Call Wall / ATR，更适合持仓收租。" : "The strike is above spot and references resistance / call wall / ATR, which fits income harvesting.")
          : (currentLanguage === "zh" ? "当前压力位还不够清晰，或者趋势仍偏强，Covered Call 先保持中性。" : "Resistance is not clean enough yet or upside still looks too strong, so covered calls stay neutral."),
    },
  };
}

function buildOptionsModule(row, supportResistance, idealBuyZone, decisionHints = {}) {
  if (isCnAShare(row)) {
    const shortSqueeze = buildShortSqueezeBlock(row);
    return {
      status: "not_supported",
      options_score: 50,
      put_wall: null,
      call_wall: null,
      gamma_flip: null,
      net_gex: null,
      implied_volatility: null,
      historic_volatility: null,
      iv_percentile: null,
      iv_rank: null,
      max_pain: null,
      options_flow: null,
      sell_put_plan: { status: "not_supported", plans: [] },
      covered_call_plan: { status: "not_supported", plans: [] },
      cash_secured_put: { recommendation: "Neutral", suggested_dte: null, suggested_strike: null, assignment_risk: null, suggested_zone: null, premium_yield: null, reason: currentLanguage === "zh" ? "该市场暂不支持期权结构分析。" : "Options structure analysis is not supported for this market." },
      covered_call: { recommendation: "Neutral", suggested_dte: null, suggested_strike: null, assignment_risk: null, suggested_zone: null, premium_yield: null, reason: currentLanguage === "zh" ? "该市场暂不支持期权策略分析。" : "Options strategy analysis is not supported for this market." },
      short_squeeze: shortSqueeze,
      summary: currentLanguage === "zh" ? "该市场暂不支持期权结构分析。" : "Options structure analysis is not supported for this market.",
    };
  }
  const optionsRead = row.research?.optionsRead || buildOptionsRead(row);
  const strategies = buildOptionsStrategies(row, optionsRead, idealBuyZone, supportResistance, decisionHints);
  const score = !optionsRead.available ? 50 : clamp(50 + optionsRead.scoreAdjustment * 4, 20, 85);
  return {
    status: optionsRead.available ? "available" : "unavailable",
    options_score: score,
    put_wall: optionsRead.available ? optionsRead.putWall : null,
    call_wall: optionsRead.available ? optionsRead.callWall : null,
    gamma_flip: optionsRead.available ? optionsRead.gammaFlip : null,
    net_gex: optionsRead.available ? optionsRead.netGex : null,
    implied_volatility: optionsRead.impliedVolatility,
    historic_volatility: optionsRead.historicVolatility,
    iv_percentile: optionsRead.ivPercentile,
    iv_rank: optionsRead.ivRank,
    max_pain: null,
    options_flow: null,
    sell_put_plan: strategies.sell_put_plan,
    covered_call_plan: strategies.covered_call_plan,
    cash_secured_put: strategies.cash_secured_put,
    covered_call: strategies.covered_call,
    short_squeeze: buildShortSqueezeBlock(row),
    summary: optionsRead.summary,
  };
}

function marketEventLabel(type) {
  const map = {
    fed_rate_hike: currentLanguage === "zh" ? "美联储加息" : "Fed Rate Hike",
    fed_rate_cut: currentLanguage === "zh" ? "美联储降息" : "Fed Rate Cut",
    fed_hawkish: currentLanguage === "zh" ? "美联储偏鹰" : "Fed Hawkish",
    fed_dovish: currentLanguage === "zh" ? "美联储偏鸽" : "Fed Dovish",
    cpi_hot: currentLanguage === "zh" ? "通胀偏热" : "Hot CPI",
    cpi_cool: currentLanguage === "zh" ? "通胀降温" : "Cool CPI",
    jobs_hot: currentLanguage === "zh" ? "就业偏热" : "Hot Jobs",
    jobs_weak: currentLanguage === "zh" ? "就业转弱" : "Weak Jobs",
    tariff_risk: currentLanguage === "zh" ? "关税风险" : "Tariff Risk",
    war_geopolitical_risk: currentLanguage === "zh" ? "地缘风险" : "Geopolitical Risk",
    oil_price_spike: currentLanguage === "zh" ? "油价冲击" : "Oil Price Spike",
    bank_stress: currentLanguage === "zh" ? "银行压力" : "Bank Stress",
    government_shutdown: currentLanguage === "zh" ? "政府停摆风险" : "Government Shutdown",
    debt_ceiling_risk: currentLanguage === "zh" ? "债务上限风险" : "Debt Ceiling Risk",
  };
  return map[type] || type || t("dataUnavailable");
}

function marketRegimeLabel(regime) {
  if (regime === "risk_on") return currentLanguage === "zh" ? "偏进攻" : "Risk-On";
  if (regime === "risk_off") return currentLanguage === "zh" ? "偏防守" : "Risk-Off";
  return currentLanguage === "zh" ? "中性" : "Neutral";
}

function hasAnyTag(tags = [], candidates = []) {
  return candidates.some((tag) => tags.includes(tag));
}

function midFearGreedContribution(label) {
  if (label === "Extreme Fear") return -2;
  if (label === "Fear") return -1;
  if (label === "Greed") return -1;
  if (label === "Extreme Greed") return -3;
  return 0;
}

function marketRateSensitivity(companyProfile, row, engine, horizon) {
  const tags = companyProfile.tags || [];
  const metadataBlob = `${row.metadata?.sector || ""} ${row.metadata?.industry || ""}`.toLowerCase();
  const ratePressureActive =
    engine.ten_year_yield?.trend === "rising"
    || (engine.ten_year_yield?.change_5d_bps ?? 0) >= 10
    || (engine.ten_year_yield?.change_20d_bps ?? 0) >= 25;
  if (!ratePressureActive) {
    return { multiplier: 1, reason: null };
  }
  if (hasAnyTag(tags, ["REIT", "Dividend", "InterestRateSensitive"])) {
    return {
      multiplier: horizon === "short" ? 1.45 : horizon === "mid" ? 1.5 : 1.35,
      reason: currentLanguage === "zh"
        ? "REIT / 分红 / 利率敏感类型会放大利率环境影响。"
        : "REIT, dividend, and rate-sensitive profiles amplify the rates backdrop.",
    };
  }
  if (hasAnyTag(tags, ["HighMultiple", "Growth", "HighGrowth", "StoryStock", "Speculative", "UnprofitableGrowth"])) {
    return {
      multiplier: horizon === "short" ? 1.35 : horizon === "mid" ? 1.3 : 1.2,
      reason: currentLanguage === "zh"
        ? "高估值 / 成长 / 叙事股会放大利率与 Fed 影响。"
        : "High-multiple and growth profiles amplify Fed and yield sensitivity.",
    };
  }
  if (hasAnyTag(tags, ["MegaCap", "CashCow"])) {
    return {
      multiplier: horizon === "short" ? 0.75 : horizon === "mid" ? 0.8 : 0.65,
      reason: currentLanguage === "zh"
        ? "Mega Cap / Cash Cow 现金流更稳，对利率扰动相对更钝化。"
        : "Mega-cap and cash-cow profiles absorb rate shocks better than average.",
    };
  }
  if (/financial|bank|insurance|capital markets/.test(metadataBlob)) {
    return {
      multiplier: 0.95,
      reason: currentLanguage === "zh"
        ? "金融类公司对利率影响并不总是单边负面。"
        : "Financials do not react to rates in a purely negative way.",
    };
  }
  return { multiplier: 1, reason: null };
}

function marketProfileSpecialAdjustment(companyProfile, row, engine, horizon) {
  const tags = companyProfile.tags || [];
  const metadataBlob = `${row.metadata?.sector || ""} ${row.metadata?.industry || ""}`.toLowerCase();
  const vixShock = (engine.vix?.change_5d ?? 0) >= 2 || (engine.vix?.trend === "rising" && (engine.vix?.value ?? 0) >= 20);
  const risingYield = engine.ten_year_yield?.trend === "rising" || (engine.ten_year_yield?.change_5d_bps ?? 0) >= 10;
  let delta = 0;
  const reasons = [];

  if (/financial|bank|insurance|capital markets/.test(metadataBlob) && risingYield) {
    if (!vixShock) {
      delta += horizon === "long" ? 1 : 2;
      reasons.push(currentLanguage === "zh" ? "利率上升对金融股可能略有利，但在高波动环境下不会激进加分。" : "Higher rates can modestly help financials unless volatility is also spiking.");
    } else {
      delta -= 1;
      reasons.push(currentLanguage === "zh" ? "虽然利率上升可能利好净息差，但 VIX 上行意味着风险偏好下降。" : "Rates may help margins, but rising VIX offsets that benefit for financials.");
    }
  }

  return { delta, reasons };
}

function buildMarketContextHorizonBreakdown(horizon, companyProfile, row, engine, broadMacroNews) {
  const base = 50;
  const breakdown = engine.breakdown || {};
  const fearGreedContribution = horizon === "short"
    ? (breakdown.fear_greed_short ?? 0)
    : horizon === "mid"
      ? midFearGreedContribution(engine.fear_greed?.label)
      : (breakdown.fear_greed_long ?? 0);
  const rawYield = Number(breakdown.ten_year_yield ?? 0);
  const rawFed = 0;
  const sensitivity = marketRateSensitivity(companyProfile, row, engine, horizon);
  const rawRateBlock = rawYield + rawFed;
  const adjustedRateBlock = Number((rawRateBlock * sensitivity.multiplier).toFixed(1));
  const profileMultiplierDelta = Number((adjustedRateBlock - rawRateBlock).toFixed(1));
  const specialProfile = marketProfileSpecialAdjustment(companyProfile, row, engine, horizon);
  const macroNewsContribution = 0;
  const score = Math.round(clamp(
    base
      + Number(breakdown.vix ?? 0)
      + Number(breakdown.vix_momentum ?? 0)
      + fearGreedContribution
      + adjustedRateBlock
      + Number(breakdown.equity_trend ?? 0)
      + macroNewsContribution
      + specialProfile.delta,
    20,
    92,
  ));

  const reasons = [];
  if ((breakdown.vix ?? 0) < 0 || (breakdown.vix_momentum ?? 0) < 0) reasons.push(engine.vix?.impact);
  if (fearGreedContribution !== 0 && engine.fear_greed?.impact) reasons.push(engine.fear_greed.impact);
  if (rawRateBlock !== 0 && engine.ten_year_yield?.impact) reasons.push(engine.ten_year_yield.impact);
  if ((breakdown.equity_trend ?? 0) !== 0 && engine.equity_trend?.summary) reasons.push(engine.equity_trend.summary);
  if (sensitivity.reason && profileMultiplierDelta !== 0) reasons.push(sensitivity.reason);
  reasons.push(...specialProfile.reasons);

  return {
    base,
    vix: Number(breakdown.vix ?? 0),
    vix_momentum: Number(breakdown.vix_momentum ?? 0),
    fear_greed: fearGreedContribution,
    ten_year_yield: rawYield,
    fed_event: rawFed,
    equity_trend: Number(breakdown.equity_trend ?? 0),
    macro_news: macroNewsContribution,
    profile_multiplier: sensitivity.multiplier,
    profile_multiplier_delta: profileMultiplierDelta,
    profile_adjustment: specialProfile.delta,
    profile_reason: [sensitivity.reason, ...specialProfile.reasons].filter(Boolean).join(" · "),
    final_score: score,
    reason: [...new Set(reasons.filter(Boolean))].slice(0, 4).join(" · "),
  };
}

function buildMarketContextModule(row, companyProfile) {
  if (isCnAShare(row)) {
    return {
      status: "not_supported",
      market_context_score: 50,
      macro_score: 50,
      sector_score: companyProfile.tags?.length ? 58 : 50,
      news_score: 50,
      institutional_score: 50,
      market_regime: {
        score: 50,
        regime: "neutral",
        confidence: 45,
        summary: currentLanguage === "zh" ? "市场环境数据暂未接入 A股模型。" : "Market context data is not connected to the A-share model yet.",
      },
      horizon_scores: { short: 50, mid: 50, long: 50 },
      horizon_breakdown: {
        short: { base: 50, final_score: 50, reason: currentLanguage === "zh" ? "A股不使用美股宏观数据评分。" : "A-share scoring does not use US macro data." },
        mid: { base: 50, final_score: 50, reason: currentLanguage === "zh" ? "A股不使用美股宏观数据评分。" : "A-share scoring does not use US macro data." },
        long: { base: 50, final_score: 50, reason: currentLanguage === "zh" ? "A股不使用美股宏观数据评分。" : "A-share scoring does not use US macro data." },
      },
      strategy_impact: null,
      market_engine: {
        score: 50,
        regime: "neutral",
        confidence: 45,
        vix: null,
        fear_greed: null,
        ten_year_yield: null,
        equity_trend: null,
      },
      macro: {},
      broad_macro_news: null,
      sector_theme: {
        tags: companyProfile.tags_label?.slice(0, 5) || [],
        summary: companyProfile.tags_label?.length ? companyProfile.tags_label.slice(0, 5).join(" / ") : t("dataUnavailable"),
      },
      news_sentiment: null,
      institutional_insider: null,
      summary: currentLanguage === "zh" ? "市场环境数据暂未接入 A股模型。" : "Market context data is not connected to the A-share model yet.",
      risks: [],
    };
  }
  const snapshotContext = row.globalMarketContext || {};
  const sectorTheme = companyProfile.tags_label.slice(0, 5);
  const risks = [];
  if (companyProfile.tags.includes("InterestRateSensitive")) risks.push(currentLanguage === "zh" ? "对利率预期较敏感" : "Sensitive to rate expectations");
  if (companyProfile.tags.includes("Crypto")) risks.push(currentLanguage === "zh" ? "受监管和加密市场情绪影响" : "Exposed to regulation and crypto sentiment");
  if (companyProfile.tags.includes("Speculative")) risks.push(currentLanguage === "zh" ? "波动率较高，情绪驱动更强" : "Higher volatility and sentiment sensitivity");
  const broadMacroNews = snapshotContext.broad_macro_news || {
    score: 50,
    sentiment: null,
    major_events: [],
    summary: currentLanguage === "zh"
      ? "大环境新闻源暂不可用，当前先按中性处理。"
      : "Broad macro-news feeds are unavailable, so the model stays neutral for now.",
    source_info: dataUnavailableSource(
      "Broad market news feed",
      "Google News RSS / Reuters / FMP Market News / Alpha Vantage News",
    ),
  };
  const macro = snapshotContext.macro || {
    vix: null,
    fear_greed: null,
    treasury_yield: null,
    fed_funds_rate: null,
    fomc_rate_path: null,
    score: 50,
    summary: currentLanguage === "zh"
      ? "VIX、恐惧贪婪和利率数据暂不可用，宏观评分按中性处理。"
      : "VIX, Fear & Greed, and yields are unavailable, so macro is treated as neutral.",
    source_info: {
      vix: dataUnavailableSource("Cboe / FRED / Yahoo Finance", "Cboe / FRED VIXCLS / Yahoo Finance"),
      fear_greed: dataUnavailableSource("CNN Fear & Greed feed", "CNN Fear & Greed direct endpoint / CNN scraper / RapidAPI / custom in-house sentiment composite."),
      treasury_yield: dataUnavailableSource("FRED / Alpha Vantage Treasury Yield", "FRED / Alpha Vantage / Yahoo Finance ^TNX"),
      fed_funds_rate: dataUnavailableSource("FRED DFF / FEDFUNDS", "FRED DFF / FEDFUNDS"),
      fomc_rate_path: dataUnavailableSource("Federal Reserve / FRED", "Federal Reserve FOMC / FRED DFF"),
    },
  };
  const engine = snapshotContext.market_context || {
    score: neutralScore(macro.score ?? null),
    regime: "neutral",
    confidence: 50,
    vix: {
      value: macro.vix ?? null,
      change_5d: null,
      change_20d: null,
      trend: "neutral",
      impact: macro.vix == null
        ? (currentLanguage === "zh" ? "数据暂不可用" : "Data unavailable")
        : (currentLanguage === "zh" ? "波动率暂时中性" : "Volatility is neutral"),
    },
    fear_greed: {
      value: macro.fear_greed ?? null,
      label: null,
      trend: null,
      impact: macro.fear_greed == null
        ? (currentLanguage === "zh" ? "数据暂不可用" : "Data unavailable")
        : (currentLanguage === "zh" ? "情绪暂时中性" : "Sentiment is neutral"),
    },
    ten_year_yield: {
      value: macro.treasury_yield ?? null,
      change_5d_bps: null,
      change_20d_bps: null,
      trend: "neutral",
      impact: macro.treasury_yield == null
        ? (currentLanguage === "zh" ? "数据暂不可用" : "Data unavailable")
        : (currentLanguage === "zh" ? "利率环境暂时中性" : "Yield backdrop is neutral"),
    },
    fed_event: {
      active: false,
      type: null,
      severity: null,
      summary: currentLanguage === "zh" ? "最近没有激活的 Fed / 宏观事件。" : "No active Fed or macro event is configured.",
    },
    equity_trend: {
      spy: null,
      qqq: null,
      summary: currentLanguage === "zh" ? "指数趋势数据暂不可用。" : "Index-trend data is unavailable.",
      impact: "neutral",
    },
    breakdown: {
      base: 50,
      vix: 0,
      vix_momentum: 0,
      fear_greed_short: 0,
      fear_greed_long: 0,
      ten_year_yield: 0,
      fed_event_short: 0,
      fed_event_mid: 0,
      fed_event_long: 0,
      equity_trend: 0,
      macro_news: 0,
      final_score: neutralScore(macro.score ?? null),
    },
    strategy_impact: {
      buy_stock: currentLanguage === "zh" ? "中性" : "Neutral",
      sell_put: currentLanguage === "zh" ? "中性" : "Neutral",
      covered_call: currentLanguage === "zh" ? "中性" : "Neutral",
      wait_no_action: currentLanguage === "zh" ? "中性" : "Neutral",
    },
    summary: macro.summary || (currentLanguage === "zh" ? "市场环境按中性处理。" : "Market context stays neutral."),
    source_info: {
      vix: macro.source_info?.vix,
      fear_greed: macro.source_info?.fear_greed,
      ten_year_yield: macro.source_info?.treasury_yield,
      fed_event: macro.source_info?.market_events,
      equity_trend: macro.source_info?.equity_trend,
    },
  };
  const companyNews = row.companyNews || {
    sentiment: null,
    score: 50,
    summary: t("dataUnavailable"),
    key_points: [],
    latest_news: [],
    bullish_news: [],
    bearish_news: [],
    key_catalysts: [],
    risk_events: [],
    source_info: dataUnavailableSource(
      "Company news feed",
      "Google News RSS / Yahoo Finance / FMP / Polygon",
    ),
  };
  const institutionalInsider = snapshotContext.institutional_insider || {
    insider_trading: null,
    hedge_fund_13f: {
      added_funds: null,
      reduced_funds: null,
      sold_out_funds: null,
      short_funds: null,
      report_date: null,
    },
    analyst_rating_changes: null,
    summary: currentLanguage === "zh" ? "13F 主要跟踪上个季度机构是加仓、减持、清仓还是做空；当前数据源暂不可用。" : "13F tracks whether funds added, reduced, sold out, or shorted the stock last quarter; the feed is unavailable right now.",
    source_info: {
      insider: dataUnavailableSource("SEC Form 4 / sec-api.io", "SEC Insider Transactions / sec-api.io"),
      thirteen_f: dataUnavailableSource("SEC EDGAR 13F / sec-api.io", "SEC EDGAR 13F / FMP institutional ownership"),
    },
  };
  const shortBreakdown = buildMarketContextHorizonBreakdown("short", companyProfile, row, engine, broadMacroNews);
  const midBreakdown = buildMarketContextHorizonBreakdown("mid", companyProfile, row, engine, broadMacroNews);
  const longBreakdown = buildMarketContextHorizonBreakdown("long", companyProfile, row, engine, broadMacroNews);
  const newsScore = neutralScore(companyNews.score ?? null);
  const institutionalScore = neutralScore(null);
  const sectorScore = sectorTheme.length ? 58 : 50;
  const marketContextScore = Math.round(mean([shortBreakdown.final_score, midBreakdown.final_score, longBreakdown.final_score]) ?? neutralScore(engine.score ?? macro.score ?? null));
  const macroScore = marketContextScore;
  const strategyImpact = {
    buy_stock: engine.strategy_impact?.buy_stock || (currentLanguage === "zh" ? "中性" : "Neutral"),
    sell_put: engine.strategy_impact?.sell_put || (currentLanguage === "zh" ? "中性" : "Neutral"),
    covered_call: engine.strategy_impact?.covered_call || (currentLanguage === "zh" ? "中性" : "Neutral"),
    wait_no_action: engine.strategy_impact?.wait_no_action || (currentLanguage === "zh" ? "中性" : "Neutral"),
  };
  if (engine.regime === "risk_off" && hasAnyTag(companyProfile.tags, ["REIT", "Dividend", "InterestRateSensitive", "HighMultiple", "Growth", "StoryStock", "Speculative"])) {
    strategyImpact.sell_put = currentLanguage === "zh"
      ? `${strategyImpact.sell_put} 对利率敏感 / 高估值类型建议更低 strike、更短 DTE。`
      : `${strategyImpact.sell_put} For rate-sensitive and high-multiple names, use lower strikes and shorter DTE.`;
  }
  if (engine.fed_event?.active && ["fed_rate_hike", "fed_hawkish"].includes(engine.fed_event.type)) {
    strategyImpact.sell_put = currentLanguage === "zh"
      ? `${strategyImpact.sell_put} 需要明确显示利率风险。`
      : `${strategyImpact.sell_put} Rate risk should be called out explicitly.`;
  }
  const summaryParts = [];
  if (engine.summary) summaryParts.push(engine.summary);
  if (!summaryParts.length && sectorTheme.length) {
    summaryParts.push(currentLanguage === "zh" ? `当前主要主题：${sectorTheme.join("、")}` : `Key themes: ${sectorTheme.join(", ")}`);
  }

  return {
    market_context_score: marketContextScore,
    macro_score: macroScore,
    sector_score: sectorScore,
    news_score: newsScore,
    institutional_score: institutionalScore,
    market_regime: {
      score: macroScore,
      regime: engine.regime || "neutral",
      confidence: engine.confidence ?? 50,
      summary: engine.summary || macro.summary || t("dataUnavailable"),
    },
    horizon_scores: {
      short: shortBreakdown.final_score,
      mid: midBreakdown.final_score,
      long: longBreakdown.final_score,
    },
    horizon_breakdown: {
      short: shortBreakdown,
      mid: midBreakdown,
      long: longBreakdown,
    },
    strategy_impact: strategyImpact,
    market_engine: engine,
    macro,
    broad_macro_news: broadMacroNews,
    sector_theme: {
      tags: sectorTheme,
      summary: sectorTheme.length
        ? (currentLanguage === "zh" ? `当前主要主题：${sectorTheme.join("、")}` : `Key themes: ${sectorTheme.join(", ")}`)
        : t("dataUnavailable"),
    },
    news_sentiment: companyNews,
    institutional_insider: institutionalInsider,
    summary: summaryParts.join(" · ") || t("dataUnavailable"),
    risks: [...new Set(risks)].slice(0, 4),
  };
}

function buildHardBearishOverride(row, modules, supportResistance, idealBuyZone) {
  const reasonItems = [];
  const pushReason = (category, text) => {
    reasonItems.push({ category, text });
  };
  const price = row.price ?? null;
  const ma20 = row.technicals?.ma20 ?? null;
  const ma50 = row.technicals?.ma50 ?? null;
  const ma200 = row.technicals?.ma200 ?? null;
  const macd = row.technicals?.macd ?? null;
  const macdHistogram = row.technicals?.macdHistogram ?? null;
  const currentPriceInZone = isPriceInsideIdealBuyZone(price, idealBuyZone);
  const lowerSupportsBroken = supportResistance.supports.slice(0, 2).filter((level) => Number.isFinite(level?.price) && price < level.price * 0.985).length;

  if (row.noData) pushReason("data_quality", currentLanguage === "zh" ? "当前市场数据质量异常，无法正常判断。" : "Current market data quality is too weak for a reliable read.");
  if ((modules.fundamental.fundamental_score ?? 50) <= 22) pushReason("fundamental", currentLanguage === "zh" ? "基本面评分极弱。" : "Fundamental score is extremely weak.");
  if ((modules.fundamental.financial_health?.free_cash_flow ?? 0) < -3 && (modules.fundamental.quality?.score ?? 50) < 35) {
    pushReason("fundamental", currentLanguage === "zh" ? "现金流明显恶化且企业质量偏弱。" : "Cash flow has deteriorated sharply and business quality is weak.");
  }
  if (Number.isFinite(price) && Number.isFinite(ma200) && Number.isFinite(ma50) && price < ma200 * 0.92 && price < ma50 * 0.95) {
    pushReason("technical", currentLanguage === "zh" ? "价格明显跌破 MA200 和 MA50，长期趋势恶化。" : "Price is materially below MA200 and MA50, signaling a broken long-term trend.");
  }
  if (Number.isFinite(ma20) && Number.isFinite(ma50) && Number.isFinite(ma200) && ma20 < ma50 && ma50 < ma200) {
    pushReason("technical", currentLanguage === "zh" ? "均线空头排列仍然成立。" : "Moving averages remain in a bearish alignment.");
  }
  if ((modules.market_context.market_regime?.regime === "risk_off") && (modules.market_context.market_context_score ?? 50) <= 40) {
    pushReason("market_context", currentLanguage === "zh" ? "市场环境明显偏防守。" : "The market-context regime is clearly risk-off.");
  }
  if ((modules.options.options_score ?? 50) <= 25 && !currentPriceInZone) {
    pushReason("options", currentLanguage === "zh" ? "期权结构明显偏空。" : "Options structure is extremely bearish.");
  }
  if (lowerSupportsBroken >= 2) {
    pushReason("technical", currentLanguage === "zh" ? "价格已经跌破主要支撑区。" : "Price has already broken below key support zones.");
  }
  const nonTechnicalCount = reasonItems.filter((item) => item.category !== "technical" && item.category !== "options").length;
  return {
    active: reasonItems.length >= 3 && nonTechnicalCount >= 1,
    reasons: reasonItems.map((item) => item.text).slice(0, 4),
  };
}

function supportConfluenceBonus(row, idealBuyZone, supportResistance, modules, hardBearishOverride) {
  if (hardBearishOverride?.active) return 0;
  const price = row.price ?? null;
  if (!Number.isFinite(price)) return 0;
  let bonus = 0;
  const strongestSupport = supportResistance.supports.find((level) => level.strength === "strong") || supportResistance.supports[0];
  const nearStrongSupport = strongestSupport?.price != null && Math.abs((price - strongestSupport.price) / Math.max(price, 1)) * 100 <= 2;
  const nearPutWall = Number.isFinite(modules.options.put_wall) && Math.abs((price - modules.options.put_wall) / Math.max(price, 1)) * 100 <= 2;
  const nearGammaFlip = Number.isFinite(modules.options.gamma_flip) && Math.abs((price - modules.options.gamma_flip) / Math.max(price, 1)) * 100 <= 2;
  const rsi = row.technicals?.rsi14 ?? null;

  if (isPriceInsideIdealBuyZone(price, idealBuyZone)) bonus += 7;
  else if (isPriceNearIdealBuyZone(price, idealBuyZone, 2)) bonus += 5;
  if (nearStrongSupport) bonus += 5;
  if (nearPutWall) bonus += 3;
  if (nearGammaFlip && (supportResistance.supports[0]?.price ?? 0) <= price) bonus += 3;
  if ((rsi ?? 50) < 35 && nearStrongSupport) bonus += 3;
  return Math.min(15, bonus);
}

function strongSellConditionCount(row, modules, supportResistance) {
  const price = row.price ?? null;
  const ma20 = row.technicals?.ma20 ?? null;
  const ma50 = row.technicals?.ma50 ?? null;
  const ma200 = row.technicals?.ma200 ?? null;
  const macd = row.technicals?.macd ?? null;
  const macdHistogram = row.technicals?.macdHistogram ?? null;
  const rsi = row.technicals?.rsi14 ?? null;
  const obvWeak = (modules.technical.volume_confirmation_score ?? 50) < 35;
  const belowSupports = supportResistance.supports.slice(0, 2).filter((level) => Number.isFinite(level?.price) && price < level.price * 0.985).length >= 1;

  const checks = [
    Number.isFinite(price) && Number.isFinite(ma50) && Number.isFinite(ma200) && price < ma50 && price < ma200,
    Number.isFinite(ma20) && Number.isFinite(ma50) && Number.isFinite(ma200) && ma20 < ma50 && ma50 < ma200,
    Number.isFinite(macd) && Number.isFinite(macdHistogram) && macd < 0 && macdHistogram < 0,
    Number.isFinite(rsi) && rsi > 35 && rsi < 50 && (row.changePercent ?? 0) <= 0,
    obvWeak,
    belowSupports,
    (modules.fundamental.fundamental_score ?? 50) < 35,
    (modules.market_context.market_context_score ?? 50) < 40,
    (modules.options.options_score ?? 50) < 35,
  ];
  return checks.filter(Boolean).length;
}

function buildConflictWarning(row, aiDecision, idealBuyZone, supportResistance, modules, hardBearishOverride) {
  const price = row.price ?? null;
  const insideZone = isPriceInsideIdealBuyZone(price, idealBuyZone);
  const nearZone = isPriceNearIdealBuyZone(price, idealBuyZone, 2);
  const bearishRatings = [aiDecision.short_term, aiDecision.mid_term, aiDecision.long_term].filter((block) => ["Sell", "Strong Sell", "Short"].includes(block.rating));
  if ((!insideZone && !nearZone) || !bearishRatings.length) return null;

  const reasons = [];
  const ma50 = row.technicals?.ma50 ?? null;
  const ma200 = row.technicals?.ma200 ?? null;
  const macd = row.technicals?.macd ?? null;
  const volumeScore = modules.technical.volume_confirmation_score ?? 50;
  if (Number.isFinite(price) && Number.isFinite(ma50) && price < ma50) reasons.push(currentLanguage === "zh" ? "价格仍低于 MA50。" : "Price is still below MA50.");
  if (Number.isFinite(price) && Number.isFinite(ma200) && price < ma200) reasons.push(currentLanguage === "zh" ? "价格仍低于 MA200。" : "Price is still below MA200.");
  if (Number.isFinite(macd) && macd < 0) reasons.push(currentLanguage === "zh" ? "MACD 仍未转强。" : "MACD has not turned positive yet.");
  if (volumeScore < 50) reasons.push(currentLanguage === "zh" ? "成交量还没有确认反转。" : "Volume has not confirmed a reversal yet.");
  reasons.push(...(hardBearishOverride?.reasons || []));
  const uniqueReasons = [...new Set(reasons)].slice(0, 4);
  if (!uniqueReasons.length) return null;
  return {
    type: insideZone ? "price_inside_buy_zone_but_bearish_rating" : "price_near_buy_zone_but_bearish_rating",
    message: currentLanguage === "zh"
      ? (insideZone
        ? "价格已进入理想买入区间，但趋势或基本面仍偏弱，因此暂不建议主动买入。"
        : "价格已经接近理想买入区间，但趋势或基本面仍偏弱，因此先观察确认。")
      : (insideZone
        ? "Price has entered the ideal buy zone, but trend or fundamental conditions are still weak, so aggressive buying is not favored yet."
        : "Price is already near the ideal buy zone, but trend or fundamental conditions are still weak, so waiting for confirmation is cleaner."),
    reasons: uniqueReasons,
  };
}

function enforceDecisionConsistency(row, aiDecision, idealBuyZone, supportResistance, modules, strategyMatrix) {
  const price = row.price ?? null;
  const insideZone = isPriceInsideIdealBuyZone(price, idealBuyZone);
  const nearZone = isPriceNearIdealBuyZone(price, idealBuyZone, 2);
  const zoneQualified = insideZone || nearZone;
  const hardBearishOverride = buildHardBearishOverride(row, modules, supportResistance, idealBuyZone);

  if (zoneQualified && !hardBearishOverride.active) {
    ["short_term", "mid_term", "long_term"].forEach((key) => {
      if ((aiDecision[key]?.score ?? 0) < CALIBRATION_CONFIG.rating_thresholds.hold) {
        aiDecision[key].score = CALIBRATION_CONFIG.rating_thresholds.hold;
        aiDecision[key].rating = "Hold";
        aiDecision[key].reasons = [
          insideZone
            ? (currentLanguage === "zh"
              ? "价格已进入理想买入区间，风险收益开始改善。"
              : "Price has entered the ideal buy zone, so risk/reward is improving.")
            : (currentLanguage === "zh"
              ? "价格已经接近理想买入区间，赔率开始改善，但仍需要趋势确认。"
              : "Price is already near the ideal buy zone, so risk/reward is improving even if trend confirmation is still needed."),
          ...(aiDecision[key].reasons || []),
        ].slice(0, 3);
        if (aiDecision[key].score_breakdown) {
          aiDecision[key].score_breakdown.support_confluence_bonus = Math.max(aiDecision[key].score_breakdown.support_confluence_bonus ?? 0, 0);
          aiDecision[key].score_breakdown.final_score = aiDecision[key].score;
        }
      }
    });
  }

  if (zoneQualified && strategyMatrix) {
    if (!hardBearishOverride.active && strategyMatrix.buy_stock.action === "Avoid") {
      strategyMatrix.buy_stock.action = "Neutral";
      strategyMatrix.buy_stock.reason = currentLanguage === "zh"
        ? (insideZone
          ? "价格已经进入理想买入区间，所以直接买入至少进入中性观察状态。"
          : "价格已经接近理想买入区间，所以直接买入不应继续显示回避。")
        : (insideZone
          ? "Price is already inside the ideal buy zone, so direct stock buying should be at least neutral."
          : "Price is already near the ideal buy zone, so direct stock buying should not stay on Avoid.");
    }
    if ((ratingAtLeast(aiDecision.mid_term.rating, "Hold") || ratingAtLeast(aiDecision.long_term.rating, "Hold")) && strategyMatrix.add_position.action === "Avoid") {
      strategyMatrix.add_position.action = "Neutral";
    }
    if (strategyMatrix.covered_call.action === "Recommended") {
      const nearestResistance = supportResistance.resistances[0]?.price ?? Number.POSITIVE_INFINITY;
      const closeToResistance = Number.isFinite(nearestResistance) && Math.abs((nearestResistance - price) / Math.max(price, 1)) * 100 <= 2;
      if (!closeToResistance) {
        strategyMatrix.covered_call.action = "Neutral";
      }
    }
    if (strategyMatrix.take_profit.action === "Recommended" && (aiDecision.long_term.score ?? 0) > 70) {
      strategyMatrix.take_profit.action = "Neutral";
    }
  }

  if ((aiDecision.short_term.rating === "Strong Sell" || aiDecision.mid_term.rating === "Strong Sell" || aiDecision.long_term.rating === "Strong Sell")) {
    const count = strongSellConditionCount(row, modules, supportResistance);
    if (count < 3 || (zoneQualified && !hardBearishOverride.active)) {
      ["short_term", "mid_term", "long_term"].forEach((key) => {
        if (aiDecision[key].rating === "Strong Sell") {
          aiDecision[key].rating = zoneQualified && !hardBearishOverride.active ? "Hold" : "Sell";
          aiDecision[key].score = Math.max(aiDecision[key].score, zoneQualified && !hardBearishOverride.active
            ? CALIBRATION_CONFIG.rating_thresholds.hold
            : CALIBRATION_CONFIG.rating_thresholds.sell);
          if (aiDecision[key].score_breakdown) aiDecision[key].score_breakdown.final_score = aiDecision[key].score;
        }
      });
    }
  }

  aiDecision.overall_score = Math.round((aiDecision.short_term.score * 0.25) + (aiDecision.mid_term.score * 0.35) + (aiDecision.long_term.score * 0.4));
  aiDecision.final_ai_score = aiDecision.overall_score;
  aiDecision.final_rating = scoreBucketLabel(aiDecision.overall_score);
  aiDecision.overall_confidence = Math.round(mean([aiDecision.short_term.confidence, aiDecision.mid_term.confidence, aiDecision.long_term.confidence]) ?? 50);
  aiDecision.overall_score_formula = currentLanguage === "zh" ? "短期 25% + 中期 35% + 长期 40%" : "short_term 25% + mid_term 35% + long_term 40%";
  const conflictWarning = buildConflictWarning(row, aiDecision, idealBuyZone, supportResistance, modules, hardBearishOverride);

  return {
    aiDecision,
    strategyMatrix,
    hard_bearish_override: hardBearishOverride,
    conflict_warning: conflictWarning,
  };
}

function horizonWeights(companyProfile, horizon, marketType = "US") {
  const isCn = marketType === "CN_A_SHARE";
  void companyProfile;
  return isCn
    ? (horizon === "short"
      ? { technical: 0.7, fundamental: 0.2, sector_theme: 0.1 }
      : horizon === "mid"
        ? { technical: 0.45, fundamental: 0.45, sector_theme: 0.1 }
        : { fundamental: 0.55, long_term_technical: 0.35, sector_theme: 0.1 })
    : (horizon === "short"
      ? { technical: 0.55, options: 0.2, market_context: 0.1, fundamental: 0.15 }
      : horizon === "mid"
        ? { technical: 0.4, fundamental: 0.35, options: 0.15, market_context: 0.1 }
        : { fundamental: 0.5, long_term_technical: 0.3, market_context: 0.15, options: 0.05 });
}

function profileScoreAdjustment(companyProfile, fundamental, technical, horizon) {
  let adjustment = 0;
  const reasons = [];
  if ((companyProfile.tags || []).includes("CashCow") && horizon === "long" && (fundamental.quality.score ?? 0) >= 80) {
    adjustment += 4;
    reasons.push(currentLanguage === "zh" ? "现金流和利润率稳定，长期质量加分。" : "Stable cash flow and margins add a long-term quality bonus.");
  }
  if ((companyProfile.tags || []).includes("HighGrowth") && (fundamental.growth.score ?? 0) >= 75) {
    adjustment += horizon === "long" ? 5 : 3;
    reasons.push(currentLanguage === "zh" ? "高成长标签提升成长兑现加分。" : "High-growth profile lifts the growth bonus.");
  }
  if ((companyProfile.tags || []).includes("Speculative") && horizon === "long") {
    adjustment -= 4;
    reasons.push(currentLanguage === "zh" ? "投机 / 新股类型在长期周期下会更保守。" : "Speculative or newly listed names are treated more cautiously on long horizons.");
  }
  if ((companyProfile.tags || []).includes("InterestRateSensitive") && horizon !== "short") {
    adjustment -= 2;
    reasons.push(currentLanguage === "zh" ? "利率敏感型股票在中长期会额外检查宏观风险。" : "Rate-sensitive names get an extra macro check outside the short-term window.");
  }
  if ((technical.volume_confirmation.score ?? 50) < 35 && horizon === "short") {
    adjustment -= 3;
    reasons.push(currentLanguage === "zh" ? "短期量价没有确认，削弱短期评分。" : "Weak volume confirmation trims the short-term score.");
  }
  return { value: adjustment, reasons };
}

function penaltyModuleCap(companyProfile, category) {
  const tags = companyProfile.tags || [];
  if (category === "valuation" && tags.some((tag) => ["HighMultiple", "StoryStock", "IPO", "NewlyListed", "Speculative"].includes(tag))) return 5;
  if (category === "fundamental" && tags.some((tag) => ["MegaCap", "CashCow", "REIT", "Dividend"].includes(tag))) return 12;
  if (category === "market_context" && tags.some((tag) => ["REIT", "Dividend", "InterestRateSensitive", "Crypto", "Cyclical", "Energy"].includes(tag))) return 12;
  return PENALTY_CONFIG.max_module_penalty;
}

function weightForPenaltyCategory(companyProfile, category) {
  return companyProfile.penalty_profile_weights?.[category] ?? PROFILE_WEIGHT_DEFAULTS[category] ?? 1;
}

function capWeightedItems(items, totalCap, moduleCapGetter) {
  const scaled = items.map((item) => ({ ...item }));
  const byModule = {};
  scaled.forEach((item) => {
    byModule[item.category] ??= [];
    byModule[item.category].push(item);
  });

  Object.entries(byModule).forEach(([category, moduleItems]) => {
    const cap = moduleCapGetter(category);
    const current = moduleItems.reduce((sum, item) => sum + Math.abs(item.final_score), 0);
    if (current <= cap || current === 0) return;
    const scale = cap / current;
    moduleItems.forEach((item) => {
      item.final_score = Number((item.final_score * scale).toFixed(1));
    });
  });

  const total = scaled.reduce((sum, item) => sum + Math.abs(item.final_score), 0);
  if (total > totalCap && total > 0) {
    const scale = totalCap / total;
    scaled.forEach((item) => {
      item.final_score = Number((item.final_score * scale).toFixed(1));
    });
  }
  return scaled;
}

function penaltyItem(category, name, rawScore, appliedWeight, reason) {
  const bounded = Math.min(PENALTY_CONFIG.max_single_penalty, Math.abs(rawScore) * appliedWeight);
  return {
    category,
    name,
    raw_score: -Math.abs(rawScore),
    applied_weight: Number(appliedWeight.toFixed(2)),
    final_score: Number((-bounded).toFixed(1)),
    reason,
  };
}

function bonusItem(category, name, rawScore, appliedWeight, reason) {
  const bounded = Math.min(PENALTY_CONFIG.max_single_penalty, Math.abs(rawScore) * appliedWeight);
  return {
    category,
    name,
    raw_score: Math.abs(rawScore),
    applied_weight: Number(appliedWeight.toFixed(2)),
    final_score: Number(bounded.toFixed(1)),
    reason,
  };
}

function buildPenaltyItems(row, horizon, companyProfile, modules, decisionContext = {}) {
  const price = row.price ?? null;
  const tech = row.technicals || {};
  const fundamental = modules.fundamental;
  const market = modules.market_context;
  const options = modules.options;
  const tags = companyProfile.tags || [];
  const items = [];
  const add = (category, name, rawScore, reason) => {
    items.push(penaltyItem(category, name, rawScore, weightForPenaltyCategory(companyProfile, category), reason));
  };

  if (horizon !== "long" && Number.isFinite(price) && Number.isFinite(tech.ma20) && price < tech.ma20 * 0.99) {
    add("technical", "price_below_ma20", 2, currentLanguage === "zh" ? "价格仍低于 MA20，短线结构还没修复。" : "Price is still below MA20, so the short-term structure is not repaired yet.");
  }
  if (horizon !== "short" && Number.isFinite(price) && Number.isFinite(tech.ma50) && price < tech.ma50 * 0.985) {
    add("technical", "price_below_ma50", 3, currentLanguage === "zh" ? "价格低于 MA50，中期趋势仍需确认。" : "Price remains below MA50, so the medium-term trend still needs confirmation.");
  }
  if (horizon === "long" && Number.isFinite(price) && Number.isFinite(tech.ma200) && price < tech.ma200 * 0.97) {
    add("technical", "price_below_ma200", 4, currentLanguage === "zh" ? "价格明显低于 MA200，长期趋势承压。" : "Price is materially below MA200, which pressures the long-term trend.");
  }
  if (Number.isFinite(tech.ma20) && Number.isFinite(tech.ma50) && Number.isFinite(tech.ma200) && tech.ma20 < tech.ma50 && tech.ma50 < tech.ma200) {
    add("technical", "ma_bearish_stack", 3, currentLanguage === "zh" ? "均线仍为空头排列。" : "Moving averages are still in a bearish stack.");
  }
  if ((tech.macd ?? 0) < 0 && (tech.macdHistogram ?? 0) < 0) {
    add("technical", "macd_bearish", horizon === "short" ? 3 : 2, currentLanguage === "zh" ? "MACD 和柱状图都仍偏弱。" : "MACD and its histogram both remain weak.");
  }
  if (horizon === "short" && Number.isFinite(tech.rsi14) && tech.rsi14 < 42) {
    add("technical", "rsi_weak", 2, currentLanguage === "zh" ? "RSI 仍偏弱，短线反转尚未确认。" : "RSI still looks weak, so a short-term reversal is not confirmed.");
  }
  if ((modules.technical.volume_confirmation_score ?? 50) < 40) {
    add("technical", "volume_no_confirmation", 2, currentLanguage === "zh" ? "量价没有给出明确确认。" : "Volume confirmation is still lacking.");
  }
  if (decisionContext.supportResistance?.supports?.[0]?.price && Number.isFinite(price) && price < decisionContext.supportResistance.supports[0].price * 0.985) {
    add("technical", "support_breakdown", 3, currentLanguage === "zh" ? "价格已经跌破最近支撑位。" : "Price has already broken below the nearest support.");
  }

  const valuationExempt = tags.some((tag) => ["IPO", "NewlyListed", "Speculative", "UnprofitableGrowth"].includes(tag));
  if (!valuationExempt) {
    if ((fundamental.valuation.pe ?? 0) > 60) {
      add("valuation", "pe_too_high", 4, tags.some((tag) => ["HighMultiple", "StoryStock", "Momentum"].includes(tag))
        ? (currentLanguage === "zh" ? "PE 较高，但这类高估值叙事股不会被传统 PE 过度重罚。" : "PE is high, but traditional PE is down-weighted for this kind of high-multiple story stock.")
        : (currentLanguage === "zh" ? "作为更成熟的公司，PE 偏高带来估值风险。" : "For a more mature company, elevated PE adds valuation risk."));
    }
    if ((fundamental.valuation.forward_pe ?? 0) > 50) {
      add("valuation", "forward_pe_too_high", 4, tags.some((tag) => ["HighMultiple", "StoryStock", "Momentum"].includes(tag))
        ? (currentLanguage === "zh" ? "远期市盈率较高，但对高成长叙事股只轻微扣分。" : "Forward PE is high, but it is only lightly penalized for high-growth story stocks.")
        : (currentLanguage === "zh" ? "远期市盈率高于成熟公司更舒适的估值区间。" : "Forward PE is above a comfortable range for a more mature company."));
    }
    if ((fundamental.valuation.peg ?? 0) > 2.5) add("valuation", "peg_too_high", 3, currentLanguage === "zh" ? "PEG 偏高，说明增长对估值的支撑不够便宜。" : "PEG is elevated, so growth is not especially cheap versus valuation.");
    if ((fundamental.valuation.ps_ratio ?? 0) > 10) add("valuation", "ps_too_high", 4, currentLanguage === "zh" ? "市销率较高，估值需要更强增长支撑。" : "PS ratio is elevated and needs stronger growth support.");
    if ((fundamental.valuation.ev_ebitda ?? 0) > 28) add("valuation", "ev_ebitda_too_high", 3, currentLanguage === "zh" ? "EV / EBITDA 较高。" : "EV / EBITDA remains elevated.");
    if ((fundamental.valuation.price_fcf ?? 0) > 35) add("valuation", "price_fcf_too_high", 3, currentLanguage === "zh" ? "Price / FCF 较高。" : "Price / FCF remains elevated.");
  }

  if ((fundamental.growth.revenue_growth ?? 0) < 0.03 && tags.some((tag) => ["Growth", "HighGrowth"].includes(tag))) {
    add("fundamental", "revenue_growth_slowing", 4, currentLanguage === "zh" ? "作为成长股，营收增速已经明显放缓。" : "For a growth stock, revenue growth has slowed materially.");
  }
  if ((fundamental.growth.eps_growth ?? 0) < 0) add("fundamental", "eps_growth_slowing", 3, currentLanguage === "zh" ? "利润增长为负。" : "EPS growth is negative.");
  if ((fundamental.financial_health.free_cash_flow ?? 0) < 0) add("fundamental", "free_cash_flow_weak", tags.includes("REIT") || tags.includes("Dividend") ? 4 : 3, currentLanguage === "zh" ? "自由现金流偏弱。" : "Free cash flow is weak.");
  if ((fundamental.quality.debt_ratio ?? 0) > 0.62) add("fundamental", "debt_too_high", tags.includes("REIT") || tags.includes("Dividend") ? 4 : 3, currentLanguage === "zh" ? "债务负担偏高。" : "Debt load looks elevated.");
  if ((fundamental.quality.operating_margin ?? 0) < 0.08) add("fundamental", "margin_deterioration", 2, currentLanguage === "zh" ? "营业利润率偏弱。" : "Operating margin remains soft.");
  if ((fundamental.growth.free_cash_flow_growth ?? 0) < -0.08 && (fundamental.financial_health.free_cash_flow ?? 0) < 0) {
    add("fundamental", "cash_flow_instability", 2, currentLanguage === "zh" ? "现金流改善趋势还不稳定。" : "Cash flow improvement still looks unstable.");
  }

  if (Number.isFinite(options.gamma_flip) && Number.isFinite(price) && price < options.gamma_flip * 0.99) {
    add("options", "price_below_gamma_flip", 2, currentLanguage === "zh" ? "价格仍在 Gamma Flip 下方。" : "Price is still below the gamma flip.");
  }
  if ((options.options_score ?? 50) < 40) add("options", "bearish_options_structure", 3, currentLanguage === "zh" ? "期权结构暂时偏空。" : "Options structure still leans bearish.");
  if (Number.isFinite(options.call_wall) && Number.isFinite(price) && ((options.call_wall - price) / Math.max(price, 1)) * 100 <= 2.5 && horizon === "short") {
    add("options", "call_wall_too_close", 2, currentLanguage === "zh" ? "上方 Call Wall 很近，短线容易受压。" : "The call wall sits close overhead, limiting short-term upside.");
  }
  if (Number.isFinite(options.put_wall) && Number.isFinite(price) && price < options.put_wall * 0.985) {
    add("options", "put_wall_broken", 2, currentLanguage === "zh" ? "价格跌破 Put Wall 支撑。" : "Price has slipped below the put wall support.");
  }

  if (market.market_regime?.regime === "risk_off") {
    add("market_context", "risk_off_regime", horizon === "short" ? 4 : horizon === "mid" ? 3 : 2, currentLanguage === "zh" ? "当前市场环境偏防守，主动进攻型仓位需要更谨慎。" : "The market regime is risk-off, so aggressive risk-taking needs more caution.");
  }
  if ((market.sector_score ?? 50) < 48) add("market_context", "sector_weakness", 2, currentLanguage === "zh" ? "行业主题环境仍偏弱。" : "Sector-theme backdrop still looks soft.");
  if (hasAnyTag(tags, ["REIT", "Dividend", "InterestRateSensitive", "HighMultiple", "Growth", "StoryStock", "Speculative"])
    && market.market_engine?.ten_year_yield?.trend === "rising") {
    add("market_context", "rate_pressure_profile", horizon === "short" ? 4 : 3, currentLanguage === "zh" ? "10Y 利率上行对当前公司画像更不友好。" : "Rising 10Y yields are more negative for this stock profile.");
  }
  if (market.market_engine?.fear_greed?.label === "Extreme Greed" && horizon === "short") {
    add("market_context", "extreme_greed", 2, currentLanguage === "zh" ? "极度贪婪阶段更容易出现追高风险。" : "Extreme greed raises short-term chase risk.");
  }
  if (tags.includes("Crypto") && market.risks?.length) add("market_context", "regulation_risk", 2, currentLanguage === "zh" ? "加密和监管风险会放大波动。" : "Crypto-related regulation risk can amplify volatility.");

  if (row.noData) add("data_quality", "missing_critical_data", PENALTY_CONFIG.missing_data_max_penalty, currentLanguage === "zh" ? "关键市场数据缺失。" : "Critical market data is missing.");
  if (decisionContext.idealBuyZone?.outlier_detected) add("data_quality", "ideal_buy_zone_outlier", 2, currentLanguage === "zh" ? "理想买入区曾触发异常回退。" : "The ideal buy zone triggered a sanity fallback.");

  const cappedItems = capWeightedItems(items, PENALTY_CONFIG.max_total_penalty, (category) => penaltyModuleCap(companyProfile, category));
  const total = Number(cappedItems.reduce((sum, item) => sum + item.final_score, 0).toFixed(1));
  const module_totals = cappedItems.reduce((acc, item) => {
    acc[item.category] = Number(((acc[item.category] ?? 0) + item.final_score).toFixed(1));
    return acc;
  }, {});
  return { total, items: cappedItems, module_totals };
}

function buildBonusItems(row, horizon, companyProfile, modules, decisionContext = {}) {
  const price = row.price ?? null;
  const tech = row.technicals || {};
  const items = [];
  const tags = companyProfile.tags || [];
  const add = (category, name, rawScore, reason) => {
    items.push(bonusItem(category, name, rawScore, weightForPenaltyCategory(companyProfile, category), reason));
  };

  const strongestSupport = decisionContext.supportResistance?.supports?.find((level) => level.strength === "strong") || decisionContext.supportResistance?.supports?.[0];
  if (isPriceInsideIdealBuyZone(price, decisionContext.idealBuyZone)) {
    add("technical", "price_inside_ideal_buy_zone", 7, currentLanguage === "zh" ? "当前价格已经进入理想买入区间，风险收益比改善。" : "Price is already inside the ideal buy zone, improving risk/reward.");
  }
  if (strongestSupport?.price != null && Number.isFinite(price) && Math.abs((price - strongestSupport.price) / Math.max(price, 1)) * 100 <= 2) {
    add("technical", "near_strong_support", 5, currentLanguage === "zh" ? "价格靠近强支撑位。" : "Price is trading near a strong support.");
  }
  if (Number.isFinite(modules.options.put_wall) && Number.isFinite(price) && Math.abs((price - modules.options.put_wall) / Math.max(price, 1)) * 100 <= 2) {
    add("technical", "near_put_wall", 3, currentLanguage === "zh" ? "价格靠近 Put Wall 支撑。" : "Price is near put-wall support.");
  }
  if (Number.isFinite(modules.options.gamma_flip) && Number.isFinite(price) && Math.abs((price - modules.options.gamma_flip) / Math.max(price, 1)) * 100 <= 2.5 && (decisionContext.supportResistance?.supports?.[0]?.price ?? 0) <= price) {
    add("technical", "near_gamma_flip_support", 3, currentLanguage === "zh" ? "Gamma Flip 与支撑区接近。" : "Gamma flip is sitting near a support zone.");
  }
  if ((tech.rsi14 ?? 50) < 35 && strongestSupport?.price != null && Math.abs((price - strongestSupport.price) / Math.max(price, 1)) * 100 <= 2.5) {
    add("technical", "oversold_at_support", 3, currentLanguage === "zh" ? "RSI 偏低且接近支撑，短线风险收益比改善。" : "RSI is soft while price sits near support, improving near-term risk/reward.");
  }
  if (tags.some((tag) => ["Growth", "HighGrowth", "ProfitableGrowth"].includes(tag)) && (modules.fundamental.growth.revenue_growth ?? 0) >= 0.2 && (modules.fundamental.growth.eps_growth ?? 0) >= 0.12) {
    add("fundamental", "growth_execution", 4, currentLanguage === "zh" ? "营收和利润增长都较强。" : "Revenue and EPS growth are both strong.");
  }
  if (tags.some((tag) => ["CashCow", "MegaCap"].includes(tag)) && (modules.fundamental.financial_health.free_cash_flow ?? 0) > 0 && (modules.fundamental.quality.operating_margin ?? 0) >= 0.15) {
    add("fundamental", "cash_cow_quality", 4, currentLanguage === "zh" ? "现金流和利润率兼具稳定性。" : "Cash flow and operating margins both look stable.");
  }
  if (tags.some((tag) => ["REIT", "Dividend"].includes(tag)) && (modules.fundamental.financial_health.free_cash_flow ?? 0) > 0 && (modules.fundamental.quality.debt_ratio ?? 1) < 0.65) {
    add("fundamental", "dividend_cover", 4, currentLanguage === "zh" ? "现金流对分红 / 利率敏感业务有一定支撑。" : "Cash flow offers some support to the dividend / rate-sensitive profile.");
  }
  if (tags.some((tag) => ["Speculative", "IPO", "NewlyListed"].includes(tag)) && (modules.technical.volume_confirmation.relative_volume ?? 0) >= 1.5 && (row.changePercent ?? 0) > 1) {
    add("market_context", "speculative_catalyst", 3, currentLanguage === "zh" ? "量能和价格动能正在提升。" : "Volume and price momentum are both improving.");
  }
  if (modules.market_context.market_regime?.regime === "risk_on" && modules.market_context.market_engine?.equity_trend?.impact === "supportive") {
    add("market_context", "risk_on_tape", horizon === "short" ? 3 : 2, currentLanguage === "zh" ? "指数趋势配合，市场环境偏进攻。" : "Broad index trends are supportive, which improves the macro tape.");
  }
  if (modules.market_context.market_engine?.ten_year_yield?.trend === "falling" && hasAnyTag(tags, ["REIT", "Dividend", "InterestRateSensitive", "HighMultiple", "Growth"])) {
    add("market_context", "yield_relief", horizon === "long" ? 2 : 3, currentLanguage === "zh" ? "利率回落对利率敏感 / 高估值成长股更友好。" : "Falling yields are supportive for rate-sensitive and higher-duration equities.");
  }
  if (modules.market_context.market_engine?.fear_greed?.label === "Extreme Fear" && horizon === "long") {
    add("market_context", "contrarian_fear", 2, currentLanguage === "zh" ? "极度恐惧往往改善中长期赔率。" : "Extreme fear can improve medium-to-long-term opportunity sets.");
  }

  const cappedItems = capWeightedItems(items, 20, () => 8);
  const total = Number(cappedItems.reduce((sum, item) => sum + item.final_score, 0).toFixed(1));
  const module_totals = cappedItems.reduce((acc, item) => {
    acc[item.category] = Number(((acc[item.category] ?? 0) + item.final_score).toFixed(1));
    return acc;
  }, {});
  return { total, items: cappedItems, module_totals };
}

function buildShortSetup(row, companyProfile, modules, supportResistance, idealBuyZone, preferredHorizon = "short") {
  const marketType = schemaMarketTypeForTicker(row);
  const price = row.price ?? null;
  const tech = row.technicals || {};
  const tags = companyProfile.tags || [];
  const reasons = [];
  const riskWarnings = [];
  const whyWrong = [];
  const addReason = (condition, text, points) => {
    if (condition) {
      reasons.push(text);
      return points;
    }
    return 0;
  };
  let score = 0;
  const belowMa20 = Number.isFinite(price) && Number.isFinite(tech.ma20) && price < tech.ma20;
  const belowMa50 = Number.isFinite(price) && Number.isFinite(tech.ma50) && price < tech.ma50;
  const belowMa200 = Number.isFinite(price) && Number.isFinite(tech.ma200) && price < tech.ma200;
  const maShortBearish = Number.isFinite(tech.ma10) && Number.isFinite(tech.ma20) && tech.ma10 < tech.ma20;
  const maMidBearish = Number.isFinite(tech.ma20) && Number.isFinite(tech.ma50) && tech.ma20 < tech.ma50;
  const maLongBearish = Number.isFinite(tech.ma50) && Number.isFinite(tech.ma200) && tech.ma50 < tech.ma200;
  const macdBearish = (tech.macd ?? 0) < 0 && (tech.macdHistogram ?? 0) < 0;
  const volumeWeak = (modules.technical.volume_signal_score ?? 50) <= 40;
  const obvWeak = ["falling"].includes(modules.technical.volume_signal?.obv_trend_5d) || ["falling"].includes(modules.technical.volume_signal?.obv_trend_20d);
  const brokeSupport = supportResistance.supports.slice(0, 2).some((level) => Number.isFinite(level?.price) && Number.isFinite(price) && price < level.price * 0.99);
  const nearStrongSupport = supportResistance.supports.some((level) => level.strength === "strong" && Number.isFinite(level.price) && Number.isFinite(price) && Math.abs((price - level.price) / Math.max(price, 1)) * 100 <= 2);
  const insideBuyZone = isPriceInsideIdealBuyZone(price, idealBuyZone);
  const nearBuyZone = isPriceNearIdealBuyZone(price, idealBuyZone, 2);
  const squeezeRiskRaw = modules.options.short_squeeze?.squeeze_risk || null;
  const squeezeRisk = squeezeRiskRaw ? String(squeezeRiskRaw).toLowerCase() : "unavailable";
  const squeezeBlocksShort = ["high", "extreme"].includes(squeezeRisk);
  const riskOnTape = modules.market_context.market_regime?.regime === "risk_on";
  const nearPutWallSupport = marketType === "US"
    && Number.isFinite(modules.options.put_wall)
    && Number.isFinite(price)
    && Math.abs((price - modules.options.put_wall) / Math.max(price, 1)) * 100 <= 2.5
    && Number.isFinite(modules.options.gamma_flip)
    && price >= modules.options.gamma_flip;
  const nextSupport = supportResistance.supports.find((level) => Number.isFinite(level?.price) && Number.isFinite(price) && level.price < price);
  const nextResistance = supportResistance.resistances.find((level) => Number.isFinite(level?.price) && Number.isFinite(price) && level.price > price);
  const roomToSupportPct = nextSupport?.price && Number.isFinite(price) ? ((price - nextSupport.price) / Math.max(price, 1)) * 100 : null;
  const rsiOversold = (tech.rsi14 ?? 50) < 25;
  const kdjExtreme = (tech.kdj?.j ?? 50) < 0;
  const speculativeSqueezeProne = hasAnyTag(tags, ["IPO", "NewlyListed", "Speculative", "StoryStock", "Momentum"]);
  const fundamentalRisk = (modules.fundamental.fundamental_score ?? 50) < 42
    || (modules.fundamental.financial_health?.free_cash_flow ?? 0) < 0
    || (modules.fundamental.growth?.revenue_growth ?? 0) < 0.03
    || (modules.fundamental.quality?.debt_ratio ?? 0) > 0.62;
  const megaCapCashCow = hasAnyTag(tags, ["MegaCap", "CashCow"]);
  const horizon = preferredHorizon === "long" && fundamentalRisk && belowMa200
    ? "long_term"
    : preferredHorizon === "mid" || (belowMa50 && maMidBearish)
      ? "mid_term"
      : "short_term";

  score += addReason(belowMa20 && belowMa50, currentLanguage === "zh" ? "价格跌破 MA20 和 MA50。" : "Price is below MA20 and MA50.", 16);
  score += addReason(maShortBearish || maMidBearish, currentLanguage === "zh" ? "短中期均线结构转弱。" : "Short / mid moving-average structure is weakening.", 12);
  score += addReason(macdBearish, currentLanguage === "zh" ? "MACD 和柱状图偏空。" : "MACD and histogram are bearish.", 12);
  score += addReason(volumeWeak, currentLanguage === "zh" ? "放量下跌或量价结构偏派发。" : "Volume pattern leans distribution.", 14);
  score += addReason(obvWeak, currentLanguage === "zh" ? "OBV 显示资金流出。" : "OBV points to outflow.", 10);
  score += addReason(brokeSupport, currentLanguage === "zh" ? "价格跌破近期支撑。" : "Price has broken recent support.", 12);
  score += addReason((roomToSupportPct ?? 0) >= 4, currentLanguage === "zh" ? "距离下一个支撑仍有下行空间。" : "There is still room to the next support.", 8);
  score += addReason(fundamentalRisk, currentLanguage === "zh" ? "基本面 / 现金流 / 估值风险提供非技术确认。" : "Fundamental, cash-flow, or valuation risk confirms the bearish setup.", 12);
  score += addReason(modules.market_context.market_regime?.regime === "risk_off", currentLanguage === "zh" ? "市场环境偏防守。" : "Market regime is risk-off.", 6);
  score += addReason(belowMa200 || maLongBearish, currentLanguage === "zh" ? "长期趋势结构走弱。" : "Long-term trend structure is weak.", horizon === "long_term" ? 12 : 4);

  if (insideBuyZone || nearBuyZone) riskWarnings.push(currentLanguage === "zh" ? "价格在或接近理想买入区，不允许轻易追空。" : "Price is in or near the ideal buy zone, so chasing short is not allowed.");
  if (nearStrongSupport) riskWarnings.push(currentLanguage === "zh" ? "价格距离强支撑小于约 2%。" : "Price is within roughly 2% of strong support.");
  if (rsiOversold) riskWarnings.push(currentLanguage === "zh" ? "RSI 已严重超卖，缺少反弹失败确认时不适合追空。" : "RSI is deeply oversold; avoid shorting without failed-bounce confirmation.");
  if (kdjExtreme) riskWarnings.push(currentLanguage === "zh" ? "KDJ J 已极端超卖。" : "KDJ J is extremely oversold.");
  if (squeezeBlocksShort) riskWarnings.push(currentLanguage === "zh" ? "逼空风险高或极高，不允许推荐主动做空。" : "Short-squeeze risk is high or extreme, so active short is not allowed.");
  if (nearPutWallSupport) riskWarnings.push(currentLanguage === "zh" ? "价格接近 Put Wall 且 Gamma 结构可能提供支撑。" : "Price is near put-wall / gamma support.");
  if (riskOnTape) riskWarnings.push(currentLanguage === "zh" ? "市场环境明显 risk-on，不适合主动做空。" : "Risk-on market tape blocks an active short rating.");
  if (megaCapCashCow && !(belowMa200 && fundamentalRisk && modules.market_context.market_regime?.regime === "risk_off")) {
    riskWarnings.push(currentLanguage === "zh" ? "Mega Cap / Cash Cow 做空门槛更高，当前证据不足。" : "Mega-cap / cash-cow names require a higher short threshold.");
    score -= 12;
  }
  if (speculativeSqueezeProne && squeezeRisk === "unavailable") {
    riskWarnings.push(currentLanguage === "zh" ? "投机 / 新股类型缺少卖空数据，默认不激进给 Short。" : "Speculative / newly listed names lack short-interest data, so the model avoids aggressive Short ratings.");
    score -= 8;
  }
  if (marketType === "CN_A_SHARE") {
    riskWarnings.push(currentLanguage === "zh" ? "A股暂不直接显示做空评级，仅作为强风险信号。" : "A-share names do not display direct Short ratings; this is only a risk signal.");
  }

  whyWrong.push(...riskWarnings.slice(0, 4));
  if (nextResistance?.price) whyWrong.push(currentLanguage === "zh" ? `如果重新站上 ${formatCurrency(nextResistance.price, row.currencyCode)}，做空逻辑失效。` : `If price reclaims ${formatCurrency(nextResistance.price, row.currencyCode)}, the short thesis weakens.`);
  const blocked = insideBuyZone || nearStrongSupport || rsiOversold || kdjExtreme || squeezeBlocksShort || nearPutWallSupport || riskOnTape || (megaCapCashCow && score < 92);
  const boundedScore = clamp(Math.round(score), 0, 100);
  const ratingQualified = marketType === "US" && !blocked && boundedScore >= 85 && reasons.length >= 5;
  const stopBase = nextResistance?.price ?? tech.ma20 ?? (Number.isFinite(price) ? price * 1.05 : null);
  const targetBase = nextSupport?.price ?? (Number.isFinite(price) ? price * 0.92 : null);
  return {
    qualified: ratingQualified,
    display_rating: marketType === "US",
    score: boundedScore,
    risk_level: squeezeBlocksShort || speculativeSqueezeProne ? "high" : boundedScore >= 85 ? "medium" : "low",
    timeframe: horizon,
    entry_zone: Number.isFinite(price) ? `${formatCurrency(price * 0.99, row.currencyCode)} - ${formatCurrency(price * 1.015, row.currencyCode)}` : null,
    stop_loss: Number.isFinite(stopBase) ? formatCurrency(stopBase, row.currencyCode) : null,
    target_zone: Number.isFinite(targetBase) ? `${formatCurrency(targetBase * 0.98, row.currencyCode)} - ${formatCurrency(targetBase * 1.01, row.currencyCode)}` : null,
    invalidation_level: Number.isFinite(stopBase) ? formatCurrency(stopBase, row.currencyCode) : null,
    reasons: [...new Set(reasons)].slice(0, 8),
    risk_warnings: [...new Set(riskWarnings)].slice(0, 8),
    squeeze_risk: squeezeRisk,
    why_short: [...new Set(reasons)].slice(0, 6),
    why_it_could_be_wrong: [...new Set(whyWrong)].slice(0, 6),
  };
}

function buildHorizonDecision(row, horizon, companyProfile, modules, decisionContext = {}) {
  const marketType = decisionContext.market_type || schemaMarketTypeForTicker(row);
  const weights = horizonWeights(companyProfile, horizon, marketType);
  const horizonKey = horizon === "short" ? "short_term" : horizon === "mid" ? "mid_term" : "long_term";
  const technicalScore = neutralScore(
    modules.technical.technical_analysis?.[horizonKey]?.final_technical_score
    ?? modules.technical.technical_score,
  );
  const longTermTechnicalScore = neutralScore(
    modules.technical.technical_analysis?.long_term?.final_technical_score
    ?? Math.round(mean([
      row.price > (row.technicals?.ma200 ?? row.price) ? 74 : 32,
      modules.technical.trend_score,
      modules.technical.momentum_score,
    ]) ?? modules.technical.technical_score),
  );
  const volumeSignalScore = neutralScore(
    modules.technical.volume_confirmation?.[`${horizonKey}_volume_signal`]?.score
    ?? modules.technical.volume_signal?.[`${horizonKey}_volume_signal`]?.score
    ?? modules.technical.volume_signal_score
    ?? modules.technical.volume_confirmation_score,
  );
  const fundamentalScore = neutralScore(modules.fundamental.fundamental_score);
  const optionsScore = marketType === "CN_A_SHARE" ? 50 : neutralScore(modules.options.options_score);
  const marketScore = neutralScore(modules.market_context.horizon_scores?.[horizon] ?? modules.market_context.market_context_score);
  const sectorThemeScore = neutralScore(modules.market_context.sector_score ?? (companyProfile.tags?.length ? 58 : 50));
  const marketBreakdown = modules.market_context.horizon_breakdown?.[horizon] || null;
  const moduleScores = {
    technical: technicalScore,
    long_term_technical: longTermTechnicalScore,
    fundamental: fundamentalScore,
    options: optionsScore,
    market_context: marketScore,
    sector_theme: sectorThemeScore,
  };

  const contributions = Object.fromEntries(
    Object.entries(weights).map(([key, weight]) => [key, Number(((moduleScores[key] ?? 50) * weight).toFixed(1))]),
  );
  const contribution_caps = Object.fromEntries(Object.entries(weights).map(([key, weight]) => [key, Math.round(weight * 100)]));
  const baseScore = Object.values(contributions).reduce((sum, value) => sum + value, 0);
  const adjustment = profileScoreAdjustment(companyProfile, modules.fundamental, modules.technical, horizon);
  const hardBearishOverride = decisionContext.hard_bearish_override || { active: false, reasons: [] };
  const bonuses = hardBearishOverride.active
    ? { total: 0, items: [], module_totals: {} }
    : buildBonusItems(row, horizon, companyProfile, modules, decisionContext);
  const penalties = buildPenaltyItems(row, horizon, companyProfile, modules, decisionContext);
  let score = Math.round(clamp(baseScore + adjustment.value + bonuses.total + penalties.total, 0, 100));
  const bullishModules = Object.keys(weights).map((key) => moduleScores[key] ?? 50).filter((value) => value >= CALIBRATION_CONFIG.rating_thresholds.buy).length;
  if (bullishModules >= 2 && score < CALIBRATION_CONFIG.rating_thresholds.sell) {
    score = CALIBRATION_CONFIG.rating_thresholds.sell;
  }
  const volumeBehaviorKey = modules.technical.volume_confirmation?.behavior_key;
  if (horizon === "short" && volumeSignalScore < 45 && score >= CALIBRATION_CONFIG.rating_thresholds.buy) {
    score = CALIBRATION_CONFIG.rating_thresholds.hold + 10;
  }
  if (horizon === "short" && volumeBehaviorKey === "weak_breakout") {
    score = Math.min(score, CALIBRATION_CONFIG.rating_thresholds.hold - 1);
  }
  if (["distribution_risk"].includes(volumeBehaviorKey)) {
    score = Math.min(score, horizon === "short" ? CALIBRATION_CONFIG.rating_thresholds.hold - 1 : CALIBRATION_CONFIG.rating_thresholds.buy - 1);
  }
  if (volumeBehaviorKey === "panic_selling") {
    score = Math.min(score, horizon === "short" ? CALIBRATION_CONFIG.rating_thresholds.sell - 1 : CALIBRATION_CONFIG.rating_thresholds.hold - 1);
  }
  if (horizon === "short" && (row.technicals?.rsi14 ?? 50) < 35 && volumeSignalScore < 55 && score >= CALIBRATION_CONFIG.rating_thresholds.buy) {
    score = CALIBRATION_CONFIG.rating_thresholds.buy - 1;
  }
  let rating = scoreBucketLabel(score);
  const componentScores = Object.keys(weights).map((key) => moduleScores[key] ?? 50);
  const missing = [
    marketType === "US" && modules.market_context.market_engine?.vix?.value == null,
    marketType === "US" && modules.market_context.market_engine?.fear_greed?.value == null,
    marketType === "US" && modules.market_context.market_engine?.ten_year_yield?.value == null,
    marketType === "US" && modules.options.put_wall == null,
    ...(companyProfile.missing_classification_data || []).map(() => true),
  ].filter(Boolean).length;
  const confidence = calculateConfidence(componentScores, missing);
  const reasons = [];
  if (horizon === "short") {
    reasons.push(modules.technical.summary, modules.options.summary, row.changePercent != null ? `${t("dayMove")} ${formatChangePercent(row.changePercent)}` : null);
  } else if (horizon === "mid") {
    reasons.push(modules.technical.summary, modules.fundamental.summary, modules.options.summary);
  } else {
    reasons.push(modules.fundamental.summary, modules.market_context.summary, modules.technical.summary);
  }
  if (horizon === "short" && score < CALIBRATION_CONFIG.rating_thresholds.hold && (modules.fundamental.fundamental_score ?? 50) >= 60) {
    reasons.unshift(currentLanguage === "zh" ? "短期偏弱，但中长期逻辑还没有完全破坏。" : "Short-term is weak, but the broader thesis is not fully broken.");
  }
  const scoreBreakdown = {
    weights,
    module_scores: moduleScores,
    contribution_caps,
    contributions,
    technical: contributions.technical ?? 0,
    long_term_technical: contributions.long_term_technical ?? 0,
    fundamental: contributions.fundamental ?? 0,
    options: contributions.options ?? 0,
    market_context: contributions.market_context ?? 0,
    sector_theme: contributions.sector_theme ?? 0,
    market_context_details: marketBreakdown,
    profile_adjustment: adjustment.value,
    profile_adjustment_reasons: adjustment.reasons,
    profile_weight_impact: companyProfile.scoring_impact || [],
    support_confluence_bonus: bonuses.module_totals.technical ?? 0,
    bonuses,
    penalties,
    final_score: score,
  };
  if (DEV_MODE) {
    console.log(`[score-breakdown] ${row.ticker} ${horizon}`, scoreBreakdown);
  }

  return {
    horizon: horizon === "short" ? "1-30 days" : horizon === "mid" ? "30-90 days" : "90-180 days",
    score,
    rating,
    confidence,
    module_scores: moduleScores,
    adjusted_weights: weights,
    top_positive_reasons: [...(bonuses.items || [])].sort((a, b) => b.final_score - a.final_score).slice(0, 3).map((item) => item.reason),
    top_negative_reasons: [...(penalties.items || [])].sort((a, b) => a.final_score - b.final_score).slice(0, 3).map((item) => item.reason),
    reasons: reasons.filter(Boolean).slice(0, 3),
    score_breakdown: scoreBreakdown,
  };
}

function buildStrategyMatrix(row, aiDecision, idealBuyZone, supportResistance, optionsModule, marketContext, companyProfile) {
  const price = row.price ?? 0;
  const shortRating = aiDecision.short_term.rating;
  const midRating = aiDecision.mid_term.rating;
  const longRating = aiDecision.long_term.rating;
  const technicalState = row.decisionModel?.technical?.trend?.state || row.technicals?.trendState || "Neutral";
  const marketState = marketStateFromScores(aiDecision.short_term.score, aiDecision.mid_term.score, aiDecision.long_term.score, technicalState);
  const marketRegime = marketContext?.market_regime?.regime || "neutral";
  const hawkishFedActive = marketContext?.market_engine?.fed_event?.active && ["fed_rate_hike", "fed_hawkish"].includes(marketContext.market_engine?.fed_event?.type);
  const rateSensitiveProfile = hasAnyTag(companyProfile?.tags || [], ["REIT", "Dividend", "InterestRateSensitive", "HighMultiple", "Growth", "StoryStock", "Speculative"]);
  const buyZoneDistance = zoneDistancePct(price, idealBuyZone.low, idealBuyZone.high);
  const insideBuyZone = buyZoneDistance === 0;
  const nearBuyZone = buyZoneDistance != null && buyZoneDistance <= 2;
  const nearResistance = supportResistance.resistances[0]?.price != null && price >= supportResistance.resistances[0].price * 0.985;
  const nearSupport = supportResistance.supports[0]?.price != null && price <= supportResistance.supports[0].price * 1.02;
  const addZoneLow = Math.min(supportResistance.supports[0]?.price ?? idealBuyZone.low, idealBuyZone.high);
  const addZoneHigh = Math.max(supportResistance.supports[0]?.price ?? idealBuyZone.low, idealBuyZone.high);
  const nearR2Plus = supportResistance.resistances.slice(1).some((level) => level?.price != null && Math.abs((level.price - price) / Math.max(price, 1)) * 100 <= 3.5);
  const rsi = row.technicals?.rsi14 ?? null;
  const kdjJ = row.technicals?.kdj?.j ?? null;
  const volumeConfirmation = row.decisionModel?.technical?.volume_confirmation || {};
  const obvDivergence = (row.changePercent ?? 0) > 0 && (volumeConfirmation.relative_volume ?? 1) >= 1.6 && (volumeConfirmation.close_position ?? 0.5) < 0.58;
  const signalsConflict = (ratingRank(longRating) >= ratingRank("Buy") && ratingRank(shortRating) <= ratingRank("Sell"))
    || (ratingRank(midRating) >= ratingRank("Buy") && ratingRank(shortRating) <= ratingRank("Sell"))
    || new Set([shortRating, midRating, longRating]).size === 3;
  const clearSupport = supportResistance.supports.some((level) => level.strength !== "weak");
  const clearResistance = supportResistance.resistances.some((level) => level.strength !== "weak");
  const addCanRecommend = nearBuyZone && (ratingAtLeast(midRating, "Buy") || ratingAtLeast(longRating, "Buy")) && technicalState !== "Strong Bearish";
  const takeProfitChecks = [
    nearR2Plus,
    (rsi ?? 0) > 75,
    (kdjJ ?? 0) > 100,
    obvDivergence,
    optionsModule.covered_call.recommendation === "Recommended",
    ["Sell", "Strong Sell"].includes(shortRating),
  ].filter(Boolean).length;
  const priceExtended = Number.isFinite(idealBuyZone.high) && price > idealBuyZone.high * 1.03;
  const waitShouldRecommend = (!insideBuyZone && priceExtended) || signalsConflict || !clearSupport || !clearResistance;

  const makeEntry = (action, stars, reason, extra = {}) => ({ action, stars, reason, ...extra });
  let buyAction = (insideBuyZone || nearBuyZone) && !["Sell", "Strong Sell", "Short"].includes(shortRating) && marketState !== "Strong Bearish"
    ? "Recommended"
    : (ratingAtLeast(longRating, "Buy") || ratingAtLeast(midRating, "Buy")) ? "Neutral" : "Avoid";
  let addAction = addCanRecommend ? "Recommended" : ratingAtLeast(midRating, "Hold") ? "Neutral" : "Avoid";
  let takeProfitAction = takeProfitChecks >= 2 ? "Recommended" : (nearResistance || nearR2Plus) ? "Neutral" : "Avoid";
  let waitAction = waitShouldRecommend ? "Recommended" : "Neutral";
  let cspAction = optionsModule.cash_secured_put.recommendation;
  let ccAction = optionsModule.covered_call.recommendation;

  if (buyAction === "Recommended") {
    if (waitAction === "Recommended") waitAction = "Neutral";
    if (takeProfitAction === "Recommended" && !(nearR2Plus || (rsi ?? 0) > 78)) takeProfitAction = "Neutral";
    if (!addCanRecommend && addAction === "Recommended") addAction = "Neutral";
  }

  if (!addCanRecommend && addAction === "Recommended") {
    addAction = ratingAtLeast(midRating, "Buy") || ratingAtLeast(longRating, "Buy") ? "Neutral" : "Avoid";
  }

  if (takeProfitAction === "Recommended") {
    addAction = "Avoid";
    if (buyAction === "Recommended") buyAction = "Neutral";
  }

  if (waitAction === "Recommended") {
    if (buyAction === "Recommended") buyAction = "Neutral";
    if (addAction === "Recommended") addAction = "Neutral";
  }

  if (marketRegime === "risk_off") {
    if (buyAction === "Recommended") buyAction = "Neutral";
    else if (buyAction === "Neutral" && !insideBuyZone) buyAction = "Avoid";
    if (addAction === "Recommended") addAction = "Neutral";
    if (cspAction === "Recommended") cspAction = rateSensitiveProfile ? "Avoid" : "Neutral";
    if (ccAction === "Neutral") ccAction = "Recommended";
    waitAction = "Recommended";
  }

  if (hawkishFedActive && rateSensitiveProfile) {
    if (cspAction === "Recommended") cspAction = "Neutral";
    else if (cspAction === "Neutral") cspAction = "Avoid";
  }

  if (ccAction === "Recommended" && shortRating === "Strong Buy") {
    ccAction = "Neutral";
  }

  return {
    buy_stock: makeEntry(
      buyAction,
      buyAction === "Recommended" ? 4 : buyAction === "Neutral" ? 3 : 1,
      buyAction === "Recommended"
        ? (currentLanguage === "zh" ? "价格已经回到理想买入区附近，短期和中长期条件都不算差。" : "Price has moved back toward the ideal buy zone and the broader setup is still acceptable.")
        : buyAction === "Neutral"
          ? (marketRegime === "risk_off"
            ? (currentLanguage === "zh" ? "公司逻辑还在，但当前宏观环境偏防守，更适合分批和耐心等待。" : "The thesis is still alive, but the macro backdrop is risk-off, so patience and smaller sizing make more sense.")
            : (currentLanguage === "zh" ? "公司逻辑还在，但当前价格位置一般，不适合重手追进去。" : "The thesis is still alive, but the current entry quality is only average."))
          : (currentLanguage === "zh" ? "当前价格位置和趋势条件都不支持主动买入。" : "Price location and trend conditions do not support an active stock entry right now."),
      { suggested_zone: `${formatCurrency(idealBuyZone.low, row.currencyCode)} - ${formatCurrency(idealBuyZone.high, row.currencyCode)}`, risk_note: marketRegime === "risk_off" ? (currentLanguage === "zh" ? "风险偏好下降时，不在理想买入区尽量不要追高。" : "When the tape is risk-off, avoid chasing size away from the ideal buy zone.") : (currentLanguage === "zh" ? "如果不是在理想买入区，尽量不要一次性追高。" : "Avoid chasing full size outside the ideal buy zone.") },
    ),
    add_position: makeEntry(
      addAction,
      addAction === "Recommended" ? 4 : addAction === "Neutral" ? 2 : 1,
      addAction === "Recommended"
        ? (currentLanguage === "zh" ? "价格靠近支撑并且中长期评级至少是买入，更适合分批加仓。" : "Price is close to support and the mid / long-term ratings still justify a staged add.")
        : addAction === "Neutral"
          ? (marketRegime === "risk_off"
            ? (currentLanguage === "zh" ? "支撑区可以观察，但风险偏好偏弱时先不要急着加仓。" : "Support is worth watching, but a risk-off regime argues for slower adds.")
            : (currentLanguage === "zh" ? "可以观察支撑区，但暂时还没到理想加仓性价比。" : "Support is worth watching, but the add setup is not compelling enough yet."))
          : (currentLanguage === "zh" ? "加仓条件不满足，先不要提高仓位。" : "The add criteria are not met, so it is better not to size up yet."),
      { suggested_zone: `${formatCurrency(addZoneLow, row.currencyCode)} - ${formatCurrency(addZoneHigh, row.currencyCode)}`, risk_note: marketRegime === "risk_off" ? (currentLanguage === "zh" ? "风险偏防守时，只在强支撑附近小仓位加。" : "In a risk-off regime, only add small near strong support.") : (currentLanguage === "zh" ? "只有在接近理想买入区、并且趋势没有明显走坏时才考虑加仓。" : "Only add when price is close to the ideal buy zone and the trend has not broken down.") },
    ),
    cash_secured_put: {
      action: cspAction,
      stars: cspAction === "Recommended" ? 5 : cspAction === "Neutral" ? 3 : 1,
      suggested_strike: optionsModule.cash_secured_put.suggested_strike,
      suggested_dte: hawkishFedActive && rateSensitiveProfile ? (currentLanguage === "zh" ? "21-30 DTE" : "21-30 DTE") : optionsModule.cash_secured_put.suggested_dte,
      suggested_zone: optionsModule.cash_secured_put.ideal_buy_zone_relation,
      reason: hawkishFedActive && rateSensitiveProfile
        ? (currentLanguage === "zh" ? `${optionsModule.cash_secured_put.reason} 当前存在利率 / 偏鹰 Fed 压力，Sell Put 需要更保守。` : `${optionsModule.cash_secured_put.reason} A hawkish Fed and rates pressure argue for a more conservative sell-put setup.`)
        : optionsModule.cash_secured_put.reason,
      risk_note: hawkishFedActive && rateSensitiveProfile
        ? `${t("assignmentRisk")}: ${optionsModule.cash_secured_put.assignment_risk} · ${currentLanguage === "zh" ? "利率风险上升，建议更低 strike、更短 DTE。" : "Rate risk is elevated, so favor lower strikes and shorter DTE."}`
        : `${t("assignmentRisk")}: ${optionsModule.cash_secured_put.assignment_risk}`,
    },
    covered_call: {
      action: ccAction,
      stars: ccAction === "Recommended" ? 4 : ccAction === "Neutral" ? 2 : 1,
      suggested_strike: optionsModule.covered_call.suggested_strike,
      suggested_dte: optionsModule.covered_call.suggested_dte,
      suggested_zone: optionsModule.covered_call.resistance_relation,
      reason: (marketRegime === "risk_off" || hawkishFedActive)
        ? (currentLanguage === "zh" ? `${optionsModule.covered_call.reason} 偏防守环境下，如果股价接近压力位，Covered Call 相对更合适。` : `${optionsModule.covered_call.reason} In a risk-off backdrop, covered calls become relatively more attractive near resistance.`)
        : optionsModule.covered_call.reason,
      risk_note: `${t("assignmentRisk")}: ${optionsModule.covered_call.assignment_risk}`,
    },
    take_profit: makeEntry(
      takeProfitAction,
      takeProfitAction === "Recommended" ? 4 : takeProfitAction === "Neutral" ? 2 : 1,
      takeProfitAction === "Recommended"
        ? (currentLanguage === "zh" ? "股价已经接近更高一级压力位，而且技术过热信号开始增多，可以考虑部分止盈或减仓。" : "Price is close to higher resistance and overheating signals are building, so partial profit-taking is reasonable.")
        : takeProfitAction === "Neutral"
          ? (currentLanguage === "zh" ? "已经靠近压力区，可以开始规划但不一定马上执行。" : "Price is nearing resistance, so it is worth planning but not necessarily acting immediately.")
          : (currentLanguage === "zh" ? "当前还不属于典型止盈环境。" : "This is not a classic take-profit environment yet."),
      { suggested_zone: supportResistance.resistances[0]?.price ? formatCurrency(supportResistance.resistances[0].price, row.currencyCode) : t("dataUnavailable"), risk_note: currentLanguage === "zh" ? "过早止盈可能错过趋势延续。" : "Exiting too early can cap trend continuation." },
    ),
    wait_no_action: makeEntry(
      waitAction,
      waitAction === "Recommended" ? 5 : 3,
      waitAction === "Recommended"
        ? (marketRegime === "risk_off"
          ? (currentLanguage === "zh" ? "当前市场环境偏防守，先等待更好的赔率通常更合适。" : "The market backdrop is risk-off, so waiting for a cleaner setup is usually better.")
          : (currentLanguage === "zh" ? "当前价格不在理想埋伏区，或者不同周期信号仍有冲突，更适合先等等。" : "Price is not in the ideal ambush zone or the signals still conflict, so waiting is cleaner."))
        : (currentLanguage === "zh" ? "可以继续观察，但没有必要强行空仓等待。" : "Patience is still fine here, but there is no need to force a no-action stance."),
      { suggested_zone: `${formatCurrency(idealBuyZone.low, row.currencyCode)} - ${formatCurrency(idealBuyZone.high, row.currencyCode)}`, risk_note: currentLanguage === "zh" ? "等待不代表看空，而是等更好的赔率。" : "Waiting is not bearish by itself; it means waiting for a cleaner risk / reward." },
    ),
  };
}

function buildDataQuality(row, optionsModule, marketContext, idealBuyZone = null, companyProfile = null) {
  const missingFields = [];
  const warnings = [];
  const staleFields = [];
  const isUs = isUsMarket(row);
  const profileMissing = companyProfile?.missing_classification_data || [];
  if (isUs && !optionsModule.put_wall) missingFields.push("options.put_wall");
  if (isUs && !optionsModule.call_wall) missingFields.push("options.call_wall");
  if (isUs && marketContext.market_engine?.vix?.value == null) missingFields.push("market_context.vix");
  if (isUs && marketContext.market_engine?.fear_greed?.value == null) missingFields.push("market_context.fear_greed");
  if (isUs && marketContext.market_engine?.ten_year_yield?.value == null) missingFields.push("market_context.ten_year_yield");
  if (isUs && marketContext.market_engine?.equity_trend?.spy?.value == null && marketContext.market_engine?.equity_trend?.qqq?.value == null) missingFields.push("market_context.equity_trend");
  profileMissing.forEach((field) => missingFields.push(`company_profile.${field}`));
  if (row.noData) warnings.push(t("noMarketData"));
  if (isCnAShare(row)) {
    warnings.push(currentLanguage === "zh" ? "A股暂不使用美股期权和美股市场环境数据。" : "A-share scoring does not use US options or US market-context data.");
  }
  if (isUs && missingFields.length) warnings.push(currentLanguage === "zh" ? "部分模块仍缺少外部数据源。" : "Some modules still need external data feeds.");
  if (profileMissing.length) warnings.push(currentLanguage === "zh" ? "公司画像使用了部分缺失字段的中性回退。" : "The company-profile classifier used neutral fallbacks for some missing fields.");
  if (row.marketStatus === "closed" || row.dataStaleness === "stale") staleFields.push("price");
  if (idealBuyZone?.outlier_detected) {
    warnings.push(idealBuyZone.warning || (currentLanguage === "zh" ? "理想买入区曾出现异常值，当前显示的是安全回退区间。" : "The ideal buy zone had an outlier, so the current view shows a safer fallback zone."));
    missingFields.push("ideal_buy_zone_outlier_detected");
  }
  return { missing_fields: missingFields, warnings, stale_fields: staleFields };
}

function buildDecisionModel(row) {
  const marketType = schemaMarketTypeForTicker(row);
  const research = row.research || buildLongTermResearch(row);
  const companyProfile = buildCompanyProfile(row, research);
  const supportResistance = buildSupportResistanceSchema(row);
  const buyZones = buildBuyZones(row, supportResistance, companyProfile);
  const idealBuyZone = buyZones.primary_buy_zone;
  const technical = buildTechnicalModule(row, supportResistance, companyProfile);
  const fundamental = buildFundamentalModule(row, research);
  const placeholderAi = { short_term: { rating: "Hold" }, mid_term: { rating: "Hold" }, long_term: { rating: "Hold" } };
  const options = buildOptionsModule(row, supportResistance, idealBuyZone, {
    shortTermRating: placeholderAi.short_term.rating,
    midTermRating: placeholderAi.mid_term.rating,
    longTermRating: placeholderAi.long_term.rating,
    technical,
    buyZones,
    companyProfile,
  });
  const marketContext = buildMarketContextModule(row, companyProfile);
  const modules = { technical, fundamental, options, market_context: marketContext };
  const hardBearishOverride = buildHardBearishOverride(row, modules, supportResistance, idealBuyZone);
  const decisionContext = { idealBuyZone, supportResistance, hard_bearish_override: hardBearishOverride, market_type: marketType };
  const aiDecision = {
    short_term: buildHorizonDecision(row, "short", companyProfile, modules, decisionContext),
    mid_term: buildHorizonDecision(row, "mid", companyProfile, modules, decisionContext),
    long_term: buildHorizonDecision(row, "long", companyProfile, modules, decisionContext),
  };
  aiDecision.overall_score = Math.round((aiDecision.short_term.score * 0.25) + (aiDecision.mid_term.score * 0.35) + (aiDecision.long_term.score * 0.4));
  aiDecision.final_ai_score = aiDecision.overall_score;
  aiDecision.final_rating = scoreBucketLabel(aiDecision.overall_score);
  aiDecision.overall_confidence = Math.round(mean([
    aiDecision.short_term.confidence,
    aiDecision.mid_term.confidence,
    aiDecision.long_term.confidence,
  ]) ?? 50);
  aiDecision.overall_score_formula = currentLanguage === "zh" ? "短期 25% + 中期 35% + 长期 40%" : "short_term 25% + mid_term 35% + long_term 40%";
  aiDecision.bullish_reasons = buildAiReasons(row).positives.slice(0, 5);
  aiDecision.risk_reasons = buildAiReasons(row).warnings.slice(0, 5);
  const refreshedOptions = buildOptionsModule(row, supportResistance, idealBuyZone, {
    shortTermRating: aiDecision.short_term.rating,
    midTermRating: aiDecision.mid_term.rating,
    longTermRating: aiDecision.long_term.rating,
    technical,
    buyZones,
    companyProfile,
  });
  const consistency = enforceDecisionConsistency(row, aiDecision, idealBuyZone, supportResistance, { technical, fundamental, options: refreshedOptions, market_context: marketContext }, null);
  const refreshedModules = { technical, fundamental, options: refreshedOptions, market_context: marketContext };
  const shortSetupCandidates = [
    buildShortSetup(row, companyProfile, refreshedModules, supportResistance, idealBuyZone, "short"),
    buildShortSetup(row, companyProfile, refreshedModules, supportResistance, idealBuyZone, "mid"),
    buildShortSetup(row, companyProfile, refreshedModules, supportResistance, idealBuyZone, "long"),
  ].sort((a, b) => b.score - a.score);
  const shortSetup = shortSetupCandidates[0] || buildShortSetup(row, companyProfile, refreshedModules, supportResistance, idealBuyZone, "short");
  if (shortSetup.qualified && shortSetup.display_rating && shortSetup.score >= 85 && marketType !== "CN_A_SHARE") {
    const targetKey = shortSetup.timeframe === "mid"
      ? "mid_term"
      : shortSetup.timeframe === "long"
        ? "long_term"
        : "short_term";
    if (consistency.aiDecision[targetKey]) {
      consistency.aiDecision[targetKey].rating = "Short";
      consistency.aiDecision[targetKey].reasons = [...shortSetup.reasons, ...(consistency.aiDecision[targetKey].reasons || [])].slice(0, 3);
    }
  }
  consistency.aiDecision.overall_score = Math.round((consistency.aiDecision.short_term.score * 0.25) + (consistency.aiDecision.mid_term.score * 0.35) + (consistency.aiDecision.long_term.score * 0.4));
  consistency.aiDecision.final_ai_score = consistency.aiDecision.overall_score;
  consistency.aiDecision.final_rating = scoreBucketLabel(consistency.aiDecision.overall_score);
  consistency.aiDecision.overall_score_formula = currentLanguage === "zh" ? "短期 25% + 中期 35% + 长期 40%" : "short_term 25% + mid_term 35% + long_term 40%";
  const recommendedBuyPlan = buildRecommendedBuyPlan(row, buyZones, consistency.aiDecision, technical, supportResistance);
  const stopLossPlan = buildStopLossPlan(row, buyZones, supportResistance, companyProfile, consistency.aiDecision, technical);
  const dataQuality = buildDataQuality(row, refreshedOptions, marketContext, idealBuyZone, companyProfile);
  if (consistency.conflict_warning) dataQuality.warnings.unshift(consistency.conflict_warning.message);

  return {
    ticker: row.ticker,
    market_type: marketType,
    company_name: companyNameForTicker(row.ticker, row),
    current_price: row.price ?? null,
    today_change_pct: row.changePercent ?? null,
    company_profile: companyProfile,
    ai_decision: consistency.aiDecision,
    ideal_buy_zone: idealBuyZone,
    buy_zones: {
      ...buyZones,
      primary_buy_zone: recommendedBuyPlan.primary_buy_zone,
      momentum_entry: recommendedBuyPlan.momentum_entry,
      deep_pullback_zone: recommendedBuyPlan.deep_pullback_zone,
    },
    recommended_buy_plan: recommendedBuyPlan,
    stop_loss_plan: stopLossPlan,
    support_levels: supportResistance.supports,
    resistance_levels: supportResistance.resistances,
    short_setup: shortSetup,
    score_breakdown: {
      short_term: consistency.aiDecision.short_term.score_breakdown,
      mid_term: consistency.aiDecision.mid_term.score_breakdown,
      long_term: consistency.aiDecision.long_term.score_breakdown,
    },
    technical,
    fundamental,
    options: refreshedOptions,
    market_context: marketContext,
    conflict_warning: consistency.conflict_warning,
    hard_bearish_override: consistency.hard_bearish_override,
    data_quality: dataQuality,
  };
}

function selectedRow() {
  return tickerRows.find((item) => item.ticker === selectedTicker) || tickerRows[0] || null;
}

function renderDetailModal(row) {
  const modal = document.querySelector("#detailModal");
  if (!modal || !row) return;

  modal.hidden = !modalOpen;
  if (!modalOpen) {
    document.body.classList.remove("modal-open");
    return;
  }

  document.body.classList.add("modal-open");
  const sheet = modal.querySelector(".detail-sheet");
  if (!sheet) return;

  const decision = row.decisionModel || buildDecisionModel(row);
  const companyName = decision.company_name || companyNameForTicker(row.ticker, row);
  const exchange = exchangeCodeForTicker(row.ticker, row);
  const currencyCode = row.currencyCode || inferCurrencyCode(row);
  const ai = decision.ai_decision;
  const technical = decision.technical;
  const fundamental = decision.fundamental;
  const options = decision.options;
  const marketContext = decision.market_context;
  const marketEngine = marketContext.market_engine || {};
  const profile = decision.company_profile;
  const isCnMarket = decision.market_type === "CN_A_SHARE";
  const isUsStock = decision.market_type === "US";
  const changeTone = Number.isFinite(row.changePercent) ? (row.changePercent >= 0 ? "buy" : "sell") : "hold";
  const tabItems = [
    { key: "summary", label: t("aiDecision") },
    { key: "technical", label: t("tabTechnical") },
    { key: "fundamental", label: t("tabFundamental") },
    ...(isUsStock ? [{ key: "options", label: t("tabOptions") }] : []),
    { key: "news", label: t("tabNews") },
  ];
  if (isCnMarket && detailActiveTab === "options") detailActiveTab = "summary";

  const localizedStrategyAction = (value) => {
    if (value === "Recommended") return t("recommended");
    if (value === "Neutral") return t("neutral");
    if (value === "Avoid") return t("avoid");
    return value || t("dataUnavailable");
  };
  const displayValue = (value, formatter, fallback = t("dataUnavailable")) => (
    value == null || (typeof value === "number" && !Number.isFinite(value)) ? fallback : formatter(value)
  );
  const renderReasonBullets = (items, tone = "") => (
    items?.length
      ? items.map((item) => `<div class="decision-bullet ${tone}">${tone === "warning" ? "⚠" : tone === "positive" ? "✓" : "•"} ${localizedDashboardText(item)}</div>`).join("")
      : `<div class="decision-bullet muted">${t("dataUnavailable")}</div>`
  );
  const renderTags = (tags) => (
    tags?.length
      ? tags.map((tag) => `<span>${tag}</span>`).join("")
      : `<span>${t("dataUnavailable")}</span>`
  );
  const renderSourceInfo = (info) => {
    if (!info) return t("dataUnavailable");
    const status = info.status || t("dataUnavailable");
    if (String(status).toLowerCase() === "live") {
      return `${t("source")}: ${info.source_name || "—"}`;
    }
    return `${status} · ${t("missingSource")}: ${info.missing_source || "—"} · ${t("suggestedSource")}: ${info.suggested_source || "—"}`;
  };
  const localizeMarketSentiment = (value) => {
    if (!value) return t("dataUnavailable");
    if (value === "bullish") return currentLanguage === "zh" ? "偏多" : "Bullish";
    if (value === "bearish") return currentLanguage === "zh" ? "偏空" : "Bearish";
    if (value === "neutral") return currentLanguage === "zh" ? "中性" : "Neutral";
    if (value === "rising") return currentLanguage === "zh" ? "上行" : "Rising";
    if (value === "falling") return currentLanguage === "zh" ? "下行" : "Falling";
    if (value === "flat") return currentLanguage === "zh" ? "走平" : "Flat";
    if (value === "supportive") return currentLanguage === "zh" ? "偏支持" : "Supportive";
    if (value === "cautious") return currentLanguage === "zh" ? "偏谨慎" : "Cautious";
    return localizedDashboardText(value);
  };
  const renderHorizonCard = (title, block) => `
    <article class="decision-core-card ${ratingTone(block.rating)}">
      <span>${title}</span>
      <strong>${localizedActionLabel(block.rating)}</strong>
      <small>${block.horizon}</small>
      <small>${t("scoreLabel")}: ${block.score}/100 · ${t("confidencePct")} ${block.confidence}%</small>
      <small>${(block.reasons || []).slice(0, 2).map(localizedDashboardText).join(" · ") || t("dataUnavailable")}</small>
    </article>
  `;
  const renderBuyZoneCard = (title, zone, { hideUnavailable = false } = {}) => {
    const zoneLow = zone?.low ?? zone?.zone?.low ?? null;
    const zoneHigh = zone?.high ?? zone?.zone?.high ?? null;
    const available = ["available", "triggered"].includes(zone?.status) && zoneLow != null && zoneHigh != null;
    if (!available && hideUnavailable) return "";
    const isMomentum = zone?.plan_type === "momentum";
    const waiting = zone?.status === "waiting";
    const invalid = zone?.status === "invalid";
    const triggered = zone?.status === "triggered";
    const statusLabel = zone?.status === "triggered"
      ? (currentLanguage === "zh" ? "已触发" : "Triggered")
      : waiting
        ? (currentLanguage === "zh" ? "等待触发" : "Waiting")
        : invalid
          ? (currentLanguage === "zh" ? "不适用" : "Invalid")
          : t("dataUnavailable");
    const reasonItems = Array.isArray(zone?.reason) ? zone.reason : [];
    const missingItems = Array.isArray(zone?.missing_conditions) ? zone.missing_conditions : [];
    const triggerItems = Array.isArray(zone?.trigger_conditions) ? zone.trigger_conditions : [];
    const invalidItems = Array.isArray(zone?.top_invalid_reasons) && zone.top_invalid_reasons.length ? zone.top_invalid_reasons : reasonItems;
    const reasonText = reasonItems.length ? reasonItems.map(localizedDashboardText).join(" / ") : (typeof zone?.reason === "string" ? localizedDashboardText(zone.reason) : localizedDashboardText(zone?.summary));
    if (isMomentum && invalid) {
      return `
        <article class="decision-list-card">
          <div class="decision-list-title">${title}</div>
          <div class="detail-line-label">${statusLabel}</div>
          <div class="detail-line-note">${currentLanguage === "zh" ? "状态" : "Status"}: ${statusLabel}</div>
          <div class="detail-line-note">${currentLanguage === "zh" ? "含义" : "Meaning"}: ${localizedDashboardText(zone?.meaning || (currentLanguage === "zh" ? "当前趋势结构不足，量能和 OBV 不支持趋势买入。" : "Trend structure, volume, and OBV do not support a trend entry."))}</div>
          <div class="detail-line-note">${currentLanguage === "zh" ? "主要原因" : "Main Reasons"}: ${(invalidItems || []).slice(0, 3).map(localizedDashboardText).join(" / ") || (currentLanguage === "zh" ? "趋势结构不足" : "Trend structure is insufficient")}</div>
          <div class="detail-line-note">${currentLanguage === "zh" ? "操作" : "Action"}: ${localizedDashboardText(zone?.action || (currentLanguage === "zh" ? "不要追涨，优先关注主要买入区，或等待重新企稳。" : "Do not chase; focus on the Primary Buy Zone or wait for stabilization."))}</div>
        </article>
      `;
    }
    return `
      <article class="decision-list-card">
        <div class="decision-list-title">${title}</div>
        <div class="detail-line-label">
          ${available
            ? `${formatCurrency(zoneLow, currencyCode)} - ${formatCurrency(zoneHigh, currencyCode)}`
            : (waiting || invalid)
              ? statusLabel
              : t("dataUnavailable")}
        </div>
        ${(waiting || invalid || zone?.status === "triggered") ? `<div class="detail-line-note">${currentLanguage === "zh" ? "状态" : "Status"}: ${statusLabel}</div>` : ""}
        ${zone?.purpose ? `<div class="detail-line-note">${currentLanguage === "zh" ? "用途" : "Purpose"}: ${localizedDashboardText(zone.purpose)}</div>` : ""}
        ${zone?.trigger_price ? `<div class="detail-line-note">${currentLanguage === "zh" ? "触发价" : "Trigger Price"}: ${formatCurrency(zone.trigger_price, currencyCode)}</div>` : ""}
        ${zone?.meaning ? `<div class="detail-line-note">${currentLanguage === "zh" ? "含义" : "Meaning"}: ${localizedDashboardText(zone.meaning)}</div>` : ""}
        ${!isMomentum || triggered || waiting ? `<div class="detail-line-note">${t("confidencePct")}: ${zone?.confidence ?? 0}%</div>` : ""}
        ${!isMomentum ? `<div class="detail-line-note">${t("source")}: ${(zone?.sources || []).map(localizedDashboardText).join(" / ") || t("dataUnavailable")}</div>` : ""}
        ${!isMomentum && reasonText ? `<div class="detail-line-note">${reasonText}</div>` : ""}
        ${isMomentum && triggered ? `<div class="detail-line-note">${currentLanguage === "zh" ? "依据" : "Confirmed Conditions"}: ${reasonText || t("dataUnavailable")}</div>` : ""}
        ${isMomentum && waiting && missingItems.length ? `<div class="detail-line-note">${currentLanguage === "zh" ? "当前缺少" : "Missing"}: ${missingItems.slice(0, 3).map(localizedDashboardText).join(" / ")}</div>` : ""}
        ${isMomentum && waiting && triggerItems.length ? `<div class="detail-line-note">${currentLanguage === "zh" ? "等待条件" : "Trigger Conditions"}: ${triggerItems.map(localizedDashboardText).join(" / ")}</div>` : ""}
        ${zone?.action ? `<div class="detail-line-note">${currentLanguage === "zh" ? "操作" : "Action"}: ${localizedDashboardText(zone.action)}</div>` : ""}
      </article>
    `;
  };
  const renderStopLossPlan = (plan) => {
    if (!plan || (!plan.current_entry_stop && !plan.buy_zone_stop)) {
      return `<div class="decision-bullet muted">${t("dataUnavailable")}</div>`;
    }
    const currentStop = plan.current_entry_stop || {};
    const zoneStop = plan.buy_zone_stop || {};
    const renderStopCard = (title, stop, distanceLabel) => `
      <article class="decision-list-card">
        <div class="decision-list-title">${title}</div>
        <div class="detail-line-label">${stop.price == null ? t("dataUnavailable") : formatCurrency(stop.price, currencyCode)}</div>
        <div class="detail-line-note">${currentLanguage === "zh" ? "适用于" : "Applies To"}: ${localizedDashboardText(stop.applies_to || stop.applies_to_zone || t("dataUnavailable"))}</div>
        <div class="detail-line-note">${currentLanguage === "zh" ? "含义" : "Meaning"}: ${localizedDashboardText(stop.invalidation_reason || t("dataUnavailable"))}</div>
        <div class="detail-line-note">${currentLanguage === "zh" ? "动作" : "Action"}: ${localizedDashboardText(stop.action_if_triggered || t("dataUnavailable"))}</div>
        <div class="detail-line-note">${currentLanguage === "zh" ? "类型" : "Type"}: ${localizedDashboardText(stop.stop_type || t("dataUnavailable"))} · ${currentLanguage === "zh" ? "风险" : "Risk"}: ${localizedDashboardText(stop.risk_level || t("dataUnavailable"))}</div>
        <div class="detail-line-note">${distanceLabel}: ${stop.stop_distance_pct ?? stop.stop_distance_pct_from_zone_low ?? "—"}%</div>
        <div class="detail-line-note">${currentLanguage === "zh" ? "依据" : "Based On"}: ${(stop.based_on || []).map(localizedDashboardText).join(" / ") || t("dataUnavailable")}</div>
      </article>
    `;
    return `
      <div class="decision-summary-grid">
        ${renderStopCard(
          currentLanguage === "zh" ? "当前价止损" : "Current Entry Stop",
          currentStop,
          currentLanguage === "zh" ? "距当前价" : "Distance From Current Price",
        )}
        ${renderStopCard(
          currentLanguage === "zh" ? "买入区止损" : "Buy Zone Stop",
          zoneStop,
          currentLanguage === "zh" ? "距买入区下沿" : "Distance From Zone Low",
        )}
      </div>
    `;
  };
  const renderBreakdownRows = (block) => {
    const breakdown = block?.score_breakdown;
    if (!breakdown) return `<div class="decision-bullet muted">${t("dataUnavailable")}</div>`;
    const renderItemRows = (items, tone) => (
      items?.length
        ? `
          <div class="score-breakdown-items">
            ${items.map((item) => `
              <div class="score-breakdown-item ${tone}">
                <div class="score-breakdown-item-head">
                  <strong>${localizedScoreItemName(item.name)}</strong>
                  <span>${item.final_score > 0 ? "+" : ""}${item.final_score}</span>
                </div>
                <div class="detail-line-note">${localizedDashboardText(item.reason)}</div>
              </div>
            `).join("")}
          </div>
        `
        : `<div class="detail-line-note muted">${t("dataUnavailable")}</div>`
    );
    const moduleLabel = (key) => ({
      technical: currentLanguage === "zh" ? "技术面" : "Technical",
      long_term_technical: currentLanguage === "zh" ? "长期技术面" : "Long-Term Technical",
      volume_signal: currentLanguage === "zh" ? "成交量确认" : "Volume Signal",
      options: currentLanguage === "zh" ? "期权市场" : "Options",
      market_context: currentLanguage === "zh" ? "市场环境" : "Market Context",
      fundamental: currentLanguage === "zh" ? "基本面" : "Fundamental",
      sector_theme: currentLanguage === "zh" ? "行业 / 主题" : "Sector / Theme",
    }[key] || key);
    const rows = Object.keys(breakdown.contributions || {}).map((key) => [
      moduleLabel(key),
      breakdown.contributions[key],
      breakdown.contribution_caps?.[key] ?? Math.round((breakdown.weights?.[key] ?? 0) * 100),
    ]);
    const topBonuses = [...(breakdown.bonuses?.items || [])].sort((a, b) => b.final_score - a.final_score).slice(0, 3);
    const topPenalties = [...(breakdown.penalties?.items || [])].sort((a, b) => a.final_score - b.final_score).slice(0, 3);
    return `
      <div class="score-breakdown-grid">
        ${rows.map(([label, value, cap]) => `
          <div class="score-breakdown-row">
            <span>${label}</span>
            <strong>${value} / ${cap}</strong>
            <em>${t("scoreLabel")}</em>
          </div>
        `).join("")}
        <div class="score-breakdown-row total">
          <span>${t("finalScore")}</span>
          <strong>${breakdown.final_score}/100</strong>
          <em>${block.horizon}</em>
        </div>
      </div>
      <div class="detail-line-list">
        <div class="detail-line-row">
          <div>
            <div class="detail-line-label">${currentLanguage === "zh" ? "Top 3 加分" : "Top 3 Positive Drivers"}</div>
            ${renderItemRows(topBonuses, "positive")}
          </div>
        </div>
        <div class="detail-line-row">
          <div>
            <div class="detail-line-label">${currentLanguage === "zh" ? "Top 3 扣分" : "Top 3 Risk Drivers"}</div>
            ${renderItemRows(topPenalties, "warning")}
          </div>
        </div>
      </div>
    `;
  };
  const renderLevelSummary = (levels, labelKeyNearest, labelKeyStrongest) => {
    const nearest = [...(levels || [])].sort((a, b) => Math.abs((a.distance_pct ?? 999) - (b.distance_pct ?? 999)))[0];
    const strongest = [...(levels || [])].sort((a, b) => (b.points ?? 0) - (a.points ?? 0))[0];
    return `
      <div class="sr-summary-grid">
        <div class="decision-list-card">
          <div class="decision-list-title">${t(labelKeyNearest)}</div>
          <div class="detail-line-label">${nearest ? `${nearest.level} · ${formatCurrency(nearest.price, currencyCode)}` : t("dataUnavailable")}</div>
          <div class="detail-line-note">${nearest ? `${t("strength")}: ${localizedStrength(nearest.strength)}` : ""}</div>
        </div>
        <div class="decision-list-card">
          <div class="decision-list-title">${t(labelKeyStrongest)}</div>
          <div class="detail-line-label">${strongest ? `${strongest.level} · ${formatCurrency(strongest.price, currencyCode)}` : t("dataUnavailable")}</div>
          <div class="detail-line-note">${strongest ? `${t("strength")}: ${localizedStrength(strongest.strength)}` : ""}</div>
        </div>
      </div>
    `;
  };
  const renderLevelRows = (levels) => (
    levels?.length
      ? levels.map((level) => `
        <div class="detail-line-row">
          <div>
            <div class="detail-line-label">${level.level} · ${formatCurrency(level.price, currencyCode)}</div>
            <div class="detail-line-note">${t("source")}: ${(level.sources || level.source || []).map(localizedDashboardText).join(" / ")} · ${t("strength")}: ${level.strength_label || localizedStrength(level.strength)}</div>
          </div>
          <div class="detail-line-side"><strong>${level.strength_label || localizedStrength(level.strength)}</strong></div>
        </div>
      `).join("")
      : `<div class="decision-bullet muted">${t("dataUnavailable")}</div>`
  );
  const renderStrategyRows = () => {
    const order = [
      ["buy_stock", t("buyStock")],
      ["add_position", t("addPosition")],
      ["cash_secured_put", t("cashSecuredPut")],
      ["covered_call", t("coveredCall")],
      ["take_profit", t("takeProfit")],
      ["wait_no_action", t("waitNoAction")],
    ];
    return order.map(([key, label]) => {
      const item = decision.strategy_matrix[key];
      return `
        <div class="detail-line-row">
          <div>
            <div class="detail-line-label">${label}</div>
            <div class="detail-line-note">${item.reason || t("dataUnavailable")}</div>
            <div class="detail-line-note">
              ${item.suggested_zone ? `${t("suggestedZone")}: ${item.suggested_zone}` : ""}
              ${item.suggested_strike ? `${item.suggested_zone ? " · " : ""}${t("suggestedStrike")}: ${formatOptionStrike(item.suggested_strike, currencyCode)}` : ""}
              ${item.suggested_dte ? `${(item.suggested_zone || item.suggested_strike) ? " · " : ""}${t("suggestedDte")}: ${item.suggested_dte}` : ""}
            </div>
          </div>
          <div class="detail-line-side">
            <span class="decision-badge ${strategyTone(item.action)}">${localizedStrategyAction(item.action)}</span>
            <span class="detail-line-note">${"★".repeat(item.stars || 0)}${"☆".repeat(Math.max(0, 5 - (item.stars || 0)))}</span>
            <span class="detail-line-note">${item.risk_note || ""}</span>
          </div>
        </div>
      `;
    }).join("");
  };
  const renderOptionsPlanRows = (plan) => {
    if (!plan || plan.status === "not_supported") {
      return `<div class="decision-bullet muted">${currentLanguage === "zh" ? "该市场暂不支持期权策略计划。" : "Options strategy plans are not supported for this market."}</div>`;
    }
    if (plan.status !== "available" || !plan.plans?.length) {
      return `<div class="decision-bullet muted">${t("optionsUnavailable")}</div>`;
    }
    return plan.plans.map((item) => `
      <div class="detail-line-row">
        <div>
          <div class="detail-line-label">${item.dte}D · ${item.suggested_strike == null ? t("dataUnavailable") : formatOptionStrike(item.suggested_strike, currencyCode)}</div>
          <div class="detail-line-note">${localizedDashboardText(item.reason || t("dataUnavailable"))}</div>
          <div class="detail-line-note">${t("source")}: ${(item.sources || []).map(localizedDashboardText).join(" / ") || t("dataUnavailable")}</div>
        </div>
        <div class="detail-line-side">
          <strong>${currentLanguage === "zh" ? "风险" : "Risk"}: ${localizedDashboardText(item.risk_level || t("dataUnavailable"))}</strong>
          <span class="detail-line-note">${t("assignmentRisk")}: ${localizedDashboardText(item.assignment_risk || t("dataUnavailable"))}</span>
        </div>
      </div>
    `).join("");
  };
  const localizedNewsHeadline = (item) => {
    if (currentLanguage !== "zh") return item.headline || t("dataUnavailable");
    const headline = String(item.headline || "");
    if (/securities fraud|class action|lawsuit|legal|investigation/i.test(headline)) return "证券诉讼或调查相关消息";
    if (/earnings|quarter|revenue|profit|guidance/i.test(headline)) return "财报或业绩指引相关消息";
    if (/analyst|rating|price target|upgrade|downgrade/i.test(headline)) return "分析师评级或目标价相关消息";
    if (/dividend|buyback|repurchase/i.test(headline)) return "分红或回购相关消息";
    if (/ai|artificial intelligence|cloud|data center/i.test(headline)) return "AI、云或数据中心相关消息";
    if (/options|volatility|short interest/i.test(headline)) return "期权、波动率或做空相关消息";
    return "公司新闻";
  };
  const renderMetricRows = (rows) => rows.map((entry) => {
    const value = typeof entry.value === "string" ? localizedDashboardText(entry.value) : entry.value;
    const note = typeof entry.note === "string" ? localizedDashboardText(entry.note) : entry.note;
    return `
      <div class="detail-line-row">
        <div>
          <div class="detail-line-label">${entry.label}</div>
          ${note ? `<div class="detail-line-note">${note}</div>` : ""}
        </div>
        <div class="detail-line-side"><strong>${value}</strong></div>
      </div>
    `;
  }).join("");
  const renderNewsRows = (items) => (
    items?.length
      ? items.map((item) => `
        <div class="detail-line-row detail-news-row">
          <div>
            <div class="detail-line-label">${localizedNewsHeadline(item)}</div>
            <div class="detail-line-note">${currentLanguage === "zh" ? (item.published_at || t("dataUnavailable")) : ([item.source, item.published_at].filter(Boolean).join(" · ") || t("dataUnavailable"))}</div>
          </div>
          <div class="detail-line-side">
            ${item.link ? `<a class="detail-link" href="${item.link}" target="_blank" rel="noreferrer">${currentLanguage === "zh" ? "打开" : "Open"}</a>` : `<strong>—</strong>`}
          </div>
        </div>
      `).join("")
      : `<div class="decision-bullet muted">${t("dataUnavailable")}</div>`
  );

  const summaryPanel = `
    <section class="detail-tab-section">
      <div class="decision-core-grid">
        ${renderHorizonCard(`${t("shortTerm")} · 1-30D`, ai.short_term)}
        ${renderHorizonCard(`${t("midTerm")} · 30-90D`, ai.mid_term)}
        ${renderHorizonCard(`${t("longTerm")} · 90-180D`, ai.long_term)}
        <article class="decision-core-card ${scoreToBand(ai.overall_score).tone}">
          <span>${t("overallAiScore")}</span>
          <strong>${ai.overall_score}/100</strong>
          <small>${t("confidencePct")} ${ai.overall_confidence}%</small>
          <small>${t("profileCategory")}: ${profile.category}</small>
        </article>
      </div>
      <section class="detail-card detail-overview-card">
        <div class="detail-overview-grid">
          <div>
            <div class="detail-overview-label">${t("companyProfile")}</div>
            <div class="detail-overview-value">${profile.category}</div>
            <div class="detail-consensus-mini">${renderTags(profile.tags_label)}</div>
          </div>
          <div>
            <div class="detail-overview-label">${t("currentPrice")}</div>
            <div class="detail-overview-value">${formatCurrentPrice(decision.current_price, currencyCode)}</div>
            <p class="detail-overview-reason">${t("dayMove")}: <span class="${changeTone}">${formatChangePercent(decision.today_change_pct)}</span></p>
          </div>
          <div>
            <div class="detail-overview-label">${t("overallAiScore")}</div>
            <div class="detail-overview-value">${ai.overall_score}/100</div>
            <p class="detail-overview-reason">${ai.overall_score_formula || (currentLanguage === "zh" ? "短期 25% + 中期 35% + 长期 40%" : "short_term 25% + mid_term 35% + long_term 40%")}</p>
            ${decision.conflict_warning ? `
              <div class="decision-warning-banner">
                <strong>${currentLanguage === "zh" ? "冲突提示" : "Conflict Warning"}</strong>
                <p>${decision.conflict_warning.message}</p>
                <div class="decision-bullets">${renderReasonBullets(decision.conflict_warning.reasons || [], "warning")}</div>
              </div>
            ` : ""}
          </div>
        </div>
      </section>
      <section class="detail-section-card">
        <div class="detail-section-head"><h3>${currentLanguage === "zh" ? "推荐买入计划" : "Recommended Buy Plan"}</h3></div>
        <div class="decision-summary-grid">
          ${[
            renderBuyZoneCard(
              decision.recommended_buy_plan?.primary_buy_zone?.title || (currentLanguage === "zh" ? "主要买入区" : "Primary Buy Zone"),
              decision.recommended_buy_plan?.primary_buy_zone || decision.buy_zones?.primary_buy_zone || decision.ideal_buy_zone,
            ),
            renderBuyZoneCard(
              decision.recommended_buy_plan?.momentum_entry?.title || (currentLanguage === "zh" ? "动量买入" : "Momentum Entry"),
              decision.recommended_buy_plan?.momentum_entry || decision.buy_zones?.momentum_entry_zone,
            ),
            renderBuyZoneCard(
              decision.recommended_buy_plan?.deep_pullback_zone?.title || (currentLanguage === "zh" ? "深度回调区" : "Deep Pullback Zone"),
              decision.recommended_buy_plan?.deep_pullback_zone || decision.buy_zones?.deep_pullback_zone,
            ),
          ].filter(Boolean).join("")}
        </div>
      </section>
      <section class="detail-section-card">
        <div class="detail-section-head"><h3>${currentLanguage === "zh" ? "止损计划" : "Stop Loss Plan"}</h3></div>
        ${renderStopLossPlan(decision.stop_loss_plan)}
      </section>
      <section class="detail-section-card">
        <div class="detail-section-head"><h3>${t("supportLevels")}</h3></div>
        ${renderLevelSummary(decision.support_levels, "nearestSupport", "strongestSupport")}
        ${renderLevelSummary(decision.resistance_levels, "nearestResistance", "strongestResistance")}
        <div class="decision-summary-grid">
          <div class="decision-list-card">
            <div class="decision-list-title">${t("supportLevels")}</div>
            <div class="detail-line-list">${renderLevelRows(decision.support_levels)}</div>
          </div>
          <div class="decision-list-card">
            <div class="decision-list-title">${t("resistanceLevels")}</div>
            <div class="detail-line-list">${renderLevelRows(decision.resistance_levels)}</div>
          </div>
        </div>
      </section>
      ${isUsStock ? `
        <section class="detail-section-card">
          <div class="detail-section-head"><h3>${currentLanguage === "zh" ? "期权策略计划" : "Options Strategy Plan"}</h3></div>
          <div class="decision-summary-grid">
            <div class="decision-list-card">
              <div class="decision-list-title">${currentLanguage === "zh" ? "卖出看跌期权计划" : "Sell Put Plan"}</div>
              <div class="detail-line-list">${renderOptionsPlanRows(options.sell_put_plan)}</div>
            </div>
            <div class="decision-list-card">
              <div class="decision-list-title">${currentLanguage === "zh" ? "备兑看涨期权计划" : "Covered Call Plan"}</div>
              <div class="detail-line-list">${renderOptionsPlanRows(options.covered_call_plan)}</div>
            </div>
          </div>
        </section>
      ` : ""}
      <section class="detail-section-card">
        <div class="detail-section-head"><h3>${t("topReasons")}</h3></div>
        <div class="decision-summary-grid">
          <div class="decision-list-card">
            <div class="decision-list-title">${t("bullishReasons")}</div>
            <div class="decision-bullets">${renderReasonBullets(ai.bullish_reasons, "positive")}</div>
          </div>
          <div class="decision-list-card">
            <div class="decision-list-title">${t("bearishReasons")}</div>
            <div class="decision-bullets">${renderReasonBullets(ai.risk_reasons, "warning")}</div>
          </div>
        </div>
      </section>
      <section class="detail-section-card">
        <div class="detail-section-head"><h3>${t("companyProfile")}</h3></div>
        <div class="detail-profile-grid">
          <article class="detail-profile-item">
            <div class="detail-profile-label">${currentLanguage === "zh" ? "主要类别" : "Primary Category"}</div>
            <div class="detail-profile-value">${profile.primary_category_label || profile.category || t("dataUnavailable")}</div>
          </article>
          <article class="detail-profile-item">
            <div class="detail-profile-label">${currentLanguage === "zh" ? "分类置信度" : "Classification Confidence"}</div>
            <div class="detail-profile-value">${profile.classification_confidence ?? 0}%</div>
          </article>
          <article class="detail-profile-item detail-profile-item-wide">
            <div class="detail-profile-label">${currentLanguage === "zh" ? "标签" : "Tags"}</div>
            <div class="detail-consensus-mini detail-profile-tags">${renderTags(profile.top_tags_label || profile.tags_label)}</div>
          </article>
          <article class="detail-profile-item detail-profile-item-full">
            <div class="detail-profile-label">${currentLanguage === "zh" ? "为什么这样分类" : "Why"}</div>
            <ul class="detail-profile-list">
              ${((profile.classification_reasons || []).length
                ? profile.classification_reasons
                : [t("dataUnavailable")])
                .map((reason) => `<li>${localizedDashboardText(reason)}</li>`).join("")}
            </ul>
          </article>
          <article class="detail-profile-item detail-profile-item-full">
            <div class="detail-profile-label">${currentLanguage === "zh" ? "评分影响" : "Scoring Impact"}</div>
            <ul class="detail-profile-list">
              ${((profile.scoring_impact || []).length
                ? profile.scoring_impact
                : [t("dataUnavailable")])
                .map((reason) => `<li>${localizedDashboardText(reason)}</li>`).join("")}
            </ul>
          </article>
          ${PROFILE_DEBUG_MODE ? `
            <article class="detail-profile-item detail-profile-item-full">
              <div class="detail-profile-label">${currentLanguage === "zh" ? "Debug: Full / Rejected Tags" : "Debug: Full / Rejected Tags"}</div>
              <div class="detail-line-note">${currentLanguage === "zh" ? "完整标签" : "Full Tags"}: ${(profile.full_tags_label || []).join(" / ") || t("dataUnavailable")}</div>
              <div class="detail-line-note">${currentLanguage === "zh" ? "暴露标签" : "Exposure Tags"}: ${(profile.exposure_tags_label || []).join(" / ") || t("dataUnavailable")}</div>
              <div class="detail-line-note">${currentLanguage === "zh" ? "拒绝标签" : "Rejected"}: ${(profile.rejected_tags || []).map((item) => `${localizedProfileTag(item.tag)} (${localizedDashboardText(item.reason)})`).join(" / ") || t("dataUnavailable")}</div>
            </article>
          ` : ""}
        </div>
      </section>
      <section class="detail-section-card">
        <div class="detail-section-head"><h3>${t("scoreBreakdown")}</h3></div>
        <details class="score-breakdown-toggle"${DEV_MODE ? " open" : ""}>
          <summary>${currentLanguage === "zh" ? "展开查看每个周期的评分构成" : "Expand to inspect how each horizon score was built"}</summary>
          <div class="decision-summary-grid">
            <div class="decision-list-card">
              <div class="decision-list-title">${t("shortTerm")}</div>
              ${renderBreakdownRows(ai.short_term)}
            </div>
            <div class="decision-list-card">
              <div class="decision-list-title">${t("midTerm")}</div>
              ${renderBreakdownRows(ai.mid_term)}
            </div>
            <div class="decision-list-card">
              <div class="decision-list-title">${t("longTerm")}</div>
              ${renderBreakdownRows(ai.long_term)}
            </div>
          </div>
        </details>
      </section>
    </section>
  `;

  const technicalPanel = `
    <section class="detail-tab-section">
      <div class="decision-target-grid">
        <article class="detail-kpi-card ${scoreToBand(technical.technical_score).tone}"><span>${t("technicalScore")}</span><strong>${technical.technical_score}/100</strong><small>${localizedDashboardText(technical.summary)}</small></article>
        <article class="detail-kpi-card ${scoreToBand(technical.trend_score).tone}"><span>${t("trendScore")}</span><strong>${technical.trend_score}/100</strong><small>${localizedDashboardText(technical.trend.state)}</small></article>
        <article class="detail-kpi-card ${scoreToBand(technical.momentum_score).tone}"><span>${t("momentumScore")}</span><strong>${technical.momentum_score}/100</strong><small>${localizedDashboardText(technical.momentum.state)}</small></article>
        <article class="detail-kpi-card ${scoreToBand(technical.volume_confirmation_score).tone}"><span>${t("volumeConfirmationScore")}</span><strong>${technical.volume_confirmation_score}/100</strong><small>${currentLanguage === "zh" ? "已计入AI评分" : "Included in AI score"}</small></article>
      </div>
      <section class="detail-section-card">
        <div class="detail-section-head"><h3>${t("trend")}</h3></div>
        <div class="detail-line-list">${renderMetricRows([
          { label: "MA10", value: displayValue(technical.trend.ma10, (value) => formatCurrency(value, currencyCode)) },
          { label: "MA20", value: displayValue(technical.trend.ma20, (value) => formatCurrency(value, currencyCode)) },
          { label: "MA50", value: displayValue(technical.trend.ma50, (value) => formatCurrency(value, currencyCode)) },
          { label: "MA100", value: displayValue(technical.trend.ma100, (value) => formatCurrency(value, currencyCode)) },
          { label: "MA200", value: displayValue(technical.trend.ma200, (value) => formatCurrency(value, currencyCode)) },
          { label: "MACD", value: displayValue(technical.trend.macd, (value) => formatSignedCurrency(value, currencyCode)) },
          { label: "Fibonacci", value: displayValue(technical.trend.fibonacci, (value) => formatPercentage(value)) },
          { label: t("summary"), value: localizedDashboardText(technical.trend.state) },
        ])}</div>
      </section>
      <section class="detail-section-card">
        <div class="detail-section-head"><h3>${t("momentum")}</h3></div>
        <div class="detail-line-list">${renderMetricRows([
          { label: "RSI", value: displayValue(technical.momentum.rsi, (value) => formatOneDecimal(value)), note: technical.momentum.rsi_state },
          { label: "KDJ", value: technical.momentum.kdj ? `K ${formatOneDecimal(technical.momentum.kdj.k)} / D ${formatOneDecimal(technical.momentum.kdj.d)} / J ${formatOneDecimal(technical.momentum.kdj.j)}` : t("dataUnavailable"), note: technical.momentum.kdj_state },
          { label: t("macdHistogram"), value: displayValue(technical.momentum.macd_histogram, (value) => formatSignedCurrency(value, currencyCode)) },
          { label: currentLanguage === "zh" ? "布林带位置" : "Bollinger Position", value: technical.momentum.bollinger_position },
        ])}</div>
      </section>
      <section class="detail-section-card">
        <div class="detail-section-head"><h3>${t("volumeConfirmation")}</h3></div>
        <div class="detail-line-list">${renderMetricRows([
          { label: currentLanguage === "zh" ? "量能状态" : "Volume Status", value: technical.volume_confirmation.status_label || technical.volume_confirmation.status || t("dataUnavailable"), note: currentLanguage === "zh" ? "状态仅用于解释，最终评级看AI决策页。" : "Status is explanatory only; final ratings live in AI Decision." },
          { label: currentLanguage === "zh" ? "量价行为" : "Price / Volume Behavior", value: technical.volume_confirmation.behavior_label || t("dataUnavailable"), note: technical.volume_confirmation.behavior },
          { label: currentLanguage === "zh" ? "短 / 中 / 长期量能分数" : "Short / Mid / Long Volume Scores", value: `${technical.volume_confirmation.short_term_volume_signal?.score ?? "—"} / ${technical.volume_confirmation.mid_term_volume_signal?.score ?? "—"} / ${technical.volume_confirmation.long_term_volume_signal?.score ?? "—"}`, note: currentLanguage === "zh" ? "这些分数只作为AI评分贡献，不是独立推荐。" : "These are AI-score inputs, not standalone recommendations." },
          { label: currentLanguage === "zh" ? "成交量信号置信度" : "Volume Signal Confidence", value: displayValue(technical.volume_confirmation.confidence, (value) => `${Math.round(value)}%`) },
          { label: t("dayMove"), value: formatChangePercent(technical.volume_confirmation.today_change_pct) },
          { label: currentLanguage === "zh" ? "今日成交量" : "Today Volume", value: displayValue(technical.volume_confirmation.today_volume, (value) => formatCompactVolume(value)) },
          { label: currentLanguage === "zh" ? "5 / 20 / 60日均量" : "Avg Volume 5 / 20 / 60D", value: `${displayValue(technical.volume_confirmation.avg_volume_5d, (value) => formatCompactVolume(value))} / ${displayValue(technical.volume_confirmation.avg_volume_20d, (value) => formatCompactVolume(value))} / ${displayValue(technical.volume_confirmation.avg_volume_60d, (value) => formatCompactVolume(value))}` },
          { label: currentLanguage === "zh" ? "120 / 250日均量" : "Avg Volume 120 / 250D", value: `${displayValue(technical.volume_confirmation.avg_volume_120d, (value) => formatCompactVolume(value))} / ${displayValue(technical.volume_confirmation.avg_volume_250d, (value) => formatCompactVolume(value))}` },
          { label: currentLanguage === "zh" ? "5 / 20 / 60日量比" : "Relative Volume 5 / 20 / 60D", value: `${displayValue(technical.volume_confirmation.relative_volume_5d, (value) => formatRatio(value))} / ${displayValue(technical.volume_confirmation.relative_volume_20d, (value) => formatRatio(value))} / ${displayValue(technical.volume_confirmation.relative_volume_60d, (value) => formatRatio(value))}` },
          ...(technical.volume_confirmation.float_shares != null && technical.volume_confirmation.shares_outstanding != null
            ? [{ label: currentLanguage === "zh" ? "流通股 / 总股本" : "Float / Shares Outstanding", value: `${formatCompactVolume(technical.volume_confirmation.float_shares)} / ${formatCompactVolume(technical.volume_confirmation.shares_outstanding)}` }]
            : []),
          { label: currentLanguage === "zh" ? "今日换手率" : "Turnover Rate", value: displayValue(technical.volume_confirmation.turnover_rate, (value) => formatPercentValue(value)), note: technical.volume_confirmation.turnover_rate == null ? (currentLanguage === "zh" ? "缺少流通股/总股本时不扣分，只降低置信度" : "Missing share base lowers confidence, not the score") : "" },
          { label: currentLanguage === "zh" ? "5 / 20 / 60日均换手" : "Avg Turnover 5 / 20 / 60D", value: `${displayValue(technical.volume_confirmation.avg_turnover_5d, (value) => formatPercentValue(value))} / ${displayValue(technical.volume_confirmation.avg_turnover_20d, (value) => formatPercentValue(value))} / ${displayValue(technical.volume_confirmation.avg_turnover_60d, (value) => formatPercentValue(value))}` },
          { label: t("obv"), value: displayValue(technical.volume_confirmation.obv, (value) => formatCompactVolume(value)) },
          { label: currentLanguage === "zh" ? "OBV 5 / 20 / 60日趋势" : "OBV Trend 5 / 20 / 60D", value: [technical.volume_confirmation.obv_trend_5d, technical.volume_confirmation.obv_trend_20d, technical.volume_confirmation.obv_trend_60d].map((value) => value ? localizeMarketSentiment(value) : "—").join(" / ") },
          { label: currentLanguage === "zh" ? "20日上涨/下跌成交量比" : "20D Up/Down Volume Ratio", value: displayValue(technical.volume_confirmation.up_down_volume_ratio_20d, (value) => formatRatio(value)), note: `${displayValue(technical.volume_confirmation.up_volume_20d, (value) => formatCompactVolume(value))} / ${displayValue(technical.volume_confirmation.down_volume_20d, (value) => formatCompactVolume(value))}` },
          { label: currentLanguage === "zh" ? "60日上涨/下跌成交量比" : "60D Up/Down Volume Ratio", value: displayValue(technical.volume_confirmation.up_down_volume_ratio_60d, (value) => formatRatio(value)), note: `${displayValue(technical.volume_confirmation.up_volume_60d, (value) => formatCompactVolume(value))} / ${displayValue(technical.volume_confirmation.down_volume_60d, (value) => formatCompactVolume(value))}` },
          { label: t("closePosition"), value: displayValue(technical.volume_confirmation.close_location_pct, (value) => formatPercentValue(value, 1)) },
        ])}</div>
      </section>
      <section class="detail-section-card">
        <div class="detail-section-head"><h3>${t("technicalSummaryTitle")}</h3></div>
        <div class="decision-bullets"><div class="decision-bullet">• ${localizedDashboardText(technical.summary)}</div></div>
      </section>
    </section>
  `;

  const fundamentalPanel = `
    <section class="detail-tab-section">
      <section class="detail-section-card">
        <div class="detail-section-head"><h3>${t("fundamentalSummaryTitle")}</h3></div>
        <div class="decision-summary-grid">
          <div class="decision-list-card">
            <div class="decision-list-title">${t("overallFundamentalView")}</div>
            <div class="decision-bullets">
              <div class="decision-bullet">• ${fundamental.summary}</div>
              <div class="decision-bullet muted">${t("scoreLabel")}: ${fundamental.fundamental_score}/100</div>
            </div>
          </div>
          <div class="decision-list-card">
            <div class="decision-list-title">${t("companyProfile")}</div>
            <div class="decision-bullets">
              <div class="decision-bullet">• ${profile.category}</div>
              <div class="detail-consensus-mini">${renderTags(profile.tags_label)}</div>
            </div>
          </div>
          <div class="decision-list-card">
            <div class="decision-list-title">${t("keyStrengths")}</div>
            <div class="decision-bullets">${renderReasonBullets(fundamental.key_strengths, "positive")}</div>
          </div>
          <div class="decision-list-card">
            <div class="decision-list-title">${t("keyRisksTitle")}</div>
            <div class="decision-bullets">${renderReasonBullets(fundamental.key_risks, "warning")}</div>
          </div>
        </div>
      </section>
      <section class="detail-section-card">
        <div class="detail-section-head"><h3>${t("quality")}</h3></div>
        <div class="detail-line-list">${renderMetricRows([
          { label: "ROE", value: displayValue(fundamental.quality.roe, (value) => formatPercentage(value)) },
          { label: currentLanguage === "zh" ? "毛利率" : "Gross Margin", value: displayValue(fundamental.quality.gross_margin, (value) => formatPercentage(value)) },
          { label: currentLanguage === "zh" ? "营业利润率" : "Operating Margin", value: displayValue(fundamental.quality.operating_margin, (value) => formatPercentage(value)) },
          { label: currentLanguage === "zh" ? "净利率" : "Net Margin", value: displayValue(fundamental.quality.net_margin, (value) => formatPercentage(value)) },
          { label: currentLanguage === "zh" ? "负债率" : "Debt Ratio", value: displayValue(fundamental.quality.debt_ratio, (value) => formatPercentage(value)) },
          { label: currentLanguage === "zh" ? "现金比率" : "Cash Ratio", value: displayValue(fundamental.quality.cash_ratio, (value) => formatPercentage(value)) },
        ])}</div>
      </section>
      <section class="detail-section-card">
        <div class="detail-section-head"><h3>${t("growth")}</h3></div>
        <div class="detail-line-list">${renderMetricRows([
          { label: t("revenueGrowth"), value: displayValue(fundamental.growth.revenue_growth, (value) => formatPercentage(value)) },
          { label: currentLanguage === "zh" ? "每股收益增长" : "EPS Growth", value: displayValue(fundamental.growth.eps_growth, (value) => formatPercentage(value)) },
          { label: currentLanguage === "zh" ? "自由现金流增长" : "FCF Growth", value: displayValue(fundamental.growth.free_cash_flow_growth, (value) => formatPercentage(value)) },
          { label: currentLanguage === "zh" ? "管理层指引" : "Forward Guidance", value: displayValue(fundamental.growth.forward_guidance, (value) => formatPercentage(value)) },
          { label: currentLanguage === "zh" ? "分析师预期" : "Analyst Growth", value: displayValue(fundamental.growth.analyst_growth_expectation, (value) => formatPercentage(value)) },
        ])}</div>
      </section>
      <section class="detail-section-card">
        <div class="detail-section-head"><h3>${t("valuationScore")}</h3></div>
        <div class="detail-line-list">${renderMetricRows([
          { label: t("pe"), value: displayValue(fundamental.valuation.pe, (value) => formatRatio(value)) },
          { label: t("forwardPe"), value: displayValue(fundamental.valuation.forward_pe, (value) => formatRatio(value)) },
          { label: "PEG", value: displayValue(fundamental.valuation.peg, (value) => formatRatio(value)) },
          { label: "PS", value: displayValue(fundamental.valuation.ps_ratio, (value) => formatRatio(value)) },
          { label: "EV / EBITDA", value: displayValue(fundamental.valuation.ev_ebitda, (value) => formatRatio(value)) },
          { label: "Price / FCF", value: displayValue(fundamental.valuation.price_fcf, (value) => formatRatio(value)) },
          { label: t("summary"), value: fundamental.valuation.state || t("dataUnavailable") },
        ])}</div>
      </section>
      <section class="detail-section-card">
        <div class="detail-section-head"><h3>${t("financialHealth")}</h3></div>
        <div class="detail-line-list">${renderMetricRows([
          { label: t("freeCashFlow"), value: displayValue(fundamental.financial_health.free_cash_flow, (value) => formatBillions(value, currencyCode)) },
          { label: currentLanguage === "zh" ? "现金储备" : "Cash Reserve", value: displayValue(fundamental.financial_health.cash_reserve, (value) => formatPercentage(value)) },
          { label: currentLanguage === "zh" ? "债务" : "Debt", value: displayValue(fundamental.financial_health.debt, (value) => formatPercentage(value)) },
          { label: currentLanguage === "zh" ? "资本开支" : "CapEx", value: displayValue(fundamental.financial_health.capital_expenditure, (value) => formatPercentage(value)) },
          { label: currentLanguage === "zh" ? "现金流稳定性" : "Cash Flow Stability", value: displayValue(fundamental.financial_health.cash_flow_stability, (value) => `${Math.round(value)}/100`) },
        ])}</div>
      </section>
    </section>
  `;

  const optionsPanel = `
    <section class="detail-tab-section">
      <div class="detail-kpi-grid">
        <article class="detail-kpi-card ${scoreToBand(options.options_score).tone}"><span>${t("tabOptions")}</span><strong>${options.options_score}/100</strong><small>${options.summary}</small></article>
        <article class="detail-kpi-card neutral"><span>${t("putWall")}</span><strong>${displayValue(options.put_wall, (value) => formatCurrency(value, currencyCode))}</strong><small>${options.put_wall == null ? t("dataUnavailable") : ""}</small></article>
        <article class="detail-kpi-card neutral"><span>${t("callWall")}</span><strong>${displayValue(options.call_wall, (value) => formatCurrency(value, currencyCode))}</strong><small>${options.call_wall == null ? t("dataUnavailable") : ""}</small></article>
        <article class="detail-kpi-card neutral"><span>${t("gammaFlip")}</span><strong>${displayValue(options.gamma_flip, (value) => formatCurrency(value, currencyCode))}</strong><small>${options.gamma_flip == null ? t("dataUnavailable") : ""}</small></article>
      </div>
      <section class="detail-section-card">
        <div class="detail-section-head"><h3>${currentLanguage === "zh" ? "期权市场结构" : "Options Market Structure"}</h3></div>
        <div class="detail-line-list">${renderMetricRows([
          { label: t("putWall"), value: displayValue(options.put_wall, (value) => formatCurrency(value, currencyCode)) },
          { label: t("callWall"), value: displayValue(options.call_wall, (value) => formatCurrency(value, currencyCode)) },
          { label: t("gammaFlip"), value: displayValue(options.gamma_flip, (value) => formatCurrency(value, currencyCode)) },
          { label: t("impliedVolatility"), value: displayValue(options.implied_volatility, (value) => formatPercentValue(value)) },
        ])}</div>
      </section>
      <section class="detail-section-card">
        <div class="detail-section-head"><h3>${currentLanguage === "zh" ? "期权策略建议" : "Options Strategy Recommendation"}</h3></div>
        <div class="detail-line-list">${[
          {
            label: t("cashSecuredPut"),
            value: localizedStrategyAction(options.cash_secured_put.recommendation),
            note: `${options.cash_secured_put.reason || t("dataUnavailable")} ${options.cash_secured_put.suggested_strike ? `· ${t("suggestedStrike")}: ${formatOptionStrike(options.cash_secured_put.suggested_strike, currencyCode)}` : ""} ${options.cash_secured_put.suggested_dte ? `· ${t("suggestedDte")}: ${options.cash_secured_put.suggested_dte}` : ""} ${options.cash_secured_put.assignment_risk ? `· ${t("assignmentRisk")}: ${options.cash_secured_put.assignment_risk}` : ""}`,
          },
          {
            label: t("coveredCall"),
            value: localizedStrategyAction(options.covered_call.recommendation),
            note: `${options.covered_call.reason || t("dataUnavailable")} ${options.covered_call.suggested_strike ? `· ${t("suggestedStrike")}: ${formatOptionStrike(options.covered_call.suggested_strike, currencyCode)}` : ""} ${options.covered_call.suggested_dte ? `· ${t("suggestedDte")}: ${options.covered_call.suggested_dte}` : ""} ${options.covered_call.assignment_risk ? `· ${t("assignmentRisk")}: ${options.covered_call.assignment_risk}` : ""}`,
          },
        ].map((entry) => `
          <div class="detail-line-row">
            <div>
              <div class="detail-line-label">${entry.label}</div>
              <div class="detail-line-note">${entry.note}</div>
            </div>
            <div class="detail-line-side"><strong>${entry.value}</strong></div>
          </div>
        `).join("")}</div>
      </section>
    </section>
  `;

  const newsPanel = isCnMarket ? `
    <section class="detail-tab-section">
      <section class="detail-section-card">
        <div class="detail-section-head"><h3>${t("marketContext")}</h3></div>
        <div class="decision-bullet muted">${currentLanguage === "zh" ? "市场环境数据暂未接入 A股模型。" : "Market context data is not connected to the A-share model yet."}</div>
      </section>
    </section>
  ` : `
    <section class="detail-tab-section">
      <div class="detail-kpi-grid">
        <article class="detail-kpi-card ${scoreToBand(marketContext.market_context_score).tone}"><span>${t("marketContext")}</span><strong>${marketContext.market_context_score}/100</strong><small>${localizedDashboardText(marketContext.summary)}</small></article>
        <article class="detail-kpi-card neutral"><span>${currentLanguage === "zh" ? "市场状态" : "Market Regime"}</span><strong>${marketRegimeLabel(marketContext.market_regime?.regime)}</strong><small>${localizedDashboardText(marketContext.market_regime?.summary || t("dataUnavailable"))}</small></article>
        <article class="detail-kpi-card neutral"><span>${t("macroScore")}</span><strong>${marketContext.market_regime?.score == null ? t("dataUnavailable") : `${marketContext.market_regime.score}/100`}</strong><small>${currentLanguage === "zh" ? "宏观 / 市场环境总分" : "Macro and market-context score"}</small></article>
        <article class="detail-kpi-card neutral"><span>${t("confidencePct")}</span><strong>${marketContext.market_regime?.confidence == null ? t("dataUnavailable") : `${marketContext.market_regime.confidence}%`}</strong><small>${currentLanguage === "zh" ? "缺数据时会降低置信度，但不会自动转空。" : "Missing data lowers confidence without forcing a bearish call."}</small></article>
      </div>
      <section class="detail-section-card">
        <div class="detail-section-head"><h3>${currentLanguage === "zh" ? "市场状态" : "Market Regime"}</h3></div>
        <div class="detail-line-list">${renderMetricRows([
          { label: currentLanguage === "zh" ? "状态" : "Regime", value: marketRegimeLabel(marketContext.market_regime?.regime), note: marketContext.market_regime?.summary || t("dataUnavailable") },
          { label: t("scoreLabel"), value: `${marketContext.market_regime?.score ?? 50}/100`, note: currentLanguage === "zh" ? "50 为中性起点，只使用 VIX、Fear & Greed、10Y Yield、SPY / QQQ Trend。" : "50 is the neutral base; only VIX, Fear & Greed, 10Y Yield, and SPY / QQQ Trend are used." },
          { label: t("confidencePct"), value: marketContext.market_regime?.confidence == null ? t("dataUnavailable") : `${marketContext.market_regime.confidence}%`, note: currentLanguage === "zh" ? "缺失数据只会降低置信度，不会直接变成看空。" : "Unavailable feeds lower confidence rather than forcing a bearish score." },
          { label: t("summary"), value: marketContext.market_regime?.summary || t("dataUnavailable") },
        ])}</div>
      </section>
      <section class="detail-section-card">
        <div class="detail-section-head"><h3>VIX</h3></div>
        <div class="detail-line-list">${renderMetricRows([
          { label: currentLanguage === "zh" ? "当前 VIX" : "Current VIX", value: displayValue(marketEngine.vix?.value, (value) => formatOneDecimal(value)), note: marketEngine.vix?.value == null ? renderSourceInfo(marketEngine.source_info?.vix || marketContext.macro.source_info?.vix) : marketEngine.vix?.impact },
          { label: currentLanguage === "zh" ? "5日变化" : "5D Change", value: displayValue(marketEngine.vix?.change_5d, (value) => `${value > 0 ? "+" : ""}${formatOneDecimal(value)}`) },
          { label: currentLanguage === "zh" ? "20日变化" : "20D Change", value: displayValue(marketEngine.vix?.change_20d, (value) => `${value > 0 ? "+" : ""}${formatOneDecimal(value)}`) },
          { label: currentLanguage === "zh" ? "趋势" : "Trend", value: localizeMarketSentiment(marketEngine.vix?.trend), note: marketEngine.vix?.impact || t("dataUnavailable") },
        ])}</div>
      </section>
      <section class="detail-section-card">
        <div class="detail-section-head"><h3>${currentLanguage === "zh" ? "恐惧贪婪指数" : "Fear & Greed"}</h3></div>
        <div class="detail-line-list">${renderMetricRows([
          { label: currentLanguage === "zh" ? "当前数值" : "Current Value", value: displayValue(marketEngine.fear_greed?.value, (value) => `${Math.round(value)}/100`), note: marketEngine.fear_greed?.value == null ? renderSourceInfo(marketEngine.source_info?.fear_greed || marketContext.macro.source_info?.fear_greed) : marketEngine.fear_greed?.impact },
          { label: currentLanguage === "zh" ? "情绪标签" : "Label", value: marketEngine.fear_greed?.label || t("dataUnavailable") },
          { label: currentLanguage === "zh" ? "影响" : "Impact", value: marketEngine.fear_greed?.impact || t("dataUnavailable") },
        ])}</div>
      </section>
      <section class="detail-section-card">
        <div class="detail-section-head"><h3>${currentLanguage === "zh" ? "10年期美债收益率" : "10Y Yield"}</h3></div>
        <div class="detail-line-list">${renderMetricRows([
          { label: currentLanguage === "zh" ? "当前利率" : "Current Yield", value: displayValue(marketEngine.ten_year_yield?.value, (value) => `${formatOneDecimal(value)}%`), note: marketEngine.ten_year_yield?.value == null ? renderSourceInfo(marketEngine.source_info?.ten_year_yield || marketContext.macro.source_info?.treasury_yield) : marketEngine.ten_year_yield?.impact },
          { label: currentLanguage === "zh" ? "5日变化" : "5D Change", value: displayValue(marketEngine.ten_year_yield?.change_5d_bps, (value) => `${value > 0 ? "+" : ""}${formatOneDecimal(value)} bps`) },
          { label: currentLanguage === "zh" ? "20日变化" : "20D Change", value: displayValue(marketEngine.ten_year_yield?.change_20d_bps, (value) => `${value > 0 ? "+" : ""}${formatOneDecimal(value)} bps`) },
          { label: currentLanguage === "zh" ? "趋势" : "Trend", value: localizeMarketSentiment(marketEngine.ten_year_yield?.trend), note: marketEngine.ten_year_yield?.impact || t("dataUnavailable") },
        ])}</div>
      </section>
      <section class="detail-section-card">
        <div class="detail-section-head"><h3>${currentLanguage === "zh" ? "SPY / QQQ 大盘趋势" : "SPY / QQQ Trend"}</h3></div>
        <div class="detail-line-list">${renderMetricRows([
          { label: "SPY", value: marketEngine.equity_trend?.spy?.value == null ? t("dataUnavailable") : `${formatCurrency(marketEngine.equity_trend.spy.value, "USD")} · ${localizeMarketSentiment(marketEngine.equity_trend.spy.trend)}`, note: marketEngine.equity_trend?.spy?.value == null ? renderSourceInfo(marketEngine.source_info?.equity_trend) : `${currentLanguage === "zh" ? "5日" : "5D"} ${displayValue(marketEngine.equity_trend.spy.change_5d_pct, (value) => formatChangePercent(value))} · ${currentLanguage === "zh" ? "20日" : "20D"} ${displayValue(marketEngine.equity_trend.spy.change_20d_pct, (value) => formatChangePercent(value))}` },
          { label: "QQQ", value: marketEngine.equity_trend?.qqq?.value == null ? t("dataUnavailable") : `${formatCurrency(marketEngine.equity_trend.qqq.value, "USD")} · ${localizeMarketSentiment(marketEngine.equity_trend.qqq.trend)}`, note: marketEngine.equity_trend?.qqq?.value == null ? renderSourceInfo(marketEngine.source_info?.equity_trend) : `${currentLanguage === "zh" ? "5日" : "5D"} ${displayValue(marketEngine.equity_trend.qqq.change_5d_pct, (value) => formatChangePercent(value))} · ${currentLanguage === "zh" ? "20日" : "20D"} ${displayValue(marketEngine.equity_trend.qqq.change_20d_pct, (value) => formatChangePercent(value))}` },
          { label: t("summary"), value: marketEngine.equity_trend?.summary || t("dataUnavailable") },
        ])}</div>
      </section>
    </section>
  `;

  const tabPanels = {
    summary: summaryPanel,
    technical: technicalPanel,
    fundamental: fundamentalPanel,
    options: optionsPanel,
    news: newsPanel,
  };

  sheet.innerHTML = `
    <button id="detailModalClose" class="detail-close" type="button" aria-label="${t("closeDetail")}">×</button>
    <div class="detail-sheet-header detail-sheet-header-dark">
      <div id="modalUpdatedAt" class="detail-sheet-stamp">${t("updatedAtShort")} ${formatSnapshotTimestamp(currentSnapshot?.updatedAt || row.updatedAt) || "—"}</div>
    </div>
    <section class="decision-hero">
      <div class="decision-hero-main">
        <div class="decision-code">${row.ticker}</div>
        <div class="decision-company">${companyName}</div>
        <div class="detail-consensus-mini">
          <span>${t("currentPrice")} ${formatCurrentPrice(row.price, currencyCode)}</span>
          <span class="${changeTone}">${t("dayMove")} ${formatChangePercent(row.changePercent)}</span>
          <span>${profile.category}</span>
          <span>${t("overallAiScore")} ${ai.overall_score}/100</span>
          <span>${t("shortTerm")} ${localizedActionLabel(ai.short_term.rating)}</span>
          <span>${t("midTerm")} ${localizedActionLabel(ai.mid_term.rating)}</span>
          <span>${t("longTerm")} ${localizedActionLabel(ai.long_term.rating)}</span>
        </div>
      </div>
    </section>
    <div class="detail-tabs" role="tablist" aria-label="Detail tabs">
      ${tabItems.map((item) => `
        <button class="detail-tab${detailActiveTab === item.key ? " active" : ""}" type="button" data-detail-tab="${item.key}">
          ${item.label}
        </button>
      `).join("")}
    </div>
    <div class="detail-tab-panel">
      ${tabPanels[detailActiveTab] || summaryPanel}
    </div>
  `;
}

function renderSelectedOverview(row) {
  if (!row) return;
  const analysis = row.technicals?.srAnalysis || null;
  const currencyCode = row.currencyCode || inferCurrencyCode(row);
  const supportLevels = analysis?.support?.map((item) => item.price) || row.technicals?.support || [row.price];
  const resistanceLevels = analysis?.resistance?.map((item) => item.price) || row.technicals?.resistance || [row.price];
  const companyName = companyNameForTicker(row.ticker, row);

  document.querySelector("#detailInitial").textContent = row.ticker[0];
  document.querySelector("#detailTicker").textContent = row.ticker;
  const detailCompany = document.querySelector("#detailCompany");
  if (detailCompany) detailCompany.textContent = companyName;
  document.querySelector("#detailPrice").textContent = formatCurrentPrice(row.price, currencyCode);
  document.querySelector("#detailAction").textContent = localizedActionLabel(row.action);
  document.querySelector("#detailAction").className = `action ${actionClass(row.action)}`;
  document.querySelector("#detailScore").textContent = row.score ?? "—";
  renderLevelList("#detailSupport", supportLevels);
  renderLevelList("#detailResistance", resistanceLevels);

  const detailLevelPrice = document.querySelector("#detailLevelPrice");
  const detailSupportStrength = document.querySelector("#detailSupportStrength");
  const detailResistanceStrength = document.querySelector("#detailResistanceStrength");
  const detailSupportDistance = document.querySelector("#detailSupportDistance");
  const detailResistanceDistance = document.querySelector("#detailResistanceDistance");
  const detailRiskReward = document.querySelector("#detailRiskReward");
  const detailBestSupport = document.querySelector("#detailBestSupport");
  const detailBestResistance = document.querySelector("#detailBestResistance");
  const detailSupportGap = document.querySelector("#detailSupportGap");
  const detailResistanceGap = document.querySelector("#detailResistanceGap");
  const detailLevelJudgment = document.querySelector("#detailLevelJudgment");

  if (!analysis) {
    [detailLevelPrice, detailSupportStrength, detailResistanceStrength, detailSupportDistance, detailResistanceDistance, detailRiskReward, detailBestSupport, detailBestResistance, detailSupportGap, detailResistanceGap].forEach((node) => {
      if (node) node.textContent = "—";
    });
    if (detailLevelJudgment) {
      detailLevelJudgment.textContent = `${t("tactical")} ${localizedActionLabel("Hold")}`;
      detailLevelJudgment.className = "analysis-pill hold";
    }
    return;
  }

  if (detailLevelPrice) detailLevelPrice.textContent = formatCurrency(analysis.currentPrice ?? row.price, currencyCode);
  if (detailSupportStrength) detailSupportStrength.textContent = `${analysis.supportStrength ?? 0}/100`;
  if (detailResistanceStrength) detailResistanceStrength.textContent = `${analysis.resistanceStrength ?? 0}/100`;
  if (detailSupportDistance) detailSupportDistance.textContent = analysis.supportDistancePct == null ? "—" : `${analysis.supportDistancePct.toFixed(1)}%`;
  if (detailResistanceDistance) detailResistanceDistance.textContent = analysis.resistanceDistancePct == null ? "—" : `${analysis.resistanceDistancePct.toFixed(1)}%`;
  if (detailRiskReward) detailRiskReward.textContent = analysis.riskReward == null ? "—" : `${analysis.riskReward.toFixed(2)}x`;
  if (detailBestSupport) detailBestSupport.textContent = analysis.support?.[0] ? `${formatCurrency(analysis.support[0].price, currencyCode)} · ${analysis.support[0].score}/100` : "—";
  if (detailBestResistance) detailBestResistance.textContent = analysis.resistance?.[0] ? `${formatCurrency(analysis.resistance[0].price, currencyCode)} · ${analysis.resistance[0].score}/100` : "—";
  if (detailSupportGap) detailSupportGap.textContent = analysis.support?.[1] ? `${formatCurrency(analysis.support[1].price, currencyCode)} · ${analysis.support[1].score}/100` : "—";
  if (detailResistanceGap) detailResistanceGap.textContent = analysis.resistance?.[1] ? `${formatCurrency(analysis.resistance[1].price, currencyCode)} · ${analysis.resistance[1].score}/100` : "—";
  if (detailLevelJudgment) {
    detailLevelJudgment.textContent = `${t("tactical")} ${localizedActionLabel(analysis.judgment || "Hold")}`;
    detailLevelJudgment.className = `analysis-pill ${actionClass(analysis.judgment)}`;
  }
}

function actionClass(action) {
  const normalized = String(action || "").toLowerCase();
  if (normalized === "n/a") return "na";
  if (normalized.includes("buy")) return "buy";
  if (normalized.includes("weak hold")) return "hold";
  if (normalized.includes("reduce")) return "sell";
  if (normalized === "hold") return "hold";
  if (normalized.includes("sell") || normalized === "short") return "sell";
  return normalized;
}

function renderLevelList(selector, levels) {
  const container = document.querySelector(selector);
  if (!container) return;
  const row = selectedRow();
  const currencyCode = row?.currencyCode || inferCurrencyCode(row);

  const labels = ["1", "2", "3"];
  const levelPrefix = selector === "#detailSupport"
    ? (currentLanguage === "zh" ? "支撑" : "Support")
    : (currentLanguage === "zh" ? "阻力" : "Resistance");
  container.innerHTML = "";
  labels.forEach((label, index) => {
    const value = levels[index] ?? levels[levels.length - 1];
    const item = document.createElement("div");
    item.className = "level-item";
    item.innerHTML = `
      <span>${levelPrefix} ${label}</span>
      <strong>${formatCurrency(value, currencyCode)}</strong>
    `;
    container.appendChild(item);
  });
}

function renderStockList() {
  const container = document.querySelector("#stockList");
  if (!container) return;

  const filteredRows = tickerRows.filter((row) => matchesFilter(row));
  const rows = sortRows(filteredRows);
  const current = selectedRow();

  container.innerHTML = "";
  rows.forEach((row) => {
    const companyName = companyNameForTicker(row.ticker, row);
    const currencyCode = row.currencyCode || inferCurrencyCode(row);
    const removeLabel = `${t("removeStock")} ${row.ticker}`;
    const dayTone = Number.isFinite(row.changePercent) ? (row.changePercent >= 0 ? "buy" : "sell") : "hold";
    const decision = row.decisionModel || buildDecisionModel(row);
    const item = document.createElement("div");
    item.className = `stock-item${row.ticker === current?.ticker ? " active" : ""}`;
    item.setAttribute("role", "button");
    item.setAttribute("tabindex", "0");
    item.innerHTML = `
      <div class="stock-item-header">
        <div class="stock-copy">
          <div class="stock-symbol-row">
            <div class="stock-symbol">${row.ticker}</div>
            <span class="stock-profile-pill">${decision.company_profile?.category || t("dataUnavailable")}</span>
          </div>
          <div class="stock-company">${companyName}</div>
          <div class="stock-price-row">
            <strong>${row.noData ? t("priceUnavailable") : `${formatCurrentPrice(row.price, currencyCode)}`}</strong>
            <span class="stock-day-move ${dayTone}">${t("dayMove")} ${formatChangePercent(row.changePercent)}</span>
          </div>
        </div>
        <button class="stock-remove-btn" type="button" aria-label="${removeLabel}" title="${removeLabel}">
          <span class="stock-remove-icon" aria-hidden="true">×</span>
        </button>
      </div>
      <div class="stock-item-body">
        <div class="stock-score-compact">
          <span class="stock-label">${t("overallAiScore")}</span>
          <strong>${scoreValue(row.score)}</strong>
        </div>
        <div class="stock-horizon-inline">
          <span class="stock-mini-chip ${actionClass(row.action)}">${currentLanguage === "zh" ? "短" : "S"}: ${localizedActionLabel(row.action)}</span>
          <span class="stock-mini-chip ${actionClass(row.midTermRating)}">${currentLanguage === "zh" ? "中" : "M"}: ${localizedActionLabel(row.midTermRating)}</span>
          <span class="stock-mini-chip ${actionClass(row.longTermRating)}">${currentLanguage === "zh" ? "长" : "L"}: ${localizedActionLabel(row.longTermRating)}</span>
        </div>
      </div>
    `;
    item.addEventListener("click", () => {
      selectedTicker = row.ticker;
      modalOpen = true;
      detailActiveTab = "summary";
      render();
    });
    item.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        selectedTicker = row.ticker;
        modalOpen = true;
        detailActiveTab = "summary";
        render();
      }
    });
    const removeButton = item.querySelector(".stock-remove-btn");
    if (removeButton) {
      removeButton.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        removeTicker(row.ticker);
      });
    }
    container.appendChild(item);
  });
}

function renderSignalGroups(row) {
  const container = document.querySelector("#signalGroups");
  if (!container || !row) return;

  container.innerHTML = "";
  signalGroupDefs.forEach((group) => {
    const card = document.createElement("section");
    card.className = "grid-card signal-group-card";
    const indicatorTotal = group.keys.length;
    const groupLabel = localizedGroupLabel(group.key, group.label);
    card.innerHTML = `
      <div class="signal-group-head">
        <h3>${groupLabel}</h3>
        <span>${indicatorTotal} ${t("indicators")}</span>
      </div>
      <div class="signal-rows"></div>
    `;
    const rowsEl = card.querySelector(".signal-rows");
    group.keys.forEach((key) => {
      const indicator = row.indicatorMap?.[key] || {
        label: key,
        display: "—",
        signal: "hold",
        trend: "flat",
      };
      const localizedLabel = localizedIndicatorLabel(indicator.key || key, indicator.label);
      const rowEl = document.createElement("div");
      rowEl.className = "signal-row";
      rowEl.title = indicator.reason
        ? `${localizedLabel}: ${indicator.display} • ${localizedActionLabel(signalLabel(indicator.signal))} (${localizedTrendLabel(indicator.trend)}) · ${indicator.reason}`
        : `${localizedLabel}: ${indicator.display} • ${localizedActionLabel(signalLabel(indicator.signal))} (${localizedTrendLabel(indicator.trend)})`;
      rowEl.innerHTML = `
        <div class="metric-label">${localizedLabel}</div>
        <div class="metric-body">
          <div class="metric-value">${indicator.display}</div>
          ${indicator.reason ? `<div class="metric-note">${indicator.reason}</div>` : ""}
        </div>
        <span class="signal ${signalClass(indicator.signal)}">
          <span class="status-dot"></span>
          ${signalLabel(indicator.signal)} <span class="mini">${signalArrow(indicator.signal)}</span>
        </span>
      `;
      rowsEl.appendChild(rowEl);
    });
    container.appendChild(card);
  });
}

function buildRow(row) {
  const tr = document.createElement("tr");
  tr.dataset.ticker = row.ticker;
  if (row.ticker === selectedTicker) tr.classList.add("selected-row");

  const ticker = document.createElement("td");
  const tickerWrap = document.createElement("div");
  tickerWrap.className = "ticker-cell";
  const tickerLabel = document.createElement("span");
  tickerLabel.textContent = row.ticker;
  const removeBtn = document.createElement("button");
  removeBtn.className = "row-remove";
  removeBtn.type = "button";
  removeBtn.textContent = "×";
  removeBtn.title = `Remove ${row.ticker}`;
  removeBtn.addEventListener("click", (event) => {
    event.stopPropagation();
    removeTicker(row.ticker);
  });
  tickerWrap.append(tickerLabel, removeBtn);
  ticker.appendChild(tickerWrap);
  tr.appendChild(ticker);

  const action = document.createElement("td");
  action.innerHTML = `<span class="action ${row.action.toLowerCase()}">${row.action}</span>`;
  tr.appendChild(action);

  const price = document.createElement("td");
  price.innerHTML = `<span class="price-cell">${formatCurrentPrice(row.price, row.currencyCode || inferCurrencyCode(row))}</span>`;
  tr.appendChild(price);

  const score = document.createElement("td");
  score.innerHTML = `<span class="score ${row.action.toLowerCase()}">${row.score}</span>`;
  tr.appendChild(score);

  groups.forEach((def) => {
    const indicator = row.indicators.find((item) => item.key === def.key) || {
      key: def.key,
      display: "—",
      signal: "hold",
      trend: "flat",
      label: def.label,
    };
    const td = document.createElement("td");
    td.dataset.groupCell = def.group;
    td.title = `${def.label}: ${indicator.display} • ${indicator.signal.toUpperCase()} (${indicator.trend.toUpperCase()})`;
    td.innerHTML = `
      <div class="signal-stack">
        <span class="metric-value">${indicator.display}</span>
        <span class="signal ${signalClass(indicator.signal)}">
          <span class="status-dot"></span>
          ${signalLabel(indicator.signal)} <span class="mini">${signalArrow(indicator.signal)}</span>
        </span>
      </div>
    `;
    tr.appendChild(td);
  });

  return tr;
}

function applyColumnVisibility(filter) {
  const visible = {
    all: new Set(["tech", "fundamental"]),
    tech: new Set(["tech"]),
    fundamental: new Set(["fundamental"]),
  }[filter] ?? new Set(["tech", "fundamental"]);

  document.querySelectorAll("[data-group-cell], [data-group-header]").forEach((el) => {
    const group = el.dataset.groupCell || el.dataset.groupHeader;
    if (group === "meta") return;
    el.style.display = visible.has(group) ? "" : "none";
  });
}

function updateDetail(ticker) {
  const fallbackTicker = tickerRows[0]?.ticker || "META";
  const row = tickerRows.find((item) => item.ticker === ticker) ?? tickerRows.find((item) => item.ticker === fallbackTicker) ?? createRowState(fallbackTicker);
  selectedTicker = row.ticker;
  modalOpen = true;
  detailActiveTab = "summary";
  render();
}

function render() {
  applyLanguage();
  tickerRows.forEach((row) => {
    if (!row.technicals && !row.indicatorMap) return;
    row.research = buildLongTermResearch(row);
    row.decisionModel = buildDecisionModel(row);
    row.score = row.decisionModel.ai_decision.overall_score;
    row.action = row.decisionModel.ai_decision.short_term.rating;
    row.currentAction = row.decisionModel.ai_decision.short_term.rating;
    row.midTermRating = row.decisionModel.ai_decision.mid_term.rating;
    row.longTermRating = row.decisionModel.ai_decision.long_term.rating;
    row.stockType = row.decisionModel.company_profile.category_key;
    row.stockTypeLabel = row.decisionModel.company_profile.category;
    row.note = row.decisionModel.ai_decision.bullish_reasons?.[0] || row.research.thesis.summary;
    row.summary = `${row.ticker} ${currentLanguage === "zh" ? "决策快照" : "decision snapshot"}`;
    row.dominant = actionClass(row.action);
  });
  const current = selectedRow();
  renderStockList();
  renderDetailModal(current);

  document.querySelectorAll(".sort-btn").forEach((btn) => {
    const isActive = btn.dataset.sortKey === sortState.key;
    btn.classList.toggle("active", isActive);
    const indicator = btn.querySelector(".sort-indicator");
    if (indicator) indicator.textContent = isActive ? (sortState.dir === "asc" ? "↑" : "↓") : "↕";
  });
}

function loadCachedSnapshot() {
  try {
    const cached = JSON.parse(localStorage.getItem(PRICE_CACHE_KEY) || "null");
    if (!cached?.snapshot) return false;
    applySnapshot(cached.snapshot, false);
    const chipText = refreshChipText(cached.snapshot);
    if (chipText) {
      setRefreshChip(chipText);
    }
    return true;
  } catch {
    return false;
  }
}

function persistSnapshot(snapshot) {
  try {
    localStorage.setItem(PRICE_CACHE_KEY, JSON.stringify({
      updatedAt: snapshot.updatedAt || new Date().toISOString(),
      snapshot,
    }));
  } catch {
    // Ignore storage failures.
  }
}

function snapshotIsFresh(snapshot) {
  const timestamp = snapshot?.fetchedAt || snapshot?.updatedAt;
  if (!timestamp) return false;
  const ageMs = Date.now() - new Date(timestamp).getTime();
  return Number.isFinite(ageMs) && ageMs >= 0 && ageMs < PRICE_REFRESH_MS;
}

function snapshotNeedsHydration(snapshot) {
  if (!snapshot?.quotes) return true;
  return tickerRows.some((row) => {
    const quote = snapshot.quotes?.[row.ticker];
    if (!quote) return true;
    const hasPrice = Number.isFinite(quote.price);
    const historyCount = (quote.history?.closes || []).filter(Number.isFinite).length;
    return !hasPrice || historyCount < 2;
  });
}

function applySnapshot(snapshot, shouldPersist = true) {
  currentSnapshot = snapshot;
  const invalidCustomTickers = [];

  tickerRows.forEach((row) => {
    const metrics = computeIndicators(row.ticker, snapshot.quotes, row.profile);
    row.price = metrics.price;
    row.previousClose = metrics.previousClose;
    row.change = metrics.change;
    row.changePercent = metrics.changePercent;
    row.shortName = metrics.shortName;
    row.longName = metrics.longName;
    row.symbol = metrics.symbol;
    row.exchangeName = metrics.exchangeName;
    row.metadata = metrics.metadata || {};
    row.marketStatus = snapshot?.quotes?.[row.ticker]?.marketStatus || (snapshot?.quotes?.[row.ticker]?.stale ? "closed" : "open");
    row.dataStaleness = snapshot?.quotes?.[row.ticker]?.dataStaleness || (snapshot?.quotes?.[row.ticker]?.stale ? "stale" : "fresh");
    row.lastSuccessfulUpdate = snapshot?.quotes?.[row.ticker]?.last_successful_update || snapshot?.quotes?.[row.ticker]?.updatedAt || snapshot?.updatedAt || snapshot?.fetchedAt || null;
    row.trailingPE = metrics.trailingPE;
    row.forwardPE = metrics.forwardPE;
    row.marketCap = metrics.marketCap;
    row.updatedAt = metrics.updatedAt;
    row.companyNews = snapshot?.quotes?.[row.ticker]?.companyNews || null;
    row.globalMarketContext = snapshot?.marketContext || snapshot?.market_context || null;
    row.score = metrics.score;
    row.action = metrics.action;
    row.summary = metrics.summary;
    row.note = metrics.note;
    row.dominant = metrics.dominant;
    row.indicators = metrics.indicators;
    row.indicatorMap = metrics.indicatorMap;
    row.technicals = metrics.technicals;
    row.noData = metrics.noData || false;
    row.research = buildLongTermResearch(row);
    row.decisionModel = buildDecisionModel(row);
    row.score = row.decisionModel.ai_decision.overall_score;
    row.action = row.decisionModel.ai_decision.short_term.rating;
    row.currentAction = row.decisionModel.ai_decision.short_term.rating;
    row.midTermRating = row.decisionModel.ai_decision.mid_term.rating;
    row.longTermRating = row.decisionModel.ai_decision.long_term.rating;
    row.stockType = row.decisionModel.company_profile.category_key;
    row.stockTypeLabel = row.decisionModel.company_profile.category;
    row.summary = `${row.ticker} ${currentLanguage === "zh" ? "决策快照" : "decision snapshot"}`;
    row.note = row.decisionModel.ai_decision.bullish_reasons?.[0] || row.research.thesis.summary;
    row.dominant = actionClass(row.action);

    if (snapshot?.source === "yahoo-chart" && row.noData && !DEFAULT_WATCHLIST.includes(row.ticker)) {
      invalidCustomTickers.push(row.ticker);
    }
  });

  if (invalidCustomTickers.length) {
    watchlistTickers = watchlistTickers.filter((ticker) => !invalidCustomTickers.includes(ticker));
    watchlistItems = watchlistItems.filter((item) => !invalidCustomTickers.includes(item.ticker));
    persistWatchlist();
    syncTickerRows();
  }

  if (shouldPersist) persistSnapshot(snapshot);
  render();

  setRefreshChip(refreshChipText(snapshot));
}

async function refreshSnapshot({ force = false, autoRefresh = false, mode = null } = {}) {
  syncTickerRows();
  if (!tickerRows.length) return;
  const effectiveMode = mode || (force ? "force" : autoRefresh ? "auto" : "cache");
  const shouldForce = effectiveMode === "force" || force;
  const shouldAutoRefresh = effectiveMode === "auto" || autoRefresh;
  if (refreshRequestInFlight) {
    if (shouldForce) {
      refreshQueued = true;
      setRefreshChipForAttempt({ stale: true, message: currentLanguage === "zh" ? "刷新已排队" : "Refresh queued" });
    }
    return;
  }

  const requestedTickers = tickerRows.map((row) => row.ticker);
  if (shouldForce) {
    console.info("Dashboard force refresh requested tickers:", requestedTickers);
  }
  const refreshParams = [];
  if (shouldForce) refreshParams.push("force=true");
  else if (shouldAutoRefresh) refreshParams.push("auto_refresh=true");
  const querySuffix = refreshParams.length ? `&${refreshParams.join("&")}` : "";
  const batchSize = (shouldForce || shouldAutoRefresh) ? LIVE_REFRESH_BATCH_SIZE : MARKET_DATA_BATCH_SIZE;
  const batches = requestedTickers.length > batchSize
    ? chunkArray(requestedTickers, batchSize)
    : [requestedTickers];
  refreshRequestInFlight = true;
  if (shouldForce || shouldAutoRefresh) {
    setRefreshChipForAttempt({ stale: Boolean(currentSnapshot), message: shouldForce ? t("refreshing") : (currentLanguage === "zh" ? "正在刷新行情…" : "Refreshing quotes...") });
  }
  updateManualRefreshButton();

  let mergedSnapshot = currentSnapshot;
  const batchErrors = [];
  try {
    for (let batchIndex = 0; batchIndex < batches.length; batchIndex += 1) {
      const batch = batches[batchIndex];
      if (!batch.length) continue;
      if (batches.length > 1 && (shouldForce || shouldAutoRefresh)) {
        setRefreshChipForAttempt({
          stale: Boolean(currentSnapshot),
          message: currentLanguage === "zh"
            ? `正在刷新行情 ${batchIndex + 1}/${batches.length}`
            : `Refreshing quotes ${batchIndex + 1}/${batches.length}`,
        });
      }
      const symbols = batch.join(",");
      const url = `${API_URL}?tickers=${encodeURIComponent(symbols)}&_refresh=${Date.now()}${querySuffix}`;
      try {
        const response = await fetch(url, { cache: "no-store" });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const snapshot = await response.json();
        if (!snapshot?.quotes) throw new Error("Missing quote payload");
        if (shouldForce) {
          console.info("Dashboard force refresh batch response:", {
            batch,
            requested_tickers: snapshot.requested_tickers,
            processed_tickers: snapshot.processed_tickers,
            missing_from_request: snapshot.missing_from_request,
            refresh_status: snapshot.refresh_status,
          });
        }
        mergedSnapshot = mergeMarketSnapshots(mergedSnapshot, snapshot, requestedTickers);
        applySnapshot(mergedSnapshot, true);
      } catch (batchError) {
        batchErrors.push(batchError);
        console.warn("Price refresh batch failed:", batch, batchError);
      }
    }
    if (!mergedSnapshot?.quotes || (!Object.keys(mergedSnapshot.quotes).length && batchErrors.length)) {
      throw batchErrors[0] || new Error("Missing quote payload");
    }
  } catch (error) {
    if (!currentSnapshot) {
      const fallbackSnapshot = { source: "unavailable", updatedAt: new Date().toISOString(), quotes: {} };
      tickerRows.forEach((row) => {
        fallbackSnapshot.quotes[row.ticker] = {
          price: null,
          previousClose: null,
          history: { closes: [], highs: [], lows: [], volumes: [] },
          error: "No market data",
        };
      });
      applySnapshot(fallbackSnapshot, false);
      setRefreshChipForAttempt({ stale: true, message: t("unavailableRefresh") });
    } else {
      markCurrentSnapshotRefreshAttemptFailed();
    }
    console.warn("Price refresh failed:", error);
  } finally {
    if (batchErrors.length && mergedSnapshot?.quotes && Object.keys(mergedSnapshot.quotes).length) {
      markCurrentSnapshotRefreshAttemptFailed();
    }
    refreshRequestInFlight = false;
    updateManualRefreshButton();
    if (refreshQueued) {
      refreshQueued = false;
      window.setTimeout(() => refreshSnapshot({ force: true, mode: "force" }), 0);
    }
  }
}

async function runDashboardRefresh({ manual = false, auto = false, mode = null } = {}) {
  const effectiveMode = mode || (manual ? "force" : auto ? "auto" : "cache");
  if (manual) setRefreshChipForAttempt({ stale: Boolean(currentSnapshot), message: t("refreshing") });
  try {
    await syncWatchlistFromServer({ rerender: true, refreshPrices: false });
    syncTickerRows();
  } catch {
    // syncWatchlistFromServer handles its own warning state.
  }
  return refreshSnapshot({
    force: effectiveMode === "force",
    autoRefresh: effectiveMode === "auto",
    mode: effectiveMode,
  });
}

async function addTicker(rawTicker) {
  const ticker = normalizeTickerInput(rawTicker);
  if (!ticker) return false;
  const selectedMarketType = symbolSearchSelection?.market_type || (symbolSearchSelection?.market === "cn" ? "CN_A_SHARE" : symbolSearchSelection?.market === "us" ? "US" : null);
  const marketType = inferWatchlistMarketType(ticker, selectedMarketType);
  if (watchlistTickers.includes(ticker)) {
    syncWatchlistFromServer({ rerender: true, refreshPrices: false });
    return true;
  }

  try {
    const saveResponse = await fetch(WATCHLIST_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ticker, market_type: marketType }),
    });
    if (!saveResponse.ok) throw new Error(`Watchlist save failed: HTTP ${saveResponse.status}`);
    const savePayload = await saveResponse.json();
    applySharedWatchlist(savePayload.items || savePayload.watchlist || [], { rerender: true, refreshPrices: true, refreshMode: "cache" });
    return true;
  } catch (error) {
    console.warn(`Rejected ticker ${ticker}:`, error);
    alert(`${ticker} ${currentLanguage === "zh" ? "添加失败，请稍后再试。" : "could not be added right now. Please try again."}`);
    return false;
  }
}

function removeTicker(ticker) {
  if (!watchlistTickers.includes(ticker)) return false;
  const item = watchlistItems.find((entry) => entry.ticker === ticker);
  const marketType = item?.market_type || inferWatchlistMarketType(ticker);
  fetch(`${WATCHLIST_API_URL}/${encodeURIComponent(ticker)}?market_type=${encodeURIComponent(marketType)}`, {
    method: "DELETE",
  })
    .then(async (response) => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = await response.json();
      applySharedWatchlist(payload.items || payload.watchlist || [], { rerender: true, refreshPrices: true, refreshMode: "cache" });
    })
    .catch((error) => {
      console.warn(`Failed to remove shared ticker ${ticker}:`, error);
    });
  return true;
}

document.querySelector("#watchlistForm").addEventListener("submit", (event) => {
  event.preventDefault();
  const input = document.querySelector("#tickerInput");
  const selectedTickerToAdd = symbolSearchSelection?.ticker;
  if (!selectedTickerToAdd) {
    renderSymbolSearchMenu();
    input.focus();
    return;
  }
  addTicker(selectedTickerToAdd).then((added) => {
    if (added) {
      input.value = "";
      symbolSearchQuery = "";
      clearSymbolSearch({ keepInput: true });
    }
    input.focus();
  });
});

document.querySelector("#tickerInput").addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    clearSymbolSearch({ keepInput: true });
    return;
  }
  if (event.key === "Enter") {
    event.preventDefault();
    document.querySelector("#watchlistForm").requestSubmit();
  }
});

document.querySelector("#tickerInput").addEventListener("input", (event) => {
  const nextQuery = event.target.value;
  symbolSearchQuery = nextQuery;
  symbolSearchSelection = null;
  if (symbolSearchDebounce) window.clearTimeout(symbolSearchDebounce);
  symbolSearchDebounce = window.setTimeout(() => {
    runSymbolSearch(nextQuery);
  }, 220);
});

document.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;
  if (target.closest(".watchlist-input")) return;
  if (symbolSearchResults.length) {
    symbolSearchResults = [];
    renderSymbolSearchMenu();
  }
});

document.querySelectorAll(".sort-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    const key = btn.dataset.sortKey;
    if (sortState.key === key) {
      sortState = { key, dir: sortState.dir === "asc" ? "desc" : "asc" };
    } else {
      sortState = { key, dir: key === "ticker" || key === "type" ? "asc" : "desc" };
    }
    render();
  });
});

document.querySelectorAll(".filter-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    marketFilter = btn.dataset.marketFilter || "all";
    render();
  });
});

document.querySelectorAll(".lang-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    currentLanguage = btn.dataset.lang === "zh" ? "zh" : "en";
    persistLanguage(currentLanguage);
    render();
    if (currentSnapshot) {
      setRefreshChip(refreshChipText(currentSnapshot));
    } else {
      setRefreshChip(t("refresh"));
    }
  });
});

document.querySelector("#manualRefreshButton")?.addEventListener("click", () => {
  runDashboardRefresh({ manual: true });
});

document.querySelector("#detailModal")?.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;
  const tabButton = target.closest("[data-detail-tab]");
  if (tabButton instanceof HTMLElement) {
    detailActiveTab = tabButton.dataset.detailTab || "summary";
    renderDetailModal(selectedRow());
    return;
  }
  if (target.closest(".detail-close")) {
    modalOpen = false;
    render();
    return;
  }
  if (target.dataset.closeModal === "true") {
    modalOpen = false;
    render();
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && modalOpen) {
    modalOpen = false;
    render();
  }
});

loadCachedSnapshot();
syncTickerRows();
render();
runDashboardRefresh({ mode: "cache" });
setInterval(() => {
  runDashboardRefresh({ auto: true, mode: "auto" });
}, PRICE_REFRESH_MS);
setInterval(() => {
  syncWatchlistFromServer({ rerender: true, refreshPrices: false }).then((changed) => {
    if (changed) refreshSnapshot({ mode: "cache" });
  });
}, WATCHLIST_SYNC_MS);

document.addEventListener("visibilitychange", () => {
  if (!document.hidden) {
    syncWatchlistFromServer({ rerender: true, refreshPrices: false }).then((changed) => {
      if (changed) refreshSnapshot({ mode: "cache" });
    });
  }
});
