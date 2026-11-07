// Riyal Ledger: UI wiring. Money logic lives in calc.js, storage in store.js, charts in charts.js.
import * as C from "./calc.js";
import { drawPace, drawTrend, drawForecast } from "./charts.js";
import * as store from "./store.js";
import { DEFAULTS } from "./defaults.js";

const S = { settings: null, tx: [], offset: 0, selCat: null, showAll: false, installEvt: null, horizon: 12, scenarioId: "" };
const $ = s => document.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const { fmt0, fmt2, signed, MON } = C;

const liveTx = () => C.live(S.tx);
const cats = kind => (S.settings?.categories || []).filter(c => c.kind === kind);
const goals = () => S.settings?.goals || [];
const catName = (kind, id) => (kind === "saving" ? goals() : cats(kind)).find(c => c.id === id)?.name || "Uncategorised";
const periodFor = o => C.period(o, S.settings?.cycleStart || 1);
const budget = () => C.budgetTotal(S.settings?.categories || []);

function toast(msg) {
  const t = document.createElement("div");
  t.className = "toast"; t.textContent = msg; t.setAttribute("role", "status");
  document.body.appendChild(t); setTimeout(() => t.remove(), 2600);
}
function applyTheme() {
  const th = S.settings?.theme;
  if (th === "light" || th === "dark") document.documentElement.dataset.theme = th;
  else delete document.documentElement.dataset.theme;
}

/* ---------- boot ---------- */
async function boot() {
  try {
    if (!("indexedDB" in window)) throw new Error("no idb");
    let settings = await store.getSettings();
    if (!settings) { settings = structuredClone(DEFAULTS); await store.saveSettings(settings); store.persist(); }
    S.settings = normalise(settings);
    S.tx = await store.allTx();
    applyTheme();
    render();
  } catch (err) {
    console.error(err);
    $("#app").innerHTML = `<div class="state"><h1>Storage isn't available</h1><p>This browser blocked on-device storage, often because of a private window. Open Riyal Ledger in a normal window.</p></div>`;
  }
}
function normalise(st) {
  st.recurring ||= []; st.scenarios ||= []; st.savingsTarget ||= 0;
  for (const g of st.goals || []) { g.monthly ||= 0; g.growth ||= 0; }
  return st;
}
async function reloadTx() { S.tx = await store.allTx(); render(); }

/* ---------- render ---------- */
function render() {
  if (!S.settings) return;
  const p = periodFor(S.offset);
  $("#cycLabel").textContent = p.label;
  $("#next").disabled = S.offset >= 0;
  $("#fab").hidden = false;
  const txs = liveTx();
  const t = C.totals(txs, p);
  const b = budget();
  $("#app").innerHTML = `
    <section class="band" aria-label="Summary">${heroHtml(p, t, b)}</section>
    <div class="board">
      <div class="col">
        <section class="panel"><div class="ph"><h2>Savings forecast</h2><button class="linkbtn" data-act="plan">Edit plan</button></div>${forecastHtml()}</section>
        <section class="panel"><div class="ph"><h2>Goals</h2><button class="linkbtn" data-act="goals">Edit goals</button></div>${goalsHtml(txs)}</section>
        <section class="panel"><div class="ph"><h2>Planned this period</h2><button class="linkbtn" data-act="plan">Edit plan</button></div>${dueHtml(p, txs)}</section>
        <section class="panel"><div class="ph"><h2>Entries</h2><span class="muted" style="font-size:13px">${esc(p.label)}</span></div>${txHtml(p, txs)}</section>
      </div>
      <div class="col">
        <section class="panel"><div class="ph"><h2>Budgets</h2><button class="linkbtn" data-act="budgets">Set budgets</button></div>${budgetsHtml(p, t)}</section>
        <section class="panel"><div class="ph"><h2>Spending pace</h2>
          <div class="legend"><span><i class="ln"></i>${S.settings.recurring.some(r => r.kind === "expense") ? "Day-to-day spent" : "Spent so far"}</span><span><i class="dash"></i>Even pace to budget</span></div></div>
          <div class="chart" id="paceChart"></div></section>
        <section class="panel"><div class="ph"><h2>Where it went</h2><span class="muted" style="font-size:13px">QAR ${fmt0(t.spent)} spent</span></div>${breakdownHtml(t)}</section>
        <section class="panel"><div class="ph"><h2>Last six periods</h2>
          <div class="legend"><span><i class="sw income"></i>Income</span><span><i class="sw spent"></i>Spent</span><span><i class="sw saved"></i>Saved</span></div></div>
          <div class="chart" id="trendChart"></div>${trendTable()}</section>
      </div>
    </div>
    ${S.installEvt ? `<p class="updated"><button class="linkbtn" data-act="install">Install Riyal Ledger on this device</button></p>` : ""}`;
  drawCharts();
}
const scenario = () => (S.settings.scenarios || []).find(x => x.id === S.scenarioId) || null;
function drawCharts() {
  const p = periodFor(S.offset);
  const dd = C.dayToDay(S.settings, liveTx(), p);
  drawPace($("#paceChart"), p, C.cumulative(liveTx(), p, dd.planned), dd.budget);
  drawTrend($("#trendChart"), C.trend(liveTx(), S.offset, S.settings.cycleStart));
  const el = $("#fcChart");
  if (el) {
    const sc = scenario();
    drawForecast(el, C.forecast(S.settings, liveTx(), S.horizon), sc ? C.forecast(S.settings, liveTx(), S.horizon, sc) : null, sc?.name);
  }
}

