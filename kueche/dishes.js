// Gerichte: Übersicht nach Kategorie, Rezeptansicht, Bearbeiten-Blatt, Zutatenauswahl.

import { h, now, uid, flag, countryName, COUNTRIES, CATEGORIES, DRINK_CATEGORIES, categoryById } from '../shared/core.js';
import { dishAvailability, ingredientLines, emptyDish, isManual, MANUAL_PREFIX, itemDetails, readyTotal } from '../shared/model.js';
import { sheet, alert, confirm, toast, iconEl, icon, segmented, switchEl, pickImage, photo, section, cell, stepper } from '../shared/ui.js';
import {
  app, largeTitle, emptyState, selectEl, liveSheet, formRow, actionCell, fillAfter, keepScroll, barButton,
  norm, byName, put, ingredientById, createIngredient, findIngredientByName,
} from './ctx.js';

const UNITS = ['g', 'kg', 'ml', 'cl', 'l', 'Stück', 'EL', 'TL', 'Prise', 'Scheibe', 'Zweig', 'Blatt', 'Bund', 'Dose', 'Spritzer', 'Schuss', 'Tasse', 'nach Bedarf'];

function ensureUnitList() {
  if (document.getElementById('k-units')) return;
  document.body.append(h('datalist', { id: 'k-units' }, UNITS.map((u) => h('option', { value: u }))));
}

/** Foto ohne Flackern, wenn es bereits im Speicher liegt. */
export function dishPhoto(imageId, cls = '', ph = 'photo') {
  const src = imageId && app.sync.images.get(imageId);
  if (src) return h('div', { class: `ph ${cls}` }, h('img', { src, alt: '', decoding: 'async' }));
  return photo(app.sync, imageId, { cls, ph });
}

const catIcon = (id) => categoryById(id)?.icon || 'forkKnife';

/** Bild eines Gerichts; ohne Foto eine nach Kategorie getönte Fläche mit Flagge bzw. Kategoriesymbol. */
function dishArt(d, cls) {
  const src = d.imageId && app.sync.images.get(d.imageId);
  if (src) return h('div', { class: `ph ${cls}` }, h('img', { src, alt: '', decoding: 'async' }));
  const el = h('div', { class: `ph k-art k-art-${d.category} ${cls}` },
    iconEl(catIcon(d.category)));
  if (d.imageId) {
    app.sync.getImage(d.imageId).then((url) => {
      if (!url) return;
      el.className = `ph ${cls}`;
      el.replaceChildren(h('img', { src: url, alt: '', decoding: 'async' }));
    });
  }
  return el;
}
const minutes = (m) => (m ? `${m} Min.` : '');

// ---------- Vorrat (vorbereitete Einheiten) ----------

/** Schlüssel für dish.ready: je Größe die Größen-ID, ohne Größen '_'. */
export function readyKeys(dish) {
  return dish?.sizes?.length ? dish.sizes.map((s, i) => ({ key: s.id, name: s.name || `Größe ${i + 1}` })) : [{ key: '_', name: 'Einheiten' }];
}
const readyOf = (dish, key) => Math.max(0, Math.floor(+(dish?.ready?.[key] || 0)));

/** Kurztext für Karten: „Schälchen 2 · Schale 1“ bzw. „3“. */
export function readySummary(dish) {
  if (!readyTotal(dish)) return '';
  if (!dish.sizes?.length) return String(readyOf(dish, '_'));
  return readyKeys(dish).filter((k) => readyOf(dish, k.key) > 0).map((k) => `${k.name} ${readyOf(dish, k.key)}`).join(' · ');
}

/** Vorrat eines Gerichts sofort ändern (ohne Bearbeiten-Blatt). */
export function setReady(dishId, key, n) {
  const dish = app.view.dishes.get(dishId);
  if (!dish) return;
  const copy = { ...structuredClone(dish), ready: { ...(dish.ready || {}), [key]: Math.max(0, Math.floor(n)) }, updatedAt: now() };
  app.sync.mutate((d) => { d.menu.dishes[dishId] = copy; });
  app.rebuild();
}

/** Zeilen mit Stepper je Größe. get(key) liefert den Wert, set(key, n) speichert. */
function readyRows(dish, get, set) {
  const steppers = new Map();
  const rows = readyKeys(dish).map((k) => {
    const st = stepper(get(k.key), { min: 0, max: 999, onChange: (n) => set(k.key, n) });
    st.classList.add('k-ready-stepper');
    st.querySelectorAll('button')[0]?.setAttribute('aria-label', `${k.name}: weniger`);
    st.querySelectorAll('button')[1]?.setAttribute('aria-label', `${k.name}: mehr`);
    steppers.set(k.key, st);
    return h('div', { class: 'cell k-ready-row', dataset: { key: k.key } },
      h('div', { class: 'cell-body cell-title' }, dish.sizes?.length ? k.name : 'Vorbereitet'), st);
  });
  return { rows, steppers };
}

const READY_FOOT = 'Vorbereitete Einheiten werden am Bestellgerät angezeigt und bei Eingang einer Bestellung automatisch abgezogen.';

/** Kleines Blatt zum schnellen Ändern des Vorrats. */
export function openReadySheet(dishId) {
  const dish = app.view.dishes.get(dishId);
  if (!dish) return;
  const { rows, steppers } = readyRows(dish, (k) => readyOf(dish, k), (k, n) => setReady(dishId, k, n));
  let unlisten = () => {};
  const api = sheet({
    title: 'Vorbereitet',
    body: [
      h('div', { class: 'k-ready-head' }, dish.country ? h('span', { class: 'k-flag' }, flag(dish.country)) : null, h('span', null, dish.name)),
      section(null, rows, READY_FOOT),
    ],
    left: null,
    right: { text: 'Fertig', bold: true },
    onClose: () => unlisten(),
  });
  api.el.classList.add('k-ready-sheet');
  unlisten = liveSheet(() => {
    const cur = app.view.dishes.get(dishId);
    if (!cur) { api.close(); return; }
    for (const [k, st] of steppers) if (st.get() !== readyOf(cur, k)) st.set(readyOf(cur, k));
  });
}

