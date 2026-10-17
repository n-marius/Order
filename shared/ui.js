// UI-Bausteine im iOS-Stil: Sheets, Dialoge, Aktionsblatt, Banner, Schalter, Segmente, Stepper,
// Verbindungsanzeige, Foto-Auswahl.

import { h, fmtAgo, haptic } from './core.js';
import { icon, iconEl } from './icons.js';

const nextFrame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

// ---------- Sheet ----------

/**
 * Modales Blatt. iPhone: von unten; iPad: zentriertes Formblatt.
 * @param {object} o
 * @param {string} o.title
 * @param {Node|Node[]} o.body          Inhalt
 * @param {Node} [o.foot]               fester Fußbereich (z. B. Bestellknopf)
 * @param {{text:string, bold?:boolean, onClick?:Function, disabled?:boolean}|null} [o.left]  Standard: „Abbrechen“
 * @param {{text?:string, icon?:string, bold?:boolean, onClick?:Function, disabled?:boolean}} [o.right]
 * @param {boolean} [o.wide]  breiteres Blatt auf dem iPad
 * @param {boolean} [o.plain] weißer statt grauer Hintergrund
 * @param {Function} [o.onClose]
 * @param {boolean} [o.dismissable=true] Tippen auf Hintergrund schließt
 * @returns {{el:HTMLElement, body:HTMLElement, close:Function, setTitle:Function, setRight:Function}}
 */
export function sheet(o) {
  const close = async (reason) => {
    if (!root.isConnected) return;
    root.classList.remove('in');
    setTimeout(() => root.remove(), 420);
    o.onClose?.(reason);
  };
  const barBtn = (b, side) => {
    if (!b) return h('span');
    const el = h('button', { class: `barbtn${b.bold ? ' bold' : ''}`, disabled: !!b.disabled, onclick: () => (b.onClick ? b.onClick(api) : close(side)) },
      b.icon ? iconEl(b.icon) : null, b.text || null);
    return el;
  };
  const leftDef = o.left === undefined ? { text: 'Abbrechen' } : o.left;
  const titleEl = h('div', { class: 'navbar-title' }, o.title || '');
  const leftWrap = h('div', { class: 'navbar-side' }, barBtn(leftDef, 'left'));
  const rightWrap = h('div', { class: 'navbar-side end' }, barBtn(o.right, 'right'));
  const nav = h('div', { class: 'navbar' }, h('div', { class: 'navbar-row' }, leftWrap, titleEl, rightWrap));
  const body = h('div', { class: 'sheet-body' }, o.body);
  body.addEventListener('scroll', () => nav.classList.toggle('scrolled', body.scrollTop > 4), { passive: true });
  const sh = h('div', { class: `sheet${o.wide ? ' wide' : ''}${o.plain ? ' plain' : ''}`, role: 'dialog', 'aria-modal': 'true' },
    h('div', { class: 'sheet-grabber' }), nav, body, o.foot ? h('div', { class: 'sheet-foot' }, o.foot) : null);
  const dim = h('div', { class: 'sheet-dim', onclick: () => { if (o.dismissable !== false) close('dim'); } });
  const root = h('div', { class: 'sheet-root' }, dim, sh);

  // Wischen nach unten zum Schließen (nur am Griff/Navigationsbereich)
  let y0 = null;
  nav.addEventListener('touchstart', (e) => { y0 = e.touches[0].clientY; }, { passive: true });
  nav.addEventListener('touchmove', (e) => {
    if (y0 == null) return;
    const dy = Math.max(0, e.touches[0].clientY - y0);
    sh.style.transition = 'none';
    sh.style.transform = `translateY(${dy}px)`;
  }, { passive: true });
  nav.addEventListener('touchend', (e) => {
    const dy = (e.changedTouches[0]?.clientY ?? 0) - (y0 ?? 0);
    sh.style.transition = ''; sh.style.transform = '';
    y0 = null;
    if (dy > 110 && o.dismissable !== false) close('swipe');
  });

  document.body.append(root);
  nextFrame().then(() => root.classList.add('in'));
  const api = {
    el: sh, body, close,
    setTitle: (t) => { titleEl.textContent = t; },
    setRight: (b) => rightWrap.replaceChildren(barBtn(b, 'right')),
    setLeft: (b) => leftWrap.replaceChildren(barBtn(b, 'left')),
    setFoot: (node) => {
      let f = sh.querySelector('.sheet-foot');
      if (!node) { f?.remove(); return; }
      if (!f) { f = h('div', { class: 'sheet-foot' }); sh.append(f); }
      f.replaceChildren(node);
    },
  };
  return api;
}

