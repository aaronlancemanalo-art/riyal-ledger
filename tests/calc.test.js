import { test } from "node:test";
import assert from "node:assert/strict";
import { period, totals, toQar, pace, cumulative, goalProgress, mergeTx, budgetRows, breakdown, toCsv, niceMax } from "../js/calc.js";

const D = (y, m, d) => new Date(y, m - 1, d);

test("calendar-month period", () => {
  const p = period(0, 1, D(2026, 11, 7));
  assert.equal(p.s, "2026-11-01"); assert.equal(p.e, "2026-12-01");
  assert.equal(p.days, 30); assert.equal(p.elapsed, 7); assert.equal(p.label, "November 2026");
});

test("payday period before and after the start day", () => {
  const before = period(0, 25, D(2026, 11, 7));
  assert.equal(before.s, "2026-10-25"); assert.equal(before.e, "2026-11-25"); assert.equal(before.days, 31);
  const after = period(0, 25, D(2026, 11, 26));
  assert.equal(after.s, "2026-11-25"); assert.equal(after.elapsed, 2);
});

test("period offsets cross the year boundary", () => {
  assert.equal(period(-11, 1, D(2026, 11, 7)).s, "2025-12-01");
  assert.equal(period(2, 1, D(2026, 11, 7)).s, "2027-01-01");
});

test("February and the 28-day clamp", () => {
  const p = period(0, 31, D(2027, 2, 10));
  assert.equal(p.s, "2027-01-28"); assert.equal(p.e, "2027-02-28"); assert.equal(p.days, 31);
});

test("currency conversion rounds to fils and rejects unknown currencies", () => {
  const fx = { QAR: 1, PHP: 0.0578, USD: 3.64 };
  assert.equal(toQar(1000, "PHP", fx), 57.8);
  assert.equal(toQar(10.005, "QAR", fx), 10.01);
  assert.equal(toQar(100, "USD", fx), 364);
  assert.ok(Number.isNaN(toQar(5, "JPY", fx)));
});

const tx = [
  { id: "a", date: "2026-11-02", kind: "expense", cat: "groceries", qar: 100 },
  { id: "b", date: "2026-11-05", kind: "expense", cat: "eating", qar: 50 },
  { id: "c", date: "2026-11-01", kind: "income", cat: "salary", qar: 7000 },
  { id: "d", date: "2026-11-03", kind: "saving", cat: "emergency", qar: 1000 },
  { id: "e", date: "2026-10-31", kind: "expense", cat: "groceries", qar: 999 },
  { id: "f", date: "2026-11-04", kind: "expense", cat: "groceries", qar: 400, deleted: true }
];

test("totals respect the period and skip deleted entries", () => {
  const t = totals(tx, period(0, 1, D(2026, 11, 7)));
  assert.equal(t.spent, 150); assert.equal(t.income, 7000); assert.equal(t.saved, 1000);
  assert.equal(t.byCat.groceries, 100); assert.equal(t.net, 5850);
  assert.equal(Math.round(t.savingsRate * 1000), 143);
});

test("pace status", () => {
  const p = period(0, 1, D(2026, 11, 15)); // 15 of 30 days
  assert.equal(pace(p, 500, 1000).status, "on");
  assert.equal(pace(p, 800, 1000).status, "ahead");
  assert.equal(pace(p, 540, 1000).status, "slightly");
  assert.equal(pace(p, 100, 0).status, "none");
  assert.equal(pace(p, 500, 1000).daysLeft, 16);
});

test("cumulative spend stops at today", () => {
  const { daily, cum } = cumulative(tx, period(0, 1, D(2026, 11, 7)));
  assert.equal(daily.length, 30); assert.equal(cum.length, 7);
  assert.equal(cum[1], 100); assert.equal(cum[6], 150);
});

test("budget rows flag over and unbudgeted spend", () => {
  const cats = [{ id: "groceries", name: "Groceries", kind: "expense", budget: 80 }, { id: "eating", name: "Eating out", kind: "expense", budget: 0 }];
  const t = totals(tx, period(0, 1, D(2026, 11, 7)));
  const { rows } = budgetRows(cats, t, period(0, 1, D(2026, 11, 7)));
  assert.equal(rows[0].id, "groceries"); assert.equal(rows[0].state, "over");
  assert.equal(rows.find(r => r.id === "eating").state, "nobudget");
  const b = breakdown(cats, t);
  assert.equal(b[0].id, "groceries"); assert.equal(Math.round(b[0].share * 100), 67);
});

test("goal progress and monthly amount needed", () => {
  const g = goalProgress({ id: "emergency", target: 10000, start: 1000, deadline: "2027-05-01" }, tx, D(2026, 11, 7));
  assert.equal(g.saved, 2000); assert.equal(g.monthsLeft, 6);
  assert.equal(Math.round(g.perMonth), 1333);
});

