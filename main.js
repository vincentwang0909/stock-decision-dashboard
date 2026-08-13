"use strict";

const API_BASE = window.location.protocol === "file:" ? "http://127.0.0.1:4173" : window.location.origin;
const API_URL = `${API_BASE}/api/market-data`;
const WATCHLIST_API_URL = `${API_BASE}/api/watchlist`;
const SYMBOL_SEARCH_API_URL = `${API_BASE}/api/symbol-search`;
const LANGUAGE_CACHE_KEY = "stock-dashboard-language-v2";
const SNAPSHOT_CACHE_KEY = "stock-dashboard-market-cache-v11-decision-engine";
const WATCHLIST_CACHE_KEY = "stock-dashboard-watchlist-v2";
const REFRESH_MS = 60 * 60 * 1000;

const CLASSIFICATION_PROFILES = Object.freeze({
  MSFT: { tags: ["MegaCap", "Software", "Cloud", "AI", "CashCow", "ProfitableGrowth"], category: "SoftwareCloud", scoring_profile: "software_cloud" },
  META: { tags: ["MegaCap", "SocialMedia", "DigitalAds", "AI", "CashCow", "RegulatoryRisk"], category: "SocialMediaAds", scoring_profile: "platform_ads" },
  MU: { tags: ["LargeCap", "Semiconductor", "MemoryStorage", "DRAMNAND", "Cyclical", "AIInfrastructure"], category: "MemoryStorage", scoring_profile: "memory_cycle" },
  SNDK: { tags: ["MidCap", "Semiconductor", "MemoryStorage", "NAND", "Cyclical", "HighVolatility"], category: "MemoryStorage", scoring_profile: "memory_cycle" },
  NVDA: { tags: ["MegaCap", "Semiconductor", "GPU", "AIInfrastructure", "DataCenter", "HighMultiple"], category: "AIInfrastructure", scoring_profile: "ai_infrastructure" },
  AMD: { tags: ["LargeCap", "Semiconductor", "GPU", "AIInfrastructure", "DataCenter", "HighVolatility"], category: "AIInfrastructure", scoring_profile: "ai_infrastructure" },
  AMZN: { tags: ["MegaCap", "Ecommerce", "Cloud", "ConsumerPlatform", "CashCow", "AI"], category: "EcommerceCloud", scoring_profile: "software_cloud" },
  GOOGL: { tags: ["MegaCap", "DigitalAds", "Cloud", "AI", "CashCow", "RegulatoryRisk"], category: "DigitalAdsCloud", scoring_profile: "platform_ads" },
  BABA: { tags: ["LargeCap", "ChinaADR", "Ecommerce", "Cloud", "ChinaConsumer", "RegulatoryRisk"], category: "ChinaInternet", scoring_profile: "china_adr" },
  MPT: { tags: ["SmallCap", "REIT", "HealthcareRealEstate", "Dividend", "HighDebtRisk", "InterestRateSensitive"], category: "REITDividend", scoring_profile: "reit_dividend" },
  UNH: { tags: ["MegaCap", "HealthInsurance", "HealthcareServices", "CashCow", "RegulatoryRisk", "Defensive"], category: "HealthcareInsurance", scoring_profile: "healthcare_defensive" },
  TSLA: { tags: ["MegaCap", "EV", "AutoManufacturer", "HighGrowth", "HighVolatility", "HighMultiple"], category: "EVAuto", scoring_profile: "high_growth_cyclical" },
  QQQ: { tags: ["ETF", "MegaCap"], category: "ETF", scoring_profile: "etf_profile" },
  SPMO: { tags: ["ETF", "Momentum"], category: "ETF", scoring_profile: "etf_profile" },
  TQQQ: { tags: ["ETF", "HighVolatility", "Speculative"], category: "ETF", scoring_profile: "etf_profile" },
  SQQQ: { tags: ["ETF", "HighVolatility", "Speculative"], category: "ETF", scoring_profile: "etf_profile" },
  SOXL: { tags: ["ETF", "Semiconductor", "HighVolatility", "Speculative"], category: "ETF", scoring_profile: "etf_profile" },
  SOXS: { tags: ["ETF", "Semiconductor", "HighVolatility", "Speculative"], category: "ETF", scoring_profile: "etf_profile" },
});

