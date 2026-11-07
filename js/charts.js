// Hand-built SVG charts sized to their container, with hover and tap tooltips.
import { MON, fmt0, kfmt, niceMax, signed } from "./calc.js";

const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const DAY = 864e5;
const dayLabel = d => d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });

function placeTip(tip, x, W, top) {
  tip.hidden = false;
  tip.style.left = Math.min(W - 80, Math.max(80, x)) + "px";
  tip.style.top = top + "px";
}

/** Cumulative spend through the period against an even pace to the budget. */
export function drawPace(el, p, { daily, cum }, budget) {
  if (!el) return;
  const W = Math.max(280, el.clientWidth), H = 210, L = 44, R = 12, T = 12, B = 26;
  const run = cum.length ? cum[cum.length - 1] : 0;
  const ymax = niceMax(Math.max(budget, run, 1) * 1.05);
  const x = i => L + (W - L - R) * (i / Math.max(1, p.days - 1));
  const y = v => T + (H - T - B) * (1 - v / ymax);
  const ticks = [0, ymax / 2, ymax];
  let s = `<svg width="${W}" height="${H}" role="img" aria-label="Cumulative spending through the period compared with an even pace to the budget">`;
  s += `<g class="grid">${ticks.map(v => `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}"/>`).join("")}</g>`;
  s += `<g class="axis">${ticks.map(v => `<text x="${L - 8}" y="${y(v) + 4}" text-anchor="end">${kfmt(v)}</text>`).join("")}`;
  const xt = [0, Math.floor((p.days - 1) / 2), p.days - 1];
  s += xt.map(i => {
    const d = new Date(p.start.getFullYear(), p.start.getMonth(), p.start.getDate() + i);
    return `<text x="${x(i)}" y="${H - 6}" text-anchor="${i === 0 ? "start" : i === p.days - 1 ? "end" : "middle"}">${d.getDate()} ${MON[d.getMonth()]}</text>`;
  }).join("") + `</g>`;
  if (budget) s += `<path class="l-pace" d="M${x(0)},${y(0)} L${x(p.days - 1)},${y(budget)}"/>`;
  if (cum.length) {
    const pts = cum.map((v, i) => `${x(i)},${y(v)}`);
    s += `<path class="a-spent" d="M${x(0)},${y(0)} L${pts.join(" L")} L${x(cum.length - 1)},${y(0)} Z"/>`;
    s += `<path class="l-spent" d="M${pts.join(" L")}"/>`;
    const li = cum.length - 1;
    s += `<circle class="dot" cx="${x(li)}" cy="${y(cum[li])}" r="5"/>`;
    s += `<text class="lbl" x="${Math.min(x(li), W - R - 4)}" y="${Math.max(T + 10, y(cum[li]) - 12)}" text-anchor="${x(li) > W - 90 ? "end" : "middle"}">${fmt0(cum[li])}</text>`;
  }
  if (budget) s += `<text class="lbl" x="${W - R}" y="${Math.max(T + 10, y(budget) - 8)}" text-anchor="end" style="fill:var(--ink-3);font-weight:500">Budget ${fmt0(budget)}</text>`;
  s += `<line class="xhair" x1="0" x2="0" y1="${T}" y2="${H - B}" visibility="hidden"/>`;
  s += `<rect class="hit" x="${L}" y="${T}" width="${W - L - R}" height="${H - T - B}" fill="transparent"/></svg><div class="tip" hidden></div>`;
  el.innerHTML = s;
  const hit = el.querySelector(".hit"), tip = el.querySelector(".tip"), xh = el.querySelector(".xhair");
  const move = ev => {
    const r = el.getBoundingClientRect();
    const i = Math.max(0, Math.min(p.days - 1, Math.round((ev.clientX - r.left - L) / (W - L - R) * (p.days - 1))));
    const d = new Date(p.start.getFullYear(), p.start.getMonth(), p.start.getDate() + i);
    xh.setAttribute("x1", x(i)); xh.setAttribute("x2", x(i)); xh.setAttribute("visibility", "visible");
    const spent = i < cum.length
      ? `<div class="row">Spent so far <b class="num">QAR ${fmt0(cum[i])}</b></div><div class="row">That day <span class="num">QAR ${fmt0(daily[i])}</span></div>`
      : `<div class="row">Not reached yet</div>`;
    const even = budget ? `<div class="row">Even pace <span class="num">QAR ${fmt0(budget * (i + 1) / p.days)}</span></div>` : "";
    tip.innerHTML = `<div><b>${dayLabel(d)}</b></div>${spent}${even}`;
    placeTip(tip, x(i), W, T);
  };
  hit.addEventListener("pointermove", move);
  hit.addEventListener("pointerdown", move);
  hit.addEventListener("pointerleave", () => { tip.hidden = true; xh.setAttribute("visibility", "hidden"); });
}

