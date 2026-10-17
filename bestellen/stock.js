// Vorrat: bereits vorbereitete Einheiten (dish.ready) für Anzeige und Bestellung.

import { h } from '../shared/core.js';
import { readyCount, readyTotal, stockKey, isManual, dishAvailability } from '../shared/model.js';

/** Blitz-Symbol (gefüllt) für „sofort verfügbar“. */
export const BOLT = '<svg class="icon bolt" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M13.6 2.4c.4-.5 1.2-.2 1.1.5l-1 6.6h5.1c.6 0 .9.7.5 1.2l-8.9 10.9c-.4.5-1.2.2-1.1-.5l1-6.6H5.2c-.6 0-.9-.7-.5-1.2z"/></svg>';
export const boltEl = () => h('span', { class: 'bolt-wrap', html: BOLT });

/** Sofort verfügbare Einheiten eines Gerichts (0, wenn das Gericht nicht bestellbar ist). */
export function readyFor(v, dish, sizeId) {
  if (!dish || dish.manual || !dishAvailability(v, dish).available) return 0;
  return readyCount(dish, sizeId);
}
export function readySum(v, dish) {
  if (!dish || dish.manual || !dishAvailability(v, dish).available) return 0;
  return readyTotal(dish);
}

/** Vorrat je Größe für ein Gericht mit Größen: [{size, n}] */
export const readyBySize = (dish) => (dish.sizes || []).map((s) => ({ size: s, n: readyCount(dish, s.id) }));

/**
 * Verteilt den aktuellen Vorrat in Reihenfolge auf mehrere Positionen (je Gericht und Größe zusammen
 * höchstens so viele wie vorbereitet). @returns {Map<itemId, number>}
 */
export function allocateStock(v, items) {
  const used = new Map();
  const out = new Map();
  for (const it of items) {
    if (isManual(it.dishId) || it.cancelled) { out.set(it.id, 0); continue; }
    const key = `${it.dishId}|${stockKey(it.sizeId)}`;
    const free = Math.max(0, readyFor(v, v.dishes.get(it.dishId), it.sizeId) - (used.get(key) || 0));
    const n = Math.min(it.qty, free);
    used.set(key, (used.get(key) || 0) + n);
    out.set(it.id, n);
  }
  return out;
}

/** Grüne Zeile „davon n sofort verfügbar“ (oder null). */
export function stockLine(n, qty, cls = 'stock-line') {
  n = Math.min(n || 0, qty);
  if (!(n > 0)) return null;
  return h('div', { class: cls }, boltEl(), n >= qty && qty === 1 ? 'Sofort verfügbar' : `davon ${n} sofort verfügbar`);
}