function heroHtml(p, t, b) {
  const dd = C.dayToDay(S.settings, liveTx(), p);
  const pc = C.pace(p, dd.spent, dd.budget);
  const rate = t.savingsRate == null ? "–" : Math.round(t.savingsRate * 100) + "%";
  const stats = (first) => `
    <div class="stats">
      ${first}
      <div class="stat"><span class="label k"><i class="sw income"></i>Income</span><span class="v">${fmt0(t.income)}</span></div>
      <div class="stat"><span class="label k"><i class="sw spent"></i>Spent</span><span class="v">${fmt0(t.spent)}${b ? `<span class="muted" style="font-size:12px"> / ${fmt0(b)}</span>` : ""}</span></div>
      <div class="stat"><span class="label k"><i class="sw saved"></i>Saved</span><span class="v">${fmt0(t.saved)}<span class="muted" style="font-size:12px"> ${rate}</span></span></div>
    </div>`;
  if (!p.current) {
    const chips = [];
    if (b) chips.push(pc.left >= 0 ? `<span class="chip ok">Under budget by ${fmt0(pc.left)}</span>` : `<span class="chip over">Over budget by ${fmt0(-pc.left)}</span>`);
    return `<div class="hero"><div class="label">Left over that period</div>
      <div class="big ${t.net < 0 ? "neg" : ""}"><small>QAR</small>${signed(t.income - t.spent)}</div>
      <p>Income minus spending for ${esc(p.label)}. Of that, QAR ${fmt0(t.saved)} went to goals.</p><div class="chips">${chips.join("")}</div></div>`
      + stats(`<div class="stat"><span class="label k">Net</span><span class="v">${signed(t.net)}</span></div>`);
  }
  const L = C.landing(S.settings, liveTx());
  const target = Number(S.settings.savingsTarget) || 0;
  const chips = [];
  if (target) {
    const gap = L.landing - target;
    chips.push(gap >= 0 ? `<span class="chip ok">On track for your QAR ${fmt0(target)} target</span>` : `<span class="chip ${gap > -target * 0.25 ? "warn" : "over"}">QAR ${fmt0(-gap)} short of your ${fmt0(target)} target</span>`);
  }
  if (dd.budget) chips.push({ ahead: `<span class="chip over">Spending ahead of pace</span>`, slightly: `<span class="chip warn">Slightly ahead of pace</span>`, on: `<span class="chip ok">Spending on pace</span>` }[pc.status]);
  chips.push(`<span class="chip plain">Day ${p.elapsed} of ${p.days}</span>`);
  const basis = L.basis === "history" ? `your last ${L.histMonths} month${L.histMonths === 1 ? "" : "s"} of spending`
    : L.basis === "budget" ? "your budgets" : "your spending so far";
  const planNote = S.settings.recurring.length ? "" : ` <button class="linkbtn" data-act="plan">Add your salary and bills</button> to sharpen this.`;
  const line = `Income ${fmt0(L.income)} − bills ${fmt0(L.fixed)} − day-to-day ${fmt0(L.variable)}, based on ${basis}.${planNote}`;
  const perDay = dd.budget ? `<div class="stat"><span class="label k">${dd.planned ? "Day-to-day left" : "Left to spend"}</span><span class="v">${fmt0(Math.max(0, pc.perDay))}<span class="muted" style="font-size:12px">/day</span></span></div>`
    : `<div class="stat"><span class="label k">Planned left</span><span class="v">${L.pending.length}</span></div>`;
  return `<div class="hero"><div class="label">Forecast to save by ${esc(lastDay(p))}</div>
      <div class="big ${L.landing < 0 ? "neg" : ""}"><small>QAR</small>${signed(L.landing)}</div>
      <p>${line}</p><div class="chips">${chips.join("")}</div></div>` + stats(perDay);
}
function lastDay(p) { const d = new Date(p.end.getFullYear(), p.end.getMonth(), p.end.getDate() - 1); return `${d.getDate()} ${MON[d.getMonth()]}`; }

function forecastHtml() {
  const st = S.settings;
  const base = C.forecast(st, liveTx(), S.horizon);
  if (!st.recurring.some(r => r.kind === "income")) {
    return `<div class="empty"><b>Add your plan to see the forecast</b>Enter your salary and fixed bills once (rent, phone, money home). The forecast projects your savings 12 to 24 months ahead from them.<br><button class="btn primary" style="margin:12px auto 0;display:block" data-act="plan">Set up my plan</button></div>`;
  }
  const sc = scenario();
  const alt = sc ? C.forecast(st, liveTx(), S.horizon, sc) : null;
  const end = base.rows[base.rows.length - 1];
  const avg = base.rows.reduce((a, r) => a + r.surplus, 0) / base.rows.length;
  const opts = `<option value="">No what-if</option>` + st.scenarios.map(x => `<option value="${esc(x.id)}" ${x.id === S.scenarioId ? "selected" : ""}>${esc(x.name)}</option>`).join("");
  const diff = alt ? alt.rows[alt.rows.length - 1].balance - end.balance : null;
  return `<div class="ctrls">
      <div class="pill" role="group" aria-label="Forecast length">${[12, 24].map(h => `<button data-hz="${h}" aria-pressed="${S.horizon === h}">${h} months</button>`).join("")}</div>
      ${st.scenarios.length ? `<select id="scSel" aria-label="What-if scenario">${opts}</select>` : `<button class="linkbtn" data-act="scenarios">+ Add a what-if</button>`}
    </div>
    <div class="legend" style="margin-bottom:6px"><span><i class="ln saved"></i>Plan</span>${sc ? `<span><i class="ln alt"></i>${esc(sc.name)}</span>` : ""}</div>
    <div class="chart" id="fcChart"></div>
    <div class="fsum">
      <div><span class="label">Saved now</span><span class="v">${fmt0(C.totalSaved(st, liveTx()))}</span></div>
      <div><span class="label">By ${C.monthLabel(end.key)}</span><span class="v">${fmt0(end.balance)}</span></div>
      <div><span class="label">Adds a month</span><span class="v">${signed(avg)}</span></div>
      ${alt ? `<div><span class="label">${esc(sc.name)}</span><span class="v ${diff >= 0 ? "up" : "down"}">${diff >= 0 ? "+" : "−"}${fmt0(Math.abs(diff))}</span></div>` : ""}
    </div>
    <p class="note" style="margin-top:10px">Assumes whatever isn't spent is saved. Day-to-day spending of QAR ${fmt0(base.variable)} a month comes from ${base.basis === "history" ? `your last ${base.histMonths} month${base.histMonths === 1 ? "" : "s"}` : "your budgets until you have a month of history"}.</p>`;
}