// ---------- Alert / Prompt ----------

/**
 * @param {{title:string, message?:string, buttons?:{text:string, value?:any, style?:'cancel'|'destructive'|'default', bold?:boolean}[], input?:{placeholder?:string, value?:string}}} o
 * @returns {Promise<any>} value des gedrückten Knopfs (bei input: {value, text})
 */
export function alert(o) {
  return new Promise((resolve) => {
    const buttons = o.buttons || [{ text: 'OK', value: true, bold: true }];
    const input = o.input ? h('input', { class: 'input', placeholder: o.input.placeholder || '', value: o.input.value || '' }) : null;
    const done = (v) => {
      root.classList.remove('in');
      setTimeout(() => root.remove(), 220);
      resolve(input ? { value: v, text: input.value.trim() } : v);
    };
    const btns = h('div', { class: `alert-btns${buttons.length > 2 ? ' stack' : ''}` },
      buttons.map((b) => h('button', { class: `${b.style === 'destructive' ? 'destructive' : ''} ${b.bold || b.style === 'cancel' ? 'bold' : ''}`, onclick: () => done(b.value) }, b.text)));
    const root = h('div', { class: 'alert-root', role: 'alertdialog' },
      h('div', { class: 'alert' },
        h('div', { class: 'alert-text' }, h('div', { class: 'alert-title' }, o.title), o.message ? h('div', { class: 'alert-msg' }, o.message) : null, input),
        btns));
    document.body.append(root);
    nextFrame().then(() => { root.classList.add('in'); input?.focus(); });
  });
}

export async function confirm(title, message, okText = 'OK', destructive = false) {
  return alert({ title, message, buttons: [{ text: 'Abbrechen', value: false, style: 'cancel' }, { text: okText, value: true, style: destructive ? 'destructive' : 'default', bold: !destructive }] });
}

export async function prompt(title, message, { placeholder = '', value = '', okText = 'OK' } = {}) {
  const r = await alert({ title, message, input: { placeholder, value }, buttons: [{ text: 'Abbrechen', value: false }, { text: okText, value: true, bold: true }] });
  return r.value ? r.text : null;
}

// ---------- Aktionsblatt ----------

/** @param {{title?:string, actions:{text:string, value:any, destructive?:boolean}[]}} o @returns {Promise<any|null>} */
export function actionSheet(o) {
  return new Promise((resolve) => {
    const done = (v) => { root.classList.remove('in'); setTimeout(() => root.remove(), 380); resolve(v); };
    const root = h('div', { class: 'action-root', onclick: (e) => { if (e.target === root) done(null); } },
      h('div', { class: 'action-sheet' },
        h('div', { class: 'action-group' }, o.title ? h('div', { class: 'action-title' }, o.title) : null,
          o.actions.map((a) => h('button', { class: a.destructive ? 'destructive' : '', onclick: () => done(a.value) }, a.text))),
        h('div', { class: 'action-group cancel' }, h('button', { onclick: () => done(null) }, 'Abbrechen'))));
    document.body.append(root);
    nextFrame().then(() => root.classList.add('in'));
  });
}

// ---------- Banner ----------

let toastWrap;
/**
 * Banner oben (wie iOS-Mitteilung in der App).
 * @param {string} title @param {{message?:string, tone?:'tint'|'red'|'yellow'|'green'|'gray', icon?:string, ms?:number, onClick?:Function}} o
 */
