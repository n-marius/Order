// End-to-End-Test der Küchen-App gegen den Mock-Server.
// Start: node tests/kueche.e2e.mjs [ausgabeordner-für-screenshots]
// Startet tests/mock-server.mjs auf Port 8101 selbst, falls er nicht läuft.
//
// Hinweis: API und Worker werden über 127.0.0.1 angesprochen, die App über localhost. Der Service Worker
// cacht GET-Anfragen der eigenen Origin – eine API unter derselben Origin würde sonst veraltete Gist-Stände liefern.

import { chromium } from '/opt/node-tools/node_modules/playwright/index.mjs';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import * as TPL from '../kueche/vorlage.js';

const PORT = 8101;
const APP = `http://localhost:${PORT}/kueche/`;
const API = `http://127.0.0.1:${PORT}/api`;
const WORKER = `http://127.0.0.1:${PORT}/worker`;
const OUT = process.argv[2] || path.resolve('test-results/kueche');
fs.mkdirSync(OUT, { recursive: true });

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
let server = null;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log('·', ...a);
let failures = 0;
function check(cond, msg) {
  if (cond) console.log('  ✓', msg);
  else { failures++; console.log('  ✗', msg); }
}

async function ensureServer() {
  try { await fetch(`http://localhost:${PORT}/__state`); }
  catch {
    server = spawn(process.execPath, [path.join(ROOT, 'tests/mock-server.mjs'), String(PORT)], { stdio: 'ignore' });
    for (let i = 0; i < 50; i++) { try { await fetch(`http://localhost:${PORT}/__state`); break; } catch { await sleep(100); } }
  }
  await fetch(`http://localhost:${PORT}/__reset`, { method: 'POST' });
}

const state = async () => (await fetch(`http://localhost:${PORT}/__state`)).json();
async function until(fn, msg, ms = 20000) {
  const t0 = Date.now();
  for (;;) {
    try { const v = await fn(); if (v) return v; } catch {}
    if (Date.now() - t0 > ms) throw new Error(`Zeitüberschreitung: ${msg}`);
    await sleep(250);
  }
}
async function patchGist(id, files) {
  const r = await fetch(`${API}/gists/${id}`, { method: 'PATCH', headers: { Authorization: 'Bearer x', 'Content-Type': 'application/json' }, body: JSON.stringify({ files }) });
  if (!r.ok) throw new Error('PATCH fehlgeschlagen ' + r.status);
}
const fileOf = (st, gid, name) => { const c = st.gists[gid]?.files[name]; return c ? JSON.parse(c) : null; };

// ---------- Browser ----------

