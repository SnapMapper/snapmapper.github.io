// The live case screen, laid out for a mapper who glances across from the mapping monitor.
// See docs/live-layout-audit.md for the reasoning. In short:
// - Three zones, mirrored so the most frequent target (Ablation, a full-height strip) is on the
//   edge nearest the mapper; rare and risky controls go on the far edge.
// - Nothing moves: milestone slots are fixed, even on a right-sided case.
// - One "Next milestone" target covers milestones done in order.
// - Nothing animates unless the mapper tapped it: the clock shows hours and minutes only.
// - Each stamp is confirmed by a pulse on the tapped zone and, optionally, a sound per kind.
// - A map runs from its chamber tap until the next press of anything else on the screen, which
//   records "Map end" automatically. Undo removes the map instead; Note leaves it running.
// - A Bluetooth keyboard, keypad or foot pedal can stamp without looking (see KEYS below).

import {
  MILESTONES, SIDES, MODES, LESION_SETS, milestonesFor, usesLesionMarks, summarize, fmtTime, fmtMinutes, uuid,
} from '../model.js';
import * as store from '../store.js';
import {
  h, segmented, guard, toast, debounced, sheet, confirmSheet,
} from '../ui.js';
import { openEventEditor } from '../edit-event.js';
import { tick as sound } from '../sound.js';
import { icon } from '../icons.js';
import { procClass } from '../charts.js';

// Map chambers laid out like the heart in a frontal (radiological) view: patient's right on
// screen left, atria above ventricles, CS below.
const CHAMBER_GRID = [['RA', 'LA'], ['RV', 'LV']];

// Lock-out after a Next tap, so a double tap can't stamp two milestones in a row.
const NEXT_LOCK_MS = 2000;
const ABLATION_REPEAT_MS = 250;

// State that survives re-renders.
let wakeLock = null;
let clockEls = null;
let liveCtx = null;
let flashKey = null; // the zone just tapped, so the re-drawn zone pulses once
let nextDone = null; // { label, time, until }
let lastAblationAt = 0;
// Last Start/End tap per lesion set: a double tap mustn't start a set and end it at once.
const lastSetTap = new Map();
const SET_LOCK_MS = 1500;

/** Where the iPad sits relative to the mapper decides which edge is "near". */
export function ipadSide() {
  return store.getMeta('ipadSide') === 'right' ? 'right' : 'left';
}

export function render(ctx) {
  const c = store.activeCase();
  if (!c) return h('section', { class: 'screen' }, h('p', { class: 'muted' }, 'No live case.'));
  liveCtx = ctx;
  requestWakeLock();
  const sum = summarize(c, store.eventsOf(c.id));
  const fl = (key) => key === flashKey && 'flash';

  // iPad on the mapper's right → its left edge is nearest the mapper, and vice versa.
  const near = ipadSide() === 'right' ? 'left' : 'right';

  const view = h('section', { class: 'screen live', dataset: { near } },
    ablationZone(c, sum, fl),
    middleZone(ctx, c, sum, fl),
    farZone(ctx, c, sum));
  view.addEventListener('click', endMapOnPress, true);
  flashKey = null;
  return view;
}

// ---- Near edge: Ablation (or First / Last lesion on Affera) ----

function ablationZone(c, sum, fl) {
  if (usesLesionMarks(c.procedure)) return lesionZone(c, sum, fl);
  return h('button', {
    type: 'button',
    class: ['zone', 'zone-abl', fl('abl')],
    'aria-label': `Stamp ablation. ${sum.ablationCount} so far.`,
    onclick: (e) => { e.currentTarget.blur(); doAblation(); },
  },
  h('span', { class: 'abl-title' }, icon('zap'), 'Ablation'),
  h('span', { class: 'abl-count' }, String(sum.ablationCount)),
  h('span', { class: 'abl-last' }, sum.lastAblation ? `last ${fmtTime(sum.lastAblation)}` : 'tap for each ablation'));
}

