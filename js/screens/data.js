// Export, backup, restore, merge, and storage status.

import { fmtDate, stampForFile, isoDay, ANON_AFTER_DAYS } from '../model.js';
import * as store from '../store.js';
import { h, guard, toast, confirmSheet, segmented } from '../ui.js';
import { buildXlsx, XLSX_MIME } from '../xlsx.js';
import { buildSheets } from '../export-map.js';
import { makeBackup, parseBackup } from '../backup.js';
import { shareOrDownload, canShareFiles } from '../share.js';
import { tick, soundOn } from '../sound.js';
import { ipadSideControl } from './start.js';
import * as dir from '../directory.js';
import { sheet } from '../ui.js';

const REMIND_AFTER_DAYS = 7;

export function daysSinceExport() {
  const t = store.getMeta('lastExportAt');
  if (t == null) return null;
  return Math.floor((Date.now() - t) / 86400000);
}

export function exportOverdue() {
  if (!store.allCases().length) return false;
  const d = daysSinceExport();
  return d == null || d >= REMIND_AFTER_DAYS;
}

/** "Last exported N days ago" line, shown on several screens. */
export function exportReminder(ctx) {
  const n = store.allCases().length;
  if (!n) return null;
  const d = daysSinceExport();
  let text;
  if (d == null) text = 'Never exported';
  else if (d === 0) text = 'Last exported today';
  else if (d === 1) text = 'Last exported 1 day ago';
  else text = `Last exported ${d} days ago`;
  return h('button', {
    type: 'button', class: ['reminder', exportOverdue() && 'is-overdue'], onclick: () => ctx.go('#/data'),
  }, h('span', null, text), h('span', { class: 'muted small' }, `${n} case${n === 1 ? '' : 's'} on this iPad · Export or back up ›`));
}

async function markExported(kind) {
  const now = Date.now();
  await store.setMeta('lastExportAt', now);
  await store.setMeta(kind, now);
}

function items() {
  return store.allCases().map((c) => ({ case: c, events: store.eventsOf(c.id) }));
}

// Build synchronously, then share straight away, so Safari still counts it as the user's tap.
function exportXlsx(forceDownload) {
  if (!store.allCases().length) { toast('No cases to export'); return; }
  const bytes = buildXlsx(buildSheets(items()));
  shareOrDownload(bytes, `mapper-log-${isoDay()}.xlsx`, XLSX_MIME, { forceDownload })
    .then(async (r) => {
      if (r === 'cancelled') return;
      await guard(() => markExported('lastXlsxAt'));
      toast(r === 'shared' ? 'Excel file shared' : 'Excel file downloaded');
    });
}

function exportBackup(forceDownload) {
  const json = makeBackup(items(), dir.directory());
  shareOrDownload(new TextEncoder().encode(json), `mapper-log-backup-${stampForFile()}.json`, 'application/json', { forceDownload })
    .then(async (r) => {
      if (r === 'cancelled') return;
      await guard(() => markExported('lastBackupAt'));
      toast(r === 'shared' ? 'Backup shared' : 'Backup downloaded');
    });
}

function pickFile(onText) {
  const input = h('input', {
    type: 'file', accept: '.json,application/json', class: 'visually-hidden',
    onchange: async () => {
      const file = input.files?.[0];
      input.remove();
      if (!file) return;
      try {
        onText(await file.text());
      } catch (err) {
        toast(err.message, { error: true, ms: 6000 });
      }
    },
  });
  document.body.append(input);
  input.click();
}

function restore(ctx) {
  pickFile(async (text) => {
    let data;
    try { data = parseBackup(text); } catch (err) { toast(err.message, { error: true, ms: 6000 }); return; }
    const yes = await confirmSheet({
      title: 'Replace everything with this backup?',
      message: `The backup has ${data.cases.length} cases. The ${store.allCases().length} cases on this iPad will be replaced, and backups hold no clock times, so recent cases come back with relative times only. To combine instead, use Merge.`,
      confirmLabel: 'Replace all', danger: true,
    });
    if (!yes) return;
    const ok = await guard(async () => {
      await store.replaceAll(data.cases, data.events);
      if (data.directory) await dir.adoptFromBackup(data.directory, { replace: true });
      return true;
    });
    if (ok) toast(`Restored ${data.cases.length} cases${data.skipped ? ` (${data.skipped} unreadable entries skipped)` : ''}`, { ms: 4000 });
    ctx.refresh();
  });
}

