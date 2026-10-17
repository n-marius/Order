// Zusammenspiel beider Apps gegen dieselbe (simulierte) Ablage:
// Küche legt Menü an → Bestellgerät bestellt → Küche empfängt und bestätigt → Nachfrage → Antwort → Storno.
// Start: node tests/integration.e2e.mjs

import { chromium } from '/opt/node-tools/node_modules/playwright/index.mjs';
import { spawn } from 'node:child_process';

const PORT = 8104;
const BASE = `http://127.0.0.1:${PORT}`;
const srv = spawn(process.execPath, [new URL('./mock-server.mjs', import.meta.url).pathname, String(PORT)], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 700));

let pass = 0, fail = 0;
const check = (ok, msg) => { ok ? pass++ : fail++; console.log(`${ok ? '  ✓' : '  ✗'} ${msg}`); };
const api = (p, o = {}) => fetch(`${BASE}${p}`, { ...o, headers: { Authorization: 'Bearer t', 'Content-Type': 'application/json' } }).then((r) => r.json());
const until = async (fn, ms = 20000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await fn()) return true; await new Promise((r) => setTimeout(r, 300)); } return false; };

try {
  const g1 = await api('/api/gists', { method: 'POST', body: JSON.stringify({ files: { 'README.md': { content: 'x' } } }) });
  const g2 = await api('/api/gists', { method: 'POST', body: JSON.stringify({ files: { 'README.md': { content: 'x' } } }) });
  const common = { token: 't', gistId: g1.id, imgGistId: g2.id, apiBase: `${BASE}/api`, workerUrl: `${BASE}/worker`, workerKey: 'test', theme: 'system', sound: false };

  const browser = await chromium.launch();
  const errors = [];
  const open = async (role, path, viewport, settings) => {
    const ctx = await browser.newContext({ viewport, serviceWorkers: 'block' });
    await ctx.addInitScript(([k, v]) => { if (!localStorage.getItem(k)) localStorage.setItem(k, v); }, [`tafel.settings.${role}`, JSON.stringify({ ...common, ...settings, role })]);
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(`${role}: ${e.message}`));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(`${role}: ${m.text()}`); });
    await page.goto(`${BASE}${path}`);
    return page;
  };

  console.log('▸ Küche legt Menü an');
  const k = await open('kitchen', '/kueche/', { width: 1180, height: 820 }, { deviceId: 'kREAL', deviceName: 'Küche' });
  await k.waitForFunction(() => window.tafel?.app?.sync);
  await k.evaluate(() => {
    const t = Date.now();
    window.tafel.app.sync.mutate((d) => {
      d.menu.ingredients.i1 = { id: 'i1', name: 'Kaffeebohnen', available: true, updatedAt: t };
      d.menu.ingredients.i2 = { id: 'i2', name: 'Hafermilch', available: false, updatedAt: t };
      d.menu.dishes.d1 = {
        id: 'd1', name: 'Espresso', category: 'getraenk', country: 'IT', description: 'Doppelt', imageId: null, prepMinutes: 2,
        sizes: [], defaultSizeId: null, ingredients: [{ ingredientId: 'i1', unit: 'g', amount: '16', amounts: {} }], steps: ['Mahlen', 'Brühen'],
        options: [{ id: 'o1', name: 'Milch', type: 'single', required: false, choices: [{ id: 'c1', name: 'Hafermilch', ingredientId: 'i2', default: false }] }],
        ice: null, sort: 0, updatedAt: t,
      };
    });
  });
  check(await until(async () => Object.keys((await (await fetch(`${BASE}/__state`)).json()).gists[g1.id].files).includes('dev-kREAL.json')), 'Küchendatei im Gist');

  console.log('▸ Bestellgerät bestellt');
  const o = await open('order', '/bestellen/', { width: 1133, height: 744 }, { deviceId: 'oREAL', deviceName: 'Wohnzimmer' });
  await o.click('.sidebar .sb-item:has-text("Getränke")');
  await o.waitForSelector('[data-dish=d1]', { timeout: 15000 });
  check(true, 'Gericht der Küche erscheint am Bestellgerät');
  await o.click('[data-dish=d1]');
  const sheet = o.locator('.sheet-root.in').last();
  check(await sheet.locator('.chip:has-text("Hafermilch")').isDisabled(), 'Option mit fehlender Zutat gesperrt');
  await sheet.locator('.add-btn').click();
  await o.waitForTimeout(600);
  await o.click('.cart-btn');
  await o.locator('.sheet-root.in .order-btn').click();
  check(await until(async () => {
    const st = await (await fetch(`${BASE}/__state`)).json();
    return Object.keys(st.gists[g1.id].files).includes('dev-oREAL.json');
  }), 'Bestellung im Gist');

  console.log('▸ Küche empfängt');
  check(await until(() => k.evaluate(() => window.tafel.app.view.orders.size === 1)), 'Küche zeigt die Bestellung');
  const orderId = await k.evaluate(() => [...window.tafel.app.view.orders.keys()][0]);
  check(await until(() => k.evaluate((id) => window.tafel.app.view.status.get(id)?.ackRev >= 1, orderId)), 'Küche bestätigt den Empfang (ackRev)');
  await o.click('.sidebar .sb-item:has-text("Meine Bestellungen")');
  check(await until(async () => (await o.locator('text=Von der Küche empfangen').count()) > 0), 'Bestellgerät zeigt „Von der Küche empfangen“');

  console.log('▸ Nachfrage und Antwort');
  await k.evaluate((id) => window.tafel.openOrderSheet(id), orderId);
  await k.locator('.sheet-root.in button:has-text("Nachfrage")').first().click();
  await k.locator('.alert-root input').fill('Mit Zucker?');
  await k.locator('.alert-root button:has-text("Senden")').click();
  check(await until(async () => (await o.locator('text=Mit Zucker?').count()) > 0), 'Nachfrage erscheint am Bestellgerät');
  await o.locator('.chips.quick .chip:has-text("Ja")').first().click();
  await o.locator('button:has-text("Antwort senden")').first().click();
  check(await until(() => k.evaluate((id) => {
    const it = window.tafel.app.view.orders.get(id).items[0];
    return Object.values(it.answers || {}).some((a) => a.quick === 'ja');
  }, orderId)), 'Antwort „Ja“ kommt in der Küche an');

  console.log('▸ Storno durch die Küche');
  await k.locator('.sheet-root.in button:has-text("Storno")').first().click();
  const reasonInput = k.locator('.alert-root input');
  if (await reasonInput.count()) await reasonInput.fill('Bohnen leer');
  await k.locator('.alert-root button').last().click();
  check(await until(async () => (await o.locator('text=Bohnen leer').count()) > 0), 'Storno mit Grund erscheint am Bestellgerät');

  console.log('▸ Mitteilungen');
  const log = (await (await fetch(`${BASE}/__state`)).json()).notifyLog;
  check(log.some((m) => m.to?.role === 'kitchen' && /Neue Bestellung/.test(m.title)), 'Push an die Küche: neue Bestellung');
  check(log.some((m) => m.to?.role === 'kitchen' && /Antwort/.test(m.title)), 'Push an die Küche: Antwort');
  check(log.some((m) => m.to?.deviceIds?.includes('oREAL') && /Nachfrage/.test(m.title)), 'Push ans Bestellgerät: Nachfrage');
  check(log.some((m) => m.to?.deviceIds?.includes('oREAL') && /Storniert/.test(m.title)), 'Push ans Bestellgerät: Storno');
  check(new Set(log.map((m) => m.title + m.body + m.tag)).size === log.length, 'keine doppelten Mitteilungen');

  console.log('▸ Konsole');
  check(errors.length === 0, `keine Konsolenfehler${errors.length ? ': ' + errors.join(' | ') : ''}`);
  await browser.close();
} finally {
  srv.kill();
}
console.log(`\n${pass} bestanden, ${fail} fehlgeschlagen.`);
process.exit(fail ? 1 : 0);