const DEFAULT_WATCHLIST = ["NVDA", "TSLA", "AMD", "BABA", "GOOGL", "AMZN", "AAPL", "META", "MSFT", "QQQ"];
const I18N = {
  en: {
    appTitle: "Stock Decision Dashboard", stocks: "Stocks", search: "Search symbol or name", add: "Add selected", refresh: "Refresh now",
    shared: "Shared Watchlist: everyone viewing this Dashboard sees the same stock list.", syncFailed: "Shared list sync failed. Showing cached data.",
    all: "All", ticker: "Ticker", type: "Stock type", dayMove: "Day move", short: "Short", mid: "Mid", long: "Long",
    aiDecision: "AI Decision", technical: "Technical", market: "Market Data", price: "Price", updated: "Updated", unavailable: "—",
    recommendation: "Action", confidence: "Confidence", entryRange: "Recommended range", targetRange: "Target range", invalidation: "Invalidation",
    supporting: "Supporting evidence", limiting: "Limiting evidence", marketState: "Market state", companyProfile: "Company profile",
    technicalData: "Canonical Technical Data", dataStatus: "Data status", trend: "Trend", momentum: "Momentum", volatility: "Volatility", participation: "Participation",
    close: "Close", remove: "Remove", risk: "Risk", opportunity: "Price opportunity", confirmation: "Confirmation", direction: "Direction",
    noData: "Waiting for market data. No action is shown until the technical feature set is available.",
  },
  zh: {
    appTitle: "股票决策仪表盘", stocks: "股票", search: "搜索代码或名称", add: "添加所选", refresh: "立即刷新",
    shared: "共享自选列表：所有查看此仪表盘的用户看到相同的股票列表。", syncFailed: "共享列表同步失败，正在显示缓存数据。",
    all: "全部", ticker: "代码", type: "股票类型", dayMove: "当日涨跌", short: "短期", mid: "中期", long: "长期",
    aiDecision: "AI 决策", technical: "技术面", market: "市场数据", price: "价格", updated: "更新时间", unavailable: "—",
    recommendation: "操作", confidence: "置信度", entryRange: "建议区间", targetRange: "目标区间", invalidation: "失效价",
    supporting: "支持证据", limiting: "限制因素", marketState: "市场状态", companyProfile: "公司画像",
    technicalData: "标准化技术数据", dataStatus: "数据状态", trend: "趋势", momentum: "动量", volatility: "波动", participation: "参与度",
    close: "关闭", remove: "移除", risk: "风险", opportunity: "价格机会", confirmation: "确认度", direction: "方向",
    noData: "正在等待市场数据；技术特征可用前不显示操作建议。",
  },
};

const state = {
  language: localStorage.getItem(LANGUAGE_CACHE_KEY) === "zh" ? "zh" : "en",
  watchlist: [],
  rows: [],
  snapshot: null,
  selectedTicker: null,
  modalOpen: false,
  activeTab: "summary",
  sort: { key: "ticker", direction: "asc" },
  marketFilter: "all",
  selectedCandidate: null,
  refreshing: false,
};

const $ = (selector) => document.querySelector(selector);
const t = (key) => I18N[state.language][key] || I18N.en[key] || key;
const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
const finite = (value) => Number.isFinite(Number(value)) ? Number(value) : null;
const escapeHtml = (value) => String(value ?? "").replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]);
const normalizeTicker = (value) => String(value || "").trim().toUpperCase().replace(/\s+/g, "");
const uniqueTickers = (values) => [...new Set(values.map(normalizeTicker).filter(Boolean))];
const actionTone = (action) => ({ strong_buy: "strong-buy", buy: "buy", accumulate: "accumulate", hold: "hold", trim: "trim", sell: "sell", avoid: "avoid" }[action] || "hold");