function mergeIn(ctx) {
  pickFile(async (text) => {
    let data;
    try { data = parseBackup(text); } catch (err) { toast(err.message, { error: true, ms: 6000 }); return; }
    const r = await guard(() => store.merge(data.cases, data.events));
    if (!r) return;
    const adopted = data.directory ? await guard(() => dir.adoptFromBackup(data.directory, { replace: false })) : 'none';
    const parts = [`${r.added} added`, `${r.updated} updated`, `${r.unchanged} already here`];
    const listNote = adopted === 'kept'
      ? '. Warning: that iPad uses a different site and operator list, so its codes may mean different places and people.'
      : adopted === 'adopted' ? '. Its site and operator list was added too.' : '';
    toast(`Merged: ${parts.join(', ')}${data.skipped ? `; ${data.skipped} unreadable entries skipped` : ''}${listNote}`, { ms: adopted === 'kept' ? 9000 : 5000, error: adopted === 'kept' });
    ctx.refresh();
  });
}

function liveScreenCard(ctx) {
  return h('section', { class: 'group card' },
    h('h3', null, 'Live screen'),
    ipadSideControl(ctx),
    h('div', { class: 'label' }, 'Confirmation sound'),
    h('div', { class: 'code-row' },
      segmented([{ key: 'off', label: 'Off' }, { key: 'on', label: 'On' }], soundOn() ? 'on' : 'off',
        async (k) => { await guard(() => store.setMeta('tickSound', k === 'on')); ctx.refresh(); }),
      h('button', { type: 'button', class: 'btn', onclick: () => tick('milestone', { force: true }) }, 'Play sample')),
    h('p', { class: 'muted small' }, 'A short sound for each stamp, different for each kind (ablation, milestone, map, undo), '
      + 'so you can confirm a stamp without looking. Generated on the iPad. Turn the iPad’s volume up and check it can’t be confused with lab equipment.'),
    h('div', { class: 'label' }, 'Keyboard, keypad or foot pedal'),
    h('p', { class: 'muted small' }, 'A Bluetooth device that pairs as a keyboard can stamp without looking: '
      + 'Down arrow, Page Down, Space or A = Ablation (on an Affera case: First lesion, then Last lesion); Up arrow, Page Up or N = Next milestone; ⌘Z = Undo. '
      + 'AirTurn-style pedals send Up and Down by default.'));
}

// ---- Sites and operators (codes on cases; names encrypted) ----

function passwordSheet({ title, message, confirm, twice, onSubmit }) {
  const a = h('input', { type: 'password', class: 'input', autocomplete: 'off', 'aria-label': 'Password', autofocus: true });
  const b = twice ? h('input', { type: 'password', class: 'input', autocomplete: 'off', 'aria-label': 'Password again' }) : null;
  const err = h('p', { class: 'form-error', hidden: true });
  sheet((close) => {
    const go = async () => {
      err.hidden = true;
      if (twice && a.value.length < 8) { err.textContent = 'Use at least 8 characters.'; err.hidden = false; return; }
      if (twice && a.value !== b.value) { err.textContent = 'The two passwords don’t match.'; err.hidden = false; return; }
      try {
        await onSubmit(a.value);
        close();
      } catch (e) {
        err.textContent = e.message;
        err.hidden = false;
      }
    };
    return h('div', { class: 'sheet-body' },
      h('h2', null, title),
      message ? h('p', { class: 'muted' }, message) : null,
      h('label', { class: 'label' }, 'Password', a),
      b ? h('label', { class: 'label' }, 'Password again', b) : null,
      err,
      h('div', { class: 'sheet-actions' },
        h('button', { type: 'button', class: 'btn btn-big', onclick: close }, 'Cancel'),
        h('button', { type: 'button', class: 'btn btn-big btn-primary', onclick: go }, confirm)));
  });
}

function nameSheet({ title, value = '', placeholder, onSubmit }) {
  const input = h('input', { type: 'text', class: 'input', value, placeholder, autocomplete: 'off', autofocus: true, maxlength: '80' });
  sheet((close) => h('div', { class: 'sheet-body' },
    h('h2', null, title),
    h('p', { class: 'muted' }, 'The name is encrypted. Cases, exports and backups carry only the code.'),
    input,
    h('div', { class: 'sheet-actions' },
      h('button', { type: 'button', class: 'btn btn-big', onclick: close }, 'Cancel'),
      h('button', {
        type: 'button', class: 'btn btn-big btn-primary',
        onclick: async () => {
          if (!input.value.trim()) { toast('Enter a name'); return; }
          if (await guard(async () => { await onSubmit(input.value); return true; })) close();
        },
      }, 'Save'))));
}

