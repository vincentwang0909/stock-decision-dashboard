const API_BASE = window.location.protocol === "file:" ? "http://127.0.0.1:4173" : window.location.origin;
const API_URL = `${API_BASE}/api/market-data`;
const WATCHLIST_API_URL = `${API_BASE}/api/watchlist`;
const PRICE_CACHE_KEY = "stock-dashboard-market-cache-v4";
const WATCHLIST_CACHE_KEY = "stock-dashboard-watchlist-v1";
const WATCHLIST_SESSION_KEY = "stock-dashboard-watchlist-session-v1";
const WATCHLIST_MIGRATION_KEY = "stock-dashboard-watchlist-migration-v2";
const LANGUAGE_CACHE_KEY = "stock-dashboard-language-v1";
const PRICE_REFRESH_MS = 30 * 60 * 1000;
const WATCHLIST_SYNC_MS = 15 * 1000;
const REQUIRED_DEFAULT_TICKERS = ["300657", "002463", "603005", "600522"];

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
    refresh: "Auto refresh every 30m",
    lastUpdate: "last update",
    stocks: "Stocks",
    ticker: "Ticker",
    addStock: "Add Stock",
    removeStock: "Remove Stock",
    removeShort: "Remove",
    price: "Price",
    longTermRating: "Long-Term Rating",
    currentActionShort: "Current Action",
    currentAction: "Current Action",
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
    fallbackRefresh: "Auto refresh every 30m • using seeded fallback",
    unavailableRefresh: "Price source unavailable",
    staleRefresh: "Showing last successful snapshot",
    noMarketDataAdd: "has no available market data and could not be added.",
    noMarketData: "No market data",
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
    sortAiScore: "AI Score",
    sortCurrentAction: "Current Action",
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
    tabSummary: "AI Summary",
    tabTechnical: "Technical",
    tabFundamental: "Fundamental",
    tabFlow: "Money Flow",
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
    longTermPlan: "Long-Term Action",
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
  },
  zh: {
    appTitle: "股票决策面板",
    refresh: "每30分钟自动刷新一次",
    lastUpdate: "最后更新",
    stocks: "股票列表",
    ticker: "代码",
    addStock: "添加股票",
    removeStock: "删除股票",
    removeShort: "移除",
    price: "价格",
    longTermRating: "长期评级",
    currentActionShort: "当前操作",
    currentAction: "当前操作",
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
    fallbackRefresh: "每30分钟自动刷新一次 • 当前使用本地回退数据",
    unavailableRefresh: "行情源暂时不可用",
    staleRefresh: "当前显示上一次成功刷新结果",
    noMarketDataAdd: "没有可用的市场数据，无法添加。",
    noMarketData: "暂无行情数据",
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
    sortAiScore: "AI评分",
    sortCurrentAction: "当前操作",
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
    tabSummary: "AI总结",
    tabTechnical: "技术面",
    tabFundamental: "基本面",
    tabFlow: "资金面",
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
    longTermPlan: "中长线操作",
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
    if (value === "Short") return "做空";
    if (value === "Strong Sell") return "强烈卖出";
    if (value === "Sell") return "卖出";
    if (value === "Hold") return "持有 / 观望";
    if (value === "N/A") return "无数据";
  }
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

function clusterSideCandidates(candidates, close, side) {
  const sourceCaps = { historical: 35, volume: 30, ma: 20, fib: 10, bollinger: 5 };
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

  const previousClose = Number.isFinite(market.previousClose) ? market.previousClose : (closes.length > 1 ? closes[closes.length - 2] : close);
  const change = close - previousClose;
  const changePercent = previousClose ? (change / previousClose) * 100 : 0;

  const ema12 = ema(closes.slice(-60), 12) ?? close;
  const ema26 = ema(closes.slice(-120), 26) ?? close;
  const ma20 = mean(closes.slice(-20)) ?? close;
  const ma50 = mean(closes.slice(-50)) ?? close;
  const ma100 = mean(closes.slice(-100)) ?? close;
  const ma200 = mean(closes.slice(-200)) ?? close;
  const macd = ema12 - ema26;
  const rsi14 = rsi(closes, 14);
  const vol20 = mean(volumes.slice(-20)) ?? latest(volumes) ?? 0;
  const latestVolume = latest(volumes) ?? 0;
  const volumeRatio = vol20 ? latestVolume / vol20 : 1;
  const upperBand = ma20 + stdDev(closes.slice(-20)) * 2;
  const middleBand = ma20;
  const lowerBand = ma20 - stdDev(closes.slice(-20)) * 2;
  const recentLows = lows.slice(-252).filter((value) => Number.isFinite(value));
  const recentHighs = highs.slice(-252).filter((value) => Number.isFinite(value));
  const rangeLow = recentLows.length ? Math.min(...recentLows) : close;
  const rangeHigh = recentHighs.length ? Math.max(...recentHighs) : close;
  const { support, resistance, analysis: srAnalysis } = deriveLevels(close, history, { ma20, ma50, ma100, ma200, upperBand, middleBand, lowerBand, rangeLow, rangeHigh });
  const fibPosition = rangeHigh > rangeLow ? (close - rangeLow) / (rangeHigh - rangeLow) : 0.5;
  const pricePressure = clamp((close - ma20) / Math.max(ma20, 1), -0.25, 0.25);
  const closePosition = fibPosition;

  const ema12Signal = close > ema12 && ema12 > ema26 ? { signal: "buy", trend: "up" } : close < ema12 && ema12 < ema26 ? { signal: "sell", trend: "down" } : { signal: "hold", trend: "flat" };
  const ema26Signal = close > ema26 ? { signal: "buy", trend: ema12 >= ema26 ? "up" : "flat" } : close < ema26 ? { signal: "sell", trend: ema12 <= ema26 ? "down" : "flat" } : { signal: "hold", trend: "flat" };
  const macdSignal = macd > 0.15 ? { signal: "buy", trend: "up" } : macd < -0.15 ? { signal: "sell", trend: "down" } : { signal: "hold", trend: "flat" };
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
    { key: "macd", value: macd, signal: macdSignal.signal, trend: macdSignal.trend },
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
      rsi14,
      fibPosition,
      ma20,
      ma50,
      ma100,
      ma200,
      latestVolume,
      vol20,
      volumeRatio,
      upperBand,
      middleBand,
      lowerBand,
      rangeLow,
      rangeHigh,
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
    longTermRating: "Hold",
    stockType: "growth",
    summary: `${ticker} is waiting for the next refresh.`,
    note: "Waiting for live data.",
    dominant: "hold",
    research: null,
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
  try {
    const sessionRaw = JSON.parse(sessionStorage.getItem(WATCHLIST_SESSION_KEY) || "null");
    if (Array.isArray(sessionRaw) && sessionRaw.length) {
      return normalizeWatchlist(sessionRaw);
    }
    const raw = JSON.parse(localStorage.getItem(WATCHLIST_CACHE_KEY) || "null");
    if (Array.isArray(raw) && raw.length) {
      return normalizeWatchlist(raw);
    }
  } catch {
    // ignore
  }
  return DEFAULT_WATCHLIST.slice();
}

