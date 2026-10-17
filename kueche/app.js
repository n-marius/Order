// Tafel Küche – Einstieg: Shell (Seitenleiste / Tab-Leiste), Navigation, Datenfluss.

import { loadSettings, isConfigured, watchTheme, h, bus } from '../shared/core.js';
import { Sync } from '../shared/sync.js';
import { prune } from '../shared/model.js';
import { connectionPill, offlineBand, iconEl } from '../shared/ui.js';
import { registerSW, refreshSubscription } from '../shared/push.js';
import { unlockAudio } from '../shared/sound.js';
import { app, refreshAgo, store } from './ctx.js';
import { ordersView, doneView, openOrderSheet, openOrders } from './orders.js';
import { dishesView } from './dishes.js';
import { ingredientsView } from './ingredients.js';
import { settingsView, openSetup } from './settings.js';
import { autoAck, processSignals } from './signals.js';

const NAV = [
  { id: 'orders', label: 'Bestellungen', short: 'Bestellungen', icon: 'tray', view: ordersView },
  { id: 'done', label: 'Erledigt', short: 'Erledigt', icon: 'checkCircle', view: doneView },
  { id: 'dishes', label: 'Gerichte', short: 'Gerichte', icon: 'forkKnife', view: dishesView },
  { id: 'ingredients', label: 'Zutaten', short: 'Zutaten', icon: 'carrot', view: ingredientsView },
  { id: 'settings', label: 'Einstellungen', short: 'Einstellungen', icon: 'gear', view: settingsView },
];

// ---------- Start ----------

app.settings = loadSettings('kitchen');
watchTheme(() => app.settings.theme);
const sync = new Sync(app.settings, { beforePush: prune });
app.sync = sync;
app.navigate = navigate;

const shell = {};
let current = null;
let dataTimer = null;
const wide = matchMedia('(min-width: 900px)');
const phone = matchMedia('(max-width: 699px)');

buildShell();
sync.addEventListener('data', onData);
sync.start();
navigate(store.get('tab', 'orders'));
registerSW('./sw.js');
refreshSubscription(app.settings);
unlockAudio();

if (!isConfigured(app.settings)) openSetup({ onDone: () => { refreshSubscription(app.settings); navigate('orders'); } });

navigator.serviceWorker?.addEventListener('message', (e) => {
  const m = e.data || {};
  if (m.type === 'open') { navigate('orders'); sync.tick(); }
  else if (m.type === 'push') sync.tick();
});

bus.addEventListener('settings', () => renderSidebarTitle());

// Zeitangaben und Alter der Bestellungen laufend aktualisieren
setInterval(() => refreshAgo(), 15000);
setInterval(() => { if (!document.hidden) current?.view.tick?.(); }, 60000);

// ---------- Shell ----------

function buildShell() {
  const root = document.getElementById('root');
  shell.band = offlineBand(sync);
  shell.pill = connectionPill(sync);
  shell.sb = new Map();
  shell.tabs = new Map();

  const sbItems = NAV.map((n) => {
    const count = h('span', { class: 'sb-count' });
    const b = h('button', { class: 'sb-item', dataset: { nav: n.id }, onclick: () => { navigate(n.id); closeDrawer(); } }, iconEl(n.icon), h('span', { class: 'grow ellipsis' }, n.label), count);
    shell.sb.set(n.id, { b, count });
    return b;
  });
  shell.sbTitle = h('div', { class: 'k-sb-title' });
  shell.sbSub = h('div', { class: 'k-sb-sub' });
  shell.sidebar = h('aside', { class: `sidebar k-sidebar${store.get('sidebar', true) ? '' : ' collapsed'}`, 'aria-label': 'Navigation' },
    h('div', { class: 'k-sb-top' },
      h('button', { class: 'barbtn k-sb-close', 'aria-label': 'Seitenleiste ausblenden', onclick: toggleSidebar }, iconEl('sidebar'))),
    h('div', { class: 'k-sb-head' }, shell.sbTitle, shell.sbSub),
    h('nav', { class: 'sb-scroll' }, sbItems));
  shell.dim = h('div', { class: 'sidebar-dim', onclick: closeDrawer });

  shell.toggle = h('button', { class: 'barbtn k-sb-toggle', 'aria-label': 'Seitenleiste einblenden', onclick: toggleSidebar }, iconEl('sidebar'));
  shell.title = h('div', { class: 'navbar-title' });
  shell.actions = h('div', { class: 'k-actions' });
  shell.navbar = h('header', { class: 'navbar k-nav clear' },
    h('div', { class: 'navbar-row' },
      h('div', { class: 'navbar-side' }, shell.toggle),
      shell.title,
      h('div', { class: 'navbar-side end' }, shell.pill, shell.actions)));
  shell.content = h('div', { class: 'k-content' });
  shell.scroll = h('div', { class: 'scroll k-scroll' }, shell.navbar, shell.content);
  shell.scroll.addEventListener('scroll', onScroll, { passive: true });

  shell.tabbar = h('nav', { class: 'tabbar k-tabbar', 'aria-label': 'Navigation' }, NAV.map((n) => {
    const count = h('span', { class: 'count', hidden: true });
    const b = h('button', { dataset: { nav: n.id }, onclick: () => navigate(n.id) }, iconEl(n.icon), h('span', null, n.short), count);
    shell.tabs.set(n.id, { b, count });
    return b;
  }));
  shell.main = h('div', { class: 'main k-main' }, shell.scroll, shell.tabbar);
  shell.app = h('div', { class: 'app k-app' }, shell.sidebar, shell.dim, shell.main);
  root.replaceChildren(shell.band, shell.app);
  renderSidebarTitle();
  syncToggle();
  wide.addEventListener('change', () => { shell.sidebar.classList.remove('open'); syncToggle(); });
}

