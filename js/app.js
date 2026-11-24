// App shell: open storage, route between screens, keep the clock ticking, register the
// service worker for offline use.

import * as store from './store.js';
import { h, closeSheet } from './ui.js';
import * as start from './screens/start.js';
import * as live from './screens/live.js';
import * as review from './screens/review.js';
import * as cases from './screens/cases.js';
import * as dashboard from './screens/dashboard.js';
import * as data from './screens/data.js';

const ROUTES = [
  { re: /^#\/live$/, screen: live, tab: 'case' },
  { re: /^#\/case\/([^/]+)(\/post)?$/, screen: review, tab: 'cases' },
  { re: /^#\/cases$/, screen: cases, tab: 'cases' },
  { re: /^#\/dashboard$/, screen: dashboard, tab: 'dashboard' },
  { re: /^#\/data$/, screen: data, tab: 'data' },
  { re: /^#?\/?$/, screen: start, tab: 'case' },
];

const appEl = document.getElementById('app');
const navEl = document.getElementById('nav');
const bannerEl = document.getElementById('banner');

let current = null;
let swVersion = null;

const ctx = {
  go(hash, replace = false) {
    if (replace) history.replaceState(null, '', hash);
    else if (location.hash !== hash) { location.hash = hash; return; }
    render();
  },
  refresh: () => render(),
  swVersion: () => swVersion,
};

function resolve() {
  let hash = location.hash || '#/';
  // A live case always opens on the live screen.
  if ((hash === '#/' || hash === '#') && store.activeCase()) {
    history.replaceState(null, '', '#/live');
    hash = '#/live';
  }
  // No live case: the live screen becomes the new-case screen.
  if (hash === '#/live' && !store.activeCase()) {
    history.replaceState(null, '', '#/');
    hash = '#/';
  }
  for (const r of ROUTES) {
    const m = hash.match(r.re);
    if (m) return { ...r, params: m.slice(1) };
  }
  return { ...ROUTES.at(-1), params: [] };
}

function render() {
  const route = resolve();
  if (current && current.screen !== route.screen) current.screen.unmount?.();
  const scrollY = current?.screen === route.screen ? window.scrollY : 0;
  current = route;
  renderNav(route.tab);
  let node;
  try {
    node = route.screen.render(ctx, route.params);
  } catch (err) {
    console.error(err);
    node = h('section', { class: 'screen' }, h('h1', null, 'Something went wrong'), h('pre', { class: 'muted' }, String(err?.stack ?? err)));
  }
  appEl.replaceChildren(node);
  document.body.classList.toggle('is-live', route.screen === live);
  window.scrollTo(0, scrollY);
}

function renderNav(tab) {
  const active = store.activeCase();
  const item = (key, label, hash, extra) => h('a', {
    href: hash, class: ['nav-item', tab === key && 'is-on'], 'aria-current': tab === key ? 'page' : null,
  }, label, extra);
  navEl.replaceChildren(
    h('div', { class: 'nav-items' },
      item('case', active ? 'Live case' : 'New case', active ? '#/live' : '#/', active ? h('span', { class: 'dot dot-live' }) : null),
      item('cases', 'Cases', '#/cases'),
      item('dashboard', 'Dashboard', '#/dashboard'),
      item('data', 'Data', '#/data', data.exportOverdue() ? h('span', { class: 'dot dot-warn' }) : null)),
    h('div', { class: 'nav-privacy' }, 'No patient data · nothing leaves this iPad'));
}

function showBanner(text, actionLabel, action) {
  bannerEl.replaceChildren(
    h('span', null, text),
    actionLabel ? h('button', { type: 'button', class: 'btn', onclick: action }, actionLabel) : null,
    h('button', { type: 'button', class: 'btn btn-ghost', 'aria-label': 'Dismiss', onclick: () => { bannerEl.hidden = true; } }, '✕'));
  bannerEl.hidden = false;
}

function askVersion(worker) {
  if (!worker) return;
  const ch = new MessageChannel();
  ch.port1.onmessage = (e) => {
    swVersion = e.data;
    if (current?.screen === data) render();
  };
  worker.postMessage('version', [ch.port2]);
}

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  // Development: open index.html?nosw to run without the offline cache.
  if (new URLSearchParams(location.search).has('nosw')) return;
  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.register('sw.js').then((reg) => {
    askVersion(reg.active ?? reg.waiting ?? reg.installing);
    navigator.serviceWorker.ready.then((r) => askVersion(r.active));
  }).catch((err) => console.warn('Service worker registration failed', err));
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    askVersion(navigator.serviceWorker.controller);
    // First install: nothing to announce. Later: a new version has taken over.
    if (hadController) {
      showBanner('A new version of Mapper Log is ready. Your cases are kept.', 'Reload now', () => location.reload());
    }
  });
}

async function boot() {
  try {
    await store.open();
  } catch (err) {
    appEl.replaceChildren(h('section', { class: 'screen' },
      h('h1', null, 'Storage unavailable'),
      h('p', null, String(err?.message ?? err)),
      h('p', { class: 'muted' }, 'Private Browsing blocks storage. Open Mapper Log from the Home Screen or a normal Safari tab.')));
    return;
  }
  store.onChange(() => {
    // Leave an open sheet alone unless its data vanished; re-render the screen underneath.
    render();
  });
  window.addEventListener('hashchange', () => { closeSheet(); render(); });
  setInterval(() => current?.screen.tick?.(), 1000);
  // Remove clock times from cases older than the correction window: now, hourly, and whenever
  // the app comes back to the foreground.
  const purge = () => store.anonymiseDue().catch((err) => console.error('Anonymising failed', err));
  await purge();
  setInterval(purge, 3600000);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') purge(); });
  render();
  window.dispatchEvent(new Event('mapper-log-started'));
  registerServiceWorker();
  if (store.allCases().length) store.requestPersist();
}

boot();
