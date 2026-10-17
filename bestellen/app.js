// Tafel – Bestellen. Einstieg: Gerüst (Seitenleiste, Navigationsleiste), Navigation, Datenfluss.

import { h, $, loadSettings, watchTheme, isConfigured, CATEGORIES, categoryById } from '../shared/core.js';
import { Sync } from '../shared/sync.js';
import { buildView, prune, dishesByCategory, dishAvailability } from '../shared/model.js';
import { connectionPill, offlineBand, iconEl } from '../shared/ui.js';
import { registerSW, refreshSubscription } from '../shared/push.js';
import { unlockAudio } from '../shared/sound.js';
import { S, view, invalidate, ui, saveUi, cartCount, on, room } from './store.js';
import { renderMenu } from './menu.js';
import { openCart } from './cart.js';
import { renderOrders } from './orders.js';
import { renderSettings, renderSetup } from './settings.js';
import { scanFeedback, checkAcks, attentionCount, markStornosViewed } from './watch.js';

// ---------- Start ----------

S.settings = loadSettings('order');
watchTheme(() => S.settings.theme);
const sync = new Sync(S.settings, { beforePush: prune });
S.sync = sync;
S.openCart = openCart;
S.go = go;

const root = $('#root');
const compactMq = matchMedia('(max-width: 899px)');
const kitchenExtra = () => (buildView(sync.docs()).kitchenOnline ? null : { text: 'Küche offline', cls: 'warn' });
const pill = connectionPill(sync, kitchenExtra);
S.connPillClone = () => (S._pill2 ||= connectionPill(sync, kitchenExtra));

let shell = null;
let pending = false; // Neuzeichnen aufgeschoben, solange ein Eingabefeld aktiv ist
let raf = 0;
const typing = () => {
  const a = document.activeElement;
  return !!(a && shell?.content.contains(a) && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName));
};

if (isConfigured(S.settings)) buildShell();
else showSetup();

sync.start();
registerSW('./sw.js');
refreshSubscription(S.settings);
unlockAudio();

navigator.serviceWorker?.addEventListener('message', (e) => {
  if (e.data?.type === 'open') { if (shell) go('orders'); }
  if (e.data?.type === 'push') sync.tick();
});

sync.addEventListener('data', () => {
  invalidate();
  if (!shell) return;
  for (const fn of S.live) { try { fn(); } catch (err) { console.warn(err); } }
  scheduleRender();
  scanFeedback();
  checkAcks();
  updateBadges();
});
setInterval(() => { if (shell) checkAcks(); }, 3000);
on('ack', () => { if (S.route.name === 'orders') scheduleRender(); });
on('badge', () => updateBadges());
on('cart', () => updateCart(false));
on('added', () => updateCart(true));

// ---------- Ersteinrichtung ----------

function showSetup() {
  shell = null;
  root.replaceChildren(renderSetup(() => {
    buildShell();
    go('menu', { cat: ui.cat });
  }));
}

// ---------- Gerüst ----------

function buildShell() {
  const sb = {};
  sb.title = h('div', { class: 'sb-room' }, iconEl('house'), h('span', {}, room()));
  sb.cats = h('div', { class: 'sb-group' });
  sb.more = h('div', { class: 'sb-group' });
  const sidebar = h('nav', { class: `sidebar${ui.collapsed ? ' collapsed' : ''}`, 'aria-label': 'Navigation' },
    h('div', { class: 'sb-top' },
      h('div', { class: 'sb-brand' }, 'Tafel'),
      sb.title),
    h('div', { class: 'sb-scroll' },
      h('div', { class: 'sb-head' }, 'Speisekarte'), sb.cats,
      h('div', { class: 'sb-head' }, 'Bestellung'), sb.more));
  const dim = h('div', { class: 'sidebar-dim', onclick: () => sidebar.classList.remove('open') });

  const sbDot = h('span', { class: 'count', hidden: true });
  const sbBtn = h('button', { class: 'barbtn sb-toggle', 'aria-label': 'Seitenleiste', onclick: toggleSidebar }, iconEl('sidebar'), sbDot);
  const cartCountEl = h('span', { class: 'count', hidden: true });
  const cartBtn = h('button', { class: 'barbtn cart-btn', 'aria-label': 'Warenkorb', onclick: () => openCart() }, iconEl('basket'), cartCountEl);
  const navTitle = h('div', { class: 'navbar-title' });
  const navbar = h('div', { class: 'navbar main-nav at-top' },
    h('div', { class: 'navbar-row' },
      h('div', { class: 'navbar-side' }, sbBtn),
      navTitle,
      h('div', { class: 'navbar-side end' }, pill, cartBtn)));
  const content = h('div', { class: 'content' });
  const scroller = h('div', { class: 'scroll' }, navbar, content);
  const main = h('main', { class: 'main' }, scroller);
  const app = h('div', { class: 'app' }, sidebar, dim, main);
  root.replaceChildren(offlineBand(sync), app);

  scroller.addEventListener('scroll', () => {
    const y = scroller.scrollTop;
    navbar.classList.toggle('at-top', y < 4);
    navbar.classList.toggle('titled', y > 52);
  }, { passive: true });
  addEventListener('keydown', (e) => { if (e.key === 'Escape') sidebar.classList.remove('open'); });
  compactMq.addEventListener('change', () => sidebar.classList.remove('open'));
  content.addEventListener('focusout', () => { if (pending) setTimeout(() => { if (!typing()) scheduleRender(); }, 0); });

  shell = { sidebar, sb, sbDot, cartBtn, cartCountEl, navTitle, navbar, content, scroller };
  S.rerender = () => renderNow(false);

  const hash = location.hash.replace('#', '');
  if (hash === 'bestellungen' || hash === 'orders') S.route = { name: 'orders' };
  else S.route = { name: 'menu', cat: categoryById(ui.cat) ? ui.cat : 'vorspeise' };
  renderNow(true);
  updateCart(false);
  updateBadges();
  scanFeedback();
}