function formatPrice(value, currency = "USD") {
  return Number.isFinite(value) ? new Intl.NumberFormat(state.language === "zh" ? "zh-CN" : "en-US", { style: "currency", currency, maximumFractionDigits: value < 10 ? 3 : 2 }).format(value) : t("unavailable");
}

function formatPct(value, decimals = 1) {
  return Number.isFinite(value) ? `${value >= 0 ? "+" : ""}${value.toFixed(decimals)}%` : t("unavailable");
}

function formatRange(range, currency) {
  return Number.isFinite(range?.low) && Number.isFinite(range?.high) ? `${formatPrice(range.low, currency)} – ${formatPrice(range.high, currency)}` : t("unavailable");
}

function formatDate(value) {
  if (!value) return t("unavailable");
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? t("unavailable") : date.toLocaleString(state.language === "zh" ? "zh-CN" : "en-US", { dateStyle: "medium", timeStyle: "short" });
}

function profileFor(ticker, quote = {}) {
  const known = CLASSIFICATION_PROFILES[ticker];
  const upstream = quote.metadata?.classification || quote.classification || {};
  return {
    tags: [...new Set([...(known?.tags || []), ...(upstream.tags || upstream.top_tags || [])])],
    category: upstream.category || known?.category || quote.metadata?.sector || "Unclassified",
    category_key: upstream.category_key || known?.category || "other",
    scoring_profile: upstream.scoring_profile || known?.scoring_profile || "generic",
  };
}

function buildFeatures(quote, price) {
  if (!window.CanonicalTechnicalFeatures) return null;
  return window.CanonicalTechnicalFeatures.buildTechnicalFeatures({
    history: quote?.history || {},
    currentPrice: price,
    relativeStrength: quote?.relativeStrength || quote?.relative_strength || {},
    fibonacciStructure: quote?.technical?.fibonacci_structure || {},
    shareBase: quote?.metadata?.sharesOutstanding || null,
  });
}

function buildRow(ticker, quote = {}, marketContext = {}) {
  const price = finite(quote.price);
  const historyCount = (quote.history?.closes || []).filter((value) => Number.isFinite(value)).length;
  const features = buildFeatures(quote, price);
  const classification = profileFor(ticker, quote);
  const ready = Boolean(price != null && historyCount >= 2 && features?.availability !== "unavailable");
  const decision = ready && window.DecisionEngine?.decide
    ? window.DecisionEngine.decide({ ticker, price, technicalFeatures: features, marketContext, classification, metadata: quote.metadata || {}, language: state.language })
    : null;
  return {
    ticker,
    quote,
    price,
    changePercent: finite(quote.changePercent),
    currency: quote.currency || quote.metadata?.currency || "USD",
    companyName: quote.longName || quote.shortName || quote.metadata?.longName || ticker,
    exchange: quote.exchangeName || quote.metadata?.exchange || "",
    updatedAt: quote.updatedAt || quote.last_successful_update || null,
    classification,
    technicalFeatures: features,
    decision,
    ready,
    noData: !ready,
  };
}

function decisionFor(row, horizon) {
  return row.decision?.horizons?.[horizon] || null;
}

function renderAction(row, horizon, compact = false) {
  const decision = decisionFor(row, horizon);
  if (!row.ready || !decision) return t("unavailable");
  return compact ? decision.actionLabel : `${decision.actionLabel} · ${decision.confidence}%`;
}

function actionChip(row, horizon) {
  const decision = decisionFor(row, horizon);
  const label = row.ready && decision ? decision.actionLabel : t("unavailable");
  return `<span class="stock-mini-chip ${actionTone(decision?.action)}">${t(horizon)}: ${escapeHtml(label)}</span>`;
}

