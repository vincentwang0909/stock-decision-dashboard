const test = require("node:test");
const assert = require("node:assert/strict");
const quality = require("./quality-summary.js");

const healthy = {
  ttmOcf: 100,
  ttmFcf: 20,
  ttmFcfMargin: 0.16,
  quarterOcf: 30,
  quarterFcf: 5,
  quarterFcfMargin: 0.12,
  quarterFcfYoy: { current: 5, prior: 6, pct_change: -16.7, state: "weakened" },
  ttmCapexToOcf: 0.60,
  quarterCapexToOcf: 0.70,
  capexYoy: { pct_change: 10 },
  repurchases: 5,
  dividends: 2,
  shareChangePct: -0.2,
  shareCountComparable: true,
  operatingMargin: 0.25,
  operatingMarginChangePp: -0.01,
  netMargin: 0.18,
  epsSurprisePct: 3,
  normalizedBridgeAvailable: true,
  materialNonOperatingBoost: false,
};

test("strong requires positive latest-quarter FCF and both FCF margin thresholds", () => {
  const result = quality.buildFinancialQuality(healthy);
  assert.equal(result.cashGeneration, "strong");
  assert.equal(result.capitalEfficiency, "strong");
  assert.equal(result.earningsQuality, "strong_core_earnings");

  const belowQuarterMargin = quality.buildFinancialQuality({ ...healthy, quarterFcfMargin: 0.099 });
  assert.equal(belowQuarterMargin.cashGeneration, "long_term_strong_short_term_pressure");
  assert.notEqual(belowQuarterMargin.capitalEfficiency, "strong");
});

test("capital-efficiency thresholds classify the boundary without treating high capex as strength", () => {
  const atThreshold = quality.buildFinancialQuality({
    ...healthy,
    ttmCapexToOcf: 0.70,
    quarterCapexToOcf: 0.80,
  });
  assert.equal(atThreshold.capitalEfficiency, "adequate");

  const underPressure = quality.buildFinancialQuality({
    ...healthy,
    quarterCapexToOcf: 0.90,
  });
  assert.equal(underPressure.capitalEfficiency, "capital_expenditure_pressure");
});

test("META-like capex pressure keeps long-term cash strength qualified", () => {
  const result = quality.buildFinancialQuality({
    ...healthy,
    quarterFcfMargin: 0.029,
    quarterCapexToOcf: 0.945,
    shareChangePct: 0.48,
    epsSurprisePct: -2,
  });
  assert.equal(result.cashGeneration, "long_term_strong_short_term_pressure");
  assert.equal(result.capitalEfficiency, "capital_expenditure_pressure");
  assert.equal(result.shareholderReturn, "ongoing_return_not_fully_offset_dilution");
  assert.equal(result.earningsQuality, "core_earnings_strong_but_realization_pressure");
});

test("GOOGL-like negative quarterly FCF is not labeled strong", () => {
  const result = quality.buildFinancialQuality({
    ...healthy,
    quarterFcf: -6,
    quarterFcfMargin: -0.049,
    quarterCapexToOcf: 1.15,
    shareChangePct: 0.48,
  });
  assert.equal(result.cashGeneration, "operating_cash_flow_strong_fcf_under_pressure");
  assert.equal(result.capitalEfficiency, "capital_expenditure_pressure");
  assert.equal(result.shareholderReturn, "ongoing_return_not_fully_offset_dilution");
});

test("AMZN-like investment phase distinguishes OCF from negative FCF", () => {
  const result = quality.buildFinancialQuality({
    ...healthy,
    ttmFcf: -2,
    ttmFcfMargin: -0.01,
    quarterFcf: -18,
    quarterFcfMargin: -0.05,
    quarterCapexToOcf: 1.698,
  });
  assert.equal(result.cashGeneration, "operating_cash_flow_strong_fcf_under_pressure");
  assert.equal(result.capitalEfficiency, "capital_investment_period");
});

test("TSLA-like low margin and EPS miss classify earnings quality under pressure", () => {
  const result = quality.buildFinancialQuality({
    ...healthy,
    ttmFcfMargin: 0.056,
    quarterFcf: -1.1,
    quarterFcfMargin: -0.039,
    operatingMargin: 0.014,
    epsSurprisePct: -40.7,
    quarterCapexToOcf: 1.23,
  });
  assert.equal(result.cashGeneration, "operating_cash_flow_adequate_short_term_fcf_pressure");
  assert.equal(result.capitalEfficiency, "capital_expenditure_pressure");
  assert.equal(result.earningsQuality, "earnings_quality_under_pressure");
});

test("crossing zero avoids a misleading percentage-growth state", () => {
  assert.equal(quality.materiallyDeteriorated({ current: -5, prior: 10, pct_change: -150, state: "turned_negative" }), true);
  assert.equal(quality.comparisonState({ current: 5, prior: -10, state: "turned_positive" }), "turned_positive");
});
