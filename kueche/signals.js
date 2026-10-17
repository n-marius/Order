// Automatische Empfangsbestätigung (Ack) und Signale bei neuen Ereignissen.

import { now, fmtTime } from '../shared/core.js';
import { answerText, stockKey, readyCount } from '../shared/model.js';
import { chime } from '../shared/sound.js';
import { toast } from '../shared/ui.js';
import { app } from './ctx.js';

const SEEN_KEY = 'tafel.seen.kitchen';
const LATE_ACK_MS = 45000;

// ---------- Empfang ----------

export const STOCK_REASON = 'Vorrat nicht ausreichend, da gleichzeitig mehrere Bestellungen eingegangen sind. Bitte erneut bestellen.';

/**
 * Ein Durchlauf je Datenereignis, alles in einem mutate:
 *  - ackRev für jede Bestellung mit noch nicht bestätigter Revision setzen,
 *  - beim ersten Eingang Vorrat (dish.ready) abbuchen; reicht er für die gemeinsam eingegangenen Positionen
 *    eines Gerichts/einer Größe nicht, werden alle diese Positionen storniert,
 *  - Einheiten abbestellter oder von der Küche stornierter Positionen zurückbuchen.
 */
export function autoAck() {
  const { view, sync } = app;
  const todo = [];
  for (const o of view.orders.values()) {
    const merged = view.status.get(o.id)?.ackRev || 0;
    const own = sync.local.status?.[o.id]?.ackRev || 0;
    const rev = o.rev || 1;
    if (Math.max(merged, own) < rev) todo.push({ o, rev, first: merged === 0 && own === 0 });
  }

  // Rückbuchungen
  const returns = [];
  for (const o of view.orders.values()) {
    const st = view.status.get(o.id);
    if (!st) continue;
    for (const it of o.items || []) {
      const is = st.items.get(it.id);
      if ((is?.fromStock || 0) > 0 && !is.stockReturned && (o.cancelled || it.cancelled || is.state === 'storno')) returns.push({ o, it, qty: is.fromStock });
    }
  }

  // Abbuchungen: neu eingegangene Positionen je Gericht und Größe bündeln
  const groups = new Map();
  for (const { o, first } of todo) {
    if (!first || o.cancelled) continue;
    for (const it of o.items || []) {
      const qty = Math.min(+it.stockQty || 0, +it.qty || 1);
      if (it.cancelled || qty <= 0) continue;
      const key = `${it.dishId}|${stockKey(it.sizeId)}`;
      if (!groups.has(key)) groups.set(key, { dishId: it.dishId, sizeId: it.sizeId, sum: 0, entries: [] });
      const g = groups.get(key);
      g.sum += qty;
      g.entries.push({ o, it, qty });
    }
  }

  if (!todo.length && !returns.length) return;
  const stornos = [];
  const t = now();
  sync.mutate((d) => {
    const copies = new Map();
    const dishOf = (id) => {
      if (copies.has(id)) return copies.get(id);
      const own = d.menu.dishes[id];
      const merged = view.dishes.get(id);
      const base = own && !own.deleted && (own.updatedAt || 0) >= (merged?.updatedAt || 0) ? own : merged;
      const c = base ? { ...structuredClone(base), ready: { ...(base.ready || {}) } } : null;
      copies.set(id, c);
      return c;
    };
    const statusOf = (oid) => {
      const s = (d.status[oid] ||= { ackRev: 0, items: {} });
      s.items ||= {};
      return s;
    };
    const itemOf = (o, it) => {
      const s = statusOf(o.id);
      if (!s.items[it.id]) {
        const m = view.status.get(o.id)?.items.get(it.id);
        s.items[it.id] = m ? structuredClone(m) : { state: 'neu', reason: '', questions: [], updatedAt: 0 };
      }
      s.updatedAt = t;
      return s.items[it.id];
    };

    for (const { o, rev } of todo) {
      const s = statusOf(o.id);
      s.ackRev = Math.max(s.ackRev || 0, rev);
      s.updatedAt = t;
    }
    for (const r of returns) {
      const dish = dishOf(r.it.dishId);
      if (dish) dish.ready[stockKey(r.it.sizeId)] = readyCount(dish, r.it.sizeId) + r.qty;
      const is = itemOf(r.o, r.it);
      is.stockReturned = true;
      is.updatedAt = t;
    }
    for (const g of groups.values()) {
      const dish = dishOf(g.dishId);
      const avail = dish ? readyCount(dish, g.sizeId) : 0;
      if (dish && g.sum <= avail) {
        dish.ready[stockKey(g.sizeId)] = avail - g.sum;
        for (const e of g.entries) {
          const is = itemOf(e.o, e.it);
          is.fromStock = e.qty;
          is.stockReturned = false;
          is.updatedAt = t;
        }
      } else {
        for (const e of g.entries) {
          const is = itemOf(e.o, e.it);
          Object.assign(is, { state: 'storno', reason: STOCK_REASON, fromStock: 0, stockReturned: false, updatedAt: t });
          stornos.push(e);
        }
      }
    }
    for (const [id, c] of copies) {
      if (!c) continue;
      c.updatedAt = t;
      d.menu.dishes[id] = c;
    }
  });

  for (const { o, first } of todo) {
    if (!first || o.cancelled || now() - (o.createdAt || 0) <= LATE_ACK_MS) continue;
    sync.queueNotify({
      to: { deviceIds: [o.deviceId] },
      title: 'Bestellung empfangen',
      body: `Die Bestellung von ${fmtTime(o.createdAt)} wurde von der Küche empfangen.`,
      tag: `ack-${o.id}`,
      url: './',
    });
  }
  for (const { o, it } of stornos) {
    sync.queueNotify({
      to: { deviceIds: [o.deviceId] },
      title: `Storniert: ${it.name}`,
      body: STOCK_REASON,
      tag: `storno-${o.id}-${it.id}`,
      url: './',
    });
  }
}

