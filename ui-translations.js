/* Presentation only: canonical features, profile slots and model inputs stay unchanged. */
(function createDashboardI18n(root) {
  "use strict";

  const STATES = Object.freeze({
    available: "可用", partial: "部分可用", stale: "数据较旧", unverified: "尚未核实",
    source_unavailable: "来源不可用", insufficient_history: "历史不足", calculation_error: "计算错误",
    dependency_unavailable: "必要输入不可用", not_applicable: "不适用", market_session_incomplete: "交易时段未完成",
    invalid_source_data: "源数据无效", previous_refresh_generation: "来自较早刷新批次",
    rising: "上升", falling: "下降", flat: "走平", stable: "稳定", above: "高于参考值", below: "低于参考值", at: "位于参考值",
    bullish: "偏多", bearish: "偏空", strong_bullish: "强势多头", strong_bearish: "强势空头", mixed: "信号混合",
    tight: "紧密收敛", compressing: "收敛中", expanding: "扩张中", contracting: "收缩中", normal: "正常",
    extreme_oversold: "极度超卖", oversold: "超卖", weak: "偏弱", neutral: "中性", strong: "较强",
    overbought: "超买", extreme_overbought: "极度超买", none: "无", bearish_divergence: "顶背离", bullish_divergence: "底背离",
    accelerating_bullish: "多头动量增强", decelerating_bullish: "多头动量减弱",
    recovering_bearish: "空头动量修复", accelerating_bearish: "空头动量增强",
    bullish_cross: "金叉", bearish_cross: "死叉", above_zero: "零轴上方", below_zero: "零轴下方", at_zero: "位于零轴",
    improving: "改善中", deteriorating: "恶化中", no_trend: "无明显趋势", developing: "趋势形成中", very_strong: "很强",
    very_low: "很低", low: "低", high: "高", elevated: "偏高", extreme: "极高",
    squeeze: "波动压缩", expanded: "波动扩张", above_upper: "上轨上方", below_lower: "下轨下方",
    upper: "上轨附近", lower: "下轨附近", middle: "中轨附近",
    confirming_uptrend: "确认上行趋势", confirming_downtrend: "确认下行趋势", divergent: "量价背离",
    accumulation: "吸筹", distribution: "派发", balanced: "买卖均衡", bullish_confirmation: "多头确认", bearish_confirmation: "空头确认",
    outperforming: "跑赢基准", underperforming: "跑输基准",
    squeeze_on: "波动压缩", squeeze_off: "波动释放状态", squeeze_neither: "过渡状态",
    positive: "正向动量", negative: "负向动量", positive_increasing: "正向动量增强", positive_decreasing: "正向动量减弱",
    negative_decreasing: "负向动量增强", negative_increasing: "负向动量修复",
    upper_extension: "上沿延伸", lower_extension: "下沿延伸", upper_repair: "上沿回落", lower_repair: "下沿修复", inside_bands: "轨道内",
    breakout_up: "已确认向上突破", breakdown_down: "已确认向下跌破", retest_up: "向上突破回踩守住",
    retest_down: "向下跌破反抽受阻", failed_break: "突破失败", structure_ready: "已确认结构可用",
    provisional: "暂定输入", completed: "已完成", completion_unknown: "完成状态未知", completion_metadata_unavailable: "缺少 K 线完成信息",
    risk_on: "风险偏好较高", risk_off: "风险规避", cautious: "谨慎", shock: "市场冲击",
    supportive: "支持", restrictive: "限制", severe: "严重限制", fear: "恐惧", extreme_fear: "极度恐惧",
    greed: "贪婪", extreme_greed: "极度贪婪", moderate: "中等",
    max_available_from_source: "来源提供的全部可用历史", loaded_history_only: "仅覆盖已加载历史",
    up_swing: "上行波段", down_swing: "下行波段", stale_swing: "波段较旧", no_valid_swing: "未找到有效波段",
    "4h_no_valid_confirmed_swing": "4 小时数据未形成有效的已确认波段",
    "4h_source_unavailable": "4 小时数据不可用", weekly_no_valid_confirmed_swing: "周线未形成有效的已确认波段",
    weekly_history_unavailable: "周线历史不可用",
  });
  const EN_STATES = Object.freeze({
    source_unavailable: "Source unavailable", insufficient_history: "Insufficient history", calculation_error: "Calculation error",
    dependency_unavailable: "Required input unavailable", not_applicable: "Not applicable", market_session_incomplete: "Session unfinished",
    invalid_source_data: "Invalid source data", previous_refresh_generation: "Earlier refresh generation",
    squeeze_on: "Squeeze on", squeeze_off: "Squeeze off", squeeze_neither: "Neither",
    positive_increasing: "Positive, strengthening", positive_decreasing: "Positive, weakening",
    negative_decreasing: "Negative, strengthening", negative_increasing: "Negative, repairing",
    upper_extension: "Upper extension", lower_extension: "Lower extension", upper_repair: "Upper repair", lower_repair: "Lower repair", inside_bands: "Inside bands",
    breakout_up: "Confirmed upward break", breakdown_down: "Confirmed downward break", retest_up: "Upward break retested",
    retest_down: "Downward break retested", failed_break: "Failed break", structure_ready: "Confirmed structure available",
    provisional: "Provisional", completed: "Completed", completion_unknown: "Completion unknown", completion_metadata_unavailable: "Completion metadata unavailable",
  });
  const LABELS = Object.freeze({
    "Moving averages": "移动平均线", "Each value names its MA type, period and candle interval.": "各项均注明均线类型、周期参数和 K 线周期。",
    Alignment: "均线排列", "Compression / expansion": "收敛／扩张", "Bollinger＋RSI": "布林带＋RSI",
    Bandwidth: "带宽", "Upper / middle / lower": "上轨／中轨／下轨", "Primary slope": "主周期斜率",
    "Primary divergence": "主周期背离", "Bandwidth percentile": "带宽分位", "Squeeze / expanded state": "压缩／扩张状态",
    "Price position": "价格位置", "Squeeze Momentum": "挤压动量", "SMA(True Range)": "真实波幅的简单移动平均",
    "MACD line": "MACD 线", "Signal line": "信号线", Histogram: "柱状图", "Histogram 1-bar Δ": "柱状图最近 1 根变化",
    "Histogram 3-bar Δ": "柱状图最近 3 根变化", "Histogram 5-bar Δ": "柱状图最近 5 根变化", "Zero line": "零轴位置",
    "Improving / deteriorating": "改善／恶化", Crossover: "交叉状态", "Histogram slope": "柱状图斜率",
    "Trend strength": "趋势强度", "Directional bias": "方向倾向", "ADX slope": "ADX 斜率", "Raw ATR": "ATR 原值",
    "ATR percentile": "ATR 分位", "Volatility regime": "波动环境", "Expanding / contracting": "扩张／收缩", "ATR slope": "ATR 斜率",
    Direction: "方向", "K / D / J slope": "K／D／J 斜率", "Overbought / oversold": "超买／超卖",
    "Relative Strength": "相对强弱", "Stock return": "个股涨跌幅", "vs SPY": "相对 SPY", "vs QQQ": "相对 QQQ",
    "Stock return · 20 / 60 / 120D": "个股涨跌幅 · 20／60／120 日", "vs SPY · 20 / 60 / 120D": "相对 SPY · 20／60／120 日",
    "vs QQQ · 20 / 60 / 120D": "相对 QQQ · 20／60／120 日", Consistency: "一致性", "Raw OBV": "OBV 原值",
    Trend: "趋势", Divergence: "背离", "Price-volume confirmation": "量价确认", "OBV slope": "OBV 斜率",
    "Anchor start": "波段起点", "Anchor end": "波段终点", "Pivot confirmation": "高低点确认",
    "Pivot count · high / low": "已确认高点／低点数量", "Bars since swing end": "距波段终点的 K 线数",
    "52-Week and history": "52 周与历史位置", "Daily OHLCV history": "日线价格与成交量历史",
    "52W high / distance": "52 周高点／距离", "52W low / distance": "52 周低点／距离", "52W position": "52 周位置",
    "All-time high / distance": "历史高点／距离", "History coverage": "历史覆盖范围", "History bars / start": "历史 K 线数／起始日期",
    "Volume / RVOL / OBV": "成交量／RVOL／OBV", "1D current volume, moving averages, RVOL and OBV context": "日线成交量、均量、相对成交量与 OBV 背景",
    "Current volume": "当前成交量", "Average volume": "平均成交量", "Relative volume": "相对成交量", "OBV raw / trend": "OBV 原值／趋势",
    "Average volume · 120D / 250D": "平均成交量 · 120／250 日", "Turnover · current / 5D / 20D / 60D": "换手率 · 当前／5／20／60 日",
    "OBV trend · 5D / 20D / 60D": "OBV 趋势 · 5／20／60 日", "OBV divergence": "OBV 背离", "Volume structure": "成交量结构",
    "Horizon OBV · 4H / 1D / 1W": "各周期 OBV · 4 小时／日线／周线",
    "Fear & Greed": "恐惧与贪婪指数", "US 10Y Yield": "美国 10 年期国债收益率", "US 10Y": "美国 10 年期国债",
    "Fear & Greed / US 10Y Yield": "恐惧与贪婪指数／美国 10 年期国债收益率",
    "Neutral volatility backdrop.": "波动背景中性。", "Data unavailable": "数据不可用",
    "High volatility is a clear short-term risk-off signal.": "高波动提示短期风险规避环境。",
    "Elevated volatility keeps short-term risk appetite in check.": "波动偏高，短期风险偏好受到限制。",
    "Low volatility is supportive for risk appetite.": "低波动有利于风险偏好。",
    "No valid swing identified": "未找到有效波段", "Insufficient Fibonacci data": "斐波那契数据不足",
  });
  const PROFILES = Object.freeze({
    Semiconductors: "半导体", "Semiconductor Equipment": "半导体设备", "Enterprise Software": "企业软件",
    "Cloud Infrastructure": "云基础设施", "Consumer Technology": "消费科技", "Internet Platforms": "互联网平台",
    "Media & Entertainment": "媒体与娱乐", "E-Commerce": "电子商务", "Digital Advertising": "数字广告",
    "Telecommunications Infrastructure": "通信基础设施", "Capital Markets": "资本市场", Banking: "银行业",
    "Digital Financial Services": "数字金融服务", Payments: "支付服务", Insurance: "保险业",
    "Managed Care & Health Services": "医疗保险与健康服务", Pharmaceuticals: "制药", Biotechnology: "生物科技",
    "Medical Devices": "医疗器械", "Consumer Discretionary": "可选消费", "Consumer Staples": "必需消费", Retail: "零售",
    Industrials: "工业", "Aerospace & Defense": "航空航天与国防", "Transportation & Logistics": "运输与物流",
    Energy: "能源", Utilities: "公用事业", "Real Estate": "房地产", Materials: "原材料",
    MarketLeader: "行业龙头", HighGrowth: "高成长", MatureGrowth: "成熟成长", CashCow: "现金牛", Defensive: "防御型",
    Cyclical: "周期型", Turnaround: "经营转型", EmergingGrowth: "新兴成长",
    HighVolatility: "高波动", RegulatoryRisk: "监管风险", InterestRateSensitive: "利率敏感", CommoditySensitive: "大宗商品敏感",
    MacroSensitive: "宏观敏感", CrowdedLeader: "交易拥挤的龙头", ExecutionRisk: "执行风险", LowVolatility: "低波动",
    Emerging: "萌芽期", Scaling: "扩张期", EstablishedLeader: "已确立的行业龙头", MatureLeader: "成熟龙头", Recovery: "复苏期", Declining: "衰退期",
    "Nasdaq-100": "纳斯达克 100 指数", "S&P 500 Momentum": "标普 500 动量指数", "Semiconductor Sector": "半导体板块",
  });
  const code = value => String(value ?? "").trim().toLowerCase().replace(/[\s-]+/g, "_");
  const isChinese = value => /[\u3400-\u9fff]/.test(value);
  const interval = (value, language = "en") => language === "zh"
    ? ({ "1h": "1 小时", "4h": "4 小时", "1d": "日线", "1w": "周线" }[String(value).toLowerCase()] || "—")
    : String(value || "—").toUpperCase();
  function state(value, language = "en") {
    if (value == null || value === "" || code(value) === "unavailable") return "—";
    const key = code(value);
    if (language !== "zh") return EN_STATES[key] || String(value).replace(/_/g, " ");
    return STATES[key] || (isChinese(value) ? String(value) : "未识别状态");
  }
  function label(value, language = "en") {
    const raw = String(value ?? "");
    if (language !== "zh" || !raw) return raw;
    if (LABELS[raw]) return LABELS[raw];
    let match;
    if ((match = raw.match(/^(\d+)-bar percentile$/))) return `${match[1]} 根 K 线分位`;
    if ((match = raw.match(/^(\S+) MACD \/ Signal \/ Histogram$/))) return `${interval(match[1], language)} MACD／信号线／柱状图`;
    // Indicator symbols, periods, prices and already-localized labels are data.
    return raw;
  }
  function profile(value, language = "en") {
    if (!value || value === "-") return value || "—";
    return language === "zh" ? PROFILES[value] || (isChinese(value) ? value : "分类暂未翻译") : value;
  }
  function text(value, language = "en") {
    const raw = String(value ?? "");
    if (language !== "zh" || !raw || raw === "—") return raw;
    if (LABELS[raw]) return LABELS[raw];
    if (STATES[code(raw)]) return STATES[code(raw)];
    let match;
    if ((match = raw.match(/^Between ([\d.]+%) and ([\d.]+%)$/))) return `位于 ${match[1]} 与 ${match[2]} 之间`;
    if ((match = raw.match(/^Above ([\d.]+%)$/))) return `高于 ${match[1]}`;
    if ((match = raw.match(/^Below ([\d.]+%)$/))) return `低于 ${match[1]}`;
    if (raw === "Outside selected swing range") return "位于所选波段范围之外";
    if ((match = raw.match(/^recent (\d+) (\S+) bars$/))) return `最近 ${match[1]} 根${interval(match[2], language)} K 线`;
    if ((match = raw.match(/^confirmed (\S+) pivots \((\d+)\/(\d+)\)$/))) return `已确认${interval(match[1], language)}高低点（左 ${match[2]}／右 ${match[3]} 根）`;
    if ((match = raw.match(/^left (\d+) \/ right (\d+) bars confirmed$/))) return `左 ${match[1]}／右 ${match[2]} 根 K 线确认`;
    if ((match = raw.match(/^Insufficient (\S+) history to confirm an independently derived Fibonacci swing\.$/))) return `${interval(match[1], language)}历史不足，无法确认独立推导的斐波那契波段。`;
    if (raw === "No confirmed swing met the Fibonacci time and range requirements.") return "没有已确认波段满足斐波那契的时间与幅度要求。";
    if (raw === "Daily volume history is unavailable.") return "日线成交量历史不可用。";
    if ((match = raw.match(/^Confirmed (up|down) swing from (\d+) (\S+) bars; independently derived technical structure\.$/))) return `根据 ${match[2]} 根${interval(match[3], language)} K 线确认${match[1] === "up" ? "上行" : "下行"}波段；技术结构独立推导。`;
    return isChinese(raw) ? raw : "该说明暂未提供中文翻译。";
  }
  const api = Object.freeze({ state, label, profile, text, interval });
  root.DashboardI18n = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
}(globalThis));