test("merge keeps the newer copy and carries deletes", () => {
  const mine = [{ id: "x", amount: 1, updated: "2026-11-01" }, { id: "y", amount: 2, updated: "2026-11-05" }];
  const theirs = [{ id: "x", deleted: true, updated: "2026-11-03" }, { id: "y", amount: 9, updated: "2026-11-02" }, { id: "z", amount: 3, updated: "2026-11-04" }];
  const r = mergeTx(mine, theirs);
  const by = Object.fromEntries(r.list.map(x => [x.id, x]));
  assert.equal(by.x.deleted, true); assert.equal(by.y.amount, 2); assert.equal(by.z.amount, 3);
  assert.equal(r.added, 1); assert.equal(r.changed, 1);
});

test("CSV escapes commas and quotes", () => {
  const csv = toCsv([{ date: "2026-11-02", kind: "expense", cat: "g", amount: 5, cur: "QAR", qar: 5, account: "Bank", note: 'Lulu, "big" shop' }], () => "Groceries");
  assert.equal(csv.split("\n")[1], '2026-11-02,expense,Groceries,5,QAR,5,Bank,"Lulu, ""big"" shop"');
});

test("nice axis maximum", () => {
  assert.equal(niceMax(830), 1000); assert.equal(niceMax(2100), 2500); assert.equal(niceMax(0), 100);
});

import { recurs, dueIn, landing, forecast, scenarioAdj, goalForecast, addMonths } from "../js/calc.js";

const plan = {
  cycleStart: 1, fx: { QAR: 1, PHP: 0.0578 },
  categories: [{ id: "groceries", kind: "expense", budget: 1500 }, { id: "rent", kind: "expense", budget: 3000 }],
  goals: [{ id: "emergency", target: 20000, start: 5000, monthly: 1500 }],
  recurring: [
    { id: "r1", name: "Salary", kind: "income", cat: "salary", amount: 10000, cur: "QAR", every: 1, start: "2026-01" },
    { id: "r2", name: "Rent", kind: "expense", cat: "rent", amount: 3000, cur: "QAR", every: 1, start: "2026-01" },
    { id: "r3", name: "Car insurance", kind: "expense", cat: "car", amount: 1200, cur: "QAR", every: 12, start: "2026-03" },
    { id: "r4", name: "Money home", kind: "expense", cat: "family", amount: 20000, cur: "PHP", every: 1, start: "2026-01" }
  ]
};

test("recurring items: monthly, yearly, start and end", () => {
  assert.equal(recurs({ every: 12, start: "2026-03" }, "2027-03"), true);
  assert.equal(recurs({ every: 12, start: "2026-03" }, "2027-04"), false);
  assert.equal(recurs({ every: 1, start: "2026-12" }, "2026-11"), false);
  assert.equal(recurs({ every: 1, start: "2026-01", end: "2026-10" }, "2026-11"), false);
  assert.equal(dueIn(plan.recurring, period(0, 1, D(2026, 11, 7))).length, 3);
  assert.equal(addMonths("2026-11", 3), "2027-02");
});

test("landing with no history falls back to budgets for day-to-day spending", () => {
  const L = landing(plan, [], D(2026, 11, 1));
  // income 10000, fixed 3000 + 1156 (20000 PHP), variable = budgets 4500 − monthly fixed 4156 = 344, early in the month
  assert.equal(L.basis, "budget");
  assert.equal(Math.round(L.fixed), 4156);
  assert.equal(Math.round(L.landing), Math.round(10000 - 4156 - L.variable));
  assert.equal(L.pending.length, 3);
});

test("landing counts logged plan items once and blends pace with history", () => {
  const txs = [
    { id: "a", date: "2026-10-05", kind: "expense", cat: "groceries", qar: 1200 },
    { id: "b", date: "2026-11-01", kind: "income", cat: "salary", qar: 10000, rec: "r1" },
    { id: "c", date: "2026-11-02", kind: "expense", cat: "rent", qar: 3000, rec: "r2" },
    { id: "d", date: "2026-11-10", kind: "expense", cat: "groceries", qar: 600 }
  ];
  const L = landing(plan, txs, D(2026, 11, 15));
  assert.equal(L.basis, "history"); assert.equal(L.histMonths, 1);
  assert.equal(L.pending.map(r => r.id).join(), "r4");
  assert.equal(L.income, 10000);
  // pace: 600 over 15 of 30 days → 1200; history 1200; blend 1200
  assert.equal(Math.round(L.variable), 1200);
  assert.equal(Math.round(L.landing), Math.round(10000 - 3000 - 1156 - 1200));
});

test("forecast compounds monthly surpluses and applies scenarios", () => {
  const base = forecast(plan, [], 12, null, D(2026, 11, 1));
  assert.equal(base.rows.length, 12);
  assert.equal(base.rows[0].key, "2026-12");
  const mar = base.rows.find(r => r.key === "2027-03");
  assert.equal(Math.round(mar.fixed), 3000 + 1156 + 1200);
  const sc = { items: [{ type: "monthly", amount: 2000, start: "2027-01" }, { type: "oneoff", amount: -5000, start: "2027-06" }] };
  assert.equal(scenarioAdj(sc, "2026-12"), 0); assert.equal(scenarioAdj(sc, "2027-06"), -3000);
  const alt = forecast(plan, [], 12, sc, D(2026, 11, 1));
  const diff = alt.rows[11].balance - base.rows[11].balance;
  assert.equal(Math.round(diff), 2000 * 11 - 5000);
});