function persistWatchlist() {
  try {
    const payload = JSON.stringify(watchlistTickers);
    localStorage.setItem(WATCHLIST_CACHE_KEY, payload);
    sessionStorage.setItem(WATCHLIST_SESSION_KEY, payload);
  } catch {
    // ignore storage failures
  }
}

function applySharedWatchlist(nextWatchlist, { rerender = true, refreshPrices = true } = {}) {
  const normalized = normalizeWatchlist(nextWatchlist);
  if (!normalized.length) return false;
  const changed = JSON.stringify(normalized) !== JSON.stringify(watchlistTickers);
  watchlistTickers = normalized;
  persistWatchlist();
  syncTickerRows();
  if (rerender) render();
  if (refreshPrices) refreshSnapshot();
  return changed;
}

async function fetchSharedWatchlist() {
  const response = await fetch(WATCHLIST_API_URL, { cache: "no-store" });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const payload = await response.json();
  return normalizeWatchlist(payload.watchlist || []);
}

async function syncWatchlistFromServer({ rerender = true, refreshPrices = false } = {}) {
  try {
    const serverWatchlist = await fetchSharedWatchlist();
    return applySharedWatchlist(serverWatchlist, { rerender, refreshPrices });
  } catch (error) {
    console.warn("Shared watchlist sync failed:", error);
    return false;
  }
}

function normalizeTickerInput(value) {
  return value.trim().toUpperCase().replace(/[^A-Z0-9.-]/g, "");
}

function normalizeWatchlist(list) {
  const seen = new Set();
  return list
    .map((ticker) => normalizeTickerInput(String(ticker)))
    .filter((ticker) => {
      if (!ticker || seen.has(ticker)) return false;
      seen.add(ticker);
      return true;
    });
}

