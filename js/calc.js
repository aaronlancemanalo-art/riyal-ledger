// Pure money and date logic. No DOM, no storage, so it can be unit tested in Node.

export const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const MONTH = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const DAY = 864e5;

const pad = n => String(n).padStart(2, "0");
export const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const parseIso = s => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
export const clampStartDay = n => Math.min(28, Math.max(1, Math.round(Number(n)) || 1));

/**
 * The budget period containing `today`, shifted by `offset` periods.
 * A period runs from startDay of one month up to (not including) startDay of the next.
 */
export function period(offset = 0, startDay = 1, today = new Date()) {
  const sd = clampStartDay(startDay);
  const t = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  let m = t.getMonth();
  if (t.getDate() < sd) m -= 1;
  m += offset;
  const start = new Date(t.getFullYear(), m, sd);
  const end = new Date(t.getFullYear(), m + 1, sd);
  const days = Math.round((end - start) / DAY);
  const elapsed = Math.min(days, Math.max(0, Math.round((t - start) / DAY) + 1));
  const last = new Date(end.getFullYear(), end.getMonth(), end.getDate() - 1);
  const label = sd === 1
    ? `${MONTH[start.getMonth()]} ${start.getFullYear()}`
    : `${start.getDate()} ${MON[start.getMonth()]} – ${last.getDate()} ${MON[last.getMonth()]}`;
  const short = sd === 1 ? MON[start.getMonth()] : `${MON[start.getMonth()]} ${start.getDate()}`;
  return { start, end, s: iso(start), e: iso(end), days, elapsed, label, short, current: offset === 0 };
}

export const inPeriod = (p, tx) => tx.date >= p.s && tx.date < p.e;
export const live = list => list.filter(x => !x.deleted);

/** QAR value of an amount, rounded to fils. Returns NaN for an unknown currency. */
export function toQar(amount, cur, fx) {
  const r = cur === "QAR" ? 1 : Number(fx?.[cur]);
  if (!(r > 0)) return NaN;
  return Math.round(Number(amount) * r * 100) / 100;
}

export function totals(txs, p) {
  const t = { income: 0, spent: 0, saved: 0, byCat: {}, count: 0 };
  for (const x of txs) {
    if (x.deleted || !inPeriod(p, x)) continue;
    const v = Number(x.qar) || 0;
    t.count++;
    if (x.kind === "income") t.income += v;
    else if (x.kind === "saving") t.saved += v;
    else { t.spent += v; t.byCat[x.cat] = (t.byCat[x.cat] || 0) + v; }
  }
  t.net = t.income - t.spent - t.saved;
  t.savingsRate = t.income > 0 ? t.saved / t.income : null;
  return t;
}

export const budgetTotal = categories =>
  categories.filter(c => c.kind === "expense").reduce((a, c) => a + (Number(c.budget) || 0), 0);

/** Where spending stands against an even pace. gap > 0 means spending ahead of time. */
export function pace(p, spent, budget) {
  const daysLeft = Math.max(1, p.days - p.elapsed + 1);
  const left = budget - spent;
  const timePct = p.current ? p.elapsed / p.days : 1;
  const spendPct = budget > 0 ? spent / budget : 0;
  const gap = spendPct - timePct;
  const status = !budget ? "none" : !p.current ? (left >= 0 ? "under" : "over")
    : gap > 0.1 ? "ahead" : gap > 0.02 ? "slightly" : "on";
  return { left, daysLeft, perDay: left > 0 ? left / daysLeft : 0, timePct, spendPct, gap, status };
}

/** Daily spend and running total for the chart. Running total stops at today in the current period. */
export function cumulative(txs, p, variableOnly = false) {
  const daily = new Array(p.days).fill(0);
  for (const x of txs) {
    if (x.deleted || x.kind !== "expense" || !inPeriod(p, x) || (variableOnly && x.rec)) continue;
    const i = Math.round((parseIso(x.date) - p.start) / DAY);
    if (i >= 0 && i < p.days) daily[i] += Number(x.qar) || 0;
  }
  const upto = p.current ? p.elapsed : p.days;
  const cum = [];
  let run = 0;
  for (let i = 0; i < upto; i++) { run += daily[i]; cum.push(Math.round(run * 100) / 100); }
  return { daily, cum };
}