const errors = [];
let offlinePhase = false;
function watch(page, label) {
  page.on('pageerror', (e) => errors.push(`[${label}] pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const t = m.text();
    if (offlinePhase && /Failed to load resource|ERR_/.test(t)) return;
    errors.push(`[${label}] console: ${t}`);
  });
}

const sheetSel = (cls) => `.sheet-root.in .${cls}`;
async function shot(page, name, { banners = false } = {}) {
  await sleep(450);
  if (!banners) await page.evaluate(() => document.querySelectorAll('.toast').forEach((t) => t.remove()));
  await page.screenshot({ path: path.join(OUT, `${name}.png`) });
  log('Screenshot', name);
}
async function nav(page, id) {
  const sb = page.locator(`.sb-item[data-nav="${id}"]`);
  if (await sb.isVisible()) await sb.click();
  else await page.locator(`.k-tabbar button[data-nav="${id}"]`).click();
  await sleep(250);
}
async function alertInput(page, text, button) {
  const a = page.locator('.alert-root.in');
  await a.waitFor();
  await a.locator('input').fill(text);
  await a.getByRole('button', { name: button, exact: true }).click();
  await page.waitForSelector('.alert-root.in', { state: 'detached' }).catch(() => {});
  await sleep(250);
}
async function closeSheet(page, cls) {
  await page.locator(sheetSel(cls)).locator('.navbar .barbtn', { hasText: /Schließen|Abbrechen/ }).first().click();
  await sleep(500);
}

async function makePhoto(page, file) {
  const data = await page.evaluate(() => {
    const c = document.createElement('canvas'); c.width = 900; c.height = 675;
    const g = c.getContext('2d');
    const bg = g.createLinearGradient(0, 0, 900, 675); bg.addColorStop(0, '#1f3b2d'); bg.addColorStop(1, '#0d1a14');
    g.fillStyle = bg; g.fillRect(0, 0, 900, 675);
    const glass = g.createLinearGradient(330, 120, 570, 600); glass.addColorStop(0, 'rgba(220,255,230,0.85)'); glass.addColorStop(1, 'rgba(120,200,140,0.75)');
    g.fillStyle = glass; g.beginPath(); g.moveTo(320, 140); g.lineTo(580, 140); g.lineTo(550, 600); g.lineTo(350, 600); g.closePath(); g.fill();
    for (let i = 0; i < 26; i++) { g.fillStyle = `rgba(255,255,255,${0.25 + Math.random() * 0.4})`; g.beginPath(); g.arc(360 + Math.random() * 180, 220 + Math.random() * 360, 8 + Math.random() * 18, 0, 7); g.fill(); }
    for (let i = 0; i < 9; i++) { g.fillStyle = '#3fa34d'; g.beginPath(); g.ellipse(390 + i * 16, 150 - (i % 3) * 18, 30, 14, i, 0, 7); g.fill(); }
    g.fillStyle = '#c9e265'; g.beginPath(); g.arc(560, 160, 52, 0, 7); g.fill();
    g.fillStyle = '#e9f5b0'; g.beginPath(); g.arc(560, 160, 40, 0, 7); g.fill();
    return c.toDataURL('image/jpeg', 0.85);
  });
  fs.writeFileSync(file, Buffer.from(data.split(',')[1], 'base64'));
}

function orderDoc(orders) {
  return JSON.stringify({ v: 1, device: { id: 'oTEST', name: 'Wohnzimmer', role: 'order', updatedAt: Date.now() }, orders: Object.fromEntries(orders.map((o) => [o.id, o])) });
}

async function main() {
  await ensureServer();
  const browser = await chromium.launch();
  const ipad = await browser.newContext({ viewport: { width: 1180, height: 820 }, deviceScaleFactor: 2, hasTouch: true, locale: 'de-DE', timezoneId: 'Europe/Berlin' });
  await ipad.addInitScript(([api, worker]) => {
    if (!localStorage.getItem('tafel.settings.kitchen')) {
      localStorage.setItem('tafel.settings.kitchen', JSON.stringify({ apiBase: api, workerUrl: worker, workerKey: 'test', theme: 'system', sound: true }));
    }
  }, [API, WORKER]);
  const page = await ipad.newPage();
  watch(page, 'iPad');

  // ---------- Einrichtung ----------
  log('Einrichtung');
  await page.goto(APP);
  await page.waitForSelector(sheetSel('k-setup-sheet'));
  await sleep(500);
  await shot(page, 'ipad-light-01-einrichtung');
  await page.getByLabel('Gerätename').fill('Küche');
  await page.locator(sheetSel('k-setup-sheet')).locator('input[aria-label="GitHub-Token"]').first().fill('github_pat_test_1234567890');
  await page.getByRole('button', { name: 'Einrichten', exact: true }).click();
  const st0 = await until(async () => { const s = await state(); return Object.keys(s.gists).length === 2 && s; }, 'Gists angelegt');
  await page.waitForSelector(sheetSel('k-setup-sheet'), { state: 'detached' });
  const settings = await page.evaluate(() => JSON.parse(localStorage.getItem('tafel.settings.kitchen')));
  const GID = settings.gistId;
  const KFILE = `dev-${settings.deviceId}.json`;
  check(GID && settings.imgGistId && st0.gists[GID], 'Daten- und Bilder-Gist angelegt');
  await until(async () => fileOf(await state(), GID, KFILE)?.device?.heartbeat, 'Heartbeat der Küche im Gist');
  check(true, 'Küchendatei mit Heartbeat geschrieben');

  // ---------- Zutaten ----------
  log('Zutaten anlegen');
  await nav(page, 'ingredients');
  for (const n of ['Rum', 'Limette', 'Minze', 'Rohrzucker', 'Soda', 'Vanillesirup', 'Tomaten', 'Basilikum', 'Mozzarella', 'Olivenöl']) {
    await page.locator('.k-actions [aria-label="Zutat hinzufügen"]').click();
    await alertInput(page, n, 'Hinzufügen');
  }
  await until(async () => page.locator('.k-ing-row').count().then((c) => c === 10), '10 Zutaten in der Liste');
  check(true, '10 Zutaten angelegt');

  // ---------- Gericht ----------
  log('Gericht mit Größen, Optionen und Eis anlegen');
  const jpg = path.join(OUT, 'mojito.jpg');
  await makePhoto(page, jpg);
  await nav(page, 'dishes');
  await page.locator('.k-actions [aria-label="Gericht hinzufügen"]').click();
  const ed = page.locator(sheetSel('k-editor-sheet'));
  await ed.waitFor();
  await ed.locator('.k-ed-name').fill('Mojito');
  await ed.locator('.k-ed-desc').fill('Kubanischer Klassiker mit frischer Minze, Limette und weißem Rum.');
  await ed.locator('.k-frow', { hasText: 'Kategorie' }).locator('select').selectOption('alkohol');
  await ed.locator('.k-frow', { hasText: 'Nationalität' }).locator('select').selectOption('CU');
  await ed.locator('input[aria-label="Zubereitungszeit in Minuten"]').fill('5');
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), ed.getByRole('button', { name: 'Foto hinzufügen' }).click()]);
  await chooser.setFiles(jpg);
  await ed.locator('.k-ed-ph img').waitFor();
  await ed.locator('input[aria-label="Portionsgrößen"]').click();
  await ed.locator('.k-size-row').nth(2).waitFor();

  async function addIng(name, amounts, unit, create = false) {
    await ed.getByRole('button', { name: 'Zutat hinzufügen' }).click();
    const pick = page.locator(sheetSel('k-pick-sheet'));
    await pick.waitFor();
    if (create) {
      await pick.locator('input[type="search"]').fill(name);
      await pick.locator('.k-create').click();
    } else {
      await pick.locator('.cell', { hasText: new RegExp(`^${name}`) }).first().click();
    }
    await page.waitForSelector(sheetSel('k-pick-sheet'), { state: 'detached' });
    const row = ed.locator('.k-ir:not(.k-ir-head)').last();
    const ins = row.locator('.k-amt');
    for (let i = 0; i < amounts.length; i++) await ins.nth(i).fill(amounts[i]);
    await row.locator('input.k-ir-unit').fill(unit);
  }
  await addIng('Rum', ['4', '5', '6'], 'cl');
  await addIng('Limette', ['0,5', '1', '1'], 'Stück');
  await addIng('Minze', ['6', '8', '10'], 'Blatt');
  await addIng('Rohrzucker', ['1', '2', '2'], 'TL');
  await addIng('Crushed Ice', ['', '', ''], 'nach Bedarf', true);
  for (const s of ['Minze, Limettenstücke und Rohrzucker im Glas leicht andrücken.', 'Glas mit Crushed Ice füllen und Rum zugeben.', 'Mit Soda auffüllen, kurz umrühren und mit Minze garnieren.']) {
    await ed.getByRole('button', { name: 'Schritt hinzufügen' }).click();
    await ed.locator('.k-step textarea').last().fill(s);
  }
  await ed.getByRole('button', { name: 'Optionsgruppe hinzufügen' }).click();
  const og = ed.locator('.k-og').first();
  await og.locator('.k-og-name').fill('Süße');
  await og.locator('.k-choice-name').first().fill('Normal');
  await og.getByRole('button', { name: 'Auswahl hinzufügen' }).click();
  await og.locator('.k-choice-name').nth(1).fill('Mit Vanillesirup');
  await og.locator('.k-choice').nth(1).locator('select').selectOption({ label: 'Vanillesirup' });
  await og.locator('input[aria-label="Pflichtauswahl"]').click();
  await ed.locator('input[aria-label="Eis-Auswahl anbieten"]').click();
  await ed.locator('input[aria-label="Standard: mit Eis"]').waitFor();
  await ed.locator('.sheet-body').evaluate((b) => { b.scrollTop = 0; });
  await shot(page, 'ipad-light-05-gericht-bearbeiten');
  await ed.locator('.sheet-body').evaluate((b) => { b.scrollTop = 520; });
  await shot(page, 'ipad-light-06-gericht-bearbeiten-zutaten');
  await ed.locator('.sheet-body').evaluate((b) => { b.scrollTop = b.scrollHeight; });
  await shot(page, 'ipad-light-07-gericht-bearbeiten-optionen');
  await ed.getByRole('button', { name: 'Speichern' }).click();
  await page.waitForSelector(sheetSel('k-editor-sheet'), { state: 'detached' });

  const st1 = await until(async () => {
    const s = await state();
    const f = fileOf(s, GID, KFILE);
    const d = f && Object.values(f.menu.dishes).find((x) => x.name === 'Mojito');
    return d && Object.keys(s.gists[settings.imgGistId].files).some((n) => n.startsWith('img-')) && { s, d, f };
  }, 'Gericht und Foto im Gist');
  const dish = st1.d;
  check(dish.category === 'alkohol' && dish.country === 'CU' && dish.prepMinutes === 5, 'Kategorie, Land, Zeit gespeichert');
  check(dish.sizes.length === 3 && dish.defaultSizeId === dish.sizes[1].id, 'Drei Größen, Standard Mittel');
  check(dish.ingredients.length === 5 && dish.ingredients[0].amounts[dish.sizes[2].id] === '6', 'Zutaten mit Mengen je Größe');
  check(dish.steps.length === 3, 'Drei Zubereitungsschritte');
  check(dish.options.length === 1 && dish.options[0].required && dish.options[0].choices.length === 2 && dish.options[0].choices[1].ingredientId, 'Optionsgruppe mit verknüpfter Zutat');
  check(dish.ice && dish.ice.default === true, 'Eis-Auswahl mit Standard „mit Eis“');
  check(dish.imageId && st1.s.gists[settings.imgGistId].files[`img-${dish.imageId}.txt`], 'Foto im Bilder-Gist');
  check(Object.values(st1.f.menu.ingredients).some((i) => i.name === 'Crushed Ice' && i.available), 'Neue Zutat aus dem Editor angelegt');

  // zweites Gericht ohne Größen (für Raster und Rezept)
  await page.locator('.k-actions [aria-label="Gericht hinzufügen"]').click();
  await ed.waitFor();
  await ed.locator('.k-ed-name').fill('Bruschetta');
  await ed.locator('.k-ed-desc').fill('Geröstetes Brot mit Tomaten, Basilikum und Olivenöl.');
  await ed.locator('.k-frow', { hasText: 'Kategorie' }).locator('select').selectOption('vorspeise');
  await ed.locator('.k-frow', { hasText: 'Nationalität' }).locator('select').selectOption('IT');
  await addIng('Tomaten', ['2'], 'Stück');
  await addIng('Basilikum', ['4'], 'Blatt');
  await addIng('Olivenöl', ['1'], 'EL');
  await ed.getByRole('button', { name: 'Speichern' }).click();
  await page.waitForSelector(sheetSel('k-editor-sheet'), { state: 'detached' });
  await page.locator('.k-dish', { hasText: 'Bruschetta' }).waitFor();

  // Zutat fehlt → Gericht gesperrt
  await nav(page, 'ingredients');
  await page.locator('.k-ing-row', { hasText: 'Basilikum' }).locator('input[role="switch"]').click();
  await page.locator('.k-ing-row', { hasText: 'Vanillesirup' }).locator('input[role="switch"]').click();
  await until(async () => {
    const f = fileOf(await state(), GID, KFILE);
    return Object.values(f.menu.ingredients).find((i) => i.name === 'Basilikum')?.available === false;
  }, 'Verfügbarkeit im Gist');
  check(true, 'Schalter „vorhanden“ schreibt sofort');
  await page.locator('.k-ing-row', { hasText: 'Basilikum' }).locator('.red', { hasText: 'Gesperrt: Bruschetta' }).waitFor();
  check(true, 'Gesperrtes Gericht wird bei der Zutat genannt');
  await shot(page, 'ipad-light-08-zutaten');
  await nav(page, 'dishes');
  await page.locator('.k-dish.unavailable', { hasText: 'Bruschetta' }).waitFor();
  check(await page.locator('.k-dish', { hasText: 'Bruschetta' }).locator('.k-dish-missing', { hasText: 'Basilikum' }).count() === 1, 'Gericht zeigt fehlende Zutat');
  await shot(page, 'ipad-light-03-gerichte');
  await page.locator('.k-dish', { hasText: 'Mojito' }).click();
  await page.locator(sheetSel('k-recipe-sheet')).waitFor();
  await page.locator(sheetSel('k-recipe-sheet')).locator('.k-hero img').waitFor();
  await shot(page, 'ipad-light-04-rezept');
  await closeSheet(page, 'k-recipe-sheet');

  // ---------- Bestellung ----------
  log('Bestellung eines Bestellgeräts');
  await nav(page, 'orders');
  const g = dish.options[0];
  const t = Date.now();
  const order = {
    id: 'oTEST-1', deviceId: 'oTEST', deviceName: 'Wohnzimmer', createdAt: t - 90000, updatedAt: t - 90000, rev: 1,
    note: 'Bitte zusammen servieren', cancelled: false, cancelledAt: null, changes: [],
    items: [
      { id: 'i1', dishId: dish.id, name: 'Mojito', category: 'alkohol', country: 'CU', sizeId: dish.sizes[2].id, sizeName: 'Groß', qty: 2, ice: true, options: { [g.id]: [g.choices[0].id] }, optionLabels: ['Süße: Normal'], note: '', cancelled: false, cancelledAt: null, answers: {} },
      { id: 'i2', dishId: 'manual-hauptspeise', name: 'Manuell', category: 'hauptspeise', country: '', sizeId: null, sizeName: null, qty: 1, ice: null, options: {}, optionLabels: [], note: 'Spaghetti aglio e olio', cancelled: false, cancelledAt: null, answers: {} },
      { id: 'i3', dishId: dish.id, name: 'Mojito', category: 'alkohol', country: 'CU', sizeId: dish.sizes[0].id, sizeName: 'Klein', qty: 1, ice: false, options: {}, optionLabels: ['Süße: Normal'], note: 'Wenig Rum', cancelled: false, cancelledAt: null, answers: {} },
    ],
  };
  await patchGist(GID, { 'dev-oTEST.json': { content: orderDoc([order]) } });
  await page.locator('.k-order[data-order="oTEST-1"]').waitFor({ timeout: 15000 });
  check(true, 'Küche zeigt die Bestellung');
  await page.locator('.toast-title', { hasText: 'Neue Bestellung · Wohnzimmer' }).waitFor({ timeout: 5000 }).then(() => check(true, 'Banner „Neue Bestellung“'), () => check(false, 'Banner „Neue Bestellung“'));
  await until(async () => fileOf(await state(), GID, KFILE)?.status?.['oTEST-1']?.ackRev === 1, 'ackRev = 1');
  check(true, 'Empfang (ackRev 1) geschrieben');
  const lateAck = await until(async () => (await state()).notifyLog.find((n) => n.title === 'Bestellung empfangen'), 'Meldung verspäteter Empfang');
  check(lateAck.to.deviceIds[0] === 'oTEST' && /wurde von der Küche empfangen/.test(lateAck.body), 'Verspäteter Empfang an das Bestellgerät gemeldet');
  await sleep(2800);
  await shot(page, 'ipad-light-02-bestellungen', { banners: true });

  log('Detailblatt: Nachfrage und Storno');
  await page.locator('.k-order[data-order="oTEST-1"]').click();
  const ds = page.locator(sheetSel('k-order-sheet'));
  await ds.waitFor();
  await shot(page, 'ipad-light-09-detail');
  await ds.locator('.k-item').nth(0).getByRole('button', { name: 'Nachfrage' }).click();
  await alertInput(page, 'Mit Strohhalm?', 'Senden');
  await ds.locator('.k-item').nth(1).getByRole('button', { name: 'Storno' }).click();
  await alertInput(page, 'Spaghetti sind leider aus', 'Stornieren');
  const st2 = await until(async () => {
    const s = await state();
    const items = fileOf(s, GID, KFILE)?.status?.['oTEST-1']?.items || {};
    return items.i1?.questions?.length === 1 && items.i2?.state === 'storno' && s;
  }, 'Nachfrage und Storno im Gist');
  const its = fileOf(st2, GID, KFILE).status['oTEST-1'].items;
  check(its.i2.reason === 'Spaghetti sind leider aus', 'Storno mit Grund gespeichert');
  const notes = await until(async () => { const s = await state(); return s.notifyLog.length >= 3 && s.notifyLog; }, 'Meldungen');
  check(notes.some((n) => n.title === 'Nachfrage zu Mojito' && n.body === 'Mit Strohhalm?' && n.to.deviceIds[0] === 'oTEST'), 'Push „Nachfrage zu Mojito“');
  check(notes.some((n) => n.title === 'Storniert: Manuell' && n.body === 'Spaghetti sind leider aus'), 'Push „Storniert: Manuell“');

  log('Antwort und Änderung durch den Besteller');
  const qid = its.i1.questions[0].id;
  const o2 = structuredClone(order);
  o2.rev = 2; o2.updatedAt = Date.now();
  o2.items[0].answers = { [qid]: { quick: 'ja', text: 'Gerne zwei', at: Date.now() } };
  o2.items[2].cancelled = true; o2.items[2].cancelledAt = Date.now();
  o2.changes = [{ at: Date.now(), text: 'Mojito (Klein) abbestellt' }];
  await patchGist(GID, { 'dev-oTEST.json': { content: orderDoc([o2]) } });
  await ds.locator('.k-bubble.a', { hasText: 'Ja – Gerne zwei' }).waitFor({ timeout: 15000 });
  check(true, 'Antwort erscheint im Detailblatt');
  check(await ds.locator('.k-item.state-abbestellt .badge', { hasText: 'Abbestellt' }).count() === 1, 'Abbestellte Position markiert');
  check(await ds.locator('.k-change', { hasText: 'Mojito (Klein) abbestellt' }).count() === 1, 'Änderungsprotokoll sichtbar');
  await page.locator('.toast-title', { hasText: /Antwort erhalten|Bestellung geändert/ }).first().waitFor({ timeout: 5000 }).then(() => check(true, 'Banner bei Antwort/Änderung'), () => check(false, 'Banner bei Antwort/Änderung'));
  await until(async () => fileOf(await state(), GID, KFILE)?.status?.['oTEST-1']?.ackRev === 2, 'ackRev = 2');
  check(true, 'Änderung bestätigt (ackRev 2)');
  await sleep(600);
  await shot(page, 'ipad-light-10-detail-nachfrage');

  log('Abschließen und wieder öffnen');
  await ds.locator('.k-item').nth(0).getByRole('button', { name: 'Fertig' }).click();
  await until(async () => fileOf(await state(), GID, KFILE)?.status?.['oTEST-1']?.items?.i1?.state === 'fertig', 'i1 fertig');
  check((await state()).notifyLog.every((n) => !/Fertig/.test(n.title)), 'Keine Meldung bei „Fertig“');
  await closeSheet(page, 'k-order-sheet');
  await page.locator('.k-orders.is-empty').waitFor();
  check(true, 'Dashboard leer nach Abschluss');
  await nav(page, 'done');
  await page.locator('.k-done-row', { hasText: 'Wohnzimmer' }).click();
  await ds.waitFor();
  await ds.locator('.k-item').nth(0).getByRole('button', { name: 'Zurück auf „Neu“' }).click();
  await page.locator('.k-alldone').waitFor();
  check(true, 'Wiederöffnen über „Zurück auf Neu“');
  await page.locator('.k-alldone').click();
  await page.waitForSelector(sheetSel('k-order-sheet'), { state: 'detached' });
  await until(async () => fileOf(await state(), GID, KFILE)?.status?.['oTEST-1']?.items?.i1?.state === 'fertig', 'Alles fertig');
  check(true, '„Alles fertig“ schließt die Bestellung');
  await shot(page, 'ipad-light-11-erledigt');

  // neue offene Bestellungen für die Ansichten
  const t2 = Date.now();
  const mk = (id, room, mins, items, extra = {}) => ({ id, deviceId: 'oTEST', deviceName: room, createdAt: t2 - mins * 60e3, updatedAt: t2 - mins * 60e3, rev: 1, note: '', cancelled: false, cancelledAt: null, changes: [], items, ...extra });
  const it = (id, name, qty, more = {}) => ({ id, dishId: dish.id, name, category: 'alkohol', country: 'CU', sizeId: dish.sizes[1].id, sizeName: 'Mittel', qty, ice: true, options: {}, optionLabels: ['Süße: Normal'], note: '', cancelled: false, cancelledAt: null, answers: {}, ...more });
  const more = [
    o2,
    mk('oTEST-2', 'Wohnzimmer', 24, [it('a1', 'Mojito', 2), { ...it('a2', 'Bruschetta', 1), dishId: 'x', category: 'vorspeise', country: 'IT', sizeId: null, sizeName: null, ice: null, optionLabels: [], note: 'Ohne Knoblauch' }], { note: 'Für den Balkon' }),
    mk('oTEST-3', 'Wohnzimmer', 3, [it('b1', 'Mojito', 1, { sizeName: 'Groß' }), { ...it('b2', 'Manuell', 1), dishId: 'manual-dessert', category: 'dessert', country: '', sizeName: null, ice: null, optionLabels: [], note: 'Etwas Süßes, gern mit Früchten' }]),
  ];
  await patchGist(GID, { 'dev-oTEST.json': { content: orderDoc(more) } });
  await nav(page, 'orders');
  await page.locator('.k-order[data-order="oTEST-3"]').waitFor({ timeout: 15000 });
  await until(async () => fileOf(await state(), GID, KFILE)?.status?.['oTEST-3']?.ackRev === 1, 'Ack weiterer Bestellungen');
  await page.locator('.k-order[data-order="oTEST-2"]').click();
  await ds.waitFor();
  await ds.locator('.k-item').nth(0).getByRole('button', { name: 'Fertig' }).click();
  await closeSheet(page, 'k-order-sheet');
  await sleep(3000);
  await shot(page, 'ipad-light-02b-bestellungen');

  // Seitenleiste einklappen
  await page.locator('.k-sb-close').click();
  await sleep(500);
  check(await page.locator('.k-sidebar.collapsed').count() === 1, 'Seitenleiste einklappbar');
  await shot(page, 'ipad-light-12-ohne-seitenleiste');
  await page.locator('.k-sb-toggle').click();
  await sleep(500);

  await nav(page, 'settings');
  await shot(page, 'ipad-light-13-einstellungen');
  const code = await page.locator('.k-code').textContent();
  check(/^TAFEL1:/.test(code), 'Einrichtungscode angezeigt');

  // ---------- Vorlage ----------
  log('Vorlage importieren');
  await nav(page, 'ingredients');
  await page.locator('.k-actions [aria-label="Zutat hinzufügen"]').click();
  await alertInput(page, 'vanilleeis', 'Hinzufügen');
  const userIng = await until(async () => {
    const f = fileOf(await state(), GID, KFILE);
    return f && Object.values(f.menu.ingredients).find((i) => i.name === 'vanilleeis');
  }, 'Zutat „vanilleeis“ im Gist');
  const olive = Object.values(fileOf(await state(), GID, KFILE).menu.ingredients).find((i) => i.name === 'Olivenöl');
  await nav(page, 'settings');
  await page.getByRole('button', { name: 'Vorlage importieren' }).click();
  const conf = page.locator('.alert-root.in');
  await conf.waitFor();
  const haveNames = new Set(Object.values(fileOf(await state(), GID, KFILE).menu.ingredients).filter((i) => !i.deleted).map((i) => i.name.toLowerCase()));
  const expectIngs = TPL.INGREDIENTS.filter((i) => !haveNames.has(i.name.toLowerCase())).length;
  check((await conf.textContent()).includes(`${TPL.DISHES.length} Gerichte und ${expectIngs} Zutaten`), `Bestätigung nennt ${TPL.DISHES.length} Gerichte und ${expectIngs} Zutaten`);
  await shot(page, 'ipad-light-15-vorlage-bestaetigen');
  await conf.getByRole('button', { name: 'Importieren' }).click();
  await page.locator('.toast-title', { hasText: `${TPL.DISHES.length} Gerichte und ${expectIngs} Zutaten angelegt` }).waitFor({ timeout: 5000 })
    .then(() => check(true, 'Banner mit Ergebnis'), () => check(false, 'Banner mit Ergebnis'));
  const imp = await until(async () => {
    const f = fileOf(await state(), GID, KFILE);
    return f && TPL.DISHES.every((d) => f.menu.dishes[d.id]) && f;
  }, 'Gerichte der Vorlage im Gist');
  const names = Object.values(imp.menu.ingredients).filter((i) => !i.deleted).map((i) => i.name.toLowerCase());
  check(names.length === new Set(names).size, 'Keine doppelten Zutaten');
  check(!imp.menu.ingredients['vz-olivenoel'] && !imp.menu.ingredients['vz-vanilleeis'], 'Gleichnamige Zutaten nicht neu angelegt');
  const cake = imp.menu.dishes['vd-chocolate-cake'];
  check(cake.options[0].choices.find((c) => c.id === 'c-vanille').ingredientId === userIng.id, 'Vorhandene Zutat „vanilleeis“ im Gericht verknüpft');
  check(!!olive, 'Vorhandenes Olivenöl bleibt bestehen');

  log('Option nur bei bestimmter Größe (Yuzu Limo)');
  check(JSON.stringify(imp.menu.dishes['vd-yuzu-limo'].options[0].sizeIds) === '["s2"]', '„mit Glas“ nur bei Flasche');
  await nav(page, 'dishes');
  await page.locator('.k-dish[data-dish="vd-yuzu-limo"] .k-dish-edit').click();
  await ed.waitFor();
  const scope = ed.locator('.k-og-sizes');
  check(await scope.locator('.chip.on:has-text("Flasche")').count() === 1 && await scope.locator('.chip.on:has-text("Glas")').count() === 0, 'Editor zeigt Größenbindung');
  await scope.locator('.chip:has-text("Glas")').click();
  check(await scope.locator('.chip.on').count() === 2, 'Alle Größen gewählt');
  await scope.locator('.chip:has-text("Glas")').click();
  await ed.getByRole('button', { name: 'Speichern' }).click();
  await page.waitForSelector(sheetSel('k-editor-sheet'), { state: 'detached' });
  const yz = await until(async () => { const d = fileOf(await state(), GID, KFILE).menu.dishes['vd-yuzu-limo']; return d.updatedAt > imp.menu.dishes['vd-yuzu-limo'].updatedAt && d; }, 'Yuzu Limo gespeichert');
  check(JSON.stringify(yz.options[0].sizeIds) === '["s2"]', 'Größenbindung bleibt beim Speichern erhalten');

  log('Erneuter Import (Idempotenz, gelöschte Gerichte bleiben gelöscht)');
  await nav(page, 'dishes');
  await page.locator('.k-dish[data-dish="vd-pralinen"] .k-dish-edit').click();
  await ed.waitFor();
  await ed.getByRole('button', { name: 'Gericht löschen' }).click();
  await page.locator('.alert-root.in').getByRole('button', { name: 'Löschen' }).click();
  await page.waitForSelector(sheetSel('k-editor-sheet'), { state: 'detached' });
  await until(async () => fileOf(await state(), GID, KFILE).menu.dishes['vd-pralinen']?.deleted, 'Pralinen gelöscht');
  const before = fileOf(await state(), GID, KFILE);
  await nav(page, 'settings');
  await page.getByRole('button', { name: 'Vorlage importieren' }).click();
  await page.locator('.alert-root.in', { hasText: 'Vorlage bereits vorhanden' }).waitFor();
  check(true, 'Zweiter Import: nichts anzulegen');
  await page.locator('.alert-root.in').getByRole('button', { name: 'OK' }).click();
  await sleep(1200);
  const after = fileOf(await state(), GID, KFILE);
  check(after.menu.dishes['vd-pralinen'].deleted === true, 'Gelöschtes Gericht bleibt gelöscht');
  check(Object.keys(after.menu.ingredients).length === Object.keys(before.menu.ingredients).length, 'Keine weiteren Zutaten angelegt');

  log('Lakritz ohne Sorten');
  await nav(page, 'ingredients');
  await page.locator('.k-toolbar input[type="search"]').fill('Lakritz');
  for (const n of ['Zitrone', 'Yuzu', 'Vanille']) await page.locator('.k-ing-row', { hasText: `Lakritz von Bülow ${n}` }).locator('input[role="switch"]').click();
  await page.locator('.k-toolbar input[type="search"]').fill('');
  await nav(page, 'dishes');
  await page.locator('.k-dish.unavailable[data-dish="vd-lakritz"]').waitFor({ timeout: 8000 })
    .then(() => check(true, 'Lakritz ohne vorhandene Sorte ist nicht verfügbar'), () => check(false, 'Lakritz ohne vorhandene Sorte ist nicht verfügbar'));
  check((await page.locator('.k-dish[data-dish="vd-lakritz"] .k-dish-missing').textContent()).includes('Sorte: keine Auswahl vorhanden'), 'Grund „Sorte: keine Auswahl vorhanden“');

  // ---------- Vorrat ----------
  log('Vorrat');
  const readyOf = async (id, key) => +(fileOf(await state(), GID, KFILE).menu.dishes[id]?.ready?.[key] || 0);
  await page.locator('.k-dish[data-dish="vd-polvorones"] .k-ready').click();
  const rs = page.locator(sheetSel('k-ready-sheet'));
  await rs.waitFor();
  for (let i = 0; i < 3; i++) await rs.locator('.k-ready-row[data-key="s1"] button[aria-label$="mehr"]').click();
  await rs.locator('.k-ready-row[data-key="s2"] button[aria-label$="mehr"]').click();
  await until(async () => (await readyOf('vd-polvorones', 's1')) === 3, 'Vorrat s1 = 3');
  check(true, 'Vorrat über das Schnellblatt gesetzt');
  await shot(page, 'ipad-light-16-vorrat-blatt');
  await rs.getByRole('button', { name: 'Fertig' }).click();
  await page.waitForSelector(sheetSel('k-ready-sheet'), { state: 'detached' });
  check((await page.locator('.k-dish[data-dish="vd-polvorones"] .k-ready-v').textContent()).includes('1 Stück 3'), 'Karte zeigt „1 Stück 3“');
  await page.locator('.k-dish[data-dish="vd-polvorones"]').scrollIntoViewIfNeeded();
  await shot(page, 'ipad-light-17-gerichte-vorrat');

  const polvo = (id, qty, stockQty, extra = {}) => ({ id, dishId: 'vd-polvorones', name: 'Polvorones', category: 'dessert', country: 'ES', sizeId: 's1', sizeName: '1 Stück', qty, ice: null, options: {}, optionLabels: [], note: '', cancelled: false, cancelledAt: null, stockQty, answers: {}, ...extra });
  const ord = (id, dev, room, items, extra = {}) => ({ id, deviceId: dev, deviceName: room, createdAt: Date.now(), updatedAt: Date.now(), rev: 1, note: '', cancelled: false, cancelledAt: null, changes: [], items, ...extra });
  const devDoc = (dev, room, orders) => JSON.stringify({ v: 1, device: { id: dev, name: room, role: 'order', updatedAt: Date.now() }, orders: Object.fromEntries(orders.map((o) => [o.id, o])) });

  log('Zwei gleichzeitige Bestellungen übersteigen den Vorrat');
  await nav(page, 'orders');
  const oA1 = ord('oA-1', 'oA', 'Arbeitszimmer', [polvo('p1', 2, 2)]);
  const oB1 = ord('oB-1', 'oB', 'Esszimmer', [polvo('p1', 2, 2)]);
  await patchGist(GID, { 'dev-oA.json': { content: devDoc('oA', 'Arbeitszimmer', [oA1]) }, 'dev-oB.json': { content: devDoc('oB', 'Esszimmer', [oB1]) } });
  const stc = await until(async () => {
    const st = await state();
    const f = fileOf(st, GID, KFILE);
    const a = f.status?.['oA-1']; const b = f.status?.['oB-1'];
    return a?.ackRev === 1 && b?.ackRev === 1 && a.items?.p1?.state === 'storno' && b.items?.p1?.state === 'storno' && { st, f, a, b };
  }, 'beide Positionen storniert');
  check(/Vorrat nicht ausreichend/.test(stc.a.items.p1.reason) && /Bitte erneut bestellen/.test(stc.b.items.p1.reason), 'Grund „Vorrat nicht ausreichend …“');
  check(+stc.f.menu.dishes['vd-polvorones'].ready.s1 === 3, 'Vorrat unverändert (3)');
  const stLog = await until(async () => { const l = (await state()).notifyLog.filter((n) => n.title === 'Storniert: Polvorones'); return l.length >= 2 && l; }, 'Storno-Meldungen');
  check(stLog.some((n) => n.to.deviceIds[0] === 'oA') && stLog.some((n) => n.to.deviceIds[0] === 'oB') && stLog.every((n) => /Vorrat nicht ausreichend/.test(n.body)), 'Meldung an beide Geräte mit Grund');

  log('Einzelbestellung im Rahmen des Vorrats');
  const oA2 = ord('oA-2', 'oA', 'Arbeitszimmer', [polvo('p1', 2, 2), { ...polvo('p2', 1, 0), sizeId: 's3', sizeName: '5 Stück' }]);
  await patchGist(GID, { 'dev-oA.json': { content: devDoc('oA', 'Arbeitszimmer', [oA1, oA2]) } });
  const stA = await until(async () => {
    const f = fileOf(await state(), GID, KFILE);
    return f.status?.['oA-2']?.items?.p1?.fromStock === 2 && f;
  }, 'Abbuchung');
  check(+stA.menu.dishes['vd-polvorones'].ready.s1 === 1, 'Vorrat abgebucht (3 → 1)');
  check(stA.status['oA-2'].items.p1.state !== 'storno', 'Position nicht storniert');
  await page.locator('.k-order[data-order="oA-2"] .k-stock', { hasText: 'Vorrat' }).waitFor({ timeout: 8000 })
    .then(() => check(true, 'Karte zeigt Badge „Vorrat“'), () => check(false, 'Karte zeigt Badge „Vorrat“'));
  await shot(page, 'ipad-light-18-bestellung-vorrat');
  await page.locator('.k-order[data-order="oA-2"]').click();
  await ds.waitFor();
  check(await ds.locator('.k-istock', { hasText: 'keine Zubereitung erforderlich' }).count() === 1, 'Detailblatt: aus dem Vorrat entnommen');
  await shot(page, 'ipad-light-19-detail-vorrat');
  await closeSheet(page, 'k-order-sheet');

  log('Abbestellung bucht zurück');
  const oA2b = structuredClone(oA2);
  oA2b.rev = 2; oA2b.items[0].cancelled = true; oA2b.items[0].cancelledAt = Date.now(); oA2b.changes = [{ at: Date.now(), text: 'Polvorones (1 Stück) abbestellt' }];
  await patchGist(GID, { 'dev-oA.json': { content: devDoc('oA', 'Arbeitszimmer', [oA1, oA2b]) } });
  const stR = await until(async () => {
    const f = fileOf(await state(), GID, KFILE);
    return f.status?.['oA-2']?.items?.p1?.stockReturned === true && f;
  }, 'Rückbuchung');
  check(+stR.menu.dishes['vd-polvorones'].ready.s1 === 3, 'Vorrat zurückgebucht (1 → 3)');

  log('Storno durch die Küche bucht zurück');
  const oA3 = ord('oA-3', 'oA', 'Arbeitszimmer', [polvo('p1', 1, 1)]);
  await patchGist(GID, { 'dev-oA.json': { content: devDoc('oA', 'Arbeitszimmer', [oA1, oA2b, oA3]) } });
  await until(async () => fileOf(await state(), GID, KFILE).status?.['oA-3']?.items?.p1?.fromStock === 1, 'Abbuchung oA-3');
  check((await readyOf('vd-polvorones', 's1')) === 2, 'Vorrat 3 → 2');
  await page.locator('.k-order[data-order="oA-3"]').click();
  await ds.waitFor();
  await ds.locator('.k-item').nth(0).getByRole('button', { name: 'Storno' }).click();
  await alertInput(page, '', 'Stornieren');
  await until(async () => fileOf(await state(), GID, KFILE).status?.['oA-3']?.items?.p1?.stockReturned === true, 'Rückbuchung nach Küchen-Storno');
  check((await readyOf('vd-polvorones', 's1')) === 3, 'Vorrat 2 → 3 nach Storno durch die Küche');
  await closeSheet(page, 'k-order-sheet');

  // ---------- Offline ----------
  log('Offline');
  await nav(page, 'orders');
  offlinePhase = true;
  await fetch(`http://localhost:${PORT}/__offline`, { method: 'POST', body: JSON.stringify({ on: true }) });
  await page.locator('.offline-band:not([hidden])').waitFor({ timeout: 15000 });
  check(true, 'Offline-Band erscheint');
  check((await page.locator('.conn.offline').count()) === 1, 'Verbindungsanzeige „Offline“');
  await shot(page, 'ipad-light-14-offline');
  await fetch(`http://localhost:${PORT}/__offline`, { method: 'POST', body: JSON.stringify({ on: false }) });
  await page.locator('.offline-band[hidden]').waitFor({ state: 'attached', timeout: 15000 });
  await sleep(500);
  offlinePhase = false;
  check(true, 'Offline-Band verschwindet wieder');

  // ---------- Dunkel ----------
  log('Dunkelmodus iPad');
  await page.emulateMedia({ colorScheme: 'dark' });
  await sleep(300);
  await shot(page, 'ipad-dark-02-bestellungen');
  await page.locator('.k-order[data-order="oTEST-3"]').click();
  await ds.waitFor();
  await shot(page, 'ipad-dark-09-detail');
  await closeSheet(page, 'k-order-sheet');
  await nav(page, 'dishes');
  await shot(page, 'ipad-dark-03-gerichte');
  await page.locator('.k-dish', { hasText: 'Mojito' }).click();
  await page.locator(sheetSel('k-recipe-sheet')).waitFor();
  await shot(page, 'ipad-dark-04-rezept');
  await page.locator(sheetSel('k-recipe-sheet')).getByRole('button', { name: 'Bearbeiten' }).click();
  await ed.waitFor();
  await shot(page, 'ipad-dark-05-gericht-bearbeiten');
  await ed.locator('.sheet-body').evaluate((b) => { b.scrollTop = 520; });
  await shot(page, 'ipad-dark-06-gericht-bearbeiten-zutaten');
  await closeSheet(page, 'k-editor-sheet');
  await nav(page, 'ingredients');
  await shot(page, 'ipad-dark-08-zutaten');
  await nav(page, 'settings');
  await shot(page, 'ipad-dark-13-einstellungen');
  await page.emulateMedia({ colorScheme: 'light' });

  // kleines iPad
  await page.setViewportSize({ width: 1133, height: 744 });
  await nav(page, 'orders');
  await shot(page, 'ipad-mini-light-02-bestellungen');
  await page.setViewportSize({ width: 744, height: 1133 });
  await sleep(300);
  await shot(page, 'ipad-mini-hoch-light-02-bestellungen');
  await page.setViewportSize({ width: 1180, height: 820 });

  // ---------- iPhone (zweites Küchengerät) ----------
  log('iPhone');
  const phone = await browser.newContext({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, locale: 'de-DE', timezoneId: 'Europe/Berlin' });
  await phone.addInitScript((s) => {
    if (!localStorage.getItem('tafel.settings.kitchen')) localStorage.setItem('tafel.settings.kitchen', JSON.stringify(s));
  }, { ...settings, deviceId: 'kPHONE', deviceName: 'Küche iPhone' });
  const p2 = await phone.newPage();
  watch(p2, 'iPhone');
  await p2.goto(APP);
  await p2.locator('.k-order[data-order="oTEST-3"]').waitFor({ timeout: 15000 });
  check(await p2.locator('.k-tabbar').isVisible(), 'iPhone: Tab-Leiste sichtbar');
  check(!(await p2.locator('.k-sidebar').isVisible()), 'iPhone: keine Seitenleiste');
  check(await p2.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'iPhone: kein horizontales Scrollen');
  await sleep(500);
  await shot(p2, 'iphone-light-02-bestellungen');
  await p2.locator('.k-order[data-order="oTEST-3"]').click();
  await p2.locator(sheetSel('k-order-sheet')).waitFor();
  await shot(p2, 'iphone-light-09-detail');
  await closeSheet(p2, 'k-order-sheet');
  await nav(p2, 'dishes');
  await shot(p2, 'iphone-light-03-gerichte');
  await p2.locator('.k-dish', { hasText: 'Mojito' }).click();
  await p2.locator(sheetSel('k-recipe-sheet')).waitFor();
  await shot(p2, 'iphone-light-04-rezept');
  await p2.locator(sheetSel('k-recipe-sheet')).getByRole('button', { name: 'Bearbeiten' }).click();
  await p2.locator(sheetSel('k-editor-sheet')).waitFor();
  await shot(p2, 'iphone-light-05-gericht-bearbeiten');
  await p2.locator(sheetSel('k-editor-sheet')).locator('.sheet-body').evaluate((b) => { b.scrollTop = 640; });
  await shot(p2, 'iphone-light-06-gericht-bearbeiten-zutaten');
  await closeSheet(p2, 'k-editor-sheet');
  await nav(p2, 'ingredients');
  await shot(p2, 'iphone-light-08-zutaten');
  await nav(p2, 'settings');
  await shot(p2, 'iphone-light-13-einstellungen');
  await p2.emulateMedia({ colorScheme: 'dark' });
  await nav(p2, 'orders');
  await shot(p2, 'iphone-dark-02-bestellungen');
  await p2.locator('.k-order[data-order="oTEST-3"]').click();
  await p2.locator(sheetSel('k-order-sheet')).waitFor();
  await shot(p2, 'iphone-dark-09-detail');
  await closeSheet(p2, 'k-order-sheet');
  await nav(p2, 'dishes');
  await shot(p2, 'iphone-dark-03-gerichte');
  await nav(p2, 'ingredients');
  await shot(p2, 'iphone-dark-08-zutaten');

  // zweite Küche: Geräteliste
  const devs = await until(async () => {
    const s = await state();
    return s.gists[GID].files['dev-kPHONE.json'] && s;
  }, 'Zweites Küchengerät schreibt eigene Datei');
  check(!!devs, 'Zweites Küchengerät schreibt eigene Datei');

  await browser.close();
  console.log('');
  if (errors.length) { console.log('Konsolenfehler:'); for (const e of errors) console.log('  ', e); }
  check(errors.length === 0, 'Keine Konsolenfehler');
  console.log(failures ? `\n${failures} Prüfung(en) fehlgeschlagen` : '\nAlle Prüfungen bestanden');
  return failures;
}

main().then((f) => { server?.kill(); process.exit(f ? 1 : 0); }, (e) => { console.error(e); console.log(errors.join('\n')); server?.kill(); process.exit(2); });