// Affera: hundreds of lesions are too many to tap, so only the first and last are stamped.
// First lesion is set once (tap again to correct it). Last lesion moves to "now" on every tap,
// so tap it after what looks like the last lesion and again after any touch-up.
function lesionZone(c, sum, fl) {
  const firstEv = sum.events.find((e) => e.kind === 'lesion' && e.mark === 'first');
  const first = h('button', {
    type: 'button',
    class: ['abl-part', 'lesion-part', firstEv && 'is-done', fl('lesion:first')],
    'aria-label': firstEv ? `First lesion at ${fmtTime(firstEv.time)}. Tap to correct.` : 'Stamp first lesion',
    onclick: (e) => {
      e.currentTarget.blur();
      if (firstEv) { openEventEditor({ caseObj: c, event: firstEv, label: 'First lesion' }); } else doLesion('first');
    },
  },
  h('span', { class: 'abl-title' }, icon('play'), 'First lesion'),
  firstEv
    ? h('span', { class: 'lesion-time' }, `✓ ${fmtTime(firstEv.time)}`)
    : h('span', { class: 'abl-last' }, 'tap at the first lesion'));
  const last = h('button', {
    type: 'button',
    class: ['abl-part', 'lesion-part', fl('lesion:last')],
    'aria-label': sum.lastLesion ? `Last lesion at ${fmtTime(sum.lastLesion)}. Tap to move it to now.` : 'Stamp last lesion',
    onclick: (e) => { e.currentTarget.blur(); doLesion('last'); },
  },
  h('span', { class: 'abl-title' }, icon('flag'), 'Last lesion'),
  sum.lastLesion ? h('span', { class: 'lesion-time' }, fmtTime(sum.lastLesion)) : null,
  h('span', { class: 'abl-last' }, sum.lastLesion ? 'tap again after any more lesions' : 'tap after the last lesion'));
  return h('div', { class: ['zone', 'zone-abl', 'zone-abl-split'] }, first, last);
}

// ---- Middle: Next milestone, all milestone slots, map ----

function nextMilestone(c, sum) {
  return milestonesFor(c.side).find((m) => sum.milestones[m.key] == null) ?? null;
}

function caseMode(c) {
  return c.mode ?? (store.getMeta('liveMode') === 'advanced' ? 'advanced' : 'basic');
}

// Advanced mode: one button per lesion set that flips Start → End → done. Sets that don't
// apply to a right-sided case keep their slot, greyed out, so nothing moves.
function setsGrid(c, sum, fl) {
  return h('div', { class: 'set-grid' }, LESION_SETS.map((ls) => {
    if (c.side === 'right' && ls.leftOnly) {
      return h('div', { class: 'set-btn set-off', 'aria-hidden': 'true' },
        h('span', { class: 'set-name' }, ls.name), h('span', { class: 'set-sub' }, 'n/a'));
    }
    const st = sum.sets[ls.key];
    const state = st?.start == null && st?.end == null ? 'idle' : st?.end == null ? 'running' : 'done';
    const el = h('button', {
      type: 'button',
      class: ['set-btn', `set-${state}`, fl(`set:${ls.key}`)],
      'aria-label': state === 'idle' ? `Start ${ls.name}` : state === 'running' ? `End ${ls.name}` : `${ls.name} done. Tap to correct.`,
      onclick: () => {
        el.blur();
        const now = Date.now();
        if (now - (lastSetTap.get(ls.key) ?? 0) < SET_LOCK_MS) return;
        if (state === 'done') { openSetSheet(c, ls, st); return; }
        lastSetTap.set(ls.key, now);
        if (state === 'running') {
          stamp(c, { kind: 'set', set: ls.key, phase: 'end' }, `set:${ls.key}`, 'set');
          return;
        }
        // Starting a line ends whichever other line is still running, at the same moment.
        // Only another line does this. The automatic End is linked to this Start, so Undo of the
        // Start removes it too and the earlier line carries on.
        const startId = uuid();
        const fresh = summarize(c, store.eventsOf(c.id)).sets;
        for (const [key, other] of Object.entries(fresh)) {
          if (key === ls.key || other.start == null || other.end != null) continue;
          guard(() => store.addEvent(c.id, {
            kind: 'set', set: key, phase: 'end', time: now, auto: true, causedBy: startId,
          }));
        }
        stamp(c, { kind: 'set', set: ls.key, phase: 'start', id: startId }, `set:${ls.key}`, 'set');
      },
    },
    h('span', { class: 'set-verb' }, state === 'idle' ? 'Start' : state === 'running' ? 'End' : '✓'),
    h('span', { class: 'set-name' }, ls.name),
    h('span', { class: 'set-sub' }, state === 'idle' ? '' : state === 'running'
      ? `since ${fmtTime(st.start, false)}`
      : fmtMinutes(st.minutes)));
    return el;
  }));
}