function sortRows(rows) {
  const multiplier = state.sort.direction === "asc" ? 1 : -1;
  return [...rows].sort((left, right) => {
    if (state.sort.key === "change") return ((left.changePercent ?? -Infinity) - (right.changePercent ?? -Infinity)) * multiplier;
    if (state.sort.key === "type") return String(left.classification.category).localeCompare(String(right.classification.category)) * multiplier;
    return left.ticker.localeCompare(right.ticker) * multiplier;
  });
}

function matchesFilter(row) {
  const tags = new Set(row.classification.tags || []);
  if (state.marketFilter === "all" || state.marketFilter === "us") return true;
  if (state.marketFilter === "megaCap") return tags.has("MegaCap");
  if (state.marketFilter === "growth") return tags.has("Growth") || tags.has("HighGrowth");
  if (state.marketFilter === "speculative") return tags.has("Speculative") || tags.has("HighVolatility");
  if (state.marketFilter === "dividend") return tags.has("Dividend");
  if (state.marketFilter === "value") return tags.has("Value") || tags.has("CashCow");
  return true;
}

function renderStockList() {
  const list = $("#stockList");
  if (!list) return;
  const rows = sortRows(state.rows.filter(matchesFilter));
  list.innerHTML = rows.map((row) => `
    <article class="stock-item${row.ticker === state.selectedTicker ? " active" : ""}" data-open-ticker="${escapeHtml(row.ticker)}">
      <div class="stock-item-header">
        <div class="stock-copy">
          <div class="stock-symbol-row"><strong class="stock-symbol">${escapeHtml(row.ticker)}</strong><span class="stock-profile-pill">${escapeHtml(row.classification.category)}</span></div>
          <div class="stock-company">${escapeHtml(row.companyName)}</div>
          <div class="stock-price-row"><strong>${formatPrice(row.price, row.currency)}</strong><span class="stock-day-move ${row.changePercent >= 0 ? "buy" : "sell"}">${t("dayMove")} ${formatPct(row.changePercent)}</span></div>
        </div>
        <button class="stock-remove-btn" type="button" data-remove-ticker="${escapeHtml(row.ticker)}" aria-label="${t("remove")} ${escapeHtml(row.ticker)}">×</button>
      </div>
      <div class="stock-horizon-inline">${actionChip(row, "short")}${actionChip(row, "mid")}${actionChip(row, "long")}</div>
    </article>
  `).join("") || `<p class="empty-state">${t("noData")}</p>`;
}

function stateBadge(label, stateItem) {
  return `<div class="decision-state"><span>${escapeHtml(label)}</span><strong>${escapeHtml(stateItem?.label || t("unavailable"))}</strong></div>`;
}

function reasons(items, tone) {
  return items?.length ? `<ul class="decision-reasons ${tone}">${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>` : `<p class="muted">${t("unavailable")}</p>`;
}

function renderDecisionCard(row, horizon) {
  const decision = decisionFor(row, horizon);
  if (!decision) return `<article class="decision-card"><h3>${t(horizon)}</h3><p>${t("noData")}</p></article>`;
  return `
    <article class="decision-card ${actionTone(decision.action)}">
      <div class="decision-card-head"><div><span>${t(horizon)} · ${escapeHtml(window.DecisionEngine.config.horizons[horizon].label)}</span><h3>${escapeHtml(decision.actionLabel)}</h3></div><strong>${decision.confidence}%</strong></div>
      <div class="decision-state-grid">
        ${stateBadge(t("direction"), decision.states.direction)}
        ${stateBadge(t("confirmation"), decision.states.confirmation)}
        ${stateBadge(t("risk"), decision.states.risk)}
        ${stateBadge(t("opportunity"), decision.states.priceOpportunity)}
      </div>
      <dl class="decision-levels">
        <div><dt>${t("entryRange")}</dt><dd>${formatRange(decision.recommendedRange, row.currency)}</dd></div>
        <div><dt>${t("targetRange")}</dt><dd>${formatRange(decision.targetRange, row.currency)}</dd></div>
        <div><dt>${t("invalidation")}</dt><dd>${formatPrice(decision.invalidation, row.currency)}</dd></div>
      </dl>
      <div class="decision-evidence"><div><h4>${t("supporting")}</h4>${reasons(decision.reasons.supporting, "positive")}</div><div><h4>${t("limiting")}</h4>${reasons(decision.reasons.limiting, "limiting")}</div></div>
    </article>
  `;
}