// ---------- Übersicht ----------

export function dishesView() {
  let q = '';
  let sig = '';
  const sub = h('div', { class: 'k-subtitle' });
  const input = h('input', { type: 'search', placeholder: 'Gerichte durchsuchen', autocomplete: 'off', enterkeyhint: 'search', oninput: (e) => { q = e.target.value; render(true); } });
  const searchEl = h('label', { class: 'search k-search' }, iconEl('search'), input);
  const content = h('div', { class: 'k-dish-groups' });
  const el = h('div', { class: 'page' }, largeTitle('Gerichte', sub), searchEl, content);

  function card(d) {
    const av = dishAvailability(app.view, d);
    const open = () => openRecipe({ dishId: d.id });
    return h('div', {
      class: `k-dish${av.available ? '' : ' unavailable'}${d.hidden ? ' is-hidden' : ''}`, role: 'button', tabindex: '0',
      'aria-label': d.name, dataset: { dish: d.id }, onclick: open, onkeydown: (e) => { if (e.key === 'Enter') open(); },
    },
    h('div', { class: 'k-dish-media' },
      dishArt(d, 'k-dish-ph'),
      d.prepMinutes ? h('span', { class: 'k-pill k-prep num' }, iconEl('clock'), `${d.prepMinutes} Min.`) : null,
      d.country ? h('span', { class: 'k-pill k-pflag', title: countryName(d.country) }, flag(d.country)) : null,
      !av.available ? h('span', { class: 'k-na' }, 'Nicht verfügbar') : d.hidden ? h('span', { class: 'k-na' }, 'Ausgeblendet') : null),
    h('div', { class: 'k-dish-info' },
      h('div', { class: 'k-dish-text' },
        h('div', { class: 'k-dish-name' }, d.name),
        !av.available ? h('div', { class: 'k-dish-missing' }, `Es fehlt: ${av.missing.join(', ')}`)
          : d.description ? h('div', { class: 'k-dish-desc' }, d.description)
            : h('div', { class: 'k-dish-desc' }, [d.sizes?.length ? `${d.sizes.length} Größen` : '', d.hidden ? 'Im Menü ausgeblendet' : ''].filter(Boolean).join(' · ') || categoryById(d.category)?.single)),
      h('button', { class: 'k-dish-edit', 'aria-label': `${d.name} bearbeiten`, onclick: (e) => { e.stopPropagation(); openDishEditor(d.id); } }, iconEl('pencil'))),
    readyButton(d));
  }

  function readyButton(d) {
    const sum = readySummary(d);
    return h('button', {
      class: `k-ready${sum ? ' has' : ''}`, 'aria-label': `Vorbereitet für ${d.name} ändern`,
      onclick: (e) => { e.stopPropagation(); openReadySheet(d.id); },
    }, iconEl('bag'), h('span', { class: 'k-ready-l' }, 'Vorbereitet'), h('span', { class: 'k-ready-v num' }, sum || 'keine'), iconEl('chevronRight', 'k-ready-chev'));
  }

  function render(force) {
    const v = app.view;
    const s = JSON.stringify([q, [...v.dishes.values()], [...v.ingredients.values()].map((i) => [i.id, i.name, i.available])]);
    if (!force && s === sig) return;
    sig = s;
    const all = [...v.dishes.values()];
    const unavailable = all.filter((d) => !dishAvailability(v, d).available).length;
    sub.textContent = all.length ? `${all.length === 1 ? '1 Gericht' : `${all.length} Gerichte`}${unavailable ? ` · ${unavailable} nicht verfügbar` : ''}` : '';
    searchEl.hidden = all.length < 6 && !q;
    if (!all.length) {
      content.replaceChildren(emptyState('forkKnife', 'Keine Gerichte', 'Gerichte mit Rezept, Zutaten und Auswahloptionen erscheinen nach dem Anlegen sofort auf allen Bestellgeräten.',
        h('button', { class: 'btn mid', onclick: () => openDishEditor(null) }, iconEl('plus'), 'Gericht anlegen')));
      return;
    }
    const qq = norm(q);
    const groups = [];
    for (const cat of CATEGORIES) {
      const list = all.filter((d) => d.category === cat.id && (!qq || norm(d.name).includes(qq) || norm(d.description).includes(qq)))
        .sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0) || byName(a, b));
      if (!list.length) continue;
      groups.push(h('section', { class: 'k-cat' },
        h('div', { class: 'k-cat-head' },
          h('h2', { class: 'k-cat-title' }, cat.name),
          h('span', { class: 'k-cat-count num' }, String(list.length)),
          h('button', { class: 'k-cat-add', 'aria-label': `${cat.single} hinzufügen`, onclick: () => openDishEditor(null, { category: cat.id }) }, iconEl('plus'))),
        h('div', { class: 'k-dishes' }, list.map(card))));
    }
    content.replaceChildren(...(groups.length ? groups : [emptyState('search', 'Keine Treffer', `Kein Gericht passt zu „${q.trim()}“.`)]));
  }

  return { el, actions: [barButton('plus', 'Gericht hinzufügen', () => openDishEditor(null))], update: () => render() };
}

// ---------- Rezeptansicht ----------

