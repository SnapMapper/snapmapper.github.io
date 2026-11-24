// Dashboard: how cases are going, at a glance, between cases (never during one).
// Filters in one row at the top scope everything below. Medians use ended cases only.
// Dates are weekday + month (see anonymising), so periods are whole months.

import {
  PROCEDURES, DURATIONS, PHASES, WEEKDAYS, DISEASES, SEDATIONS, summarize, median, stats, caseWhen, isoDay,
  monthLabel, attentionFor,
} from '../model.js';
import { summaryRows } from '../export-map.js';
import * as dir from '../directory.js';
import * as store from '../store.js';
import { h, segmented } from '../ui.js';
import {
  chartCard, stackedColumns, stripPlot, phaseBars, columns, sparkline, thinBar, legend,
  procClass, fmtMin,
} from '../charts.js';
import { caseRow, showNeedsAttention } from './cases.js';
import { exportReminder } from './data.js';

const PERIODS = [
  { key: '3', label: '3 months', months: 3 },
  { key: '6', label: '6 months', months: 6 },
  { key: '12', label: '12 months', months: 12 },
  { key: 'all', label: 'All time', months: null },
];

const METRICS = DURATIONS.filter((d) => ['roomTime', 'procedureTime', 'ablationTime', 'laDwell'].includes(d.key));
const TILE_LABEL = {
  roomTime: 'Median room time',
  procedureTime: 'Median procedure time',
  ablationTime: 'Median first → last ablation',
  laDwell: 'Median LA dwell',
  fluoro: 'Median fluoroscopy time',
};

const fmtSd = (sd) => (sd == null ? '' : ` ± ${sd < 10 ? sd.toFixed(1) : Math.round(sd)} min`);

// Filter state survives moving between screens.
let period = '6';
let procedure = 'all';
let stripMetric = 'roomTime';
// Extra filters, like the slicers in the data-feedback workbook. null = all.
const extra = { disease: null, sedation: null, site: null, operator: null };

// The tiles: four case times plus fluoroscopy, each as median with mean ± SD beside it.
const TILES = [
  ...['roomTime', 'procedureTime', 'laDwell', 'ablationTime'].map((k) => ({ key: k, value: (x) => x.durations[k] })),
  { key: 'fluoro', value: (x) => x.fluoroMinutes },
];

const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** 'YYYY-MM' for the month `offset` months before this one. */
function monthAt(offset) {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - offset);
  return isoDay(d.getTime()).slice(0, 7);
}

function monthsBack(n) {
  return Array.from({ length: n }, (_, i) => monthAt(n - 1 - i));
}

function monthsBetween(first, last) {
  const out = [];
  let [y, m] = first.split('-').map(Number);
  const [ly, lm] = last.split('-').map(Number);
  while ((y < ly || (y === ly && m <= lm)) && out.length < 60) {
    out.push(`${y}-${String(m).padStart(2, '0')}`);
    m += 1;
    if (m > 12) { m = 1; y += 1; }
  }
  return out;
}

