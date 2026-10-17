// Warenkorb (Blatt) und Absenden der Bestellung.

import { h, uid, now, flag, isConfigured, categoryById } from '../shared/core.js';
import { dishAvailability, choiceAvailable, itemDetails, isManual } from '../shared/model.js';
import { sheet, stepper, photo, toast, alert, confirm, icon, iconEl } from '../shared/ui.js';
import { S, view, cart, saveCart, cartCount, itemsSummary, room } from './store.js';
import { openDish } from './menu.js';

/** Problem einer Warenkorb-Position mit dem aktuellen Menü ('' = in Ordnung). */
export function cartProblem(v, it) {
  if (isManual(it.dishId)) return '';
  const dish = v.dishes.get(it.dishId);
  if (!dish) return 'Nicht mehr auf der Karte';
  const av = dishAvailability(v, dish);
  if (!av.available) return `Nicht verfügbar. Es fehlt: ${av.missing.join(', ')}`;
  for (const o of dish.options || []) {
    for (const cid of it.options?.[o.id] || []) {
      const c = o.choices.find((x) => x.id === cid);
      if (!c) return `Auswahl nicht mehr vorhanden: ${o.name}`;
      if (!choiceAvailable(v, c)) return `Nicht verfügbar: ${c.name}`;
    }
    if (o.required && !(it.options?.[o.id] || []).length) return `Auswahl erforderlich: ${o.name}`;
  }
  return '';
}

export function thumb(it, cls = 'thumb') {
  if (isManual(it.dishId)) return h('div', { class: `${cls} manual-art`, html: icon('compose') });
  const d = view().dishes.get(it.dishId);
  return photo(S.sync, d?.imageId, { cls, ph: categoryById(it.category)?.icon || 'photo' });
}