function dueHtml(p, txs) {
  const due = C.dueIn(S.settings.recurring, p);
  if (!due.length) return `<p class="note">Nothing planned for this period. Add recurring items like salary, rent and money home under Edit plan, then log each with one tap.</p>`;
  const logged = new Set(txs.filter(x => x.rec && C.inPeriod(p, x)).map(x => x.rec));
  return `<div class="due">${due.map(r => {
    const q = C.toQar(r.amount, r.cur || "QAR", S.settings.fx);
    const orig = r.cur && r.cur !== "QAR" ? ` · ${esc(r.cur)} ${fmt2(Number(r.amount))}` : "";
    return `<div class="r"><span class="n">${esc(r.name)}<small>${esc(catName(r.kind, r.cat))}${orig}</small></span>
      <span class="v ${r.kind === "income" ? "income" : ""}">${r.kind === "income" ? "+" : ""}${fmt0(q)}</span>
      ${logged.has(r.id) ? `<span class="logged">Logged</span>` : (p.current || S.offset < 0) ? `<button class="logbtn" data-log="${esc(r.id)}">Log</button>` : ""}</div>`;
  }).join("")}</div>`;
}

function budgetsHtml(p, t) {
  const { rows, paceMark } = C.budgetRows(S.settings.categories, t, p);
  if (!rows.length) return `<div class="empty"><b>No budgets yet</b>Give each category a monthly limit in QAR and your bars appear here.<br><button class="btn primary" style="margin:12px auto 0;display:block" data-act="budgets">Set budgets</button></div>`;
  return `<div class="blist">${rows.map(r => {
    const cls = { nobudget: "nob", over: "over", warn: "warn", ok: "" }[r.state];
    const w = r.budget ? Math.min(100, r.pct * 100) : 100;
    const meta = !r.budget ? `<span>No budget set</span>`
      : r.state === "over" ? `<span class="st-over">Over by ${fmt0(r.spent - r.budget)}</span>`
      : `<span class="${r.state === "warn" ? "st-warn" : ""}">${fmt0(r.budget - r.spent)} left</span>`;
    return `<button class="brow ${S.selCat === r.id ? "sel" : ""}" data-cat="${esc(r.id)}" aria-pressed="${S.selCat === r.id}">
      <span class="n">${esc(r.name)}</span><span class="a"><b>${fmt0(r.spent)}</b> <span class="muted">/ ${r.budget ? fmt0(r.budget) : "–"}</span></span>
      <span class="bar ${cls}"><i style="width:${w}%"></i>${r.budget && paceMark != null ? `<u style="left:${paceMark * 100}%"></u>` : ""}</span>
      <span class="meta">${meta}<span>${r.budget ? Math.round(r.pct * 100) + "%" : ""}</span></span></button>`;
  }).join("")}</div><p class="note" style="margin-top:10px">${p.current ? "The thin mark on each bar is where an even pace would put you today. " : ""}Tap a category to filter entries.</p>`;
}

function breakdownHtml(t) {
  const rows = C.breakdown(S.settings.categories, t);
  if (!rows.length) return `<p class="note">No spending logged in this period yet.</p>`;
  const top = rows[0].value;
  return `<div class="brk">${rows.map(r => `<div class="r"><span class="n">${esc(r.name)}</span>
    <span class="v">${fmt0(r.value)}<span>${Math.round(r.share * 100)}%</span></span>
    <span class="bar" style="grid-column:1/-1"><i style="width:${(r.value / top) * 100}%"></i></span></div>`).join("")}</div>`;
}

function txHtml(p, txs) {
  let list = txs.filter(x => C.inPeriod(p, x));
  if (S.selCat) list = list.filter(x => x.cat === S.selCat);
  list.sort((a, b) => b.date.localeCompare(a.date) || String(b.created || "").localeCompare(String(a.created || "")));
  const filter = S.selCat ? `<div class="filter"><span class="chip plain">${esc(catName("expense", S.selCat))}</span><button class="linkbtn" data-act="clearcat">Show all categories</button></div>` : "";
  if (!list.length) return filter + `<div class="empty"><b>${S.selCat ? "Nothing in this category" : "No entries this period"}</b>${p.current ? "Tap + Add after each purchase. Ten seconds each keeps this honest." : "Nothing was logged in this period."}</div>`;
  const shown = S.showAll ? list : list.slice(0, 25);
  const groups = [];
  for (const x of shown) { const g = groups[groups.length - 1]; if (g && g.date === x.date) g.items.push(x); else groups.push({ date: x.date, items: [x] }); }
  const html = groups.map(g => {
    const d = C.parseIso(g.date);
    const dayTotal = g.items.filter(x => x.kind === "expense").reduce((a, x) => a + (Number(x.qar) || 0), 0);
    return `<div class="day"><h3><span>${d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })}</span>${dayTotal ? `<span class="num">${fmt0(dayTotal)}</span>` : ""}</h3>${g.items.map(x => {
      const name = catName(x.kind, x.cat);
      const init = (name.match(/[A-Za-z]/) || ["?"])[0].toUpperCase();
      const orig = x.cur && x.cur !== "QAR" ? `<span class="o">${esc(x.cur)} ${fmt2(Number(x.amount) || 0)}</span>` : "";
      const sign = x.kind === "income" ? "+" : x.kind === "saving" ? "→ " : "";
      const sub = [x.note ? name : "", x.account].filter(Boolean).join(" · ");
      return `<button class="tx" data-tx="${esc(x.id)}"><span class="k ${esc(x.kind)}" aria-hidden="true">${init}</span>
        <span class="t"><div>${esc(x.note || name)}</div><div class="s">${esc(sub)}</div></span>
        <span class="m ${x.kind === "income" ? "income" : ""}">${sign}${fmt2(Number(x.qar) || 0)}${orig}</span></button>`;
    }).join("")}</div>`;
  }).join("");
  const more = list.length > 25 ? `<button class="linkbtn" style="margin-top:10px" data-act="more">${S.showAll ? "Show fewer" : `Show all ${list.length}`}</button>` : "";
  return filter + html + more;
}

