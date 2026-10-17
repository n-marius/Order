// Bestellungen: Dashboard (offen), Erledigt-Liste, Detailblatt mit Positionsaktionen.

import { h, now, fmtTime, fmtDateTime, flag, uid } from '../shared/core.js';
import { itemState, itemStatus, itemDetails, orderDone, orderAck, STATE_LABEL, answerText } from '../shared/model.js';
import { sheet, prompt, toast, iconEl, icon, segmented, section, alert } from '../shared/ui.js';
import { app, ago, store, liveSheet, largeTitle, emptyState, keepScroll, put } from './ctx.js';
import { openRecipe } from './dishes.js';

const RECENT_CANCEL_MS = 10 * 60e3;
const DAY = 86400000;

export const isOpenOrder = (o) => !orderDone(app.view, o);
export const openOrders = () => [...app.view.orders.values()].filter(isOpenOrder);

/** Offene Bestellungen plus kürzlich vom Besteller stornierte (damit der Storno nicht übersehen wird). */
export function dashboardOrders(sort = 'old') {
  const t = now();
  const list = [...app.view.orders.values()].filter((o) => isOpenOrder(o) || (o.cancelled && t - (o.cancelledAt || o.updatedAt || 0) < RECENT_CANCEL_MS));
  return list.sort((a, b) => (sort === 'new' ? b.createdAt - a.createdAt : a.createdAt - b.createdAt));
}

// ---------- Auswertung je Position ----------

const CLOSED = ['fertig', 'storno', 'abbestellt'];
const BADGE = { neu: 'blue', fertig: 'green', storno: 'red', nachfrage: 'yellow', abbestellt: '' };
const STATE_ICON = { fertig: 'check', storno: 'xmark', nachfrage: 'question', abbestellt: 'minus' };

function itemInfo(order, item) {
  const state = itemState(app.view, order, item);
  const st = itemStatus(app.view, order.id, item.id);
  const questions = st?.questions || [];
  const newAnswer = !CLOSED.includes(state) && questions.some((q) => {
    const a = item.answers?.[q.id];
    return a && (a.at || 0) >= (st.updatedAt || 0);
  });
  return { state, st, questions, newAnswer };
}

function orderInfo(order) {
  const infos = order.items.map((it) => itemInfo(order, it));
  const counted = infos.filter((i) => i.state !== 'abbestellt' && i.state !== 'storno');
  return {
    infos,
    done: counted.filter((i) => i.state === 'fertig').length,
    total: counted.length,
    open: infos.filter((i) => !CLOSED.includes(i.state)).length,
  };
}

const badge = (cls, ic, text) => h('span', { class: `badge ${cls}` }, ic ? iconEl(ic) : null, text);

function orderBadges(order, info) {
  const out = [];
  if (order.cancelled) out.push(badge('solid-red', 'xCircle', 'Storniert'));
  if (info.infos.some((i) => i.state === 'nachfrage')) out.push(badge('yellow', 'question', 'Nachfrage offen'));
  if (info.infos.some((i) => i.newAnswer)) out.push(badge('blue', 'bell', 'Antwort erhalten'));
  if (!order.cancelled && (order.rev || 1) > 1) out.push(badge('tint', 'compose', 'Geändert'));
  const ab = order.cancelled ? 0 : order.items.filter((i) => i.cancelled).length;
  if (ab) out.push(badge('', 'minus', ab === 1 ? '1 Position abbestellt' : `${ab} Positionen abbestellt`));
  return out;
}

function lateClass(ts) {
  const age = now() - (ts || 0);
  return age > 40 * 60e3 ? 'very-late' : age > 20 * 60e3 ? 'late' : '';
}

const positions = (n) => (n === 1 ? '1 Position' : `${n} Positionen`);

// ---------- Dashboard ----------

