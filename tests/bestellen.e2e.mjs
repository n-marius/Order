// End-to-End-Test der App „Bestellen“ gegen den Testserver (simulierte Gist-API und Push-Worker).
//
//   node tests/bestellen.e2e.mjs            (startet den Testserver auf Port 8102 bei Bedarf selbst)
//   SHOTS=/pfad node tests/bestellen.e2e.mjs  → Screenshots in diesen Ordner
//
// Die App wird über http://127.0.0.1:8102 geladen, die API über http://localhost:8102/api. So bleiben API-Aufrufe
// für den Service Worker fremd (er cacht nur Anfragen an den eigenen Ursprung, siehe shared/sw-core.js).

import { chromium } from '/opt/node-tools/node_modules/playwright/index.mjs';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { seed, KITCHEN_FILE } from './bestellen-seed.mjs';

const PORT = 8102;
const BASE = `http://localhost:${PORT}`;
const APP = `http://127.0.0.1:${PORT}/bestellen/`;
const SHOTS = process.env.SHOTS || '/tmp/claude-0/-home-user-Order/2726aa99-9e57-5fa4-b2f7-86abc000dd52/scratchpad/bestellen';
fs.mkdirSync(SHOTS, { recursive: true });

const IPAD = { viewport: { width: 1133, height: 744 }, deviceScaleFactor: 2, hasTouch: true };
const IPHONE = { viewport: { width: 393, height: 852 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true };

// ---------- Hilfen ----------

let failures = 0;
let passes = 0;
function check(cond, msg) {
  if (cond) { passes++; console.log(`  ✓ ${msg}`); } else { failures++; console.log(`  ✗ ${msg}`); }
}
const step = (t) => console.log(`\n▸ ${t}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function until(fn, { timeout = 15000, label = 'Bedingung' } = {}) {
  const t0 = Date.now();
  let last;
  while (Date.now() - t0 < timeout) {
    try { last = await fn(); if (last) return last; } catch (e) { last = e; }
    await sleep(250);
  }
  throw new Error(`Zeitüberschreitung: ${label}`);
}

const state = async () => (await fetch(`${BASE}/__state`)).json();
async function files(gistId) { return (await state()).gists[gistId].files; }
async function deviceDoc(gistId, deviceId) {
  const f = (await files(gistId))[`dev-${deviceId}.json`];
  return f ? JSON.parse(f) : null;
}
async function kitchen(gistId, mutate) {
  const doc = JSON.parse((await files(gistId))[KITCHEN_FILE]);
  mutate(doc);
  doc.device.updatedAt = Date.now();
  const res = await fetch(`${BASE}/api/gists/${gistId}`, {
    method: 'PATCH', headers: { Authorization: 'Bearer test', 'Content-Type': 'application/json' },
    body: JSON.stringify({ files: { [KITCHEN_FILE]: { content: JSON.stringify(doc) } } }),
  });
  if (!res.ok) throw new Error('Küche schreiben fehlgeschlagen');
}
const notifies = async () => (await state()).notifyLog;
const offline = (on) => fetch(`${BASE}/__offline`, { method: 'POST', body: JSON.stringify({ on }) });

async function ensureServer() {
  try { await fetch(`${BASE}/__state`); return null; } catch {}
  const p = spawn(process.execPath, [path.join(path.dirname(new URL(import.meta.url).pathname), 'mock-server.mjs'), String(PORT)], { stdio: 'ignore' });
  await until(async () => { try { await fetch(`${BASE}/__state`); return true; } catch { return false; } }, { label: 'Testserver' });
  return p;
}

let expectNetErrors = false;
const consoleErrors = [];
function watchConsole(page, name) {
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    if (expectNetErrors && /net::ERR|Failed to load resource|Failed to fetch/.test(m.text())) return;
    consoleErrors.push(`[${name}] ${m.text()}`);
  });
  page.on('pageerror', (e) => consoleErrors.push(`[${name}] ${e.message}`));
}

async function shot(page, name) {
  await page.waitForTimeout(500); // laufende Übergänge abwarten
  await page.screenshot({ path: path.join(SHOTS, `${name}.png`) });
}
const topSheet = (page) => page.locator('.sheet-root.in').last();

async function setup(page, room, code) {
  await page.goto(APP);
  await page.waitForSelector('.setup');
  await page.fill('input[aria-label=Raumname]', room);
  await page.fill('textarea[aria-label=Einrichtungscode]', code);
  await page.click('.setup .btn.block');
  await page.waitForSelector('.dish-card');
  return page.evaluate(() => JSON.parse(localStorage.getItem('tafel.settings.order')).deviceId);
}

async function openCategory(page, name, compact = false) {
  if (compact) await page.click(`.cat-pill:has-text("${name}")`);
  else await page.click(`.sidebar .sb-item:has-text("${name}")`);
  await page.waitForTimeout(450);
}

async function addToCart(page) {
  const sh = topSheet(page);
  await sh.locator('.add-btn').click();
  await page.waitForSelector('.sheet-root.in', { state: 'detached' }).catch(() => {});
  await page.waitForTimeout(450);
}

const cartCount = (page) => page.locator('.cart-btn .count').textContent();
const toastWith = (page, tone, text) => page.waitForSelector(`.toast.${tone}:has-text("${text}")`, { timeout: 15000 });
async function dismissToasts(page) {
  await page.evaluate(() => document.querySelectorAll('.toast').forEach((t) => t.remove()));
}

// ---------- Ablauf ----------

const server = await ensureServer();
await fetch(`${BASE}/__reset`, { method: 'POST' });
const browser = await chromium.launch();
let exitCode = 0;

try {
  step('Testdaten anlegen');
  const S = await seed(BASE, browser);
  check(!!S.gistId && !!S.imgGistId, `Gists angelegt (${S.gistId}, ${S.imgGistId})`);

  // ================= iPad quer, hell =================
  const ctx = await browser.newContext({ ...IPAD, colorScheme: 'light' });
  const page = await ctx.newPage();
  page.setDefaultTimeout(15000);
  watchConsole(page, 'iPad');

  step('Einrichtung per Code');
  await page.goto(APP);
  await page.waitForSelector('.setup');
  await shot(page, 'ipad-light-00-setup');
  const deviceId = await setup(page, 'Wohnzimmer', S.code);
  check(/^o/.test(deviceId), `Geräte-ID ${deviceId}`);
  await page.waitForFunction(() => document.querySelectorAll('.dish-photo img').length >= 3);
  await page.waitForTimeout(400);
  await shot(page, 'ipad-light-01-menu');

  step('Menü');
  check(await page.locator('[data-dish=d-bruschetta].unavailable').count() === 1, 'Bruschetta als nicht verfügbar markiert');
  check(await page.locator('[data-dish=d-bruschetta] .dish-na').textContent() === 'Nicht verfügbar', 'Label „Nicht verfügbar“');
  check(await page.locator('[data-dish=d-hummus] .dish-flag').textContent() === '🇱🇧', 'Flagge Libanon in der Ecke');
  check(await page.locator('[data-dish=manual-vorspeise]').count() === 1, 'Karte „Manuell“ vorhanden');
  check(await page.locator('.sidebar .sb-item').count() === 7, 'Seitenleiste: 5 Kategorien + Bestellungen + Einstellungen');

  step('Bruschetta: Blatt öffnet sich, Bestellen gesperrt');
  await page.click('[data-dish=d-bruschetta]');
  let sh = topSheet(page);
  await sh.locator('.add-btn').waitFor();
  check(await sh.locator('.add-btn').isDisabled(), 'Korb-Knopf deaktiviert');
  check((await sh.locator('.dish-avail').textContent()).includes('Basilikum'), 'fehlende Zutat genannt');
  await sh.locator('.cfg-disclosure').click();
  check(await sh.locator('.ing-list li.missing').count() === 1, 'Zutatenliste markiert fehlende Zutat');
  await shot(page, 'ipad-light-02-unavailable');
  await sh.locator('.navbar-side.end .barbtn').click();
  await page.waitForTimeout(450);

  step('Mojito konfigurieren');
  await openCategory(page, 'Alkoholische Getränke');
  await page.click('[data-dish=d-mojito]');
  sh = topSheet(page);
  await sh.locator('.add-btn').waitFor();
  check(await sh.locator('.seg button.on:has-text("Groß")').count() === 1, 'Größe vorausgewählt (Groß)');
  check(await sh.locator('.seg button.on:has-text("Mit Eis")').count() === 1, 'Eis vorausgewählt (Mit Eis)');
  check(await sh.locator('.chip.on:has-text("Weiß")').count() === 1, 'Standardoption vorausgewählt (Weiß)');
  check(await sh.locator('.chip:has-text("Gurke")').isDisabled(), 'Option mit fehlender Zutat gesperrt');
  await sh.locator('.seg button:has-text("Ohne Eis")').click();
  await sh.locator('.chip:has-text("Dunkel")').click();
  await sh.locator('.chip:has-text("Extra Limette")').click();
  await sh.locator('textarea').fill('Wenig Zucker');
  await sh.locator('.dish-foot [aria-label=Mehr]').click();
  check(await sh.locator('.dish-foot output').textContent() === '2', 'Anzahl 2');
  await shot(page, 'ipad-light-03-dish');
  await addToCart(page);
  check(await cartCount(page) === '2', 'Warenkorb-Zähler 2');

  step('Pad Thai mit Pflichtoption');
  await openCategory(page, 'Hauptspeisen');
  await page.click('[data-dish=d-padthai]');
  sh = topSheet(page);
  await sh.locator('.add-btn').waitFor();
  check(await sh.locator('.add-btn').isDisabled(), 'ohne Pflichtauswahl gesperrt');
  check(await sh.locator('.chip:has-text("Garnelen")').isDisabled(), 'Garnelen gesperrt');
  await sh.locator('.chip:has-text("Tofu")').click();
  check(!(await sh.locator('.add-btn').isDisabled()), 'nach Auswahl freigegeben');
  await addToCart(page);

  step('Manuell (Anmerkung Pflicht)');
  await openCategory(page, 'Vorspeisen');
  await page.click('[data-dish=manual-vorspeise]');
  sh = topSheet(page);
  await sh.locator('.add-btn').waitFor();
  check(await sh.locator('.add-btn').isDisabled(), 'ohne Beschreibung gesperrt');
  await sh.locator('textarea').fill('Oliven und Brot');
  await addToCart(page);
  check(await cartCount(page) === '4', 'Warenkorb-Zähler 4');

  step('Vorrat: sofort verfügbar');
  await openCategory(page, 'Desserts');
  await page.waitForFunction(() => document.querySelectorAll('.dish-photo img').length >= 3);
  check(await page.locator('[data-dish=d-tiramisu] .ready-badge').count() === 1, 'Badge „Sofort verfügbar“ auf der Karte');
  check(await page.locator('[data-dish=d-tiramisu] .ready-count').textContent() === '3', 'Anzahl 3 im Badge');
  check(await page.locator('[data-dish=d-creme] .ready-badge').count() === 0, 'kein Badge ohne Vorrat');
  check((await page.locator('[data-dish=d-tiramisu] .dish-prep').textContent()) === '5 Min.', 'Zubereitungszeit „5 Min.“ oben links');
  check((await page.locator('[data-dish=d-creme] .dish-prep').textContent()) === '1 Std. 30 Min.', 'Zubereitungszeit „1 Std. 30 Min.“');
  check((await page.locator('[data-dish=d-mango] .dish-prep').textContent()) === '3 Std.', 'Zubereitungszeit „3 Std.“');
  check(await page.locator('[data-dish=manual-dessert] .dish-prep').count() === 0, 'Manuell ohne Zubereitungszeit');
  const prepBox = await page.locator('[data-dish=d-tiramisu] .dish-prep').boundingBox();
  const flagBox = await page.locator('[data-dish=d-tiramisu] .dish-flag').boundingBox();
  check(prepBox.x < flagBox.x && Math.abs(prepBox.y - flagBox.y) < 2, 'Zeit links, Flagge rechts auf gleicher Höhe');
  await page.click('[data-dish=d-creme]');
  await topSheet(page).locator('.dish-meta').waitFor();
  check((await topSheet(page).locator('.dish-meta').textContent()) === 'Zubereitung 1 Std. 30 Min.', 'Feinauswahl: Zubereitungszeit unter dem Namen');
  await topSheet(page).locator('.navbar-side.end .barbtn').click();
  await page.waitForTimeout(450);
  await shot(page, 'ipad-light-02b-ready');
  await openCategory(page, 'Hauptspeisen');
  check(await page.locator('[data-dish=d-schnitzel] .ready-count').textContent() === '2', 'Schnitzel: Badge mit 2');
  check((await page.locator('[data-dish=d-schnitzel] .dish-ready-sizes').textContent()) === 'Normal 2', 'Schnitzel: Vorrat je Größe');
  check(await page.locator('[data-dish=d-gyros].unavailable').count() === 1, 'Gyros: Pflichtauswahl ohne wählbare Option → nicht verfügbar');
  await page.click('[data-dish=d-gyros]');
  sh = topSheet(page);
  await sh.locator('.add-btn').waitFor();
  check((await sh.locator('.dish-avail').textContent()).includes('Beilage: keine Auswahl vorhanden'), 'Gyros: Hinweis „keine Auswahl vorhanden“');
  check(await sh.locator('.add-btn').isDisabled(), 'Gyros: Korb-Knopf gesperrt');
  await sh.locator('.navbar-side.end .barbtn').click();
  await page.waitForTimeout(450);
  await openCategory(page, 'Getränke');
  check((await page.locator('[data-dish=d-limo] .dish-ready-sizes').textContent()) === '0,3 l 2', 'Limonade: Vorrat je Größe auf der Karte');
  await page.click('[data-dish=d-limo]');
  sh = topSheet(page);
  await sh.locator('.add-btn').waitFor();
  check((await sh.locator('.dish-stock').textContent()).includes('2 sofort verfügbar'), 'Feinauswahl: „2 sofort verfügbar“');
  check(await sh.locator('.seg-stock .seg-stock-n').count() === 1 && (await sh.locator('.seg-stock .seg-stock-n').textContent()) === '2 sofort', 'Anzahl je Größe unter dem Segment');
  await sh.locator('.dish-foot [aria-label=Mehr]').click();
  await sh.locator('.dish-foot [aria-label=Mehr]').click();
  check((await sh.locator('.dish-stock-sub').textContent()).includes('Bei 3 Stück: 2 sofort, 1 wird frisch zubereitet.'), 'Hinweis bei größerer Menge');
  await shot(page, 'ipad-light-02c-ready-sheet');
  await sh.locator('.seg button:has-text("0,5 l")').click();
  check((await sh.locator('.dish-stock.none').textContent()).includes('Für diese Größe nichts vorbereitet – wird frisch zubereitet'), 'Größe ohne Vorrat: Hinweis');
  await kitchen(S.gistId, (d) => { d.menu.dishes['d-limo'].ready = { 's-03': 2, 's-05': 4 }; d.menu.dishes['d-limo'].updatedAt = Date.now(); });
  await sh.locator('.dish-stock:not(.none)').waitFor({ timeout: 15000 });
  check((await sh.locator('.dish-stock').textContent()).includes('4 sofort verfügbar'), 'Feinauswahl aktualisiert sich live');
  await sh.locator('.navbar-side.end .barbtn').click();
  await page.waitForTimeout(450);

  step('Warenkorb');
  await dismissToasts(page);
  await page.click('.cart-btn');
  sh = topSheet(page);
  await sh.locator('.cart-row').first().waitFor();
  check(await sh.locator('.cart-row').count() === 3, '3 Positionen');
  await sh.locator('.cart-row:has-text("Pad Thai") [aria-label=Mehr]').click();
  await sh.locator('.cart-row:has-text("Mojito") .cart-main').click();
  const edit = topSheet(page);
  await edit.locator('.dish-sheet .add-btn, .add-btn').first().waitFor();
  await page.waitForTimeout(450);
  await edit.locator('.seg button:has-text("Klein")').click();
  await edit.locator('.add-btn').click();
  await page.waitForTimeout(500);
  sh = topSheet(page);
  check((await sh.locator('.cart-row:has-text("Mojito") .cart-det').textContent()).includes('Klein'), 'Bearbeitung übernommen (Klein)');
  await sh.locator('.cart-note-sec textarea').fill('Bitte zusammen servieren');
  await shot(page, 'ipad-light-04-cart');
  check(await page.evaluate(() => JSON.parse(localStorage.getItem('tafel.cart')).items.length) === 3, 'Warenkorb in localStorage');
  await sh.locator('.order-btn').click();
  await toastWith(page, 'green', 'Bestellung gesendet');
  check(true, 'Bestätigung „Bestellung gesendet“');

  step('Bestellung im Gist und Notify-Log');
  const doc1 = await until(async () => { const d = await deviceDoc(S.gistId, deviceId); return d && Object.keys(d.orders || {}).length === 1 && d; }, { label: 'Bestellung im Gist' });
  const order1 = Object.values(doc1.orders)[0];
  check(order1.items.length === 3 && order1.rev === 1 && order1.note === 'Bitte zusammen servieren', 'Bestellung vollständig (3 Positionen, rev 1, Anmerkung)');
  check(doc1.device.name === 'Wohnzimmer' && order1.deviceName === 'Wohnzimmer', 'Raumname gesetzt');
  const mojito = order1.items.find((i) => i.name === 'Mojito');
  const padthai = order1.items.find((i) => i.name === 'Pad Thai');
  const manual = order1.items.find((i) => i.dishId === 'manual-vorspeise');
  check(mojito.qty === 2 && mojito.sizeName === 'Klein' && mojito.ice === false && mojito.note === 'Wenig Zucker', 'Mojito: 2×, Klein, ohne Eis, Anmerkung');
  check(JSON.stringify(mojito.options) === JSON.stringify({ 'o-rum': ['c-dunkel'], 'o-extras': ['c-limette'] }), 'Mojito: Optionen gespeichert');
  check(mojito.optionLabels.includes('Rum: Dunkel') && mojito.optionLabels.includes('Extras: Extra Limette'), 'Mojito: optionLabels');
  check(padthai.qty === 2 && padthai.options['o-protein'][0] === 'c-tofu', 'Pad Thai: 2×, Tofu');
  check(manual.note === 'Oliven und Brot', 'Manuell: Anmerkung');
  const n1 = await until(async () => (await notifies()).find((n) => n.title === 'Neue Bestellung · Wohnzimmer'), { label: 'Notify neue Bestellung' });
  check(n1.body === '2× Mojito, 2× Pad Thai, 1× Manuell' && n1.to.role === 'kitchen' && n1.tag === order1.id, `Notify: „${n1.body}“`);
  check(await cartCount(page).catch(() => '') === '' || await page.locator('.cart-btn .count').isHidden(), 'Warenkorb geleert');

  step('Küche: Empfang, Storno, Nachfrage');
  await dismissToasts(page);
  const t = Date.now();
  await kitchen(S.gistId, (d) => {
    d.device.heartbeat = t;
    d.status[order1.id] = {
      ackRev: 1, updatedAt: t,
      items: {
        [padthai.id]: { state: 'storno', reason: 'Tofu ist aus', updatedAt: t, questions: [] },
        [mojito.id]: { state: 'neu', reason: '', updatedAt: t, questions: [{ id: 'q1', text: 'Minze ist knapp. Ist Basilikum in Ordnung?', at: t }] },
      },
    };
  });
  await toastWith(page, 'red', 'Storniert: Pad Thai');
  await toastWith(page, 'yellow', 'Nachfrage zu Mojito');
  check(true, 'Banner rot (Storno) und gelb (Nachfrage)');
  check(await page.locator('.sb-badge').textContent() === '2', 'Badge „Meine Bestellungen“ = 2');
  await shot(page, 'ipad-light-05-feedback');
  await page.locator('.toast.yellow').click();
  await page.waitForSelector('.orders-page');
  check(await page.locator(`#order-${order1.id}`).count() === 1, 'Banner öffnet die Bestellung');
  await page.waitForTimeout(800);
  check(await page.locator(`#order-${order1.id} .ack.received`).count() === 1, 'Status „Von der Küche empfangen“');
  check((await page.locator('.oitem.state-storno .ibox').textContent()).includes('Tofu ist aus'), 'Storno rot mit Grund');
  check(await page.locator('.oitem.state-nachfrage .qbox').count() === 1, 'Nachfrage gelb mit Antwortmöglichkeit');
  check(await page.locator('.sb-badge').textContent() === '1', 'Storno gesehen → Badge 1');
  await dismissToasts(page);
  await shot(page, 'ipad-light-06-orders');

  step('Nachfrage beantworten');
  await page.locator('.qbox .chip:has-text("Ja")').click();
  await page.locator('.qbox input').fill('gern mit Limette');
  await page.locator('.qbox .btn:has-text("Antwort senden")').click();
  const doc2 = await until(async () => { const d = await deviceDoc(S.gistId, deviceId); return d?.orders[order1.id].items.find((i) => i.id === mojito.id).answers?.q1 && d; }, { label: 'Antwort im Gist' });
  const ans = doc2.orders[order1.id].items.find((i) => i.id === mojito.id).answers.q1;
  check(ans.quick === 'ja' && ans.text === 'gern mit Limette' && ans.at > 0, 'Antwort gespeichert');
  check(doc2.orders[order1.id].rev === 1 && doc2.orders[order1.id].updatedAt >= ans.at, 'rev unverändert, updatedAt gesetzt');
  const n2 = await until(async () => (await notifies()).find((n) => n.title === 'Antwort von Wohnzimmer'), { label: 'Notify Antwort' });
  check(n2.body === 'Mojito: Ja – gern mit Limette', `Notify: „${n2.body}“`);
  await page.waitForTimeout(500);
  check(await page.locator('.sb-badge').count() === 0, 'Badge verschwunden');

  step('Position ändern (Menge)');
  await dismissToasts(page);
  await page.locator('.oitem:has-text("Manuell") .more-btn').click();
  await page.locator('.action-root.in button:has-text("Position ändern")').click();
  sh = topSheet(page);
  await sh.locator('.add-btn').waitFor();
  await page.waitForTimeout(450);
  await sh.locator('.dish-foot [aria-label=Mehr]').click();
  await sh.locator('.add-btn').click();
  await page.locator('.alert-root.in button:has-text("Senden")').click();
  const doc3 = await until(async () => { const d = await deviceDoc(S.gistId, deviceId); return d?.orders[order1.id].rev === 2 && d; }, { label: 'Änderung im Gist' });
  check(doc3.orders[order1.id].changes.some((c) => c.text === 'Manuell: Menge 1 → 2'), 'Änderungsprotokoll „Manuell: Menge 1 → 2“');
  const n3 = await until(async () => (await notifies()).find((n) => n.title === 'Änderung · Wohnzimmer'), { label: 'Notify Änderung' });
  check(n3.body.includes('Manuell: Menge 1 → 2'), `Notify: „${n3.body}“`);
  await page.waitForSelector(`#order-${order1.id} .ack.changed`);
  check(true, 'Status „Änderung noch nicht empfangen“');
  await kitchen(S.gistId, (d) => { d.status[order1.id].ackRev = 2; d.status[order1.id].updatedAt = Date.now(); });
  await page.waitForSelector(`#order-${order1.id} .ack.received`);

  step('Position abbestellen');
  await page.locator('.oitem:has-text("Mojito") .more-btn').click();
  await page.locator('.action-root.in button:has-text("Position abbestellen")').click();
  await page.locator('.alert-root.in button:has-text("Abbestellen")').click();
  const doc4 = await until(async () => { const d = await deviceDoc(S.gistId, deviceId); return d?.orders[order1.id].rev === 3 && d; }, { label: 'Abbestellung im Gist' });
  const mj = doc4.orders[order1.id].items.find((i) => i.id === mojito.id);
  check(mj.cancelled === true && mj.cancelledAt > 0, 'Mojito abbestellt');
  check(doc4.orders[order1.id].changes.some((c) => c.text === '2× Mojito abbestellt'), 'Protokoll „2× Mojito abbestellt“');
  await kitchen(S.gistId, (d) => { d.status[order1.id].ackRev = 3; });

  step('Küche bestätigt nicht (25 s)');
  await kitchen(S.gistId, (d) => { d.device.heartbeat = Date.now() - 10 * 60000; });
  await openCategory(page, 'Desserts');
  await page.click('[data-dish=d-tiramisu]');
  await topSheet(page).locator('.add-btn').waitFor();
  await page.waitForTimeout(400);
  await topSheet(page).locator('.dish-foot [aria-label=Mehr]').click();
  await addToCart(page);
  await page.click('[data-dish=d-tiramisu]');
  await topSheet(page).locator('.add-btn').waitFor();
  await page.waitForTimeout(400);
  await topSheet(page).locator('textarea').fill('Ohne Kakao');
  await topSheet(page).locator('.dish-foot [aria-label=Mehr]').click();
  await addToCart(page);
  check(await page.evaluate(() => JSON.parse(localStorage.getItem('tafel.cart')).items.map((i) => i.stockQty).join()) === '2,2', 'stockQty beim Hinzufügen = min(Menge, Vorrat)');
  await dismissToasts(page);
  await page.click('.cart-btn');
  const cs = topSheet(page);
  await cs.locator('.cart-row').first().waitFor();
  check((await cs.locator('.cart-row >> nth=0').locator('.stock-line').textContent()) === 'davon 2 sofort verfügbar', 'Warenkorb: „davon 2 sofort verfügbar“');
  check((await cs.locator('.cart-row >> nth=1').locator('.stock-line').textContent()) === 'davon 1 sofort verfügbar', 'Warenkorb: Summe über Positionen begrenzt (davon 1)');
  await shot(page, 'ipad-light-04b-cart-ready');
  await cs.locator('.order-btn').click();
  const doc5 = await until(async () => { const d = await deviceDoc(S.gistId, deviceId); return d && Object.keys(d.orders).length === 2 && d; }, { label: 'zweite Bestellung im Gist' });
  const order2 = Object.values(doc5.orders).find((o) => o.id !== order1.id);
  check(order2.items.map((i) => i.stockQty).join() === '2,1', 'stockQty im Gist neu berechnet (2 und 1)');
  const t25 = Date.now();
  await page.click('.sidebar .sb-item:has-text("Meine Bestellungen")');
  await toastWith(page, 'yellow', 'noch nicht empfangen').catch(() => null);
  await page.waitForSelector('.toast.yellow:has-text("Die Küche hat die Bestellung noch nicht empfangen.")', { timeout: 40000 });
  const waited = (Date.now() - t25) / 1000;
  check(waited >= 20, `Hinweis nach ${waited.toFixed(1)} s`);
  check((await page.locator('.toast.yellow').first().textContent()).includes('Küche offline seit'), 'Banner nennt „Küche offline seit …“');
  await page.waitForSelector(`#order-${order2.id} .order-notice`);
  check((await page.locator(`#order-${order2.id} .order-notice`).textContent()).includes('Küche offline seit'), 'gelber Hinweis in „Meine Bestellungen“');
  check((await page.locator('.main-nav .conn').textContent()).includes('Küche offline'), 'Verbindungspille „Küche offline“');
  await shot(page, 'ipad-light-07-ack-missing');
  await kitchen(S.gistId, (d) => { d.device.heartbeat = Date.now(); d.status[order2.id] = { ackRev: 1, updatedAt: Date.now(), items: {} }; });
  await toastWith(page, 'green', 'jetzt empfangen');
  check(true, 'grüner Banner „Die Küche hat die Bestellung jetzt empfangen.“');
  await page.waitForSelector(`#order-${order2.id} .ack.received`);
  check(await page.locator(`#order-${order2.id} .order-notice`).count() === 0, 'Hinweis verschwunden');
  check(await page.locator(`#order-${order2.id} .oitem-stock`).count() === 2, '„Meine Bestellungen“ zeigt den Vorrat je Position');

  step('Gerät offline');
  await dismissToasts(page);
  expectNetErrors = true;
  await offline(true);
  await page.waitForSelector('.offline-band:not([hidden])', { timeout: 20000 });
  check(true, 'rotes Offline-Band');
  await openCategory(page, 'Getränke');
  await page.waitForFunction(() => document.querySelectorAll('.dish-photo img').length >= 2);
  check(await page.locator('.dish-card').count() === 5, 'Menü aus dem Cache bedienbar');
  await page.click('[data-dish=d-wasser]');
  await topSheet(page).locator('.add-btn').waitFor();
  await page.waitForTimeout(400);
  await addToCart(page);
  await dismissToasts(page);
  await page.click('.cart-btn');
  await topSheet(page).locator('.order-btn').click();
  await toastWith(page, 'gray', 'Bestellung gespeichert');
  check((await page.locator('.toast.gray').textContent()).includes('Sie wird gesendet, sobald eine Verbindung besteht.'), 'Bestätigung offline');
  await shot(page, 'ipad-light-08-offline');
  check(Object.keys((await deviceDoc(S.gistId, deviceId)).orders).length === 2, 'noch nicht im Gist');
  await page.click('.sidebar .sb-item:has-text("Meine Bestellungen")');
  await page.waitForSelector('.ack.sending');
  check(true, 'Status „Wird gesendet …“');
  await offline(false);
  const doc6 = await until(async () => { const d = await deviceDoc(S.gistId, deviceId); return d && Object.keys(d.orders).length === 3 && d; }, { timeout: 25000, label: 'Offline-Bestellung nachgesendet' });
  const order3 = Object.values(doc6.orders).find((o) => o.items[0].name === 'Wasser');
  check(!!order3 && order3.items[0].options['o-sorte'][0] === 'c-still', 'Offline-Bestellung nachgesendet (Wasser, still)');
  await until(async () => (await notifies()).find((n) => n.tag === order3.id), { label: 'Notify nach Wiederverbindung' });
  check(true, 'Mitteilung nach Wiederverbindung gesendet');
  await page.waitForSelector('.offline-band[hidden]', { state: 'attached' });
  expectNetErrors = false;

  step('Position mit Vorrat ändern');
  for (const [nth, btn, label] of [[0, 'Weniger', 'Menge 2 → 1'], [1, 'Mehr', 'Menge 2 → 3']]) {
    await dismissToasts(page);
    await page.locator(`#order-${order2.id} .oitem >> nth=${nth}`).locator('.more-btn').click();
    await page.locator('.action-root.in button:has-text("Position ändern")').click();
    sh = topSheet(page);
    await sh.locator('.add-btn').waitFor();
    await page.waitForTimeout(450);
    check(await sh.locator('.dish-stock').isHidden(), `Ändern (${label}): kein Vorratshinweis`);
    await sh.locator(`.dish-foot [aria-label=${btn}]`).click();
    await sh.locator('.add-btn').click();
    await page.locator('.alert-root.in button:has-text("Senden")').click();
    await page.waitForTimeout(300);
  }
  const docS = await until(async () => { const d = await deviceDoc(S.gistId, deviceId); return d?.orders[order2.id].rev === 3 && d; }, { label: 'Änderungen mit Vorrat im Gist' });
  const [ti1, ti2] = docS.orders[order2.id].items;
  check(ti1.qty === 1 && ti1.stockQty === 1, 'Menge reduziert → stockQty = min(stockQty, Menge) = 1');
  check(ti2.qty === 3 && ti2.stockQty === 1, 'Menge erhöht → stockQty nicht erhöht (1)');

  step('Storno-Grund (Vorrat)');
  await kitchen(S.gistId, (d) => {
    d.status[order2.id] = { ackRev: 3, updatedAt: Date.now(), items: { [ti2.id]: { state: 'storno', reason: 'Vorrat nicht ausreichend: Tiramisu wurde in der Zwischenzeit bereits vergeben', updatedAt: Date.now(), questions: [] } } };
  });
  await toastWith(page, 'red', 'Storniert: Tiramisu');
  await dismissToasts(page);
  const reasonBox = page.locator(`#order-${order2.id} .oitem.state-storno .ibox`);
  await reasonBox.waitFor();
  check((await reasonBox.textContent()).includes('Vorrat nicht ausreichend'), 'Storno-Grund angezeigt');
  const reasonColor = await reasonBox.locator('.grow > div:not(.ibox-title)').evaluate((el) => getComputedStyle(el).color);
  check(!/255, 59, 48/.test(reasonColor), `Grund in Etikettfarbe gut lesbar (${reasonColor})`);
  await reasonBox.scrollIntoViewIfNeeded();
  await shot(page, 'ipad-light-07b-storno-vorrat');

  step('Bestellung stornieren');
  await dismissToasts(page);
  await page.locator(`#order-${order2.id} .link-btn:has-text("Bestellung stornieren")`).click();
  await page.locator('.alert-root.in button:has-text("Stornieren")').click();
  const doc7 = await until(async () => { const d = await deviceDoc(S.gistId, deviceId); return d?.orders[order2.id].cancelled && d; }, { label: 'Storno im Gist' });
  check(doc7.orders[order2.id].rev === 4 && doc7.orders[order2.id].changes.at(-1).text === 'Bestellung storniert', 'rev 4, Protokoll „Bestellung storniert“');
  const n7 = await until(async () => (await notifies()).find((n) => n.title === 'Storniert · Wohnzimmer'), { label: 'Notify Storno' });
  check(n7.tag === order2.id, 'Notify „Storniert · Wohnzimmer“');

  step('Bestellanmerkung ändern');
  await page.locator(`#order-${order3.id} .link-btn:has-text("Anmerkung hinzufügen")`).click();
  sh = topSheet(page);
  await sh.locator('textarea').fill('Bitte mit Zitrone');
  await sh.locator('.barbtn:has-text("Senden")').click();
  const doc8 = await until(async () => { const d = await deviceDoc(S.gistId, deviceId); return d?.orders[order3.id].note === 'Bitte mit Zitrone' && d; }, { label: 'Anmerkung im Gist' });
  check(doc8.orders[order3.id].rev === 2 && doc8.orders[order3.id].changes.at(-1).text === 'Anmerkung zur Bestellung: „Bitte mit Zitrone“', 'Anmerkung geändert, rev 2');
  await dismissToasts(page);
  await page.waitForTimeout(600);
  await shot(page, 'ipad-light-09-orders-final');

  step('Einstellungen und Darstellung');
  await page.click('.sidebar .sb-item:has-text("Einstellungen")');
  await page.waitForSelector('.settings-page');
  check((await page.locator('.settings-page input[aria-label=Raumname]').inputValue()) === 'Wohnzimmer', 'Raumname angezeigt');
  check((await page.locator('.settings-page input[aria-label=Token]').getAttribute('type')) === 'password', 'Token maskiert');
  await shot(page, 'ipad-light-10-settings');
  await page.locator('.settings-page .seg button:has-text("Dunkel")').click();
  check(await page.evaluate(() => document.documentElement.dataset.theme) === 'dark', 'Darstellung Dunkel aktiv');
  await page.waitForTimeout(300);
  await shot(page, 'ipad-dark-10-settings');
  await page.reload();
  await page.waitForSelector('.dish-card, .settings-page, .orders-page');
  check(await page.evaluate(() => document.documentElement.dataset.theme) === 'dark', 'Darstellung bleibt nach Neustart');

  step('Screenshots dunkel');
  await page.click('.sidebar .sb-item:has-text("Alkoholische Getränke")');
  await page.waitForFunction(() => document.querySelectorAll('.dish-photo img').length >= 3);
  await page.waitForTimeout(400);
  await shot(page, 'ipad-dark-01-menu');
  await page.click('[data-dish=d-mojito]');
  await topSheet(page).locator('.add-btn').waitFor();
  await topSheet(page).locator('.cfg-disclosure').click();
  await page.waitForTimeout(500);
  await shot(page, 'ipad-dark-03-dish');
  await addToCart(page);
  await dismissToasts(page);
  await page.click('.cart-btn');
  await page.waitForTimeout(500);
  await shot(page, 'ipad-dark-04-cart');
  await topSheet(page).locator('.barbtn:has-text("Fertig")').click();
  await page.waitForTimeout(450);
  await page.click('.sidebar .sb-item:has-text("Meine Bestellungen")');
  await page.waitForTimeout(500);
  await shot(page, 'ipad-dark-06-orders');
  check(await page.locator('.sb-toggle').isHidden(), 'Umschalter bei sichtbarer Seitenleiste in der Leiste selbst');
  await page.click('.sb-close');
  await page.waitForTimeout(500);
  check(await page.locator('.sidebar.collapsed').count() === 1, 'Seitenleiste eingeklappt');
  await page.click('.sidebar .sb-item:has-text("Hauptspeisen")', { force: true }).catch(() => {});
  await page.reload();
  await page.waitForSelector('.main');
  check(await page.locator('.sidebar.collapsed').count() === 1, 'Zustand der Seitenleiste gemerkt');
  await shot(page, 'ipad-dark-02-collapsed');
  await page.click('.sb-toggle');
  await page.evaluate(() => { const s = JSON.parse(localStorage.getItem('tafel.settings.order')); s.theme = 'system'; localStorage.setItem('tafel.settings.order', JSON.stringify(s)); });
  await ctx.close();

  // ================= iPhone hoch =================
  for (const scheme of ['light', 'dark']) {
    step(`iPhone hoch, ${scheme === 'light' ? 'hell' : 'dunkel'}`);
    const c2 = await browser.newContext({ ...IPHONE, colorScheme: scheme });
    const p2 = await c2.newPage();
    p2.setDefaultTimeout(15000);
    watchConsole(p2, `iPhone-${scheme}`);
    await p2.goto(APP);
    await p2.waitForSelector('.setup');
    if (scheme === 'light') await shot(p2, 'iphone-light-00-setup');
    const dev2 = await setup(p2, scheme === 'light' ? 'Esszimmer' : 'Terrasse', S.code);
    await p2.waitForFunction(() => document.querySelectorAll('.dish-photo img').length >= 3);
    await p2.waitForTimeout(400);
    check(await p2.evaluate(() => document.documentElement.scrollWidth) <= 393, 'kein horizontales Scrollen');
    await shot(p2, `iphone-${scheme}-01-menu`);
    await p2.click('.sb-toggle');
    await p2.waitForTimeout(500);
    check(await p2.locator('.sidebar.open').count() === 1, 'Schublade geöffnet');
    await shot(p2, `iphone-${scheme}-02-drawer`);
    await p2.click('.sidebar .sb-item:has-text("Alkoholische Getränke")');
    await p2.waitForTimeout(500);
    check(await p2.locator('.sidebar.open').count() === 0, 'Schublade nach Auswahl geschlossen');
    await p2.click('[data-dish=d-mojito]');
    await topSheet(p2).locator('.add-btn').waitFor();
    await p2.waitForTimeout(500);
    await shot(p2, `iphone-${scheme}-03-dish`);
    await p2.evaluate(() => { document.querySelector('.sheet-root.in .sheet-body').scrollTop = 4000; });
    await p2.waitForTimeout(400);
    await shot(p2, `iphone-${scheme}-03b-dish-scrolled`);
    await addToCart(p2);
    await openCategory(p2, 'Haupt', true);
    await p2.click('[data-dish=d-carbonara]');
    await topSheet(p2).locator('.add-btn').waitFor();
    await p2.waitForTimeout(400);
    await addToCart(p2);
    await dismissToasts(p2);
    await p2.click('.cart-btn');
    await p2.waitForTimeout(600);
    await shot(p2, `iphone-${scheme}-04-cart`);
    await topSheet(p2).locator('.order-btn').click();
    await until(async () => { const d = await deviceDoc(S.gistId, dev2); return d && Object.keys(d.orders || {}).length === 1; }, { label: 'iPhone-Bestellung im Gist' });
    check(true, 'Bestellung vom iPhone im Gist');
    const o = Object.values((await deviceDoc(S.gistId, dev2)).orders)[0];
    await kitchen(S.gistId, (d) => {
      d.status[o.id] = { ackRev: 1, updatedAt: Date.now(), items: { [o.items[0].id]: { state: 'neu', updatedAt: Date.now(), questions: [{ id: `q-${scheme}`, text: 'Mit Strohhalm?', at: Date.now() }] }, [o.items[1].id]: { state: 'fertig', updatedAt: Date.now(), questions: [] } } };
    });
    await toastWith(p2, 'yellow', 'Nachfrage');
    await dismissToasts(p2);
    check(await p2.locator('.sb-toggle .count').textContent() === '1', 'Zähler am Menü-Knopf');
    await p2.click('.sb-toggle');
    await p2.waitForTimeout(450);
    await p2.click('.sidebar .sb-item:has-text("Meine Bestellungen")');
    await p2.waitForTimeout(600);
    await shot(p2, `iphone-${scheme}-05-orders`);
    check(await p2.evaluate(() => document.documentElement.scrollWidth) <= 393, 'Bestellungen ohne horizontales Scrollen');
    await p2.click('.sb-toggle');
    await p2.waitForTimeout(450);
    await p2.click('.sidebar .sb-item:has-text("Einstellungen")');
    await p2.waitForTimeout(500);
    await shot(p2, `iphone-${scheme}-06-settings`);
    await c2.close();
  }

  step('Konsole');
  check(consoleErrors.length === 0, consoleErrors.length ? `Konsolenfehler:\n    ${consoleErrors.join('\n    ')}` : 'keine Konsolenfehler');
} catch (e) {
  failures++;
  console.log(`\n✗ Abbruch: ${e.stack || e.message}`);
} finally {
  await browser.close();
  server?.kill();
  console.log(`\n${passes} bestanden, ${failures} fehlgeschlagen. Screenshots: ${SHOTS}`);
  exitCode = failures ? 1 : 0;
}
process.exit(exitCode);