/** Income, spent and saved for the last few periods, grouped bars. */
export function drawTrend(el, data) {
  if (!el) return;
  const W = Math.max(280, el.clientWidth), H = 210, L = 44, R = 8, T = 12, B = 26;
  const ymax = niceMax(Math.max(1, ...data.flatMap(({ t }) => [t.income, t.spent, t.saved])) * 1.05);
  const y = v => T + (H - T - B) * (1 - v / ymax);
  const gw = (W - L - R) / data.length, bw = Math.max(5, Math.min(18, (gw - 14) / 3 - 2));
  const ticks = [0, ymax / 2, ymax];
  const bar = (x0, v, cls) => {
    if (v <= 0) return "";
    const top = y(v), bot = y(0), r = Math.min(4, bw / 2, bot - top);
    return `<path class="${cls}" d="M${x0},${bot} V${top + r} Q${x0},${top} ${x0 + r},${top} H${x0 + bw - r} Q${x0 + bw},${top} ${x0 + bw},${top + r} V${bot} Z"/>`;
  };
  let s = `<svg width="${W}" height="${H}" role="img" aria-label="Income, spending and saving for recent periods">`;
  s += `<g class="grid">${ticks.map(v => `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}"/>`).join("")}</g>`;
  s += `<g class="axis">${ticks.map(v => `<text x="${L - 8}" y="${y(v) + 4}" text-anchor="end">${kfmt(v)}</text>`).join("")}`;
  s += data.map(({ p }, i) => `<text x="${L + gw * i + gw / 2}" y="${H - 6}" text-anchor="middle" ${p.current ? 'style="fill:var(--ink);font-weight:500"' : ""}>${esc(p.short)}</text>`).join("") + `</g>`;
  data.forEach(({ t }, i) => {
    const x0 = L + gw * i + (gw - (bw * 3 + 4)) / 2;
    s += bar(x0, t.income, "f-income") + bar(x0 + bw + 2, t.spent, "f-spent") + bar(x0 + 2 * (bw + 2), t.saved, "f-saved");
  });
  s += data.map((_, i) => `<rect data-i="${i}" x="${L + gw * i}" y="${T}" width="${gw}" height="${H - T - B}" fill="transparent"/>`).join("");
  s += `</svg><div class="tip" hidden></div>`;
  el.innerHTML = s;
  const tip = el.querySelector(".tip");
  el.querySelectorAll("rect[data-i]").forEach(r => {
    const show = () => {
      const { p, t } = data[+r.dataset.i];
      tip.innerHTML = `<div><b>${esc(p.label)}</b></div>
        <div class="row"><i class="sw income"></i>Income <b class="num">${fmt0(t.income)}</b></div>
        <div class="row"><i class="sw spent"></i>Spent <b class="num">${fmt0(t.spent)}</b></div>
        <div class="row"><i class="sw saved"></i>Saved <b class="num">${fmt0(t.saved)}</b></div>
        <div class="row">Net <span class="num">${signed(t.net)}</span></div>`;
      placeTip(tip, L + gw * +r.dataset.i + gw / 2, W, T);
    };
    r.addEventListener("pointerenter", show);
    r.addEventListener("pointerdown", show);
    r.addEventListener("pointerleave", () => { tip.hidden = true; });
  });
}

