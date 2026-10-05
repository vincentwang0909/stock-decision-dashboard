"use strict";
const assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path"), vm = require("node:vm");
const i18n = require("../ui-translations.js");
const presentation = require("../decision-presentation.js");
const config = require("../decision-engine/config.js");
const classifier = require("../decision-engine/company-profile-classifier.js");
const { featureSet } = require("./fixtures/decision-scenarios.js");

assert.equal(i18n.state("recovering_bearish", "zh"), "空头动量修复");
assert.equal(i18n.state("rising", "zh"), "上升");
assert.equal(i18n.state("Risk-Off", "zh"), "风险规避");
assert.equal(i18n.state("Extreme Greed", "zh"), "极度贪婪");
assert.equal(i18n.state("recovering_bearish", "en"), "recovering bearish");
assert.equal(i18n.state("new_unmapped_state", "zh"), "未识别状态");
assert.equal(i18n.state(null, "zh"), "—");
assert.equal(i18n.state("unavailable", "zh"), "—");
assert.equal(i18n.label("Primary slope", "zh"), "主周期斜率");
assert.equal(i18n.label("60-bar percentile", "zh"), "60 根 K 线分位");
assert.equal(i18n.text("Between 38.2% and 61.8%", "zh"), "位于 38.2% 与 61.8% 之间");
assert.equal(i18n.text("recent 104 1w bars", "zh"), "最近 104 根周线 K 线");
assert.equal(i18n.text("left 3 / right 3 bars confirmed", "zh"), "左 3／右 3 根 K 线确认");
assert.equal(i18n.text("weekly_history_unavailable", "zh"), "周线历史不可用");
assert.equal(i18n.text("unmapped explanation", "zh"), "该说明暂未提供中文翻译。");
for (const vocabulary of [classifier.PRIMARY_CLASSIFICATIONS, classifier.BUSINESS_TRAITS, classifier.RISK_TRAITS, classifier.LIFECYCLES]) {
  for (const value of vocabulary) {
    assert.match(i18n.profile(value, "zh"), /[\u3400-\u9fff]/, value);
    assert.notEqual(i18n.profile(value, "zh"), "分类暂未翻译", value);
    assert.equal(i18n.profile(value, "en"), value);
  }
}
const row = {
  ticker: "TEST", companyName: "Example Company", price: 100, currency: "USD",
  classification: { primaryClassification: "Enterprise Software", businessTrait: "HighGrowth", riskTrait: "HighVolatility", lifecycle: "Scaling" },
  technicalFeatures: featureSet({ short: "recover", mid: "bear", long: "bull" }),
};
for (const group of Object.values(row.technicalFeatures.horizons)) group.trend.ma_structure.alignment = "mixed";
Object.assign(row.technicalFeatures.fibonacci_structure.short_term, {
  swing_direction: "up_swing", source_timeframe: "4h", data_window: "recent 80 4h bars",
  pivot_method: "confirmed 4h pivots (3/3)", pivot_confirmation: "left 3 / right 3 bars confirmed",
  current_position_label: "Between 38.2% and 61.8%", fallback_used: true, fallback_reason: "4h_source_unavailable",
});
const original = JSON.stringify(row);
const main = fs.readFileSync(path.join(__dirname, "..", "main.js"), "utf8").replace(/\nstart\(\);\s*$/, "");
const context = vm.createContext({
  window: { location: { protocol: "http:", origin: "http://localhost" }, DashboardI18n: i18n, DecisionPresentation: presentation, DecisionEngine: { config } },
  localStorage: { getItem() { return null; } }, Intl, Date, sampleRow: row,
});
vm.runInContext(main, context);
vm.runInContext('state.language = "zh";', context);
assert.equal(vm.runInContext('decisionActionLabel({action: "buy", actionLabel: "Buy"})', context), config.actionLabels.buy.zh);
for (const horizon of ["short", "mid", "long"]) {
  const result = vm.runInContext(`technicalBlock(sampleRow, "${horizon}")`, context);
  assert.match(result, /主周期斜率/);
  assert.match(result, /布林带＋RSI/);
  assert.match(result, /移动平均线/);
  assert.doesNotMatch(result, /Primary slope|recovering bearish|rising|falling|Moving averages|Bandwidth|Signal line|Relative Strength/);
}
assert.match(vm.runInContext('technicalBlock(sampleRow, "short")', context), /空头动量修复/);
const fib = vm.runInContext('fibonacciHorizonCard(sampleRow, "斐波那契结构", sampleRow.technicalFeatures.fibonacci_structure.short_term)', context);
assert.match(fib, /位于 38.2% 与 61.8% 之间/);
assert.match(fib, /左 3／右 3 根 K 线确认/);
assert.doesNotMatch(fib, /Between|confirmed|Anchor|recent|source unavailable/);
const profile = vm.runInContext('renderProfileHeader(sampleRow)', context);
assert.match(profile, /企业软件/); assert.match(profile, /高成长/); assert.match(profile, /高波动/); assert.match(profile, /扩张期/);
vm.runInContext('state.language = "en";', context);
assert.equal(vm.runInContext('decisionActionLabel({action: "buy", actionLabel: "买入"})', context), config.actionLabels.buy.en);
const english = vm.runInContext('technicalBlock(sampleRow, "short")', context);
assert.match(english, /Primary slope/); assert.match(english, /recovering bearish/);
assert.equal(JSON.stringify(row), original, "localization never mutates canonical Technical or Profile data");
console.log("Dashboard language: all profile slots, technical horizons, Fibonacci, unknown/missing states, English roundtrip and canonical-data preservation passed.");