// ---------- „Gesehen“-Zustand (nur lokal) ----------

let seen = readSeen();
let initAfter = seen ? 0 : now();

function readSeen() {
  try { return JSON.parse(localStorage.getItem(SEEN_KEY) || 'null'); } catch { return null; }
}
function writeSeen() {
  try { localStorage.setItem(SEEN_KEY, JSON.stringify(seen)); } catch {}
}

/** Nach einer Neueinrichtung: alles, was beim ersten Abruf vorhanden ist, gilt als gesehen. */
export function resetSeen() {
  seen = null;
  initAfter = now();
  try { localStorage.removeItem(SEEN_KEY); } catch {}
}

function snap(o) {
  let a = 0;
  for (const it of o.items || []) a += Object.keys(it.answers || {}).length;
  return { r: o.rev || 1, c: o.cancelled ? 1 : 0, a };
}

const summary = (o) => (o.items || []).filter((i) => !i.cancelled).map((i) => `${i.qty || 1}× ${i.name}`).join(', ');

function latestAnswer(o) {
  let best = null;
  for (const it of o.items || []) {
    for (const a of Object.values(it.answers || {})) if (!best || (a.at || 0) > (best.a.at || 0)) best = { it, a };
  }
  return best;
}

/**
 * Vergleicht den aktuellen Stand mit dem gesehenen und meldet Neues mit Ton, Banner und Hervorhebung.
 * @param {(orderId:string)=>void} open  öffnet das Detailblatt
 */
export function processSignals(open) {
  const orders = [...app.view.orders.values()];
  if (!seen) {
    // Erster Start: erst nach dem ersten erfolgreichen Abruf alles als gesehen markieren.
    if (!app.sync.state.lastPull || app.sync.state.lastPull < initAfter) return;
    seen = {};
    for (const o of orders) seen[o.id] = snap(o);
    writeSeen();
    return;
  }
  const events = [];
  for (const o of orders) {
    const s = snap(o);
    const p = seen[o.id];
    if (!p) { if (!o.cancelled) events.push({ type: 'new', o }); }
    else {
      if (s.c && !p.c) events.push({ type: 'cancel', o });
      else if (s.r > p.r) events.push({ type: 'change', o });
      if (s.a > p.a) events.push({ type: 'answer', o });
    }
  }
  const ids = new Set(orders.map((o) => o.id));
  const next = {};
  for (const o of orders) next[o.id] = snap(o);
  const changed = JSON.stringify(next) !== JSON.stringify(seen) || Object.keys(seen).some((k) => !ids.has(k));
  seen = next;
  if (changed) writeSeen();
  if (!events.length) return;

  const t = now();
  for (const e of events) app.flash.set(e.o.id, t);

  if (app.settings.sound) {
    const urgent = events.some((e) => e.type === 'cancel' || e.type === 'answer');
    const fresh = events.some((e) => e.type === 'new' || e.type === 'change');
    chime(fresh && !events.some((e) => e.type === 'cancel') ? 'order' : urgent ? 'alert' : 'order');
  }

  const room = (o) => o.deviceName || 'Unbekanntes Gerät';
  const shown = events.slice(0, 3);
  for (const e of shown) {
    const o = e.o;
    const onClick = () => open(o.id);
    if (e.type === 'new') {
      toast(`Neue Bestellung · ${room(o)}`, { message: summary(o), icon: 'tray', ms: 8000, onClick });
    } else if (e.type === 'change') {
      const last = (o.changes || []).at(-1)?.text;
      toast(`Bestellung geändert · ${room(o)}`, { message: last || summary(o), icon: 'compose', ms: 8000, onClick });
    } else if (e.type === 'cancel') {
      toast(`Bestellung storniert · ${room(o)}`, { message: `Die Bestellung von ${fmtTime(o.createdAt)} wurde vom Besteller storniert.`, icon: 'xCircle', tone: 'red', ms: 9000, onClick });
    } else if (e.type === 'answer') {
      const la = latestAnswer(o);
      toast(`Antwort erhalten · ${room(o)}`, { message: la ? `${la.it.name}: ${answerText(la.a)}` : '', icon: 'question', tone: 'yellow', ms: 9000, onClick });
    }
  }
  if (events.length > shown.length) toast(`${events.length - shown.length} weitere Ereignisse`, { icon: 'bell', tone: 'gray', ms: 6000 });
}