let watchlistTickers = loadWatchlist();
if (!isWatchlistMigrationDone()) {
  watchlistTickers = normalizeWatchlist([...watchlistTickers, ...REQUIRED_DEFAULT_TICKERS]);
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

function syncTickerRows() {
  const previousRows = new Map(tickerRows.map((row) => [row.ticker, row]));
  tickerRows = watchlistTickers.map((ticker) => previousRows.get(ticker) || createRowState(ticker));

  if (!watchlistTickers.includes(selectedTicker)) {
    selectedTicker = watchlistTickers[0] || null;
  }
}

function sortRows(rows) {
  const dir = sortState.dir === "desc" ? -1 : 1;
  const actionRank = { "strong buy": 0, buy: 1, hold: 2, sell: 3, "strong sell": 4, short: 5 };

  return [...rows].sort((a, b) => {
    let left;
    let right;

    switch (sortState.key) {
      case "action":
        left = actionRank[(a.action || "").toLowerCase()] ?? 99;
        right = actionRank[(b.action || "").toLowerCase()] ?? 99;
        break;
      case "change":
        left = Number.isFinite(a.changePercent) ? a.changePercent : Number.NEGATIVE_INFINITY;
        right = Number.isFinite(b.changePercent) ? b.changePercent : Number.NEGATIVE_INFINITY;
        break;
      case "score":
        left = Number.isFinite(a.score) ? a.score : Number.NEGATIVE_INFINITY;
        right = Number.isFinite(b.score) ? b.score : Number.NEGATIVE_INFINITY;
        break;
      case "type":
        left = (a.research || buildLongTermResearch(a)).stockTypeLabel || "";
        right = (b.research || buildLongTermResearch(b)).stockTypeLabel || "";
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

function matchesFilter(row) {
  if (marketFilter === "all") return true;
  if (marketFilter === "us" || marketFilter === "cn") return marketTypeForTicker(row) === marketFilter;
  return (row.research || buildLongTermResearch(row)).stockType === marketFilter;
}

function setRefreshChip(text) {
  const refreshChip = document.querySelector(".refresh-chip span");
  if (refreshChip) refreshChip.textContent = text;
}

function formatSnapshotTimestamp(updatedAt) {
  if (!updatedAt) return null;
  const ts = new Date(updatedAt);
  if (Number.isNaN(ts.getTime())) return null;
  const locale = currentLanguage === "zh" ? "zh-CN" : "en-US";
  return ts.toLocaleString(locale, { dateStyle: "medium", timeStyle: "short" });
}

function refreshChipText(updatedAt, fallbackText = t("refresh")) {
  const formatted = formatSnapshotTimestamp(updatedAt);
  return formatted ? `${fallbackText} • ${t("lastUpdate")} ${formatted}` : fallbackText;
}

function applyLanguage() {
  document.title = t("appTitle");
  const headerTitle = document.querySelector(".brand h1");
  if (headerTitle) headerTitle.textContent = t("appTitle");
  const stocksTitle = document.querySelector("#stocksTitle");
  if (stocksTitle) stocksTitle.textContent = t("stocks");
  const tickerInputLabel = document.querySelector("#tickerInputLabel");
  if (tickerInputLabel) tickerInputLabel.textContent = t("ticker");
  const tickerInput = document.querySelector("#tickerInput");
  if (tickerInput) tickerInput.placeholder = currentLanguage === "zh" ? "例如 300657 / SHOP" : "e.g. SHOP / 300657";
  const addStockButton = document.querySelector("#addStockButton");
  if (addStockButton) addStockButton.textContent = t("addStock");
  const sortMixLabel = document.querySelector("#sortMixLabel");
  if (sortMixLabel) sortMixLabel.textContent = t("sortAiScore");
  const sortActionLabel = document.querySelector("#sortActionLabel");
  if (sortActionLabel) sortActionLabel.textContent = t("sortCurrentAction");
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
}

function summarizeRow(row) {
  if (row.ticker === "META" && row.price != null) {
    return `Meta example: bought near 550, peaked near 680, now re-evaluating around ${formatCurrency(row.price, row.currencyCode || inferCurrencyCode(row))}.`;
  }

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

function determineSetupAction({ score, srAnalysis, rsi14, fibPosition, price, ma20, ma50, changePercent, profile }) {
  const supportDistance = srAnalysis?.supportDistancePct;
  const resistanceDistance = srAnalysis?.resistanceDistancePct;
  const supportStrength = srAnalysis?.supportStrength ?? 0;
  const resistanceStrength = srAnalysis?.resistanceStrength ?? 0;
  const riskReward = srAnalysis?.riskReward;

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

  if (atSupport && strongSupport && washedOut && !extended && !trendBroken && qualityName && score >= 74) {
    return "Strong Buy";
  }

  if (nearSupport && strongSupport && goodReward && washedOut && trendHealthy && score >= 58) {
    return "Buy";
  }

  if (score >= 72 && atSupport && !extended && trendHealthy && qualityName) {
    return "Buy";
  }

  if (nearResistance && strongResistance && extended && poorReward && score < 30) {
    return "Strong Sell";
  }

  if (nearResistance && strongResistance && (extended || poorReward)) {
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
  if (score >= 90) return { tone: "buy", label: t("aiRatingScaleStrongBuy") };
  if (score >= 75) return { tone: "buy", label: t("aiRatingScaleBuy") };
  if (score >= 55) return { tone: "hold", label: t("aiRatingScaleHold") };
  if (score >= 35) return { tone: "sell", label: t("aiRatingScaleSell") };
  if (score >= 20) return { tone: "sell", label: t("aiRatingScaleStrongSell") };
  return { tone: "sell", label: t("aiRatingScaleShort") };
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
  if (row.noData) return t("noSignalReason");
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
  lines.push(`${t("modelUsed")}: ${research.modelLabel}`);
  if (row.price != null && tech.ma200 != null) {
    lines.push(row.price >= tech.ma200
      ? (currentLanguage === "zh" ? "长期趋势仍站在 MA200 上方" : "Long-term trend remains above MA200")
      : (currentLanguage === "zh" ? "长期趋势跌破 MA200，需要更谨慎" : "Long-term trend is below MA200 and needs more caution"));
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
  if (score >= 90) return "Strong Buy";
  if (score >= 75) return "Buy";
  if (score >= 55) return "Hold";
  if (score >= 35) return "Sell";
  if (score >= 20) return "Strong Sell";
  return "Short";
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
  const peg = forwardPe != null && (epsGrowth ?? 0) > 0 ? forwardPe / Math.max((epsGrowth ?? 0) * 100, 1) : null;
  const evEbitda = pe != null ? clamp(pe * (0.65 + profile.quality * 0.18), 4, 60) : null;
  const psRatio = clamp(1.2 + profile.growth * 7.5 + profile.quality * 1.4 + profile.sentiment * 0.8, 0.8, 18);

  return {
    revenueGrowth,
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
  const historyCount = row.technicals?.history?.closes?.length ?? 0;

  if (historyCount > 0 && historyCount < 120) return "newlyListed";
  if (marketCap >= 250_000_000_000) return "megaCap";
  if (price < 5 || ((pe ?? 80) > 55 && growthScore < 65) || ((row.profile?.cash ?? 0) < 0 && dims.fundamental < 40)) return "speculative";
  if (qualityScore < 40 && growthScore < 45 && dims.technical < 55) return "turnaround";
  if ((pe ?? 999) < 18 && valuationScore >= 60 && qualityScore >= 50) return "value";
  if ((row.profile?.cash ?? 0) > 0.45 && qualityScore >= 68 && growthScore < 58) return "dividend";
  if (growthScore >= 65 || (row.profile?.growth ?? 0) >= 0.65) return "growth";
  return marketCap >= 100_000_000_000 ? "megaCap" : "value";
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
  const componentScores = {
    technical: dims.technical,
    fundamental,
    moneyFlow: dims.moneyFlow,
    quality: qualityScore,
    growth: growthScore,
    valuation: valuationScore,
  };
  const overallScore = weightedResearchScore(config.weights, componentScores);
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
  };
}

function compactLevelList(values, count = 2) {
  return values.filter((value) => Number.isFinite(value)).slice(0, count);
}

function buildDecisionLevels(row) {
  const tech = row.technicals || {};
  const sr = tech.srAnalysis || {};
  const shortSupport = compactLevelList((sr.support || []).map((item) => item.price), 2);
  const shortResistance = compactLevelList((sr.resistance || []).map((item) => item.price), 2);
  const longSupportPool = [
    tech.ma200,
    tech.ma100,
    tech.rangeLow,
    (sr.support || [])[2]?.price,
    (sr.support || [])[1]?.price,
  ].filter((value) => Number.isFinite(value) && value <= (row.price ?? Number.POSITIVE_INFINITY));
  const longResistancePool = [
    tech.rangeHigh,
    tech.ma50 > (row.price ?? 0) ? tech.ma50 : null,
    tech.upperBand > (row.price ?? 0) ? tech.upperBand : null,
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

  if (map.macd?.signal === "buy") positives.push(currentLanguage === "zh" ? "MACD 偏多" : "MACD trend is supportive");
  if ((tech.ema12 ?? 0) > (tech.ema26 ?? 0)) positives.push(currentLanguage === "zh" ? "EMA 仍保持上行结构" : "EMA structure is still positive");
  if (row.price != null && tech.ma50 != null && row.price > tech.ma50) positives.push(currentLanguage === "zh" ? "股价站上 MA50" : "Price remains above MA50");
  if (map.rev?.signal === "buy" && map.eps?.signal === "buy") positives.push(currentLanguage === "zh" ? "营收和利润增长仍然健康" : "Revenue and EPS growth remain healthy");
  if (map.fcf?.signal === "buy") positives.push(currentLanguage === "zh" ? "自由现金流为正" : "Free cash flow remains positive");
  if ((sr.supportDistancePct ?? 99) <= 3 && (sr.supportStrength ?? 0) >= 50) positives.push(currentLanguage === "zh" ? "距离强支撑不远" : "Price is not far from a stronger support zone");

  if ((tech.rsi14 ?? 50) >= 68) warnings.push(currentLanguage === "zh" ? "RSI 偏高，不适合追涨" : "RSI is elevated, so chasing strength is less attractive");
  if (row.price != null && tech.ma20 != null && row.price < tech.ma20) warnings.push(currentLanguage === "zh" ? "价格跌破 MA20，短线动能转弱" : "Price is below MA20, which weakens short-term momentum");
  if ((sr.resistanceDistancePct ?? 99) <= 2) warnings.push(currentLanguage === "zh" ? "股价接近压力区" : "Price is already close to resistance");
  if (map.fcf?.signal === "sell") warnings.push(currentLanguage === "zh" ? "自由现金流为负" : "Free cash flow is negative");
  if ((row.trailingPE ?? 0) >= 35) warnings.push(currentLanguage === "zh" ? "估值偏高" : "Valuation is rich");
  if ((row.changePercent ?? 0) <= -3) warnings.push(currentLanguage === "zh" ? "单日跌幅较大，情绪偏弱" : "The latest selloff shows weaker short-term sentiment");

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
    ? (currentLanguage === "zh" ? "价格靠近支撑区，技术面给出更好的进场窗口。" : "Price is close to support and technicals offer a cleaner entry window.")
    : row.action === "Hold"
      ? (currentLanguage === "zh" ? "好公司不等于好买点，当前更适合等待支撑确认或放量突破。" : "A good company does not always mean a good entry; better to wait for support or a cleaner breakout.")
      : (currentLanguage === "zh" ? "短线结构仍偏弱，当前不适合主动追进去。" : "Short-term structure remains weak, so this is not an attractive immediate entry.");
  const buyTrigger = levels.shortResistance[0] != null
    ? (currentLanguage === "zh"
      ? `放量突破 ${formatCurrency(levels.shortResistance[0], row.currencyCode)}`
      : `Break above ${formatCurrency(levels.shortResistance[0], row.currencyCode)} on stronger volume`)
    : t("noSignalReason");
  const waitZone = levels.shortSupport[0] != null
    ? formatCurrency(levels.shortSupport[0], row.currencyCode)
    : "—";
  const shortTermPlan = row.action === "Hold"
    ? (currentLanguage === "zh" ? `不追高，优先等待回踩 ${waitZone} 附近或突破后再看。` : `Do not chase. Prefer a pullback toward ${waitZone} or a confirmed breakout.`)
    : row.action.includes("Buy")
      ? (currentLanguage === "zh" ? `可以小仓位试探，优先围绕 ${waitZone} 分批观察。` : `A small starter position is reasonable around ${waitZone}.`)
      : (currentLanguage === "zh" ? "先观察结构修复，不急着逆势加仓。" : "Wait for structure repair before getting involved.");
  const longTermPlan = research.longTermRating === "Buy" || research.longTermRating === "Strong Buy"
    ? (currentLanguage === "zh" ? "适合分批建仓，不建议一次性满仓。" : "Suitable for staged accumulation rather than a full-size entry.")
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
    levels,
    flowStage,
    currentActionReason,
    buyTrigger,
    waitZone,
    shortTermPlan,
    longTermPlan,
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

  const companyName = companyNameForTicker(row.ticker, row);
  const exchange = exchangeCodeForTicker(row.ticker, row);
  const currencyCode = row.currencyCode || inferCurrencyCode(row);
  const payload = buildDetailPayload(row);
  const research = payload.research;
  const scoreBand = scoreToBand(row.score);
  const changeTone = Number.isFinite(row.changePercent) ? (row.changePercent >= 0 ? "buy" : "sell") : "hold";
  const tabItems = [
    { key: "summary", label: t("tabSummary") },
    { key: "technical", label: t("tabTechnical") },
    { key: "fundamental", label: t("tabFundamental") },
    { key: "flow", label: t("tabFlow") },
    { key: "quality", label: t("qualityScore") },
    { key: "growth", label: t("growthScore") },
    { key: "valuation", label: t("valuationScore") },
  ];

  const summaryPanel = `
    <section class="decision-summary-card">
      <div class="decision-summary-head">
        <div>
          <h3>${t("aiAnalysis")}</h3>
          <p>${research.thesis.summary}</p>
        </div>
      </div>
      <div class="detail-kpi-grid">
        <article class="detail-kpi-card ${actionClass(research.longTermRating)}">
          <span>${t("longTermRating")}</span>
          <strong>${localizedActionLabel(research.longTermRating)}</strong>
          <small>${research.longTermFit}</small>
        </article>
        <article class="detail-kpi-card ${actionClass(row.action)}">
          <span>${t("currentAction")}</span>
          <strong>${localizedActionLabel(row.action)}</strong>
          <small>${payload.currentActionReason}</small>
        </article>
        <article class="detail-kpi-card ${scoreBand.tone}">
          <span>${t("aiScore")}</span>
          <strong>${scoreValue(row.score)}</strong>
          <small>${scoreBand.label}</small>
        </article>
        <article class="detail-kpi-card neutral">
          <span>${t("stockType")}</span>
          <strong>${research.stockTypeLabel}</strong>
          <small>${t("modelUsed")} ${research.modelLabel}</small>
        </article>
      </div>
      <div class="decision-summary-grid">
        <div class="decision-list-card">
          <div class="decision-list-title">${t("whyOwn")}</div>
          <div class="decision-bullets">
            ${research.thesis.own.length ? research.thesis.own.map((item) => `<div class="decision-bullet positive">✓ ${item}</div>`).join("") : `<div class="decision-bullet muted">${t("noSignalReason")}</div>`}
          </div>
        </div>
        <div class="decision-list-card">
          <div class="decision-list-title">${t("whatToWatch")}</div>
          <div class="decision-bullets">
            ${research.thesis.watch.length ? research.thesis.watch.map((item) => `<div class="decision-bullet warning">⚠ ${item}</div>`).join("") : `<div class="decision-bullet muted">${t("noSignalReason")}</div>`}
          </div>
        </div>
      </div>
      <section class="detail-section-card">
        <div class="detail-section-head"><h3>${t("supportResistanceRead")}</h3></div>
        <div class="detail-line-list">
          <div class="detail-line-row"><div><div class="detail-line-label">${t("shortSupport")}</div></div><div class="detail-line-side"><strong>${payload.levels.shortSupport.map((v, i) => `${t("supportLevelShort")}${i + 1} ${formatCurrency(v, currencyCode)}`).join(" · ") || "—"}</strong></div></div>
          <div class="detail-line-row"><div><div class="detail-line-label">${t("shortResistance")}</div></div><div class="detail-line-side"><strong>${payload.levels.shortResistance.map((v, i) => `${t("resistanceLevelShort")}${i + 1} ${formatCurrency(v, currencyCode)}`).join(" · ") || "—"}</strong></div></div>
          <div class="detail-line-row"><div><div class="detail-line-label">${t("longSupport")}</div></div><div class="detail-line-side"><strong>${payload.levels.longSupport.map((v, i) => `${t("longSupportShort")}${i + 1} ${formatCurrency(v, currencyCode)}`).join(" · ") || "—"}</strong></div></div>
          <div class="detail-line-row"><div><div class="detail-line-label">${t("longResistance")}</div></div><div class="detail-line-side"><strong>${payload.levels.longResistance.map((v, i) => `${t("longResistanceShort")}${i + 1} ${formatCurrency(v, currencyCode)}`).join(" · ") || "—"}</strong></div></div>
          <div class="detail-line-row"><div><div class="detail-line-label">${t("distanceToSupport")}</div></div><div class="detail-line-side"><strong>${payload.levels.supportDistancePct == null ? "—" : `${payload.levels.supportDistancePct.toFixed(1)}%`}</strong></div></div>
          <div class="detail-line-row"><div><div class="detail-line-label">${t("distanceToResistance")}</div></div><div class="detail-line-side"><strong>${payload.levels.resistanceDistancePct == null ? "—" : `${payload.levels.resistanceDistancePct.toFixed(1)}%`}</strong></div></div>
        </div>
      </section>
      <section class="detail-section-card">
        <div class="detail-section-head"><h3>${t("shortTermPlan")}</h3></div>
        <div class="decision-bullets">
          <div class="decision-bullet">${localizedActionLabel(row.action)}</div>
          <div class="decision-bullet">• ${payload.currentActionReason}</div>
          <div class="decision-bullet">• ${t("buyWhen")} ${payload.buyTrigger}</div>
          <div class="decision-bullet">• ${t("waitZone")} ${payload.waitZone}</div>
          <div class="decision-bullet">• ${payload.shortTermPlan}</div>
        </div>
      </section>
      <section class="detail-section-card">
        <div class="detail-section-head"><h3>${t("longTermPlan")}</h3></div>
        <div class="decision-bullets">
          <div class="decision-bullet">${localizedActionLabel(research.longTermRating)}</div>
          <div class="decision-bullet">• ${research.longTermFit}</div>
          <div class="decision-bullet">• ${payload.longTermPlan}</div>
        </div>
      </section>
    </section>
  `;

  const technicalPanel = `
    <section class="detail-tab-section">
      <div class="detail-kpi-grid">
        <article class="detail-kpi-card ${scoreToBand(research.technical).tone}"><span>${t("technicalScore")}</span><strong>${scoreValue(research.technical)}</strong><small>${payload.technicalConclusion}</small></article>
        <article class="detail-kpi-card ${row.indicatorMap?.rsi?.signal || "hold"}"><span>RSI</span><strong>${formatOneDecimal(row.technicals?.rsi14)}</strong><small>${localizedActionLabel(signalLabel(row.indicatorMap?.rsi?.signal || "hold"))}</small></article>
        <article class="detail-kpi-card ${row.indicatorMap?.macd?.signal || "hold"}"><span>MACD</span><strong>${formatSignedCurrency(row.technicals?.macd, currencyCode)}</strong><small>${localizedActionLabel(signalLabel(row.indicatorMap?.macd?.signal || "hold"))}</small></article>
        <article class="detail-kpi-card ${row.indicatorMap?.ma50?.signal || "hold"}"><span>${t("supportResistanceRead")}</span><strong>${payload.levels.resistanceDistancePct == null ? "—" : `${payload.levels.resistanceDistancePct.toFixed(1)}%`}</strong><small>${currentLanguage === "zh" ? "越接近压力位越不适合追高" : "Less attractive when price is too close to resistance"}</small></article>
      </div>
      <section class="detail-section-card"><div class="detail-section-head"><h3>${t("trendAnalysis")}</h3></div><div class="detail-line-list">${payload.trendSummary.map((item) => `<div class="detail-line-row"><div><div class="detail-line-label">${item.label}</div><div class="detail-line-note">${item.note}</div></div><div class="detail-line-side"><strong>${item.value}</strong></div></div>`).join("")}</div></section>
      <section class="detail-section-card"><div class="detail-section-head"><h3>${t("technicalRisks")}</h3></div><div class="decision-bullets">${(payload.technicalRisks.length ? payload.technicalRisks : [currentLanguage === "zh" ? "技术面暂无额外警示。" : "No additional technical warning stands out."]).map((item) => `<div class="decision-bullet warning">⚠ ${item}</div>`).join("")}</div></section>
    </section>
  `;

  const fundamentalPanel = `
    <section class="detail-tab-section">
      <div class="detail-kpi-grid">
        <article class="detail-kpi-card ${scoreToBand(research.fundamental).tone}"><span>${t("fundamentalScore")}</span><strong>${scoreValue(research.fundamental)}</strong><small>${payload.fundamentalConclusion}</small></article>
        <article class="detail-kpi-card ${row.indicatorMap?.rev?.signal || "hold"}"><span>${t("revenueGrowth")}</span><strong>${row.indicatorMap?.rev?.display || "—"}</strong><small>${localizedActionLabel(signalLabel(row.indicatorMap?.rev?.signal || "hold"))}</small></article>
        <article class="detail-kpi-card ${row.indicatorMap?.eps?.signal || "hold"}"><span>${t("profitGrowth")}</span><strong>${row.indicatorMap?.eps?.display || "—"}</strong><small>${localizedActionLabel(signalLabel(row.indicatorMap?.eps?.signal || "hold"))}</small></article>
        <article class="detail-kpi-card ${row.indicatorMap?.fcf?.signal || "hold"}"><span>${t("freeCashFlow")}</span><strong>${row.indicatorMap?.fcf?.display || "—"}</strong><small>${localizedActionLabel(signalLabel(row.indicatorMap?.fcf?.signal || "hold"))}</small></article>
      </div>
      <section class="detail-section-card"><div class="detail-section-head"><h3>${t("fundamentalSummary")}</h3></div><div class="decision-bullets"><div class="decision-bullet">• ${payload.fundamentalConclusion}</div>${payload.fundamentalRisks.map((item) => `<div class="decision-bullet warning">⚠ ${item}</div>`).join("")}</div></section>
    </section>
  `;

  const flowPanel = `
    <section class="detail-tab-section">
      <div class="detail-kpi-grid">
        <article class="detail-kpi-card ${scoreToBand(research.moneyFlow).tone}"><span>${t("moneyFlowScore")}</span><strong>${scoreValue(research.moneyFlow)}</strong><small>${payload.flowConclusion}</small></article>
        <article class="detail-kpi-card ${row.indicatorMap?.volume?.signal || "hold"}"><span>${currentLanguage === "zh" ? "成交量" : "Volume"}</span><strong>${formatCompactVolume(row.technicals?.latestVolume)}</strong><small>${payload.flowStage.behavior}</small></article>
        <article class="detail-kpi-card ${(row.indicatorMap?.volume?.signal || "hold")}"><span>${t("volumeRatio")}</span><strong>${formatRatio(row.technicals?.volumeRatio)}</strong><small>${payload.flowStage.stage}</small></article>
        <article class="detail-kpi-card ${changeTone}"><span>${t("dayMove")}</span><strong>${`${formatSignedCurrency(row.change, currencyCode)} / ${formatChangePercent(row.changePercent)}`}</strong><small>${currentLanguage === "zh" ? "相对前一交易日收盘" : "Versus the prior close"}</small></article>
      </div>
      <section class="detail-section-card"><div class="detail-section-head"><h3>${t("moneyFlowSummary")}</h3></div><div class="detail-line-list"><div class="detail-line-row"><div><div class="detail-line-label">${t("moneyFlowBehavior")}</div></div><div class="detail-line-side"><strong>${payload.flowStage.behavior}</strong></div></div><div class="detail-line-row"><div><div class="detail-line-label">${t("moneyFlowStage")}</div></div><div class="detail-line-side"><strong>${payload.flowStage.stage}</strong></div></div></div></section>
      <section class="detail-section-card"><div class="detail-section-head"><h3>${t("flowRisks")}</h3></div><div class="decision-bullets">${(payload.flowRisks.length ? payload.flowRisks : [currentLanguage === "zh" ? "资金面暂无额外警示。" : "No additional money flow warning stands out."]).map((item) => `<div class="decision-bullet warning">⚠ ${item}</div>`).join("")}</div></section>
    </section>
  `;

  const qualityPanel = `
    <section class="detail-tab-section">
      <div class="detail-kpi-grid">
        <article class="detail-kpi-card ${scoreToBand(research.qualityScore).tone}"><span>${t("qualityScore")}</span><strong>${scoreValue(research.qualityScore)}</strong><small>${research.qualityScore >= 75 ? t("highQualityBusiness") : research.longTermFit}</small></article>
        <article class="detail-kpi-card ${row.indicatorMap?.roe?.signal || "hold"}"><span>ROE</span><strong>${row.indicatorMap?.roe?.display || "—"}</strong><small>${localizedActionLabel(signalLabel(row.indicatorMap?.roe?.signal || "hold"))}</small></article>
        <article class="detail-kpi-card ${row.indicatorMap?.gross?.signal || "hold"}"><span>${INDICATOR_LABELS.gross[currentLanguage]}</span><strong>${row.indicatorMap?.gross?.display || "—"}</strong><small>${localizedActionLabel(signalLabel(row.indicatorMap?.gross?.signal || "hold"))}</small></article>
        <article class="detail-kpi-card neutral"><span>${t("operatingMargin")}</span><strong>${formatPercentage(research.metrics.operatingMargin)}</strong><small>${t("qualitySummary")}</small></article>
        <article class="detail-kpi-card neutral"><span>${t("debtRatio")}</span><strong>${formatPercentage(research.metrics.debtRatio)}</strong><small>${currentLanguage === "zh" ? "越低越好" : "Lower is better"}</small></article>
        <article class="detail-kpi-card neutral"><span>${t("cashReserve")}</span><strong>${formatPercentage(research.metrics.cashReserve)}</strong><small>${currentLanguage === "zh" ? "现金储备越高越稳" : "Higher cash reserve supports durability"}</small></article>
      </div>
    </section>
  `;

  const growthPanel = `
    <section class="detail-tab-section">
      <div class="detail-kpi-grid">
        <article class="detail-kpi-card ${scoreToBand(research.growthScore).tone}"><span>${t("growthScore")}</span><strong>${scoreValue(research.growthScore)}</strong><small>${research.growthScore >= 75 ? t("fastGrowingBusiness") : research.thesis.summary}</small></article>
        <article class="detail-kpi-card ${row.indicatorMap?.rev?.signal || "hold"}"><span>${t("revenueGrowth")}</span><strong>${row.indicatorMap?.rev?.display || "—"}</strong><small>${localizedActionLabel(signalLabel(row.indicatorMap?.rev?.signal || "hold"))}</small></article>
        <article class="detail-kpi-card ${row.indicatorMap?.eps?.signal || "hold"}"><span>${currentLanguage === "zh" ? "每股收益增长" : "EPS Growth"}</span><strong>${row.indicatorMap?.eps?.display || "—"}</strong><small>${localizedActionLabel(signalLabel(row.indicatorMap?.eps?.signal || "hold"))}</small></article>
        <article class="detail-kpi-card neutral"><span>${t("fcfGrowth")}</span><strong>${formatPercentage(research.metrics.fcfGrowth)}</strong><small>${t("growthSummary")}</small></article>
        <article class="detail-kpi-card neutral"><span>${t("analystView")}</span><strong>${formatPercentage(research.metrics.analystView)}</strong><small>${currentLanguage === "zh" ? "分析师增速预期" : "Street growth expectation"}</small></article>
        <article class="detail-kpi-card neutral"><span>${t("guidance")}</span><strong>${formatPercentage(research.metrics.guidance)}</strong><small>${currentLanguage === "zh" ? "未来指引倾向" : "Forward guidance bias"}</small></article>
      </div>
    </section>
  `;

  const valuationPanel = `
    <section class="detail-tab-section">
      <div class="detail-kpi-grid">
        <article class="detail-kpi-card ${scoreToBand(research.valuationScore).tone}"><span>${t("valuationScore")}</span><strong>${scoreValue(research.valuationScore)}</strong><small>${research.valuationState}</small></article>
        <article class="detail-kpi-card neutral"><span>${t("pe")}</span><strong>${formatRatio(research.metrics.pe)}</strong><small>${t("valuationSummary")}</small></article>
        <article class="detail-kpi-card neutral"><span>${t("forwardPe")}</span><strong>${formatRatio(research.metrics.forwardPe)}</strong><small>${currentLanguage === "zh" ? "未来12个月" : "Next 12 months"}</small></article>
        <article class="detail-kpi-card neutral"><span>${t("pegRatio")}</span><strong>${formatRatio(research.metrics.peg)}</strong><small>PEG</small></article>
        <article class="detail-kpi-card neutral"><span>${t("evEbitda")}</span><strong>${formatRatio(research.metrics.evEbitda)}</strong><small>EV / EBITDA</small></article>
        <article class="detail-kpi-card neutral"><span>${t("psRatio")}</span><strong>${formatRatio(research.metrics.psRatio)}</strong><small>PS Ratio</small></article>
      </div>
    </section>
  `;

  const tabPanels = { summary: summaryPanel, technical: technicalPanel, fundamental: fundamentalPanel, flow: flowPanel, quality: qualityPanel, growth: growthPanel, valuation: valuationPanel };

  sheet.innerHTML = `
    <button id="detailModalClose" class="detail-close" type="button" aria-label="${t("closeDetail")}">×</button>
    <div class="detail-sheet-header detail-sheet-header-dark">
      <div>
        <h2 id="modalTicker">${companyName}</h2>
        <p id="modalCompany" class="detail-sheet-company">${row.ticker}</p>
        <p id="modalExchange" class="detail-sheet-exchange">${exchange}</p>
      </div>
      <div id="modalUpdatedAt" class="detail-sheet-stamp">${t("updatedAtShort")} ${formatSnapshotTimestamp(currentSnapshot?.updatedAt || row.updatedAt) || "—"}</div>
    </div>

    <section class="decision-hero">
      <div class="decision-hero-main">
        <div class="decision-code">${row.ticker}</div>
        <div class="decision-company">${companyName}</div>
      </div>
      <div class="decision-core-grid">
        <article class="decision-core-card">
          <span>${t("currentPrice")}</span>
          <strong>${formatCurrency(row.price, currencyCode)}</strong>
        </article>
        <article class="decision-core-card ${changeTone}">
          <span>${t("dayMove")}</span>
          <strong>${formatChangePercent(row.changePercent)}</strong>
        </article>
        <article class="decision-core-card ${actionClass(research.longTermRating)}">
          <span>${t("longTermRating")}</span>
          <strong>${localizedActionLabel(research.longTermRating)}</strong>
        </article>
        <article class="decision-core-card ${actionClass(row.action)}">
          <span>${t("currentAction")}</span>
          <strong>${localizedActionLabel(row.action)}</strong>
        </article>
      </div>
    </section>

    <section class="detail-card detail-overview-card">
      <div class="detail-overview-grid">
        <div>
          <div class="detail-overview-label">${t("longTermRating")}</div>
          <div class="detail-overview-value ${actionClass(research.longTermRating)}">${localizedActionLabel(research.longTermRating)}</div>
          <div class="detail-overview-list">
            ${payload.reasonLines.map((line) => `<p class="detail-overview-reason">• ${line}</p>`).join("")}
          </div>
        </div>
        <div>
          <div class="detail-overview-label">${t("currentAction")}</div>
          <div class="detail-overview-score-row">
            <strong class="${actionClass(row.action)}">${localizedActionLabel(row.action)}</strong>
            <span class="signal ${actionClass(row.action)}">${localizedActionLabel(row.action)}</span>
          </div>
          <p class="detail-overview-reason">${payload.currentActionReason}</p>
        </div>
        <div>
          <div class="detail-overview-label">${t("aiScore")}</div>
          <div class="detail-overview-value">${scoreValue(row.score)}</div>
          <div class="score-track"><div class="score-fill ${scoreBand.tone}" style="width:${clamp(row.score ?? 0, 0, 100)}%"></div></div>
          <div class="detail-consensus-mini">
            <span>${t("buyWord")} ${payload.consensus.counts.buy}</span>
            <span>${t("holdWord")} ${payload.consensus.counts.hold}</span>
            <span>${t("sellWord")} ${payload.consensus.counts.sell}</span>
          </div>
          <p class="detail-overview-reason">${t("stockType")} ${research.stockTypeLabel}</p>
          <p class="detail-overview-help">${t("modelUsed")} ${research.modelLabel}</p>
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
  document.querySelector("#detailPrice").textContent = formatCurrency(row.price, currencyCode);
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
    const research = row.research || buildLongTermResearch(row);
    const item = document.createElement("div");
    item.className = `stock-item${row.ticker === current?.ticker ? " active" : ""}`;
    item.setAttribute("role", "button");
    item.setAttribute("tabindex", "0");
    item.innerHTML = `
      <div class="stock-item-main">
        <div class="stock-copy">
          <div class="stock-symbol">${row.ticker}</div>
          <div class="stock-company">${companyName}</div>
          <div class="stock-price-row">
            <strong>${row.noData ? t("noMarketData") : `${formatCurrency(row.price, currencyCode)}`}</strong>
            <span class="stock-day-move ${dayTone}">${formatChangePercent(row.changePercent)}</span>
          </div>
        </div>
        <div class="stock-badges stock-badges-compact">
          <div class="stock-rating-stack">
            <span class="stock-mini-label">${t("currentActionShort")}</span>
            <span class="decision-badge ${actionClass(row.action)}">${localizedActionLabel(row.action)}</span>
          </div>
        </div>
      </div>
      <div class="stock-item-meta stock-item-meta-minimal">
        <div class="stock-score-compact">
          <span class="stock-label">${t("aiScore")}</span>
          <strong>${scoreValue(row.score)}</strong>
        </div>
        <div class="stock-type-compact">
          <span class="stock-label">${t("stockType")}</span>
          <strong>${research.stockTypeLabel}</strong>
        </div>
        <button class="stock-remove-btn" type="button" aria-label="${removeLabel}" title="${removeLabel}">
          <span class="stock-remove-icon" aria-hidden="true">×</span>
          <span class="stock-remove-text">${t("removeShort")}</span>
        </button>
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
  price.innerHTML = `<span class="price-cell">${formatCurrency(row.price, row.currencyCode || inferCurrencyCode(row))}</span>`;
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
    row.score = row.research.overallScore;
    row.longTermRating = row.research.longTermRating;
    row.action = row.research.currentAction;
    row.currentAction = row.research.currentAction;
    row.stockType = row.research.stockType;
    row.note = row.research.thesis.summary;
    row.summary = `${row.ticker} ${currentLanguage === "zh" ? "研究快照" : "research snapshot"}`;
    row.dominant = row.action.toLowerCase();
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
    const cachedTime = cached.snapshot?.updatedAt || cached.updatedAt;
    const chipText = refreshChipText(cachedTime);
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
    row.trailingPE = metrics.trailingPE;
    row.forwardPE = metrics.forwardPE;
    row.marketCap = metrics.marketCap;
    row.updatedAt = metrics.updatedAt;
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
    row.score = row.research.overallScore;
    row.longTermRating = row.research.longTermRating;
    row.action = row.research.currentAction;
    row.currentAction = row.research.currentAction;
    row.stockType = row.research.stockType;
    row.summary = `${row.ticker} ${currentLanguage === "zh" ? "研究快照" : "research snapshot"}`;
    row.note = row.research.thesis.summary;
    row.dominant = row.action.toLowerCase();

    if (snapshot?.source === "yahoo-chart" && row.noData && !DEFAULT_WATCHLIST.includes(row.ticker)) {
      invalidCustomTickers.push(row.ticker);
    }
  });

  if (invalidCustomTickers.length) {
    watchlistTickers = watchlistTickers.filter((ticker) => !invalidCustomTickers.includes(ticker));
    persistWatchlist();
    syncTickerRows();
  }

  if (shouldPersist) persistSnapshot(snapshot);
  render();

  setRefreshChip(refreshChipText(snapshot.updatedAt));
}

async function refreshSnapshot() {
  if (!tickerRows.length) return;

  const symbols = tickerRows.map((row) => row.ticker).join(",");
  const url = `${API_URL}?tickers=${encodeURIComponent(symbols)}`;

  try {
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const snapshot = await response.json();
    if (!snapshot?.quotes) throw new Error("Missing quote payload");
    applySnapshot(snapshot, true);
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
      setRefreshChip(t("unavailableRefresh"));
    } else {
      setRefreshChip(`${refreshChipText(currentSnapshot.updatedAt)} • ${t("staleRefresh")}`);
    }
    console.warn("Price refresh failed:", error);
  }
}

async function addTicker(rawTicker) {
  const ticker = normalizeTickerInput(rawTicker);
  if (!ticker) return false;
  if (watchlistTickers.includes(ticker)) return false;

  try {
    const response = await fetch(`${API_URL}?tickers=${encodeURIComponent(ticker)}`, { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const snapshot = await response.json();
    const quote = snapshot?.quotes?.[ticker];
    const hasValidPrice = Number.isFinite(quote?.price);

    if (!hasValidPrice) {
      throw new Error("No market data");
    }

    const saveResponse = await fetch(WATCHLIST_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ticker }),
    });
    if (!saveResponse.ok) throw new Error(`Watchlist save failed: HTTP ${saveResponse.status}`);
    const savePayload = await saveResponse.json();
    applySharedWatchlist(savePayload.watchlist || [], { rerender: true, refreshPrices: true });
    return true;
  } catch (error) {
    console.warn(`Rejected ticker ${ticker}:`, error);
    alert(`${ticker} ${t("noMarketDataAdd")}`);
    return false;
  }
}

function removeTicker(ticker) {
  if (!watchlistTickers.includes(ticker)) return false;
  fetch(`${WATCHLIST_API_URL}?ticker=${encodeURIComponent(ticker)}`, {
    method: "DELETE",
  })
    .then(async (response) => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = await response.json();
      applySharedWatchlist(payload.watchlist || [], { rerender: true, refreshPrices: true });
    })
    .catch((error) => {
      console.warn(`Failed to remove shared ticker ${ticker}:`, error);
    });
  return true;
}

document.querySelector("#watchlistForm").addEventListener("submit", (event) => {
  event.preventDefault();
  const input = document.querySelector("#tickerInput");
  addTicker(input.value).then((added) => {
    if (added) input.value = "";
    input.focus();
  });
});

document.querySelector("#tickerInput").addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    document.querySelector("#watchlistForm").requestSubmit();
  }
});

document.querySelectorAll(".sort-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    const key = btn.dataset.sortKey;
    if (sortState.key === key) {
      sortState = { key, dir: sortState.dir === "asc" ? "desc" : "asc" };
    } else {
      sortState = { key, dir: key === "action" || key === "type" ? "asc" : "desc" };
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
    if (currentSnapshot?.updatedAt) {
      setRefreshChip(refreshChipText(currentSnapshot.updatedAt));
    } else {
      setRefreshChip(t("refresh"));
    }
  });
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
syncWatchlistFromServer({ rerender: true, refreshPrices: true });
refreshSnapshot();
setInterval(refreshSnapshot, PRICE_REFRESH_MS);
setInterval(() => {
  syncWatchlistFromServer({ rerender: true, refreshPrices: false });
}, WATCHLIST_SYNC_MS);

document.addEventListener("visibilitychange", () => {
  if (!document.hidden) {
    syncWatchlistFromServer({ rerender: true, refreshPrices: true });
    refreshSnapshot();
  }
});