function middleZone(ctx, c, sum, fl) {
  const advanced = caseMode(c) === 'advanced';
  const next = nextMilestone(c, sum);
  const locked = nextDone && Date.now() < nextDone.until;

  // Where the case is: one pip per milestone (filled when stamped). Static, no animation.
  const msList = milestonesFor(c.side);
  const doneN = msList.filter((m) => sum.milestones[m.key] != null).length;
  const pips = h('span', { class: 'next-pips', 'aria-hidden': 'true' },
    msList.map((m) => h('span', { class: ['pip', sum.milestones[m.key] != null && 'is-done', next?.key === m.key && 'is-next'] })));

  const nextBtn = h('button', {
    type: 'button',
    class: ['zone-next', locked && 'is-locked', !next && !locked && 'is-finished', fl('next')],
    'aria-label': next ? `Stamp next milestone: ${next.name}` : 'All milestones stamped',
    onclick: (e) => { e.currentTarget.blur(); doNext(); },
  },
  locked
    ? [h('span', { class: 'next-kicker' }, 'Stamped'),
      h('span', { class: 'next-title' }, `✓ ${nextDone.label}`),
      h('span', { class: 'next-sub' }, fmtTime(nextDone.time))]
    : next
      ? [h('span', { class: 'next-kicker' }, `Next milestone · ${doneN + 1} of ${msList.length}`),
        h('span', { class: 'next-title' }, next.short),
        h('span', { class: 'next-sub' }, next.name !== next.short ? next.name : 'tap to stamp'),
        pips]
      : [h('span', { class: 'next-kicker' }, 'Milestones'),
        h('span', { class: 'next-title' }, [icon('check'), 'All stamped']),
        pips]);

  // Every milestone keeps its slot. Slots that don't apply (right-sided case) stay in place,
  // blank and disabled, so nothing shifts between case types.
  const slots = h('div', { class: 'ms-slots' }, MILESTONES.map((m) => {
    const applies = c.side !== 'right' || !m.leftOnly;
    if (!applies) {
      return h('div', { class: 'slot slot-off', 'aria-hidden': 'true' },
        h('span', { class: 'slot-name' }, m.short), h('span', { class: 'slot-time' }, 'n/a'));
    }
    const t = sum.milestones[m.key];
    const el = h('button', {
      type: 'button',
      class: ['slot', t != null && 'is-done', next?.key === m.key && !locked && 'is-next', fl(`ms:${m.key}`)],
      'aria-label': t != null ? `${m.name}, stamped ${fmtTime(t)}. Tap to correct.` : `Stamp ${m.name} out of order`,
      onclick: () => {
        el.blur();
        if (debounced(el)) return;
        const current = store.eventsOf(c.id).find((e) => e.kind === 'milestone' && e.milestone === m.key);
        if (current) {
          openEventEditor({ caseObj: c, event: current, label: m.name });
        } else {
          stamp(c, { kind: 'milestone', milestone: m.key }, `ms:${m.key}`, 'milestone');
        }
      },
    },
    h('span', { class: 'slot-name' }, m.short),
    h('span', { class: 'slot-time' }, t != null ? `✓ ${fmtTime(t, false)}` : ''));
    return el;
  }));

  const mapCount = (ch) => sum.events.filter((e) => e.kind === 'map' && e.chamber === ch).length;
  const running = runningMap(c);
  const chamber = (ch, cls) => {
    const n = mapCount(ch);
    const isRunning = running?.chamber === ch;
    const el = h('button', {
      type: 'button',
      class: ['map-tile', `ch-${ch}`, cls, isRunning && 'is-running', fl(`map:${ch}`)],
      // The running chamber's tile ends its map (the click listener on the screen does that);
      // it doesn't start a new one.
      dataset: isRunning ? { running: '1' } : undefined,
      'aria-label': isRunning ? `End map, ${ch}` : `Start map, ${ch}`,
      onclick: () => {
        el.blur();
        if (el.dataset.running) return;
        if (debounced(el, 400)) return;
        stamp(c, { kind: 'map', chamber: ch }, `map:${ch}`, 'map');
      },
    },
    h('span', { class: 'map-name' }, ch),
    h('span', { class: 'map-count' }, isRunning
      ? `mapping since ${fmtTime(running.time, false)} · tap to end`
      : n ? `${n} map${n > 1 ? 's' : ''}` : 'map'));
    return el;
  };
  const map = h('div', { class: 'map-cluster' },
    CHAMBER_GRID.flat().map((ch) => chamber(ch)),
    chamber('CS', 'map-cs'));

  return h('div', { class: ['zone', 'zone-mid', advanced && 'zone-mid-adv'] },
    nextBtn,
    h('div', { class: 'zone-label' }, 'All milestones · tap a done one to correct'),
    slots,
    advanced ? h('div', { class: 'zone-label' }, 'Lesion sets · Start, then End') : null,
    advanced ? setsGrid(c, sum, fl) : null,
    h('div', { class: 'zone-label' }, 'Map · tap the chamber'),
    map);
}

