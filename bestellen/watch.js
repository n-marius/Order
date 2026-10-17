// Rückmeldungen der Küche erkennen (Storno, Nachfrage) und fehlende Empfangsbestätigungen überwachen.

import { now, fmtAgo, fmtDateTime, fmtTime } from '../shared/core.js';
import { itemStatus, openQuestions, itemState, orderAck, orderDone } from '../shared/model.js';
import { toast } from '../shared/ui.js';
import { chime } from '../shared/sound.js';
import { localNotify } from '../shared/push.js';
import { S, view, myOrders, seen, saveSeen, emit } from './store.js';

const ACK_TIMEOUT = 25000;
const KITCHEN_ONLINE_MS = 150000; // wie shared/model.js
const DAY = 86400000;

export const kitchenOnlineNow = (v) => now() - (v.kitchenLastSeen || 0) < KITCHEN_ONLINE_MS;

export function kitchenText(v) {
  if (!v.kitchenLastSeen) return 'Bisher ist keine Küche verbunden.';
  return kitchenOnlineNow(v) ? `Küche zuletzt aktiv ${fmtAgo(v.kitchenLastSeen)}.` : `Küche offline seit ${fmtDateTime(v.kitchenLastSeen)}.`;
}

// ---------- Storno / Nachfrage ----------

const stornoKey = (o, it) => `s:${o.id}:${it.id}`;
const questionKey = (q) => `q:${q.id}`;

/** Anzahl offener Rückmeldungen (unbeantwortete Nachfragen + ungesehene Stornos). */
export function attentionCount() {
  const v = view();
  let n = 0;
  for (const o of myOrders()) {
    if (o.cancelled) continue;
    for (const it of o.items) {
      const s = itemState(v, o, it);
      if (s === 'nachfrage') n++;
      else if (s === 'storno' && !seen.viewed[stornoKey(o, it)]) n++;
    }
  }
  return n;
}

/** Stornos als gesehen markieren (beim Anzeigen von „Meine Bestellungen“). */
export function markStornosViewed() {
  const v = view();
  let changed = false;
  for (const o of myOrders()) {
    for (const it of o.items) {
      if (itemState(v, o, it) === 'storno' && !seen.viewed[stornoKey(o, it)]) { seen.viewed[stornoKey(o, it)] = now(); changed = true; }
    }
  }
  if (changed) { saveSeen(); emit('badge'); }
}

/** Bei jedem 'data': neue Stornos und Nachfragen melden. */
export function scanFeedback() {
  const v = view();
  const fresh = [];
  for (const o of myOrders()) {
    if (o.cancelled || now() - o.createdAt > 2 * DAY) continue;
    for (const it of o.items) {
      if (it.cancelled) continue;
      const st = itemStatus(v, o.id, it.id);
      if (st?.state === 'storno') {
        const k = stornoKey(o, it);
        if (!seen.alerted[k]) { seen.alerted[k] = now(); fresh.push({ kind: 'storno', o, it, st }); }
      } else if (st?.state !== 'fertig') {
        for (const q of openQuestions(it, st)) {
          const k = questionKey(q);
          if (!seen.alerted[k]) { seen.alerted[k] = now(); fresh.push({ kind: 'question', o, it, q }); }
        }
      }
    }
  }
  if (!fresh.length) return;
  saveSeen();
  for (const f of fresh.slice(0, 3)) {
    const open = () => S.go?.('orders', { focus: f.o.id });
    if (f.kind === 'storno') {
      toast(`Storniert: ${f.it.name}`, {
        message: f.st.reason ? `Grund: ${f.st.reason}` : 'Die Küche hat diese Position storniert.',
        tone: 'red', icon: 'xCircle', ms: 9000, onClick: open,
      });
    } else {
      toast(`Nachfrage zu ${f.it.name}`, { message: f.q.text, tone: 'yellow', icon: 'question', ms: 10000, onClick: open });
    }
  }
  if (fresh.length > 3) toast(`${fresh.length - 3} weitere Rückmeldungen`, { tone: 'gray', icon: 'bell', onClick: () => S.go?.('orders') });
  if (S.settings.sound) chime('alert');
}

// ---------- Empfangsbestätigung ----------

/** orderId:rev → { cleanAt, overdue, done } */
const acks = new Map();
const ackKey = (o) => `${o.id}:${o.rev || 1}`;

/** Liegt der aktuelle Stand dieser Bestellung bereits im Gist? */
export function orderSending(o) {
  return S.sync.state.dirty && (o.updatedAt || 0) >= (S.sync.state.lastPush || 0);
}

export function isOverdue(o) {
  return !!acks.get(ackKey(o))?.overdue && orderAck(view(), o) !== 'received';
}

export function checkAcks() {
  if (!S.sync || !S.settings.gistId) return;
  const v = view();
  const t = now();
  let changed = false;
  for (const o of myOrders()) {
    if (t - o.createdAt > DAY) continue;
    const key = ackKey(o);
    const ack = orderAck(v, o);
    const w = acks.get(key);
    if (ack === 'received') {
      if (w?.overdue && !w.done) {
        w.done = true; changed = true;
        toast((o.rev || 1) > 1 ? 'Die Küche hat die Änderung jetzt empfangen.' : 'Die Küche hat die Bestellung jetzt empfangen.', {
          message: `Bestellung von ${fmtTime(o.createdAt)}`, tone: 'green', icon: 'checkCircle', ms: 5000,
          onClick: () => S.go?.('orders', { focus: o.id }),
        });
      }
      continue;
    }
    if (orderDone(v, o) && !o.cancelled) continue;
    if (!S.sync.state.online || orderSending(o)) continue;
    if (!w) { acks.set(key, { cleanAt: t, overdue: false, done: false }); continue; }
    if (!w.overdue && t - w.cleanAt >= ACK_TIMEOUT) {
      w.overdue = true; changed = true;
      const what = (o.rev || 1) > 1 ? 'die Änderung' : 'die Bestellung';
      const title = `Die Küche hat ${what} noch nicht empfangen.`;
      const msg = kitchenText(v);
      toast(title, { message: msg, tone: 'yellow', icon: 'warning', ms: 10000, onClick: () => S.go?.('orders', { focus: o.id }) });
      localNotify(title, msg, `ack-${o.id}`);
      if (S.settings.sound) chime('soft');
    }
  }
  if (changed) emit('ack');
}