test("goal reach date from monthly contribution and deadline check", () => {
  const g = goalForecast({ id: "emergency", target: 20000, start: 5000, monthly: 1500, deadline: "2027-06-01" }, [], D(2026, 11, 7));
  assert.equal(g.months, 10); assert.equal(g.reachKey, "2027-09"); assert.equal(g.late, 3);
  const none = goalForecast({ id: "x", target: 1000, start: 0, monthly: 0 }, [], D(2026, 11, 7));
  assert.equal(none.reachKey, null);
  const grow = goalForecast({ id: "x", target: 1300, start: 1000, monthly: 0, growth: 12 }, [], D(2026, 11, 7));
  assert.ok(grow.months > 20 && grow.months < 30);
});

import { dayToDay } from "../js/calc.js";
test("pace ignores planned bills once a plan exists", () => {
  const txs = [{ id: "c", date: "2026-11-02", kind: "expense", cat: "rent", qar: 3000, rec: "r2" }, { id: "d", date: "2026-11-03", kind: "expense", cat: "groceries", qar: 200 }];
  const dd = dayToDay(plan, txs, period(0, 1, D(2026, 11, 7)));
  assert.equal(dd.planned, true); assert.equal(dd.spent, 200); assert.equal(Math.round(dd.budget), 344);
});

import { savedIn, savingsHistory, savingsForecast, targetStreak, goalRate, plannedMonthly } from "../js/calc.js";

const sv = [
  { id: "s1", date: "2026-08-20", kind: "saving", cat: "emergency", qar: 1000 },
  { id: "s2", date: "2026-09-05", kind: "saving", cat: "emergency", qar: 2000 },
  { id: "s3", date: "2026-09-25", kind: "withdrawal", cat: "emergency", qar: 500 },
  { id: "s4", date: "2026-10-03", kind: "saving", cat: "trip", qar: 1500 },
  { id: "s5", date: "2026-10-28", kind: "saving", cat: "emergency", qar: 1500 },
  { id: "s6", date: "2026-11-02", kind: "saving", cat: "emergency", qar: 800 }
];
const svSettings = { cycleStart: 1, savingsTarget: 2500, goals: [{ id: "emergency", target: 20000, start: 0, monthly: 0 }, { id: "trip", target: 6000, start: 0, monthly: 1000 }] };

test("withdrawals reduce the period and the goal", () => {
  const sep = savedIn(sv, period(-2, 1, D(2026, 11, 7)));
  assert.equal(sep.deposits, 2000); assert.equal(sep.withdrawals, 500); assert.equal(sep.net, 1500);
  assert.equal(goalProgress(svSettings.goals[0], sv).saved, 4800);
});

test("savings history averages complete months since the first entry", () => {
  const h = savingsHistory(sv, 1, D(2026, 11, 7));
  assert.equal(h.months, 3); assert.deepEqual(h.vals, [3000, 1500, 1000]);
  assert.equal(Math.round(h.avg), 1833);
  const short = savingsHistory([{ id: "a", date: "2026-10-15", kind: "saving", cat: "x", qar: 900 }], 1, D(2026, 11, 7));
  assert.equal(short.months, 1); assert.equal(short.avg, 900);
});

test("savings forecast uses history, else the plan", () => {
  const f = savingsForecast(svSettings, sv, 12, null, D(2026, 11, 7));
  assert.equal(f.basis, "history"); assert.equal(Math.round(f.start), 6300);
  assert.equal(Math.round(f.rows[11].balance), 6300 + 22000);
  const none = savingsForecast(svSettings, [], 12, null, D(2026, 11, 7));
  assert.equal(none.basis, "plan"); assert.equal(none.rate, 2500);
  assert.equal(plannedMonthly({ goals: [{ monthly: 500 }, { monthly: 300 }] }), 800);
  const sc = { items: [{ type: "monthly", amount: 500, start: "2027-01" }] };
  const alt = savingsForecast(svSettings, sv, 12, sc, D(2026, 11, 7));
  assert.equal(Math.round(alt.rows[11].balance - f.rows[11].balance), 500 * 11);
});

test("target streak and goal rate", () => {
  assert.equal(targetStreak(sv, svSettings, D(2026, 11, 7)), 1);
  assert.equal(goalRate(svSettings.goals[1], sv, 1, D(2026, 11, 7)).basis, "set");
  const r = goalRate(svSettings.goals[0], sv, 1, D(2026, 11, 7));
  assert.equal(r.basis, "history"); assert.equal(Math.round(r.rate), 1333);
});
