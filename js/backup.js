// JSON backup file: write, read and validate. Backups are always anonymised (weekday + month,
// event times as offsets), so a backup file never carries a clock time or a date. Only known
// fields are kept on import.

import {
  EVENT_KINDS, CHAMBERS, MILESTONES, WEEKDAYS, ENERGIES, LESION_SETS, DISEASES, SEDATIONS, anonymise,
} from './model.js';

export const BACKUP_FORMAT = 'mapper-log-backup';
export const BACKUP_VERSION = 2;

/** items: [{ case, events }]; directory: the site / operator list (codes + encrypted names). */
export function makeBackup(items, directory = null) {
  const anon = items.map(({ case: c, events }) => anonymise(c, events))
    // Order by id, not by time, so the file does not reveal the order cases happened in.
    .sort((a, b) => (a.case.id < b.case.id ? -1 : 1));
  return JSON.stringify({
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    cases: anon.map((a) => a.case),
    events: anon.flatMap((a) => a.events),
    ...(directory ? { directory } : {}),
  }, null, 1);
}

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const str = (v, max) => (typeof v === 'string' ? v.slice(0, max) : null);
const num = (v) => (isNum(v) ? v : null);

function cleanCase(c, version) {
  if (!c || typeof c.id !== 'string') return null;
  const out = {
    id: c.id.slice(0, 64),
    procedure: str(c.procedure, 40) ?? 'Unknown',
    side: c.side === 'right' ? 'right' : 'left',
    source: str(c.source, 40) ?? '',
    // An imported case can't be live on this iPad: its clock times are gone.
    status: 'ended',
    outcome: str(c.outcome, 60),
    notes: str(c.notes, 2000) ?? '',
    rev: Number.isInteger(c.rev) && c.rev > 0 ? c.rev : 1,
    mode: c.mode === 'advanced' ? 'advanced' : 'basic',
    lesionTotal: Number.isInteger(c.lesionTotal) && c.lesionTotal >= 0 ? c.lesionTotal : null,
    ablationSeconds: isNum(c.ablationSeconds) && c.ablationSeconds >= 0 ? Math.round(c.ablationSeconds) : null,
    fluoroSeconds: isNum(c.fluoroSeconds) && c.fluoroSeconds >= 0 ? Math.round(c.fluoroSeconds) : null,
    disease: DISEASES.includes(c.disease) ? c.disease : null,
    sedation: SEDATIONS.includes(c.sedation) ? c.sedation : null,
    registrySubmitted: typeof c.registrySubmitted === 'boolean' ? c.registrySubmitted : null,
    site: typeof c.site === 'string' && /^S\d{1,4}$/.test(c.site) ? c.site : null,
    operator: typeof c.operator === 'string' && /^OP\d{1,4}$/.test(c.operator) ? c.operator : null,
  };
  if (version === 1) {
    // Version 1 (before anonymising) carried clock times; anonymise() below drops them.
    if (!isNum(c.startedAt)) return null;
    out.startedAt = c.startedAt;
    return out;
  }
  if (!WEEKDAYS.includes(c.weekday) || !/^\d{4}-\d{2}$/.test(c.month ?? '')) return null;
  return { ...out, anonymised: true, weekday: c.weekday, month: c.month };
}

const MILESTONE_KEYS = new Set(MILESTONES.map((m) => m.key));
const SET_KEYS = new Set(LESION_SETS.map((x) => x.key));

function cleanEvent(e) {
  if (!e || typeof e.id !== 'string' || typeof e.caseId !== 'string' || !isNum(e.time)) return null;
  if (!EVENT_KINDS.includes(e.kind)) return null;
  const out = {
    id: e.id.slice(0, 64),
    caseId: e.caseId.slice(0, 64),
    kind: e.kind,
    time: e.time,
    createdAt: num(e.createdAt) ?? 0,
  };
  if (e.kind === 'milestone') {
    if (!MILESTONE_KEYS.has(e.milestone)) return null;
    out.milestone = e.milestone;
  }
  if (e.kind === 'mapEnd') {
    if (typeof e.mapId !== 'string') return null;
    out.mapId = e.mapId.slice(0, 64);
    out.chamber = CHAMBERS.includes(e.chamber) ? e.chamber : null;
  }
  if (e.kind === 'map') {
    out.chamber = CHAMBERS.includes(e.chamber) ? e.chamber : null;
    out.cycleLength = isNum(e.cycleLength) && e.cycleLength > 0 ? Math.round(e.cycleLength) : null;
  }
  if (e.kind === 'note') out.text = str(e.text, 500) ?? '';
  if (e.kind === 'ablation' && ENERGIES.includes(e.energy)) out.energy = e.energy;
  if (e.kind === 'lesion') {
    if (e.mark !== 'first' && e.mark !== 'last') return null;
    out.mark = e.mark;
  }
  if (e.kind === 'set') {
    if (!SET_KEYS.has(e.set) || (e.phase !== 'start' && e.phase !== 'end')) return null;
    out.set = e.set;
    out.phase = e.phase;
    if (e.auto === true) out.auto = true;
    if (typeof e.causedBy === 'string') out.causedBy = e.causedBy.slice(0, 64);
  }
  return out;
}

/** Parse a backup file's text into anonymised cases and events. Throws a readable message. */
export function parseBackup(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('That file is not valid JSON.');
  }
  if (data?.format !== BACKUP_FORMAT) throw new Error('That file is not a Mapper Log backup.');
  if (data.version > BACKUP_VERSION) throw new Error('That backup is from a newer version of Mapper Log. Update this app first.');
  if (!Array.isArray(data.cases) || !Array.isArray(data.events)) throw new Error('The backup is missing its cases or events.');
  const version = data.version === 1 ? 1 : 2;
  const cleaned = data.cases.map((c) => cleanCase(c, version)).filter(Boolean);
  const ids = new Set(cleaned.map((c) => c.id));
  const evs = data.events.map(cleanEvent).filter((e) => e && ids.has(e.caseId));
  const byCase = new Map(cleaned.map((c) => [c.id, []]));
  evs.forEach((e) => byCase.get(e.caseId).push(e));
  const anon = cleaned.map((c) => anonymise(c, byCase.get(c.id)));
  const skipped = (data.cases.length - cleaned.length) + (data.events.length - evs.length);
  return {
    cases: anon.map((a) => a.case), events: anon.flatMap((a) => a.events), skipped, directory: data.directory ?? null,
  };
}
