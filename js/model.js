// Domain vocabulary and derived values. Names follow the companion case-logging app's milestone
// and procedure-type names, so both use the same words, except "Sheath out" (there: "Equipment
// out"), renamed by request.

export const PROCEDURES = ['Affera', 'PFA', 'Cryo', 'Focal Cryo'];

export const SIDES = [
  { key: 'left', label: 'Left' },
  { key: 'right', label: 'Right' },
];

// In the order they happen in a case. This order drives the Next milestone button, the live
// screen's slots, the case screen and the Excel columns.
// LA withdrawal = all equipment out of the LA; Sheath out = sheaths out of the patient, before
// the access site is closed.
export const MILESTONES = [
  { key: 'patientOnTable', name: 'Patient on table', short: 'On Table' },
  { key: 'cut', name: 'Cut', short: 'Cut' },
  { key: 'transseptalPuncture', name: 'Transseptal puncture', short: 'Transseptal', leftOnly: true },
  { key: 'laWithdrawal', name: 'LA withdrawal', short: 'LA Out', leftOnly: true },
  // The stored key stays 'equipmentOut' so existing cases and backups still read correctly.
  { key: 'equipmentOut', name: 'Sheath out', short: 'Sheath Out' },
  { key: 'close', name: 'Close', short: 'Close' },
  { key: 'patientOffTable', name: 'Patient off table', short: 'Off Table' },
];

export const CHAMBERS = ['LA', 'RA', 'LV', 'RV', 'CS'];

// Post-case outcome choices. Placeholder until the dashboard workbook defines the real list.
export const OUTCOMES = ['Completed', 'Not completed'];

// Post-case details (from the Sphere-360 data feedback form, kept for Affera and the rest).
export const DISEASES = ['PAF', 'PersAF', 'Other'];
export const SEDATIONS = ['GA', 'Sedation'];

export const EVENT_KINDS = ['milestone', 'ablation', 'map', 'mapEnd', 'note', 'lesion', 'set'];

// Affera cases can have hundreds of lesions, too many to tap. They record only First lesion and
// Last lesion live; the total lesion count and ablation time are typed in after the case from
// the Affera summary. Other procedure types record a tap per ablation.
export function usesLesionMarks(procedure) {
  return procedure === 'Affera';
}

// Ablation energy on per-tap ablations recorded before Affera moved to lesion marks. Kept so
// those older entries still read correctly.
export const ENERGIES = ['PF', 'RF'];

// Advanced mode: lesion sets with a Start and an End time. Left-atrial sets don't apply to a
// right-sided case.
export const LESION_SETS = [
  { key: 'leftWaca', name: 'Left WACA', leftOnly: true },
  { key: 'rightWaca', name: 'Right WACA', leftOnly: true },
  { key: 'roof', name: 'Roof line', leftOnly: true },
  { key: 'floor', name: 'Floor line', leftOnly: true },
  { key: 'mitral', name: 'Mitral line', leftOnly: true },
  { key: 'cti', name: 'CTI line' },
];

export function lesionSet(key) {
  return LESION_SETS.find((x) => x.key === key);
}

export const MODES = [
  { key: 'basic', label: 'Basic' },
  { key: 'advanced', label: 'Advanced' },
];

// Derived durations, each from one time point to another (minutes).
export const DURATIONS = [
  { key: 'roomTime', name: 'Room time', from: 'patientOnTable', to: 'patientOffTable' },
  { key: 'procedureTime', name: 'Procedure time', from: 'cut', to: 'close' },
  { key: 'cutToTransseptal', name: 'Cut → transseptal', from: 'cut', to: 'transseptalPuncture' },
  { key: 'laDwell', name: 'LA dwell', from: 'transseptalPuncture', to: 'laWithdrawal' },
  // First to last ablation (on Affera, First lesion to Last lesion). Not the same as the
  // energy-on ablation time Affera reports, which is typed in after the case.
  { key: 'ablationTime', name: 'First → last ablation', from: 'firstAblation', to: 'lastAblation' },
];

