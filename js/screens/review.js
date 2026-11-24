// View or edit one case. Also the short post-case screen right after "End case".

import {
  PROCEDURES, SIDES, OUTCOMES, DURATIONS, ANON_AFTER_DAYS, LESION_SETS, DISEASES, SEDATIONS, milestonesFor, summarize, usesLesionMarks,
  fmtTime, fmtDate, fmtMinutes, fmtAt, whenLabel, referenceOf,
} from '../model.js';
import * as store from '../store.js';
import { h, segmented, guard, confirmSheet, toast } from '../ui.js';
import { openEventEditor } from '../edit-event.js';
import * as dir from '../directory.js';

const pad2 = (n) => String(n).padStart(2, '0');

/** 1125 seconds → "18:45" (or "1:02:03" past an hour). */
function fmtMinSec(secs) {
  const s = Math.round(secs);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h ? `${h}:${pad2(m)}:${pad2(s % 60)}` : `${m}:${pad2(s % 60)}`;
}

/** "18:45", "1:02:03" or plain minutes ("18.5") → seconds; '' → null; anything else → undefined. */
function parseMinSec(text) {
  const t = text.trim();
  if (!t) return null;
  if (/^\d+(\.\d+)?$/.test(t)) return Math.round(parseFloat(t) * 60);
  const parts = t.split(':');
  if (parts.length < 2 || parts.length > 3 || parts.some((p) => !/^\d+$/.test(p))) return undefined;
  const n = parts.map(Number);
  if (n.at(-1) > 59 || (n.length === 3 && n[1] > 59)) return undefined;
  return n.length === 3 ? n[0] * 3600 + n[1] * 60 + n[2] : n[0] * 60 + n[1];
}