/** @param {{dishId:string, item?:object, order?:object}} o */
export function openRecipe({ dishId, item, order }) {
  let sizeId = item?.sizeId || null;
  const body = h('div', { class: 'k-recipe' });
  let unlisten = () => {};
  const api = sheet({
    title: '', body, left: { text: 'Schließen' },
    onClose: () => unlisten(),
  });
  api.el.classList.add('k-recipe-sheet');
  unlisten = liveSheet(render);

  function render() {
    const dish = app.view.dishes.get(dishId);
    const manual = isManual(dishId);
    const title = dish?.name || item?.name || 'Gericht';
    api.setTitle(title);
    api.setRight(dish ? { text: 'Bearbeiten', onClick: () => { api.close(); openDishEditor(dish.id); } } : null);
    if (dish?.sizes?.length && !dish.sizes.some((s) => s.id === sizeId)) sizeId = item?.sizeId && dish.sizes.some((s) => s.id === item.sizeId) ? item.sizeId : (dish.defaultSizeId || dish.sizes[0].id);
    const av = dish ? dishAvailability(app.view, dish) : { available: true, missing: [] };
    const cat = categoryById(dish?.category || item?.category);
    const country = dish?.country ?? item?.country;
    const parts = [];

    if (dish?.imageId) parts.push(dishPhoto(dish.imageId, 'k-hero', catIcon(dish.category)));
    parts.push(h('div', { class: 'k-rhead' },
      h('h2', { class: 'k-rtitle' }, h('span', null, title), country ? h('span', { class: 'k-rflag', title: countryName(country) }, flag(country)) : null),
      h('div', { class: 'k-rmeta' },
        [cat?.single, country ? countryName(country) : '', dish?.prepMinutes ? `${dish.prepMinutes} Min.` : ''].filter(Boolean).join(' · ')),
      h('div', { class: 'k-rchips' },
        dish && !manual ? h('span', { class: `k-chip ${av.available ? 'ok' : 'no'}` }, iconEl(av.available ? 'checkCircle' : 'warning'), av.available ? 'Verfügbar' : `Nicht verfügbar – es fehlt: ${av.missing.join(', ')}`) : null,
        dish?.hidden ? h('span', { class: 'k-chip' }, 'Im Menü ausgeblendet') : null),
      dish?.description ? h('p', { class: 'k-rdesc' }, dish.description) : null));

    if (dish && !manual) {
      parts.push(section('Vorbereitet', readyRows(dish, (k) => readyOf(dish, k), (k, n) => setReady(dish.id, k, n)).rows, READY_FOOT));
    }

    if (item) {
      const det = itemDetails(item);
      const rows = [
        h('div', { class: 'cell' }, h('div', { class: 'cell-body cell-title' }, 'Menge'), h('div', { class: 'cell-value num k-strong' }, `${item.qty || 1}×`)),
        item.sizeName ? h('div', { class: 'cell' }, h('div', { class: 'cell-body cell-title' }, 'Größe'), h('div', { class: 'cell-value' }, item.sizeName)) : null,
        item.ice != null ? h('div', { class: 'cell' }, h('div', { class: 'cell-body cell-title' }, 'Eis'), h('div', { class: 'cell-value' }, item.ice ? 'Mit Eis' : 'Ohne Eis')) : null,
        ...(item.optionLabels || []).map((l) => {
          const i = l.indexOf(':');
          return h('div', { class: 'cell' }, h('div', { class: 'cell-body cell-title' }, i > 0 ? l.slice(0, i) : 'Option'), h('div', { class: 'cell-value k-wrap' }, i > 0 ? l.slice(i + 1).trim() : l));
        }),
        item.note ? h('div', { class: 'cell k-note-cell' }, h('div', { class: 'cell-body' }, h('div', { class: 'cell-sub' }, 'Anmerkung'), h('div', { class: 'cell-title' }, item.note))) : null,
      ].filter(Boolean);
      parts.push(section(`Bestellt${order?.deviceName ? ` · ${order.deviceName}` : ''}`, rows, det.length ? null : null));
    }

    if (!dish) {
      parts.push(h('div', { class: 'notice k-mt' }, iconEl('info'), h('div', null,
        h('div', { class: 't-headline' }, manual ? 'Freie Bestellung' : 'Kein Rezept vorhanden'),
        h('div', { class: 't-sub c2' }, manual ? 'Für freie Bestellungen ist kein Rezept hinterlegt. Maßgeblich ist die Anmerkung.' : 'Dieses Gericht wurde inzwischen gelöscht.'))));
      keepScroll(api.body, () => put(body, ...parts));
      return;
    }

    if (dish.sizes?.length && !item) {
      parts.push(h('div', { class: 'k-rsizes' }, segmented(dish.sizes.map((s) => ({ value: s.id, label: s.name })), sizeId, (v) => { sizeId = v; render(); })));
    }
    const lines = ingredientLines(app.view, dish, sizeId);
    const sizeName = dish.sizes?.find((s) => s.id === sizeId)?.name;
    if (lines.length) {
      parts.push(section(`Zutaten${sizeName ? ` · ${sizeName}` : ''}`, lines.map((l) => h('div', { class: `cell k-rline${l.available ? '' : ' missing'}` },
        h('div', { class: 'cell-body' }, h('div', { class: 'cell-title' }, l.name), l.available ? null : h('div', { class: 'cell-sub red' }, 'Nicht vorhanden')),
        h('div', { class: 'cell-value num k-amount' }, [l.amount, l.unit].filter((x) => x !== '' && x != null).join(' ') || '–'))),
      item && (item.qty || 1) > 1 ? `Mengen je Portion – bestellt: ${item.qty} Portionen.` : null));
    }
    if (dish.steps?.length) {
      parts.push(h('div', { class: 'section' }, h('div', { class: 'section-head' }, 'Zubereitung'),
        h('ol', { class: 'list k-steps' }, dish.steps.map((s, i) => h('li', { class: 'k-steprow' }, h('span', { class: 'k-stepno num' }, String(i + 1)), h('div', { class: 'k-steptext' }, s))))));
    }
    if (!item && dish.options?.length) {
      parts.push(section('Auswahloptionen', dish.options.map((g) => h('div', { class: 'cell k-ropt' },
        h('div', { class: 'cell-body' },
          h('div', { class: 'cell-title' }, g.name, h('span', { class: 'c2 t-foot' }, ` · ${g.type === 'multi' ? 'Mehrfachauswahl' : 'Einfachauswahl'}${g.required ? ' · Pflicht' : ''}${g.sizeIds?.length ? ` · nur ${g.sizeIds.map((id) => dish.sizes?.find((s) => s.id === id)?.name).filter(Boolean).join(', ')}` : ''}`)),
          h('div', { class: 'chips k-rchoices' }, (g.choices || []).map((c) => {
            const off = c.ingredientId && !ingredientById(c.ingredientId)?.available;
            return h('span', { class: `chip${c.default ? ' on' : ''}${off ? ' off' : ''}` }, c.name);
          })))))));
    }
    if (!item && dish.ice) parts.push(section(null, [h('div', { class: 'cell' }, h('div', { class: 'cell-body cell-title' }, 'Eis-Auswahl'), h('div', { class: 'cell-value' }, dish.ice.default ? 'Standard: mit Eis' : 'Standard: ohne Eis'))]));
    if (!lines.length && !dish.steps?.length) {
      parts.push(h('div', { class: 'notice' }, iconEl('info'), h('div', { class: 't-sub c2' }, 'Für dieses Gericht sind noch keine Zutaten und Zubereitungsschritte hinterlegt.')));
    }
    keepScroll(api.body, () => put(body, ...parts));
  }

  render();
}

