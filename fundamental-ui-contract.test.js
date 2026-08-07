const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const source = fs.readFileSync("main.js", "utf8");

test("Price / FCF is absent from the fundamental UI and calculation model", () => {
  assert.doesNotMatch(source, /price_fcf|Price \/ FCF|priceToFreeCashflow/i);
});

test("negative valuation multiples cannot receive a cheap-value score", () => {
  assert.match(source, /function valuationMultipleScore\(value, low, high\)/);
  assert.match(source, /if \(value < 0\) return 30/);
});

test("quality summary and the Basic Fundamentals panel are removed", () => {
  assert.doesNotMatch(source, /globalThis\.FinancialQualitySummary/);
  assert.doesNotMatch(source, /renderBasicFundamentalAnalysis|buildBasicFundamentalAnalysis|基础基本面|Basic Fundamentals/);
  assert.doesNotMatch(source, /universalBasicFundamentalFieldKeys|basicFundamentalFactsForRow/);
  assert.doesNotMatch(fs.readFileSync("index.html", "utf8"), /quality-summary\.js/);
});

test("EPS module is compact and uses semantic crossed-zero comparison wording", () => {
  const epsRenderer = source.slice(source.indexOf("const renderEarningsAnalysis"), source.indexOf("const fundamentalPanel"));
  assert.match(epsRenderer, /EPS 表现/);
  assert.match(epsRenderer, /实际亏损比预期多/);
  assert.match(epsRenderer, /由预期盈利转为实际亏损/);
  assert.match(epsRenderer, /环比由亏转盈/);
  assert.doesNotMatch(epsRenderer, /季度营收|季度 CapEx|股价变动的可验证线索/);
});

test("fundamental panel omits Price\/FCF and ambiguous guidance", () => {
  const fundamentalPanel = source.slice(source.indexOf("const fundamentalPanel"));
  const growthSection = fundamentalPanel.slice(fundamentalPanel.indexOf("增长指标"), fundamentalPanel.indexOf("估值指标"));
  assert.doesNotMatch(growthSection, /管理层指引|Forward Guidance/);
  assert.match(source, /盈利与财务比率/);
  assert.match(source, /估值指标/);
});

test("valuation has no summary row", () => {
  const fundamentalPanel = source.slice(source.indexOf("const fundamentalPanel"));
  const valuationSection = fundamentalPanel.slice(fundamentalPanel.indexOf("估值指标"), fundamentalPanel.indexOf("/* Options-market UI"));
  assert.doesNotMatch(valuationSection, /label: t\("summary"\)/);
});

test("displayed fundamental ratios use report-backed values and never revive an older period", () => {
  assert.match(source, /function displayedFundamentalMetric\(row, key, fallback = null\)/);
  assert.match(source, /metric\.period_end_date < display\.source_period_end/);
  assert.match(source, /displayFundamentals/);
  assert.doesNotMatch(source.slice(source.indexOf("function buildFundamentalModule"), source.indexOf("function formatAnalysisStatus")), /gross_margin: metrics\.grossMargin/);
});

test("dividend yield remains normalized for the company profile only", () => {
  assert.match(source, /unit === "decimal"/);
  assert.doesNotMatch(source, /numeric > 0\.25 \? numeric \/ 100 : numeric/);
});

test("news and market tab omits company news, market regime, and market narrative panels", () => {
  const newsPanel = source.slice(source.indexOf("const newsPanel"), source.indexOf("const tabPanels"));
  assert.doesNotMatch(newsPanel, /市场叙事与行业环境|Market Narrative & Sector Environment|公司新闻|Company News|市场状态|Market Regime/);
  assert.doesNotMatch(source, /renderMarketEnvironmentAnalysis/);
});

test("SPY and QQQ trend has no duplicate summary and AI profile has no duplicate tag card", () => {
  const newsPanel = source.slice(source.indexOf("const newsPanel"), source.indexOf("const tabPanels"));
  const trendSection = newsPanel.slice(newsPanel.indexOf("SPY / QQQ 大盘趋势"));
  assert.doesNotMatch(trendSection, /equity_trend\?\.summary/);
  const aiProfileSection = source.slice(source.indexOf('class="detail-profile-grid"'), source.indexOf("PROFILE_DEBUG_MODE"));
  assert.doesNotMatch(aiProfileSection, /detail-profile-tags|\? "标签" : "Tags"/);
});

test("share-count status enums are centrally localized", () => {
  assert.match(source, /dilution_continues: currentLanguage === "zh" \? "股本稀释持续"/);
  assert.match(source, /mostly_offsets_sbc: currentLanguage === "zh" \? "回购大致抵消股权激励稀释"/);
  assert.match(source, /value\.includes\("_"\)/);
});