function indicatorValue(feature, key, formatter = (value) => value) {
  return Number.isFinite(feature?.[key]) ? formatter(feature[key]) : t("unavailable");
}

function firstAvailable(group = {}) {
  return Object.values(group).find((item) => item?.availability === "available") || {};
}

function technicalBlock(row, horizon) {
  const featureSet = row.technicalFeatures?.horizons?.[window.DecisionEngine.config.horizons[horizon].technicalKey] || {};
  const rsi = firstAvailable(featureSet.momentum?.rsi);
  const macd = firstAvailable(featureSet.momentum?.macd);
  const adx = firstAvailable(featureSet.trend?.adx);
  const atr = firstAvailable(featureSet.volatility?.atr);
  const bands = firstAvailable(featureSet.volatility?.bollinger);
  const obv = firstAvailable(featureSet.participation?.obv);
  return `
    <article class="technical-card">
      <h3>${t(horizon)} · ${escapeHtml(featureSet.horizon_label || window.DecisionEngine.config.horizons[horizon].label)}</h3>
      <p class="muted">${t("dataStatus")}: ${escapeHtml(featureSet.availability || t("unavailable"))}</p>
      <div class="metric-grid">
        <div><span>MA</span><strong>${escapeHtml(featureSet.trend?.ma_structure?.alignment || t("unavailable"))}</strong></div>
        <div><span>RSI</span><strong>${indicatorValue(rsi, "value", (value) => value.toFixed(1))}</strong></div>
        <div><span>MACD</span><strong>${escapeHtml(macd.state || t("unavailable"))}</strong></div>
        <div><span>ADX</span><strong>${indicatorValue(adx, "adx", (value) => value.toFixed(1))}</strong></div>
        <div><span>ATR</span><strong>${indicatorValue(atr, "atr_pct", (value) => `${value.toFixed(2)}%`)}</strong></div>
        <div><span>OBV</span><strong>${escapeHtml(obv.trend || t("unavailable"))}</strong></div>
        <div><span>Bollinger</span><strong>${escapeHtml(bands.price_position || t("unavailable"))}</strong></div>
        <div><span>Relative strength</span><strong>${escapeHtml(featureSet.relative_strength?.state || t("unavailable"))}</strong></div>
      </div>
    </article>
  `;
}

function renderTechnicalPanel(row) {
  if (!row.technicalFeatures) return `<section class="detail-tab-section"><p>${t("noData")}</p></section>`;
  const position = row.technicalFeatures.price_position || {};
  return `<section class="detail-tab-section"><article class="technical-card"><h3>${t("technicalData")}</h3><div class="metric-grid"><div><span>52W high</span><strong>${formatPrice(position.high_52w, row.currency)}</strong></div><div><span>52W low</span><strong>${formatPrice(position.low_52w, row.currency)}</strong></div><div><span>52W position</span><strong>${Number.isFinite(position.position_52w_pct) ? `${position.position_52w_pct.toFixed(1)}%` : t("unavailable")}</strong></div><div><span>Volume</span><strong>${escapeHtml(row.technicalFeatures.volume?.relative_volume?.state || t("unavailable"))}</strong></div></div></article>${technicalBlock(row, "short")}${technicalBlock(row, "mid")}${technicalBlock(row, "long")}</section>`;
}