function goalsHtml(txs) {
  const gs = goals();
  if (!gs.length) return `<div class="empty"><b>No goals yet</b>Add a goal and log Saving entries against it.</div>`;
  const committed = gs.reduce((a, g) => a + (Number(g.monthly) || 0), 0);
  const L = C.landing(S.settings, txs);
  const warn = committed > 0 && S.settings.recurring.length && committed > L.landing
    ? `<p class="note st-warn" style="margin-top:12px">Monthly contributions (QAR ${fmt0(committed)}) are more than this period's forecast to save (QAR ${fmt0(L.landing)}).</p>` : "";
  return `<div class="goals">${gs.map(g => {
    const r = C.goalForecast(g, txs);
    let sub, f = "";
    if (!r.target) sub = "No target set. Add one in Edit goals.";
    else if (r.done) sub = "Target reached.";
    else {
      sub = `QAR ${fmt0(r.remaining)} to go` + (r.monthly ? ` at QAR ${fmt0(r.monthly)} a month.` : ". Set a monthly amount to get a date.");
      if (r.reachKey) {
        const when = C.monthLabel(r.reachKey);
        f = r.late == null ? `<span class="gf">Reached around ${when}</span>`
          : r.late <= 0 ? `<span class="gf ok">Reached around ${when}, on time</span>`
          : `<span class="gf late">Reached around ${when}, ${r.late} month${r.late === 1 ? "" : "s"} after the target date</span>`;
      } else if (r.monthly || g.growth) f = `<span class="gf late">Not reached within 20 years at this rate</span>`;
    }
    return `<div class="goal"><div class="gt"><span class="gn">${esc(g.name)}</span><span class="gv">${fmt0(r.saved)}${r.target ? ` <span class="muted">/ ${fmt0(r.target)}</span>` : ""}</span></div>
      ${r.target ? `<span class="bar"><i style="width:${r.pct * 100}%"></i></span>` : ""}${f}<span class="gm">${esc(sub)}</span></div>`;
  }).join("")}</div>${warn}`;
}

function trendTable() {
  const d = C.trend(liveTx(), S.offset, S.settings.cycleStart);
  return `<details class="tbl"><summary>Show as table</summary><div class="tscroll"><table><thead><tr><th>Period</th><th>Income</th><th>Spent</th><th>Saved</th><th>Net</th></tr></thead><tbody>${d.map(({ p, t }) => `<tr><td>${esc(p.label)}</td><td>${fmt0(t.income)}</td><td>${fmt0(t.spent)}</td><td>${fmt0(t.saved)}</td><td>${signed(t.net)}</td></tr>`).join("")}</tbody></table></div></details>`;
}

let rT;
new ResizeObserver(() => { clearTimeout(rT); rT = setTimeout(() => { if (S.settings) drawCharts(); }, 120); }).observe(document.body);

