// Small DOM helpers. Text is always set as text (never innerHTML), and no inline styles are
// used, so the strict Content-Security-Policy holds.

export function h(tag, props, ...children) {
  const el = document.createElement(tag);
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = Array.isArray(v) ? v.flat(Infinity).filter(Boolean).join(' ') : v;
      else if (k === 'dataset') Object.assign(el.dataset, v);
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else if (k === 'value') el.value = v;
      else if (k === 'checked' || k === 'disabled' || k === 'hidden' || k === 'autofocus') el[k] = !!v;
      else el.setAttribute(k, v === true ? '' : String(v));
    }
  }
  append(el, children);
  return el;
}

function append(el, children) {
  for (const c of children) {
    if (c == null || c === false) continue;
    if (Array.isArray(c)) append(el, c);
    else el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}

/** A large tappable tile. */
export function tile(props, ...children) {
  const { class: cls, ...rest } = props;
  return h('button', { type: 'button', class: ['tile', cls], ...rest }, ...children);
}

/** Two or more tiles where one is selected. */
export function segmented(options, selected, onPick, cls) {
  return h('div', { class: ['seg', cls], role: 'radiogroup' },
    options.map((o) => h('button', {
      type: 'button',
      role: 'radio',
      'aria-checked': String(o.key === selected),
      class: ['seg-btn', o.key === selected && 'is-on'],
      onclick: () => onPick(o.key),
    }, o.label)));
}

// ---- Bottom sheet / modal ----

let openSheetEl = null;

export function closeSheet() {
  if (openSheetEl) {
    openSheetEl.remove();
    openSheetEl = null;
  }
}

/**
 * Show a modal sheet. `build(close)` returns the sheet's content node.
 * Returns the close function.
 */
export function sheet(build, { dismissable = true, cls } = {}) {
  closeSheet();
  const close = () => {
    if (openSheetEl === overlay) closeSheet();
  };
  const panel = h('div', { class: ['sheet', cls], role: 'dialog', 'aria-modal': 'true' });
  const overlay = h('div', {
    class: 'overlay',
    onclick: (e) => { if (dismissable && e.target === overlay) close(); },
  }, panel);
  panel.append(build(close));
  document.body.append(overlay);
  openSheetEl = overlay;
  const focus = panel.querySelector('[autofocus]');
  if (focus) setTimeout(() => focus.focus(), 50);
  return close;
}

export function confirmSheet({ title, message, confirmLabel = 'Confirm', cancelLabel = 'Cancel', danger = false }) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (v, close) => {
      if (done) return;
      done = true;
      close();
      resolve(v);
    };
    sheet((close) => h('div', { class: 'sheet-body' },
      h('h2', null, title),
      message ? h('p', { class: 'muted' }, message) : null,
      h('div', { class: 'sheet-actions' },
        h('button', { type: 'button', class: 'btn btn-big', onclick: () => finish(false, close) }, cancelLabel),
        h('button', {
          type: 'button',
          class: ['btn btn-big', danger ? 'btn-danger' : 'btn-primary'],
          onclick: () => finish(true, close),
        }, confirmLabel))), { dismissable: false });
  });
}

// ---- Toast ----

let toastTimer = null;

export function toast(message, { error = false, ms = 2600 } = {}) {
  let el = document.getElementById('toast');
  if (!el) {
    el = h('div', { id: 'toast', class: 'toast', role: 'status', 'aria-live': 'polite' });
    document.body.append(el);
  }
  el.textContent = message;
  el.classList.toggle('is-error', error);
  el.classList.add('is-on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('is-on'), ms);
}

/** Run an async action and report a failure instead of throwing into the void. */
export async function guard(fn) {
  try {
    return await fn();
  } catch (err) {
    console.error(err);
    toast(`Could not save: ${err?.message ?? err}`, { error: true, ms: 6000 });
    return undefined;
  }
}

/** Ignore repeat taps on the same element within `ms` (protects against double taps). */
const lastTap = new WeakMap();
export function debounced(el, ms = 600) {
  const now = performance.now();
  const prev = lastTap.get(el) ?? -Infinity;
  lastTap.set(el, now);
  return now - prev < ms;
}

export function flash(el) {
  if (!el) return;
  el.classList.remove('flash');
  void el.offsetWidth; // restart the animation
  el.classList.add('flash');
}
