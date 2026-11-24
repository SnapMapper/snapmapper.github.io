// Sites and operators. Cases carry only short codes (S1, OP3); the real hospital and physician
// names live in a list encrypted with a password, so exports, backups and the iPad's stored
// cases never contain them. Anyone who has the password can unlock the list on their iPad and
// see names beside the codes; the names stay in memory until the list is locked or the app
// closes, and are never written down unencrypted.
//
// Encryption: PBKDF2-SHA-256 (310,000 rounds, random salt) derives an AES-GCM 256-bit key from
// the password; the name list is encrypted with a random IV. All of it is the browser's own
// Web Crypto, on the device. There is no way to recover a forgotten password.

import * as store from './store.js';

const META = 'directory';
const FORMAT = 'mapper-log-directory';
const ITERATIONS = 310000;
const enc = new TextEncoder();
const dec = new TextDecoder();

let names = null; // { code: name } while unlocked
let password = null;

export const KINDS = {
  sites: { label: 'Sites', one: 'site', prefix: 'S', example: 'e.g. City General Hospital' },
  operators: { label: 'Operators', one: 'operator', prefix: 'OP', example: 'e.g. the physician’s name' },
};

/** Web Crypto needs a secure page (https, or localhost while developing). */
export function supported() {
  return !!globalThis.crypto?.subtle;
}

export function directory() {
  return store.getMeta(META);
}

export function codes(kind) {
  return directory()?.[kind] ?? [];
}

export function isUnlocked() {
  return names != null;
}

export function nameOf(code) {
  return names?.[code] ?? null;
}

/** "S1 · City General" when unlocked, else "S1". */
export function label(code) {
  if (!code) return '—';
  const n = nameOf(code);
  return n ? `${code} · ${n}` : code;
}

export function lock() {
  names = null;
  password = null;
}

// ---- Crypto ----

const b64 = (bytes) => btoa(String.fromCharCode(...bytes));
const unb64 = (text) => Uint8Array.from(atob(text), (ch) => ch.charCodeAt(0));

async function keyFrom(pw, salt) {
  const base = await crypto.subtle.importKey('raw', enc.encode(pw), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: ITERATIONS, hash: 'SHA-256' },
    base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'],
  );
}

async function seal(data, pw) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await keyFrom(pw, salt);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(JSON.stringify(data))));
  return { v: 1, kdf: 'PBKDF2-SHA256', iterations: ITERATIONS, salt: b64(salt), iv: b64(iv), data: b64(ct) };
}

async function unseal(sealed, pw) {
  const key = await keyFrom(pw, unb64(sealed.salt));
  try {
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(sealed.iv) }, key, unb64(sealed.data));
    return JSON.parse(dec.decode(pt));
  } catch {
    throw new Error('That password doesn’t unlock this list.');
  }
}

async function save(next) {
  const sealed = await seal(names, password);
  await store.setMeta(META, { sites: next.sites, operators: next.operators, sealed });
}

// ---- Actions ----

export async function create(pw) {
  if (!supported()) throw new Error('This page can’t encrypt. Open the app from its https address.');
  if (directory()) throw new Error('A list already exists on this iPad.');
  names = {};
  password = pw;
  await save({ sites: [], operators: [] });
}

export async function unlock(pw) {
  if (!supported()) throw new Error('This page can’t decrypt. Open the app from its https address.');
  const d = directory();
  if (!d) throw new Error('There is no list on this iPad yet.');
  names = await unseal(d.sealed, pw);
  password = pw;
}

/** Add a name; returns its new code (S4, OP7…). Needs the list unlocked. */
export async function add(kind, name) {
  if (!isUnlocked()) throw new Error('Unlock the list first.');
  const d = directory();
  const list = d[kind];
  const { prefix } = KINDS[kind];
  const used = list.map((c) => parseInt(c.slice(prefix.length), 10)).filter(Number.isFinite);
  const code = `${prefix}${(used.length ? Math.max(...used) : 0) + 1}`;
  names = { ...names, [code]: name.trim() };
  await save({ ...d, [kind]: [...list, code] });
  return code;
}

export async function rename(code, name) {
  if (!isUnlocked()) throw new Error('Unlock the list first.');
  names = { ...names, [code]: name.trim() };
  await save(directory());
}

// ---- Sharing the list between iPads (codes + encrypted names only) ----

export function exportText() {
  const d = directory();
  return JSON.stringify({ format: FORMAT, version: 1, sites: d.sites, operators: d.operators, sealed: d.sealed }, null, 1);
}

/** Check a directory object from a file or backup; returns a clean copy or null. */
export function clean(d) {
  const okCodes = (list, prefix) => Array.isArray(list) && list.every((c) => typeof c === 'string' && new RegExp(`^${prefix}\\d{1,4}$`).test(c));
  const s = d?.sealed;
  if (!okCodes(d?.sites, 'S') || !okCodes(d?.operators, 'OP')) return null;
  if (!s || typeof s.salt !== 'string' || typeof s.iv !== 'string' || typeof s.data !== 'string') return null;
  return {
    sites: [...d.sites],
    operators: [...d.operators],
    sealed: { v: 1, kdf: 'PBKDF2-SHA256', iterations: ITERATIONS, salt: s.salt, iv: s.iv, data: s.data },
  };
}

export async function importText(text) {
  let data;
  try { data = JSON.parse(text); } catch { throw new Error('That file is not valid JSON.'); }
  if (data?.format !== FORMAT) throw new Error('That file is not a Mapper Log site and operator list.');
  const d = clean(data);
  if (!d) throw new Error('The list in that file is damaged.');
  lock();
  await store.setMeta(META, d);
}

/** Adopt a list that came with a backup: replace on restore; on merge only if none here. */
export async function adoptFromBackup(d, { replace }) {
  const cleaned = clean(d);
  if (!cleaned) return 'none';
  const mine = directory();
  if (mine && !replace) return mine.sealed.data === cleaned.sealed.data ? 'same' : 'kept';
  lock();
  await store.setMeta(META, cleaned);
  return 'adopted';
}
