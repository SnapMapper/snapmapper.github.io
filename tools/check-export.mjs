// Build a sample .xlsx with the app's own export code (no browser needed), then check it with
// tools/check-xlsx.py.
//   node tools/check-export.mjs out.xlsx && python3 tools/check-xlsx.py out.xlsx

import { writeFileSync } from 'node:fs';
import { buildXlsx } from '../js/xlsx.js';
import { buildSheets } from '../js/export-map.js';

const out = process.argv[2] ?? 'sample.xlsx';
const base = new Date(2026, 10, 23, 7, 30, 0).getTime();
const min = 60000;
const c1 = {
  id: 'case-1', procedure: 'Affera', side: 'left', status: 'ended', startedAt: base, endedAt: base + 150 * min,
  outcome: 'Completed', mode: 'advanced', lesionTotal: 212, ablationSeconds: 1125, fluoroSeconds: 335, disease: 'PAF', sedation: 'GA', registrySubmitted: true, site: 'S1', operator: 'OP2', notes: 'Smooth case & <quick> "PV" isolation\nline two', createdAt: base, updatedAt: base,
};
const c2 = {
  id: 'case-2', procedure: 'Focal Cryo', side: 'right', status: 'ended', startedAt: base + 300 * min, endedAt: null,
  outcome: null, notes: '', createdAt: base, updatedAt: base,
};
let n = 0;
const ev = (caseId, t, fields) => ({ id: `e${n += 1}`, caseId, createdAt: base + t * min, time: base + t * min, ...fields });
const events = [
  ev('case-1', 0, { kind: 'milestone', milestone: 'patientOnTable' }),
  ev('case-1', 20, { kind: 'milestone', milestone: 'cut' }),
  ev('case-1', 32, { kind: 'milestone', milestone: 'transseptalPuncture' }),
  ev('case-1', 35, { kind: 'map', chamber: 'LA' }),
  ev('case-1', 38.5, { kind: 'mapEnd', mapId: 'e4', chamber: 'LA' }),
  ev('case-1', 40, { kind: 'lesion', mark: 'first' }),
  ev('case-1', 40.5, { kind: 'set', set: 'leftWaca', phase: 'start' }),
  ev('case-1', 52, { kind: 'set', set: 'leftWaca', phase: 'end' }),
  ev('case-1', 55, { kind: 'set', set: 'floor', phase: 'start' }),
  ev('case-1', 62, { kind: 'set', set: 'floor', phase: 'end' }),
  ev('case-1', 64, { kind: 'lesion', mark: 'last' }),
  ev('case-1', 70, { kind: 'lesion', mark: 'last' }),
  ev('case-1', 75, { kind: 'note', text: 'CL changed to 300 — check' }),
  ev('case-1', 90, { kind: 'milestone', milestone: 'laWithdrawal' }),
  ev('case-1', 100, { kind: 'milestone', milestone: 'equipmentOut' }),
  ev('case-1', 110, { kind: 'milestone', milestone: 'close' }),
  ev('case-1', 120, { kind: 'milestone', milestone: 'patientOffTable' }),
  ev('case-2', 300, { kind: 'milestone', milestone: 'patientOnTable' }),
  ev('case-2', 330, { kind: 'map', chamber: 'RA', cycleLength: null }),
  ev('case-2', 335, { kind: 'ablation' }),
  ev('case-2', 340, { kind: 'ablation' }),
];
const items = [c1, c2].map((c) => ({ case: c, events: events.filter((e) => e.caseId === c.id) }));
writeFileSync(out, buildXlsx(buildSheets(items)));
console.log('wrote', out);
