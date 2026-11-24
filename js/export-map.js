// The Excel column mapping, all in one place.
//
// When the dashboard workbook arrives, this is the file to change: rename or reorder columns,
// add fields, or point the export at the template's sheet names. Each column is
//   { header, type, width, value: (row) => value }
// where `type` is one of the types xlsx.js understands (text, int, number, minutes, ...).
//
// The export is always anonymised: a case carries only its weekday and month, and every time
// is in minutes after the reference point (Patient on table, else the first event). No clock
// time or date is written.

import {
  MILESTONES, DURATIONS, LESION_SETS, PROCEDURES, sideLabel, summarize, anonymise, caseWhen, referenceOf,
  usesLesionMarks, stats,
} from './model.js';

export const CASES_SHEET = 'Cases';
export const EVENTS_SHEET = 'Events';
export const SUMMARY_SHEET = 'Summary';

const toMin = (ms) => (ms == null ? null : ms / 60000);

/** One row per case. `s` is summarize() of the anonymised case, plus `when` and `ref`. */
export const CASE_COLUMNS = [
  { header: 'Case ID', type: 'text', width: 38, value: (s) => s.case.id },
  { header: 'Source', type: 'text', width: 12, value: (s) => s.case.source },
  { header: 'Weekday', type: 'text', width: 9, value: (s) => s.when.weekday },
  { header: 'Weekday no. (Mon=1)', type: 'int', width: 10, value: (s) => s.when.weekdayNo },
  { header: 'Month', type: 'text', width: 9, value: (s) => s.when.month },
  { header: 'Procedure type', type: 'text', width: 14, value: (s) => s.case.procedure },
  { header: 'Side', type: 'text', width: 8, value: (s) => sideLabel(s.case.side) },
  // Codes only: the names behind them stay in the encrypted list on the iPad.
  { header: 'Site', type: 'text', width: 8, value: (s) => s.case.site },
  { header: 'Operator', type: 'text', width: 9, value: (s) => s.case.operator },
  { header: 'Disease treated', type: 'text', width: 10, value: (s) => s.case.disease },
  { header: 'Sedation', type: 'text', width: 9, value: (s) => s.case.sedation },
  { header: 'Times in minutes after', type: 'text', width: 18, value: (s) => s.ref?.label },
  ...MILESTONES.map((m) => ({
    header: `${m.name} (min)`, type: 'minutes', width: 12, value: (s) => toMin(s.milestones[m.key]),
  })),
  { header: 'First ablation (min)', type: 'minutes', width: 12, value: (s) => toMin(s.firstAblation) },
  { header: 'Last ablation (min)', type: 'minutes', width: 12, value: (s) => toMin(s.lastAblation) },
  ...DURATIONS.map((d) => ({
    header: `${d.name} (min)`, type: 'minutes', width: 12, value: (s) => s.durations[d.key],
  })),
  // Ablation taps (PFA, Cryo, Focal Cryo). Affera records First / Last lesion instead.
  { header: 'Ablations (tapped)', type: 'int', width: 10, value: (s) => (usesLesionMarks(s.case.procedure) ? null : s.ablationCount) },
  // Affera: typed in from the Affera summary after the case.
  { header: 'Lesions (Affera)', type: 'int', width: 10, value: (s) => s.lesionTotal },
  { header: 'Ablation time, Affera (min)', type: 'minutes', width: 12, value: (s) => s.afferaAblationMinutes },
  { header: 'Fluoroscopy time (min)', type: 'minutes', width: 12, value: (s) => s.fluoroMinutes },
  { header: 'Maps', type: 'int', width: 8, value: (s) => s.mapCount },
  { header: 'Mapping time (min)', type: 'minutes', width: 12, value: (s) => s.mappingMinutes },
  // Advanced mode: each lesion set's start, end and duration.
  ...LESION_SETS.flatMap((ls) => [
    { header: `${ls.name} start (min)`, type: 'minutes', width: 12, value: (s) => toMin(s.sets[ls.key]?.start) },
    { header: `${ls.name} end (min)`, type: 'minutes', width: 12, value: (s) => toMin(s.sets[ls.key]?.end) },
    { header: `${ls.name} duration (min)`, type: 'minutes', width: 12, value: (s) => s.sets[ls.key]?.minutes },
  ]),
  { header: 'Mode', type: 'text', width: 10, value: (s) => s.case.mode ?? 'basic' },
  { header: 'Outcome', type: 'text', width: 14, value: (s) => s.case.outcome },
  { header: 'Registry submitted', type: 'text', width: 10, value: (s) => (s.case.registrySubmitted == null ? null : s.case.registrySubmitted ? 'Yes' : 'No') },
  { header: 'Status', type: 'text', width: 8, value: (s) => s.case.status },
  { header: 'Notes', type: 'text', width: 40, value: (s) => s.case.notes },
];

