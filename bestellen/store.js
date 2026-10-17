// Gemeinsamer Zustand der App „Bestellen“: Einstellungen, Sync, Sicht, Warenkorb, lokale Merker.

import { now } from '../shared/core.js';
import { buildView, sortedOrders } from '../shared/model.js';

export const S = {
  settings: null,
  sync: null,
  _view: null,
  route: { name: 'menu', cat: 'vorspeise' },
  /** Offene Blätter, die bei neuen Daten ihre Verfügbarkeit aktualisieren. */
  live: new Set(),
  /** Entwürfe für Antworten auf Nachfragen (questionId → {quick, text}). */
  drafts: new Map(),
};

export const ev = new EventTarget();
export const emit = (type, detail) => ev.dispatchEvent(new CustomEvent(type, { detail }));
export const on = (type, fn) => ev.addEventListener(type, fn);

/** Zusammengeführte Sicht (wird bei jedem 'data' verworfen). */
export function view() {
  S._view ||= buildView(S.sync.docs());
  return S._view;
}
export const invalidate = () => { S._view = null; };

export const myOrders = () => sortedOrders(view(), (o) => o.deviceId === S.settings.deviceId);

/** Bestellung aus dem eigenen Dokument (änderbar nur innerhalb von sync.mutate). */
export const ownOrder = (id) => view().orders.get(id);

// ---------- lokaler Speicher ----------

function read(key, fallback) {
  try { const v = JSON.parse(localStorage.getItem(key) || 'null'); return v ?? fallback; } catch { return fallback; }
}
function write(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
}

// Oberfläche (Kategorie, Seitenleiste)
export const ui = { cat: 'vorspeise', collapsed: false, ...read('tafel.ui.order', {}) };
export const saveUi = () => write('tafel.ui.order', ui);

// Warenkorb
export const cart = { items: [], note: '', ...read('tafel.cart', {}) };
if (!Array.isArray(cart.items)) cart.items = [];
export function saveCart() {
  write('tafel.cart', { items: cart.items, note: cart.note });
  emit('cart');
}
export const cartCount = () => cart.items.reduce((n, i) => n + (i.qty || 0), 0);

// Gesehene Rückmeldungen der Küche
export const seen = { alerted: {}, viewed: {}, ...read('tafel.seen.order', {}) };
export function saveSeen() {
  // Alte Merker (älter als 8 Tage) entfernen
  const limit = now() - 8 * 86400000;
  for (const bucket of [seen.alerted, seen.viewed]) for (const [k, t] of Object.entries(bucket)) if (t < limit) delete bucket[k];
  write('tafel.seen.order', seen);
}

// ---------- Texte ----------

export const qtyName = (i) => `${i.qty}× ${i.name}`;

/** „2× Mojito, 1× Pasta“ (ohne abbestellte Positionen). */
export function itemsSummary(items) {
  return items.filter((i) => !i.cancelled).map(qtyName).join(', ');
}

export const room = () => S.settings.deviceName || 'Bestellgerät';
