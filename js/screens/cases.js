// Past cases, newest first, grouped by month. Tap one to view or edit it (delete is on that
// screen, with a confirm). Filters: procedure type, and cases that need attention.

import {
  PROCEDURES, PHASES, summarize, fmtDate, fmtTime, sideLabel, whenLabel, usesLesionMarks, caseWhen,
  monthLabel, median, attentionFor,
} from '../model.js';
import * as store from '../store.js';
import { h } from '../ui.js';
import { procClass, fmtMin, thinBar } from '../charts.js';

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

let procedure = 'all';
let needsAttention = false;

/** Open the list filtered to cases that need attention (used by the dashboard). */
export function showNeedsAttention() {
  procedure = 'all';
  needsAttention = true;
}

/**
 * One case as a large tappable row: procedure colour, when, what, a thin bar of its phases
 * (scaled so rows compare: maxRoom is the longest room time on screen), and any gaps to fill.
 */
export function caseRow(ctx, c, { maxRoom } = {}) {
  const evs = store.eventsOf(c.id);
  const sum = summarize(c, evs);
  const end = sum.milestones.patientOffTable ?? c.endedAt;
  const date = c.anonymised ? whenLabel(c, evs) : fmtDate(sum.start);
  const range = c.anonymised ? 'clock times removed' : `${fmtTime(sum.start, false)}–${end ? fmtTime(end, false) : 'live'}`;
  const flags = attentionFor(sum);
  const room = sum.durations.roomTime;
  const scale = maxRoom && room > 0 ? Math.max(12, Math.min(100, (room / maxRoom) * 100)) : 100;
  const phaseParts = PHASES.map((ph) => ({ key: `ph-${ph.key}`, value: sum.phases[ph.key], title: `${ph.name} ${fmtMin(sum.phases[ph.key])}` }));
  const hasPhases = phaseParts.some((x) => x.value > 0);
  const counts = `${usesLesionMarks(c.procedure)
    ? (sum.lesionTotal != null ? plural(sum.lesionTotal, 'lesion') : 'lesions not entered')
    : plural(sum.ablationCount, 'ablation')} · ${plural(sum.mapCount, 'map')}`;

  return h('button', {
    type: 'button', class: ['case-row', 'case-row-rich', procClass(c.procedure), c.status === 'active' && 'is-live'],
    onclick: () => ctx.go(`#/case/${c.id}`),
  },
  h('span', { class: 'case-stripe', 'aria-hidden': 'true' }),
  h('span', { class: 'case-when' },
    h('span', { class: 'case-date' }, date),
    h('span', { class: 'muted small' }, range)),
  h('span', { class: 'case-what' },
    h('span', { class: 'case-proc' }, c.procedure),
    h('span', { class: 'muted small' }, `${sideLabel(c.side)}-sided${c.source ? ` · ${c.source}` : ''}${c.outcome ? ` · ${c.outcome}` : ''}`)),
  h('span', { class: 'case-shape' },
    hasPhases ? thinBar(phaseParts, { width: scale }) : h('span', { class: 'muted small' }, c.status === 'active' ? 'in progress' : 'no phases yet'),
    flags.length
      ? h('span', { class: 'case-flags' }, flags.map((f) => h('span', { class: 'flag' }, h('span', { class: 'flag-icon', 'aria-hidden': 'true' }, '!'), f)))
      : h('span', { class: 'muted small' }, counts)),
  h('span', { class: 'case-nums' },
    h('span', { class: 'case-room' }, fmtMin(room)),
    h('span', { class: 'muted small' }, 'room time')),
  c.status === 'active' ? h('span', { class: 'pill pill-live' }, 'Live') : h('span', { class: 'case-chev' }, '›'));
}

export function render(ctx) {
  const all = store.allCases().map((c) => {
    const sum = summarize(c, store.eventsOf(c.id));
    return { c, sum, when: caseWhen(c, sum.events), flags: attentionFor(sum) };
  });
  if (!all.length) {
    return h('section', { class: 'screen' },
      h('h1', null, 'Cases'),
      h('div', { class: 'card empty' },
        h('h2', null, 'No cases yet'),
        h('p', { class: 'muted' }, 'Cases you log appear here, newest first, grouped by month.'),
        h('button', { type: 'button', class: 'btn btn-big btn-primary', onclick: () => ctx.go('#/') }, 'Start a case')));
  }

  const count = (pr) => all.filter((x) => pr === 'all' || x.c.procedure === pr).length;
  const attentionCount = all.filter((x) => x.flags.length).length;
  const shown = all.filter((x) => (procedure === 'all' || x.c.procedure === procedure) && (!needsAttention || x.flags.length));
  const maxRoom = Math.max(1, ...shown.map((x) => x.sum.durations.roomTime ?? 0));

  const filters = h('div', { class: 'viz-filters' },
    h('div', { class: 'chip-row', role: 'radiogroup', 'aria-label': 'Procedure type' },
      [{ key: 'all', label: 'All types' }, ...PROCEDURES.map((p) => ({ key: p, label: p }))]
        .filter((o) => o.key === 'all' || count(o.key))
        .map((o) => h('button', {
          type: 'button', role: 'radio', 'aria-checked': String(o.key === procedure),
          class: ['chip', o.key === procedure && 'is-on'],
          onclick: () => { procedure = o.key; ctx.refresh(); },
        }, o.key !== 'all' ? h('span', { class: ['viz-key', procClass(o.key)] }) : null, `${o.label} ${count(o.key)}`))),
    attentionCount ? h('button', {
      type: 'button', 'aria-pressed': String(needsAttention),
      class: ['chip', 'chip-attention', needsAttention && 'is-on'],
      onclick: () => { needsAttention = !needsAttention; ctx.refresh(); },
    }, h('span', { class: 'flag-icon', 'aria-hidden': 'true' }, '!'), `Needs attention ${attentionCount}`) : null);

  // Group by month, newest first.
  const months = [...new Set(shown.map((x) => x.when.month))].sort().reverse();
  const groups = months.map((mo) => {
    const rows = shown.filter((x) => x.when.month === mo);
    const med = median(rows.filter((x) => x.c.status === 'ended').map((x) => x.sum.durations.roomTime));
    return h('section', { class: 'case-group' },
      h('div', { class: 'case-group-head' },
        h('h3', null, monthLabel(mo)),
        h('span', { class: 'muted small' }, `${plural(rows.length, 'case')}${med != null ? ` · median room time ${fmtMin(med)}` : ''}`)),
      h('div', { class: 'case-list' }, rows.map((x) => caseRow(ctx, x.c, { maxRoom }))));
  });

  return h('section', { class: 'screen' },
    h('div', { class: 'dash-head' },
      h('h1', null, `Cases · ${all.length}`),
      h('div', { class: 'phase-legend muted small' },
        'Bar: ', PHASES.map((ph) => h('span', { class: 'viz-legend-item' }, h('span', { class: ['viz-key', `ph-${ph.key}`] }), ph.name)))),
    filters,
    shown.length ? groups : h('p', { class: 'muted' }, 'No cases match these filters.'));
}