function renderMarketPanel(row) {
  const market = state.snapshot?.marketContext || state.snapshot?.market_context || {};
  const engine = market.market_engine || market;
  const earnings = decisionFor(row, "short")?.market?.earnings || {};
  const priceTrend = (item) => item?.value == null ? t("unavailable") : `${formatPrice(item.value)} · ${escapeHtml(item.trend || t("unavailable"))}`;
  return `
    <section class="detail-tab-section">
      <article class="technical-card"><h3>${t("marketState")}</h3><div class="metric-grid">
        <div><span>VIX</span><strong>${engine.vix?.value ?? t("unavailable")}</strong></div>
        <div><span>Fear & Greed</span><strong>${escapeHtml(engine.fear_greed?.label || engine.fearGreed?.label || t("unavailable"))}</strong></div>
        <div><span>US 10Y Yield</span><strong>${engine.ten_year_yield?.value == null ? t("unavailable") : `${Number(engine.ten_year_yield.value).toFixed(2)}%`}</strong></div>
        <div><span>SPY</span><strong>${priceTrend(engine.equity_trend?.spy)}</strong></div>
        <div><span>QQQ</span><strong>${priceTrend(engine.equity_trend?.qqq)}</strong></div>
        <div><span>Earnings</span><strong>${earnings.date ? `${formatDate(earnings.date)}${Number.isFinite(earnings.daysToEarnings) ? ` · ${earnings.daysToEarnings}d` : ""}` : t("unavailable")}</strong></div>
      </div></article>
    </section>
  `;
}

function renderDetailModal() {
  const modal = $("#detailModal");
  const row = state.rows.find((item) => item.ticker === state.selectedTicker) || state.rows[0];
  if (!modal || !row) return;
  modal.hidden = !state.modalOpen;
  document.body.classList.toggle("modal-open", state.modalOpen);
  if (!state.modalOpen) return;
  const tabPanels = {
    summary: `<section class="detail-tab-section"><article class="decision-context"><div><span>${t("companyProfile")}</span><strong>${escapeHtml(row.classification.category)}</strong></div><div><span>scoring_profile</span><strong>${escapeHtml(row.classification.scoring_profile)}</strong></div><div><span>${t("marketState")}</span><strong>${escapeHtml(decisionFor(row, "short")?.market?.label || t("unavailable"))}</strong></div></article>${renderDecisionCard(row, "short")}${renderDecisionCard(row, "mid")}${renderDecisionCard(row, "long")}</section>`,
    technical: renderTechnicalPanel(row),
    market: renderMarketPanel(row),
  };
  $(".detail-sheet").innerHTML = `
    <button class="detail-close" type="button" aria-label="${t("close")}">×</button>
    <header class="detail-sheet-header"><div><h2>${escapeHtml(row.ticker)}</h2><p>${escapeHtml(row.companyName)}</p><p>${t("price")} ${formatPrice(row.price, row.currency)} · <span class="${row.changePercent >= 0 ? "buy" : "sell"}">${formatPct(row.changePercent)}</span></p></div><time>${t("updated")} ${formatDate(row.updatedAt || state.snapshot?.updatedAt)}</time></header>
    <nav class="detail-tabs" role="tablist">${["summary", "technical", "market"].map((tab) => `<button class="detail-tab${state.activeTab === tab ? " active" : ""}" type="button" data-detail-tab="${tab}">${t(tab === "summary" ? "aiDecision" : tab)}</button>`).join("")}</nav>
    <div class="detail-tab-panel">${tabPanels[state.activeTab]}</div>
  `;
}

function applyLanguage() {
  $("#appTitle").textContent = t("appTitle");
  $("#stocksTitle").textContent = t("stocks");
  $("#sharedWatchlistHint").textContent = t("shared");
  $("#tickerInputLabel").textContent = t("search");
  $("#tickerInput").placeholder = t("search");
  $("#addStockButton").textContent = t("add");
  $("#manualRefreshButton").textContent = state.refreshing ? "…" : t("refresh");
  $("#sortTickerLabel").textContent = t("ticker");
  $("#sortTypeLabel").textContent = t("type");
  $("#sortChangeLabel").textContent = t("dayMove");
  document.querySelectorAll(".lang-btn").forEach((button) => button.classList.toggle("active", button.dataset.lang === state.language));
}

