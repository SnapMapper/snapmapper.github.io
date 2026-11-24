// Small SVG chart kit for the dashboard and case list. No libraries: everything is drawn here,
// so nothing is fetched from anywhere. Colours come from CSS classes (p-*, ph-*), not inline
// styles, so the strict Content-Security-Policy holds and the theme lives in app.css.
//
// Mark rules (from the dataviz method): bars <= 24px with a 4px rounded data end and a square
// baseline; a 2px surface gap between touching marks; dots >= 8px with a 2px surface ring;
// solid hairline grid; text in text colours, never in the series colour; every mark has a tap
// target larger than itself and a tooltip; a legend for two or more series.

import { h } from './ui.js';
import { PROCEDURES, PHASES } from './model.js';

const NS = 'http://www.w3.org/2000/svg';

export function s(tag, attrs, ...children) {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs ?? {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.setAttribute('class', Array.isArray(v) ? v.filter(Boolean).join(' ') : v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, String(v));
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

/** CSS class carrying a procedure's colour: 'Focal Cryo' → 'p-focal-cryo'. */
export function procClass(p) {
  return `p-${String(p).toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
}

/** Round up to a clean axis maximum and return evenly spaced ticks. */
export function niceScale(max, count = 4) {
  if (!(max > 0)) return { max: 1, ticks: [0, 1] };
  const raw = max / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((st) => st >= raw);
  const top = Math.ceil(max / step) * step;
  const ticks = [];
  for (let v = 0; v <= top + step / 2; v += step) ticks.push(Math.round(v * 100) / 100);
  return { max: top, ticks };
}

export function fmtMin(min) {
  if (min == null || !Number.isFinite(min)) return '—';
  const m = Math.round(min);
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}`;
}

/** Path for a vertical bar with a rounded top and a square base. */
function colPath(x, y, w, hgt, r = 4) {
  const rr = Math.min(r, w / 2, hgt);
  return `M${x},${y + hgt}V${y + rr}Q${x},${y} ${x + rr},${y}H${x + w - rr}Q${x + w},${y} ${x + w},${y + rr}V${y + hgt}Z`;
}

// ---- Tooltip: one per chart card, shown on tap / hover / focus ----

export function tooltip(card) {
  const tip = h('div', { class: 'viz-tip', role: 'status', hidden: true });
  card.append(tip);
  let owner = null;
  const hide = () => { tip.hidden = true; owner?.classList.remove('is-hot'); owner = null; };
  const show = (target, rows, action) => {
    owner?.classList.remove('is-hot');
    owner = target;
    target.classList.add('is-hot');
    const parts = rows.map((r) => h('div', { class: 'viz-tip-row' },
      r.key ? h('span', { class: ['viz-key', r.key] }) : null,
      h('span', { class: 'viz-tip-value' }, r.value),
      r.label ? h('span', { class: 'viz-tip-label' }, r.label) : null));
    if (action) parts.push(h('button', { type: 'button', class: 'btn viz-tip-btn', onclick: action.onClick }, action.label));
    tip.replaceChildren(...parts);
    tip.hidden = false;
    const cb = card.getBoundingClientRect();
    const tb = target.getBoundingClientRect();
    const tw = tip.offsetWidth;
    let left = tb.left - cb.left + tb.width / 2 - tw / 2;
    left = Math.max(8, Math.min(left, cb.width - tw - 8));
    let top = tb.top - cb.top - tip.offsetHeight - 8;
    if (top < 4) top = tb.bottom - cb.top + 8;
    tip.style.left = `${left}px`;
    tip.style.top = `${top}px`;
  };
  card.addEventListener('pointerdown', (e) => {
    if (!e.target.closest('.viz-hit') && !e.target.closest('.viz-tip')) hide();
  });
  return { show, hide };
}

/** Make an SVG element a tap / hover / keyboard target that opens the tooltip. */
function hit(el, tip, rows, action) {
  el.setAttribute('tabindex', '0');
  el.setAttribute('role', 'img');
  el.setAttribute('aria-label', rows().map((r) => `${r.label ?? ''} ${r.value}`.trim()).join(', '));
  el.classList.add('viz-hit');
  const open = () => tip.show(el, rows(), action);
  el.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') open(); });
  el.addEventListener('click', open);
  el.addEventListener('focus', open);
  return el;
}

export function legend(items) {
  return h('div', { class: 'viz-legend' }, items.map((it) => h('span', { class: 'viz-legend-item' },
    h('span', { class: ['viz-key', it.key, it.line && 'viz-key-line'] }), it.label)));
}

/**
 * A card holding one chart: title, optional controls, legend, the chart and its tooltip.
 * draw(fn) renders the chart at the card's real width (1 SVG unit = 1 px, so text stays the size
 * it was designed at), and again whenever that width changes, e.g. when the iPad rotates.
 */
export function chartCard({ title, subtitle, controls, legendItems, cls }) {
  const body = h('div', { class: 'viz-body' });
  const card = h('section', { class: ['card', 'viz-card', cls] },
    h('div', { class: 'viz-head' },
      h('div', null, h('h3', { class: 'viz-title' }, title), subtitle ? h('div', { class: 'viz-sub' }, subtitle) : null),
      controls ?? null),
    legendItems ? legend(legendItems) : null,
    body);
  const tip = tooltip(card);
  const draw = (fn) => {
    let lastW = 0;
    const paint = (w) => {
      const W = Math.max(300, Math.round(w));
      if (Math.abs(W - lastW) < 2) return;
      lastW = W;
      tip.hide();
      body.replaceChildren(fn(W));
    };
    if (typeof ResizeObserver === 'function') {
      new ResizeObserver((entries) => paint(entries[0].contentRect.width)).observe(body);
    } else {
      requestAnimationFrame(() => paint(body.clientWidth || 640));
    }
  };
  return { card, body, tip, draw };
}

// ---- Stacked columns: cases per month by procedure ----

export function stackedColumns({ tip, buckets, series, height = 210, W = 640 }) {
  // buckets: [{ label, long, values: { [series]: n } }]
  const H = height;
  const pad = { l: 34, r: 8, t: 18, b: 26 };
  const totals = buckets.map((b) => series.reduce((a, k) => a + (b.values[k] ?? 0), 0));
  const { max, ticks } = niceScale(Math.max(1, ...totals), 4);
  const iw = W - pad.l - pad.r;
  const ih = H - pad.t - pad.b;
  const band = iw / buckets.length;
  const bw = Math.min(24, band * 0.62);
  const y = (v) => pad.t + ih - (v / max) * ih;
  const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, class: 'viz-svg', role: 'group' });
  ticks.forEach((t) => {
    svg.append(s('line', { x1: pad.l, x2: W - pad.r, y1: y(t), y2: y(t), class: t === 0 ? 'viz-base' : 'viz-grid' }));
    svg.append(s('text', { x: pad.l - 8, y: y(t) + 4, class: 'viz-tick', 'text-anchor': 'end' }, t));
  });
  const peak = totals.indexOf(Math.max(...totals));
  buckets.forEach((b, i) => {
    const cx = pad.l + band * i + band / 2;
    const x = cx - bw / 2;
    let acc = 0;
    const present = series.filter((k) => (b.values[k] ?? 0) > 0);
    present.forEach((k, j) => {
      const v = b.values[k];
      const y0 = y(acc);
      const y1 = y(acc + v);
      const top = j === present.length - 1;
      const gap = j > 0 ? 2 : 0; // 2px surface gap between stacked segments
      const hgt = Math.max(0, y0 - y1 - gap);
      svg.append(top
        ? s('path', { d: colPath(x, y1, bw, hgt), class: ['viz-fill', procClass(k)] })
        : s('rect', { x, y: y1, width: bw, height: hgt, class: ['viz-fill', procClass(k)] }));
      acc += v;
    });
    // Selective labels: the latest month and the busiest one.
    if (totals[i] > 0 && (i === buckets.length - 1 || i === peak)) {
      svg.append(s('text', { x: cx, y: y(totals[i]) - 6, class: 'viz-val', 'text-anchor': 'middle' }, totals[i]));
    }
    const every = buckets.length > 12 ? 2 : 1;
    if (i % every === 0 || i === buckets.length - 1) {
      svg.append(s('text', { x: cx, y: H - 8, class: 'viz-tick', 'text-anchor': 'middle' }, b.label));
    }
    svg.append(hit(s('rect', { x: pad.l + band * i, y: pad.t, width: band, height: ih, class: 'viz-hitbox' }), tip, () => [
      { value: `${totals[i]} case${totals[i] === 1 ? '' : 's'}`, label: b.long },
      ...series.filter((k) => b.values[k]).map((k) => ({ key: procClass(k), value: b.values[k], label: k })),
    ]));
  });
  return svg;
}

