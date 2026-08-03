const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const source = fs.readFileSync("main.js", "utf8");

test("fundamental UI preserves signed Price / FCF values", () => {
  assert.match(source, /priceFcfFreeCashFlow !== 0/);
  assert.match(source, /TTM 自由现金流为负；负倍数保留展示，但不代表低估/);
  assert.doesNotMatch(source, /priceFcfFreeCashFlow > 0/);
});

test("negative valuation multiples cannot receive a cheap-value score", () => {
  assert.match(source, /function valuationMultipleScore\(value, low, high\)/);
  assert.match(source, /if \(value < 0\) return 30/);
  assert.match(source, /valuationMultipleScore\(fundamental\.valuation\.price_fcf/);
});

test("quality summary generation and its script are removed from the active UI", () => {
  assert.doesNotMatch(source, /globalThis\.FinancialQualitySummary/);
  assert.match(source, /const renderBasicFundamentalAnalysis = \(analysis\) =>/);
  const activeRenderer = source.slice(source.indexOf("const renderBasicFundamentalAnalysis"), source.indexOf("const renderEarningsAnalysis"));
  assert.doesNotMatch(activeRenderer, /质量摘要|Quality Summary|quality_summary/);
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

test("compact panel keeps Price\/FCF only in the valuation section and removes ambiguous guidance", () => {
  const activeRenderer = source.slice(source.indexOf("const renderBasicFundamentalAnalysis"), source.indexOf("const renderEarningsAnalysis"));
  assert.doesNotMatch(activeRenderer, /Price \/ FCF/);
  const fundamentalPanel = source.slice(source.indexOf("const fundamentalPanel"));
  const growthSection = fundamentalPanel.slice(fundamentalPanel.indexOf("增长指标"), fundamentalPanel.indexOf("估值指标"));
  assert.doesNotMatch(growthSection, /管理层指引|Forward Guidance/);
  assert.match(source, /盈利与财务比率/);
  assert.match(source, /估值指标/);
});

test("basic-fundamental metrics are always expanded and valuation has no summary row", () => {
  const activeRenderer = source.slice(source.indexOf("const renderBasicFundamentalAnalysis"), source.indexOf("const renderEarningsAnalysis"));
  assert.doesNotMatch(activeRenderer, /<details|更多现金流指标|More cash-flow metrics|更多资本支出指标|More capital-expenditure metrics/);
  const fundamentalPanel = source.slice(source.indexOf("const fundamentalPanel"));
  const valuationSection = fundamentalPanel.slice(fundamentalPanel.indexOf("估值指标"), fundamentalPanel.indexOf("/* Options-market UI"));
  assert.doesNotMatch(valuationSection, /label: t\("summary"\)/);
});

test("shareholder-return card displays only the dividend yield", () => {
  const activeRenderer = source.slice(source.indexOf("const renderBasicFundamentalAnalysis"), source.indexOf("const renderEarningsAnalysis"));
  assert.match(activeRenderer, /股息收益率/);
  assert.match(activeRenderer, /normalizeDividendYield\(row\.metadata\?\.dividendYield\)/);
  assert.doesNotMatch(activeRenderer, /股份回购（TTM）|现金股息（TTM）|股东回报合计（同口径）|股本同比/);
});

test("news and market tab omits company news, market regime, and market narrative panels", () => {
  const newsPanel = source.slice(source.indexOf("const newsPanel"), source.indexOf("const tabPanels"));
  assert.doesNotMatch(newsPanel, /市场叙事与行业环境|Market Narrative & Sector Environment|公司新闻|Company News|市场状态|Market Regime/);
  assert.doesNotMatch(source, /renderMarketEnvironmentAnalysis/);
});

test("share-count status enums are centrally localized", () => {
  assert.match(source, /dilution_continues: currentLanguage === "zh" \? "股本稀释持续"/);
  assert.match(source, /mostly_offsets_sbc: currentLanguage === "zh" \? "回购大致抵消股权激励稀释"/);
  assert.match(source, /value\.includes\("_"\)/);
});