export function budgetRows(categories, t, p) {
  const exp = categories.filter(c => c.kind === "expense");
  const rows = exp.map(c => ({ id: c.id, name: c.name, budget: Number(c.budget) || 0, spent: t.byCat[c.id] || 0 }))
    .filter(r => r.budget > 0 || r.spent > 0);
  for (const id of Object.keys(t.byCat)) if (!exp.some(c => c.id === id)) rows.push({ id, name: "Uncategorised", budget: 0, spent: t.byCat[id] });
  for (const r of rows) {
    r.pct = r.budget ? r.spent / r.budget : null;
    r.state = !r.budget ? "nobudget" : r.pct > 1 ? "over" : r.pct > 0.85 ? "warn" : "ok";
  }
  rows.sort((a, b) => (b.pct ?? -1) - (a.pct ?? -1) || b.spent - a.spent);
  return { rows, paceMark: p.current ? p.elapsed / p.days : null };
}

/** Spending by category, largest first, with share of total spend. */
export function breakdown(categories, t) {
  const total = t.spent;
  return Object.entries(t.byCat)
    .map(([id, v]) => ({ id, name: categories.find(c => c.id === id)?.name || "Uncategorised", value: v, share: total ? v / total : 0 }))
    .sort((a, b) => b.value - a.value);
}

export function trend(txs, offset, startDay, n = 6, today = new Date()) {
  const out = [];
  for (let k = n - 1; k >= 0; k--) { const p = period(offset - k, startDay, today); out.push({ p, t: totals(txs, p) }); }
  return out;
}

export function goalProgress(goal, txs, today = new Date()) {
  let saved = Number(goal.start) || 0;
  for (const x of txs) if (!x.deleted && x.kind === "saving" && x.cat === goal.id) saved += Number(x.qar) || 0;
  const target = Number(goal.target) || 0;
  const pct = target ? Math.min(1, saved / target) : null;
  let monthsLeft = null, perMonth = null;
  if (target && goal.deadline && saved < target) {
    const dl = parseIso(goal.deadline);
    monthsLeft = Math.max(0, (dl.getFullYear() - today.getFullYear()) * 12 + dl.getMonth() - today.getMonth());
    perMonth = monthsLeft > 0 ? (target - saved) / monthsLeft : null;
  }
  return { saved, target, pct, remaining: Math.max(0, target - saved), monthsLeft, perMonth, done: target > 0 && saved >= target };
}

/** Merge two entry lists by id; the copy with the later `updated` wins, so deletes (tombstones) carry over. */
export function mergeTx(mine, theirs) {
  const map = new Map(mine.map(x => [x.id, x]));
  let added = 0, changed = 0;
  for (const x of theirs) {
    if (!x || !x.id) continue;
    const cur = map.get(x.id);
    if (!cur) { map.set(x.id, x); added++; }
    else if (String(x.updated || "") > String(cur.updated || "")) { map.set(x.id, x); changed++; }
  }
  return { list: [...map.values()], added, changed };
}

