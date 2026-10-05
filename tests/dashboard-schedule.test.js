"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const main = fs.readFileSync(require("node:path").join(__dirname, "..", "main.js"), "utf8");
let now = new Date("2026-10-04T13:39:59.999Z").getTime();
class ClockDate extends Date {
  constructor(...args) { super(...(args.length ? args : [now])); }
  static now() { return now; }
}
let timerId = 0, requests = 0;
const timers = new Map();
const context = vm.createContext({
  Date: ClockDate, Intl,
  setTimeout(fn, delay) { const id = ++timerId; timers.set(id, { fn, delay }); return id; },
  clearTimeout(id) { timers.delete(id); },
  runFullRefresh({ source }) { assert.equal(source, "auto"); requests++; return Promise.resolve(null); },
});
const constants = main.slice(main.indexOf("const REFRESH_MS"), main.indexOf("const DEFAULT_WATCHLIST"));
const scheduler = main.slice(main.indexOf("let autoRefreshTimer"), main.indexOf("async function runFullRefresh"));
vm.runInContext(constants + "\n" + scheduler, context);
for (const [input, expected] of [
  ["2026-10-04T13:39:59.999Z", "2026-10-04T13:40:00.000Z"],
  ["2026-10-04T13:40:00.000Z", "2026-10-04T14:40:00.000Z"],
  ["2026-10-04T13:45:00.000Z", "2026-10-04T14:40:00.000Z"],
  ["2026-01-04T14:39:00.000Z", "2026-01-04T14:40:00.000Z"],
  ["2026-11-01T05:50:00.000Z", "2026-11-01T06:40:00.000Z"],
  ["2026-03-08T06:50:00.000Z", "2026-03-08T07:40:00.000Z"],
]) assert.equal(context.nextAutoRefreshAt(new Date(input)).toISOString(), expected, input);
context.scheduleAutoRefresh();
assert.equal([...timers.values()][0].delay, 1);
context.scheduleAutoRefresh();
assert.equal(timers.size, 1, "rescheduling cannot create overlapping timers");
function fire() { const [id, timer] = [...timers.entries()][0]; timers.delete(id); timer.fn(); }
now += 1;
fire();
assert.equal(requests, 1);
assert.equal([...timers.values()][0].delay, 60 * 60 * 1000);
now += 3 * 60 * 60 * 1000 + 5 * 60 * 1000;
fire();
assert.equal(requests, 2, "a sleeping tab resumes with one refresh, without replaying missed slots");
assert.equal([...timers.values()][0].delay, 55 * 60 * 1000);
assert.equal(timers.size, 1, "an unsuccessful refresh still schedules the next :40 slot");
console.log("Dashboard schedule: ET :40, exact boundary, both DST changes, delayed tab and single timer passed.");
