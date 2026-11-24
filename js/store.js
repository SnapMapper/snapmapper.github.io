// IndexedDB storage with an in-memory mirror. All data is loaded at start (a year of cases is
// small), so screens and exports read synchronously; every write goes to IndexedDB first and
// then to memory.

import { uuid, sortKey, anonymise, dueForAnonymising } from './model.js';

const DB_NAME = 'mapper-log';
const DB_VERSION = 1;

let db = null;
const cases = new Map(); // id -> case
const events = new Map(); // id -> event
const meta = new Map(); // key -> value
const listeners = new Set();

function promisify(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function run(storeNames, fn) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeNames, 'readwrite');
    let result;
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('Transaction aborted'));
    result = fn(tx);
  });
}

// Writes run one at a time, so each one builds on the result of the previous one.
let queue = Promise.resolve();
function serial(fn) {
  const p = queue.then(fn);
  queue = p.catch(() => {});
  return p;
}

/** Resolves once every write started so far has finished. */
export function settled() {
  return queue;
}

function changed() {
  for (const fn of listeners) fn();
}

export function onChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export async function open() {
  db = await new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const d = req.result;
      if (!d.objectStoreNames.contains('cases')) d.createObjectStore('cases', { keyPath: 'id' });
      if (!d.objectStoreNames.contains('events')) {
        d.createObjectStore('events', { keyPath: 'id' }).createIndex('caseId', 'caseId');
      }
      if (!d.objectStoreNames.contains('meta')) d.createObjectStore('meta', { keyPath: 'key' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('Database is open in another tab. Close it and retry.'));
  });
  const tx = db.transaction(['cases', 'events', 'meta'], 'readonly');
  const [cs, es, ms] = await Promise.all([
    promisify(tx.objectStore('cases').getAll()),
    promisify(tx.objectStore('events').getAll()),
    promisify(tx.objectStore('meta').getAll()),
  ]);
  cs.forEach((c) => cases.set(c.id, c));
  es.forEach((e) => events.set(e.id, e));
  ms.forEach((m) => meta.set(m.key, m.value));
}

// ---- Reads ----

export function allCases() {
  return [...cases.values()].sort((a, b) => sortKey(b) - sortKey(a) || (a.id < b.id ? -1 : 1));
}

export function getCase(id) {
  return cases.get(id) ?? null;
}

export function eventsOf(caseId) {
  return [...events.values()].filter((e) => e.caseId === caseId);
}

export function getEvent(id) {
  return events.get(id) ?? null;
}

export function activeCase() {
  return allCases().find((c) => c.status === 'active') ?? null;
}

export function allEvents() {
  return [...events.values()];
}

export function getMeta(key) {
  return meta.get(key) ?? null;
}

// ---- Writes ----

// Each edit bumps the case's revision; merge keeps the copy with the higher revision.
// (A counter rather than an edit time, so no clock time needs to survive anonymising.)
function touched(c) {
  const { updatedAt, ...rest } = c;
  return { ...rest, rev: (c.rev ?? 1) + 1 };
}

export function createCase({ procedure, side, site = null, operator = null }) {
  return serial(async () => {
    const c = {
      id: uuid(),
      procedure,
      side,
      source: getMeta('deviceLabel') ?? '',
      site,
      operator,
      status: 'active',
      startedAt: Date.now(),
      endedAt: null,
      outcome: null,
      notes: '',
      rev: 1,
    };
    await run(['cases'], (tx) => tx.objectStore('cases').put(c));
    cases.set(c.id, c);
    changed();
    return c;
  });
}

export function updateCase(id, patch) {
  return serial(async () => {
    if (!cases.has(id)) return null;
    const c = touched({ ...cases.get(id), ...patch });
    await run(['cases'], (tx) => tx.objectStore('cases').put(c));
    cases.set(id, c);
    changed();
    return c;
  });
}

export function addEvent(caseId, fields) {
  return serial(async () => {
    if (!cases.has(caseId)) throw new Error('Case no longer exists');
    // Things that happen once per case: a second stamp of the same one is ignored.
    const existing = eventsOf(caseId);
    if (fields.kind === 'milestone'
      && existing.some((e) => e.kind === 'milestone' && e.milestone === fields.milestone)) {
      return null;
    }
    if (fields.kind === 'lesion' && fields.mark === 'first'
      && existing.some((e) => e.kind === 'lesion' && e.mark === 'first')) {
      return null;
    }
    if (fields.kind === 'set'
      && existing.some((e) => e.kind === 'set' && e.set === fields.set && e.phase === fields.phase)) {
      return null;
    }
    const now = Date.now();
    // An anonymised case holds no clock times, so its events are ordered by a counter instead.
    // createdAt orders taps for Undo, so it must never tie: a "Map end" and the tap that caused
    // it are written in the same millisecond. An anonymised case holds no clock times, so its
    // events are ordered by a plain counter.
    const latest = Math.max(0, ...existing.map((e) => e.createdAt ?? 0));
    const createdAt = cases.get(caseId).anonymised ? latest + 1 : Math.max(now, latest + 1);
    const ev = { id: uuid(), caseId, createdAt, time: now, ...fields };
    const c = touched(cases.get(caseId));
    await run(['cases', 'events'], (tx) => {
      tx.objectStore('events').put(ev);
      tx.objectStore('cases').put(c);
    });
    events.set(ev.id, ev);
    cases.set(caseId, c);
    changed();
    return ev;
  });
}

