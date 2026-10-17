// Gemeinsamer Zustand und kleine Helfer der Küchen-App.

import { h, fmtAgo, saveSettings, now, uid } from '../shared/core.js';
import { buildView } from '../shared/model.js';
import { iconEl } from '../shared/ui.js';

export const app = {
  settings: null,
  sync: null,
  view: buildView([]),
  /** offene Blätter, die bei neuen Daten aktualisiert werden: { update() } */
  sheets: new Set(),
  /** orderId → Zeitpunkt der Hervorhebung */
  flash: new Map(),
  navigate: () => {},
  rebuild() { this.view = buildView(this.sync.docs()); return this.view; },
};

/** Einstellungen ändern. Neues Objekt, damit Sync.reconfigure einen Gist-Wechsel erkennt. */
export function updateSettings(patch) {
  const next = { ...app.settings, ...patch };
  app.settings = next;
  saveSettings(next);
  app.sync.reconfigure(next);
  return next;
}

/** Blatt, das bei neuen Daten neu gezeichnet wird. Gibt die Abmeldefunktion zurück. */
export function liveSheet(update) {
  const entry = { update };
  app.sheets.add(entry);
  return () => app.sheets.delete(entry);
}

export const store = {
  get(k, d = null) {
    try { const v = localStorage.getItem('tafel.kueche.' + k); return v == null ? d : JSON.parse(v); } catch { return d; }
  },
  set(k, v) { try { localStorage.setItem('tafel.kueche.' + k, JSON.stringify(v)); } catch {} },
};

/** Relative Zeitangabe, die sich über refreshAgo() selbst aktualisiert. */
export function ago(ts, cls = '') {
  return h('span', { class: cls, dataset: { ago: String(ts || 0) } }, fmtAgo(ts));
}
export function refreshAgo(root = document) {
  for (const el of root.querySelectorAll('[data-ago]')) el.textContent = fmtAgo(+el.dataset.ago || 0);
}

export function largeTitle(title, sub, end) {
  return h('div', { class: 'large-title k-lt' },
    h('div', { class: 'grow' }, h('h1', { class: 't-large' }, title), sub || null),
    end || null);
}

export function emptyState(ic, title, text, action) {
  return h('div', { class: 'empty k-empty' }, iconEl(ic), h('h3', null, title), text ? h('p', null, text) : null,
    action ? h('div', { class: 'mt' }, action) : null);
}

export function barButton(ic, label, onClick) {
  return h('button', { class: 'barbtn', 'aria-label': label, title: label, onclick: onClick }, iconEl(ic));
}

/** <select> mit Optionen [[value, label]]; Wert wird nach dem Befüllen gesetzt. */
export function selectEl(options, value, onChange, cls = 'field') {
  const s = h('select', { class: cls, onchange: (e) => onChange(e.target.value) },
    options.map(([v, l]) => h('option', { value: v }, l)));
  s.value = value ?? '';
  return s;
}

/** Formularzeile: Beschriftung links, Bedienelement rechts. */
export function formRow(label, control, cls = '') {
  return h('label', { class: `cell k-frow ${cls}` }, h('span', { class: 'k-flabel' }, label), control);
}

/** Zelle als Aktionsknopf in Akzentfarbe. */
export function actionCell(text, onClick, ic = 'plus') {
  return h('button', { class: 'cell action k-action', onclick: onClick }, ic ? iconEl(ic) : null, h('span', null, text));
}

/** Entfernt alle Geschwister nach anchor und hängt nodes an (anchor selbst bleibt unangetastet). */
export function fillAfter(anchor, nodes) {
  while (anchor.nextSibling) anchor.nextSibling.remove();
  anchor.after(...nodes.filter(Boolean));
}

/** Scroll-Position eines Elements beim Neuzeichnen erhalten. */
export function keepScroll(el, fn) {
  const t = el.scrollTop;
  fn();
  el.scrollTop = t;
}

// ---------- Zutaten ----------

export const norm = (s) => String(s || '').toLocaleLowerCase('de').normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
export const byName = (a, b) => (a.name || '').localeCompare(b.name || '', 'de', { sensitivity: 'base' });

/** Zutat nach ID, auch wenn sie gerade erst lokal angelegt wurde. */
export function ingredientById(id) {
  return app.view.ingredients.get(id) || (app.sync.local.menu?.ingredients?.[id]?.deleted ? null : app.sync.local.menu?.ingredients?.[id]) || null;
}

export function findIngredientByName(name) {
  const n = norm(name);
  return [...app.view.ingredients.values()].find((i) => norm(i.name) === n) || null;
}

/** Legt eine Zutat an (vorhanden) und gibt die ID zurück. */
export function createIngredient(name) {
  const existing = findIngredientByName(name);
  if (existing) return existing.id;
  const id = uid('z');
  app.sync.mutate((d) => { d.menu.ingredients[id] = { id, name: name.trim(), available: true, updatedAt: now() }; });
  app.rebuild();
  return id;
}

/** ingredientId → { dishes: Dish[] (Zutatenliste), options: Dish[] (verknüpfte Auswahl) } */
export function ingredientUsage(view) {
  const m = new Map();
  const get = (id) => { if (!m.has(id)) m.set(id, { dishes: [], options: [] }); return m.get(id); };
  for (const d of view.dishes.values()) {
    for (const r of d.ingredients || []) if (r.ingredientId && !get(r.ingredientId).dishes.includes(d)) get(r.ingredientId).dishes.push(d);
    for (const g of d.options || []) for (const c of g.choices || []) {
      if (c.ingredientId && !get(c.ingredientId).options.includes(d)) get(c.ingredientId).options.push(d);
    }
  }
  return m;
}

/** Gericht in das eigene Dokument schreiben (neuester Stand gewinnt). */
export function putDish(dish) {
  app.sync.mutate((doc) => { doc.menu.dishes[dish.id] = { ...dish, updatedAt: now() }; });
}

/** replaceChildren ohne „null“-Texte für ausgelassene Teile. */
export function put(el, ...nodes) {
  el.replaceChildren(...nodes.flat().filter((n) => n != null && n !== false));
}