/** Projected total savings by month: the plan, plus an optional what-if line. */
export function drawForecast(el, base, alt, altName, baseName = "Plan") {
  if (!el) return;
  const W = Math.max(280, el.clientWidth), H = 230, L = 48, R = 14, T = 16, B = 26;
  const pts = [{ label: "Now", v: base.start }].concat(base.rows.map(r => ({ label: MON[+r.key.slice(5) - 1], key: r.key, v: r.balance })));
  const apts = alt ? [{ v: alt.start }].concat(alt.rows.map(r => ({ v: r.balance }))) : null;
  const all = pts.map(p => p.v).concat(apts ? apts.map(p => p.v) : []);
  const lo = Math.min(0, ...all), hi = niceMax(Math.max(1, ...all) * 1.05);
  const ymin = lo < 0 ? -niceMax(-lo * 1.05) : 0;
  const n = pts.length - 1;
  const x = i => L + (W - L - R) * (i / n);
  const y = v => T + (H - T - B) * (1 - (v - ymin) / (hi - ymin));
  const ticks = ymin < 0 ? [ymin, 0, hi] : [0, hi / 2, hi];
  const step = n > 12 ? 4 : n > 6 ? 2 : 1;
  let s = `<svg width="${W}" height="${H}" role="img" aria-label="Projected savings balance by month">`;
  s += `<g class="grid">${ticks.map(v => `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}"/>`).join("")}</g>`;
  s += `<g class="axis">${ticks.map(v => `<text x="${L - 8}" y="${y(v) + 4}" text-anchor="end">${v < 0 ? "−" + kfmt(-v) : kfmt(v)}</text>`).join("")}`;
  s += pts.map((p, i) => (i % step === 0 || i === n) ? `<text x="${x(i)}" y="${H - 6}" text-anchor="${i === 0 ? "start" : i === n ? "end" : "middle"}">${esc(p.label)}</text>` : "").join("") + `</g>`;
  const line = arr => "M" + arr.map((p, i) => `${x(i)},${y(p.v)}`).join(" L");
  s += `<path class="a-saved" d="${line(pts)} L${x(n)},${y(Math.max(0, ymin))} L${x(0)},${y(Math.max(0, ymin))} Z"/>`;
  s += `<path class="l-saved" d="${line(pts)}"/>`;
  if (apts) s += `<path class="l-alt" d="${line(apts)}"/>`;
  s += `<circle class="dot dot-saved" cx="${x(n)}" cy="${y(pts[n].v)}" r="5"/>`;
  const lab = (v, yy, cls, text) => `<text class="lbl ${cls}" x="${W - R}" y="${yy}" text-anchor="end">${text} ${fmt0(v)}</text>`;
  const by = y(pts[n].v), ay = apts ? y(apts[n].v) : null;
  let bLab = by - 10, aLab = ay != null ? ay - 10 : null;
  if (aLab != null && Math.abs(aLab - bLab) < 14) { if (ay < by) { aLab = bLab - 14; } else { aLab = bLab + 26; } }
  s += lab(pts[n].v, Math.max(T + 10, bLab), "", esc(baseName));
  if (apts) s += lab(apts[n].v, Math.min(H - B - 4, Math.max(T + 10, aLab)), "alt", esc(altName || "What-if"));
  s += `<line class="xhair" x1="0" x2="0" y1="${T}" y2="${H - B}" visibility="hidden"/>`;
  s += `<rect class="hit" x="${L}" y="${T}" width="${W - L - R}" height="${H - T - B}" fill="transparent"/></svg><div class="tip" hidden></div>`;
  el.innerHTML = s;
  const hit = el.querySelector(".hit"), tip = el.querySelector(".tip"), xh = el.querySelector(".xhair");
  const move = ev => {
    const r = el.getBoundingClientRect();
    const i = Math.max(0, Math.min(n, Math.round((ev.clientX - r.left - L) / (W - L - R) * n)));
    xh.setAttribute("x1", x(i)); xh.setAttribute("x2", x(i)); xh.setAttribute("visibility", "visible");
    const row = i ? base.rows[i - 1] : null;
    const name = i ? `${MON[+row.key.slice(5) - 1]} ${row.key.slice(0, 4)}` : "Now";
    tip.innerHTML = `<div><b>${name}</b></div><div class="row"><i class="sw saved"></i>${esc(baseName)} <b class="num">QAR ${fmt0(pts[i].v)}</b></div>`
      + (apts ? `<div class="row"><i class="sw alt"></i>${esc(altName || "What-if")} <b class="num">QAR ${fmt0(apts[i].v)}</b></div>` : "")
      + (row ? `<div class="row">Month adds <span class="num">${signed(row.surplus)}</span></div>` : "");
    placeTip(tip, x(i), W, T);
  };
  hit.addEventListener("pointermove", move);
  hit.addEventListener("pointerdown", move);
  hit.addEventListener("pointerleave", () => { tip.hidden = true; xh.setAttribute("visibility", "hidden"); });
}