function renderSidebarTitle() {
  shell.sbTitle.textContent = 'Küche';
  shell.sbSub.textContent = app.settings.deviceName && app.settings.deviceName !== 'Küche' ? app.settings.deviceName : 'Tafel';
}

function syncToggle() {
  // Auf breiten Bildschirmen erscheint der Umschalter in der Inhaltsleiste nur bei ausgeblendeter Seitenleiste.
  const collapsed = shell.sidebar.classList.contains('collapsed');
  shell.toggle.hidden = wide.matches && !collapsed;
  shell.app.classList.toggle('sb-collapsed', wide.matches && collapsed);
}

function toggleSidebar() {
  if (wide.matches) {
    const collapsed = shell.sidebar.classList.toggle('collapsed');
    store.set('sidebar', !collapsed);
    syncToggle();
  } else {
    shell.sidebar.classList.toggle('open');
  }
}
function closeDrawer() { shell.sidebar.classList.remove('open'); }

function onScroll() {
  const y = shell.scroll.scrollTop;
  shell.navbar.classList.toggle('clear', y < 4);
  shell.navbar.classList.toggle('titled', y > 44);
}

// ---------- Navigation ----------

function navigate(id) {
  const n = NAV.find((x) => x.id === id) || NAV[0];
  if (current?.id === n.id) { shell.scroll.scrollTo({ top: 0, behavior: 'smooth' }); return; }
  const view = n.view();
  current = { id: n.id, view };
  shell.title.textContent = n.label;
  shell.actions.replaceChildren(...(view.actions || []));
  shell.content.replaceChildren(view.el);
  shell.scroll.scrollTop = 0;
  view.update?.();
  for (const [k, { b }] of shell.sb) { b.classList.toggle('on', k === n.id); b.setAttribute('aria-current', k === n.id ? 'page' : 'false'); }
  for (const [k, { b }] of shell.tabs) b.classList.toggle('on', k === n.id);
  store.set('tab', n.id);
  onScroll();
  updateCounts();
}

function updateCounts() {
  const open = openOrders().length;
  const missing = [...app.view.ingredients.values()].filter((i) => !i.available).length;
  const set = (id, n) => {
    const s = shell.sb.get(id); if (s) s.count.textContent = n ? String(n) : '';
    const t = shell.tabs.get(id);
    if (t && id === 'orders') { t.count.hidden = !n; t.count.textContent = String(n); }
  };
  set('orders', open);
  set('ingredients', missing);
  document.title = open ? `(${open}) Tafel Küche` : 'Tafel Küche';
  try { if (open) navigator.setAppBadge?.(open); else navigator.clearAppBadge?.(); } catch {}
}

// ---------- Daten ----------

function onData() {
  if (dataTimer) return;
  dataTimer = setTimeout(() => { dataTimer = null; processData(); }, 0);
}

function processData() {
  app.rebuild();
  if (isConfigured(app.settings)) {
    autoAck();
    processSignals(openOrderSheet);
  }
  updateCounts();
  current?.view.update?.();
  for (const s of [...app.sheets]) {
    try { s.update(); } catch (e) { console.error(e); }
  }
}

// Für Tests und Fehlersuche
window.tafel = { app, navigate, openOrderSheet };