// A case split into five phases that every case type has (used by the dashboard and the case
// list). Each is the time between two points; a missing point leaves that phase empty.
export const PHASES = [
  { key: 'prep', name: 'Prep', long: 'On table → cut', from: 'patientOnTable', to: 'cut' },
  { key: 'toAblation', name: 'To ablation', long: 'Cut → first ablation', from: 'cut', to: 'firstAblation' },
  { key: 'ablation', name: 'Ablation', long: 'First → last ablation', from: 'firstAblation', to: 'lastAblation' },
  { key: 'closing', name: 'Closing', long: 'Last ablation → close', from: 'lastAblation', to: 'close' },
  { key: 'exit', name: 'Exit', long: 'Close → off table', from: 'close', to: 'patientOffTable' },
];

/** Missing steps worth flagging on an ended case (empty when complete). */
export function attentionFor(sum) {
  const c = sum.case;
  if (c.status !== 'ended') return [];
  const out = [];
  const missing = milestonesFor(c.side).filter((m) => sum.milestones[m.key] == null);
  if (missing.length) out.push(missing.length === 1 ? `${missing[0].short} not stamped` : `${missing.length} milestones missing`);
  if (usesLesionMarks(c.procedure) && sum.lesionTotal == null) out.push('Affera totals not entered');
  if (c.fluoroSeconds == null || !c.disease || !c.sedation) out.push('Post-case details missing');
  if (Object.values(sum.durations).some((v) => v != null && v < 0)) out.push('Times out of order');
  return out;
}

export function milestonesFor(side) {
  return MILESTONES.filter((m) => side !== 'right' || !m.leftOnly);
}

export function milestone(key) {
  return MILESTONES.find((m) => m.key === key);
}

export function sideLabel(side) {
  return side === 'right' ? 'Right' : 'Left';
}

export function byTime(a, b) {
  return a.time - b.time || a.createdAt - b.createdAt;
}

/** Everything the screens and the export need about one case. */
export function summarize(c, events) {
  const sorted = [...events].sort(byTime);
  const milestones = {};
  const labels = new Map();
  let ablN = 0;
  let mapN = 0;
  const ablations = [];
  const byEnergy = { PF: [], RF: [] };
  const maps = [];
  const mapEnds = [];
  const firstMarks = [];
  const lastMarks = [];
  const sets = {};
  for (const ev of sorted) {
    if (ev.kind === 'milestone') {
      if (milestones[ev.milestone] == null) milestones[ev.milestone] = ev.time;
      labels.set(ev.id, milestone(ev.milestone)?.name ?? ev.milestone);
    } else if (ev.kind === 'ablation') {
      ablN += 1;
      ablations.push(ev);
      if (byEnergy[ev.energy]) {
        byEnergy[ev.energy].push(ev);
        labels.set(ev.id, `${ev.energy} ablation #${byEnergy[ev.energy].length}`);
      } else {
        labels.set(ev.id, `Ablation #${ablN}`);
      }
    } else if (ev.kind === 'map') {
      mapN += 1;
      maps.push(ev);
      labels.set(ev.id, `Map ${ev.chamber ?? ''}`.trim());
    } else if (ev.kind === 'mapEnd') {
      mapEnds.push(ev);
    } else if (ev.kind === 'note') {
      labels.set(ev.id, `Note: ${ev.text ?? ''}`);
    } else if (ev.kind === 'lesion') {
      (ev.mark === 'first' ? firstMarks : lastMarks).push(ev);
    } else if (ev.kind === 'set') {
      const st = (sets[ev.set] ??= { start: null, end: null, startEvent: null, endEvent: null });
      const name = lesionSet(ev.set)?.name ?? ev.set;
      if (ev.phase === 'start') {
        if (st.start == null) { st.start = ev.time; st.startEvent = ev; }
        labels.set(ev.id, `Start ${name}`);
      } else {
        st.end = ev.time;
        st.endEvent = ev;
        labels.set(ev.id, ev.auto ? `End ${name} (auto)` : `End ${name}`);
      }
    }
  }
  // Last lesion: each tap records a new mark; the latest counts, earlier ones are kept (so Undo
  // brings the previous one back) and labelled as replaced.
  firstMarks.forEach((ev, i) => labels.set(ev.id, i === 0 ? 'First lesion' : 'First lesion (duplicate)'));
  lastMarks.forEach((ev, i) => labels.set(ev.id, i === lastMarks.length - 1 ? 'Last lesion' : 'Last lesion (replaced)'));
  const firstLesion = firstMarks[0]?.time ?? null;
  const lastLesion = lastMarks.at(-1)?.time ?? null;
  for (const st of Object.values(sets)) st.minutes = minutesBetween(st.start, st.end);

  // Each map runs from its chamber tap to its "Map end" (written automatically by the next press).
  const mapMinutes = new Map();
  for (const end of mapEnds) {
    const start = maps.find((m) => m.id === end.mapId);
    const mins = start ? minutesBetween(start.time, end.time) : null;
    if (start) mapMinutes.set(start.id, mins);
    labels.set(end.id, `Map ${start?.chamber ?? end.chamber ?? ''} end${mins != null ? ` · ${fmtMinutes(mins)}` : ''}`);
  }
  const mapDurations = [...mapMinutes.values()].filter((m) => m != null && m >= 0);

  const firstTimes = [ablations[0]?.time, firstLesion].filter((t) => t != null);
  const lastTimes = [ablations.at(-1)?.time, lastLesion].filter((t) => t != null);
  const points = {
    ...milestones,
    firstAblation: firstTimes.length ? Math.min(...firstTimes) : null,
    lastAblation: lastTimes.length ? Math.max(...lastTimes) : null,
  };
  const durations = {};
  for (const d of DURATIONS) durations[d.key] = minutesBetween(points[d.from], points[d.to]);
  const phases = {};
  for (const ph of PHASES) phases[ph.key] = minutesBetween(points[ph.from], points[ph.to]);
  const start = milestones.patientOnTable ?? sorted[0]?.time ?? c.startedAt;
  return {
    case: c,
    events: sorted,
    labels,
    milestones,
    points,
    firstAblation: points.firstAblation,
    lastAblation: points.lastAblation,
    ablationCount: ablations.length,
    firstLesion,
    lastLesion,
    lastLesionMarks: lastMarks.length,
    sets,
    // Affera: the totals typed in after the case. Otherwise: the number of ablation taps.
    lesionTotal: Number.isInteger(c.lesionTotal) ? c.lesionTotal : null,
    fluoroMinutes: Number.isFinite(c.fluoroSeconds) ? c.fluoroSeconds / 60 : null,
    afferaAblationMinutes: Number.isFinite(c.ablationSeconds) ? c.ablationSeconds / 60 : null,
    ablationTotal: usesLesionMarks(c.procedure)
      ? (Number.isInteger(c.lesionTotal) ? c.lesionTotal : null)
      : ablations.length,
    mapCount: maps.length,
    mapMinutes,
    mappingMinutes: mapDurations.length ? mapDurations.reduce((a, b) => a + b, 0) : null,
    noteCount: sorted.filter((e) => e.kind === 'note').length,
    durations,
    phases,
    start,
  };
}

