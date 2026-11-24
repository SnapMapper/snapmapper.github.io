// The sheet for correcting an event's time (and its details), adding a missed event afterwards,
// or deleting one.

import {
  CHAMBERS, ENERGIES, fmtTime, fmtRel, milestone, referenceOf, lesionSet,
} from './model.js';
import * as store from './store.js';
import { h, sheet, guard, toast, confirmSheet } from './ui.js';

const pad = (n) => String(n).padStart(2, '0');

const NUDGES = [
  { label: '−5 min', delta: -300000 },
  { label: '−1 min', delta: -60000 },
  { label: '−10 s', delta: -10000 },
  { label: '+10 s', delta: 10000 },
  { label: '+1 min', delta: 60000 },
  { label: '+5 min', delta: 300000 },
];

function defaultTime(c) {
  if (c.status === 'active') return Date.now();
  const times = store.eventsOf(c.id).map((e) => e.time);
  if (c.anonymised) return times.length ? Math.max(...times) : 0;
  return c.endedAt ?? (times.length ? Math.max(...times) : c.startedAt);
}

function titleFor(kind, ms, label, details = {}) {
  if (label) return label;
  if (kind === 'milestone') return milestone(ms)?.name ?? 'Milestone';
  if (kind === 'lesion') return details.mark === 'first' ? 'First lesion' : 'Last lesion';
  if (kind === 'set') return `${details.phase === 'end' ? 'End' : 'Start'} ${lesionSet(details.set)?.name ?? 'lesion set'}`;
  if (kind === 'mapEnd') return 'Map end';
  return { ablation: 'Ablation', map: 'Map', note: 'Note' }[kind] ?? 'Event';
}

/**
 * Open the editor.
 *   existing event:  openEventEditor({ caseObj, event, label })
 *   add afterwards:  openEventEditor({ caseObj, create: { kind, milestone?, mark?, set?, phase? } })
 */
