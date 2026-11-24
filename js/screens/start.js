// New case: pick the case side (defaults to Left), then tap the procedure type. One tap starts a
// typical left-sided case.

import {
  PROCEDURES, SIDES, summarize, caseWhen, isoDay, fmtTime, whenLabel, fmtDate, usesLesionMarks,
} from '../model.js';
import * as store from '../store.js';
import { h, segmented, guard } from '../ui.js';
import { exportReminder } from './data.js';
import { ipadSide } from './live.js';
import { procClass, fmtMin } from '../charts.js';
import { icon } from '../icons.js';
import * as dir from '../directory.js';

let side = 'left';

const SIDE_DETAIL = {
  left: 'LA work: PVs, roof, floor, mitral',
  right: 'RA work: CTI and right-sided targets',
};

const PROCEDURE_DETAIL = {
  Affera: 'First and last lesion; totals after the case',
};

/** Where the iPad sits, so the live screen puts Ablation on the edge nearest the mapper. */
export function ipadSideControl(ctx) {
  return h('div', { class: 'group' },
    h('h3', null, 'This iPad is on my'),
    segmented([{ key: 'left', label: 'Left' }, { key: 'right', label: 'Right' }], ipadSide(),
      async (k) => { await guard(() => store.setMeta('ipadSide', k)); ctx.refresh(); }),
    h('p', { class: 'muted small' }, 'Set once. Puts Ablation on the edge nearest you.'));
}

// Site and operator for the next case: the last ones used on this iPad, until changed.
function pick(kind) {
  const saved = store.getMeta(kind === 'sites' ? 'lastSite' : 'lastOperator');
  return dir.codes(kind).includes(saved) ? saved : null;
}

function codePicker(ctx, kind) {
  const list = dir.codes(kind);
  if (!list.length) return null;
  const current = pick(kind);
  const metaKey = kind === 'sites' ? 'lastSite' : 'lastOperator';
  return h('div', { class: 'who-row' },
    h('span', { class: 'who-label' }, dir.KINDS[kind].label.slice(0, -1)),
    h('div', { class: 'chip-row', role: 'radiogroup', 'aria-label': dir.KINDS[kind].label },
      list.map((code) => h('button', {
        type: 'button', role: 'radio', 'aria-checked': String(code === current),
        class: ['chip', code === current && 'is-on'],
        onclick: async () => { await guard(() => store.setMeta(metaKey, code === current ? null : code)); ctx.refresh(); },
      }, dir.label(code)))));
}