export function render(ctx) {
  const everything = store.allCases().map((c) => {
    const sum = summarize(c, store.eventsOf(c.id));
    return { ...sum, when: caseWhen(c, sum.events) };
  });

  const filterRow = h('div', { class: 'viz-filters' },
    segmented(PERIODS.map((p) => ({ key: p.key, label: p.label })), period, (k) => { period = k; ctx.refresh(); }, 'seg-filter'),
    h('div', { class: 'chip-row', role: 'radiogroup', 'aria-label': 'Procedure type' },
      [{ key: 'all', label: 'All types' }, ...PROCEDURES.map((p) => ({ key: p, label: p }))].map((o) => h('button', {
        type: 'button', role: 'radio', 'aria-checked': String(o.key === procedure),
        class: ['chip', o.key === procedure && 'is-on'],
        onclick: () => { procedure = o.key; ctx.refresh(); },
      }, o.key !== 'all' ? h('span', { class: ['viz-key', procClass(o.key)] }) : null, o.label))));

  if (!everything.length) {
    return h('section', { class: 'screen dash' },
      h('h1', null, 'Dashboard'),
      h('div', { class: 'card empty' },
        h('h2', null, 'Your dashboard fills in as you log cases'),
        h('p', { class: 'muted' }, 'Case counts, median times by procedure type, where the time goes, and trends by month and weekday.'),
        h('button', { type: 'button', class: 'btn btn-big btn-primary', onclick: () => ctx.go('#/') }, 'Start a case')));
  }

  // ---- Slice the data ----
  const p = PERIODS.find((x) => x.key === period);
  const thisMonth = monthAt(0);
  const firstMonth = everything.map((x) => x.when.month).sort()[0] ?? thisMonth;
  const months = p.months ? monthsBack(p.months) : monthsBetween(firstMonth, thisMonth).slice(-24);
  const inMonths = (x, list) => list.includes(x.when.month);
  const prevMonths = p.months ? Array.from({ length: p.months }, (_, i) => monthAt(p.months * 2 - 1 - i)) : null;
  const byProc = (x) => (procedure === 'all' || x.case.procedure === procedure)
    && Object.entries(extra).every(([k, v]) => v == null || x.case[k] === v);

  const cur = everything.filter((x) => byProc(x) && (p.months ? inMonths(x, months) : true));
  const prev = prevMonths ? everything.filter((x) => byProc(x) && inMonths(x, prevMonths)) : [];
  const ended = cur.filter((x) => x.case.status === 'ended');
  const prevEnded = prev.filter((x) => x.case.status === 'ended');
  const procs = PROCEDURES.filter((pr) => cur.some((x) => x.case.procedure === pr));
  const periodName = p.months ? `last ${p.label}` : 'all time';

  // ---- Hero and stat tiles ----
  const countDelta = prevMonths ? cur.length - prev.length : null;
  const hero = h('section', { class: 'card stat-hero' },
    h('div', { class: 'stat-label' }, `Cases · ${periodName}`),
    h('div', { class: 'hero-value' }, String(cur.length)),
    countDelta != null
      ? h('div', { class: 'stat-delta' }, `${countDelta >= 0 ? '+' : '−'}${Math.abs(countDelta)} vs the ${p.label} before`)
      : h('div', { class: 'stat-delta' }, `since ${monthLabel(firstMonth)}`),
    procedure === 'all' && procs.length > 1 ? [
      thinBar(procs.map((pr) => ({ key: procClass(pr), value: cur.filter((x) => x.case.procedure === pr).length, title: pr }))),
      legend(procs.map((pr) => ({ key: procClass(pr), label: `${pr} ${cur.filter((x) => x.case.procedure === pr).length}` }))),
    ] : null);

  const tiles = TILES.map((m) => {
    const st = stats(ended.map(m.value));
    const med = st.median;
    const prevMed = median(prevEnded.map(m.value));
    const diff = med != null && prevMed != null ? med - prevMed : null;
    const monthly = months.slice(-12).map((mo) => median(ended.filter((x) => x.when.month === mo).map(m.value)));
    const nCases = st.n;
    return h('section', { class: 'card stat-tile' },
      h('div', { class: 'stat-label' }, TILE_LABEL[m.key]),
      h('div', { class: 'stat-row' },
        h('div', { class: 'tile-value' }, fmtMin(med)),
        sparkline(monthly)),
      st.mean != null ? h('div', { class: 'stat-mean' }, `mean ${fmtMin(st.mean)}${fmtSd(st.sd)}`) : null,
      diff != null && Math.round(diff) !== 0
        ? h('div', { class: ['stat-delta', diff < 0 ? 'is-good' : 'is-worse'] },
          `${diff < 0 ? '↓' : '↑'} ${Math.abs(Math.round(diff))} min ${diff < 0 ? 'faster' : 'slower'} than before`)
        : h('div', { class: 'stat-delta' }, nCases ? `${nCases} case${nCases === 1 ? '' : 's'}` : 'no ended cases yet'));
  });

  // ---- Cases per month ----
  const perMonth = chartCard({
    title: 'Cases per month',
    subtitle: procedure === 'all' ? 'Stacked by procedure type' : procedure,
    legendItems: procs.length > 1 ? procs.map((pr) => ({ key: procClass(pr), label: pr })) : null,
  });
  perMonth.draw((W) => stackedColumns({
    W,
    tip: perMonth.tip,
    series: procs.length ? procs : [procedure === 'all' ? PROCEDURES[0] : procedure],
    buckets: months.map((mo) => ({
      label: MONTH_SHORT[Number(mo.slice(5)) - 1],
      long: monthLabel(mo),
      values: Object.fromEntries(procs.map((pr) => [pr, cur.filter((x) => x.when.month === mo && x.case.procedure === pr).length])),
    })),
  }));

  // ---- Spread of one time measure, one dot per case ----
  const metric = METRICS.find((m) => m.key === stripMetric) ?? METRICS[0];
  const strip = chartCard({
    title: `${metric.name} by procedure`,
    subtitle: 'Minutes · each dot is a case · the tall line is the median · tap a dot for details',
    controls: segmented(METRICS.map((m) => ({ key: m.key, label: m.key === 'ablationTime' ? 'Ablation' : m.name.replace(' time', '') })),
      metric.key, (k) => { stripMetric = k; ctx.refresh(); }, 'seg-small'),
  });
  const stripRows = procs.map((pr) => {
    const pts = ended.filter((x) => x.case.procedure === pr && x.durations[metric.key] != null && x.durations[metric.key] >= 0)
      .map((x) => ({ value: x.durations[metric.key], id: x.case.id, title: `${pr} · ${x.when.weekday}, ${monthLabel(x.when.month)}` }));
    return { label: pr, series: pr, points: pts, median: median(pts.map((q) => q.value)) };
  }).filter((r) => r.points.length);
  if (stripRows.length) strip.draw((W) => stripPlot({ W, tip: strip.tip, rows: stripRows, onOpen: (id) => ctx.go(`#/case/${id}`) }));
  else strip.body.append(h('p', { class: 'muted viz-empty' }, `No ended cases with ${metric.name.toLowerCase()} in this period.`));

  // ---- Where the time goes ----
  const phasesCard = chartCard({
    title: 'Where the time goes',
    subtitle: 'Median minutes in each phase of a case',
    legendItems: PHASES.map((ph) => ({ key: `ph-${ph.key}`, label: `${ph.name} · ${ph.long}` })),
    cls: 'viz-wide',
  });
  const phaseRow = (label, list) => ({
    label,
    n: list.length,
    phases: Object.fromEntries(PHASES.map((ph) => [ph.key, median(list.map((x) => x.phases[ph.key]))])),
  });
  const phaseRows = [
    ...procs.map((pr) => phaseRow(pr, ended.filter((x) => x.case.procedure === pr))),
    ...(procs.length > 1 ? [phaseRow('All', ended)] : []),
  ].filter((r) => r.n && PHASES.some((ph) => r.phases[ph.key] > 0));
  if (phaseRows.length) phasesCard.draw((W) => phaseBars({ W, tip: phasesCard.tip, rows: phaseRows }));
  else phasesCard.body.append(h('p', { class: 'muted viz-empty' }, 'Phases appear once a case has its milestones and ablations stamped.'));

  // ---- By weekday ----
  const days = WEEKDAYS.filter((d, i) => i < 5 || cur.some((x) => x.when.weekday === d));
  const weekday = chartCard({ title: 'Cases by weekday', subtitle: 'Median room time under each day' });
  weekday.draw((W) => columns({
    W,
    tip: weekday.tip,
    keyClass: 'viz-accent',
    buckets: days.map((d) => {
      const list = cur.filter((x) => x.when.weekday === d);
      const med = median(list.filter((x) => x.case.status === 'ended').map((x) => x.durations.roomTime));
      return { label: d, value: list.length, med, detail: med != null ? `median room time ${fmtMin(med)}` : null };
    }),
    note: (b) => (b.med != null ? fmtMin(b.med) : '—'),
  }));

  // ---- Cases with gaps to fill in ----
  const flagged = cur.map((x) => ({ x, flags: attentionFor(x) })).filter((f) => f.flags.length);
  const attention = h('section', { class: 'card viz-card' },
    h('div', { class: 'viz-head' },
      h('div', null,
        h('h3', { class: 'viz-title' }, 'Needs attention'),
        h('div', { class: 'viz-sub' }, 'Ended cases with a missing milestone, Affera totals or out-of-order times')),
      flagged.length ? h('button', {
        type: 'button', class: 'btn', onclick: () => { showNeedsAttention(); ctx.go('#/cases'); },
      }, `All ${flagged.length} ›`) : null),
    flagged.length
      ? h('div', { class: 'attn-list' }, flagged.slice(0, 4).map(({ x, flags }) => h('button', {
        type: 'button', class: ['attn-row', procClass(x.case.procedure)], onclick: () => ctx.go(`#/case/${x.case.id}`),
      },
      h('span', { class: 'viz-key' }),
      h('span', { class: 'attn-what' }, `${x.case.procedure} · ${x.when.weekday}, ${monthLabel(x.when.month)}`),
      h('span', { class: 'flag' }, h('span', { class: 'flag-icon', 'aria-hidden': 'true' }, '!'), flags[0]),
      h('span', { class: 'case-chev' }, '›'))))
      : h('div', { class: 'attn-clear' }, h('span', { class: 'attn-tick', 'aria-hidden': 'true' }, '✓'), 'Every case in this period is complete.'));

  // ---- Recent cases ----
  const recent = h('section', { class: ['card', 'viz-card', 'viz-wide'] },
    h('div', { class: 'viz-head' },
      h('h3', { class: 'viz-title' }, 'Recent cases'),
      h('button', { type: 'button', class: 'btn', onclick: () => ctx.go('#/cases') }, 'All cases ›')),
    cur.length
      ? h('div', { class: 'case-list' }, cur.slice(0, 5).map((x) => caseRow(ctx, x.case)))
      : h('p', { class: 'muted viz-empty' }, 'No cases in this period.'));

  // ---- Case mix: who, where, disease, sedation (counts in this period) ----
  const mixGroup = (title, values, labelOf) => {
    const counts = new Map();
    cur.forEach((x) => { const v = values(x); if (v) counts.set(v, (counts.get(v) ?? 0) + 1); });
    if (!counts.size) return null;
    const rows = [...counts.entries()].sort((a, b) => b[1] - a[1]);
    const max = rows[0][1];
    return h('div', { class: 'mix-group' },
      h('div', { class: 'label' }, title),
      rows.slice(0, 6).map(([k, n]) => {
        const bar = h('span', { class: 'mix-bar' });
        bar.style.width = `${Math.max(4, (n / max) * 100)}%`;
        return h('div', { class: 'mix-row' },
          h('span', { class: 'mix-name' }, labelOf ? labelOf(k) : k),
          h('span', { class: 'mix-track' }, bar),
          h('span', { class: 'mix-n' }, String(n)));
      }),
      rows.length > 6 ? h('div', { class: 'muted small' }, `+ ${rows.length - 6} more`) : null);
  };
  const mixGroups = [
    mixGroup('Site', (x) => x.case.site, dir.label),
    mixGroup('Operator', (x) => x.case.operator, dir.label),
    mixGroup('iPad (mapper)', (x) => x.case.source),
    mixGroup('Disease treated', (x) => x.case.disease),
    mixGroup('Sedation', (x) => x.case.sedation),
  ].filter(Boolean);
  const mix = mixGroups.length ? h('section', { class: ['card', 'viz-card', 'viz-wide'] },
    h('div', { class: 'viz-head' }, h('div', null,
      h('h3', { class: 'viz-title' }, 'Case mix'),
      h('div', { class: 'viz-sub' }, dir.isUnlocked() ? 'Names shown: the site and operator list is unlocked' : 'Sites and operators as codes · unlock names on the Data tab'))),
    h('div', { class: 'mix-grid' }, mixGroups)) : null;

  // ---- Table view: every measure, median and mean ± SD, fastest and longest ----
  const sRows = summaryRows(cur);
  const num = (v, unit) => (v == null ? '—' : `${v < 10 ? v.toFixed(1) : Math.round(v)}${unit}`);
  const table = h('details', { class: 'card viz-table' },
    h('summary', null, 'Table of statistics (median, mean ± SD, fastest, longest)'),
    sRows.length ? h('div', { class: 'table-wrap' }, h('table', { class: 'table' },
      h('thead', null, h('tr', null, ['Procedure', 'Measure', 'Cases', 'Median', 'Mean ± SD', 'Fastest / lowest', 'Longest / highest'].map((t) => h('th', null, t)))),
      h('tbody', null, sRows.map(([proc, measure, n, med, mean, sd, min, max]) => {
        const unit = measure.includes('(min)') ? ' min' : '';
        return h('tr', { class: proc === 'All' && 'row-all' },
          h('th', { scope: 'row' }, proc),
          h('td', { class: 'td-left' }, measure.replace(' (min)', '')),
          h('td', null, String(n)),
          h('td', null, num(med, unit)),
          h('td', null, `${num(mean, unit)}${sd != null ? ` ± ${num(sd, '')}` : ''}`),
          h('td', null, num(min, unit)),
          h('td', null, num(max, unit)));
      })))) : h('p', { class: 'muted' }, 'No ended cases in this period.'));

  return h('section', { class: 'screen dash' },
    h('div', { class: 'dash-head' }, h('h1', null, 'Dashboard'), exportReminder(ctx)),
    filterRow,
    extraFilters(ctx, everything),
    h('div', { class: 'stat-grid' }, hero, tiles),
    h('div', { class: 'viz-grid' }, perMonth.card, strip.card, phasesCard.card, mix, weekday.card, attention, recent),
    table);
}

/** Second filter row: disease, sedation, site, operator (only the ones that have data). */
function extraFilters(ctx, everything) {
  const group = (key, label, options, labelOf) => {
    const present = options.filter((o) => everything.some((x) => x.case[key] === o));
    if (!present.length) return null;
    return h('div', { class: 'chip-row', role: 'radiogroup', 'aria-label': label },
      h('span', { class: 'who-label' }, label),
      [null, ...present].map((o) => h('button', {
        type: 'button', role: 'radio', 'aria-checked': String(extra[key] === o),
        class: ['chip', 'chip-small', extra[key] === o && 'is-on'],
        onclick: () => { extra[key] = o; ctx.refresh(); },
      }, o == null ? 'All' : (labelOf ? labelOf(o) : o))));
  };
  const groups = [
    group('disease', 'Disease', DISEASES),
    group('sedation', 'Sedation', SEDATIONS),
    group('site', 'Site', dir.codes('sites'), dir.label),
    group('operator', 'Operator', dir.codes('operators'), dir.label),
  ].filter(Boolean);
  return groups.length ? h('div', { class: 'viz-filters viz-filters-extra' }, groups) : null;
}
