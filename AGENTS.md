# Stock Decision Dashboard

## Current architecture · 2026-10-12

One production engine, internal release `V2`, feature schema `V2-daily-weekly`.
The Dashboard does not display the version. Independent `daily` and `weekly`
replace Short/Mid/Long; there is no third horizon, 1H/4H source or legacy switch.
Current specification and validation: [V2 Daily / Weekly](docs/daily-weekly-engine-proposal-2026-10-12.md).
Parameters have one source, `decision-engine/config.js`. Dated older evidence is
historical, not current configuration. Preserve its referenced reproduction material.

- `server.py`: bounded Daily/quote/Market fetching, validation, caching and shared watchlist/profile persistence. Daily history defaults to ten years; SPY/QQQ benchmark history is fetched once per shared market transaction.
- `market_data_validation.py`: source envelopes, finite numbers, duplicate/order checks, one XNYS session calendar, completion/freshness and completed-week provenance.
- `technical-features.js`: single canonical producer shared by Technical, Decision, API and offline EOD. Both horizons use only their own completed, as-of-valid bars.
- `decision-engine/`: shared Technical, Market, Profile, exhaustion, execution, final Confidence and completed-bar persistence. `horizon-model-v2.js` handles both frames and asset policies. `decision-engine.js` is the single entry point.
- `company-profile-classifier.js` and `profile-definitions.js`: metadata-only Company Profile V2.1 and isolated ETF definitions.
- `decision-api/emit-decision.js`: current `decision.v2` serialization; existing HTTP URLs remain, with no external legacy consumer. Format version and profile schema are independent of engine release.
- `main.js`: state/data integration and DOM only; never calculate an Action. `decision-presentation.js` and `ui-translations.js`: bilingual rendering only; never mutate engine inputs on language changes.
- `scripts/`: bounded read-only/offline verification. Temporary rows, provider payloads, screenshots and logs belong outside the repository. `docs/` holds specifications and compact dated evidence.
- `历史记录/`: offline history infrastructure, **paused** (`EOD_HISTORY_ENABLED=false`). No live request reads the history database.

## Decision contract

1. Inputs: canonical Technical, Market risk context, bounded Profile modifiers. No fundamental/valuation/options/news votes.
2. Independent Daily/Weekly, no overall Action, no cross-frame voting, no Action Score or equivalent composite score.
3. Actions: `strong_buy`, `buy`, `accumulate`, `hold`, `trim`, `sell`, `short_sell`. Avoid and Cover are absent. There is no assumed holding/position state and no mandatory Action chain.
4. Direction is fixed MA/MACD/ADX grouping. Confirmation uses independent RS, participation, RSI/ADX/momentum groups with correlated contributions capped. Tags cannot change stock Direction weights.
5. Buy: confirmed bullish structure plus gates and executable Opportunity. Accumulate: support repair and independent improvement before a full reversal; it is not an automatic downgrade of a failed Buy.
6. Trim: valid Reduce candidate with sustained momentum weakening plus independent weakening/failure evidence. A strong trend in a Reduce candidate can Hold. RSI >70 or Fear & Greed alone never creates Trim/Sell or a reversal.
7. Sell: confirmed bearish direction/structure or current protected-structure failure; executable current-area exit, without needing a new entry plan. Missing necessary trusted Technical/Quote produces waiting Hold, never a fabricated exit.
8. Short Sell: ordinary-stock Daily only, stricter confirmed bearish/participation/RS/risk gates, independent short entry zone, upper invalidation and at least 2R; never predict a top or chase a completed decline. It also supports long exit. Upper failure cancels the short plan and reevaluates normal actions; no Cover/automatic Buy.
9. Ordinary stock and nonleveraged ETF share left Accumulate/Trim logic. Leveraged ETF: strict Daily right/repair entry; Weekly backgroundOnly, no executable entry plan. Inverse funds use their own trend; underlying direction is bounded confirmation only.
10. Final Confidence describes final-action support consistency/stability, never probability; it follows the final Action and includes data, landscape and signal/price tension. It cannot substitute for an entry gate.

## Completed sources and canonical indicators