export function updateEvent(id, patch) {
  return serial(async () => {
    if (!events.has(id)) return null;
    const prev = events.get(id);
    const ev = cases.get(prev.caseId)?.anonymised
      ? { ...prev, ...patch }
      : { ...prev, ...patch, editedAt: Date.now() };
    const c = touched(cases.get(ev.caseId));
    await run(['cases', 'events'], (tx) => {
      tx.objectStore('events').put(ev);
      tx.objectStore('cases').put(c);
    });
    events.set(id, ev);
    cases.set(c.id, c);
    changed();
    return ev;
  });
}

export function deleteEvent(id) {
  return serial(async () => {
    const ev = events.get(id);
    if (!ev) return;
    // Deleting a map also deletes its "Map end"; deleting a line's Start also deletes the
    // automatic End it caused on the line that was running before.
    const ids = [id, ...eventsOf(ev.caseId)
      .filter((e) => (e.kind === 'mapEnd' && e.mapId === id) || e.causedBy === id)
      .map((e) => e.id)];
    const c = touched(cases.get(ev.caseId));
    await run(['cases', 'events'], (tx) => {
      ids.forEach((x) => tx.objectStore('events').delete(x));
      tx.objectStore('cases').put(c);
    });
    ids.forEach((x) => events.delete(x));
    cases.set(c.id, c);
    changed();
  });
}

export function deleteCase(id) {
  return serial(async () => {
    const ids = eventsOf(id).map((e) => e.id);
    await run(['cases', 'events'], (tx) => {
      tx.objectStore('cases').delete(id);
      const es = tx.objectStore('events');
      ids.forEach((eid) => es.delete(eid));
    });
    cases.delete(id);
    ids.forEach((eid) => events.delete(eid));
    changed();
  });
}

export function setMeta(key, value) {
  return serial(async () => {
    await run(['meta'], (tx) => tx.objectStore('meta').put({ key, value }));
    meta.set(key, value);
    changed();
  });
}

/** Replace every case and event with the given ones (restore from backup). */
export function replaceAll(newCases, newEvents) {
  return serial(async () => {
    await run(['cases', 'events'], (tx) => {
      const cs = tx.objectStore('cases');
      const es = tx.objectStore('events');
      cs.clear();
      es.clear();
      newCases.forEach((c) => cs.put(c));
      newEvents.forEach((e) => es.put(e));
    });
    cases.clear();
    events.clear();
    newCases.forEach((c) => cases.set(c.id, c));
    newEvents.forEach((e) => events.set(e.id, e));
    changed();
  });
}

/**
 * Merge another device's cases in, de-duplicating by case id. A case already here is replaced
 * (with all its events) only when the incoming copy was updated more recently.
 */
export function merge(inCases, inEvents) {
  return serial(async () => {
    const byCase = new Map();
    inEvents.forEach((e) => {
      if (!byCase.has(e.caseId)) byCase.set(e.caseId, []);
      byCase.get(e.caseId).push(e);
    });
    const result = { added: 0, updated: 0, unchanged: 0 };
    const toPut = [];
    for (const c of inCases) {
      const mine = cases.get(c.id);
      if (!mine) result.added += 1;
      else if ((c.rev ?? 1) > (mine.rev ?? 1)) result.updated += 1;
      else { result.unchanged += 1; continue; }
      toPut.push(c);
    }
    if (!toPut.length) return result;
    const removeIds = toPut.flatMap((c) => eventsOf(c.id).map((e) => e.id));
    await run(['cases', 'events'], (tx) => {
      const cs = tx.objectStore('cases');
      const es = tx.objectStore('events');
      removeIds.forEach((id) => es.delete(id));
      toPut.forEach((c) => {
        cs.put(c);
        (byCase.get(c.id) ?? []).forEach((e) => es.put(e));
      });
    });
    removeIds.forEach((id) => events.delete(id));
    toPut.forEach((c) => {
      cases.set(c.id, c);
      (byCase.get(c.id) ?? []).forEach((e) => events.set(e.id, e));
    });
    changed();
    return result;
  });
}

/**
 * Anonymise in place every case whose last clock time is more than ANON_AFTER_DAYS old: the
 * clock times are replaced by offsets and the real start time is deleted. A case left live
 * that long is ended first. Returns how many cases changed.
 */
export function anonymiseDue(now = Date.now()) {
  return serial(async () => {
    const due = [...cases.values()].filter((c) => dueForAnonymising(c, eventsOf(c.id), now));
    if (!due.length) return 0;
    const results = due.map((c) => {
      const r = anonymise(c, eventsOf(c.id));
      r.case.status = 'ended';
      return r;
    });
    await run(['cases', 'events'], (tx) => {
      const cs = tx.objectStore('cases');
      const es = tx.objectStore('events');
      results.forEach((r) => {
        cs.put(r.case);
        r.events.forEach((e) => es.put(e));
      });
    });
    results.forEach((r) => {
      cases.set(r.case.id, r.case);
      r.events.forEach((e) => events.set(e.id, e));
    });
    changed();
    return results.length;
  });
}

// ---- Persistence ----

export async function requestPersist() {
  if (!navigator.storage?.persist) return null;
  try {
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch {
    return null;
  }
}

export async function persistStatus() {
  if (!navigator.storage?.persisted) return null;
  try {
    return await navigator.storage.persisted();
  } catch {
    return null;
  }
}