export function toCsv(txs, nameOf) {
  const q = v => { const s = String(v ?? ""); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const rows = [["Date", "Type", "Category", "Amount", "Currency", "Amount (QAR)", "Account", "Note"]];
  for (const x of live(txs).sort((a, b) => a.date.localeCompare(b.date)))
    rows.push([x.date, x.kind, nameOf(x.kind, x.cat), x.amount, x.cur, x.qar, x.account, x.note]);
  return rows.map(r => r.map(q).join(",")).join("\n");
}

export const fmt0 = n => Math.round(n).toLocaleString("en-US");
export const fmt2 = n => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const signed = n => (n < 0 ? "−" : "") + fmt0(Math.abs(n));
export const kfmt = v => v >= 1000 ? (v / 1000).toLocaleString("en-US", { maximumFractionDigits: 1 }) + "k" : fmt0(v);
export function niceMax(v) {
  if (!(v > 0)) return 100;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p;
}

/* ---------------- forecasting ---------------- */

/** "YYYY-MM" of the month a period starts in. Recurring items and scenarios are keyed by it. */
export const monthKey = p => p.s.slice(0, 7);
const monthsBetween = (a, b) => { const [ay, am] = a.split("-").map(Number), [by, bm] = b.split("-").map(Number); return (by - ay) * 12 + (bm - am); };
export const addMonths = (key, n) => { const [y, m] = key.split("-").map(Number); const d = new Date(y, m - 1 + n, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; };
export const monthLabel = key => { const [y, m] = key.split("-").map(Number); return `${MON[m - 1]} ${y}`; };

/** Does a recurring item fall in the period whose month key is `key`? */
export function recurs(item, key) {
  const start = item.start || key;
  const k = monthsBetween(start, key);
  if (k < 0) return false;
  if (item.end && monthsBetween(key, item.end) < 0) return false;
  return k % (Number(item.every) || 1) === 0;
}

export function dueIn(recurring, p) {
  const key = monthKey(p);
  return (recurring || []).filter(r => Number(r.amount) > 0 && recurs(r, key));
}

const recQar = (r, fx) => { const q = toQar(r.amount, r.cur || "QAR", fx); return Number.isNaN(q) ? 0 : q; };

export function plannedTotals(recurring, p, fx) {
  const t = { income: 0, expense: 0, saving: 0 };
  for (const r of dueIn(recurring, p)) t[r.kind] = (t[r.kind] || 0) + recQar(r, fx);
  return t;
}

/** Day-to-day spending: expenses that are not logged from a recurring plan item. */
export function variableSpent(txs, p) {
  let v = 0;
  for (const x of txs) if (!x.deleted && x.kind === "expense" && !x.rec && inPeriod(p, x)) v += Number(x.qar) || 0;
  return v;
}

/** Average day-to-day spending over up to `n` previous complete periods that have any entries. */
export function variableHistory(txs, startDay, today = new Date(), n = 3) {
  const vals = [];
  for (let k = 1; k <= 12 && vals.length < n; k++) {
    const p = period(-k, startDay, today);
    if (!txs.some(x => !x.deleted && inPeriod(p, x))) continue;
    vals.push(variableSpent(txs, p));
  }
  return { months: vals.length, avg: vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0 };
}

/** Budgeted day-to-day spending: category budgets minus what the plan already covers. */
export function budgetVariable(settings) {
  const fixed = (settings.recurring || []).filter(r => r.kind === "expense" && (Number(r.every) || 1) === 1)
    .reduce((a, r) => a + recQar(r, settings.fx), 0);
  return Math.max(0, budgetTotal(settings.categories || []) - fixed);
}

/** Total set aside so far across all goals. */
export function totalSaved(settings, txs, today = new Date()) {
  return (settings.goals || []).reduce((a, g) => a + goalProgress(g, txs, today).saved, 0);
}

/**
 * Where this period is heading. "landing" is what will be left over (free to save) at the
 * period end: income (logged plus planned but not yet logged) minus fixed bills (same) minus
 * a projection of day-to-day spending that blends the current pace with past averages.
 */
export function landing(settings, txs, today = new Date()) {
  const p = period(0, settings.cycleStart, today);
  const t = totals(txs, p);
  const loggedRec = new Set(txs.filter(x => !x.deleted && x.rec && inPeriod(p, x)).map(x => x.rec));
  const pending = dueIn(settings.recurring, p).filter(r => !loggedRec.has(r.id));
  const pend = { income: 0, expense: 0, saving: 0 };
  for (const r of pending) pend[r.kind] += recQar(r, settings.fx);
  const varSoFar = variableSpent(txs, p);
  const fixedSoFar = t.spent - varSoFar;
  const hist = variableHistory(txs, settings.cycleStart, today);
  const w = p.elapsed / p.days;
  const pacePred = p.elapsed ? varSoFar / p.elapsed * p.days : 0;
  const fallback = hist.months ? hist.avg : budgetVariable(settings);
  const basis = hist.months ? "history" : budgetVariable(settings) > 0 ? "budget" : "pace";
  let varProj;
  if (basis === "pace") varProj = pacePred;
  else varProj = w * pacePred + (1 - w) * fallback;
  varProj = Math.max(varSoFar, varProj);
  const income = t.income + pend.income;
  const fixed = fixedSoFar + pend.expense;
  const left = income - fixed - varProj;
  return { p, income, fixed, variable: varProj, varSoFar, landing: left, savedSoFar: t.saved, pending, basis, histMonths: hist.months };
}

/** Signed QAR adjustment a scenario makes in a month. Positive means more money. */
export function scenarioAdj(scenario, key) {
  if (!scenario) return 0;
  let a = 0;
  for (const it of scenario.items || []) {
    const amt = Number(it.amount) || 0;
    if (!it.start) continue;
    if (it.type === "oneoff") { if (it.start === key) a += amt; }
    else if (monthsBetween(it.start, key) >= 0 && (!it.end || monthsBetween(key, it.end) >= 0)) a += amt;
  }
  return a;
}

/**
 * Month-by-month projection of total savings for the next `horizon` periods.
 * Each future month: planned income − planned bills − typical day-to-day spending (+ scenario changes).
 * The leftover is assumed to be saved. Starts from what is saved now plus what this period is set to add.
 */
export function forecast(settings, txs, horizon = 12, scenario = null, today = new Date()) {
  const L = landing(settings, txs, today);
  const hist = variableHistory(txs, settings.cycleStart, today);
  const variable = hist.months ? hist.avg : budgetVariable(settings);
  const start = totalSaved(settings, txs, today) + Math.max(0, L.landing - L.savedSoFar) + scenarioAdj(scenario, monthKey(L.p));
  const rows = [];
  let bal = start;
  for (let k = 1; k <= horizon; k++) {
    const p = period(k, settings.cycleStart, today);
    const key = monthKey(p);
    const plan = plannedTotals(settings.recurring, p, settings.fx);
    const adj = scenarioAdj(scenario, key);
    const surplus = plan.income - plan.expense - variable + adj;
    bal += surplus;
    rows.push({ key, p, income: plan.income, fixed: plan.expense, variable, adj, surplus, balance: bal });
  }
  return { start, rows, variable, basis: hist.months ? "history" : "budget", histMonths: hist.months };
}

/** When a goal is projected to hit its target from its own monthly contribution (and optional yearly growth %). */
export function goalForecast(goal, txs, today = new Date(), maxMonths = 240) {
  const g = goalProgress(goal, txs, today);
  const monthly = Number(goal.monthly) || 0;
  const r = (Number(goal.growth) || 0) / 100 / 12;
  const out = { ...g, monthly, reachKey: null, months: null, late: null };
  if (!g.target) return out;
  const nowKey = iso(today).slice(0, 7);
  if (g.done) { out.reachKey = nowKey; out.months = 0; return out; }
  if (monthly <= 0 && r <= 0) return out;
  let bal = g.saved;
  for (let k = 1; k <= maxMonths; k++) {
    bal = bal * (1 + r) + monthly;
    if (bal >= g.target) { out.months = k; out.reachKey = addMonths(nowKey, k); break; }
  }
  if (out.reachKey && goal.deadline) out.late = monthsBetween(goal.deadline.slice(0, 7), out.reachKey);
  return out;
}

/**
 * Day-to-day view for pace: once a plan exists, fixed bills logged from it are left out
 * on both sides, so paying rent on the 1st doesn't read as overspending.
 */
export function dayToDay(settings, txs, p) {
  const hasPlan = (settings.recurring || []).some(r => r.kind === "expense");
  const t = totals(txs, p);
  return hasPlan
    ? { planned: true, spent: variableSpent(txs, p), budget: budgetVariable(settings) }
    : { planned: false, spent: t.spent, budget: budgetTotal(settings.categories || []) };
}