- Daily signals update after each exchange session close. Weekly updates after that week's last actual session close. Weekly OHLCV comes only from all expected completed Daily sessions, not a Daily fallback or provider-native weekly approximation.
- `pivot_at` differs from `known_at` (right-side confirmation close). Never backdate levels, use future candles/actuals or upgrade unfinished bars into confirmed evidence.
- Regular-hours Quote checks current location and immediate risk only. Store/display signal, quote and market times separately. A frozen prior-close Action is not a guarantee of a next-open fill.
- Daily RSI14 primary/6 auxiliary; Weekly RSI21 primary/14 auxiliary. EMA20/50 primary in both; Daily SMA100/200, Weekly EMA10/SMA200 background. MACD12/26/9, ADX/DI14, Wilder ATR14, BB20/2 and KDJ9 are own-frame features.
- Preserve useful full canonical MA, RSI, MACD, ADX/DI, ATR, Bollinger, KDJ, Volume/RVOL/OBV, RS, Fibonacci/history, Squeeze, structure/SMC and BB+RSI. Auxiliary windows stay inside their group or background, not independent votes.
- Completed Daily is the only volume source. Daily RVOL20 primary and 5/60 auxiliary; average120/250 background. Weekly RVOL compares volume per actual session against like-for-like weekly averages; Weekly OBV uses actual weekly totals, not normalized volume. Daily OBV20, Weekly OBV12.
- Completion provenance, stale own-frame source, rejected required rows, conflicting consumed volume or missing required frame history produce explicit waiting. Daily freshness expects the last closed session (previous session intraday); Weekly freshness independently expects the last fully closed exchange week. A missing/unfinished Daily outside completed Weekly never blocks that Weekly. Optional120/250/200W background gaps do not block valid unrelated judgments. Weekly gaps never borrow Daily structure.
- Rejected-row provenance keeps bounded dates/reasons. Unscoped legacy rejections remain conservative; a rejected unfinished/latest Daily must not disable all prior completed volume. If exactly the latest completed session is missing, one deadline-limited Yahoo `1d`/`auto_adjust=false` whole-candle retry can replace the rejected row after validation. Never fill Close from Quote, synthesize OHLCV, ignore a required closed-week gap, or blend fields from an invalid candle. Incremental overlap/adjustment validation remains mandatory; tail failure alone does not force a ten-year redownload.
- ATR is actual Wilder14, never modified by company tag. ATR% and own 60/120/250 observation percentiles provide frame-specific risk context. Zero/null/nonfinite rules are strict.
- Fibonacci independently uses confirmed Daily/Weekly pivots; no shared mutable anchors or fallback. Premium/Discount is `(P-L)/(H-L)` of that same valid interval, not a separate valuation or buy vote.
- BOS, protected-reference CHoCH and reclaimed Sweep are deterministic completed-price features. FVG is **shadow only**, zero Action/Confidence/zone contribution.

## Stateless Price Landscape and action boundaries

Every refresh: latest snapshot → canonical Technical → Direction/Confirmation/
Risk/Exhaustion → legitimate category confluence → Opportunity/Reduce/invalidation
and independent short plan → current Price State → final Action → final Confidence.

No previous ranges, clusters, scores, actions or history rows may select a new
zone. Categories are Fibonacci, confirmed swing, moving average, Bollinger and
52W/loaded history; same-category stacking is capped. ATR controls width and
normalized distance, never invents a centre from Quote. Preserve
`structureLevelsEnabled=false`: old return-retention failure has not been
reversed by adding SMC confirmation. Known confirmed BOS can change the role
of an already-existing matching swing.
Fib endpoints and their matching Swing share a frame/pivot identity, one current
role and one evidence category. Completed structure state resolves role; pending
role conversion retains the original role, and retired endpoints cannot revive
through Fib. Existing structure expansion remains disabled.
Only active confirmed Swing/history obstacles or independent confluence with
completed price rejection are hard execution targets. Isolated MA/Fib/BB levels
remain warning context. Missing a reliable target still discards entry; no remote
target may be selected just to pass R. Current-price-executable genuine candidate
pairs are considered before remote valid pairs; Quote never invents a centre.

Opportunity.high < Reduce.low, with an ATR/frame/confluence-aware neutral
buffer. If evidence cannot form honest separation/entry R, discard the plan
and explain Hold; do not manufacture precision. Buy/Accumulate require >=1.5R,
Strong Buy/Short Sell >=2R, before unverified fees/slippage/borrow. Evaluate all genuine candidate pairs for usable risk space before final ranking;
a failed top pair must not suppress the remaining valid zones. Clip each
unqualified candidate entry price against the nearest legitimate obstacle.
Display rounding must not cause a threshold pass.
Hold cards show current price and risk boundaries without actionable entry/reduction ranges. Their separate landscape uses lower/upper observation labels; candidate zones never authorize execution.

