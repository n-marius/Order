// Zutaten: Liste mit Verfügbarkeitsschalter, Verwendung in Gerichten, Anlegen/Umbenennen/Löschen.

import { h, now } from '../shared/core.js';
import { iconEl, segmented, switchEl, prompt, confirm, alert, actionSheet, toast } from '../shared/ui.js';
import { app, largeTitle, emptyState, barButton, store, norm, byName, ingredientUsage, findIngredientByName, createIngredient, put } from './ctx.js';

const letterOf = (name) => {
  const c = norm(name).charAt(0).toUpperCase();
  return /[A-Z]/.test(c) ? c : '#';
};

function setAvailable(id, available) {
  const ing = app.view.ingredients.get(id);
  if (!ing) return;
  app.sync.mutate((d) => { d.menu.ingredients[id] = { ...ing, available, updatedAt: now() }; });
}

export async function addIngredient() {
  const name = await prompt('Neue Zutat', null, { placeholder: 'Bezeichnung', okText: 'Hinzufügen' });
  if (!name) return;
  if (findIngredientByName(name)) {
    await alert({ title: 'Bereits vorhanden', message: `„${name}“ ist bereits in der Zutatenliste.` });
    return;
  }
  createIngredient(name);
}

async function rename(ing) {
  const name = await prompt('Zutat umbenennen', null, { value: ing.name, placeholder: 'Bezeichnung', okText: 'Sichern' });
  if (!name || name === ing.name) return;
  const dup = findIngredientByName(name);
  if (dup && dup.id !== ing.id) {
    await alert({ title: 'Bereits vorhanden', message: `„${name}“ ist bereits in der Zutatenliste.` });
    return;
  }
  app.sync.mutate((d) => { d.menu.ingredients[ing.id] = { ...ing, name, updatedAt: now() }; });
}

async function remove(ing) {
  const u = ingredientUsage(app.view).get(ing.id) || { dishes: [], options: [] };
  const names = [...new Set([...u.dishes, ...u.options].map((d) => d.name))];
  const msg = names.length
    ? `Verwendet in: ${names.join(', ')}. Die Zutat wird auch aus diesen Gerichten entfernt.`
    : 'Die Zutat wird auf allen Geräten entfernt.';
  if (!(await confirm(`„${ing.name}“ löschen?`, msg, 'Löschen', true))) return;
  const affected = [...new Set([...u.dishes, ...u.options])];
  const t = now();
  app.sync.mutate((d) => {
    d.menu.ingredients[ing.id] = { ...ing, deleted: true, updatedAt: t };
    for (const dish of affected) {
      const copy = structuredClone(dish);
      copy.ingredients = (copy.ingredients || []).filter((r) => r.ingredientId !== ing.id);
      for (const g of copy.options || []) for (const c of g.choices || []) if (c.ingredientId === ing.id) c.ingredientId = null;
      copy.updatedAt = t;
      d.menu.dishes[dish.id] = copy;
    }
  });
  toast('Zutat gelöscht', { message: ing.name, icon: 'trash', tone: 'gray', ms: 2500 });
}

function markAllAvailable() {
  const missing = [...app.view.ingredients.values()].filter((i) => !i.available);
  if (!missing.length) { toast('Alle Zutaten sind vorhanden', { icon: 'checkCircle', tone: 'green', ms: 2200 }); return; }
  const t = now();
  app.sync.mutate((d) => { for (const i of missing) d.menu.ingredients[i.id] = { ...i, available: true, updatedAt: t }; });
  toast(missing.length === 1 ? '1 Zutat als vorhanden markiert' : `${missing.length} Zutaten als vorhanden markiert`, { icon: 'checkCircle', tone: 'green', ms: 2500 });
}