/* ---------- add / edit entry ---------- */
const TX = { kind: "expense", cat: null, editing: null };
function openTx(existing) {
  TX.editing = existing || null;
  TX.kind = existing?.kind || "expense";
  TX.cat = existing?.cat || null;
  $("#txTitle").textContent = existing ? "Edit entry" : "Add entry";
  $("#txCur").innerHTML = Object.keys(S.settings.fx || { QAR: 1 }).map(c => `<option>${esc(c)}</option>`).join("");
  $("#txCur").value = existing?.cur || "QAR";
  $("#txAcc").innerHTML = (S.settings.accounts || []).map(a => `<option>${esc(a)}</option>`).join("");
  $("#txAcc").value = existing?.account || (S.settings.accounts || [])[0] || "";
  $("#txAmt").value = existing ? String(existing.amount) : "";
  $("#txDate").value = existing?.date || C.iso(new Date());
  $("#txNote").value = existing?.note || "";
  const del = $("#txDel");
  del.hidden = !existing; del.classList.remove("armed"); del.textContent = "Delete";
  syncTx();
  $("#txDlg").showModal();
  if (!existing) setTimeout(() => $("#txAmt").focus(), 50);
}
const amountIn = () => parseFloat($("#txAmt").value.replace(/,/g, ""));
function syncTx() {
  document.querySelectorAll(".seg button").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.kind === TX.kind)));
  const list = TX.kind === "saving" ? goals() : cats(TX.kind);
  if (TX.cat && !list.some(x => x.id === TX.cat)) TX.cat = null;
  $("#catLbl").textContent = TX.kind === "saving" ? "Goal" : TX.kind === "income" ? "Income type" : "Category";
  $("#accLbl").textContent = TX.kind === "income" ? "Paid into" : TX.kind === "saving" ? "Moved from" : "Paid from";
  $("#txCats").innerHTML = list.length
    ? list.map(x => `<button type="button" data-c="${esc(x.id)}" aria-pressed="${x.id === TX.cat}">${esc(x.name)}</button>`).join("")
    : `<span class="note">Nothing set up yet. Add some in Settings.</span>`;
  const amt = amountIn(), cur = $("#txCur").value, q = C.toQar(amt, cur, S.settings.fx);
  $("#txConv").textContent = cur !== "QAR" && amt > 0 && !Number.isNaN(q) ? `≈ QAR ${fmt2(q)} at 1 ${cur} = ${S.settings.fx[cur]} QAR` : "";
  $("#txSave").disabled = !(amt > 0 && TX.cat && $("#txDate").value && !Number.isNaN(q));
}
document.querySelector(".seg").addEventListener("click", e => { const b = e.target.closest("button"); if (b) { TX.kind = b.dataset.kind; syncTx(); } });
$("#txCats").addEventListener("click", e => { const b = e.target.closest("button[data-c]"); if (b) { TX.cat = b.dataset.c; syncTx(); } });
["#txAmt", "#txCur", "#txDate"].forEach(s => $(s).addEventListener("input", syncTx));
$("#txClose").onclick = () => $("#txDlg").close();
$("#txForm").addEventListener("submit", async e => {
  e.preventDefault();
  const amount = Math.round(amountIn() * 100) / 100;
  const cur = $("#txCur").value;
  const q = C.toQar(amount, cur, S.settings.fx);
  if (!(amount > 0) || !TX.cat || Number.isNaN(q)) return;
  const ed = TX.editing;
  const keepRate = ed && ed.cur === cur && Number(ed.amount) === amount;
  const now = new Date().toISOString();
  const rec = {
    id: ed?.id || uid(), date: $("#txDate").value, kind: TX.kind, cat: TX.cat, amount, cur,
    qar: keepRate ? ed.qar : q, account: $("#txAcc").value, note: $("#txNote").value.trim(),
    created: ed?.created || now, updated: now
  };
  $("#txSave").disabled = true;
  try {
    await store.putTx(rec);
    $("#txDlg").close();
    toast(ed ? "Entry updated" : `Saved QAR ${fmt2(rec.qar)}, ${catName(rec.kind, rec.cat)}`);
    await reloadTx();
  } catch (err) { console.error(err); $("#txSave").disabled = false; toast("Couldn't save on this device. Check storage space."); }
});
$("#txDel").onclick = async () => {
  const b = $("#txDel");
  if (!b.classList.contains("armed")) { b.classList.add("armed"); b.textContent = "Tap again to delete"; return; }
  // Keep a small tombstone so a backup merge on another device removes it there too.
  await store.putTx({ id: TX.editing.id, deleted: true, updated: new Date().toISOString(), date: TX.editing.date });
  $("#txDlg").close(); toast("Entry deleted"); await reloadTx();
};