export function render(ctx, [id, post]) {
  const c = store.getCase(id);
  if (!c) {
    return h('section', { class: 'screen' },
      h('h1', null, 'Case not found'),
      h('button', { type: 'button', class: 'btn btn-big', onclick: () => ctx.go('#/cases') }, 'Back to cases'));
  }
  const isPost = !!post;
  const evs = store.eventsOf(c.id);
  const sum = summarize(c, evs);
  const when = c.anonymised ? whenLabel(c, evs) : fmtDate(sum.start);
  const set = (patch) => guard(() => store.updateCase(c.id, patch));

  // ---- Post-case fields (outcome, notes) ----
  const notes = h('textarea', {
    class: 'input textarea', rows: '4', maxlength: '2000',
    placeholder: 'Free notes about the case. No patient identifiers or dates.',
    onchange: () => set({ notes: notes.value }),
  });
  notes.value = c.notes ?? '';
  const affera = usesLesionMarks(c.procedure);

  // Affera totals, typed in from the Affera summary at the end of the case.
  const lesionInput = h('input', {
    type: 'number', inputmode: 'numeric', min: '0', max: '5000', class: 'input', placeholder: 'e.g. 240',
    value: c.lesionTotal ?? '', 'aria-label': 'Total lesions',
    onchange: () => {
      const n = parseInt(lesionInput.value, 10);
      set({ lesionTotal: Number.isFinite(n) && n >= 0 ? n : null });
    },
  });
  const timeInput = h('input', {
    type: 'text', inputmode: 'numeric', class: 'input', placeholder: 'm:ss, e.g. 18:45',
    value: c.ablationSeconds != null ? fmtMinSec(c.ablationSeconds) : '', 'aria-label': 'Total ablation time',
    onchange: () => {
      const secs = parseMinSec(timeInput.value);
      if (secs === undefined) { toast('Enter the time as minutes:seconds, e.g. 18:45'); return; }
      set({ ablationSeconds: secs });
    },
  });
  const afferaTotals = affera ? h('div', { class: 'affera-totals' },
    h('div', { class: 'label' }, 'From the Affera summary'),
    h('div', { class: 'two-col' },
      h('label', { class: 'label' }, 'Total lesions', lesionInput),
      h('label', { class: 'label' }, 'Total ablation time', timeInput))) : null;

  const fluoroInput = h('input', {
    type: 'text', inputmode: 'numeric', class: 'input', placeholder: 'm:ss, e.g. 5:35',
    value: c.fluoroSeconds != null ? fmtMinSec(c.fluoroSeconds) : '', 'aria-label': 'Fluoroscopy time',
    onchange: () => {
      const secs = parseMinSec(fluoroInput.value);
      if (secs === undefined) { toast('Enter fluoroscopy time as minutes:seconds, e.g. 5:35'); return; }
      set({ fluoroSeconds: secs });
    },
  });
  const choice = (label, options, value, key) => [
    h('div', { class: 'label' }, label),
    segmented(options.map((o) => ({ key: o, label: o })), value, (o) => set({ [key]: o === value ? null : o }), 'seg-wide'),
  ];
  const codeChoice = (kind, key) => (dir.codes(kind).length ? [
    h('div', { class: 'label' }, dir.KINDS[kind].label.slice(0, -1)),
    h('div', { class: 'chip-row' }, dir.codes(kind).map((code) => h('button', {
      type: 'button', class: ['chip', c[key] === code && 'is-on'], 'aria-pressed': String(c[key] === code),
      onclick: () => set({ [key]: c[key] === code ? null : code }),
    }, dir.label(code)))),
  ] : []);
  const postDetails = [
    h('label', { class: 'label' }, 'Fluoroscopy time', fluoroInput),
    choice('Disease treated', DISEASES, c.disease, 'disease'),
    choice('Sedation', SEDATIONS, c.sedation, 'sedation'),
    h('div', { class: 'label' }, 'Registry data submitted'),
    segmented([{ key: 'yes', label: 'Yes' }, { key: 'no', label: 'No' }],
      c.registrySubmitted == null ? null : c.registrySubmitted ? 'yes' : 'no',
      (k) => set({ registrySubmitted: (k === 'yes') === c.registrySubmitted ? null : k === 'yes' }), 'seg-wide'),
    codeChoice('sites', 'site'),
    codeChoice('operators', 'operator'),
  ];

  const postCase = h('section', { class: 'group card' },
    h('h3', null, 'Post-case'),
    afferaTotals,
    postDetails,
    h('div', { class: 'label' }, 'Outcome'),
    segmented(OUTCOMES.map((o) => ({ key: o, label: o })), c.outcome,
      (o) => set({ outcome: o === c.outcome ? null : o }), 'seg-wide'),
    h('label', { class: 'label' }, 'Notes', notes));

  // ---- Details ----
  const details = h('section', { class: 'group card' },
    h('h3', null, 'Case'),
    h('div', { class: 'label' }, 'Procedure type'),
    segmented(PROCEDURES.map((p) => ({ key: p, label: p })), c.procedure, (p) => set({ procedure: p }), 'seg-wide'),
    h('div', { class: 'label' }, 'Side'),
    segmented(SIDES, c.side, (s) => set({ side: s }), 'seg-wide'));

  // ---- Derived times ----
  const stats = h('section', { class: 'group' },
    h('h3', null, 'Times'),
    h('div', { class: 'stats' },
      DURATIONS.map((d) => {
        const v = sum.durations[d.key];
        return h('div', { class: ['stat', v != null && v < 0 && 'is-bad'] },
          h('div', { class: 'stat-label' }, d.name),
          h('div', { class: 'stat-value' }, fmtMinutes(v)),
          v != null && v < 0 ? h('div', { class: 'stat-warn' }, 'check times') : null);
      }),
      affera
        ? [h('div', { class: 'stat' }, h('div', { class: 'stat-label' }, 'Lesions (Affera)'), h('div', { class: 'stat-value' }, sum.lesionTotal ?? '—')),
          h('div', { class: 'stat' }, h('div', { class: 'stat-label' }, 'Ablation time (Affera)'), h('div', { class: 'stat-value' }, c.ablationSeconds != null ? fmtMinSec(c.ablationSeconds) : '—'))]
        : h('div', { class: 'stat' }, h('div', { class: 'stat-label' }, 'Ablations'), h('div', { class: 'stat-value' }, String(sum.ablationCount))),
      h('div', { class: 'stat' }, h('div', { class: 'stat-label' }, 'Maps'), h('div', { class: 'stat-value' }, String(sum.mapCount))),
      h('div', { class: 'stat' }, h('div', { class: 'stat-label' }, 'Mapping time'), h('div', { class: 'stat-value' }, fmtMinutes(sum.mappingMinutes)))));

  // ---- Milestones (add the missed ones) ----
  const msList = h('section', { class: 'group card' },
    h('h3', null, 'Milestones'),
    h('div', { class: 'ms-list' }, milestonesFor(c.side).map((m) => {
      const ev = sum.events.find((e) => e.kind === 'milestone' && e.milestone === m.key);
      return h('button', {
        type: 'button', class: ['ms-row', !ev && 'is-missing'],
        onclick: () => (ev
          ? openEventEditor({ caseObj: c, event: ev, label: m.name })
          : openEventEditor({ caseObj: c, create: { kind: 'milestone', milestone: m.key } })),
      },
      h('span', { class: 'ms-name' }, m.name),
      h('span', { class: 'ms-time' }, ev ? fmtAt(c, ev.time) : 'not stamped'),
      h('span', { class: 'ms-act' }, ev ? 'edit' : '+ add'));
    })));

  // ---- Affera lesion marks and lesion sets ----
  const timeRow = (name, ev, create) => h('button', {
    type: 'button', class: ['ms-row', !ev && 'is-missing'],
    onclick: () => (ev
      ? openEventEditor({ caseObj: c, event: ev, label: name })
      : openEventEditor({ caseObj: c, create })),
  },
  h('span', { class: 'ms-name' }, name),
  h('span', { class: 'ms-time' }, ev ? fmtAt(c, ev.time) : 'not stamped'),
  h('span', { class: 'ms-act' }, ev ? 'edit' : '+ add'));

  const lastLesionEv = [...sum.events].reverse().find((e) => e.kind === 'lesion' && e.mark === 'last');
  const lesions = affera ? h('section', { class: 'group card' },
    h('h3', null, 'Lesions'),
    h('div', { class: 'ms-list' },
      timeRow('First lesion', sum.events.find((e) => e.kind === 'lesion' && e.mark === 'first'), { kind: 'lesion', mark: 'first' }),
      timeRow('Last lesion', lastLesionEv, { kind: 'lesion', mark: 'last' }))) : null;

  const showSets = c.mode === 'advanced' || Object.keys(sum.sets).length;
  const setsCard = showSets ? h('section', { class: 'group card' },
    h('h3', null, 'Lesion sets'),
    h('div', { class: 'ms-list' }, LESION_SETS.filter((ls) => c.side !== 'right' || !ls.leftOnly).flatMap((ls) => {
      const st = sum.sets[ls.key] ?? {};
      return [
        timeRow(`Start ${ls.name}`, st.startEvent, { kind: 'set', set: ls.key, phase: 'start' }),
        timeRow(`End ${ls.name}${st.minutes != null ? ` · ${fmtMinutes(st.minutes)}` : ''}`, st.endEvent, { kind: 'set', set: ls.key, phase: 'end' }),
      ];
    }))) : null;

  // ---- Timeline ----
  const addBtn = (kind, label) => h('button', {
    type: 'button', class: 'btn', onclick: () => openEventEditor({ caseObj: c, create: { kind } }),
  }, label);
  const timeline = h('section', { class: 'group card' },
    h('div', { class: 'row-between' },
      h('h3', null, `Timeline · ${sum.events.length}`),
      h('div', { class: 'btn-row' }, affera ? null : addBtn('ablation', '+ Ablation'), addBtn('map', '+ Map'), addBtn('note', '+ Note'))),
    sum.events.length
      ? h('ol', { class: 'timeline timeline-flat' }, sum.events.map((e) => h('li', null, h('button', {
        type: 'button', class: ['tl-row', `tl-${e.kind}`, e.chamber && `ch-${e.chamber}`, e.energy && `en-${e.energy}`],
        onclick: () => openEventEditor({ caseObj: c, event: e, label: sum.labels.get(e.id) }),
      },
      h('span', { class: 'tl-time' }, fmtAt(c, e.time)),
      h('span', { class: 'tl-dot' }),
      h('span', { class: 'tl-label' }, sum.labels.get(e.id)),
      h('span', { class: 'tl-edit' }, 'edit')))))
      : h('p', { class: 'muted' }, 'No events.'));

  // ---- Actions ----
  const actions = h('div', { class: 'btn-row btn-row-end' },
    c.status === 'active'
      ? h('button', { type: 'button', class: 'btn btn-big btn-primary', onclick: () => ctx.go('#/live') }, 'Back to live case')
      : c.anonymised ? null : h('button', {
        type: 'button', class: 'btn btn-big',
        onclick: async () => {
          if (store.activeCase()) { toast('Another case is live. End it first.'); return; }
          const yes = await confirmSheet({
            title: 'Reopen as live case?', message: 'It will be the live case again until you end it.', confirmLabel: 'Reopen',
          });
          if (yes && await set({ status: 'active', endedAt: null })) ctx.go('#/live');
        },
      }, 'Reopen live'),
    h('button', {
      type: 'button', class: 'btn btn-big btn-danger',
      onclick: async () => {
        const yes = await confirmSheet({
          title: 'Delete this case?',
          message: `${c.procedure}, ${when}, ${sum.events.length} events. This cannot be undone.`,
          confirmLabel: 'Delete case', danger: true,
        });
        if (!yes) return;
        await guard(() => store.deleteCase(c.id));
        toast('Case deleted');
        ctx.go('#/cases');
      },
    }, 'Delete case'),
    isPost ? h('button', {
      type: 'button', class: 'btn btn-big btn-primary',
      onclick: async () => { await set({ notes: notes.value }); ctx.go('#/'); },
    }, 'Done') : null);

  const header = h('div', { class: 'review-head' },
    h('div', null,
      h('h1', null, isPost ? 'Case ended' : `${c.procedure} · ${when}`),
      h('p', { class: 'muted' },
        `${c.procedure} · ${c.side === 'right' ? 'Right' : 'Left'}-sided`,
        c.source ? ` · ${c.source}` : '',
        c.anonymised ? '' : ` · ${fmtTime(sum.start, false)}–${c.endedAt ? fmtTime(c.endedAt, false) : 'live'}`),
      h('p', { class: 'muted small' }, c.anonymised
        ? `Clock times removed. Times are shown as T+ minutes after ${(referenceOf(evs)?.label ?? 'Patient on table').toLowerCase()}.`
        : `Clock times stay on this iPad for ${ANON_AFTER_DAYS} days after the case, then become minutes after Patient on table.`)),
    c.status === 'active' ? h('span', { class: 'pill pill-live' }, 'Live') : null);

  const left = isPost ? [postCase, stats, details] : [stats, postCase, details];
  const right = [msList, lesions, setsCard, timeline];

  return h('section', { class: 'screen review' }, header,
    h('div', { class: 'review-cols' },
      h('div', { class: 'review-col' }, left),
      h('div', { class: 'review-col' }, right)),
    actions);
}