export function toast(title, o = {}) {
  toastWrap ||= document.body.appendChild(h('div', { class: 'toasts', 'aria-live': 'polite' }));
  const el = h('div', { class: `toast ${o.tone || ''}`, onclick: () => { o.onClick?.(); hide(); } },
    h('div', { class: 'toast-icon', html: icon(o.icon || 'bell') }),
    h('div', { class: 'grow' }, h('div', { class: 'toast-title' }, title), o.message ? h('div', { class: 'toast-msg' }, o.message) : null));
  const hide = () => { el.classList.remove('in'); setTimeout(() => el.remove(), 450); };
  toastWrap.prepend(el);
  nextFrame().then(() => el.classList.add('in'));
  setTimeout(hide, o.ms || 4500);
  return hide;
}

// ---------- Bedienelemente ----------

export function switchEl(checked, onChange, { disabled = false, label = '' } = {}) {
  const input = h('input', { type: 'checkbox', role: 'switch', checked: !!checked, disabled, 'aria-label': label, onchange: (e) => { haptic(); onChange?.(e.target.checked); } });
  const el = h('label', { class: 'switch' }, input, h('span'));
  el.input = input;
  return el;
}

/** @param {{value:any, label:string, disabled?:boolean}[]} options */
export function segmented(options, value, onChange, { large = false } = {}) {
  const el = h('div', { class: `seg${large ? ' lg' : ''}`, role: 'tablist' });
  const render = () => {
    el.replaceChildren(...options.map((op) => h('button', {
      class: op.value === value ? 'on' : '', role: 'tab', disabled: !!op.disabled, 'aria-selected': String(op.value === value),
      onclick: () => { if (op.value === value) return; value = op.value; haptic(); render(); onChange?.(value); },
    }, op.label)));
  };
  render();
  el.set = (v) => { value = v; render(); };
  return el;
}

export function stepper(value, { min = 1, max = 99, onChange } = {}) {
  const out = h('output', {}, String(value));
  const minus = h('button', { 'aria-label': 'Weniger', html: icon('minus'), onclick: () => set(value - 1) });
  const plus = h('button', { 'aria-label': 'Mehr', html: icon('plus'), onclick: () => set(value + 1) });
  const el = h('div', { class: 'stepper' }, minus, out, plus);
  function set(v) {
    v = Math.max(min, Math.min(max, v));
    if (v === value) return;
    value = v; haptic(); sync(); onChange?.(value);
  }
  function sync() { out.textContent = String(value); minus.disabled = value <= min; plus.disabled = value >= max; }
  sync();
  el.get = () => value;
  el.set = (v) => { value = v; sync(); };
  return el;
}

/** Listenzelle. */
export function cell({ title, sub, value, icon: ic, iconBg, chevron, onClick, end, cls = '', html } = {}) {
  const tag = onClick ? 'button' : 'div';
  return h(tag, { class: `cell${ic ? ' with-icon' : ''}${onClick ? ' tappable' : ''} ${cls}`, onclick: onClick },
    ic ? h('div', { class: 'cell-icon', style: iconBg ? { background: iconBg } : null, html: icon(ic) }) : null,
    h('div', { class: 'cell-body' }, h('div', { class: 'cell-title', html: html || null }, html ? null : title), sub ? h('div', { class: 'cell-sub' }, sub) : null),
    value != null ? h('div', { class: 'cell-value' }, value) : null,
    end || null,
    chevron ? iconEl('chevronRight', 'cell-chevron') : null);
}

export function section(head, children, foot) {
  return h('div', { class: 'section' },
    head ? h('div', { class: 'section-head' }, head) : null,
    h('div', { class: 'list' }, children),
    foot ? h('div', { class: 'section-foot' }, foot) : null);
}

// ---------- Verbindung ----------

