"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const main = fs.readFileSync(require("node:path").join(__dirname, "..", "main.js"), "utf8");
const helper = main.slice(main.indexOf("async function fetchDashboardJson"), main.indexOf("async function loadWatchlist"));
const refresh = main.slice(main.indexOf("function refreshUsesLiveData"), main.indexOf("async function addTicker"));
const oldSnapshot = { quotes: { A: { price: 100 } }, fetchedAt: "2026-10-01T20:30:00Z" };
const nextSnapshot = { quotes: { A: { price: 101 } }, fetchedAt: "2026-10-02T20:30:00Z" };
const context = vm.createContext({
  AbortController, URLSearchParams, SyntaxError, console: { error() {} },
  setTimeout: (fn, delay) => setTimeout(fn, delay === 3000 ? 2 : delay), clearTimeout,
  WATCHLIST_REQUEST_TIMEOUT_MS: 20, SNAPSHOT_REQUEST_TIMEOUT_MS: 20, LIVE_REFRESH_TIMEOUT_MS: 60,
  API_URL: "/api/market-data", state: { watchlist: ["A"], snapshot: oldSnapshot, refreshGeneration: 0, refreshPromise: null, lastRefreshAt: oldSnapshot.fetchedAt },
  applyLanguage() {}, render() {}, async afterBrowserPaint() {}, persistLastRefresh() {},
  snapshotRefreshTime: (snapshot) => snapshot.fetchedAt,
});
let applications = 0, requests = [];
context.applySnapshot = (snapshot) => {
  applications++;
  context.state.snapshot = snapshot;
  context.state.rows = context.state.watchlist.map((ticker) => ({ price: snapshot.quotes?.[ticker]?.price ?? null }));
};
const usable = main.slice(main.indexOf("function hasUsableSnapshot"), main.indexOf("function afterBrowserPaint"));
const finite = main.slice(main.indexOf("const finite ="), main.indexOf("function formatPrice("));
vm.runInContext(finite + "\n" + usable + "\n" + helper + "\n" + refresh, context);
const response = (payload, status = 200) => ({ ok: status < 400, status, async json() { return payload; } });

(async () => {
  for (const price of [null, "", " ", undefined, NaN, Infinity, 0, -1, true, false, [], [1], {}]) {
    assert.equal(context.hasUsableSnapshot({ success: true, quotes: { A: { price } } }), false);
  }
  assert.equal(context.hasUsableSnapshot({ success: true, quotes: { DORMANT: { price: 999 } } }), false);
  context.fetch = async () => response({ success: false, quotes: { A: { price: null } }, fetchedAt: "2026-10-04T23:45:00Z" });
  await context.runFullRefresh({ source: "manual" });
  assert.equal(context.state.refreshError, "quotesUnavailable");
  assert.equal(context.state.snapshot, oldSnapshot);
  assert.equal(context.state.lastRefreshAt, oldSnapshot.fetchedAt);
  assert.equal(applications, 0, "empty provider results cannot replace valid prices or freshness");
  context.fetch = () => new Promise(() => {});
  await assert.rejects(context.fetchDashboardJson("/api/watchlist", { timeoutMs: 8 }), { name: "TimeoutError" });
  context.fetch = async () => ({ ok: true, status: 200, json: () => new Promise(() => {}) });
  await assert.rejects(context.fetchDashboardJson("/api/market-data", { timeoutMs: 8 }), { name: "TimeoutError" });

  let coldBusy = true;
  context.fetch = async () => {
    if (coldBusy) { coldBusy = false; return response({ error_code: "refresh_in_progress" }, 503); }
    await new Promise((resolve) => setTimeout(resolve, 20));
    return response(nextSnapshot);
  };
  assert.equal(await context.fetchDashboardJson("/api/market-data", { timeoutMs: 8, retryBusy: true, busyTimeoutMs: 80 }), nextSnapshot,
    "first visits wait for the actual live refresh, beyond the shorter cache deadline");
  context.fetch = async () => response({ error_code: "refresh_in_progress" }, 503);
  await assert.rejects(context.fetchDashboardJson("/api/market-data", { timeoutMs: 8, retryBusy: true, busyTimeoutMs: 25 }), { name: "TimeoutError" },
    "repeated busy responses cannot keep extending the deadline");
  context.fetch = async () => ({ ok: true, status: 200, json: () => new Promise(() => {}) });
  await context.runFullRefresh({ source: "auto" });
  assert.equal(context.state.refreshError, "refreshTimeout");
  assert.equal(context.state.refreshing, false);
  assert.equal(context.state.refreshPromise, null);
  assert.equal(context.state.lastRefreshAt, oldSnapshot.fetchedAt);
  assert.equal(context.state.snapshot, oldSnapshot);
  assert.equal(applications, 0);

  context.fetch = async () => ({ ok: true, status: 200, async json() { throw new SyntaxError("Unexpected end of JSON input"); } });
  await context.runFullRefresh({ source: "manual" });
  assert.equal(context.state.refreshError, "refreshInterrupted");
  assert.equal(context.state.refreshing, false);
  assert.equal(context.state.lastRefreshAt, oldSnapshot.fetchedAt);

  let busy = true;
  context.fetch = async (url) => {
    requests.push(url);
    if (busy) { busy = false; return response({ error_code: "refresh_in_progress" }, 503); }
    return response(nextSnapshot);
  };
  await Promise.all([context.runFullRefresh({ source: "manual" }), context.runFullRefresh({ source: "auto" })]);
  assert.equal(requests.length, 2, "one shared refresh, including one busy retry");
  assert.equal(requests[0], requests[1], "retry preserves the full requested watchlist and force mode");
  assert.equal(new URLSearchParams(requests[0].split("?")[1]).get("full_refresh"), "true");
  assert.equal(context.state.snapshot, nextSnapshot);
  assert.equal(context.state.lastRefreshAt, nextSnapshot.fetchedAt);
  assert.equal(context.state.serviceUpdating, false);
  assert.equal(context.state.refreshError, null);
  assert.equal(applications, 1);
  requests = [];
  await context.runFullRefresh({ source: "auto" });
  const autoParams = new URLSearchParams(requests[0].split("?")[1]);
  assert.equal(autoParams.get("force"), "true");
  assert.equal(autoParams.get("full_refresh"), "true");
  assert.equal(autoParams.get("auto_refresh"), "true");
  context.state.watchlist = ["A", "B"];
  await context.runFullRefresh({ source: "manual" });
  assert.equal(context.state.refreshError, "partialQuotesUnavailable");
  assert.equal(context.state.snapshot, nextSnapshot, "valid partial prices remain usable with an explicit notice");
  console.log("Dashboard network: hung headers/body, truncated JSON, busy retry, failure preservation and recovery passed.");
})().catch((error) => { console.error(error); process.exitCode = 1; });