// ---- Strip plot: one dot per case along a minutes axis, one row per procedure ----

export function stripPlot({ tip, rows, onOpen, W = 640 }) {
  // rows: [{ label, series, points: [{ value, title, id }], median }]
  const rowH = 46;
  const pad = { l: 96, r: 16, t: 8, b: 28 };
  const H = pad.t + rows.length * rowH + pad.b;
  const all = rows.flatMap((r) => r.points.map((p) => p.value));
  const { max, ticks } = niceScale(Math.max(1, ...all), 5);
  const iw = W - pad.l - pad.r;
  const x = (v) => pad.l + (Math.max(0, v) / max) * iw;
  const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, class: 'viz-svg', role: 'group' });
  ticks.forEach((t) => {
    svg.append(s('line', { x1: x(t), x2: x(t), y1: pad.t, y2: H - pad.b, class: 'viz-grid' }));
    svg.append(s('text', { x: x(t), y: H - 8, class: 'viz-tick', 'text-anchor': 'middle' }, t));
  });
  rows.forEach((r, i) => {
    const cy = pad.t + rowH * i + rowH / 2;
    svg.append(s('text', { x: 0, y: cy + 5, class: 'viz-row-label' }, r.label));
    svg.append(s('line', { x1: pad.l, x2: W - pad.r, y1: cy, y2: cy, class: 'viz-grid' }));
    r.points.forEach((p, j) => {
      // Spread overlapping dots vertically, deterministically (no randomness between renders).
      const jitter = ((j * 7919) % 13) - 6;
      const g = s('g', null,
        s('circle', { cx: x(p.value), cy: cy + jitter, r: 12, class: 'viz-hitbox' }),
        s('circle', { cx: x(p.value), cy: cy + jitter, r: 5, class: ['viz-dot', procClass(r.series)] }));
      svg.append(hit(g, tip, () => [
        { key: procClass(r.series), value: fmtMin(p.value), label: p.title },
      ], onOpen ? { label: 'Open case', onClick: () => onOpen(p.id) } : null));
    });
    if (r.median != null) {
      const mx = x(r.median);
      svg.append(s('line', { x1: mx, x2: mx, y1: cy - 15, y2: cy + 15, class: 'viz-median' }));
      svg.append(s('text', { x: mx, y: cy - 18, class: 'viz-val', 'text-anchor': 'middle' }, fmtMin(r.median)));
    }
  });
  return svg;
}