// ---------- Zutat auswählen ----------

/** Auswahlblatt: vorhandene Zutat wählen oder neu anlegen. Liefert die ID oder null. */
export function pickIngredient(exclude = []) {
  return new Promise((resolve) => {
    let q = '';
    let result = null;
    const input = h('input', {
      type: 'search', placeholder: 'Suchen oder neu anlegen', autocomplete: 'off', enterkeyhint: 'done',
      oninput: (e) => { q = e.target.value; renderList(); },
      onkeydown: (e) => { if (e.key === 'Enter') { e.preventDefault(); pickFirst(); } },
    });
    const listWrap = h('div', { class: 'k-pick-list' });
    const api = sheet({
      title: 'Zutat hinzufügen',
      body: [h('label', { class: 'search k-search' }, iconEl('search'), input), listWrap],
      onClose: () => resolve(result),
    });
    api.el.classList.add('k-pick-sheet');
    const choose = (id) => { result = id; api.close(); };
    let first = null;
    function pickFirst() { if (first) first(); }
    function renderList() {
      const qq = norm(q);
      const all = [...app.view.ingredients.values()].sort(byName);
      const avail = all.filter((i) => !exclude.includes(i.id) && (!qq || norm(i.name).includes(qq)));
      const exact = qq && findIngredientByName(q);
      const rows = [];
      first = null;
      if (qq && !exact) {
        const create = () => choose(createIngredient(q.trim()));
        first = create;
        rows.push(h('button', { class: 'cell tappable k-action k-create' }, iconEl('plus'), h('span', null, `„${q.trim()}“ als neue Zutat anlegen`)));
        rows[0].onclick = create;
      }
      for (const i of avail) {
        const pick = () => choose(i.id);
        first ||= pick;
        rows.push(h('button', { class: 'cell tappable', onclick: pick },
          h('div', { class: 'cell-body' }, h('div', { class: 'cell-title' }, i.name)),
          i.available ? null : h('span', { class: 'badge red' }, 'nicht vorhanden')));
      }
      if (exact && exclude.includes(exact.id)) rows.push(h('div', { class: 'cell' }, h('div', { class: 'cell-body cell-sub' }, `„${exact.name}“ ist bereits in der Zutatenliste.`)));
      listWrap.replaceChildren(rows.length ? section(qq ? null : 'Vorhandene Zutaten', rows)
        : emptyState('carrot', 'Keine Zutaten', 'Zum Anlegen einer neuen Zutat den Namen in das Suchfeld eingeben.'));
    }
    renderList();
    setTimeout(() => input.focus({ preventScroll: true }), 380);
  });
}

// ---------- Bearbeiten ----------

function normalize(d) {
  d.sizes ||= []; d.ingredients ||= []; d.steps ||= []; d.options ||= [];
  d.country ||= ''; d.description ||= ''; d.name ||= '';
  d.hidden = !!d.hidden;
  for (const r of d.ingredients) { r.amounts ||= {}; r.unit ||= ''; r.amount ??= ''; }
  for (const g of d.options) { g.choices ||= []; g.type ||= 'single'; g.id ||= uid('g'); for (const c of g.choices) c.id ||= uid('c'); }
  return d;
}

function delBtn(onClick, label = 'Entfernen') {
  return h('button', { class: 'k-del', 'aria-label': label, onclick: onClick }, h('span', { html: icon('minus') }));
}

function moveBtns(arr, i, rerender) {
  const swap = (j) => { [arr[i], arr[j]] = [arr[j], arr[i]]; rerender(); };
  return h('div', { class: 'k-move' },
    h('button', { class: 'k-mv up', disabled: i === 0, 'aria-label': 'Nach oben', onclick: () => swap(i - 1) }, iconEl('chevronDown')),
    h('button', { class: 'k-mv', disabled: i === arr.length - 1, 'aria-label': 'Nach unten', onclick: () => swap(i + 1) }, iconEl('chevronDown')));
}

function autoTextarea(value, onInput, placeholder, cls = '') {
  const t = h('textarea', { class: `k-auto ${cls}`, rows: 1, placeholder, oninput: (e) => { onInput(e.target.value); grow(); } });
  t.value = value || '';
  const grow = () => { t.style.height = 'auto'; t.style.height = `${t.scrollHeight}px`; };
  requestAnimationFrame(grow);
  return t;
}