/** One row per event. `r` is { s: case summary, ev: event, seq }. */
export const EVENT_COLUMNS = [
  { header: 'Case ID', type: 'text', width: 38, value: (r) => r.s.case.id },
  { header: 'Source', type: 'text', width: 12, value: (r) => r.s.case.source },
  { header: 'Weekday', type: 'text', width: 9, value: (r) => r.s.when.weekday },
  { header: 'Month', type: 'text', width: 9, value: (r) => r.s.when.month },
  { header: 'Procedure type', type: 'text', width: 14, value: (r) => r.s.case.procedure },
  { header: 'Seq', type: 'int', width: 6, value: (r) => r.seq },
  { header: 'Minutes after reference', type: 'minutes', width: 14, value: (r) => toMin(r.ev.time) },
  { header: 'Type', type: 'text', width: 10, value: (r) => r.ev.kind },
  { header: 'Event', type: 'text', width: 24, value: (r) => r.s.labels.get(r.ev.id) },
  { header: 'Chamber', type: 'text', width: 9, value: (r) => r.ev.chamber },
  { header: 'Map duration (min)', type: 'minutes', width: 12, value: (r) => (r.ev.kind === 'map' ? r.s.mapMinutes.get(r.ev.id) : null) },
  { header: 'Note', type: 'text', width: 40, value: (r) => (r.ev.kind === 'note' ? r.ev.text : null) },
];

// Summary: for each procedure type (and all together), each measure's spread over ended cases:
// median and mean ± SD side by side, plus the fastest / lowest and longest / highest.
const SUMMARY_MEASURES = [
  ...DURATIONS.map((d) => ({ name: `${d.name} (min)`, value: (s) => s.durations[d.key] })),
  { name: 'Mapping time (min)', value: (s) => s.mappingMinutes },
  { name: 'Fluoroscopy time (min)', value: (s) => s.fluoroMinutes },
  { name: 'Lesions (Affera)', value: (s) => s.lesionTotal, only: (p) => usesLesionMarks(p) },
  { name: 'Ablation time, Affera (min)', value: (s) => s.afferaAblationMinutes, only: (p) => usesLesionMarks(p) },
  { name: 'Ablations (tapped)', value: (s) => s.ablationCount, only: (p) => !usesLesionMarks(p) },
];

export const SUMMARY_COLUMNS = [
  { header: 'Procedure type', type: 'text', width: 14 },
  { header: 'Measure', type: 'text', width: 30 },
  { header: 'Cases', type: 'int', width: 8 },
  { header: 'Median', type: 'minutes', width: 10 },
  { header: 'Mean', type: 'minutes', width: 10 },
  { header: 'SD', type: 'minutes', width: 10 },
  { header: 'Fastest / lowest', type: 'minutes', width: 14 },
  { header: 'Longest / highest', type: 'minutes', width: 14 },
];

export function summaryRows(sums) {
  const ended = sums.filter((s) => s.case.status === 'ended');
  const groups = [
    ...PROCEDURES.map((p) => ({ label: p, proc: p, rows: ended.filter((s) => s.case.procedure === p) })),
    { label: 'All', proc: null, rows: ended },
  ].filter((g) => g.rows.length);
  const out = [];
  for (const g of groups) {
    for (const m of SUMMARY_MEASURES) {
      if (m.only && (g.proc ? !m.only(g.proc) : false)) continue;
      const st = stats(g.rows.map(m.value));
      if (!st.n) continue;
      out.push([g.label, m.name, st.n, st.median, st.mean, st.sd, st.min, st.max]);
    }
  }
  return out;
}

/**
 * Build the sheet specs for buildXlsx() from [{ case, events }].
 * Rows are ordered by month, weekday, then case id: never by time, so row order does not
 * reveal which day a case was.
 */
export function buildSheets(items) {
  const sums = items.map(({ case: c, events }) => {
    const anon = anonymise(c, events);
    return {
      ...summarize(anon.case, anon.events),
      when: caseWhen(anon.case, anon.events),
      ref: referenceOf(anon.events),
    };
  }).sort((a, b) => a.when.month.localeCompare(b.when.month)
    || a.when.weekdayNo - b.when.weekdayNo
    || (a.case.id < b.case.id ? -1 : 1));
  const eventRows = sums.flatMap((s) => s.events.map((ev, i) => ({ s, ev, seq: i + 1 })));
  return [
    { name: CASES_SHEET, columns: CASE_COLUMNS, rows: sums.map((s) => CASE_COLUMNS.map((c) => c.value(s))) },
    { name: EVENTS_SHEET, columns: EVENT_COLUMNS, rows: eventRows.map((r) => EVENT_COLUMNS.map((c) => c.value(r))) },
    { name: SUMMARY_SHEET, columns: SUMMARY_COLUMNS, rows: summaryRows(sums) },
  ];
}