export function minutesBetween(a, b) {
  if (a == null || b == null) return null;
  return (b - a) / 60000;
}

/** { n, median, mean, sd, min, max } of the usable values (negatives are bad data, dropped). */
export function stats(values) {
  const v = values.filter((x) => x != null && Number.isFinite(x) && x >= 0);
  if (!v.length) return { n: 0, median: null, mean: null, sd: null, min: null, max: null };
  const mean = v.reduce((a, b) => a + b, 0) / v.length;
  const sd = v.length > 1 ? Math.sqrt(v.reduce((a, b) => a + (b - mean) ** 2, 0) / (v.length - 1)) : null;
  return { n: v.length, median: median(v), mean, sd, min: Math.min(...v), max: Math.max(...v) };
}

export function median(values) {
  const v = values.filter((x) => x != null && Number.isFinite(x) && x >= 0).sort((a, b) => a - b);
  if (!v.length) return null;
  const mid = Math.floor(v.length / 2);
  return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
}

// ---- Formatting (24-hour clock) ----

const pad = (n) => String(n).padStart(2, '0');

export function fmtTime(ms, seconds = true) {
  if (ms == null) return '—';
  const d = new Date(ms);
  const hm = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  return seconds ? `${hm}:${pad(d.getSeconds())}` : hm;
}

export function fmtDate(ms) {
  if (ms == null) return '—';
  return new Date(ms).toLocaleDateString(undefined, {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
  });
}

export function fmtElapsed(ms) {
  if (ms == null || ms < 0) return '0:00:00';
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 3600)}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
}

export function fmtMinutes(min) {
  if (min == null) return '—';
  const sign = min < 0 ? '−' : '';
  const m = Math.round(Math.abs(min));
  if (m < 60) return `${sign}${m} min`;
  return `${sign}${Math.floor(m / 60)} h ${pad(m % 60)} min`;
}