/** Pille mit Verbindungsstatus; aktualisiert sich selbst. extra(): optionaler Zusatzstatus (z. B. Küche offline). */
export function connectionPill(sync, extra) {
  const el = h('div', { class: 'conn', role: 'status' });
  const render = () => {
    const s = sync.state;
    const x = extra?.();
    let cls = '', text = 'Verbunden', ic = null;
    if (!sync.settings.gistId || !sync.settings.token) { cls = 'idle'; text = 'Nicht eingerichtet'; }
    else if (!s.online) { cls = 'offline'; text = 'Offline'; ic = 'wifiSlash'; }
    else if (s.error) { cls = 'warn'; text = 'Sync-Fehler'; ic = 'warning'; }
    else if (x) { cls = x.cls || 'warn'; text = x.text; ic = x.icon || null; }
    else if (s.dirty) { cls = 'idle'; text = 'Sendet …'; }
    el.className = `conn ${cls}`;
    el.title = s.error || '';
    el.replaceChildren(ic ? iconEl(ic) : h('i'), text);
  };
  sync.addEventListener('status', render);
  sync.addEventListener('data', render);
  const iv = setInterval(render, 15000);
  render();
  el.destroy = () => { clearInterval(iv); sync.removeEventListener('status', render); sync.removeEventListener('data', render); };
  return el;
}

/** Rotes Band oben, solange offline. Wird vor .app eingefügt. */
export function offlineBand(sync) {
  const el = h('div', { class: 'offline-band', hidden: true, role: 'alert' }, iconEl('wifiSlash'), h('span'));
  const render = () => {
    const off = !sync.state.online && !!sync.settings.gistId;
    el.hidden = !off;
    if (off) el.lastChild.textContent = `Offline – Änderungen werden gesendet, sobald die Verbindung zurück ist · zuletzt synchronisiert ${fmtAgo(sync.state.lastPull)}`;
  };
  sync.addEventListener('status', render);
  const iv = setInterval(render, 30000);
  render();
  el.destroy = () => { clearInterval(iv); sync.removeEventListener('status', render); };
  return el;
}

// ---------- Fotos ----------

/** Fotoelement mit Platzhalter; lädt das Bild asynchron über sync.getImage(). */
export function photo(sync, imageId, { cls = '', ph = 'photo' } = {}) {
  const el = h('div', { class: `ph ${cls}`, html: icon(ph) });
  if (imageId) {
    sync.getImage(imageId).then((src) => {
      if (!src) return;
      const img = h('img', { src, alt: '', decoding: 'async', loading: 'lazy' });
      el.replaceChildren(img);
    });
  }
  return el;
}

/** Datei wählen (Kamera oder Mediathek) und auf max. Kantenlänge verkleinert als JPEG-Data-URL liefern. */
export function pickImage({ max = 900, quality = 0.78 } = {}) {
  return new Promise((resolve) => {
    const input = h('input', { type: 'file', accept: 'image/*', style: { position: 'fixed', left: '-9999px' } });
    input.onchange = async () => {
      const f = input.files?.[0];
      input.remove();
      if (!f) return resolve(null);
      try { resolve(await resizeImage(f, max, quality)); } catch (e) { console.warn(e); resolve(null); }
    };
    document.body.append(input);
    input.click();
  });
}

export async function resizeImage(file, max = 900, quality = 0.78) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
    const s = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.round(img.naturalWidth * s), hgt = Math.round(img.naturalHeight * s);
    const c = h('canvas', { width: w, height: hgt });
    c.getContext('2d').drawImage(img, 0, 0, w, hgt);
    return c.toDataURL('image/jpeg', quality);
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Kurzer Hinweis „Kopiert“ nach Zwischenablage. */
export async function copyText(text, label = 'Kopiert') {
  try { await navigator.clipboard.writeText(text); toast(label, { icon: 'copy', tone: 'green', ms: 2000 }); return true; }
  catch { await alert({ title: 'Bitte manuell kopieren', message: text }); return false; }
}

export { icon, iconEl };