function directoryCard(ctx) {
  const d = dir.directory();
  const unlocked = dir.isUnlocked();
  const intro = h('p', { class: 'muted' },
    'Cases record a site and an operator as short codes (S1, OP3), picked from this list. The real names are encrypted '
    + 'with a password: anyone who has the password can unlock the list on their iPad and see the names. Set the list up once '
    + 'and share the file to every iPad, so every code means the same place and person everywhere.');
  if (!dir.supported()) {
    return h('section', { class: 'group card' }, h('h3', null, 'Sites and operators'), intro,
      h('p', { class: 'form-error' }, 'This page can’t encrypt or decrypt, because it isn’t on a secure (https) address. It works on the hosted app.'));
  }
  if (!d) {
    return h('section', { class: 'group card' }, h('h3', null, 'Sites and operators'), intro,
      h('div', { class: 'btn-row' },
        h('button', {
          type: 'button', class: 'btn btn-big btn-primary',
          onclick: () => passwordSheet({
            title: 'Create the list', twice: true, confirm: 'Create',
            message: 'Choose a password for the names. It can’t be recovered if it’s lost, so keep it somewhere safe.',
            onSubmit: async (pw) => { await dir.create(pw); ctx.refresh(); },
          }),
        }, 'Set up the list'),
        h('button', { type: 'button', class: 'btn btn-big', onclick: () => importList(ctx) }, 'Import a list…')));
  }
  const column = (kind) => {
    const k = dir.KINDS[kind];
    return h('div', { class: 'dir-col' },
      h('div', { class: 'label' }, k.label),
      d[kind].length
        ? h('div', { class: 'dir-list' }, d[kind].map((code) => h('button', {
          type: 'button', class: 'dir-row', disabled: !unlocked,
          onclick: () => nameSheet({
            title: `Rename ${code}`, value: dir.nameOf(code) ?? '', placeholder: k.example,
            onSubmit: async (name) => { await dir.rename(code, name); ctx.refresh(); },
          }),
        }, h('span', { class: 'dir-code' }, code), h('span', { class: 'dir-name' }, unlocked ? dir.nameOf(code) ?? '—' : 'locked'))))
        : h('p', { class: 'muted small' }, `No ${k.label.toLowerCase()} yet.`),
      unlocked ? h('button', {
        type: 'button', class: 'btn',
        onclick: () => nameSheet({
          title: `Add a ${k.one}`, placeholder: k.example,
          onSubmit: async (name) => { const code = await dir.add(kind, name); toast(`Added as ${code}`); ctx.refresh(); },
        }),
      }, `+ Add ${k.one}`) : null);
  };
  return h('section', { class: 'group card' },
    h('div', { class: 'row-between' },
      h('h3', null, 'Sites and operators'),
      h('span', { class: ['pill', unlocked ? 'pill-unlocked' : 'pill-locked'] }, unlocked ? 'Unlocked: names shown' : 'Locked: codes only')),
    intro,
    h('div', { class: 'dir-cols' }, column('sites'), column('operators')),
    h('div', { class: 'btn-row' },
      unlocked
        ? h('button', { type: 'button', class: 'btn btn-big', onclick: () => { dir.lock(); ctx.refresh(); } }, 'Lock')
        : h('button', {
          type: 'button', class: 'btn btn-big btn-primary',
          onclick: () => passwordSheet({
            title: 'Unlock names', confirm: 'Unlock',
            message: 'Names stay visible on this iPad until you lock the list or close the app.',
            onSubmit: async (pw) => { await dir.unlock(pw); ctx.refresh(); },
          }),
        }, 'Unlock names…'),
      h('button', {
        type: 'button', class: 'btn btn-big',
        onclick: () => shareOrDownload(new TextEncoder().encode(dir.exportText()), 'mapper-log-sites-operators.json', 'application/json'),
      }, 'Share the list…'),
      h('button', { type: 'button', class: 'btn btn-big', onclick: () => importList(ctx) }, 'Import a list…')));
}

function importList(ctx) {
  pickFile(async (text) => {
    if (dir.directory()) {
      const yes = await confirmSheet({
        title: 'Replace this iPad’s list?',
        message: 'Cases keep their codes. If the new list numbers sites or operators differently, those codes will show different names.',
        confirmLabel: 'Replace list', danger: true,
      });
      if (!yes) return;
    }
    try {
      await dir.importText(text);
      toast('List imported. Unlock it with its password to see names.', { ms: 4000 });
    } catch (e) {
      toast(e.message, { error: true, ms: 6000 });
    }
    ctx.refresh();
  });
}

function deviceCodeCard(ctx) {
  const input = h('input', {
    type: 'text', class: 'input', maxlength: '24', autocomplete: 'off', autocapitalize: 'characters',
    spellcheck: 'false', placeholder: 'e.g. KESTREL', value: store.getMeta('deviceLabel') ?? '',
    'aria-label': 'This iPad’s code',
  });
  const save = async () => {
    const v = input.value.trim();
    await guard(() => store.setMeta('deviceLabel', v));
    toast(v ? `This iPad’s code is ${v}` : 'Code cleared');
    ctx.refresh();
  };
  return h('section', { class: 'group card' },
    h('h3', null, 'This iPad’s code'),
    h('p', { class: 'muted' }, 'Stamped on each new case and exported as "Source", so merged cases show which iPad they came from. '
      + 'Pick a word only you would recognise: not your name or initials.'),
    h('div', { class: 'code-row' }, input,
      h('button', { type: 'button', class: 'btn btn-big btn-primary', onclick: save }, 'Save code')));
}

