// Datenmodell: Zusammenführen der Gerätedateien, Verfügbarkeit, Positionsstatus.

import { CATEGORIES, now } from './core.js';

export const KITCHEN_ONLINE_MS = 150000;
const DAY = 86400000;

const newer = (a, b) => (!a || (b && (b.updatedAt || 0) > (a.updatedAt || 0)) ? b : a);

/**
 * Baut die zusammengeführte Sicht aus allen Gerätedokumenten.
 * @returns {{
 *   devices: object[], kitchens: object[], orderDevices: object[],
 *   ingredients: Map<string, object>, dishes: Map<string, object>,
 *   orders: Map<string, object>, status: Map<string, {ackRev:number, items: Map<string, object>}>,
 *   kitchenOnline: boolean, kitchenLastSeen: number
 * }}
 */
export function buildView(docs) {
  const devices = [];
  const ingredients = new Map();
  const dishes = new Map();
  const orders = new Map();
  const status = new Map();

  for (const d of docs) {
    if (!d?.device?.id) continue;
    devices.push(d.device);
    if (d.device.role === 'kitchen') {
      for (const ing of Object.values(d.menu?.ingredients || {})) ingredients.set(ing.id, newer(ingredients.get(ing.id), ing));
      for (const dish of Object.values(d.menu?.dishes || {})) dishes.set(dish.id, newer(dishes.get(dish.id), dish));
      for (const [oid, st] of Object.entries(d.status || {})) {
        const cur = status.get(oid) || { ackRev: 0, items: new Map(), updatedAt: 0 };
        cur.ackRev = Math.max(cur.ackRev, st.ackRev || 0);
        cur.updatedAt = Math.max(cur.updatedAt, st.updatedAt || 0);
        for (const [iid, is] of Object.entries(st.items || {})) {
          const prev = cur.items.get(iid);
          const win = newer(prev, is);
          const qs = new Map([...(prev?.questions || []), ...(is.questions || [])].map((q) => [q.id, q]));
          cur.items.set(iid, { ...win, questions: [...qs.values()].sort((a, b) => a.at - b.at) });
        }
        status.set(oid, cur);
      }
    } else {
      for (const o of Object.values(d.orders || {})) orders.set(o.id, { ...o, deviceName: d.device.name || o.deviceName });
    }
  }
  for (const [k, v] of ingredients) if (v.deleted) ingredients.delete(k);
  for (const [k, v] of dishes) if (v.deleted) dishes.delete(k);

  const kitchens = devices.filter((x) => x.role === 'kitchen');
  const kitchenLastSeen = Math.max(0, ...kitchens.map((k) => k.heartbeat || 0));
  return {
    devices, kitchens, orderDevices: devices.filter((x) => x.role === 'order'),
    ingredients, dishes, orders, status,
    kitchenLastSeen, kitchenOnline: now() - kitchenLastSeen < KITCHEN_ONLINE_MS,
  };
}

/** Küche aktuell erreichbar (auch bei zwischengespeicherter Sicht korrekt). */
export const kitchenOnlineNow = (view) => now() - (view.kitchenLastSeen || 0) < KITCHEN_ONLINE_MS;

// ---------- Gerichte ----------

export const MANUAL_PREFIX = 'manual-';
export const isManual = (dishId) => String(dishId || '').startsWith(MANUAL_PREFIX);

/** Virtuelles Gericht „Manuell“ je Kategorie. */
export function manualDish(category) {
  return {
    id: MANUAL_PREFIX + category, name: 'Manuell', category, country: '', manual: true,
    description: 'Freie Bestellung. Der Wunsch wird in der Anmerkung angegeben.',
    imageId: null, sizes: [], ingredients: [], steps: [], options: [], ice: null, sort: 1e9,
  };
}

export function dishesByCategory(view, category) {
  const list = [...view.dishes.values()]
    .filter((d) => d.category === category && !d.hidden)
    .sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0) || a.name.localeCompare(b.name, 'de'));
  return [...list, manualDish(category)];
}

export function emptyDish(category = 'hauptspeise') {
  return {
    id: '', name: '', category, country: '', description: '', imageId: null, prepMinutes: null,
    sizes: [], defaultSizeId: null, ingredients: [], steps: [], options: [],
    ice: null, sort: 0, hidden: false,
  };
}

/** Ist die Zutat (ID) vorhanden? Unbekannte/gelöschte Zutaten gelten als fehlend. */
export const ingredientAvailable = (view, id) => !!view.ingredients.get(id)?.available;

/**
 * Verfügbar ⇔ alle Zutaten vorhanden und jede Pflichtauswahl hat mindestens eine wählbare Option.
 * @returns {{available: boolean, missing: string[]}}
 */
export function dishAvailability(view, dish) {
  if (!dish || dish.manual) return { available: true, missing: [] };
  const missing = (dish.ingredients || [])
    .filter((r) => !ingredientAvailable(view, r.ingredientId))
    .map((r) => view.ingredients.get(r.ingredientId)?.name || 'Unbekannte Zutat');
  for (const g of dish.options || []) {
    if (g.sizeIds?.length) continue; // größenabhängig: wird bei der Auswahl der Größe geprüft
    if (g.required && g.choices?.length && !g.choices.some((c) => choiceAvailable(view, c))) missing.push(`${g.name}: keine Auswahl vorhanden`);
  }
  return { available: missing.length === 0, missing };
}

