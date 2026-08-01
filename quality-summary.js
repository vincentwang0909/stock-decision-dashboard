(function attachFinancialQualitySummary(root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.FinancialQualitySummary = api;
})(typeof globalThis !== "undefined" ? globalThis : this, () => {
  const finite = (value) => Number.isFinite(value);
  const positive = (value) => finite(value) && value > 0;

  function comparisonState(comparison) {
    if (!comparison || comparison.current == null || comparison.prior == null) return "unavailable";
    if (comparison.state) return comparison.state;
    if (!finite(comparison.pct_change)) return "unavailable";
    return comparison.pct_change >= 0 ? "improved" : "weakened";
  }

  function materiallyDeteriorated(comparison, threshold = -30) {
    if (!comparison) return false;
    if (["turned_negative", "loss_expanded"].includes(comparisonState(comparison))) return true;
    return finite(comparison.pct_change) && comparison.pct_change <= threshold;
  }

  function classifyCashGeneration(input) {
    const { ttmOcf, ttmFcf, ttmFcfMargin, quarterOcf, quarterFcf, quarterFcfMargin, quarterFcfYoy } = input;
    const quarterDeteriorated = materiallyDeteriorated(quarterFcfYoy);
    const fcfUnderPressure = quarterFcf < 0 || ttmFcf < 0;

    if (ttmOcf < 0 || (ttmFcf < 0 && quarterFcf < 0 && quarterOcf <= 0)) return "weak";
    if (positive(ttmOcf) && fcfUnderPressure) {
      // A negative TTM FCF is a stronger capital-spending warning than a
      // temporarily weak, but still positive, TTM margin.
      if (ttmFcf < 0) return "operating_cash_flow_strong_fcf_under_pressure";
      return ttmFcfMargin < 0.10
        ? "operating_cash_flow_adequate_short_term_fcf_pressure"
        : "operating_cash_flow_strong_fcf_under_pressure";
    }
    if (positive(ttmOcf) && positive(ttmFcf) && (quarterFcfMargin < 0.10 || quarterDeteriorated)) return "long_term_strong_short_term_pressure";
    if (positive(ttmOcf) && positive(ttmFcf) && ttmFcfMargin >= 0.15 && positive(quarterFcf) && quarterFcfMargin >= 0.10 && !quarterDeteriorated) return "strong";
    if (positive(ttmOcf) || positive(quarterOcf)) return "mixed";
    return "unavailable";
  }

  function classifyCapitalEfficiency(input) {
    const { ttmOcf, ttmFcf, ttmFcfMargin, quarterOcf, quarterFcf, quarterFcfMargin, ttmCapexToOcf, quarterCapexToOcf, capexYoy, quarterFcfYoy } = input;
    const sharpCapexGrowthWithFcfPressure = finite(capexYoy?.pct_change) && capexYoy.pct_change > 30 && materiallyDeteriorated(quarterFcfYoy);
    const hasPressure = quarterCapexToOcf >= 0.90 || ttmCapexToOcf >= 0.90 || quarterFcf < 0 || quarterFcfMargin < 0.05 || sharpCapexGrowthWithFcfPressure;
    if (positive(ttmOcf) && ttmFcf < 0 && quarterFcf < 0 && quarterCapexToOcf >= 1.20) return "capital_investment_period";
    if (hasPressure) return "capital_expenditure_pressure";
    if (ttmFcfMargin >= 0.15 && quarterFcfMargin >= 0.10 && ttmCapexToOcf < 0.70 && quarterCapexToOcf < 0.80 && positive(ttmFcf) && positive(quarterFcf)) return "strong";
    if (positive(ttmFcf) && positive(quarterFcf) && ttmCapexToOcf >= 0.70 && ttmCapexToOcf <= 0.90) return "adequate";
    return positive(ttmOcf) || positive(quarterOcf) ? "mixed" : "unavailable";
  }

  function classifyShareholderReturn(input) {
    const { repurchases, dividends, shareChangePct, shareCountComparable } = input;
    const distributions = (finite(repurchases) ? repurchases : 0) + (finite(dividends) ? dividends : 0);
    const returnsCapital = distributions > 0;
    if (!returnsCapital || !shareCountComparable || !finite(shareChangePct)) return "unavailable";
    if (returnsCapital && shareCountComparable && finite(shareChangePct) && shareChangePct <= 0) return "strong_shareholder_return";
    if (returnsCapital && shareCountComparable && finite(shareChangePct) && shareChangePct > 0 && shareChangePct <= 2) return "ongoing_return_not_fully_offset_dilution";
    if (finite(shareChangePct) && shareChangePct > 2 && (!returnsCapital || shareCountComparable)) return "share_dilution";
    return "unavailable";
  }

  function classifyEarningsQuality(input) {
    const { operatingMargin, operatingMarginChangePp, netMargin, epsSurprisePct, quarterFcf, quarterFcfMargin, ttmFcf, normalizedBridgeAvailable, materialNonOperatingBoost } = input;
    const severeEpsMiss = finite(epsSurprisePct) && epsSurprisePct <= -15;
    const majorMarginContraction = finite(operatingMarginChangePp) && operatingMarginChangePp <= -0.05;
    const weakOperatingProfitability = finite(operatingMargin) && operatingMargin < 0.05;
    const fcfPressure = quarterFcf < 0 || quarterFcfMargin < 0.05;
    const weakNetProfitability = finite(netMargin) && netMargin < 0.03;
    if (weakOperatingProfitability || weakNetProfitability || severeEpsMiss || (quarterFcf < 0 && majorMarginContraction)) return "earnings_quality_under_pressure";
    if (operatingMargin > 0 && (fcfPressure || majorMarginContraction || (finite(epsSurprisePct) && epsSurprisePct < 0) || materialNonOperatingBoost)) return "core_earnings_strong_but_realization_pressure";
    if (operatingMargin >= 0.10 && positive(quarterFcf) && positive(ttmFcf) && !majorMarginContraction && !(finite(epsSurprisePct) && epsSurprisePct < 0) && normalizedBridgeAvailable !== false) return "strong_core_earnings";
    if (finite(operatingMargin) || finite(quarterFcf) || finite(ttmFcf)) return "mixed";
    return "unavailable";
  }

  function buildFinancialQuality(input) {
    return {
      cashGeneration: classifyCashGeneration(input),
      capitalEfficiency: classifyCapitalEfficiency(input),
      shareholderReturn: classifyShareholderReturn(input),
      earningsQuality: classifyEarningsQuality(input),
      comparisonState,
      materiallyDeteriorated,
    };
  }

  return { buildFinancialQuality, classifyCashGeneration, classifyCapitalEfficiency, classifyShareholderReturn, classifyEarningsQuality, comparisonState, materiallyDeteriorated };
});