function orderCard(order) {
  const info = orderInfo(order);
  const badges = orderBadges(order, info);
  const ft = app.flash.get(order.id);
  const flash = ft && now() - ft < 3000;
  const visible = order.items.filter((i) => !i.cancelled || !order.cancelled);
  return h('button', {
    class: `k-order${order.cancelled ? ' is-cancelled' : ''}${flash ? ' k-flash' : ''}`,
    dataset: { order: order.id },
    onclick: () => openOrderSheet(order.id),
  },
  h('div', { class: 'k-oh' },
    h('div', { class: 'grow' },
      h('div', { class: 'k-room' }, order.deviceName || 'Unbekanntes Gerät'),
      h('div', { class: 'k-osub' }, positions(order.items.length))),
    h('div', { class: `k-otime ${order.cancelled ? '' : lateClass(order.createdAt)}` },
      h('div', { class: 'k-clock num' }, fmtTime(order.createdAt)),
      ago(order.createdAt, 'k-ago'))),
  badges.length ? h('div', { class: 'k-badges' }, badges) : null,
  order.note ? h('div', { class: 'k-onote' }, iconEl('note'), h('span', null, order.note)) : null,
  h('div', { class: 'k-lines' }, visible.map((it) => orderLine(it, info.infos[order.items.indexOf(it)]))),
  !order.cancelled && info.total ? progress(info.done, info.total) : null);
}

function orderLine(it, info) {
  const det = itemDetails(it);
  const ic = STATE_ICON[info.state];
  return h('div', { class: `k-line state-${info.state}` },
    h('span', { class: 'k-qty num' }, `${it.qty || 1}×`),
    h('div', { class: 'k-lmain' },
      h('div', { class: 'k-lname' }, it.country ? h('span', { class: 'k-flag' }, flag(it.country)) : null, h('span', null, it.name)),
      det.length ? h('div', { class: 'k-ldet' }, det.join(' · ')) : null,
      it.note ? h('div', { class: 'k-lnote' }, it.note) : null),
    ic ? h('span', { class: 'k-lstate', html: icon(ic) }) : h('span', { class: 'k-lstate dot' }));
}

function progress(done, total) {
  const pct = total ? Math.round((done / total) * 100) : 0;
  return h('div', { class: 'k-progress' },
    h('div', { class: 'k-bar' }, h('i', { style: { width: `${pct}%` } })),
    h('span', { class: 'num' }, `${done} von ${total} fertig`));
}

export function ordersView() {
  let sort = store.get('sort', 'old');
  const sub = h('div', { class: 'k-subtitle' });
  const grid = h('div', { class: 'k-orders' });
  const seg = segmented([{ value: 'old', label: 'Älteste zuerst' }, { value: 'new', label: 'Neueste zuerst' }], sort, (v) => {
    sort = v; store.set('sort', v); update();
  });
  seg.classList.add('k-sortseg');
  const el = h('div', { class: 'page' }, largeTitle('Bestellungen', sub, seg), grid);

  function update() {
    const list = dashboardOrders(sort);
    const open = list.filter(isOpenOrder);
    const items = open.reduce((n, o) => n + orderInfo(o).open, 0);
    sub.textContent = open.length ? `${open.length} offen · ${items === 1 ? '1 Position' : `${items} Positionen`} zu erledigen` : 'Alles erledigt';
    seg.hidden = list.length < 2;
    if (!list.length) {
      grid.classList.add('is-empty');
      grid.replaceChildren(emptyState('tray', 'Keine offenen Bestellungen', 'Neue Bestellungen der Bestellgeräte erscheinen hier automatisch und werden mit einem Signal angekündigt.'));
      return;
    }
    grid.classList.remove('is-empty');
    grid.replaceChildren(...list.map(orderCard));
  }
  return { el, update, tick: update };
}

// ---------- Erledigt ----------