Near/Neutral is Hold. Opportunity can Hold if its independent gates fail.
Reduce/Beyond Reduce can Hold without exhaustion; otherwise Trim or confirmed
Sell. Confirmed bearish exit or hard risk is independent of the ordinary
entry family. Short Sell has its own price family and its own upper stop.

Protected risk references carry identity, known time, active state and ATR at
that time. Ordinary failure waits for the own-frame completed close; a Quote
beyond the fixed hard boundary plus material buffer can exit immediately.
ATR expansion cannot continually widen the same boundary. Retired broken
references cannot permanently suppress a genuinely new repaired structure.
No automatic left buy merely because a prior invalidation is now lower priced.
Without an active protected low, a long entry stop requires an associated,
confirmed active own-frame support with valid known/role-known times and fixed
ATR at confirmation. Isolated Fib extensions, MA/BB lines or an unconfirmed
historical low cannot create it. Keep the existing cluster centre; clip only
its legitimate candidate prices above that stop and against the nearest target.
Missing trustworthy stop evidence removes the entry plan with an explicit
reason. Stop/target display rounding must not improve the R qualification.
Event freshness and structural lifetime are separate: old intact structure needs
a new completed valid pullback repair to renew Buy support, never age-only Buy.
An advancing repaired break may promote a newly confirmed higher low after its
own known_at, with a new identity/fixed ATR. Short entry freshness remains strict.
The ordinary Accumulate one-improvement-group proposal is offline research only;
production keeps existing persistence/independent-improvement gates and asset rules.

## Macro/event rules

Official Fed/FRED calendars use IANA ET/Central conversion. BLS actual CPI and
employment use consecutive monthly observations, correct units/periods,
3-month context and known revision snapshots. Missing comparison stays null;
rising unemployment alone is not automatically bullish. Latest fetched macro
vintages never enter past replay as if they were known then.

Market is risk/confirmation context, not Direction. Combine overlapping regime,
yield and macro stress with a cap; issuer/release events are separate. A missing
or stale overall risk context blocks new entry, while valid bearish exits can
remain available. Calendar gaps block strict leveraged/short entry; ordinary
stocks face raised gates. CPI/employment consensus is not required.

Major FOMC/CPI/jobs crossing the latest Daily close → next real session close
pauses leveraged new entry and Short Sell until the first completed post-release
Daily and verified actual. Ordinary stocks raise requirements, not a blanket
ban. Sell is not blocked. Missing actuals do not become safe through elapsed
time. FedWatch probability source is currently unavailable: show this explicitly;
no invented/free-scraped/paid feed, no claim of a verified expectation surprise.

## Refresh transaction and resource constraints

- Render target: 512 MB RAM, 0.5 CPU, 1 GB disk. Reuse bounded normalized input, avoid deep clones/unbounded caches/heavy chart dependencies. Temporary clusters/series go out of scope after calculation. Company review cache remains capped at300; no Action/range cache is needed.
- Manual/auto share a single in-flight promise and generation. Both request force=true/full watchlist; provider-safe batches must refresh every active ticker. Fetch shared Market once per full transaction.
Force the shared Market refresh on the first manual/auto batch; later batches reuse it. When live reads are allowed, cached benchmark history must cover the latest actual completed XNYS session, regardless of cache write age. RS uses identical completed stock/benchmark window dates; missing intervening sessions or unverified benchmark price bases stay unavailable with explicit per-window diagnostics.
- Browser/server refresh every ten minutes at ET :05/:15/:25/:35/:45/:55, DST-safe wall-clock slots, not page-anchored intervals. A completed refresh means snapshot → both frames/Confidence/landscape → DOM → browser paint → loading ends/Last Refresh commits.
- Last Refresh uses applied server freshness in America/New_York, explicitly ET. Failed/empty responses retain prior successful page/time and release loading; retry next slot. Explicit busy response may extend a bounded first-load deadline once.
- Unverified alternate price adjustment bases cannot replace Daily data or borrow a trusted timestamp.
- Source calendar construction is shared per bounded frame/date lookup, not per historical row/year. Quote metadata wait remains bounded; optional metadata failure cannot discard valid price history.
- Active universe is only current shared watchlist, including authoritative empty lists; caches/old profiles/history cannot resurrect removed tickers.