// ---- Far edge: case details, clock, Undo, recent taps, Note, End case ----

function farZone(ctx, c, sum) {
  // "Map end" is written automatically, so it's never what Undo removes.
  const lastTap = sum.events.filter((e) => e.kind !== 'mapEnd').sort((a, b) => b.createdAt - a.createdAt)[0] ?? null;

  clockEls = { now: h('span', { class: 'far-clock-now' }), elapsed: h('span', { class: 'far-clock-elapsed' }) };
  updateClock(sum);

  const head = h('div', { class: 'far-head' },
    h('div', { class: 'far-case' },
      h('span', { class: ['pill', 'pill-proc', procClass(c.procedure)] }, h('span', { class: 'viz-key' }), c.procedure),
      h('button', { type: 'button', class: 'btn btn-menu', onclick: () => openMenu(ctx) }, icon('menu'), 'Menu')),
    segmented(SIDES.map((s) => ({ key: s.key, label: `${s.label}-sided` })), c.side, (k) => {
      if (k !== c.side) guard(() => store.updateCase(c.id, { side: k }));
    }, 'seg-wide seg-case-side'),
    segmented(MODES, caseMode(c), (k) => {
      if (k === caseMode(c)) return;
      guard(async () => { await store.setMeta('liveMode', k); await store.updateCase(c.id, { mode: k }); });
    }, 'seg-wide seg-case-side seg-mode'),
    h('div', { class: 'far-clock' }, h('span', { class: 'far-clock-now-wrap' }, icon('clock'), clockEls.now), clockEls.elapsed));

  const undoBtn = h('button', {
    type: 'button', class: 'btn btn-undo', disabled: !lastTap,
    // Undo right after a map removes the map rather than ending it.
    dataset: { keepMap: '1' },
    onclick: (e) => { e.currentTarget.blur(); doUndo(); },
  },
  h('span', { class: 'btn-undo-title' }, icon('undo'), 'Undo last tap'),
  h('span', { class: 'btn-undo-sub' }, lastTap ? `${sum.labels.get(lastTap.id)} · ${fmtTime(lastTap.time)}` : 'nothing yet'));

  const recent = [...sum.events].reverse().slice(0, 4);
  const middle = h('div', { class: 'far-recent' },
      h('div', { class: 'zone-label' }, `Recent · ${sum.events.length} taps`),
      recent.length
        ? h('ol', { class: 'timeline timeline-compact' }, recent.map((e) => h('li', null, h('button', {
          type: 'button', class: ['tl-row', `tl-${e.kind}`, e.chamber && `ch-${e.chamber}`, e.energy && `en-${e.energy}`],
          onclick: () => { openEventEditor({ caseObj: c, event: e, label: sum.labels.get(e.id) }); },
        },
        h('span', { class: 'tl-time' }, fmtTime(e.time, false)),
        h('span', { class: 'tl-dot' }),
        h('span', { class: 'tl-label' }, sum.labels.get(e.id))))))
        : h('p', { class: 'muted small' }, 'Taps appear here.'),
      sum.events.length > recent.length
        ? h('button', { type: 'button', class: 'btn btn-block', onclick: () => openAllTaps(c) }, `All ${sum.events.length} taps`)
        : null,
      h('button', {
        type: 'button', class: 'btn btn-big btn-block btn-note',
        dataset: { keepMap: '1' }, // a note doesn't end a running map
        onclick: () => { openNote(c); },
      }, icon('pencil'), sum.noteCount ? `Note (${sum.noteCount})` : 'Note'));

  return h('aside', { class: 'zone zone-far' },
    head,
    undoBtn,
    middle,
    h('button', { type: 'button', class: 'btn btn-end', onclick: () => endCase(ctx, c) }, icon('stop'), 'End case'));
}