function dayLabel(ts) {
  const d = new Date(ts); d.setHours(0, 0, 0, 0);
  const t = new Date(); t.setHours(0, 0, 0, 0);
  const diff = Math.round((t - d) / DAY);
  if (diff === 0) return 'Heute';
  if (diff === 1) return 'Gestern';
  return new Intl.DateTimeFormat('de-DE', { weekday: 'long', day: 'numeric', month: 'long' }).format(d);
}

export function doneView() {
  const sub = h('div', { class: 'k-subtitle' });
  const list = h('div');
  const el = h('div', { class: 'page k-narrow' }, largeTitle('Erledigt', sub), list);

  function row(o) {
    const info = orderInfo(o);
    const storno = info.infos.filter((i) => i.state === 'storno').length;
    const summary = o.items.filter((i) => !i.cancelled || o.cancelled).map((i) => `${i.qty || 1}× ${i.name}`).join(', ');
    const status = o.cancelled
      ? badge('red', 'xCircle', 'Storniert')
      : storno ? badge('', null, storno === info.infos.length ? 'Storniert' : `${info.done} fertig · ${storno} storniert`)
        : badge('green', 'check', 'Fertig');
    return h('button', { class: 'cell tappable k-done-row', onclick: () => openOrderSheet(o.id) },
      h('div', { class: 'k-done-time num' }, fmtTime(o.createdAt)),
      h('div', { class: 'cell-body' },
        h('div', { class: 'cell-title k-done-room' }, o.deviceName || 'Unbekanntes Gerät'),
        h('div', { class: 'cell-sub ellipsis' }, summary || positions(o.items.length))),
      status,
      iconEl('chevronRight', 'cell-chevron'));
  }

  function update() {
    const orders = [...app.view.orders.values()].filter((o) => orderDone(app.view, o)).sort((a, b) => b.createdAt - a.createdAt);
    sub.textContent = orders.length ? `${orders.length === 1 ? '1 Bestellung' : `${orders.length} Bestellungen`} der letzten Tage` : '';
    if (!orders.length) {
      list.replaceChildren(emptyState('checkCircle', 'Noch nichts erledigt', 'Abgeschlossene Bestellungen der letzten sieben Tage werden hier aufgeführt.'));
      return;
    }
    const groups = new Map();
    for (const o of orders) {
      const k = dayLabel(o.createdAt);
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(o);
    }
    list.replaceChildren(...[...groups].map(([k, os]) => section(k, os.map(row))));
  }
  return { el, update, tick: update };
}

// ---------- Statusänderungen ----------

function writeItem(order, item, { state, reason = '', questions }) {
  app.sync.mutate((d) => {
    const s = (d.status[order.id] ||= { ackRev: 0, items: {} });
    s.items ||= {};
    s.items[item.id] = { state, reason, questions, updatedAt: now() };
    s.updatedAt = now();
  });
}

async function itemAction(order, item, kind) {
  const prev = itemStatus(app.view, order.id, item.id);
  let questions = [...(prev?.questions || [])];
  const label = `${item.qty > 1 ? `${item.qty}× ` : ''}${item.name}`;

  if (kind === 'done') {
    writeItem(order, item, { state: 'fertig', questions });
  } else if (kind === 'storno') {
    const reason = await prompt('Position stornieren', `${label} – der Grund wird dem Bestellgerät mitgeteilt.`, { placeholder: 'Grund (optional)', okText: 'Stornieren' });
    if (reason === null) return;
    writeItem(order, item, { state: 'storno', reason, questions });
    app.sync.queueNotify({
      to: { deviceIds: [order.deviceId] },
      title: `Storniert: ${item.name}`,
      body: reason || 'Die Position wurde von der Küche storniert.',
      tag: `storno-${order.id}-${item.id}`,
      url: './',
    });
  } else if (kind === 'question') {
    let text = '';
    for (;;) {
      const r = await prompt(`Nachfrage zu ${item.name}`, 'Die Nachfrage wird an das Bestellgerät gesendet.', { placeholder: 'Text der Nachfrage', value: text, okText: 'Senden' });
      if (r === null) return;
      text = r.trim();
      if (text) break;
      await alert({ title: 'Text erforderlich', message: 'Eine Nachfrage ohne Text kann nicht gesendet werden.' });
    }
    questions = [...questions, { id: uid('q'), text, at: now() }];
    writeItem(order, item, { state: 'neu', questions });
    app.sync.queueNotify({
      to: { deviceIds: [order.deviceId] },
      title: `Nachfrage zu ${item.name}`,
      body: text,
      tag: `frage-${order.id}-${item.id}`,
      url: './',
    });
  } else if (kind === 'reset') {
    // Zurück auf „Neu“: offene (unbeantwortete) Nachfragen werden zurückgezogen.
    questions = questions.filter((q) => item.answers?.[q.id]);
    writeItem(order, item, { state: 'neu', questions });
  }
}

