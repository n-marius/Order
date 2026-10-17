// „Meine Bestellungen“: Empfangsstatus, Positionszustände, Nachfragen beantworten, Ändern und Stornieren.

import { h, now, flag, fmtTime, categoryById } from '../shared/core.js';
import {
  itemStatus, openQuestions, itemState, orderAck, orderDone, itemDetails, answerText, quickAnswerLabel, isManual,
} from '../shared/model.js';
import { sheet, confirm, actionSheet, toast, iconEl } from '../shared/ui.js';
import { S, view, myOrders, itemsSummary, room } from './store.js';
import { openDish } from './menu.js';
import { isOverdue, orderSending, kitchenText } from './watch.js';
import { stockLine } from './stock.js';

const STATE_TEXT = { neu: 'Bestellt', fertig: 'Fertig', storno: 'Storniert', nachfrage: 'Nachfrage', abbestellt: 'Abbestellt' };
const STATE_BADGE = { neu: '', fertig: 'green', storno: 'red', nachfrage: 'yellow', abbestellt: '' };

const dayFmt = new Intl.DateTimeFormat('de-DE', { weekday: 'long', day: 'numeric', month: 'long' });
function dayLabel(ts) {
  const d = new Date(ts); const t = new Date();
  if (d.toDateString() === t.toDateString()) return 'Heute';
  const y = new Date(t); y.setDate(t.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return 'Gestern';
  return dayFmt.format(d);
}

export function renderOrders() {
  const orders = myOrders();
  const open = orders.filter((o) => !o.cancelled && !orderDone(view(), o)).length;
  const head = h('header', { class: 'page-head' },
    h('div', { class: 'page-eyebrow' }, room()),
    h('h1', { class: 't-large' }, 'Meine Bestellungen'),
    h('div', { class: 'page-sub' }, orders.length ? (open ? `${open} offen · ${orders.length} insgesamt` : `${orders.length} abgeschlossen`) : 'Keine Bestellungen'));

  if (!orders.length) {
    return h('div', { class: 'page orders-page' }, head,
      h('div', { class: 'empty' }, iconEl('list'), h('h3', {}, 'Keine Bestellungen'), h('p', {}, 'Bestellungen dieses Geräts erscheinen hier mit ihrem aktuellen Status.')));
  }
  const groups = new Map();
  for (const o of orders) {
    const k = dayLabel(o.createdAt);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(o);
  }
  return h('div', { class: 'page orders-page' }, head,
    [...groups].map(([label, list]) => h('section', { class: 'order-group' },
      h('h2', { class: 'group-title' }, label),
      h('div', { class: 'order-list' }, list.map(orderCard)))));
}

// ---------- Karte je Bestellung ----------

function ackView(o) {
  const v = view();
  const ack = orderAck(v, o);
  if (orderSending(o) && ack !== 'received') return h('div', { class: 'ack sending' }, iconEl('arrowClockwise', 'spin'), 'Wird gesendet …');
  if (ack === 'pending') return h('div', { class: `ack pending${isOverdue(o) ? ' late' : ''}` }, iconEl('clock', isOverdue(o) ? '' : 'pulse'), 'Wartet auf die Küche …');
  if (ack === 'changed') return h('div', { class: 'ack changed' }, iconEl('warning'), 'Änderung noch nicht empfangen');
  return h('div', { class: 'ack received' }, iconEl('checkCircle'), 'Von der Küche empfangen');
}

function orderCard(o) {
  const v = view();
  const done = orderDone(v, o);
  const active = o.items.filter((it) => !it.cancelled);
  const ready = active.filter((it) => itemState(v, o, it) === 'fertig').length;
  const n = active.reduce((s, it) => s + it.qty, 0);
  const sub = o.cancelled ? 'Storniert' : done ? 'Abgeschlossen' : `${n} Artikel${ready ? ` · ${ready} von ${active.length} fertig` : ''}`;

  const overdue = !o.cancelled && isOverdue(o)
    ? h('div', { class: 'notice yellow order-notice' }, iconEl('warning'),
      h('div', { class: 'grow' },
        h('div', { class: 'notice-title' }, (o.rev || 1) > 1 ? 'Die Küche hat die Änderung noch nicht empfangen.' : 'Die Küche hat die Bestellung noch nicht empfangen.'),
        h('div', { class: 'notice-text' }, kitchenText(v))))
    : null;

  const editable = !o.cancelled && !done;
  return h('article', { class: `order-card${o.cancelled ? ' cancelled' : ''}${done ? ' done' : ''}`, id: `order-${o.id}`, dataset: { order: o.id } },
    h('header', { class: 'order-head' },
      h('div', { class: 'grow' },
        h('div', { class: 'order-time' }, `${fmtTime(o.createdAt)} Uhr`),
        h('div', { class: 'order-sub' }, sub)),
      o.cancelled ? h('span', { class: 'badge red' }, 'Storniert') : ackView(o)),
    overdue,
    h('div', { class: 'oitems' }, o.items.map((it) => itemRow(o, it, editable))),
    o.note ? h('div', { class: 'order-note' }, iconEl('note'), h('div', {}, h('div', { class: 'order-note-label' }, 'Anmerkung zur Bestellung'), h('div', {}, o.note))) : null,
    o.changes?.length ? changeLog(o) : null,
    editable ? h('footer', { class: 'order-actions' },
      h('button', { class: 'link-btn', onclick: () => editNote(o.id) }, iconEl('note'), o.note ? 'Anmerkung ändern' : 'Anmerkung hinzufügen'),
      h('button', { class: 'link-btn red', onclick: () => cancelOrder(o.id) }, iconEl('xCircle'), 'Bestellung stornieren')) : null);
}

function changeLog(o) {
  const det = h('details', { class: 'changelog' },
    h('summary', {}, h('span', { class: 'grow' }, 'Änderungsprotokoll'), h('span', { class: 'c2' }, String(o.changes.length)), iconEl('chevronDown', 'cfg-chevron')),
    h('ul', {}, [...o.changes].reverse().map((c) => h('li', {}, h('span', { class: 'num c2' }, fmtTime(c.at)), h('span', {}, c.text)))));
  return det;
}

function itemRow(o, it, orderEditable) {
  const v = view();
  const state = itemState(v, o, it);
  const st = itemStatus(v, o.id, it.id);
  const details = itemDetails(it);
  const fl = flag(it.country);
  const canEdit = orderEditable && (state === 'neu' || state === 'nachfrage');
  const answered = (st?.questions || []).filter((q) => it.answers?.[q.id]);
  const questions = state === 'nachfrage' ? openQuestions(it, st) : [];

  return h('div', { class: `oitem state-${state}`, dataset: { item: it.id } },
    h('div', { class: 'oitem-row' },
      h('span', { class: 'oitem-dot', 'aria-hidden': 'true' }),
      h('div', { class: 'oitem-qty num' }, `${it.qty}×`),
      h('div', { class: 'oitem-main' },
        h('div', { class: 'oitem-name' }, it.name,
          isManual(it.dishId) ? h('span', { class: 'c2' }, ` · ${categoryById(it.category)?.single || ''}`) : null,
          fl ? h('span', { class: 'inline-flag' }, fl) : null),
        details.length ? h('div', { class: 'oitem-det' }, details.join(' · ')) : null,
        it.note ? h('div', { class: 'oitem-note' }, it.note) : null,
        state === 'abbestellt' || state === 'storno' ? null : stockLine(st?.fromStock ?? it.stockQty ?? 0, it.qty, 'stock-line oitem-stock')),
      h('span', { class: `badge ${STATE_BADGE[state]}` }, STATE_TEXT[state]),
      canEdit ? h('button', { class: 'more-btn', 'aria-label': `${it.name}: Aktionen`, onclick: () => itemMenu(o.id, it.id) }, iconEl('ellipsis')) : null),
    state === 'storno' ? h('div', { class: 'ibox red' }, iconEl('xCircle'),
      h('div', { class: 'grow' }, h('div', { class: 'ibox-title' }, 'Von der Küche storniert'), h('div', {}, st?.reason ? `Grund: ${st.reason}` : 'Ohne Angabe eines Grundes.'))) : null,
    questions.map((q) => questionBox(o, it, q)),
    answered.length ? h('div', { class: 'answers' }, answered.map((q) => h('div', { class: 'answer' }, iconEl('checkCircle'),
      h('div', { class: 'grow' }, h('div', { class: 'c2' }, q.text), h('div', {}, answerText(it.answers[q.id])))))) : null);
}

function questionBox(o, it, q) {
  const draft = S.drafts.get(q.id) || { quick: null, text: '' };
  S.drafts.set(q.id, draft);
  const input = h('input', {
    class: 'input', placeholder: 'Antwort (optional)', maxlength: 300, enterkeyhint: 'send', value: draft.text,
    oninput: () => { draft.text = input.value; update(); },
    onkeydown: (e) => { if (e.key === 'Enter') { e.preventDefault(); send(); } },
  });
  const sendBtn = h('button', { class: 'btn mid', onclick: send }, 'Antwort senden');
  const quick = h('div', { class: 'chips quick' });
  function renderQuick() {
    quick.replaceChildren(...Object.entries(quickAnswerLabel).map(([k, label]) => h('button', {
      class: `chip${draft.quick === k ? ' on' : ''}`, 'aria-pressed': String(draft.quick === k),
      onclick: () => { draft.quick = draft.quick === k ? null : k; renderQuick(); update(); },
    }, label)));
  }
  function update() { sendBtn.disabled = !draft.quick && !draft.text.trim(); }
  function send() {
    if (!draft.quick && !draft.text.trim()) return;
    const answer = { quick: draft.quick, text: draft.text.trim(), at: now() };
    S.sync.mutate((d) => {
      const ord = d.orders[o.id];
      const item = ord?.items.find((x) => x.id === it.id);
      if (!item) return;
      item.answers ||= {};
      item.answers[q.id] = answer;
      ord.updatedAt = answer.at;
    });
    S.sync.queueNotify({ to: { role: 'kitchen' }, title: `Antwort von ${room()}`, body: `${it.name}: ${answerText(answer)}`, tag: o.id, url: './' });
    S.drafts.delete(q.id);
    toast('Antwort gesendet', { message: `${it.name}: ${answerText(answer)}`, tone: 'green', icon: 'check', ms: 2500 });
  }
  renderQuick(); update();
  return h('div', { class: 'ibox yellow qbox', dataset: { question: q.id } }, iconEl('question'),
    h('div', { class: 'grow' },
      h('div', { class: 'ibox-title' }, 'Nachfrage der Küche', h('span', { class: 'ibox-time num' }, fmtTime(q.at))),
      h('div', { class: 'qtext' }, q.text),
      quick,
      h('div', { class: 'qreply' }, input, sendBtn)));
}

// ---------- Änderungen ----------

/** Inhaltliche Änderung: rev++, Protokoll, Mitteilung an die Küche. */
function changeOrder(orderId, texts, fn, kind = 'Änderung') {
  if (!texts.length) return;
  const t = now();
  S.sync.mutate((d) => {
    const o = d.orders[orderId];
    if (!o) return;
    fn(o, t);
    o.rev = (o.rev || 1) + 1;
    o.updatedAt = t;
    o.changes ||= [];
    for (const text of texts) o.changes.push({ at: t, text });
  });
  const o = S.sync.local.orders[orderId];
  S.sync.queueNotify({
    to: { role: 'kitchen' }, title: `${kind} · ${room()}`,
    body: `Bestellung von ${fmtTime(o?.createdAt)}: ${texts.join('; ')}`, tag: orderId, url: './',
  });
}

const iceText = (v) => (v === true ? 'mit Eis' : v === false ? 'ohne Eis' : 'ohne Angabe');

export function diffTexts(a, b) {
  const t = [];
  const n = a.name;
  if (a.qty !== b.qty) t.push(`${n}: Menge ${a.qty} → ${b.qty}`);
  if ((a.sizeId || null) !== (b.sizeId || null)) t.push(`${n}: Größe ${a.sizeName || '–'} → ${b.sizeName || '–'}`);
  if ((a.ice ?? null) !== (b.ice ?? null)) t.push(`${n}: ${iceText(a.ice)} → ${iceText(b.ice)}`);
  const ol = (a.optionLabels || []).join('; '); const nl = (b.optionLabels || []).join('; ');
  if (ol !== nl) t.push(`${n}: ${ol || 'keine Optionen'} → ${nl || 'keine Optionen'}`);
  if ((a.note || '') !== (b.note || '')) t.push(b.note ? `${n}: Anmerkung „${b.note}“` : `${n}: Anmerkung entfernt`);
  return t;
}

async function itemMenu(orderId, itemId) {
  const o = S.sync.local.orders[orderId];
  const it = o?.items.find((x) => x.id === itemId);
  if (!it) return;
  const choice = await actionSheet({
    title: `${it.qty}× ${it.name}`,
    actions: [{ text: 'Position ändern', value: 'edit' }, { text: 'Position abbestellen', value: 'cancel', destructive: true }],
  });
  if (choice === 'edit') editItem(orderId, itemId);
  if (choice === 'cancel') cancelItem(orderId, itemId);
}

function editItem(orderId, itemId) {
  const it = S.sync.local.orders[orderId]?.items.find((x) => x.id === itemId);
  if (!it) return;
  openDish(it.dishId, {
    item: it,
    saveLabel: 'Änderung senden',
    stock: false,
    onSave: async (n) => {
      const cur = S.sync.local.orders[orderId]?.items.find((x) => x.id === itemId);
      if (!cur) return;
      const texts = diffTexts(cur, n);
      if (!texts.length) return;
      if (!(await confirm('Änderung senden?', texts.join('\n'), 'Senden'))) return;
      changeOrder(orderId, texts, (o) => {
        const x = o.items.find((y) => y.id === itemId);
        if (!x) return;
        Object.assign(x, {
          qty: n.qty, sizeId: n.sizeId, sizeName: n.sizeName, ice: n.ice, options: n.options, optionLabels: n.optionLabels, note: n.note,
          // Vorrat wurde beim Eingang verbucht: nie erhöhen, bei kleinerer Menge begrenzen
          stockQty: Math.min(x.stockQty || 0, n.qty),
        });
      });
      toast('Änderung gesendet', { message: texts.join('; '), icon: 'pencil', ms: 3000 });
    },
  });
}

async function cancelItem(orderId, itemId) {
  const o = S.sync.local.orders[orderId];
  const it = o?.items.find((x) => x.id === itemId);
  if (!it) return;
  const rest = o.items.filter((x) => !x.cancelled && x.id !== itemId);
  if (!rest.length) return cancelOrder(orderId);
  if (!(await confirm(`${it.name} abbestellen?`, 'Die Küche wird über die Abbestellung informiert.', 'Abbestellen', true))) return;
  changeOrder(orderId, [`${it.qty}× ${it.name} abbestellt`], (ord, t) => {
    const x = ord.items.find((y) => y.id === itemId);
    if (x) { x.cancelled = true; x.cancelledAt = t; }
  });
  toast(`${it.name} abbestellt`, { tone: 'gray', icon: 'xCircle', ms: 2500 });
}

async function cancelOrder(orderId) {
  const o = S.sync.local.orders[orderId];
  if (!o || o.cancelled) return;
  if (!(await confirm('Bestellung stornieren?', `${itemsSummary(o.items)}\nDie Küche wird über die Stornierung informiert.`, 'Stornieren', true))) return;
  changeOrder(orderId, ['Bestellung storniert'], (ord, t) => { ord.cancelled = true; ord.cancelledAt = t; }, 'Storniert');
  toast('Bestellung storniert', { tone: 'red', icon: 'xCircle', ms: 2500 });
}

function editNote(orderId) {
  const o = S.sync.local.orders[orderId];
  if (!o) return;
  const ta = h('textarea', { class: 'textarea', rows: 4, maxlength: 500, placeholder: 'Anmerkung zur Bestellung' });
  ta.value = o.note || '';
  const sh = sheet({
    title: 'Anmerkung',
    body: h('div', { class: 'note-sheet' }, h('div', { class: 'section-head' }, 'Anmerkung zur Bestellung'), ta,
      h('div', { class: 'section-foot' }, 'Die Küche wird über die Änderung informiert.')),
    right: {
      text: 'Senden', bold: true,
      onClick: async () => {
        const val = ta.value.trim();
        const cur = S.sync.local.orders[orderId];
        if (!cur || val === (cur.note || '')) { sh.close('save'); return; }
        sh.close('save');
        changeOrder(orderId, [val ? `Anmerkung zur Bestellung: „${val}“` : 'Anmerkung zur Bestellung entfernt'], (ord) => { ord.note = val; });
        toast('Änderung gesendet', { icon: 'note', ms: 2500 });
      },
    },
  });
  sh.el.classList.add('note-sheet-wrap');
  setTimeout(() => ta.focus(), 450);
}