// ---- Segmented bars: where the time goes, median minutes per phase ----

export function phaseBars({ tip, rows, W = 640 }) {
  // rows: [{ label, phases: { [key]: minutes|null }, n }]
  const rowH = 44;
  const pad = { l: 96, r: 70, t: 4, b: 4 };
  const H = pad.t + rows.length * rowH + pad.b;
  const sums = rows.map((r) => PHASES.reduce((a, ph) => a + (r.phases[ph.key] ?? 0), 0));
  const maxSum = Math.max(1, ...sums);
  const iw = W - pad.l - pad.r;
  const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, class: 'viz-svg', role: 'group' });
  rows.forEach((r, i) => {
    const y = pad.t + rowH * i + 8;
    const bh = 28;
    svg.append(s('text', { x: 0, y: y + bh / 2 + 5, class: 'viz-row-label' }, r.label));
    let x = pad.l;
    PHASES.forEach((ph) => {
      const v = r.phases[ph.key];
      if (!(v > 0)) return;
      const w = Math.max(2, (v / maxSum) * iw - 2); // 2px surface gap between blocks
      const g = s('g', null,
        s('rect', { x, y, width: w, height: bh, rx: 4, class: ['viz-fill', `ph-${ph.key}`] }));
      const label = `${Math.round(v)}`;
      if (w >= label.length * 8 + 12) {
        g.append(s('text', { x: x + 6, y: y + bh / 2 + 5, class: ['viz-in', `ph-in-${ph.key}`] }, label));
      }
      svg.append(hit(g, tip, () => [
        { key: `ph-${ph.key}`, value: fmtMin(v), label: `${ph.name} (${ph.long})` },
        { value: `median of ${r.n} case${r.n === 1 ? '' : 's'}`, label: r.label },
      ]));
      x += w + 2;
    });
    svg.append(s('text', { x: x + 6, y: y + bh / 2 + 5, class: 'viz-val' }, fmtMin(sums[i])));
  });
  return svg;
}