## Offline EOD history

History remains paused, default and Render Blueprint false. Tests/audits use
isolated temporary databases only. If later authorized, the Render server's
16:30 America/New_York recorder performs full refresh → same JavaScript engine
→ two compact Daily/Weekly rows per ticker → single atomic SQLite transaction.
Weekly rows preserve the last completed week's signal time even on weekdays.

Unique key market_date+ticker+horizon; no live history input, raw OHLCV arrays,
complete series or unbounded cache. Heap-capped one-shot Node exits afterward.
Current-day valid session is required; stale tickers are explicit unavailable.
Legacy Short/Mid/Long rows (including Avoid) are unchanged; schema migration
allows new keys but copies all old row values verbatim. Existing width-shadow
columns remain only to preserve old rows, not new production experiments.
Storage/export/removal: [history README](历史记录/README-历史记录.md).

## Profiles

### Active-universe and persistence contract

The canonical **current active universe** is exactly the symbols in the
shared/current `watchlist` table. It is the only source for Dashboard cards,
current market-data requests, scheduled refresh, profile migration, annual
profile review, and Company Profile audits. A `company_profiles` row, quote
cache file, browser snapshot/localStorage entry, legacy watchlist artifact, or
EOD history row is evidence about a symbol only; none may create or resurrect
an active symbol. A successful shared-watchlist response is authoritative even
when it is empty, and the client must prune inactive keys from its persisted
snapshot. Offline browser cache is fallback-only.

Removed symbols may be retained only as dormant cache/profile data when an
environment deliberately keeps it, but production paths must ignore it. EOD
`decision_history` is immutable history and is never pruned or rewritten when
a ticker is removed. Never use a schema migration to insert a default/migration
ticker into an existing watchlist.

Ordinary stocks expose exactly four optional canonical slots, in this order:

1. `primaryClassification` — exactly one of: Semiconductors, Semiconductor Equipment, Enterprise Software, Cloud Infrastructure, Consumer Technology, Internet Platforms, Media & Entertainment, E-Commerce, Digital Advertising, Telecommunications Infrastructure, Capital Markets, Banking, Digital Financial Services, Payments, Insurance, Managed Care & Health Services, Pharmaceuticals, Biotechnology, Medical Devices, Consumer Discretionary, Consumer Staples, Retail, Industrials, Aerospace & Defense, Transportation & Logistics, Energy, Utilities, Real Estate, or Materials.
2. `businessTrait` — exactly one of: MarketLeader, HighGrowth, MatureGrowth, CashCow, Defensive, Cyclical, Turnaround, or EmergingGrowth.
3. `riskTrait` — exactly one of: HighVolatility, RegulatoryRisk, InterestRateSensitive, CommoditySensitive, MacroSensitive, CrowdedLeader, ExecutionRisk, or LowVolatility.
4. `lifecycle` — exactly one of: Emerging, Scaling, EstablishedLeader, MatureLeader, Recovery, or Declining.

`sizeClass` is a fifth **internal-only** context, currently `MegaCap` or `NonMegaCap`, derived from market capitalization. It is never a Company Trait, UI tag, visible Applied Modifier, direction vote, or action gate. It may apply only a small, bounded noise/risk/stability context through `sizeClassModifiers`.

`companyTraits` is only the compatibility/display array `[businessTrait, riskTrait].filter(Boolean)`. It is never a free-form tag list. Missing evidence remains `null`, gives no modifier, and produces `incomplete` or `unavailable` profile status; never guess a generic category, HighGrowth, HighVolatility, CashCow, or EstablishedLeader.

The server creates stock profiles automatically from compact existing provider metadata (industry, sector, business summary, market cap, growth, margin, and beta where present). The production classifier must not inspect ticker symbols or use a manual ordinary-stock ticker map. Business and Lifecycle selection use centralized metadata-evidence scoring with sufficiency thresholds and deterministic tie breaking, not a first-match MegaCap priority. Lifecycle requires staged structural evidence: growth alone cannot make a huge mature issuer `Scaling`; `Recovery` and `Declining` require issuer-specific summary evidence rather than a generic mention of an advisory service. Risk remains conservative: absent direct metadata evidence stays `null`, and `CrowdedLeader` is never auto-guessed from price/performance.

