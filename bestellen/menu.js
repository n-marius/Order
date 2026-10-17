// Speisekarte: Gerichtsraster je Kategorie und Feinauswahl (Blatt beim Antippen).

import { h, uid, flag, countryName, categoryById, haptic, CATEGORIES } from '../shared/core.js';
import {
  dishesByCategory, dishAvailability, choiceAvailable, ingredientLines, manualDish, isManual, MANUAL_PREFIX,
} from '../shared/model.js';
import { sheet, segmented, stepper, photo, toast, icon, iconEl } from '../shared/ui.js';
import { S, view, cart, saveCart, emit } from './store.js';
import { BOLT, boltEl, readyFor, readySum, readyBySize } from './stock.js';

// ---------- Raster ----------

export function renderMenu(cat) {
  const v = view();
  const c = categoryById(cat) || categoryById('vorspeise');
  const dishes = dishesByCategory(v, c.id);
  const real = dishes.filter((d) => !d.manual);
  const na = real.filter((d) => !dishAvailability(v, d).available).length;
  const sub = real.length
    ? [`${real.length} ${real.length === 1 ? 'Gericht' : 'Gerichte'}`, na ? `${na} nicht verfügbar` : null].filter(Boolean).join(' · ')
    : 'Noch keine Gerichte in dieser Kategorie';

  return h('div', { class: 'page menu-page' },
    h('header', { class: 'page-head' },
      h('div', { class: 'page-eyebrow' }, 'Speisekarte'),
      h('h1', { class: 't-large' }, c.name),
      h('div', { class: 'page-sub' }, sub),
      h('div', { class: 'cat-strip', role: 'tablist' }, CATEGORIES.map((x) => h('button', {
        class: `cat-pill${x.id === c.id ? ' on' : ''}`, role: 'tab', 'aria-selected': String(x.id === c.id),
        onclick: () => S.go?.('menu', { cat: x.id }),
      }, x.short || x.name)))),
    h('div', { class: 'grid dish-grid' }, dishes.map((d) => dishCard(v, d))));
}

function dishCard(v, d) {
  const av = dishAvailability(v, d);
  const fl = flag(d.country);
  const ready = av.available ? readySum(v, d) : 0;
  const sizesReady = ready && d.sizes?.length ? readyBySize(d).filter((x) => x.n > 0) : [];
  const media = d.manual
    ? h('div', { class: 'dish-photo manual-art', html: icon('compose') })
    : photo(S.sync, d.imageId, { cls: 'dish-photo', ph: categoryById(d.category)?.icon || 'photo' });
  return h('button', {
    class: `dish-card${av.available ? '' : ' unavailable'}${d.manual ? ' manual' : ''}`,
    dataset: { dish: d.id },
    'aria-label': `${d.name}${av.available ? '' : ', nicht verfügbar'}${ready ? `, ${ready} sofort verfügbar` : ''}`,
    onclick: () => openDish(d.id),
  },
  h('div', { class: 'dish-media' },
    media,
    fl ? h('span', { class: 'dish-flag', title: countryName(d.country) }, fl) : null,
    av.available ? null : h('span', { class: 'dish-na' }, 'Nicht verfügbar'),
    ready ? h('span', { class: 'ready-badge' }, h('span', { class: 'ready-icon', html: BOLT }), h('span', { class: 'ready-text' }, 'Sofort verfügbar'), h('span', { class: 'ready-count' }, String(ready))) : null),
  h('div', { class: 'dish-info' },
    h('div', { class: 'dish-text' },
      h('div', { class: 'dish-name' }, d.name),
      d.manual ? h('div', { class: 'dish-desc' }, 'Freie Bestellung mit eigener Beschreibung')
        : d.description ? h('div', { class: 'dish-desc' }, d.description) : null,
      sizesReady.length ? h('div', { class: 'dish-ready-sizes' }, sizesReady.map((x) => `${x.size.name} ${x.n}`).join(' · ')) : null),
    av.available ? h('span', { class: 'dish-add', 'aria-hidden': 'true', html: icon('plus') }) : null));
}

// ---------- Feinauswahl ----------

/** iPad quer: Foto links, Konfiguration rechts. */
const SPLIT_MQ = matchMedia('(min-width: 900px) and (min-aspect-ratio: 5/4)');

const sameConfig = (a, b) => a.dishId === b.dishId && (a.sizeId || null) === (b.sizeId || null) && (a.ice ?? null) === (b.ice ?? null)
  && JSON.stringify(a.options || {}) === JSON.stringify(b.options || {}) && (a.note || '') === (b.note || '');

