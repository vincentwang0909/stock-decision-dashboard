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

test("financial-company UI removes Quality Summary and keeps earnings to EPS", () => {
  assert.match(source, /analysis\.is_financial_company \? ""/);
  assert.match(source, /const isFinancialCompany = companyAnalysis\.financialFacts\?\.cashFlowSemantic\?\.model === "financial_company_cash_flow_limited"/);
  assert.match(source, /isFinancialCompany \? \{ eps: standardEarningsMetrics\.eps \}/);
});