export function openDishEditor(dishId, { category } = {}) {
  ensureUnitList();
  const orig = dishId ? app.view.dishes.get(dishId) : null;
  const d = normalize(structuredClone(orig || emptyDish(category || 'hauptspeise')));
  const initial = JSON.stringify(d);
  let newImage = null;
  let removeImage = false;
  let sizesBackup = null;
  let saving = false;
  const isDirty = () => !!newImage || removeImage || JSON.stringify(d) !== initial;

  const body = h('div', { class: 'k-editor' });
  const api = sheet({
    title: orig ? 'Gericht bearbeiten' : 'Neues Gericht',
    wide: true,
    dismissable: false,
    body,
    left: {
      text: 'Abbrechen',
      onClick: async (a) => {
        if (isDirty() && !(await confirm('Änderungen verwerfen?', 'Die Änderungen an diesem Gericht gehen verloren.', 'Verwerfen', true))) return;
        a.close('cancel');
      },
    },
    right: { text: 'Speichern', bold: true, onClick: save },
  });
  api.el.classList.add('k-editor-sheet');

  const secHero = h('div', { class: 'k-ed-hero' });
  const secGeneral = h('div');
  const secSizes = h('div');
  const secIngr = h('div');
  const secSteps = h('div');
  const secOpts = h('div');
  const secDrink = h('div');
  const secMore = h('div');
  const secReady = h('div');
  body.append(secHero, secGeneral, secSizes, secReady, secIngr, secSteps, secOpts, secDrink, secMore);

  // --- Foto, Name, Beschreibung ---
  const nameInput = h('input', { class: 'k-ed-name', placeholder: 'Name', value: d.name, maxlength: '80', autocomplete: 'off', enterkeyhint: 'next', 'aria-label': 'Name', oninput: (e) => { d.name = e.target.value; nameInput.classList.remove('invalid'); } });
  const descInput = autoTextarea(d.description, (v) => { d.description = v; }, 'Kurzbeschreibung', 'k-ed-desc');
  const photoBox = h('div', { class: 'k-ed-photo' });

  async function choosePhoto() {
    const url = await pickImage();
    if (!url) return;
    newImage = url; removeImage = false;
    renderPhoto();
  }
  function renderPhoto() {
    const has = !!newImage || (!removeImage && !!d.imageId);
    const ph = newImage ? h('div', { class: 'ph k-ed-ph' }, h('img', { src: newImage, alt: '' }))
      : has ? dishPhoto(d.imageId, 'k-ed-ph') : h('button', { class: 'ph k-ed-ph empty', 'aria-label': 'Foto wählen', onclick: choosePhoto, html: icon('camera') });
    photoBox.replaceChildren(ph, h('div', { class: 'k-ed-phbtns' },
      h('button', { class: 'k-link', onclick: choosePhoto }, has ? 'Ersetzen' : 'Foto hinzufügen'),
      has ? h('button', { class: 'k-link red', onclick: () => { newImage = null; removeImage = true; renderPhoto(); } }, 'Entfernen') : null));
  }
  renderPhoto();
  secHero.append(photoBox, h('div', { class: 'list k-ed-namebox' }, h('div', { class: 'cell' }, nameInput), h('div', { class: 'cell' }, descInput)));

  // --- Allgemein ---
  const minInput = h('input', {
    class: 'field', type: 'number', inputmode: 'numeric', min: 0, max: 999, placeholder: 'Keine Angabe', value: d.prepMinutes ?? '', 'aria-label': 'Zubereitungszeit in Minuten',
    oninput: (e) => { d.prepMinutes = e.target.value === '' ? null : Math.max(0, Math.round(+e.target.value) || 0); },
  });
  secGeneral.append(section('Allgemein', [
    formRow('Kategorie', h('div', { class: 'k-selwrap' }, selectEl(CATEGORIES.map((c) => [c.id, c.single]), d.category, (v) => { d.category = v; renderDrink(); }), iconEl('chevronDown', 'k-selchev'))),
    formRow('Nationalität', h('div', { class: 'k-selwrap' }, selectEl(COUNTRIES.map(([c, n]) => [c, c ? `${flag(c)}  ${n}` : 'Keine Angabe']), d.country, (v) => { d.country = v; }), iconEl('chevronDown', 'k-selchev'))),
    formRow('Zubereitungszeit', h('div', { class: 'k-unitfield' }, minInput, h('span', { class: 'c2' }, 'Min.'))),
  ]));

  // --- Portionsgrößen ---
  const sizeSwitchCell = cell({ title: 'Portionsgrößen', end: switchEl(d.sizes.length > 0, toggleSizes, { label: 'Portionsgrößen' }) });
  const sizesList = h('div', { class: 'list' }, sizeSwitchCell);
  const sizesFoot = h('div', { class: 'section-foot' });
  secSizes.append(h('div', { class: 'section' }, h('div', { class: 'section-head' }, 'Portionen'), sizesList, sizesFoot));

  function toggleSizes(on) {
    if (on) {
      if (sizesBackup?.sizes.length) { d.sizes = sizesBackup.sizes; d.defaultSizeId = sizesBackup.def; }
      else {
        d.sizes = ['Klein', 'Mittel', 'Groß'].map((name) => ({ id: uid('s'), name }));
        d.defaultSizeId = d.sizes[1].id;
      }
      for (const r of d.ingredients) for (const s of d.sizes) if (r.amounts[s.id] == null || r.amounts[s.id] === '') r.amounts[s.id] = r.amount ?? '';
    } else {
      sizesBackup = { sizes: d.sizes, def: d.defaultSizeId };
      for (const r of d.ingredients) r.amount = r.amounts?.[d.defaultSizeId] ?? r.amount ?? '';
      d.sizes = []; d.defaultSizeId = null;
    }
    renderSizes();
    renderIngr();
    renderOpts();
  }

  function renderSizes() {
    const rows = d.sizes.map((s, i) => {
      const isDef = d.defaultSizeId === s.id;
      return h('div', { class: 'cell k-size-row' },
        d.sizes.length > 1 ? delBtn(() => {
          d.sizes.splice(i, 1);
          for (const r of d.ingredients) delete r.amounts[s.id];
          if (isDef) d.defaultSizeId = d.sizes[0]?.id || null;
          for (const g of d.options) if (g.sizeIds) g.sizeIds = g.sizeIds.filter((id) => id !== s.id);
          renderSizes(); renderIngr(); renderOpts();
        }, `${s.name || 'Größe'} entfernen`) : h('span', { class: 'k-del-ph' }),
        h('input', {
          class: 'field left', value: s.name, placeholder: `Größe ${i + 1}`, 'aria-label': `Name der Größe ${i + 1}`,
          oninput: (e) => { s.name = e.target.value; }, onchange: () => { renderIngr(); renderOpts(); },
        }),
        h('button', { class: `k-default${isDef ? ' on' : ''}`, 'aria-pressed': String(isDef), onclick: () => { d.defaultSizeId = s.id; renderSizes(); } },
          isDef ? iconEl('check') : null, isDef ? 'Standard' : 'Als Standard'));
    });
    if (d.sizes.length) {
      rows.push(actionCell('Größe hinzufügen', () => {
        const s = { id: uid('s'), name: '' };
        d.sizes.push(s);
        for (const r of d.ingredients) r.amounts[s.id] = '';
        renderSizes(); renderIngr(); renderOpts();
        sizesList.querySelectorAll('.k-size-row input')[d.sizes.length - 1]?.focus();
      }));
    }
    fillAfter(sizeSwitchCell, rows);
    sizesFoot.textContent = d.sizes.length
      ? 'Die Standardgröße ist am Bestellgerät vorausgewählt. Mengen der Zutaten werden je Größe angegeben.'
      : 'Ohne Portionsgrößen gilt eine Menge je Zutat.';
    renderReady();
  }

  // --- Vorrat ---
  function renderReady() {
    d.ready ||= {};
    const { rows } = readyRows(d, (k) => readyOf(d, k), (k, n) => { d.ready[k] = n; });
    secReady.replaceChildren(section('Vorrat', rows, READY_FOOT));
  }

  // --- Zutaten ---
  function renderIngr() {
    const sized = d.sizes.length > 0;
    const n = sized ? d.sizes.length : 1;
    const amountInput = (val, set, label) => h('label', { class: 'k-amtwrap' },
      h('input', { class: 'k-in k-amt', value: val ?? '', placeholder: '–', 'aria-label': `Menge ${label}`, autocomplete: 'off', oninput: (e) => set(e.target.value) }),
      sized ? h('span', { class: 'k-amtcap' }, label) : null);
    const rows = d.ingredients.map((r, i) => {
      const ing = ingredientById(r.ingredientId);
      return h('div', { class: 'cell k-ir', style: `--n:${n}` },
        delBtn(() => { d.ingredients.splice(i, 1); renderIngr(); }, `${ing?.name || 'Zutat'} entfernen`),
        h('div', { class: 'k-ir-name' }, h('span', { class: 'ellipsis' }, ing?.name || 'Unbekannte Zutat'), ing && !ing.available ? h('span', { class: 'badge red' }, 'fehlt') : null),
        h('div', { class: 'k-ir-amts' }, sized
          ? d.sizes.map((s) => amountInput(r.amounts[s.id], (v) => { r.amounts[s.id] = v; }, s.name || 'Menge'))
          : amountInput(r.amount, (v) => { r.amount = v; }, 'Menge')),
        h('input', { class: 'k-in k-ir-unit', value: r.unit, placeholder: 'Einheit', list: 'k-units', autocomplete: 'off', 'aria-label': 'Einheit', oninput: (e) => { r.unit = e.target.value; } }),
        moveBtns(d.ingredients, i, renderIngr));
    });
    const head = d.ingredients.length ? h('div', { class: 'cell k-ir k-ir-head', style: `--n:${n}` },
      h('span'), h('span', { class: 'k-ir-name' }, 'Zutat'),
      h('div', { class: 'k-ir-amts' }, sized ? d.sizes.map((s) => h('span', null, s.name || '–')) : h('span', null, 'Menge')),
      h('span', { class: 'k-ir-unit' }, 'Einheit'), h('span')) : null;
    keepScroll(api.body, () => secIngr.replaceChildren(section('Zutaten', [head, ...rows, actionCell('Zutat hinzufügen', addIngredient)],
      'Ein Gericht ist nur verfügbar, wenn alle aufgeführten Zutaten vorhanden sind.')));
  }

  async function addIngredient() {
    const id = await pickIngredient(d.ingredients.map((r) => r.ingredientId));
    if (!id) return;
    d.ingredients.push({ ingredientId: id, unit: '', amount: '', amounts: Object.fromEntries(d.sizes.map((s) => [s.id, ''])) });
    renderIngr();
    renderOpts();
    const rows = secIngr.querySelectorAll('.k-ir:not(.k-ir-head)');
    rows[rows.length - 1]?.querySelector('.k-amt')?.focus({ preventScroll: true });
  }

  // --- Zubereitung ---
  function renderSteps(focusIndex = -1) {
    const rows = d.steps.map((s, i) => h('div', { class: 'cell k-step' },
      delBtn(() => { d.steps.splice(i, 1); renderSteps(); }, `Schritt ${i + 1} entfernen`),
      h('span', { class: 'k-stepno num' }, String(i + 1)),
      autoTextarea(s, (v) => { d.steps[i] = v; }, `Schritt ${i + 1}`),
      moveBtns(d.steps, i, renderSteps)));
    keepScroll(api.body, () => secSteps.replaceChildren(section('Zubereitung', [...rows, actionCell('Schritt hinzufügen', () => { d.steps.push(''); renderSteps(d.steps.length - 1); })])));
    if (focusIndex >= 0) secSteps.querySelectorAll('textarea')[focusIndex]?.focus();
  }

  // --- Optionen ---
  function ingredientOptions() {
    return [['', 'Ohne Zutat'], ...[...app.view.ingredients.values()].sort(byName).map((i) => [i.id, i.available ? i.name : `${i.name} (fehlt)`])];
  }

  /** Größen, für die die Gruppe angeboten wird (keine Einschränkung = alle). */
  function sizeScope(g) {
    const on = (id) => !g.sizeIds?.length || g.sizeIds.includes(id);
    return h('div', { class: 'cell k-og-sizes' },
      h('span', { class: 'k-og-sizes-label' }, 'Nur bei Größe'),
      h('div', { class: 'chips' }, d.sizes.map((s, i) => h('button', {
        class: `chip${on(s.id) ? ' on' : ''}`, 'aria-pressed': String(on(s.id)),
        onclick: () => {
          const ids = d.sizes.map((x) => x.id).filter((id) => (id === s.id ? !on(id) : on(id)));
          if (!ids.length) return;
          if (ids.length === d.sizes.length) delete g.sizeIds; else g.sizeIds = ids;
          renderOpts();
        },
      }, on(s.id) ? iconEl('check') : null, h('span', { class: 'chip-label' }, s.name || `Größe ${i + 1}`)))));
  }

  function renderOpts(focusGroup = -1) {
    const ingOpts = ingredientOptions();
    const groups = d.options.map((g, gi) => {
      const choiceRows = g.choices.map((c, ci) => h('div', { class: 'cell k-choice' },
        delBtn(() => { g.choices.splice(ci, 1); renderOpts(); }, `${c.name || 'Auswahl'} entfernen`),
        h('button', {
          class: `k-check${c.default ? ' on' : ''}${g.type === 'multi' ? ' square' : ''}`, 'aria-label': 'Vorausgewählt', 'aria-pressed': String(!!c.default),
          title: 'Vorausgewählt',
          onclick: () => {
            if (g.type === 'single') { const was = c.default; for (const x of g.choices) x.default = false; c.default = !was; }
            else c.default = !c.default;
            renderOpts();
          },
        }, iconEl('check')),
        h('input', { class: 'field left k-choice-name', value: c.name, placeholder: 'Bezeichnung', 'aria-label': 'Bezeichnung der Auswahl', oninput: (e) => { c.name = e.target.value; } }),
        h('div', { class: 'k-selwrap k-choice-ing' },
          selectEl(ingOpts, c.ingredientId || '', (v) => { c.ingredientId = v || null; }, 'field'),
          iconEl('chevronDown', 'k-selchev'))));
      const rows = [
        h('div', { class: 'cell k-og-head' },
          h('input', { class: 'field left k-og-name', value: g.name, placeholder: 'Name der Gruppe', 'aria-label': 'Name der Gruppe', oninput: (e) => { g.name = e.target.value; } }),
          h('button', {
            class: 'k-iconbtn red', 'aria-label': 'Gruppe entfernen',
            onclick: async () => {
              if ((g.name || g.choices.length) && !(await confirm('Gruppe entfernen?', `„${g.name || 'Ohne Namen'}“ und alle Auswahlmöglichkeiten werden entfernt.`, 'Entfernen', true))) return;
              d.options.splice(gi, 1); renderOpts();
            },
          }, iconEl('trash'))),
        h('div', { class: 'cell k-og-type' },
          segmented([{ value: 'single', label: 'Einfachauswahl' }, { value: 'multi', label: 'Mehrfachauswahl' }], g.type, (v) => {
            g.type = v;
            if (v === 'single') { let seen = false; for (const c of g.choices) { if (c.default && seen) c.default = false; if (c.default) seen = true; } }
            renderOpts();
          }),
          h('label', { class: 'k-req' }, h('span', null, 'Pflicht'), switchEl(g.required, (v) => { g.required = v; }, { label: 'Pflichtauswahl' }))),
        d.sizes.length > 1 ? sizeScope(g) : null,
        ...choiceRows,
        actionCell('Auswahl hinzufügen', () => {
          g.choices.push({ id: uid('c'), name: '', ingredientId: null, default: false });
          renderOpts();
          secOpts.querySelectorAll('.k-og')[gi]?.querySelectorAll('.k-choice-name')[g.choices.length - 1]?.focus();
        }),
      ];
      return h('div', { class: 'list k-og' }, rows);
    });
    keepScroll(api.body, () => secOpts.replaceChildren(h('div', { class: 'section' },
      h('div', { class: 'section-head' }, 'Auswahloptionen'),
      groups.length ? h('div', { class: 'k-og-list' }, groups) : null,
      h('div', { class: 'list' }, actionCell('Optionsgruppe hinzufügen', () => {
        d.options.push({ id: uid('g'), name: '', type: 'single', required: false, choices: [{ id: uid('c'), name: '', ingredientId: null, default: true }] });
        renderOpts(d.options.length - 1);
      })),
      h('div', { class: 'section-foot' }, 'Ein Häkchen markiert die Vorauswahl. Fehlt eine verknüpfte Zutat, wird die Auswahl am Bestellgerät ausgegraut.'))));
    if (focusGroup >= 0) secOpts.querySelectorAll('.k-og-name')[focusGroup]?.focus();
  }

  // --- Getränk ---
  function renderDrink() {
    if (!DRINK_CATEGORIES.includes(d.category)) { secDrink.replaceChildren(); return; }
    const defCell = () => cell({ title: 'Standard: mit Eis', end: switchEl(!!d.ice?.default, (v) => { d.ice = { default: v }; }, { label: 'Standard: mit Eis' }) });
    const iceCell = cell({
      title: 'Eis-Auswahl anbieten',
      end: switchEl(!!d.ice, (v) => { d.ice = v ? { default: true } : null; fillAfter(iceCell, v ? [defCell()] : []); }, { label: 'Eis-Auswahl anbieten' }),
    });
    const list = h('div', { class: 'list' }, iceCell);
    secDrink.replaceChildren(h('div', { class: 'section' }, h('div', { class: 'section-head' }, 'Getränk'), list,
      h('div', { class: 'section-foot' }, 'Am Bestellgerät kann zwischen „mit Eis“ und „ohne Eis“ gewählt werden.')));
    if (d.ice) fillAfter(iceCell, [defCell()]);
  }

  // --- Sichtbarkeit, Löschen ---
  secMore.append(section(null, [cell({ title: 'Im Menü ausblenden', end: switchEl(d.hidden, (v) => { d.hidden = v; }, { label: 'Im Menü ausblenden' }) })],
    'Ausgeblendete Gerichte erscheinen nicht auf den Bestellgeräten.'));
  if (orig) {
    secMore.append(section(null, [h('button', { class: 'cell destructive', onclick: remove }, 'Gericht löschen')]));
  }

  async function remove() {
    if (!(await confirm(`„${orig.name}“ löschen?`, 'Das Gericht wird auf allen Geräten entfernt.', 'Löschen', true))) return;
    app.sync.mutate((doc) => { doc.menu.dishes[orig.id] = { ...orig, deleted: true, updatedAt: now() }; });
    if (orig.imageId) app.sync.deleteImage(orig.imageId);
    api.close('delete');
    toast('Gericht gelöscht', { message: orig.name, icon: 'trash', tone: 'gray', ms: 2500 });
  }

  function clean() {
    const out = structuredClone(d);
    out.name = out.name.trim();
    out.description = out.description.trim();
    out.sizes = out.sizes.map((s, i) => ({ id: s.id, name: s.name.trim() || `Größe ${i + 1}` }));
    out.defaultSizeId = out.sizes.length ? (out.sizes.some((s) => s.id === out.defaultSizeId) ? out.defaultSizeId : out.sizes[0].id) : null;
    out.ingredients = out.ingredients.filter((r) => r.ingredientId).map((r) => ({
      ingredientId: r.ingredientId,
      unit: String(r.unit || '').trim(),
      amount: out.sizes.length ? '' : String(r.amount ?? '').trim(),
      amounts: out.sizes.length ? Object.fromEntries(out.sizes.map((s) => [s.id, String(r.amounts?.[s.id] ?? '').trim()])) : {},
    }));
    out.steps = out.steps.map((s) => String(s).trim()).filter(Boolean);
    out.options = out.options.map((g) => {
      const choices = g.choices.filter((c) => c.name.trim()).map((c) => ({ id: c.id, name: c.name.trim(), ingredientId: c.ingredientId || null, default: !!c.default }));
      if (g.type === 'single') { let seen = false; for (const c of choices) { if (c.default && seen) c.default = false; if (c.default) seen = true; } }
      const sizeIds = (g.sizeIds || []).filter((id) => out.sizes.some((s) => s.id === id));
      return {
        id: g.id, name: g.name.trim() || 'Auswahl', type: g.type === 'multi' ? 'multi' : 'single', required: !!g.required, choices,
        ...(sizeIds.length && sizeIds.length < out.sizes.length ? { sizeIds } : {}),
      };
    }).filter((g) => g.choices.length);
    out.ice = DRINK_CATEGORIES.includes(out.category) && out.ice ? { default: !!out.ice.default } : null;
    out.prepMinutes = out.prepMinutes === '' || out.prepMinutes == null ? null : +out.prepMinutes;
    delete out.deleted;
    return out;
  }

  async function save(a) {
    if (saving) return;
    if (!d.name.trim()) {
      nameInput.classList.add('invalid');
      await alert({ title: 'Name fehlt', message: 'Für das Gericht ist ein Name erforderlich.' });
      nameInput.focus();
      return;
    }
    saving = true;
    try {
      const out = clean();
      if (newImage) {
        out.imageId = await app.sync.putImage(newImage);
        if (orig?.imageId) app.sync.deleteImage(orig.imageId);
      } else if (removeImage) {
        if (orig?.imageId) app.sync.deleteImage(orig.imageId);
        out.imageId = null;
      }
      out.id = orig?.id || uid('d');
      // Vorrat: unveränderte Werte vom aktuellen Stand übernehmen (Abbuchungen während der Bearbeitung nicht überschreiben)
      const latest = app.view.dishes.get(out.id)?.ready || {};
      out.ready = Object.fromEntries(readyKeys(out).map(({ key }) => {
        const v = readyOf(d, key);
        return [key, v === readyOf(orig, key) ? readyOf({ ready: latest }, key) : v];
      }));
      out.updatedAt = now();
      app.sync.mutate((doc) => { doc.menu.dishes[out.id] = out; });
      a.close('save');
      toast(orig ? 'Änderungen gesichert' : 'Gericht angelegt', { message: out.name, icon: 'checkCircle', tone: 'green', ms: 2200 });
    } finally {
      saving = false;
    }
  }

  renderSizes();
  renderIngr();
  renderSteps();
  renderOpts();
  renderDrink();
  if (!orig) setTimeout(() => nameInput.focus({ preventScroll: true }), 420);
}

export { MANUAL_PREFIX };