/** Gilt die Optionsgruppe für die Größe? sizeIds fehlt = für alle Größen. */
export const optionApplies = (group, sizeId) => !group.sizeIds?.length || group.sizeIds.includes(sizeId);

export function choiceAvailable(view, choice) {
  return !choice.ingredientId || ingredientAvailable(view, choice.ingredientId);
}

// ---------- Vorrat (bereits vorbereitete Einheiten) ----------

/** Schlüssel in dish.ready: Größen-ID, ohne Größen '_'. */
export const stockKey = (sizeId) => sizeId || '_';

/** Anzahl vorbereiteter Einheiten für eine Größe (bzw. ohne Größen). */
export const readyCount = (dish, sizeId) => Math.max(0, +(dish?.ready?.[stockKey(sizeId)] || 0));

/** Summe über alle Größen. */
export const readyTotal = (dish) => Object.values(dish?.ready || {}).reduce((a, n) => a + Math.max(0, +n || 0), 0);

/** Zutatenliste für eine Portionsgröße: [{name, amount, unit, available}] */
export function ingredientLines(view, dish, sizeId) {
  return (dish.ingredients || []).map((r) => {
    const ing = view.ingredients.get(r.ingredientId);
    const amount = dish.sizes?.length ? (r.amounts?.[sizeId ?? dish.defaultSizeId ?? dish.sizes[0]?.id] ?? '') : (r.amount ?? '');
    return { id: r.ingredientId, name: ing?.name || 'Unbekannte Zutat', amount, unit: r.unit || '', available: !!ing?.available };
  });
}

/** Lesbare Zusammenfassung einer Bestellposition (ohne Menge). */
export function itemDetails(item) {
  const parts = [];
  if (item.sizeName) parts.push(item.sizeName);
  if (item.ice === true) parts.push('mit Eis');
  if (item.ice === false) parts.push('ohne Eis');
  parts.push(...(item.optionLabels || []));
  return parts;
}

// ---------- Bestellungen ----------

/** Status einer Position aus Sicht beider Seiten. */
export function itemStatus(view, orderId, itemId) {
  return view.status.get(orderId)?.items.get(itemId) || null;
}

export function openQuestions(item, st) {
  return (st?.questions || []).filter((q) => !item.answers?.[q.id]);
}

/** 'abbestellt' | 'storno' | 'fertig' | 'nachfrage' | 'neu' */
export function itemState(view, order, item) {
  if (order.cancelled || item.cancelled) return 'abbestellt';
  const st = itemStatus(view, order.id, item.id);
  if (st?.state === 'storno') return 'storno';
  if (st?.state === 'fertig') return 'fertig';
  if (openQuestions(item, st).length) return 'nachfrage';
  return 'neu';
}

export const STATE_LABEL = { neu: 'Neu', fertig: 'Fertig', storno: 'Storniert', nachfrage: 'Nachfrage', abbestellt: 'Abbestellt' };

/** Bestellung abgeschlossen = keine Position mehr offen. */
export function orderDone(view, order) {
  return order.items.every((it) => ['fertig', 'storno', 'abbestellt'].includes(itemState(view, order, it)));
}

/** Empfangsstatus: 'received' | 'changed' (Änderung noch nicht bei der Küche) | 'pending' */
export function orderAck(view, order) {
  const ack = view.status.get(order.id)?.ackRev || 0;
  if (ack <= 0) return 'pending';
  return ack < (order.rev || 1) ? 'changed' : 'received';
}

export function sortedOrders(view, filter = () => true) {
  return [...view.orders.values()].filter(filter).sort((a, b) => b.createdAt - a.createdAt);
}

export const quickAnswerLabel = { ja: 'Ja', nein: 'Nein', egal: 'Egal' };

export function answerText(a) {
  if (!a) return '';
  return [quickAnswerLabel[a.quick], a.text].filter(Boolean).join(' – ');
}

// ---------- Aufräumen (vor jedem Schreiben) ----------

/** Entfernt alte Einträge, damit die Gerätedateien klein bleiben. */
export function prune(doc, docs) {
  const t = now();
  if (doc.orders) {
    for (const [id, o] of Object.entries(doc.orders)) {
      if (t - o.createdAt > 7 * DAY) delete doc.orders[id];
    }
  }
  if (doc.status) {
    const known = new Set(docs.flatMap((d) => Object.keys(d.orders || {})));
    for (const [id, s] of Object.entries(doc.status)) {
      if (!known.has(id) && t - (s.updatedAt || 0) > 2 * DAY) delete doc.status[id];
    }
  }
  if (doc.menu) {
    for (const coll of [doc.menu.dishes, doc.menu.ingredients]) {
      for (const [id, x] of Object.entries(coll)) if (x.deleted && t - x.updatedAt > 30 * DAY) delete coll[id];
    }
  }
}

export { CATEGORIES };
