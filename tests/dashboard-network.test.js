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
  hasUsableSnapshot: (snapshot) => Boolean(snapshot.quotes?.A?.price),
  snapshotRefreshTime: (snapshot) => snapshot.fetchedAt,
});
let applications = 0, requests = [];
context.applySnapshot = (snapshot) => { applications++; context.state.snapshot = snapshot; };
vm.runInContext(helper + "\n" + refresh, context);
const response = (payload, status = 200) => ({ ok: status < 400, status, async json() { return payload; } });

(async () => {
  context.fetch = () => new Promise(() => {});
  await assert.rejects(context.fetchDashboardJson("/api/watchlist", { timeoutMs: 8 }), { name: "TimeoutError" });
  context.fetch = async () => ({ ok: true, status: 200, json: () => new Promise(() => {}) });
  await assert.rejects(context.fetchDashboardJson("/api/market-data", { timeoutMs: 8 }), { name: "TimeoutError" });
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
  console.log("Dashboard network: hung headers/body, truncated JSON, busy retry, failure preservation and recovery passed.");
})().catch((error) => { console.error(error); process.exitCode = 1; });