/* ---------- settings ---------- */
let D = null, tab = "budgets";
const num = v => parseFloat(String(v).replace(/,/g, "")) || 0;
function openSettings(which) {
  D = structuredClone(S.settings); tab = which || "plan";
  $("#setNote").textContent = ""; renderSet(); $("#setDlg").showModal();
}
function renderSet() {
  document.querySelectorAll(".tabs button").forEach(b => b.setAttribute("aria-selected", String(b.dataset.tab === tab)));
  $("#setSave").hidden = tab === "data";
  const body = $("#setBody");
  if (tab === "budgets" || tab === "income") {
    const kind = tab === "budgets" ? "expense" : "income";
    const list = D.categories.filter(c => c.kind === kind);
    body.innerHTML = `<p class="note">${kind === "expense" ? `Monthly limit per category in QAR. Total: <b class="num">QAR ${fmt0(C.budgetTotal(D.categories))}</b>. Leave 0 to track a category without a limit.` : "Where your money comes from. Rename or add as needed."}</p>
      <div class="ehead"><span>Name</span><span>${kind === "expense" ? "Budget (QAR)" : ""}</span><span></span></div>
      ${list.map(c => `<div class="erow"><input data-id="${esc(c.id)}" data-f="name" value="${esc(c.name)}" aria-label="Category name">
        ${kind === "expense" ? `<input data-id="${esc(c.id)}" data-f="budget" inputmode="decimal" value="${c.budget || ""}" placeholder="0" aria-label="Budget for ${esc(c.name)}" class="num">` : "<span></span>"}
        <button class="rm" data-rm="${esc(c.id)}" aria-label="Remove ${esc(c.name)}">×</button></div>`).join("")}
      <button class="add" data-addcat="${kind}">+ Add ${kind === "expense" ? "category" : "income type"}</button>`;
  } else if (tab === "plan") {
    const nowKey = C.iso(new Date()).slice(0, 7);
    const catOpts = (r) => (r.kind === "saving" ? D.goals : D.categories.filter(c => c.kind === r.kind))
      .map(c => `<option value="${esc(c.id)}" ${c.id === r.cat ? "selected" : ""}>${esc(c.name)}</option>`).join("");
    body.innerHTML = `<label class="field"><span class="label">Monthly savings target (QAR)</span><input class="num" inputmode="decimal" id="savTarget" value="${D.savingsTarget || ""}" placeholder="0"></label>
      <p class="note">Recurring money in and out. These drive the forecast, and each one gets a one-tap Log button on the dashboard.</p>
      ${D.recurring.map(r => `<div class="gblock">
        <div class="erow r5"><input data-rid="${esc(r.id)}" data-f="name" value="${esc(r.name)}" aria-label="Item name" placeholder="e.g. Salary">
          <input class="num" inputmode="decimal" data-rid="${esc(r.id)}" data-f="amount" value="${r.amount || ""}" placeholder="0" aria-label="Amount">
          <select data-rid="${esc(r.id)}" data-f="cur" aria-label="Currency">${Object.keys(D.fx).map(c => `<option ${c === (r.cur || "QAR") ? "selected" : ""}>${esc(c)}</option>`).join("")}</select>
          <button class="rm" data-rmr="${esc(r.id)}" aria-label="Remove ${esc(r.name)}">×</button></div>
        <div class="erow r5b">
          <select data-rid="${esc(r.id)}" data-f="kind" aria-label="Type">${[["income", "Income"], ["expense", "Bill"], ["saving", "Saving"]].map(([v, l]) => `<option value="${v}" ${v === r.kind ? "selected" : ""}>${l}</option>`).join("")}</select>
          <select data-rid="${esc(r.id)}" data-f="cat" aria-label="Category">${catOpts(r)}</select>
          <select data-rid="${esc(r.id)}" data-f="every" aria-label="How often">${[[1, "Monthly"], [3, "Every 3 months"], [6, "Every 6 months"], [12, "Yearly"]].map(([v, l]) => `<option value="${v}" ${v === (Number(r.every) || 1) ? "selected" : ""}>${l}</option>`).join("")}</select>
          <input type="month" data-rid="${esc(r.id)}" data-f="start" value="${esc(r.start || nowKey)}" aria-label="Starting month">
        </div></div>`).join("")}
      <button class="add" data-addrec="1">+ Add recurring item</button>`;
  } else if (tab === "scenarios") {
    body.innerHTML = `<p class="note">A what-if is a set of changes to compare against your plan. Use a positive amount for more money (a raise) and a negative one for less (higher rent abroad, a car loan).</p>
      ${D.scenarios.map(sc => `<div class="gblock">
        <div class="erow"><input data-sid="${esc(sc.id)}" data-f="name" value="${esc(sc.name)}" aria-label="What-if name"><span></span><button class="rm" data-rms="${esc(sc.id)}" aria-label="Remove ${esc(sc.name)}">×</button></div>
        ${(sc.items || []).map(it => `<div class="erow si">
          <select data-sid="${esc(sc.id)}" data-iid="${esc(it.id)}" data-f="type" aria-label="Change type"><option value="monthly" ${it.type !== "oneoff" ? "selected" : ""}>Every month</option><option value="oneoff" ${it.type === "oneoff" ? "selected" : ""}>One-off</option></select>
          <input data-sid="${esc(sc.id)}" data-iid="${esc(it.id)}" data-f="label" value="${esc(it.label || "")}" placeholder="What changes" aria-label="Description">
          <input class="num" inputmode="decimal" data-sid="${esc(sc.id)}" data-iid="${esc(it.id)}" data-f="amount" value="${it.amount || ""}" placeholder="+/- QAR" aria-label="Amount, positive or negative">
          <input type="month" data-sid="${esc(sc.id)}" data-iid="${esc(it.id)}" data-f="start" value="${esc(it.start || "")}" aria-label="From month">
          ${it.type !== "oneoff" ? `<input type="month" data-sid="${esc(sc.id)}" data-iid="${esc(it.id)}" data-f="end" value="${esc(it.end || "")}" aria-label="Until month (optional)" title="Until (optional)">` : ""}
          <button class="rm" data-rmi="${esc(it.id)}" data-sid="${esc(sc.id)}" aria-label="Remove change">×</button></div>`).join("")}
        <button class="add" data-additem="${esc(sc.id)}">+ Add a change</button></div>`).join("")}
      <button class="add" data-addsc="1">+ New what-if</button>`;
  } else if (tab === "goals") {
    body.innerHTML = `<p class="note">Log Saving entries against a goal to fill it. "Already saved" covers money you had before you started logging.</p>
      ${D.goals.map(g => `<div class="gblock"><div class="erow"><input data-gid="${esc(g.id)}" data-f="name" value="${esc(g.name)}" aria-label="Goal name"><span></span><button class="rm" data-rmg="${esc(g.id)}" aria-label="Remove ${esc(g.name)}">×</button></div>
        <div class="erow g2"><label class="field"><span class="label">Target (QAR)</span><input class="num" inputmode="decimal" data-gid="${esc(g.id)}" data-f="target" value="${g.target || ""}" placeholder="0"></label>
        <label class="field"><span class="label">Already saved</span><input class="num" inputmode="decimal" data-gid="${esc(g.id)}" data-f="start" value="${g.start || ""}" placeholder="0"></label>
        <label class="field"><span class="label">Monthly contribution</span><input class="num" inputmode="decimal" data-gid="${esc(g.id)}" data-f="monthly" value="${g.monthly || ""}" placeholder="0"></label>
        <label class="field"><span class="label">Growth % a year</span><input class="num" inputmode="decimal" data-gid="${esc(g.id)}" data-f="growth" value="${g.growth || ""}" placeholder="0"></label>
        <label class="field" style="grid-column:1/-1"><span class="label">Target date</span><input type="date" data-gid="${esc(g.id)}" data-f="deadline" value="${esc(g.deadline || "")}"></label></div></div>`).join("")}
      <p class="note">Growth is for invested money only (for example an index fund). It is an assumption, not a promise; leave it at 0 for cash.</p>
      <button class="add" data-addgoal="1">+ Add goal</button>`;
  } else if (tab === "fx") {
    body.innerHTML = `<p class="note">How many QAR one unit of each currency is worth. Each entry keeps the rate from the day you logged it, so changing these never rewrites history.</p>
      ${Object.entries(D.fx).map(([k, v]) => `<div class="erow"><input value="${esc(k)}" disabled aria-label="Currency code"><input class="num" inputmode="decimal" data-fx="${esc(k)}" value="${v}" ${k === "QAR" ? "disabled" : ""} aria-label="QAR per ${esc(k)}">
        ${k === "QAR" ? "<span></span>" : `<button class="rm" data-rmfx="${esc(k)}" aria-label="Remove ${esc(k)}">×</button>`}</div>`).join("")}
      <div class="erow"><input id="newCur" maxlength="3" placeholder="Code, e.g. SAR" aria-label="New currency code"><input id="newRate" class="num" inputmode="decimal" placeholder="QAR per unit" aria-label="Rate"><button class="rm" id="addFx" aria-label="Add currency" style="color:var(--accent)">+</button></div>
      <p class="note">${esc(D.fxNote || "")}</p>
      <label class="field"><span class="label">Budget period starts on day</span><select id="cycStart">${Array.from({ length: 28 }, (_, i) => `<option ${i + 1 === Number(D.cycleStart || 1) ? "selected" : ""}>${i + 1}</option>`).join("")}</select></label>
      <p class="note">Set this to your payday if you budget from salary to salary.</p>
      <label class="field"><span class="label">Accounts (comma separated)</span><input id="accts" value="${esc((D.accounts || []).join(", "))}"></label>
      <label class="field"><span class="label">Theme</span><select id="theme"><option value="">Match device</option><option value="light" ${D.theme === "light" ? "selected" : ""}>Light</option><option value="dark" ${D.theme === "dark" ? "selected" : ""}>Dark</option></select></label>`;
  } else {
    const n = liveTx().length;
    body.innerHTML = `<div class="callout"><b>Your data lives only on this device.</b> Nothing is sent anywhere. If you clear browser data or lose this phone, entries since your last backup are gone, so back up every week or two.</div>
      <div class="data-actions">
        <button class="btn ghost" id="exportJson">Download backup</button>
        <label class="btn ghost file-btn">Import backup<input type="file" id="importJson" accept="application/json,.json"></label>
        <button class="btn ghost" id="exportCsv">Export CSV</button>
      </div>
      <p class="note">Importing merges a backup into this device: new entries are added, edited ones take the newest version, deletions carry over. Use it to move entries between your phone and laptop.</p>
      <p class="note">${n} entr${n === 1 ? "y" : "ies"} on this device.</p>`;
  }
}
$("#setBody").addEventListener("input", e => {
  const t = e.target;
  if (t.dataset.id) { const c = D.categories.find(x => x.id === t.dataset.id); if (c) c[t.dataset.f] = t.dataset.f === "budget" ? num(t.value) : t.value; }
  if (t.dataset.gid) { const g = D.goals.find(x => x.id === t.dataset.gid); if (g) g[t.dataset.f] = ["target", "start", "monthly", "growth"].includes(t.dataset.f) ? num(t.value) : t.value; }
  if (t.dataset.fx) { const v = parseFloat(t.value); if (v > 0) D.fx[t.dataset.fx] = v; }
  if (t.id === "accts") D.accounts = t.value.split(",").map(s => s.trim()).filter(Boolean);
  if (t.id === "savTarget") D.savingsTarget = num(t.value);
  if (t.dataset.rid) {
    const r = D.recurring.find(x => x.id === t.dataset.rid); if (!r) return;
    const f = t.dataset.f;
    r[f] = f === "amount" ? num(t.value) : f === "every" ? Number(t.value) : t.value;
    if (f === "kind") { r.cat = (r.kind === "saving" ? D.goals : D.categories.filter(c => c.kind === r.kind))[0]?.id || ""; renderSet(); }
  }
  if (t.dataset.sid) {
    const sc = D.scenarios.find(x => x.id === t.dataset.sid); if (!sc) return;
    if (t.dataset.iid) {
      const it = sc.items.find(x => x.id === t.dataset.iid); if (!it) return;
      it[t.dataset.f] = t.dataset.f === "amount" ? (parseFloat(String(t.value).replace(/,/g, "")) || 0) : t.value;
      if (t.dataset.f === "type") renderSet();
    } else sc.name = t.value;
  }
});
$("#setBody").addEventListener("change", async e => {
  const t = e.target;
  if (t.id === "cycStart") D.cycleStart = Number(t.value);
  if (t.id === "theme") D.theme = t.value;
  if (t.id === "importJson" && t.files?.[0]) await importBackup(t.files[0]);
});
$("#setBody").addEventListener("click", e => {
  const t = e.target.closest("button"); if (!t) return;
  if (t.dataset.rm) { D.categories = D.categories.filter(c => c.id !== t.dataset.rm); renderSet(); }
  else if (t.dataset.rmg) { D.goals = D.goals.filter(g => g.id !== t.dataset.rmg); renderSet(); }
  else if (t.dataset.rmfx) { delete D.fx[t.dataset.rmfx]; renderSet(); }
  else if (t.dataset.addcat) { D.categories.push({ id: "c" + uid(), name: "New category", kind: t.dataset.addcat, budget: 0 }); renderSet(); }
  else if (t.dataset.addrec) {
    const inc = D.categories.find(c => c.kind === "income");
    D.recurring.push({ id: "r" + uid(), name: "", kind: "income", cat: inc?.id || "", amount: 0, cur: "QAR", every: 1, start: C.iso(new Date()).slice(0, 7) }); renderSet();
  }
  else if (t.dataset.rmr) { D.recurring = D.recurring.filter(r => r.id !== t.dataset.rmr); renderSet(); }
  else if (t.dataset.addsc) { D.scenarios.push({ id: "s" + uid(), name: "New what-if", items: [] }); renderSet(); }
  else if (t.dataset.rms) { D.scenarios = D.scenarios.filter(x => x.id !== t.dataset.rms); renderSet(); }
  else if (t.dataset.additem) {
    const sc = D.scenarios.find(x => x.id === t.dataset.additem);
    sc.items.push({ id: "i" + uid(), type: "monthly", label: "", amount: 0, start: C.addMonths(C.iso(new Date()).slice(0, 7), 1), end: "" }); renderSet();
  }
  else if (t.dataset.rmi) { const sc = D.scenarios.find(x => x.id === t.dataset.sid); sc.items = sc.items.filter(i => i.id !== t.dataset.rmi); renderSet(); }
  else if (t.dataset.addgoal) { D.goals.push({ id: "g" + uid(), name: "New goal", target: 0, start: 0, monthly: 0, growth: 0, deadline: "" }); renderSet(); }
  else if (t.id === "addFx") {
    const code = $("#newCur").value.trim().toUpperCase(), v = parseFloat($("#newRate").value);
    if (/^[A-Z]{3}$/.test(code) && v > 0) { D.fx[code] = v; renderSet(); } else $("#setNote").textContent = "Use a 3-letter code and a rate above 0.";
  }
  else if (t.id === "exportCsv") download(`riyal-ledger-${C.iso(new Date())}.csv`, C.toCsv(S.tx, catName), "text/csv");
  else if (t.id === "exportJson") download(`riyal-ledger-backup-${C.iso(new Date())}.json`,
    JSON.stringify({ app: "riyal-ledger", version: 1, exported: new Date().toISOString(), settings: S.settings, tx: S.tx }), "application/json");
});
document.querySelector(".tabs").addEventListener("click", e => { const b = e.target.closest("button"); if (b) { tab = b.dataset.tab; renderSet(); } });
$("#setClose").onclick = () => $("#setDlg").close();
$("#setSave").onclick = async () => {
  D.categories.forEach(c => { c.name = String(c.name || "").trim() || "Untitled"; c.budget = Number(c.budget) || 0; });
  D.goals.forEach(g => { g.name = String(g.name || "").trim() || "Untitled goal"; });
  D.recurring = D.recurring.filter(r => String(r.name || "").trim() || Number(r.amount) > 0).map(r => ({ ...r, name: String(r.name || "").trim() || "Untitled" }));
  D.scenarios.forEach(sc => { sc.name = String(sc.name || "").trim() || "What-if"; sc.items = sc.items.filter(i => Number(i.amount) && i.start); });
  try { await store.saveSettings(D); S.settings = normalise(await store.getSettings()); if (!S.settings.scenarios.some(x => x.id === S.scenarioId)) S.scenarioId = ""; applyTheme(); $("#setDlg").close(); toast("Settings saved"); render(); }
  catch (err) { console.error(err); $("#setNote").textContent = "Couldn't save on this device."; }
};