function render() {
  applyLanguage();
  renderStockList();
  renderDetailModal();
  document.querySelectorAll(".sort-btn").forEach((button) => {
    const active = button.dataset.sortKey === state.sort.key;
    button.classList.toggle("active", active);
    const indicator = button.querySelector(".sort-indicator");
    if (indicator) indicator.textContent = active ? (state.sort.direction === "asc" ? "↑" : "↓") : "↕";
  });
  document.querySelectorAll(".filter-btn").forEach((button) => button.classList.toggle("active", button.dataset.marketFilter === state.marketFilter));
}

function persistSnapshot(snapshot) {
  try { localStorage.setItem(SNAPSHOT_CACHE_KEY, JSON.stringify(snapshot)); } catch { /* storage is optional */ }
}

function persistWatchlist() {
  try { localStorage.setItem(WATCHLIST_CACHE_KEY, JSON.stringify(state.watchlist)); } catch { /* storage is optional */ }
}

function applySnapshot(snapshot, { persist = true } = {}) {
  state.snapshot = snapshot;
  const market = snapshot?.marketContext || snapshot?.market_context || {};
  const quotes = snapshot?.quotes || {};
  state.rows = state.watchlist.map((ticker) => buildRow(ticker, quotes[ticker] || {}, market));
  if (!state.selectedTicker || !state.rows.some((row) => row.ticker === state.selectedTicker)) state.selectedTicker = state.rows[0]?.ticker || null;
  if (persist) persistSnapshot(snapshot);
  render();
}

async function loadWatchlist() {
  let cached = [];
  try { cached = JSON.parse(localStorage.getItem(WATCHLIST_CACHE_KEY) || "[]"); } catch { cached = []; }
  state.watchlist = uniqueTickers(cached.length ? cached : DEFAULT_WATCHLIST);
  try {
    const response = await fetch(WATCHLIST_API_URL);
    if (!response.ok) throw new Error(`watchlist request failed (${response.status})`);
    const payload = await response.json();
    const remote = (payload.items || payload.watchlist || []).map((item) => typeof item === "string" ? item : item.ticker);
    if (remote.length) state.watchlist = uniqueTickers(remote);
    persistWatchlist();
  } catch {
    $("#watchlistSyncWarning").hidden = false;
  }
}

async function refreshMarket({ force = false } = {}) {
  if (!state.watchlist.length || state.refreshing) return;
  state.refreshing = true;
  render();
  try {
    const params = new URLSearchParams({ tickers: state.watchlist.join(",") });
    if (force) params.set("force", "true");
    const response = await fetch(`${API_URL}?${params.toString()}`);
    if (!response.ok) throw new Error(`market request failed (${response.status})`);
    applySnapshot(await response.json());
  } catch (error) {
    console.error("Market refresh failed", error);
    if (!state.snapshot) applySnapshot({ quotes: {}, marketContext: {} }, { persist: false });
  } finally {
    state.refreshing = false;
    render();
  }
}

async function addTicker(ticker) {
  const normalized = normalizeTicker(ticker);
  if (!normalized) return;
  try {
    const response = await fetch(WATCHLIST_API_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ticker: normalized, market_type: "US" }) });
    if (!response.ok) throw new Error(`watchlist add failed (${response.status})`);
    const payload = await response.json();
    state.watchlist = uniqueTickers((payload.items || []).map((item) => typeof item === "string" ? item : item.ticker));
  } catch {
    state.watchlist = uniqueTickers([...state.watchlist, normalized]);
    $("#watchlistSyncWarning").hidden = false;
  }
  persistWatchlist();
  await refreshMarket({ force: false });
}

async function removeTicker(ticker) {
  try { await fetch(`${WATCHLIST_API_URL}/${encodeURIComponent(ticker)}`, { method: "DELETE" }); } catch { $("#watchlistSyncWarning").hidden = false; }
  state.watchlist = state.watchlist.filter((item) => item !== ticker);
  state.rows = state.rows.filter((item) => item.ticker !== ticker);
  persistWatchlist();
  render();
}