export function openEventEditor({ caseObj, event = null, create = null, label = null }) {
  const kind = event?.kind ?? create.kind;
  const msKey = event?.milestone ?? create?.milestone;
  // Lesion marks and lesion sets carry which mark / set / phase they are.
  const details = {
    mark: event?.mark ?? create?.mark,
    set: event?.set ?? create?.set,
    phase: event?.phase ?? create?.phase,
  };
  const detailFields = Object.fromEntries(Object.entries(details).filter(([, v]) => v != null));
  let t = event?.time ?? defaultTime(caseObj);
  let chamber = event?.chamber ?? (kind === 'map' ? 'LA' : null);

  // An anonymised case has no clock times: its times are offsets, edited in minutes.
  const rel = !!caseObj.anonymised;
  const refLabel = (referenceOf(store.eventsOf(caseObj.id))?.label ?? 'Patient on table').toLowerCase();

  const timeBig = h('div', { class: 'edit-time' });
  const timeInput = rel
    ? h('input', {
      type: 'number', inputmode: 'decimal', step: 'any', class: 'input input-time',
      'aria-label': `Minutes after ${refLabel}`,
      onchange: () => {
        const v = parseFloat(timeInput.value);
        if (!Number.isFinite(v)) return;
        t = Math.round(v * 60) * 1000;
        sync(false);
      },
    })
    : h('input', {
      type: 'time', step: '1', class: 'input input-time', 'aria-label': 'Time',
      onchange: () => {
        const m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(timeInput.value);
        if (!m) return;
        const d = new Date(t);
        d.setHours(+m[1], +m[2], +(m[3] ?? 0), 0);
        t = d.getTime();
        sync(false);
      },
    });
  const dateNote = h('div', { class: 'muted small' });

  function sync(updateInput = true) {
    if (rel) {
      timeBig.textContent = fmtRel(t);
      if (updateInput) timeInput.value = String(Math.round((t / 60000) * 100) / 100);
      dateNote.textContent = `minutes after ${refLabel}`;
      return;
    }
    timeBig.textContent = fmtTime(t);
    const d = new Date(t);
    if (updateInput) timeInput.value = `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
    dateNote.textContent = d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
  }
  sync();

  const nudges = h('div', { class: 'nudges' }, NUDGES.map((n) => h('button', {
    type: 'button', class: 'btn btn-nudge',
    onclick: () => { t += n.delta; sync(); },
  }, n.label)));

  let extra = null;
  // Older per-tap Affera ablations carry PF / RF; it can still be corrected on those.
  let energy = event?.energy ?? null;
  let noteInput = null;
  if (kind === 'map') {
    const chamberRow = h('div', { class: 'seg seg-wide' });
    const drawChambers = () => {
      chamberRow.replaceChildren(...CHAMBERS.map((ch) => h('button', {
        type: 'button', class: ['seg-btn', `ch-${ch}`, ch === chamber && 'is-on'], 'aria-pressed': String(ch === chamber),
        onclick: () => { chamber = ch; drawChambers(); },
      }, ch)));
    };
    drawChambers();
    extra = h('div', { class: 'edit-extra' },
      h('div', { class: 'label' }, 'Chamber'), chamberRow);
  } else if (kind === 'ablation' && event?.energy) {
    // Correct a PF / RF mis-tap here.
    const energyRow = h('div', { class: 'seg seg-wide' });
    const drawEnergy = () => {
      energyRow.replaceChildren(...ENERGIES.map((en) => h('button', {
        type: 'button', class: ['seg-btn', `en-${en}`, en === energy && 'is-on'], 'aria-pressed': String(en === energy),
        onclick: () => { energy = en; drawEnergy(); },
      }, en)));
    };
    drawEnergy();
    extra = h('div', { class: 'edit-extra' }, h('div', { class: 'label' }, 'Energy'), energyRow);
  } else if (kind === 'note') {
    noteInput = h('textarea', {
      class: 'input textarea', rows: '3', maxlength: '500',
      placeholder: 'Short note. No patient identifiers or dates.', autofocus: !event,
    });
    noteInput.value = event?.text ?? '';
    extra = h('div', { class: 'edit-extra' }, noteInput);
  }

  async function save(close) {
    const fields = { time: t };
    if (kind === 'ablation' && energy) fields.energy = energy;
    if (kind === 'map') fields.chamber = chamber;
    if (kind === 'note') {
      fields.text = noteInput.value.trim();
      if (!fields.text) { toast('Note is empty'); return; }
    }
    const ok = await guard(async () => {
      if (event) await store.updateEvent(event.id, fields);
      else await store.addEvent(caseObj.id, { kind, ...(msKey ? { milestone: msKey } : {}), ...detailFields, ...fields });
      return true;
    });
    if (ok) close();
  }

  sheet((close) => h('div', { class: 'sheet-body' },
    h('h2', null, event ? `Edit ${titleFor(kind, msKey, label, details)}` : `Add ${titleFor(kind, msKey, null, details)}`),
    h('div', { class: 'edit-time-row' }, timeBig, h('div', { class: 'edit-time-side' }, dateNote, timeInput)),
    nudges,
    rel ? null : h('button', { type: 'button', class: 'btn', onclick: () => { t = Date.now(); sync(); } }, 'Set to now'),
    extra,
    h('div', { class: 'sheet-actions' },
      event ? h('button', {
        type: 'button', class: 'btn btn-big btn-danger',
        onclick: async () => {
          close();
          const yes = await confirmSheet({
            title: `Delete ${titleFor(kind, msKey, label, details)}?`,
            message: `Stamped at ${rel ? fmtRel(event.time) : fmtTime(event.time)}.`,
            confirmLabel: 'Delete', danger: true,
          });
          if (yes) await guard(() => store.deleteEvent(event.id));
        },
      }, 'Delete') : null,
      h('button', { type: 'button', class: 'btn btn-big', onclick: close }, 'Cancel'),
      h('button', { type: 'button', class: 'btn btn-big btn-primary', onclick: () => save(close) }, 'Save'))));
}