// ---- Actions (shared by taps and keys) ----

// Queue the write synchronously, with the time taken at the tap, so taps are stored in the
// order they were made even if storage is momentarily slow.
function stamp(c, fields, key, kind) {
  const time = Date.now();
  endRunningMap(time);
  flashKey = key;
  sound(kind);
  return guard(() => store.addEvent(c.id, { ...fields, time }));
}

function doAblation() {
  const c = store.activeCase();
  if (!c) return;
  if (usesLesionMarks(c.procedure)) {
    // Keys and pedals: First lesion until it's stamped, then Last lesion.
    const hasFirst = store.eventsOf(c.id).some((e) => e.kind === 'lesion' && e.mark === 'first');
    doLesion(hasFirst ? 'last' : 'first');
    return;
  }
  const now = Date.now();
  if (now - lastAblationAt < ABLATION_REPEAT_MS) return;
  lastAblationAt = now;
  stamp(c, { kind: 'ablation' }, 'abl', 'ablation');
}

function doLesion(mark) {
  const c = store.activeCase();
  if (!c) return;
  const now = Date.now();
  if (now - lastAblationAt < 600) return; // a double tap shouldn't record two marks
  lastAblationAt = now;
  stamp(c, { kind: 'lesion', mark }, `lesion:${mark}`, 'ablation');
}

function doNext() {
  const c = store.activeCase();
  if (!c) return;
  if (nextDone && Date.now() < nextDone.until) return;
  const next = nextMilestone(c, summarize(c, store.eventsOf(c.id)));
  if (!next) return;
  const time = Date.now();
  nextDone = { label: next.short, time, until: time + NEXT_LOCK_MS };
  stamp(c, { kind: 'milestone', milestone: next.key }, 'next', 'milestone');
  setTimeout(() => { if (clockEls) liveCtx?.refresh(); }, NEXT_LOCK_MS + 50);
}

async function doUndo() {
  const c = store.activeCase();
  if (!c) return;
  // Undo the latest tap as it is now, not as it was when the button was drawn.
  await store.settled();
  const now = summarize(c, store.eventsOf(c.id));
  const last = now.events.filter((e) => e.kind !== 'mapEnd').sort((a, b) => b.createdAt - a.createdAt)[0];
  if (!last) return;
  if (nextDone) nextDone = null;
  const ok = await guard(async () => { await store.deleteEvent(last.id); return true; });
  if (ok) {
    sound('undo');
    toast(`Undone: ${now.labels.get(last.id)} at ${fmtTime(last.time)}`);
  }
}

// ---- Keyboard, keypad and foot pedal ----
//
// A Bluetooth pedal or keypad that pairs as a keyboard can stamp without looking. AirTurn
// pedals send Up / Down arrows by default (left / right pedal). On an Affera case the ablation
// keys stamp First lesion, then Last lesion.
export const KEYS = {
  ablation: [' ', 'ArrowDown', 'PageDown', 'a', 'A'],
  next: ['ArrowUp', 'PageUp', 'n', 'N'],
};