export function render(ctx) {
  const start = async (procedure) => {
    const c = await guard(() => store.createCase({ procedure, side, site: pick('sites'), operator: pick('operators') }));
    if (!c) return;
    store.requestPersist();
    ctx.go('#/live');
  };

  const all = store.allCases();
  const thisMonth = isoDay().slice(0, 7);
  const monthCount = (p) => all.filter((c) => c.procedure === p && caseWhen(c, store.eventsOf(c.id)).month === thisMonth).length;
  const code = store.getMeta('deviceLabel');
  const lastCase = all.find((c) => c.status === 'ended');

  const header = h('div', { class: 'start-head' },
    h('div', null,
      h('h1', null, 'New case'),
      h('p', { class: 'muted start-date' }, `${fmtDate(Date.now())} · ${fmtTime(Date.now(), false)}`)),
    h('button', {
      type: 'button', class: ['device-chip', !code && 'is-missing'], onclick: () => ctx.go('#/data'),
      'aria-label': code ? `This iPad's code is ${code}. Change it on the Data tab.` : 'Set this iPad’s code on the Data tab',
    }, icon('device'), code ? h('span', null, code) : h('span', null, 'Set this iPad’s code')));

  // Step 1: case side, as two large cards.
  const sideStep = h('section', { class: 'card start-step' },
    h('div', { class: 'step-head' }, h('span', { class: 'step-num' }, '1'), h('h2', null, 'Case side')),
    h('div', { class: 'side-cards', role: 'radiogroup', 'aria-label': 'Case side' }, SIDES.map((s) => h('button', {
      type: 'button', role: 'radio', 'aria-checked': String(side === s.key),
      class: ['side-card', side === s.key && 'is-on'],
      onclick: () => { side = s.key; ctx.refresh(); },
    },
    h('span', { class: 'side-check' }, side === s.key ? icon('check') : null),
    h('span', { class: 'side-name' }, `${s.label}-sided`),
    h('span', { class: 'side-detail' }, SIDE_DETAIL[s.key])))));

  // Step 2: procedure type. Tapping one starts the case.
  const procStep = h('section', { class: 'card start-step' },
    h('div', { class: 'step-head' },
      h('span', { class: 'step-num' }, '2'),
      h('h2', null, 'Procedure type'),
      h('span', { class: 'muted step-hint' }, 'tap to start the case')),
    h('div', { class: 'proc-cards' }, PROCEDURES.map((p) => {
      const n = monthCount(p);
      return h('button', {
        type: 'button', class: ['proc-card', procClass(p)], onclick: () => start(p),
        'aria-label': `Start a ${side}-sided ${p} case`,
      },
      h('span', { class: 'proc-bar', 'aria-hidden': 'true' }),
      h('span', { class: 'proc-name' }, p),
      h('span', { class: 'proc-detail' }, PROCEDURE_DETAIL[p] ?? 'Tap each ablation'),
      h('span', { class: 'proc-foot' },
        h('span', { class: 'muted small' }, n ? `${n} this month` : 'none this month'),
        h('span', { class: 'proc-go' }, 'Start', icon('play'))));
    })));

  // Quiet extras below: where the iPad sits, the last case, reminders.
  let lastCard = null;
  if (lastCase) {
    const evs = store.eventsOf(lastCase.id);
    const sum = summarize(lastCase, evs);
    lastCard = h('button', {
      type: 'button', class: ['card', 'last-case', procClass(lastCase.procedure)], onclick: () => ctx.go(`#/case/${lastCase.id}`),
    },
    h('span', { class: 'case-stripe', 'aria-hidden': 'true' }),
    h('span', { class: 'last-body' },
      h('span', { class: 'muted small' }, 'Last case'),
      h('span', { class: 'last-title' }, `${lastCase.procedure} · ${lastCase.anonymised ? whenLabel(lastCase, evs) : fmtDate(sum.start)}`),
      h('span', { class: 'muted small' }, [
        sum.durations.roomTime != null ? `${fmtMin(sum.durations.roomTime)} room time` : 'room time incomplete',
        usesLesionMarks(lastCase.procedure)
          ? (sum.lesionTotal != null ? `${sum.lesionTotal} lesions` : 'Affera totals not entered')
          : `${sum.ablationCount} ablation${sum.ablationCount === 1 ? '' : 's'}`,
      ].join(' · '))),
    h('span', { class: 'case-chev' }, '›'));
  }

  // Site and operator (only once a list is set up on the Data tab). Remembered between cases.
  const who = dir.codes('sites').length || dir.codes('operators').length
    ? h('section', { class: 'card start-step who-step' },
      h('div', { class: 'step-head' },
        h('h2', null, 'Site and operator'),
        h('span', { class: 'muted step-hint' }, dir.isUnlocked() ? 'kept for the next case' : 'codes · unlock names on the Data tab')),
      codePicker(ctx, 'sites'),
      codePicker(ctx, 'operators'))
    : null;

  return h('section', { class: 'screen start' },
    header,
    sideStep,
    who,
    procStep,
    h('div', { class: 'start-extras' },
      h('section', { class: 'card' }, ipadSideControl(ctx)),
      lastCard),
    exportReminder(ctx),
    h('p', { class: 'privacy' },
      'This app holds no patient data, and nothing leaves this iPad unless you export it.'));
}