function allDone(order, api) {
  const items = order.items.filter((it) => !CLOSED.includes(itemState(app.view, order, it)));
  if (!items.length) return;
  app.sync.mutate((d) => {
    const s = (d.status[order.id] ||= { ackRev: 0, items: {} });
    s.items ||= {};
    for (const it of items) {
      const prev = itemStatus(app.view, order.id, it.id);
      s.items[it.id] = { state: 'fertig', reason: '', questions: [...(prev?.questions || [])], updatedAt: now() };
    }
    s.updatedAt = now();
  });
  api.close();
  toast(`${order.deviceName || 'Bestellung'} erledigt`, { message: 'Die Bestellung befindet sich jetzt unter „Erledigt“.', icon: 'checkCircle', tone: 'green', ms: 3000 });
}

// ---------- Detailblatt ----------

const openSheets = new Map();

export function openOrderSheet(orderId) {
  if (openSheets.has(orderId)) return;
  const body = h('div', { class: 'k-detail' });
  let unlisten = () => {};
  const api = sheet({
    title: app.view.orders.get(orderId)?.deviceName || 'Bestellung',
    body,
    left: null,
    right: { text: 'Schließen', bold: true },
    onClose: () => { unlisten(); openSheets.delete(orderId); },
  });
  api.el.classList.add('k-order-sheet');
  openSheets.set(orderId, api);
  unlisten = liveSheet(render);

  function render() {
    const order = app.view.orders.get(orderId);
    if (!order) {
      body.replaceChildren(emptyState('tray', 'Bestellung nicht mehr vorhanden', 'Ältere Bestellungen werden nach sieben Tagen automatisch entfernt.'));
      api.setFoot(null);
      return;
    }
    api.setTitle(order.deviceName || 'Bestellung');
    const info = orderInfo(order);
    const ack = orderAck(app.view, order);
    keepScroll(api.body, () => put(body,
      h('div', { class: 'k-dhead' },
        h('div', { class: 'k-dmeta' },
          h('span', null, `Bestellt um ${fmtTime(order.createdAt)}`), h('span', { class: 'k-dot' }, '·'), ago(order.createdAt),
          h('span', { class: 'k-dot' }, '·'), h('span', null, ack === 'pending' ? 'Noch nicht bestätigt' : 'Empfangen')),
        orderBadges(order, info).length ? h('div', { class: 'k-badges' }, orderBadges(order, info)) : null),
      order.cancelled ? h('div', { class: 'notice red k-cancel-note' }, iconEl('xCircle'),
        h('div', null, h('div', { class: 't-headline' }, 'Bestellung storniert'),
          h('div', { class: 't-sub' }, `Die gesamte Bestellung wurde vom Besteller${order.cancelledAt ? ` um ${fmtTime(order.cancelledAt)}` : ''} storniert.`))) : null,
      order.note ? h('div', { class: 'notice k-note' }, iconEl('note'),
        h('div', null, h('div', { class: 'k-note-label' }, 'Anmerkung zur Bestellung'), h('div', null, order.note))) : null,
      h('div', { class: 'k-items' }, order.items.map((it, i) => itemBlock(order, it, info.infos[i]))),
      (order.changes || []).length ? section('Änderungsprotokoll', [...order.changes].sort((a, b) => b.at - a.at).map((c) =>
        h('div', { class: 'cell k-change' }, h('div', { class: 'cell-body' }, h('div', { class: 't-sub' }, c.text)), h('div', { class: 'cell-value num t-foot' }, fmtDateTime(c.at))))) : null,
    ));
    api.setFoot(!order.cancelled && info.open
      ? h('button', { class: 'btn ok block k-alldone', onclick: () => allDone(order, api) }, iconEl('checkCircle'), info.open === 1 ? 'Position fertig' : `Alles fertig (${info.open})`)
      : null);
  }

  function itemBlock(order, it, info) {
    const st = info.state;
    const det = itemDetails(it);
    const reason = info.st?.reason;
    const head = h('button', { class: 'k-ihead', onclick: () => openRecipe({ dishId: it.dishId, item: it, order }) },
      h('span', { class: 'k-iqty num' }, `${it.qty || 1}×`),
      h('div', { class: 'grow' },
        h('div', { class: 'k-iname' }, it.country ? h('span', { class: 'k-flag' }, flag(it.country)) : null, h('span', null, it.name)),
        det.length ? h('div', { class: 'k-idet' }, det.join(' · ')) : null,
        it.note ? h('div', { class: 'k-inote' }, iconEl('note'), h('span', null, it.note)) : null,
        st === 'storno' ? h('div', { class: 'k-ireason red' }, reason ? `Storniert: ${reason}` : 'Von der Küche storniert') : null,
        st === 'abbestellt' ? h('div', { class: 'k-ireason' }, order.cancelled ? 'Mit der Bestellung storniert' : `Vom Besteller abbestellt${it.cancelledAt ? ` um ${fmtTime(it.cancelledAt)}` : ''}`) : null),
      h('div', { class: 'k-iend' }, h('span', { class: `badge ${BADGE[st]}` }, STATE_LABEL[st]), iconEl('chevronRight', 'cell-chevron')));

    const thread = info.questions.length ? h('div', { class: 'k-thread' }, info.questions.flatMap((q) => {
      const a = it.answers?.[q.id];
      return [
        h('div', { class: 'k-bubble q' }, h('div', null, q.text), h('div', { class: 'k-bmeta' }, `Küche · ${fmtTime(q.at)}`)),
        a ? h('div', { class: 'k-bubble a' }, h('div', null, answerText(a) || '–'), h('div', { class: 'k-bmeta' }, `${order.deviceName || 'Besteller'} · ${fmtTime(a.at)}`))
          : h('div', { class: 'k-waiting' }, 'Antwort ausstehend'),
      ];
    })) : null;

    const btn = (cls, ic, text, kind) => h('button', { class: `k-act ${cls}`, onclick: () => itemAction(order, it, kind) }, iconEl(ic), h('span', null, text));
    let actions = [];
    if (st === 'neu' || st === 'nachfrage') {
      actions = [btn('ok', 'check', 'Fertig', 'done'), btn('warn', 'question', 'Nachfrage', 'question'), btn('danger', 'xmark', 'Storno', 'storno')];
      if (st === 'nachfrage') actions.push(btn('gray', 'undo', 'Zurückziehen', 'reset'));
    } else if (st === 'fertig') {
      actions = [btn('gray', 'undo', 'Zurück auf „Neu“', 'reset'), btn('danger', 'xmark', 'Storno', 'storno')];
    } else if (st === 'storno') {
      actions = [btn('gray', 'undo', 'Zurück auf „Neu“', 'reset')];
    }
    return h('div', { class: `k-item state-${st}${info.newAnswer ? ' has-answer' : ''}` }, head, thread,
      actions.length ? h('div', { class: 'k-iacts', style: `--n:${actions.length}` }, actions) : null);
  }

  render();
}