document.addEventListener('keydown', (e) => {
  if (!clockEls || !liveCtx || e.repeat) return;
  if (document.querySelector('.overlay')) return;
  const tag = e.target?.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA') return;
  const k = e.key;
  if ((e.metaKey || e.ctrlKey) && k.toLowerCase() === 'z') {
    e.preventDefault();
    doUndo();
    return;
  }
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  let action = null;
  if (KEYS.ablation.includes(k)) action = () => doAblation();
  else if (KEYS.next.includes(k)) action = doNext;
  if (!action) return;
  // Stop the key also "pressing" whichever button has focus.
  e.preventDefault();
  if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  action();
});

// ---- Clock: hours and minutes only, so nothing changes on screen every second ----

export function tick() {
  const c = store.activeCase();
  if (!c || !clockEls) return;
  updateClock(summarize(c, store.eventsOf(c.id)));
}

export function unmount() {
  clockEls = null;
  liveCtx = null;
  releaseWakeLock();
}

const pad = (n) => String(n).padStart(2, '0');
const fmtHM = (ms) => {
  const m = Math.max(0, Math.floor(ms / 60000));
  return `${Math.floor(m / 60)}:${pad(m % 60)}`;
};

function setText(el, text) {
  if (el.textContent !== text) el.textContent = text;
}

function updateClock(sum) {
  if (!clockEls) return;
  const now = Date.now();
  setText(clockEls.now, fmtTime(now, false));
  const onTable = sum.milestones.patientOnTable;
  const off = sum.milestones.patientOffTable;
  setText(clockEls.elapsed, onTable != null
    ? `On table ${fmtHM((off ?? now) - onTable)}${off ? ' (off)' : ''}`
    : `Case open ${fmtHM(now - sum.case.startedAt)}`);
}

// ---- Running map ----
//
// A map starts when its chamber is tapped and ends at the next press of anything else: the
// "Map end" event is written at that moment, before whatever the press does.

const endedMapIds = new Set();

/**
 * The map still running: the case's latest tap, if it's a map that hasn't been ended. Notes
 * don't count, so a note can be added while a map is running without ending it.
 */
function runningMap(c) {
  let last = null;
  for (const e of store.eventsOf(c.id)) {
    if (e.kind === 'note') continue;
    if (!last || e.createdAt > last.createdAt) last = e;
  }
  return last?.kind === 'map' && !endedMapIds.has(last.id) ? last : null;
}

function endRunningMap(time = Date.now()) {
  const c = store.activeCase();
  if (!c) return;
  const m = runningMap(c);
  if (!m) return;
  endedMapIds.add(m.id);
  guard(() => store.addEvent(c.id, { kind: 'mapEnd', mapId: m.id, chamber: m.chamber, time }));
}

// Any button press on the live screen ends a running map, except Undo and Note.
function endMapOnPress(e) {
  const btn = e.target.closest?.('button');
  if (!btn || btn.closest('[data-keep-map]')) return;
  endRunningMap();
}

// ---- Sheets: menu, all taps, note ----

function openMenu(ctx) {
  sheet((close) => {
    const go = (hash) => { close(); ctx.go(hash); };
    return h('div', { class: 'sheet-body' },
      h('h2', null, 'Leave the live screen?'),
      h('p', { class: 'muted' }, 'The case stays live. Come back from the Live case tab.'),
      h('div', { class: 'sheet-actions sheet-actions-stack' },
        h('button', { type: 'button', class: 'btn btn-big', onclick: () => go('#/cases') }, 'Cases'),
        h('button', { type: 'button', class: 'btn btn-big', onclick: () => go('#/dashboard') }, 'Dashboard'),
        h('button', { type: 'button', class: 'btn btn-big', onclick: () => go('#/data') }, 'Data and settings'),
        h('button', { type: 'button', class: 'btn btn-big btn-primary', onclick: close }, 'Stay on live case')));
  });
}