export function ingredientsView() {
  let q = '';
  let filter = store.get('ingFilter', 'all');
  let structure = '';
  const rows = new Map();

  const sub = h('div', { class: 'k-subtitle' });
  const input = h('input', { type: 'search', placeholder: 'Zutaten durchsuchen', autocomplete: 'off', enterkeyhint: 'search', oninput: (e) => { q = e.target.value; render(); } });
  const searchEl = h('label', { class: 'search k-search' }, iconEl('search'), input);
  const segWrap = h('div', { class: 'k-ing-seg' });
  const listWrap = h('div', { class: 'k-ing-list' });
  const allBtn = h('button', { class: 'btn mid tinted k-allbtn', onclick: markAllAvailable }, iconEl('checkCircle'), 'Alle als vorhanden markieren');
  const el = h('div', { class: 'page k-narrow' }, largeTitle('Zutaten', sub), h('div', { class: 'k-toolbar' }, searchEl, segWrap), listWrap);

  function makeRow(id) {
    const title = h('div', { class: 'cell-title' });
    const subEl = h('div', { class: 'cell-sub k-ing-sub' });
    const sw = switchEl(false, (v) => setAvailable(id, v), { label: 'Vorhanden' });
    const main = h('button', {
      class: 'cell-body k-ing-main', 'aria-haspopup': 'true',
      onclick: async () => {
        const ing = app.view.ingredients.get(id);
        if (!ing) return;
        const v = await actionSheet({ title: ing.name, actions: [{ text: 'Umbenennen', value: 'rename' }, { text: 'Löschen', value: 'delete', destructive: true }] });
        if (v === 'rename') rename(ing);
        if (v === 'delete') remove(ing);
      },
    }, title, subEl);
    const el = h('div', { class: 'cell k-ing-row', dataset: { ing: id } }, main, sw);
    return {
      el,
      refresh(ing, u) {
        title.textContent = ing.name;
        if (sw.input.checked !== !!ing.available) sw.input.checked = !!ing.available;
        sw.input.setAttribute('aria-label', `${ing.name} vorhanden`);
        el.classList.toggle('missing', !ing.available);
        const dishes = u?.dishes || [];
        const opts = (u?.options || []).filter((d) => !dishes.includes(d));
        const parts = [];
        if (!dishes.length && !opts.length) parts.push(h('span', { class: 'c3' }, 'In keinem Gericht verwendet'));
        if (dishes.length) {
          parts.push(ing.available
            ? h('span', null, dishes.map((d) => d.name).join(', '))
            : h('span', { class: 'red' }, `Gesperrt: ${dishes.map((d) => d.name).join(', ')}`));
        }
        if (opts.length) parts.push(h('span', { class: ing.available ? '' : 'yellow-ink' }, `${ing.available ? 'Auswahl in' : 'Auswahl ausgegraut in'}: ${opts.map((d) => d.name).join(', ')}`));
        subEl.replaceChildren(...parts.flatMap((p, i) => (i ? [h('span', { class: 'k-sep' }, ' · '), p] : [p])));
      },
    };
  }

  function render(force) {
    const v = app.view;
    const usage = ingredientUsage(v);
    const all = [...v.ingredients.values()].sort(byName);
    const missing = all.filter((i) => !i.available).length;
    sub.textContent = all.length ? `${all.length} Zutaten${missing ? ` · ${missing} nicht vorhanden` : ' · alle vorhanden'}` : '';
    const segKey = `${filter}|${missing}`;
    if (segWrap.dataset.key !== segKey) {
      segWrap.dataset.key = segKey;
      segWrap.replaceChildren(segmented([{ value: 'all', label: 'Alle' }, { value: 'missing', label: missing ? `Fehlend (${missing})` : 'Fehlend' }], filter, (val) => {
        filter = val; store.set('ingFilter', val); render(true);
      }));
    }
    searchEl.parentElement.hidden = !all.length;
    const qq = norm(q);
    const shown = all.filter((i) => (filter === 'all' || !i.available) && (!qq || norm(i.name).includes(qq)));
    for (const i of shown) {
      if (!rows.has(i.id)) rows.set(i.id, makeRow(i.id));
      rows.get(i.id).refresh(i, usage.get(i.id));
    }
    for (const id of rows.keys()) if (!v.ingredients.has(id)) rows.delete(id);
    const key = JSON.stringify([filter, qq, shown.map((i) => i.id), all.length, missing > 0]);
    if (!force && key === structure) return;
    structure = key;

    if (!all.length) {
      listWrap.replaceChildren(emptyState('carrot', 'Keine Zutaten', 'Zutaten bestimmen, welche Gerichte verfügbar sind. Fehlt eine Zutat, werden die betroffenen Gerichte am Bestellgerät gesperrt.',
        h('button', { class: 'btn mid', onclick: addIngredient }, iconEl('plus'), 'Zutat hinzufügen')));
      return;
    }
    if (!shown.length) {
      listWrap.replaceChildren(filter === 'missing' && !qq
        ? emptyState('checkCircle', 'Alles vorhanden', 'Derzeit fehlt keine Zutat.')
        : emptyState('search', 'Keine Treffer', `Keine Zutat passt zu „${q.trim()}“.`));
      return;
    }
    const groups = new Map();
    for (const i of shown) {
      const l = letterOf(i.name);
      if (!groups.has(l)) groups.set(l, []);
      groups.get(l).push(i);
    }
    const grouped = shown.length > 12;
    put(listWrap,
      ...(grouped ? [...groups].map(([l, list]) => h('div', { class: 'section k-letter' },
        h('div', { class: 'section-head' }, l),
        h('div', { class: 'list' }, list.map((i) => rows.get(i.id).el))))
        : [h('div', { class: 'section' }, h('div', { class: 'list' }, shown.map((i) => rows.get(i.id).el)))]),
      missing ? h('div', { class: 'k-allwrap' }, allBtn) : null);
  }

  return {
    el,
    actions: [barButton('plus', 'Zutat hinzufügen', addIngredient)],
    update: () => render(),
  };
}
