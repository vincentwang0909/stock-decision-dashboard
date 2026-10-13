"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const main = fs.readFileSync(require("node:path").join(__dirname, "..", "main.js"), "utf8");
let now = new Date("2026-10-04T13:04:59.999Z").getTime();
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
  ["2026-10-04T13:00:00.000Z", "2026-10-04T13:05:00.000Z"],
  ["2026-10-04T13:04:59.999Z", "2026-10-04T13:05:00.000Z"],
  ["2026-10-04T13:05:00.000Z", "2026-10-04T13:15:00.000Z"],
  ["2026-10-04T13:14:59.999Z", "2026-10-04T13:15:00.000Z"],
  ["2026-10-04T13:15:00.000Z", "2026-10-04T13:25:00.000Z"],
  ["2026-10-04T13:25:00.000Z", "2026-10-04T13:35:00.000Z"],
  ["2026-10-04T13:35:00.000Z", "2026-10-04T13:45:00.000Z"],
  ["2026-10-04T13:45:00.000Z", "2026-10-04T13:55:00.000Z"],
  ["2026-10-04T13:55:00.000Z", "2026-10-04T14:05:00.000Z"],
  ["2026-10-04T13:59:59.999Z", "2026-10-04T14:05:00.000Z"],
  ["2026-10-05T03:59:59.999Z", "2026-10-05T04:05:00.000Z"],
  ["2026-01-04T14:39:00.000Z", "2026-01-04T14:45:00.000Z"],
  ["2026-11-01T05:55:00.000Z", "2026-11-01T06:05:00.000Z"],
  ["2026-11-01T05:59:59.999Z", "2026-11-01T06:05:00.000Z"],
  ["2026-11-01T06:05:00.000Z", "2026-11-01T06:15:00.000Z"],
  ["2026-03-08T06:55:00.000Z", "2026-03-08T07:05:00.000Z"],
  ["2026-03-08T06:59:59.999Z", "2026-03-08T07:05:00.000Z"],
]) assert.equal(context.nextAutoRefreshAt(new Date(input)).toISOString(), expected, input);
for (let minute=0;minute<60;minute++) {
  const input=new Date(Date.UTC(2026,9,4,13,minute,37));
  const next=context.nextAutoRefreshAt(input);
  assert(next>input && next-input<=10*60*1000,"every minute produces a future bounded slot");
  assert([5,15,25,35,45,55].includes(next.getUTCMinutes()));
  assert.equal(next.getUTCSeconds(),0);
}
context.scheduleAutoRefresh();
assert.equal([...timers.values()][0].delay, 1);
context.scheduleAutoRefresh();
assert.equal(timers.size, 1, "rescheduling cannot create overlapping timers");
function fire() { const [id, timer] = [...timers.entries()][0]; timers.delete(id); timer.fn(); }
now += 1;
fire();
assert.equal(requests, 1);
assert.equal([...timers.values()][0].delay, 10 * 60 * 1000);
now += 3 * 60 * 60 * 1000 + 5 * 60 * 1000;
fire();
assert.equal(requests, 2, "a sleeping tab resumes with one refresh, without replaying missed slots");
assert.equal([...timers.values()][0].delay, 5 * 60 * 1000);
assert.equal(timers.size, 1, "an unsuccessful refresh still schedules the next :05 / :15 / :25 / :35 / :45 / :55 slot");
console.log("Dashboard schedule: ET :05 / :15 / :25 / :35 / :45 / :55, exact boundaries, both DST changes, delayed tab and single timer passed.");