// ---- Simple columns: one series, e.g. cases by weekday ----

export function columns({ tip, buckets, keyClass, height = 170, note, W = 640 }) {
  // buckets: [{ label, value, detail }]
  const H = height;
  const pad = { l: 34, r: 8, t: 18, b: note ? 44 : 26 };
  const { max, ticks } = niceScale(Math.max(1, ...buckets.map((b) => b.value)), 3);
  const iw = W - pad.l - pad.r;
  const ih = H - pad.t - pad.b;
  const band = iw / buckets.length;
  const bw = Math.min(24, band * 0.5);
  const y = (v) => pad.t + ih - (v / max) * ih;
  const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, class: 'viz-svg', role: 'group' });
  ticks.forEach((t) => {
    svg.append(s('line', { x1: pad.l, x2: W - pad.r, y1: y(t), y2: y(t), class: t === 0 ? 'viz-base' : 'viz-grid' }));
    svg.append(s('text', { x: pad.l - 8, y: y(t) + 4, class: 'viz-tick', 'text-anchor': 'end' }, t));
  });
  const peak = buckets.reduce((m, b, i) => (b.value > buckets[m].value ? i : m), 0);
  buckets.forEach((b, i) => {
    const cx = pad.l + band * i + band / 2;
    if (b.value > 0) {
      svg.append(s('path', { d: colPath(cx - bw / 2, y(b.value), bw, y(0) - y(b.value)), class: ['viz-fill', keyClass] }));
      if (i === peak) svg.append(s('text', { x: cx, y: y(b.value) - 6, class: 'viz-val', 'text-anchor': 'middle' }, b.value));
    }
    svg.append(s('text', { x: cx, y: H - (note ? 26 : 8), class: 'viz-tick viz-tick-strong', 'text-anchor': 'middle' }, b.label));
    if (note) svg.append(s('text', { x: cx, y: H - 8, class: 'viz-tick', 'text-anchor': 'middle' }, note(b)));
    svg.append(hit(s('rect', { x: pad.l + band * i, y: pad.t, width: band, height: ih, class: 'viz-hitbox' }), tip, () => [
      { key: keyClass, value: `${b.value} case${b.value === 1 ? '' : 's'}`, label: b.label },
      ...(b.detail ? [{ value: b.detail }] : []),
    ]));
  });
  return svg;
}

// ---- Sparkline: monthly medians in a stat tile ----

export function sparkline(values) {
  const pts = values.map((v, i) => [i, v]).filter(([, v]) => v != null);
  if (pts.length < 2) return null;
  const W = 120;
  const H = 32;
  const vs = pts.map(([, v]) => v);
  const lo = Math.min(...vs);
  const hi = Math.max(...vs);
  const span = hi - lo || 1;
  const x = (i) => 4 + (i / Math.max(1, values.length - 1)) * (W - 8);
  const y = (v) => 4 + (1 - (v - lo) / span) * (H - 8);
  const d = pts.map(([i, v], k) => `${k ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('');
  const [li, lv] = pts.at(-1);
  return s('svg', { viewBox: `0 0 ${W} ${H}`, class: 'viz-spark', 'aria-hidden': 'true' },
    s('path', { d, class: 'viz-spark-line' }),
    s('circle', { cx: x(li), cy: y(lv), r: 3.5, class: 'viz-spark-end' }));
}

/** Thin segmented bar (8px) for a part-to-whole, e.g. the procedure mix or one case's phases. */
export function thinBar(parts, { width = 100 } = {}) {
  const total = parts.reduce((a, p) => a + (p.value > 0 ? p.value : 0), 0);
  const bar = h('div', { class: 'viz-thin' });
  if (!total) return bar;
  for (const p of parts) {
    if (!(p.value > 0)) continue;
    const seg = h('span', { class: ['viz-thin-seg', p.key], title: p.title ?? null });
    seg.style.flexGrow = String(p.value / total);
    bar.append(seg);
  }
  bar.style.width = `${width}%`;
  return bar;
}

export const PROCEDURE_KEYS = PROCEDURES.map((p) => ({ key: procClass(p), label: p }));