export function openCart() {
  if (S.cartOpen) return;
  S.cartOpen = true;

  const listEl = h('div', { class: 'cart-list' });
  const noteEl = h('textarea', {
    class: 'textarea', rows: 2, maxlength: 500, placeholder: 'Optional, z. B. alles gleichzeitig servieren',
    oninput: () => { cart.note = noteEl.value; saveCart(); },
  });
  noteEl.value = cart.note || '';
  const noteSec = h('section', { class: 'cart-note-sec' }, h('div', { class: 'section-head' }, 'Anmerkung zur Bestellung'), noteEl);
  const emptyEl = h('div', { class: 'empty cart-empty' }, iconEl('basket'), h('h3', {}, 'Warenkorb leer'), h('p', {}, 'Gerichte aus der Speisekarte erscheinen hier.'));
  const clearBtn = h('button', { class: 'btn plain small cart-clear', onclick: clearAll }, 'Alle entfernen');

  const sumEl = h('div', { class: 'cart-sum' });
  const orderBtn = h('button', { class: 'btn block order-btn', onclick: submit }, 'Bestellen');
  const foot = h('div', { class: 'cart-foot' }, sumEl, orderBtn);

  const sh = sheet({
    title: 'Warenkorb',
    body: h('div', { class: 'cart-body' }, emptyEl, listEl, noteSec, clearBtn),
    foot,
    left: null,
    right: { text: 'Fertig', bold: true },
    onClose: () => { S.cartOpen = false; S.live.delete(render); },
  });
  sh.el.classList.add('cart-sheet');

  function render() {
    const v = view();
    const items = cart.items;
    emptyEl.hidden = items.length > 0;
    noteSec.hidden = clearBtn.hidden = !items.length;
    listEl.hidden = !items.length;
    listEl.replaceChildren(...items.map((it) => row(v, it)));
    updateFoot();
  }

  function row(v, it) {
    const problem = cartProblem(v, it);
    const details = itemDetails(it);
    const fl = flag(it.country);
    const qty = stepper(it.qty, { min: 1, max: 99, onChange: (q) => { it.qty = q; saveCart(); updateFoot(); } });
    qty.classList.add('sm');
    return h('div', { class: `cart-row${problem ? ' problem' : ''}`, dataset: { item: it.id } },
      h('button', { class: 'cart-main', 'aria-label': `${it.name} bearbeiten`, onclick: () => edit(it) },
        thumb(it),
        h('div', { class: 'cart-text' },
          h('div', { class: 'cart-name' }, it.name, isManual(it.dishId) ? h('span', { class: 'c2' }, ` · ${categoryById(it.category)?.single || ''}`) : null, fl ? h('span', { class: 'inline-flag' }, fl) : null),
          details.length ? h('div', { class: 'cart-det' }, details.join(' · ')) : null,
          it.note ? h('div', { class: 'cart-note' }, it.note) : null,
          problem ? h('div', { class: 'cart-problem' }, iconEl('warning'), problem) : null)),
      h('div', { class: 'cart-side' },
        qty,
        h('div', { class: 'cart-actions' },
          h('button', { class: 'link-btn', onclick: () => edit(it) }, 'Bearbeiten'),
          h('button', { class: 'link-btn red', onclick: () => remove(it) }, 'Entfernen'))));
  }

  function updateFoot() {
    const v = view();
    const n = cartCount();
    const bad = cart.items.filter((it) => cartProblem(v, it)).length;
    orderBtn.disabled = !cart.items.length || bad > 0;
    sumEl.className = `cart-sum${bad ? ' warn' : ''}`;
    sumEl.textContent = !cart.items.length ? 'Keine Artikel'
      : bad ? `${bad} ${bad === 1 ? 'Position ist' : 'Positionen sind'} nicht bestellbar`
        : `${n} Artikel · ${room()}`;
  }

  function edit(it) {
    openDish(it.dishId, {
      item: it,
      onSave: (n) => {
        const i = cart.items.findIndex((x) => x.id === it.id);
        if (i >= 0) cart.items[i] = n;
        saveCart(); render();
      },
    });
  }

  function remove(it) {
    cart.items = cart.items.filter((x) => x.id !== it.id);
    saveCart(); render();
  }

  async function clearAll() {
    if (!(await confirm('Warenkorb leeren?', 'Alle Positionen werden entfernt.', 'Entfernen', true))) return;
    cart.items = []; saveCart(); render();
  }

  async function submit() {
    if (!isConfigured(S.settings)) {
      await alert({ title: 'Nicht eingerichtet', message: 'Die Verbindung zur Küche ist noch nicht eingerichtet.' });
      return;
    }
    if (!cart.items.length) return;
    const orderId = placeOrder();
    sh.close('order');
    const online = S.sync.state.online;
    toast(online ? 'Bestellung gesendet' : 'Bestellung gespeichert', {
      message: online ? itemsSummary(S.sync.local.orders[orderId].items) : 'Sie wird gesendet, sobald eine Verbindung besteht.',
      tone: online ? 'green' : 'gray', icon: online ? 'check' : 'wifiSlash', ms: 4000,
      onClick: () => S.go?.('orders', { focus: orderId }),
    });
  }

  S.live.add(render);
  render();
}

/** Legt die Bestellung aus dem Warenkorb an und leert ihn. @returns {string} orderId */
export function placeOrder() {
  const t = now();
  const id = uid('b');
  const items = cart.items.map((it) => ({
    id: it.id || uid('i'), dishId: it.dishId, name: it.name, category: it.category, country: it.country || '',
    sizeId: it.sizeId ?? null, sizeName: it.sizeName ?? null, qty: it.qty, ice: it.ice ?? null,
    options: it.options || {}, optionLabels: it.optionLabels || [], note: it.note || '',
    cancelled: false, cancelledAt: null, answers: {},
  }));
  const order = {
    id, deviceId: S.settings.deviceId, deviceName: room(), createdAt: t, updatedAt: t, rev: 1,
    note: (cart.note || '').trim(), cancelled: false, cancelledAt: null, changes: [], items,
  };
  S.sync.mutate((d) => { d.orders[id] = order; });
  S.sync.queueNotify({ to: { role: 'kitchen' }, title: `Neue Bestellung · ${room()}`, body: itemsSummary(items), tag: id, url: './' });
  cart.items = []; cart.note = '';
  saveCart();
  return id;
}