async function searchSymbols(query) {
  const menu = $("#symbolSearchMenu");
  const normalized = String(query || "").trim();
  if (normalized.length < 1) { menu.hidden = true; return; }
  try {
    const response = await fetch(`${SYMBOL_SEARCH_API_URL}?q=${encodeURIComponent(normalized)}&limit=8`);
    const payload = await response.json();
    const candidates = payload.candidates || [];
    menu.innerHTML = candidates.map((candidate) => `<button type="button" data-symbol="${escapeHtml(candidate.ticker || candidate.symbol)}"><strong>${escapeHtml(candidate.ticker || candidate.symbol)}</strong><span>${escapeHtml(candidate.name || "")}</span></button>`).join("");
    menu.hidden = !candidates.length;
  } catch { menu.hidden = true; }
}

function bindEvents() {
  $("#watchlistForm").addEventListener("submit", (event) => { event.preventDefault(); addTicker(state.selectedCandidate || $("#tickerInput").value); });
  $("#tickerInput").addEventListener("input", (event) => { state.selectedCandidate = null; $("#addStockButton").disabled = !event.target.value.trim(); searchSymbols(event.target.value); });
  $("#symbolSearchMenu").addEventListener("click", (event) => {
    const button = event.target.closest("button[data-symbol]");
    if (!button) return;
    state.selectedCandidate = button.dataset.symbol;
    $("#tickerInput").value = state.selectedCandidate;
    $("#symbolSearchMenu").hidden = true;
    $("#addStockButton").disabled = false;
  });
  $("#manualRefreshButton").addEventListener("click", () => refreshMarket({ force: true }));
  $("#stockList").addEventListener("click", (event) => {
    const remove = event.target.closest("[data-remove-ticker]");
    if (remove) { event.stopPropagation(); removeTicker(remove.dataset.removeTicker); return; }
    const card = event.target.closest("[data-open-ticker]");
    if (card) { state.selectedTicker = card.dataset.openTicker; state.modalOpen = true; state.activeTab = "summary"; render(); }
  });
  document.querySelectorAll(".sort-btn").forEach((button) => button.addEventListener("click", () => {
    const key = button.dataset.sortKey;
    state.sort = state.sort.key === key ? { key, direction: state.sort.direction === "asc" ? "desc" : "asc" } : { key, direction: "asc" };
    render();
  }));
  document.querySelectorAll(".filter-btn").forEach((button) => button.addEventListener("click", () => { state.marketFilter = button.dataset.marketFilter || "all"; render(); }));
  document.querySelectorAll(".lang-btn").forEach((button) => button.addEventListener("click", () => { state.language = button.dataset.lang === "zh" ? "zh" : "en"; localStorage.setItem(LANGUAGE_CACHE_KEY, state.language); if (state.snapshot) applySnapshot(state.snapshot, { persist: false }); else render(); }));
  $("#detailModal").addEventListener("click", (event) => {
    if (event.target.closest(".detail-close") || event.target.matches(".detail-backdrop")) { state.modalOpen = false; render(); return; }
    const tab = event.target.closest("[data-detail-tab]");
    if (tab) { state.activeTab = tab.dataset.detailTab; renderDetailModal(); }
  });
  document.addEventListener("keydown", (event) => { if (event.key === "Escape" && state.modalOpen) { state.modalOpen = false; render(); } });
}

async function start() {
  bindEvents();
  await loadWatchlist();
  try {
    const cached = JSON.parse(localStorage.getItem(SNAPSHOT_CACHE_KEY) || "null");
    if (cached?.quotes) applySnapshot(cached, { persist: false });
  } catch { /* cache is optional */ }
  render();
  refreshMarket();
  setInterval(() => refreshMarket(), REFRESH_MS);
}

start();