/** Net saved per period (deposits minus withdrawals), with the monthly target as a dashed line. */
export function drawSavedBars(el, data, target) {
  if (!el) return;
  const W = Math.max(280, el.clientWidth), H = 200, L = 44, R = 8, T = 14, B = 26;
  const vals = data.map(d => d.net);
  const hi = niceMax(Math.max(1, target || 0, ...vals) * 1.08);
  const minV = Math.min(0, ...vals);
  const lo = minV < 0 ? -niceMax(-minV * 1.08) : 0;
  const y = v => T + (H - T - B) * (1 - (v - lo) / (hi - lo));
  const gw = (W - L - R) / data.length, bw = Math.max(6, Math.min(26, gw * 0.55));
  const ticks = lo < 0 ? [lo, 0, hi] : [0, hi / 2, hi];
  let s = `<svg width="${W}" height="${H}" role="img" aria-label="Net amount saved each period">`;
  s += `<g class="grid">${ticks.map(v => `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}"/>`).join("")}</g>`;
  s += `<g class="axis">${ticks.map(v => `<text x="${L - 8}" y="${y(v) + 4}" text-anchor="end">${v < 0 ? "−" + kfmt(-v) : kfmt(v)}</text>`).join("")}`;
  s += data.map((d, i) => `<text x="${L + gw * i + gw / 2}" y="${H - 6}" text-anchor="middle" ${d.p.current ? 'style="fill:var(--ink);font-weight:500"' : ""}>${esc(d.p.short)}</text>`).join("") + `</g>`;
  data.forEach((d, i) => {
    const v = d.net; if (!v) return;
    const x0 = L + gw * i + (gw - bw) / 2, top = y(Math.max(0, v)), bot = y(Math.min(0, v)), r = Math.min(4, bw / 2, (bot - top) / 2);
    const cls = v < 0 ? "f-neg" : d.p.current ? "f-saved cur" : "f-saved";
    s += v >= 0
      ? `<path class="${cls}" d="M${x0},${bot} V${top + r} Q${x0},${top} ${x0 + r},${top} H${x0 + bw - r} Q${x0 + bw},${top} ${x0 + bw},${top + r} V${bot} Z"/>`
      : `<path class="${cls}" d="M${x0},${top} V${bot - r} Q${x0},${bot} ${x0 + r},${bot} H${x0 + bw - r} Q${x0 + bw},${bot} ${x0 + bw},${bot - r} V${top} Z"/>`;
  });
  if (target) s += `<line class="l-target" x1="${L}" x2="${W - R}" y1="${y(target)}" y2="${y(target)}"/><text class="lbl" x="${L + 6}" y="${y(target) - 6}" text-anchor="start" style="fill:var(--ink-3);font-weight:500">Target ${fmt0(target)}</text>`;
  s += data.map((_, i) => `<rect data-i="${i}" x="${L + gw * i}" y="${T}" width="${gw}" height="${H - T - B}" fill="transparent"/>`).join("");
  s += `</svg><div class="tip" hidden></div>`;
  el.innerHTML = s;
  const tip = el.querySelector(".tip");
  el.querySelectorAll("rect[data-i]").forEach(r => {
    const show = () => {
      const d = data[+r.dataset.i];
      tip.innerHTML = `<div><b>${esc(d.p.label)}</b></div><div class="row">Put in <b class="num">${fmt0(d.deposits)}</b></div>`
        + (d.withdrawals ? `<div class="row">Took out <span class="num">${fmt0(d.withdrawals)}</span></div>` : "")
        + `<div class="row">Net <b class="num">${signed(d.net)}</b></div>`;
      placeTip(tip, L + gw * +r.dataset.i + gw / 2, W, T);
    };
    r.addEventListener("pointerenter", show); r.addEventListener("pointerdown", show);
    r.addEventListener("pointerleave", () => { tip.hidden = true; });
  });
}