Every structural numeric field uses one safe finite-or-null normalization
contract: `null`, `undefined`, blank strings, `NaN`, and infinities stay
unavailable; they must never be coerced to zero. A valid `0` remains a valid
number. In particular, missing beta can never create `LowVolatility`, and
missing market cap/growth/margin cannot provide false classifier evidence.

Business classification is correctness-driven, never distribution-balanced.
`Cyclical` may receive a bounded baseline from a structurally cyclical Primary
(currently semiconductor/equipment, energy, materials, industrial,
transport/logistics, or capital-markets families), but Primary alone never
forces the trait. It requires corroborating issuer cycle exposure or explicit
cycle language under the centralized evidence threshold; strong secular-growth
evidence may still select `HighGrowth`. Use the documented deterministic tie
order and candidate scores—never ticker-specific overrides or category quotas.

It stores compact current profiles in the persistent `company_profiles` table inside `watchlist.db`; Dashboard restart must not change their source of truth. The V2.1 migration runs once per stock when compact fresh/cached metadata is available, replaces legacy slot values with the current classifier result, removes legacy visible `MegaCap`, and stores `profile_schema_version = 2.1`. It is idempotent. Complete V2.1 profiles do not change on normal market refreshes. Incomplete profiles may fill a null slot, but never overwrite a populated slot outside the annual review.

The only annual review date is **March 31, `America/New_York`**. A review does not force a change and sparse review metadata must never erase an established value. A valid review persists the date/provenance; it must also update the modifiers actually used by the engine. `profileConfidence` can remain in old rows, but its Final Confidence contribution is zero and the UI exposes no profile score. Confidence weights are renormalized over agreement/action strength/stability/data quality at 0.35/0.90, 0.25/0.90, 0.20/0.90, 0.10/0.90.

The four visible slots use conservative, centralized, aggregate-then-cap modifiers for Confirmation weights, risk and exhaustion tolerance, market/rate/event sensitivity, execution gates, benchmark emphasis, and stability. Internal size context is narrower: it may affect only small bounded risk/market/stability sensitivity and never votes Direction, changes confirmation, or alters an action gate. Stock Direction weights are fixed across identities. No profile may add action points, bypass a data/structure/location gate, or create a second recommendation engine. General caps remain 0.85–1.15; justified special sensitivity caps remain 0.80–1.20.

For `weeklyStability`, correlated maturity evidence from Business Trait,
Lifecycle, and internal Size Class is combined as one group: retain its
strongest contribution instead of stacking CashCow/EstablishedLeader/MegaCap
as three copies of the same fact. Independent Primary and Risk stability
evidence remains additive and all final values still use the existing caps.

Provider symbols are normalized centrally. The canonical watchlist keeps the
user-facing ticker and provider requests use that normalized symbol. Unsupported
symbols follow the normal provider-error/unavailable path; never create a
duplicate active symbol from a provider-form ticker.

ETFs remain isolated policy families inside the same production release. They never receive stock profile slots, Company Traits, or a Lifecycle. ETF profile fields are `isETF`, `leveraged`, `direction` (`long` or `inverse`), `underlying`, and optional `underlyingTicker`. Ordinary long ETFs use the unified ETF technical/market policy with its preserved rules. Leveraged ETFs use stricter gates and higher risk, exhaustion, and market sensitivity. Inverse ETFs use inverted underlying direction only as bounded confirmation; their own Technical states remain the Direction source.


## Coding and verification

Keep numerical policy centralized. UI reads final objects only. Null, blank,
NaN/infinity and boolean numeric values never become zero. Missing labels use
localized explicit fallback, never imply a neutral signal. No ticker-specific
stock recommendation or classifier map. Delete dead legacy implementations.

Each changed decision behavior requires targeted tests. Use existing tests and
read-only scripts; do not store broad audit output in the repo. Required checks:
all tests/*.test.js, Python unittest tests/*_test.py, source-completion/independent
math, causal structure and offline diagnostics, browser rendering/interactions,
bounded refresh/serializer memory. Historical diagnostics do not prove future
profitability or optimal thresholds. No push/deployment/history activation without
its authorized scope.