/**
 * Öffnet die Feinauswahl.
 * @param {string} dishId
 * @param {{item?:object, onSave?:(item:object)=>void, saveLabel?:string, stock?:boolean}} [o]
 *   stock: Vorrat anzeigen (nicht beim Ändern einer bereits gesendeten Position).
 *   item: bestehende Position (Bearbeiten), onSave: statt „in den Warenkorb“.
 */
export function openDish(dishId, { item = null, onSave = null, saveLabel = 'Übernehmen', stock = true } = {}) {
  const getDish = () => (isManual(dishId) ? manualDish(dishId.slice(MANUAL_PREFIX.length)) : view().dishes.get(dishId) || null);
  let dish = getDish();
  if (!dish && !item) return;
  if (!dish) dish = { id: dishId, name: item.name, category: item.category, country: item.country, sizes: [], options: [], ice: null, ingredients: [], gone: true };
  const editing = !!item;
  const v0 = view();

  const sizes = dish.sizes || [];
  const st = {
    sizeId: sizes.length
      ? [item?.sizeId, dish.defaultSizeId, sizes[0].id].find((id) => id && sizes.some((s) => s.id === id))
      : null,
    ice: dish.ice ? (item && item.ice != null ? item.ice : !!dish.ice.default) : null,
    options: Object.fromEntries((dish.options || []).map((o) => [o.id, new Set(
      item ? item.options?.[o.id] || [] : o.choices.filter((c) => c.default && choiceAvailable(v0, c)).map((c) => c.id),
    )])),
    qty: item?.qty || 1,
    showIng: false,
  };

  // --- Kopf ---
  const cat = categoryById(dish.category);
  const fl = flag(dish.country);
  const hero = dish.manual
    ? h('div', { class: 'dish-hero manual-art', html: icon('compose') })
    : photo(S.sync, dish.imageId, { cls: 'dish-hero', ph: cat?.icon || 'photo' });
  const eyebrow = [cat?.single, countryName(dish.country) && dish.country ? countryName(dish.country) : null].filter(Boolean).join(' · ');
  const head = h('div', { class: 'dish-head' },
    eyebrow ? h('div', { class: 'dish-eyebrow' }, eyebrow) : null,
    h('h2', { class: 'dish-title' }, h('span', {}, dish.name), fl ? h('span', { class: 'dish-title-flag' }, fl) : null),
    dish.manual ? h('p', { class: 'dish-lead' }, 'Freie Bestellung. Die gewünschte Speise wird in der Beschreibung angegeben.')
      : dish.description ? h('p', { class: 'dish-lead' }, dish.description) : null);

  const availEl = h('div', { class: 'dish-avail' });
  const ingEl = h('div', { class: 'cfg-ing' });
  const optsEl = h('div', { class: 'cfg-opts' });
  const stockEl = h('div', { class: 'dish-stock', 'aria-live': 'polite' });
  const segStockEl = h('div', { class: 'seg-stock', style: { gridTemplateColumns: `repeat(${Math.max(1, (dish.sizes || []).length)}, 1fr)` } });

  // Portionsgröße
  let sizeSec = null;
  if (sizes.length) {
    sizeSec = cfgSection('Größe', null, [
      segmented(sizes.map((s) => ({ value: s.id, label: s.name })), st.sizeId, (val) => { st.sizeId = val; renderIngredients(); renderStock(); updateFoot(); }, { large: true }),
      segStockEl]);
  }
  // Eis
  let iceSec = null;
  if (dish.ice) {
    iceSec = cfgSection('Eis', null, segmented([{ value: true, label: 'Mit Eis' }, { value: false, label: 'Ohne Eis' }], st.ice, (val) => { st.ice = val; updateFoot(); }, { large: true }));
  }
  // Anmerkung
  const noteEl = h('textarea', {
    class: 'textarea', rows: 3, maxlength: 400,
    placeholder: dish.manual ? 'Gewünschte Speise oder Getränk, z. B. Toast mit Butter' : 'Optional, z. B. ohne Zwiebeln',
    oninput: () => updateFoot(),
  });
  noteEl.value = item?.note || '';
  const noteSec = cfgSection(dish.manual ? 'Beschreibung' : 'Anmerkung', dish.manual ? 'Erforderlich' : null, noteEl);

  const body = h('div', { class: 'dish-sheet-body' },
    h('div', { class: 'dish-hero-wrap' }, hero),
    h('div', { class: 'dish-config' },
      head, availEl, stockEl,
      dish.ingredients?.length ? ingEl : null,
      sizeSec, iceSec, optsEl, noteSec));

  // --- Fuß: Anzahl + runder Korb-Knopf ---
  const hintEl = h('div', { class: 'dish-foot-hint' });
  const qty = stepper(st.qty, { min: 1, max: 20, onChange: (q) => { st.qty = q; renderStock(); updateFoot(); } });
  const addBtn = h('button', {
    class: 'circle-btn filled lg add-btn',
    'aria-label': editing ? saveLabel : 'In den Warenkorb',
    html: icon(editing ? 'check' : 'basket'),
    onclick: save,
  });
  const foot = h('div', { class: 'dish-foot' }, qty, hintEl, addBtn);

  const sh = sheet({ title: dish.name, body, foot, left: null, right: { icon: 'xmark' }, plain: true, onClose: () => S.live.delete(refresh) });
  sh.el.classList.add('dish-sheet');
  const split = SPLIT_MQ.matches;
  sh.el.classList.toggle('split', split);
  sh.el.querySelector('.navbar-side.end .barbtn')?.setAttribute('aria-label', 'Schließen');
  sh.body.addEventListener('scroll', () => {
    sh.el.classList.toggle('past-hero', sh.body.scrollTop > (split ? 24 : hero.offsetHeight - 70));
  }, { passive: true });

  // --- dynamische Teile ---
  function renderAvail() {
    const v = view();
    if (dish.gone) {
      availEl.replaceChildren(notice('red', 'xCircle', 'Nicht mehr auf der Karte', 'Dieses Gericht wurde von der Küche entfernt.'));
      return;
    }
    const av = dishAvailability(v, dish);
    availEl.replaceChildren(av.available ? '' : notice('red', 'xCircle', 'Zurzeit nicht verfügbar', `Es fehlt: ${av.missing.join(', ')}`));
  }

  /** Vorrat: Hinweiszeile und Anzahl je Größe unter dem Segment. */
  function renderStock() {
    const v = view();
    const total = dish.gone || !stock ? 0 : readySum(v, dish);
    if (sizes.length) {
      segStockEl.hidden = !total;
      segStockEl.replaceChildren(...readyBySize(dish).map((x) => (x.n > 0 && total
        ? h('span', { class: `seg-stock-n${x.size.id === st.sizeId ? ' on' : ''}` }, boltEl(), `${x.n} sofort`)
        : h('span', { class: 'seg-stock-none' }, '–'))));
    }
    if (!total) { stockEl.replaceChildren(); stockEl.hidden = true; return; }
    stockEl.hidden = false;
    const n = readyFor(v, dish, st.sizeId);
    if (!n) {
      stockEl.className = 'dish-stock none';
      stockEl.replaceChildren(iconEl('clock'), h('div', { class: 'grow' },
        h('div', { class: 'dish-stock-title' }, 'Für diese Größe nichts vorbereitet – wird frisch zubereitet')));
      return;
    }
    stockEl.className = 'dish-stock';
    const rest = Math.max(0, st.qty - n);
    stockEl.replaceChildren(h('span', { class: 'dish-stock-icon', html: BOLT }), h('div', { class: 'grow' },
      h('div', { class: 'dish-stock-title' }, `${n} sofort verfügbar`),
      h('div', { class: 'dish-stock-sub' }, rest
        ? `Bei ${st.qty} Stück: ${n} sofort, ${rest} ${rest === 1 ? 'wird' : 'werden'} frisch zubereitet.`
        : 'Bereits vorbereitet, ohne Wartezeit.')));
  }

  function renderIngredients() {
    if (!dish.ingredients?.length) return;
    const lines = ingredientLines(view(), dish, st.sizeId);
    const missing = lines.filter((l) => !l.available).length;
    const toggle = h('button', {
      class: `cfg-disclosure${st.showIng ? ' open' : ''}`, 'aria-expanded': String(st.showIng),
      onclick: () => { st.showIng = !st.showIng; haptic(); renderIngredients(); },
    },
    h('span', { class: 'grow' }, 'Zutaten'),
    h('span', { class: `cfg-disclosure-value${missing ? ' red' : ''}` }, missing ? `${missing} fehlt` : String(lines.length)),
    iconEl('chevronDown', 'cfg-chevron'));
    const list = st.showIng ? h('ul', { class: 'ing-list' }, lines.map((l) => h('li', { class: l.available ? '' : 'missing' },
      h('span', { class: 'ing-name' }, l.name),
      l.available ? null : h('span', { class: 'badge red' }, 'fehlt'),
      h('span', { class: 'ing-amount' }, [l.amount, l.unit].filter(Boolean).join(' '))))) : null;
    ingEl.replaceChildren(toggle, list || '');
  }

  function renderOptions() {
    const v = view();
    optsEl.replaceChildren(...(dish.options || []).map((o) => {
      const set = st.options[o.id] ||= new Set();
      for (const id of [...set]) {
        const c = o.choices.find((x) => x.id === id);
        if (!c || !choiceAvailable(v, c)) set.delete(id);
      }
      const hint = [o.required ? 'Erforderlich' : 'Optional', o.type === 'multi' ? 'Mehrfachauswahl' : null].filter(Boolean).join(' · ');
      const chips = h('div', { class: 'chips' }, o.choices.map((c) => {
        const ok = choiceAvailable(v, c);
        const on = set.has(c.id);
        return h('button', {
          class: `chip${on ? ' on' : ''}`, disabled: !ok, 'aria-pressed': String(on),
          title: ok ? '' : 'Zutat fehlt',
          onclick: () => {
            if (o.type === 'multi') { on ? set.delete(c.id) : set.add(c.id); }
            else if (on) { if (!o.required) set.delete(c.id); }
            else { set.clear(); set.add(c.id); }
            haptic(); renderOptions(); updateFoot();
          },
        }, on ? iconEl('check') : null, h('span', { class: 'chip-label' }, c.name), ok ? null : h('span', { class: 'chip-note' }, 'fehlt'));
      }));
      return cfgSection(o.name, hint, chips);
    }));
  }

  function problem() {
    if (dish.gone) return editing ? '' : 'Nicht mehr auf der Karte';
    if (!dishAvailability(view(), dish).available) return 'Nicht verfügbar';
    for (const o of dish.options || []) if (o.required && !st.options[o.id]?.size) return `Auswahl erforderlich: ${o.name}`;
    if (dish.manual && !noteEl.value.trim()) return 'Beschreibung erforderlich';
    return '';
  }

  function updateFoot() {
    const p = problem();
    addBtn.disabled = !!p;
    hintEl.className = `dish-foot-hint${p ? ' warn' : ''}`;
    if (p) { hintEl.textContent = p; return; }
    const size = sizes.find((s) => s.id === st.sizeId);
    hintEl.replaceChildren(
      h('div', { class: 'dish-foot-name' }, `${st.qty}× ${dish.name}`),
      h('div', { class: 'dish-foot-sub' }, [size?.name, dish.ice ? (st.ice ? 'mit Eis' : 'ohne Eis') : null].filter(Boolean).join(' · ') || (editing ? 'Änderungen übernehmen' : 'In den Warenkorb')));
  }

  function refresh() {
    const fresh = getDish();
    if (fresh) dish = { ...fresh, gone: false };
    else if (!dish.manual) dish = { ...dish, gone: true };
    renderAvail(); renderStock(); renderIngredients(); renderOptions(); updateFoot();
  }

  function build() {
    const size = sizes.find((s) => s.id === st.sizeId);
    const options = {}; const optionLabels = [];
    for (const o of dish.options || []) {
      const chosen = o.choices.filter((c) => st.options[o.id]?.has(c.id));
      if (!chosen.length) continue;
      options[o.id] = chosen.map((c) => c.id);
      optionLabels.push(`${o.name}: ${chosen.map((c) => c.name).join(', ')}`);
    }
    const base = {
      id: item?.id || uid('i'), dishId: dish.id, name: dish.name, category: dish.category, country: dish.country || '',
      sizeId: size?.id ?? null, sizeName: size?.name ?? null, qty: st.qty, ice: dish.ice ? st.ice : null,
      options, optionLabels, note: noteEl.value.trim(),
      stockQty: Math.min(st.qty, readyFor(view(), dish, size?.id ?? null)),
    };
    // Gericht entfernt: Konfiguration der bestehenden Position unverändert lassen
    if (dish.gone && item) Object.assign(base, { sizeId: item.sizeId, sizeName: item.sizeName, ice: item.ice, options: item.options || {}, optionLabels: item.optionLabels || [] });
    return base;
  }

  function save() {
    if (problem()) return;
    const it = build();
    haptic();
    sh.close('save');
    if (onSave) { onSave(it); return; }
    const same = cart.items.find((x) => sameConfig(x, it));
    if (same) {
      same.qty = Math.min(99, same.qty + it.qty);
      same.stockQty = Math.min(same.qty, readyFor(view(), getDish(), same.sizeId));
    } else cart.items.push(it);
    saveCart();
    emit('added', it);
    toast('Zum Warenkorb hinzugefügt', { message: `${it.qty}× ${it.name}`, icon: 'basket', ms: 2400, onClick: () => S.openCart?.() });
  }

  S.live.add(refresh);
  refresh();
  return sh;
}

function cfgSection(title, hint, content) {
  return h('section', { class: 'cfg-sec' },
    h('div', { class: 'cfg-head' }, h('h3', {}, title), hint ? h('span', { class: 'cfg-hint' }, hint) : null),
    content);
}

export function notice(tone, ic, title, text) {
  return h('div', { class: `notice ${tone}` }, iconEl(ic),
    h('div', { class: 'grow' }, h('div', { class: 'notice-title' }, title), text ? h('div', { class: 'notice-text' }, text) : null));
}
