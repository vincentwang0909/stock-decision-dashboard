# Stock Decision Dashboard

## Project overview

This is a lightweight stock decision dashboard. It displays a shared watchlist, complete canonical Technical and Market data, and an independent Short/Mid/Long Decision Engine. It is designed for Render's 512 MB RAM, 0.5 CPU, and 1 GB disk limits.

## Architecture

- `server.py` fetches, normalizes, caches, and serves market, quote, earnings, and independent page data.
- `main.js` owns application state, data integration, and DOM rendering. It must never calculate a recommendation.
- `technical-features.js` produces the canonical technical feature object used by both the Technical tab and the Decision Engine.
- `decision-engine/` contains the calibrated V1 recommendation model.
- `decision-presentation.js` is a small, pure UI helper for execution semantics, reason translation, and the DOM/CSS Price Map model.
- `scripts/` contains one-off audit/shadow tooling, not production history storage.
- `tests/` contains deterministic regression, feature, engine, and server checks.
- `index.html` loads the browser modules in dependency order.
- `styles.css` provides the dashboard's restrained dark-theme UI.

## Decision Engine principles

1. A final recommendation may use only Technical data, Market data, and Company Profile modifiers.
2. Fundamental, valuation, options, and news data must never enter a recommendation.
3. Short, Mid, and Long are fully independent; never average or vote across them.
4. There is no overall action.
5. The only actions are `strong_buy`, `buy`, `accumulate`, `hold`, `trim`, `sell`, and `avoid`.
6. Recommendation Confidence is support consistency and stability, not a probability.
7. Tags modify model behavior; they never add fixed points.
8. Exhaustion is a contrarian modifier, not an automatic reversal rule.
9. Strong Buy must remain rare and guarded.
10. Market data is primarily a risk regime, not a separate buy/sell engine.
11. Action and Recommended Range must be generated from the same Decision Object.
12. Never reintroduce Action Score or an equivalent numeric AI score.

## Technical horizons and roles

- Short (1–30 days): primarily 4H data with 1H support.
- Mid (1–6 months): primarily Daily data with 4H support.
- Long (>6 months): Weekly / long-Daily structure.

The technical roles are Direction, Confirmation, Risk, Price Opportunity, and Exhaustion. The Technical tab is the complete raw/interpreted technical-data view; the AI Decision tab presents only the final decision and its reasons.

## Execution semantics

`enter`, `add`, `hold`, `reduce`, `exit`, and `avoid` are the only execution intents. Hold must not be rendered as a buy plan, and Avoid must not be rendered as a sell/short plan. Buy/Accumulate use entry/add range, target, and invalidation; Trim/Sell use reduction/exit semantics; Hold shows a hold zone and structural reference only; Avoid may have no range or target.

## Tags and profile reviews

Profiles have Static tags, Dynamic Behavior tags, and a Lifecycle tag. Dynamic tags are reviewed no faster than every 90 days and need two consecutive qualifying reviews; lifecycle review cadence is 180 days. A candidate tag is not an active tag. Do not change tags on every price refresh.

## Stability and performance

The engine uses hysteresis and material-change overrides. Its bounded stability/profile caches have a 300-entry limit. Restarting may remove hysteresis history but must not make decisions incorrect because signal persistence is derived from existing technical history.

Do not add unbounded recommendation history, duplicate data fetches, large deep clones, or heavy client chart libraries without a demonstrated need. Reuse normalized Technical/Market payloads once per refresh.

## Coding rules

- Keep Decision Engine parameters centralized in `decision-engine/config.js`; do not scatter magic numbers.
- UI reads final Decision Objects only and never derives an action itself.
- Preserve complete canonical Technical data: Fibonacci, MA, RSI, MACD, ADX/DI, ATR, Bollinger, KDJ, OBV, Volume/RVOL, Relative Strength, and 52-week/history structure.
- Missing data must remain unavailable; never fake neutral/bullish values.
- Keep Chinese and English presentation strings synchronized, with a safe fallback for unknown reasons.
- Delete dead legacy code rather than wrapping it for compatibility.
- Every changed Decision behavior needs targeted tests.
- Never add ticker-specific recommendation hardcodes.

## Common mistakes to avoid

- `RSI > 70 => Sell` or `RSI < 30 => Buy`
- `ATR high => Bearish`
- `Fear & Greed => Buy/Sell`
- allowing the market to override an individual stock
- averaging Short/Mid/Long
- tag `+5/-5` scoring
- weekly Dynamic Tag changes
- fixed-percentage buy zones
- separate formulas for action and range
- rendering Hold as Buy or Avoid as Sell

## Testing

Run from the repository root:

```bash
/Users/vincentwang/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node tests/decision-engine.test.js
/Users/vincentwang/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node tests/technical-features.test.js
/Users/vincentwang/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node tests/dashboard-regression.test.js
/Users/vincentwang/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node tests/decision-ui.test.js
/private/tmp/stock-dashboard-test-venv/bin/python3 -m unittest discover -s tests -p 'server_availability_test.py'
/Users/vincentwang/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node scripts/decision-audit.js
/Users/vincentwang/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node scripts/decision-shadow.js
```

`decision-engine.test.js` covers scenario assertions; `technical-features.test.js` covers canonical feature completeness; `dashboard-regression.test.js` protects dashboard/data regressions; `server_availability_test.py` checks server output; `decision-audit.js` and `decision-shadow.js` are bounded one-off model audits.