function download(name, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = Object.assign(document.createElement("a"), { href: url, download: name });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
async function importBackup(file) {
  try {
    const data = JSON.parse(await file.text());
    if (data?.app !== "riyal-ledger" || !Array.isArray(data.tx)) throw new Error("not a backup");
    const { list, added, changed } = C.mergeTx(S.tx, data.tx);
    await store.putManyTx(list);
    if (data.settings && String(data.settings.updated || "") > String(S.settings.updated || "")) {
      await store.saveSettings(data.settings); S.settings = normalise(await store.getSettings()); D = structuredClone(S.settings); applyTheme();
    }
    await reloadTx(); renderSet();
    $("#setNote").textContent = `Imported: ${added} new, ${changed} updated.`;
  } catch (err) {
    console.error(err);
    $("#setNote").textContent = "That file isn't a Riyal Ledger backup.";
  }
}

/* ---------- page events ---------- */
$("#app").addEventListener("click", e => {
  const b = e.target.closest("button"); if (!b) return;
  if (b.dataset.cat) { S.selCat = S.selCat === b.dataset.cat ? null : b.dataset.cat; render(); }
  else if (b.dataset.tx) { const x = S.tx.find(t => t.id === b.dataset.tx); if (x) openTx(x); }
  else if (b.dataset.act === "budgets") openSettings("budgets");
  else if (b.dataset.act === "goals") openSettings("goals");
  else if (b.dataset.act === "plan") openSettings("plan");
  else if (b.dataset.act === "scenarios") openSettings("scenarios");
  else if (b.dataset.hz) { S.horizon = Number(b.dataset.hz); render(); }
  else if (b.dataset.log) logRecurring(b.dataset.log);
  else if (b.dataset.act === "clearcat") { S.selCat = null; render(); }
  else if (b.dataset.act === "more") { S.showAll = !S.showAll; render(); }
  else if (b.dataset.act === "install" && S.installEvt) { S.installEvt.prompt(); S.installEvt = null; render(); }
});
$("#app").addEventListener("change", e => { if (e.target.id === "scSel") { S.scenarioId = e.target.value; render(); } });
async function logRecurring(id) {
  const r = S.settings.recurring.find(x => x.id === id); if (!r) return;
  const p = periodFor(S.offset);
  const today = C.iso(new Date());
  const date = today >= p.s && today < p.e ? today : p.s;
  const now = new Date().toISOString();
  const q = C.toQar(r.amount, r.cur || "QAR", S.settings.fx);
  if (Number.isNaN(q)) return toast(`No rate for ${r.cur}. Add it under Currencies.`);
  await store.putTx({ id: uid(), date, kind: r.kind, cat: r.cat, amount: Number(r.amount), cur: r.cur || "QAR", qar: q,
    account: (S.settings.accounts || [])[0] || "", note: r.name, rec: r.id, created: now, updated: now });
  toast(`Logged ${r.name}: QAR ${fmt2(q)}. Tap the entry to adjust the amount.`);
  await reloadTx();
}
$("#fab").onclick = () => openTx();
$("#openSettings").onclick = () => openSettings();
$("#prev").onclick = () => { S.offset -= 1; S.showAll = false; render(); };
$("#next").onclick = () => { if (S.offset < 0) { S.offset += 1; S.showAll = false; render(); } };
window.addEventListener("beforeinstallprompt", e => { e.preventDefault(); S.installEvt = e; render(); });
// Re-render when the app comes back to the front, so "today" and the period stay current.
document.addEventListener("visibilitychange", () => { if (!document.hidden && S.settings) render(); });

if ("serviceWorker" in navigator && location.protocol === "https:") {
  navigator.serviceWorker.register("sw.js").catch(err => console.warn("Offline mode unavailable", err));
}
boot();