export function isoDay(ms = Date.now()) {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function stampForFile(ms = Date.now()) {
  const d = new Date(ms);
  return `${isoDay(ms)}-${pad(d.getHours())}${pad(d.getMinutes())}`;
}

export function uuid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

// ---- Anonymisation ----
//
// To keep case data from identifying a patient, a case is reduced to its weekday and month,
// and every event time becomes an offset from a reference point (Patient on table, else the
// first event). Exports and backups are always anonymised; cases stored on the iPad keep
// clock times for ANON_AFTER_DAYS after the case so they can be corrected, then are
// anonymised in place and the real times are deleted.

export const ANON_AFTER_DAYS = 7;
export const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** The point event times are measured from: { time, label }, or null with no events. */
export function referenceOf(events) {
  const onTable = events.find((e) => e.kind === 'milestone' && e.milestone === 'patientOnTable');
  if (onTable) return { time: onTable.time, label: 'Patient on table' };
  if (!events.length) return null;
  return { time: Math.min(...events.map((e) => e.time)), label: 'First event' };
}

/** { weekday: 'Tue', weekdayNo: 2 (ISO, Mon = 1), month: '2026-11' } */
export function caseWhen(c, events) {
  if (c.anonymised) {
    return { weekday: c.weekday, weekdayNo: WEEKDAYS.indexOf(c.weekday) + 1, month: c.month };
  }
  const d = new Date(referenceOf(events)?.time ?? c.startedAt);
  const iso = (d.getDay() + 6) % 7; // Monday = 0
  return { weekday: WEEKDAYS[iso], weekdayNo: iso + 1, month: `${d.getFullYear()}-${pad(d.getMonth() + 1)}` };
}

export function monthLabel(month) {
  const m = /^(\d{4})-(\d{2})$/.exec(month ?? '');
  return m ? `${MONTHS[+m[2] - 1]} ${m[1]}` : '—';
}

/** "Tue, Nov 2026" */
export function whenLabel(c, events) {
  const w = caseWhen(c, events);
  return `${w.weekday}, ${monthLabel(w.month)}`;
}

/** Sort key for newest-first lists. Anonymised cases sort by month only. */
export function sortKey(c) {
  if (!c.anonymised) return c.startedAt;
  const m = /^(\d{4})-(\d{2})$/.exec(c.month ?? '');
  return m ? new Date(+m[1], +m[2] - 1, 1).getTime() : 0;
}

/** The last clock time a case has, used to decide when it is due for anonymising. */
function lastClockTime(c, events) {
  return Math.max(c.startedAt ?? 0, c.endedAt ?? 0, ...events.map((e) => e.time));
}

export function dueForAnonymising(c, events, now = Date.now()) {
  if (c.anonymised) return false;
  return now - lastClockTime(c, events) > ANON_AFTER_DAYS * 86400000;
}

/**
 * Return an anonymised copy of a case and its events. Idempotent: an already anonymised case
 * is re-anchored on its reference point. Clock-time fields are dropped, not copied.
 */
export function anonymise(c, events) {
  const when = caseWhen(c, events);
  const ref = referenceOf(events);
  const base = ref?.time ?? 0;
  const out = [...events].sort(byTime).map((e, i) => {
    const { editedAt, ...rest } = e;
    return { ...rest, time: e.time - base, createdAt: i + 1 };
  });
  const { startedAt, endedAt, createdAt, updatedAt, ...rest } = c;
  return {
    case: {
      ...rest,
      anonymised: true,
      weekday: when.weekday,
      month: when.month,
      rev: c.rev ?? 1,
    },
    events: out,
  };
}

/** "T+18:30" style offset for anonymised times. */
export function fmtRel(ms) {
  if (ms == null) return '—';
  const sign = ms < 0 ? '−' : '+';
  const s = Math.round(Math.abs(ms) / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h ? `T${sign}${h}:${pad(m)}:${pad(s % 60)}` : `T${sign}${m}:${pad(s % 60)}`;
}

/** An event time as the case stores it: a clock time, or an offset once anonymised. */
export function fmtAt(c, ms, seconds = true) {
  return c?.anonymised ? fmtRel(ms) : fmtTime(ms, seconds);
}