export function render(ctx) {
  const n = store.allCases().length;
  const share = canShareFiles();
  const lastX = store.getMeta('lastXlsxAt');
  const lastB = store.getMeta('lastBackupAt');

  const persistEl = h('span', { class: 'muted' }, 'checking…');
  store.persistStatus().then((p) => {
    persistEl.textContent = p == null ? 'not reported by this browser'
      : p ? 'Yes: the browser will not clear it to save space'
        : 'Not yet: Safari may clear it if the iPad runs low on space';
  });
  const versionEl = h('span', { class: 'muted' }, ctx.swVersion() ?? 'not installed for offline yet');

  return h('section', { class: 'screen data' },
    h('h1', null, 'Data'),
    exportReminder(ctx),

    h('section', { class: 'group card' },
      h('h3', null, 'Excel export'),
      h('p', { class: 'muted' }, `Sheets "Cases" (one row per case) and "Events" (one row per tap). ${n} case${n === 1 ? '' : 's'}. `
        + 'Anonymised: each case has only its weekday and month, and times are minutes after Patient on table.'
        + (lastX ? ` Last Excel export ${fmtDate(lastX)}.` : '')),
      h('div', { class: 'btn-row' },
        share ? h('button', { type: 'button', class: 'btn btn-big btn-primary', onclick: () => exportXlsx(false) }, 'Share Excel file…') : null,
        h('button', { type: 'button', class: ['btn btn-big', !share && 'btn-primary'], onclick: () => exportXlsx(true) }, 'Download Excel file'))),

    h('section', { class: 'group card' },
      h('h3', null, 'Backup'),
      h('p', { class: 'muted' }, 'A JSON file of every case and event, anonymised the same way as the Excel file. Save it to Files or AirDrop it to another iPad.'
        + (lastB ? ` Last backup ${fmtDate(lastB)}.` : '')),
      h('div', { class: 'btn-row' },
        share ? h('button', { type: 'button', class: 'btn btn-big btn-primary', onclick: () => exportBackup(false) }, 'Share backup…') : null,
        h('button', { type: 'button', class: ['btn btn-big', !share && 'btn-primary'], onclick: () => exportBackup(true) }, 'Download backup'))),

    h('section', { class: 'group card' },
      h('h3', null, 'Bring in a backup'),
      h('div', { class: 'choice-grid' },
        h('div', null,
          h('button', { type: 'button', class: 'btn btn-big btn-block', onclick: () => mergeIn(ctx) }, 'Merge another iPad’s backup…'),
          h('p', { class: 'muted small' }, 'Adds its cases to these. A case on both is kept once: the copy edited more times wins.')),
        h('div', null,
          h('button', { type: 'button', class: 'btn btn-big btn-block btn-danger-outline', onclick: () => restore(ctx) }, 'Restore from backup…'),
          h('p', { class: 'muted small' }, 'Replaces everything on this iPad with the backup. Asks first.')))),

    deviceCodeCard(ctx),
    directoryCard(ctx),
    liveScreenCard(ctx),

    h('section', { class: 'group card' },
      h('h3', null, 'Storage'),
      h('dl', { class: 'facts' },
        h('dt', null, 'Kept safe from clean-up'), h('dd', null, persistEl),
        h('dt', null, 'Offline copy'), h('dd', null, versionEl),
        h('dt', null, 'Cases on this iPad'), h('dd', null, String(n))),
      h('button', {
        type: 'button', class: 'btn',
        onclick: async () => {
          const p = await store.requestPersist();
          toast(p ? 'Storage is persistent' : 'The browser did not grant persistent storage. Add the app to the Home Screen and try again.', { ms: 5000 });
          ctx.refresh();
        },
      }, 'Ask to keep data')),

    h('section', { class: 'group card' },
      h('h3', null, 'Privacy'),
      h('ul', { class: 'plain' },
        h('li', null, 'This app holds no patient data. Do not type patient identifiers or dates into notes.'),
        h('li', null, `Clock times stay on this iPad for ${ANON_AFTER_DAYS} days after a case so you can correct them. Then they are replaced by minutes after Patient on table, and the date by weekday and month.`),
        h('li', null, 'Excel exports and backups are always anonymised that way, even for today’s cases.'),
        h('li', null, 'Nothing leaves this iPad. The app has no server; its security policy blocks every network request from the page.'),
        h('li', null, 'Data leaves only when you export, back up or share a file yourself.'))));
}