function openSetSheet(c, ls, st) {
  sheet((close) => {
    const row = (label, ev) => h('button', {
      type: 'button', class: 'ms-row',
      onclick: () => { close(); if (ev) openEventEditor({ caseObj: c, event: ev, label: `${label} ${ls.name}` }); },
    },
    h('span', { class: 'ms-name' }, `${label} ${ls.name}`),
    h('span', { class: 'ms-time' }, ev ? fmtTime(ev.time) : '—'),
    h('span', { class: 'ms-act' }, ev ? 'edit' : ''));
    return h('div', { class: 'sheet-body' },
      h('h2', null, ls.name),
      h('p', { class: 'muted' }, `Duration ${fmtMinutes(st.minutes)}`),
      h('div', { class: 'ms-list' }, row('Start', st.startEvent), row('End', st.endEvent)),
      h('div', { class: 'sheet-actions' },
        h('button', { type: 'button', class: 'btn btn-big btn-primary', onclick: close }, 'Done')));
  });
}

function openAllTaps(c) {
  const sum = summarize(c, store.eventsOf(c.id));
  sheet((close) => h('div', { class: 'sheet-body' },
    h('h2', null, `All taps · ${sum.events.length}`),
    h('ol', { class: 'timeline' }, [...sum.events].reverse().map((e) => h('li', null, h('button', {
      type: 'button', class: ['tl-row', `tl-${e.kind}`, e.chamber && `ch-${e.chamber}`, e.energy && `en-${e.energy}`],
      onclick: () => { close(); openEventEditor({ caseObj: c, event: e, label: sum.labels.get(e.id) }); },
    },
    h('span', { class: 'tl-time' }, fmtTime(e.time)),
    h('span', { class: 'tl-dot' }),
    h('span', { class: 'tl-label' }, sum.labels.get(e.id)),
    h('span', { class: 'tl-edit' }, 'edit'))))),
    h('div', { class: 'sheet-actions' },
      h('button', { type: 'button', class: 'btn btn-big btn-primary', onclick: close }, 'Done'))));
}

function openNote(c) {
  const at = Date.now();
  const input = h('textarea', {
    class: 'input textarea', rows: '3', maxlength: '500', autofocus: true,
    placeholder: 'Short note. No patient identifiers or dates.',
  });
  sheet((close) => {
    const save = async () => {
      const text = input.value.trim();
      if (!text) { toast('Note is empty'); return; }
      const ok = await guard(async () => { await store.addEvent(c.id, { kind: 'note', text, time: at }); return true; });
      if (ok) close();
    };
    return h('div', { class: 'sheet-body' },
      h('h2', null, `Note at ${fmtTime(at)}`),
      input,
      h('div', { class: 'sheet-actions' },
        h('button', { type: 'button', class: 'btn btn-big', onclick: close }, 'Cancel'),
        h('button', { type: 'button', class: 'btn btn-big btn-primary', onclick: save }, 'Save note')));
  });
}

// ---- End case ----

async function endCase(ctx, c) {
  endRunningMap();
  const sum = summarize(c, store.eventsOf(c.id));
  const missing = milestonesFor(c.side).filter((m) => sum.milestones[m.key] == null).map((m) => m.short);
  const yes = await confirmSheet({
    title: 'End this case?',
    message: missing.length
      ? `Not stamped: ${missing.join(', ')}. You can add them on the next screen.`
      : 'All milestones stamped.',
    confirmLabel: 'End case',
    cancelLabel: 'Keep going',
  });
  if (!yes) return;
  nextDone = null;
  const ended = await guard(() => store.updateCase(c.id, { status: 'ended', endedAt: Date.now() }));
  if (ended) ctx.go(`#/case/${c.id}/post`);
}

// ---- Keep the screen awake during a case (where supported) ----

async function requestWakeLock() {
  if (wakeLock || !navigator.wakeLock || document.visibilityState !== 'visible') return;
  try {
    wakeLock = await navigator.wakeLock.request('screen');
    wakeLock.addEventListener('release', () => { wakeLock = null; });
  } catch {
    wakeLock = null;
  }
}

function releaseWakeLock() {
  if (wakeLock) wakeLock.release().catch(() => {});
  wakeLock = null;
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && clockEls) requestWakeLock();
});