function toggleSidebar() {
  const sb = shell.sidebar;
  if (compactMq.matches) { sb.classList.toggle('open'); return; }
  ui.collapsed = !ui.collapsed;
  sb.classList.toggle('collapsed', ui.collapsed);
  saveUi();
}

function sbItem(label, ic, active, onClick, count, badge) {
  return h('button', { class: `sb-item${active ? ' on' : ''}`, 'aria-current': active ? 'page' : null, onclick: onClick },
    iconEl(ic), h('span', { class: 'sb-label' }, label),
    badge ? h('span', { class: 'sb-badge' }, String(badge)) : count != null ? h('span', { class: 'sb-count' }, String(count)) : null);
}

function renderSidebar() {
  const v = view();
  const r = S.route;
  shell.sb.title.lastChild.textContent = room();
  shell.sb.cats.replaceChildren(...CATEGORIES.map((c) => {
    const n = dishesByCategory(v, c.id).filter((d) => !d.manual && dishAvailability(v, d).available).length;
    return sbItem(c.name, c.icon, r.name === 'menu' && r.cat === c.id, () => go('menu', { cat: c.id }), n);
  }));
  const att = attentionCount();
  shell.sb.more.replaceChildren(
    sbItem('Meine Bestellungen', 'list', r.name === 'orders', () => go('orders'), null, att),
    sbItem('Einstellungen', 'gear', r.name === 'settings', () => go('settings')));
}

// ---------- Navigation ----------

function go(name, opts = {}) {
  if (!shell) return;
  if (name === 'menu') {
    const cat = opts.cat || ui.cat;
    S.route = { name, cat };
    ui.cat = cat; saveUi();
  } else S.route = { name, focus: opts.focus };
  shell.sidebar.classList.remove('open');
  history.replaceState(null, '', name === 'orders' ? '#bestellungen' : location.pathname + location.search);
  renderNow(true);
}


function scheduleRender() {
  if (!shell) return;
  if (S.route.name === 'settings') { shell.content.firstChild?.refresh?.(); renderSidebar(); return; }
  if (typing()) { pending = true; renderSidebar(); return; }
  cancelAnimationFrame(raf);
  raf = requestAnimationFrame(() => renderNow(false));
}

function renderNow(reset) {
  pending = false;
  const r = S.route;
  const { content, scroller, navTitle } = shell;
  const y = scroller.scrollTop;
  let el;
  if (r.name === 'orders') el = renderOrders();
  else if (r.name === 'settings') el = renderSettings();
  else el = renderMenu(r.cat);
  if (reset) el.classList.add('enter');
  content.replaceChildren(el);
  navTitle.textContent = r.name === 'orders' ? 'Meine Bestellungen' : r.name === 'settings' ? 'Einstellungen' : categoryById(r.cat)?.name || '';
  document.title = `${navTitle.textContent} · Tafel`;
  if (reset) scroller.scrollTop = 0; else scroller.scrollTop = y;
  const strip = content.querySelector('.cat-strip');
  const pillOn = strip?.querySelector('.cat-pill.on');
  if (strip && pillOn && strip.clientWidth) strip.scrollLeft = pillOn.offsetLeft - (strip.clientWidth - pillOn.offsetWidth) / 2;
  if (r.name === 'orders') {
    markStornosViewed();
    if (r.focus && reset) {
      const card = document.getElementById(`order-${r.focus}`);
      if (card) {
        requestAnimationFrame(() => card.scrollIntoView({ block: 'start', behavior: 'smooth' }));
        card.classList.add('flash');
      }
    }
  }
  renderSidebar();
  updateBadges();
}

// ---------- Zähler ----------

function updateCart(pop) {
  if (!shell) return;
  const n = cartCount();
  const el = shell.cartCountEl;
  el.hidden = n === 0;
  el.textContent = n > 99 ? '99+' : String(n);
  shell.cartBtn.setAttribute('aria-label', n ? `Warenkorb, ${n} Artikel` : 'Warenkorb');
  if (pop && n) {
    el.classList.remove('pop');
    void el.offsetWidth;
    el.classList.add('pop');
    shell.cartBtn.classList.remove('bump'); void shell.cartBtn.offsetWidth; shell.cartBtn.classList.add('bump');
  }
}

function updateBadges() {
  if (!shell) return;
  const n = attentionCount();
  shell.sbDot.hidden = !n;
  shell.sbDot.textContent = String(n);
  const b = shell.sb.more.querySelector('.sb-item .sb-badge');
  if ((b ? +b.textContent : 0) !== n) renderSidebar();
}
