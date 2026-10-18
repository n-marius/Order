// Testdaten für die App „Bestellen“: legt über die simulierte Gist-API einen Daten- und einen Bilder-Gist an
// und spielt eine Küchendatei dev-kTEST.json mit Menü ein. Fotos werden im Browser per Canvas als JPEG erzeugt.
//
// Verwendung (eigenständig): node tests/bestellen-seed.mjs [port]  → gibt den Einrichtungscode aus.

import { chromium } from '/opt/node-tools/node_modules/playwright/index.mjs';

export const KITCHEN_ID = 'kTEST';
export const KITCHEN_FILE = `dev-${KITCHEN_ID}.json`;

const ING = {
  tomate: 'Tomaten', basilikum: 'Basilikum', brot: 'Ciabatta', olivenoel: 'Olivenöl', knoblauch: 'Knoblauch',
  kichererbsen: 'Kichererbsen', tahini: 'Tahini', pita: 'Pita', miso: 'Misopaste', tofu: 'Tofu', wakame: 'Wakame',
  avocado: 'Avocado', limette: 'Limetten', chili: 'Chili', tortilla: 'Tortilla-Chips',
  spaghetti: 'Spaghetti', guanciale: 'Guanciale', ei: 'Eier', pecorino: 'Pecorino', pfeffer: 'Schwarzer Pfeffer',
  lachs: 'Lachs', reis: 'Reis', teriyaki: 'Teriyaki-Sauce', sesam: 'Sesam',
  reisnudeln: 'Reisnudeln', erdnuss: 'Erdnüsse', garnelen: 'Garnelen', haehnchen: 'Hähnchen', sprossen: 'Sojasprossen',
  kalb: 'Kalbsschnitzel', paniermehl: 'Paniermehl', zitrone: 'Zitronen', kartoffel: 'Kartoffeln',
  mascarpone: 'Mascarpone', espresso: 'Espresso', biskuit: 'Löffelbiskuits', kakao: 'Kakao',
  sahne: 'Sahne', vanille: 'Vanille', zucker: 'Rohrzucker', mango: 'Mango', klebreis: 'Klebreis', kokos: 'Kokosmilch',
  wasser: 'Mineralwasser', minze: 'Minze', soda: 'Soda', hafermilch: 'Hafermilch', milch: 'Milch', matcha: 'Matcha',
  rum: 'Weißer Rum', rumdunkel: 'Dunkler Rum', gin: 'Gin', tonic: 'Tonic Water', gurke: 'Gurke', rosmarin: 'Rosmarin',
  aperol: 'Aperol', prosecco: 'Prosecco', orange: 'Orangen', rotwein: 'Rotwein',
  gyros: 'Gyros', pommes: 'Pommes frites', kartsalat: 'Kartoffelsalat',
};
const MISSING = new Set(['basilikum', 'gurke', 'garnelen', 'pommes', 'kartsalat']);

const r = (ingredientId, amount = '', unit = '') => ({ ingredientId, amount, unit, amounts: {} });
const rs = (ingredientId, unit, amounts) => ({ ingredientId, unit, amount: '', amounts });
const ch = (id, name, ingredientId = null, def = false) => ({ id, name, ingredientId, default: def });

function dishes() {
  let sort = 0;
  const d = (o) => ({
    country: '', description: '', imageId: null, prepMinutes: null, sizes: [], defaultSizeId: null, ingredients: [], steps: [],
    options: [], ice: null, sort: sort++, hidden: false, ...o,
  });
  return [
    // Vorspeisen
    d({ id: 'd-bruschetta', name: 'Bruschetta', category: 'vorspeise', country: 'IT', description: 'Geröstetes Ciabatta mit Tomaten, Knoblauch und Basilikum', ingredients: [r('brot', 4, 'Scheiben'), r('tomate', 2, 'Stk.'), r('basilikum', 6, 'Blätter'), r('knoblauch', 1, 'Zehe'), r('olivenoel', 2, 'EL')], art: ['🍅', '#e9a37a', '#b4482d'] }),
    d({ id: 'd-hummus', name: 'Hummus mit Pita', category: 'vorspeise', country: 'LB', description: 'Cremig, mit Tahini, Olivenöl und warmem Fladenbrot', ingredients: [r('kichererbsen', 200, 'g'), r('tahini', 2, 'EL'), r('pita', 2, 'Stk.'), r('olivenoel', 1, 'EL')], art: ['🫓', '#ecd5a8', '#b88a4a'] }),
    d({ id: 'd-miso', name: 'Misosuppe', category: 'vorspeise', country: 'JP', description: 'Mit Tofu und Wakame', ingredients: [r('miso', 1, 'EL'), r('tofu', 50, 'g'), r('wakame', 2, 'g')], art: ['🍲', '#c9b28d', '#6b4f2c'] }),
    d({ id: 'd-guac', name: 'Guacamole', category: 'vorspeise', country: 'MX', description: 'Frische Avocado, Limette und Tortilla-Chips', ingredients: [r('avocado', 2, 'Stk.'), r('limette', 1, 'Stk.'), r('tortilla', 80, 'g')], options: [{ id: 'o-schaerfe', name: 'Schärfe', type: 'single', required: true, choices: [ch('c-mild', 'Mild', null, true), ch('c-scharf', 'Scharf', 'chili')] }], art: ['🥑', '#b7cf8a', '#4f7a2c'] }),
    // Hauptspeisen
    d({ id: 'd-carbonara', name: 'Spaghetti Carbonara', category: 'hauptspeise', country: 'IT', description: 'Mit Guanciale, Ei, Pecorino und schwarzem Pfeffer', prepMinutes: 20, sizes: [{ id: 's-normal', name: 'Normal' }, { id: 's-gross', name: 'Groß' }], defaultSizeId: 's-normal', ingredients: [rs('spaghetti', 'g', { 's-normal': 120, 's-gross': 180 }), rs('guanciale', 'g', { 's-normal': 60, 's-gross': 90 }), rs('ei', 'Stk.', { 's-normal': 2, 's-gross': 3 }), rs('pecorino', 'g', { 's-normal': 30, 's-gross': 45 })], options: [{ id: 'o-extra', name: 'Extras', type: 'multi', required: false, choices: [ch('c-pecorino', 'Extra Pecorino', 'pecorino'), ch('c-pfeffer', 'Extra Pfeffer', 'pfeffer')] }], art: ['🍝', '#f1d9a0', '#c98b32'] }),
    d({ id: 'd-lachs', name: 'Lachs Teriyaki', category: 'hauptspeise', country: 'JP', description: 'Glasierter Lachs auf Reis mit Sesam', ingredients: [r('lachs', 160, 'g'), r('reis', 90, 'g'), r('teriyaki', 3, 'EL'), r('sesam', 1, 'TL')], art: ['🍣', '#f2b8a0', '#c2553a'] }),
    d({ id: 'd-padthai', name: 'Pad Thai', category: 'hauptspeise', country: 'TH', description: 'Gebratene Reisnudeln mit Erdnüssen und Sojasprossen', ingredients: [r('reisnudeln', 120, 'g'), r('erdnuss', 20, 'g'), r('sprossen', 40, 'g'), r('limette', 0.5, 'Stk.')], options: [{ id: 'o-protein', name: 'Protein', type: 'single', required: true, choices: [ch('c-tofu', 'Tofu', 'tofu'), ch('c-garnelen', 'Garnelen', 'garnelen'), ch('c-huhn', 'Hähnchen', 'haehnchen')] }], art: ['🍜', '#f3c98b', '#c0702a'] }),
    d({ id: 'd-schnitzel', name: 'Wiener Schnitzel', category: 'hauptspeise', country: 'AT', description: 'Kalbsschnitzel mit Zitrone und Kartoffelsalat', sizes: [{ id: 's-kind', name: 'Kinderportion' }, { id: 's-normal', name: 'Normal' }], defaultSizeId: 's-normal', ready: { 's-kind': 0, 's-normal': 2 }, ingredients: [rs('kalb', 'g', { 's-kind': 100, 's-normal': 180 }), rs('paniermehl', 'g', { 's-kind': 30, 's-normal': 50 }), rs('zitrone', 'Stk.', { 's-kind': 0.25, 's-normal': 0.5 }), rs('kartoffel', 'g', { 's-kind': 100, 's-normal': 200 })], art: ['🍋', '#f6e4a2', '#d0a63a'] }),
    d({ id: 'd-gyros', name: 'Gyros-Teller', category: 'hauptspeise', country: 'GR', description: 'Mit Tzatziki und Beilage nach Wahl', ingredients: [r('gyros', 200, 'g'), r('pita', 1, 'Stk.')], options: [{ id: 'o-beilage', name: 'Beilage', type: 'single', required: true, choices: [ch('c-pommes', 'Pommes frites', 'pommes'), ch('c-kartsalat', 'Kartoffelsalat', 'kartsalat')] }], art: ['🥙', '#e8c79a', '#9c6a35'] }),
    // Desserts
    d({ id: 'd-tiramisu', name: 'Tiramisu', category: 'dessert', country: 'IT', description: 'Mascarpone, Espresso und Kakao', ready: { _: 3 }, ingredients: [r('mascarpone', 100, 'g'), r('espresso', 1, 'Tasse'), r('biskuit', 4, 'Stk.'), r('kakao', 1, 'TL')], art: ['🍰', '#e8cfb2', '#8a5a3a'] }),
    d({ id: 'd-creme', name: 'Crème brûlée', category: 'dessert', country: 'FR', description: 'Vanillecreme mit karamellisierter Kruste', ingredients: [r('sahne', 150, 'ml'), r('vanille', 0.5, 'Schote'), r('ei', 2, 'Stk.'), r('zucker', 1, 'EL')], art: ['🍮', '#f4dca0', '#c08a2a'] }),
    d({ id: 'd-mango', name: 'Mango Sticky Rice', category: 'dessert', country: 'TH', description: 'Klebreis mit Kokosmilch und frischer Mango', ingredients: [r('klebreis', 80, 'g'), r('kokos', 80, 'ml'), r('mango', 0.5, 'Stk.')], art: ['🥭', '#f7c96b', '#d9822b'] }),
    // Getränke
    d({ id: 'd-limo', name: 'Zitronenlimonade', category: 'getraenk', country: 'DE', description: 'Hausgemacht mit frischer Minze', sizes: [{ id: 's-03', name: '0,3 l' }, { id: 's-05', name: '0,5 l' }], defaultSizeId: 's-03', ready: { 's-03': 2 }, ingredients: [rs('zitrone', 'Stk.', { 's-03': 1, 's-05': 1.5 }), rs('soda', 'ml', { 's-03': 250, 's-05': 420 }), rs('zucker', 'EL', { 's-03': 1, 's-05': 2 })], ice: { default: true }, art: ['🍋', '#fbe9a0', '#e2b93b'] }),
    d({ id: 'd-espresso', name: 'Espresso', category: 'getraenk', country: 'IT', description: '', ingredients: [r('espresso', 1, 'Tasse')], options: [{ id: 'o-milch', name: 'Milch', type: 'single', required: false, choices: [ch('c-ohne', 'Ohne', null, true), ch('c-milch', 'Mit Milch', 'milch'), ch('c-hafer', 'Mit Hafermilch', 'hafermilch')] }], art: ['☕', '#d8bfa4', '#5d3b22'] }),
    d({ id: 'd-matcha', name: 'Matcha Latte', category: 'getraenk', country: 'JP', description: 'Zeremonieller Matcha mit aufgeschäumter Milch', ingredients: [r('matcha', 2, 'g'), r('milch', 200, 'ml')], ice: { default: false }, options: [{ id: 'o-milchsorte', name: 'Milch', type: 'single', required: true, choices: [ch('c-kuh', 'Kuhmilch', 'milch', true), ch('c-hafer2', 'Hafermilch', 'hafermilch')] }], art: ['🍵', '#cfe0a6', '#6f8f35'] }),
    d({ id: 'd-wasser', name: 'Wasser', category: 'getraenk', country: '', description: 'Still oder sprudelnd', sizes: [{ id: 's-glas', name: 'Glas' }, { id: 's-flasche', name: 'Flasche' }], defaultSizeId: 's-glas', ingredients: [rs('wasser', 'ml', { 's-glas': 250, 's-flasche': 750 })], ice: { default: false }, options: [{ id: 'o-sorte', name: 'Sorte', type: 'single', required: true, choices: [ch('c-still', 'Still', null, true), ch('c-sprudel', 'Sprudelnd')] }], art: ['💧', '#bfe0f2', '#3d8fc2'] }),
    // Alkoholische Getränke
    d({ id: 'd-mojito', name: 'Mojito', category: 'alkohol', country: 'CU', description: 'Rum, Limette, Minze, Rohrzucker und Soda', sizes: [{ id: 's-klein', name: 'Klein' }, { id: 's-gross', name: 'Groß' }], defaultSizeId: 's-gross', ingredients: [rs('rum', 'cl', { 's-klein': 4, 's-gross': 6 }), rs('limette', 'Stk.', { 's-klein': 0.5, 's-gross': 1 }), rs('minze', 'Zweige', { 's-klein': 1, 's-gross': 2 }), rs('zucker', 'TL', { 's-klein': 2, 's-gross': 3 }), rs('soda', 'ml', { 's-klein': 60, 's-gross': 100 })], ice: { default: true }, options: [{ id: 'o-rum', name: 'Rum', type: 'single', required: true, choices: [ch('c-weiss', 'Weiß', 'rum', true), ch('c-dunkel', 'Dunkel', 'rumdunkel')] }, { id: 'o-extras', name: 'Extras', type: 'multi', required: false, choices: [ch('c-limette', 'Extra Limette', 'limette'), ch('c-gurke', 'Gurke', 'gurke'), ch('c-minze', 'Extra Minze', 'minze')] }], art: ['🍹', '#c7e6b0', '#3f8f4a'] }),
    d({ id: 'd-gintonic', name: 'Gin Tonic', category: 'alkohol', country: 'GB', description: 'London Dry Gin mit Tonic Water', ingredients: [r('gin', 4, 'cl'), r('tonic', 150, 'ml')], ice: { default: true }, options: [{ id: 'o-garnitur', name: 'Garnitur', type: 'single', required: false, choices: [ch('c-gurke2', 'Gurke', 'gurke'), ch('c-zitrone', 'Zitrone', 'zitrone', true), ch('c-rosmarin', 'Rosmarin', 'rosmarin')] }], art: ['🍸', '#cfe3ee', '#4a7d99'] }),
    d({ id: 'd-spritz', name: 'Aperol Spritz', category: 'alkohol', country: 'IT', description: 'Aperol, Prosecco, Soda und eine Orangenscheibe', ingredients: [r('aperol', 6, 'cl'), r('prosecco', 9, 'cl'), r('soda', 3, 'cl'), r('orange', 1, 'Scheibe')], ice: { default: true }, art: ['🍊', '#f9c08a', '#e0662a'] }),
    d({ id: 'd-rotwein', name: 'Rotwein', category: 'alkohol', country: 'FR', description: 'Bordeaux, trocken', sizes: [{ id: 's-01', name: '0,1 l' }, { id: 's-02', name: '0,2 l' }], defaultSizeId: 's-02', ingredients: [rs('rotwein', 'l', { 's-01': 0.1, 's-02': 0.2 })], art: ['🍷', '#d9a3a8', '#7a1f2c'] }),
  ];
}

async function api(base, method, path, body) {
  const res = await fetch(`${base}/api${path}`, { method, headers: { Authorization: 'Bearer test', 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  if (!res.ok) throw new Error(`${method} ${path}: ${res.status}`);
  return res.json();
}

/** JPEG-Data-URLs je Gericht im Browser zeichnen (Teller mit Emoji auf Farbverlauf). */
async function renderPhotos(browser, list) {
  const page = await browser.newPage();
  const out = await page.evaluate(async (items) => {
    const res = {};
    for (const { id, art: [emoji, c1, c2] } of items) {
      const c = document.createElement('canvas');
      c.width = 720; c.height = 540;
      const g = c.getContext('2d');
      const bg = g.createLinearGradient(0, 0, 720, 540);
      bg.addColorStop(0, c1); bg.addColorStop(1, c2);
      g.fillStyle = bg; g.fillRect(0, 0, 720, 540);
      const glow = g.createRadialGradient(220, 120, 10, 220, 120, 520);
      glow.addColorStop(0, 'rgba(255,255,255,0.45)'); glow.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = glow; g.fillRect(0, 0, 720, 540);
      // Teller
      g.save();
      g.shadowColor = 'rgba(0,0,0,0.28)'; g.shadowBlur = 50; g.shadowOffsetY = 22;
      g.beginPath(); g.ellipse(360, 285, 205, 205, 0, 0, Math.PI * 2);
      const plate = g.createRadialGradient(330, 240, 30, 360, 285, 210);
      plate.addColorStop(0, '#ffffff'); plate.addColorStop(0.75, '#f3f1ee'); plate.addColorStop(1, '#dedad4');
      g.fillStyle = plate; g.fill();
      g.restore();
      g.beginPath(); g.ellipse(360, 285, 150, 150, 0, 0, Math.PI * 2);
      g.strokeStyle = 'rgba(0,0,0,0.06)'; g.lineWidth = 3; g.stroke();
      g.font = '200px "Noto Color Emoji", "Apple Color Emoji", sans-serif';
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.save(); g.shadowColor = 'rgba(0,0,0,0.25)'; g.shadowBlur = 18; g.shadowOffsetY = 8;
      g.fillText(emoji, 360, 295);
      g.restore();
      res[id] = c.toDataURL('image/jpeg', 0.82);
    }
    return res;
  }, list.map((d) => ({ id: d.id, art: d.art })));
  await page.close();
  return out;
}

/**
 * @param {string} base  z. B. http://localhost:8102
 * @returns {{ gistId, imgGistId, code, kitchenDoc }}
 */
export async function seed(base, browser) {
  const a = await api(base, 'POST', '/gists', { description: 'Tafel – Daten', public: false, files: { 'README.md': { content: '# Tafel' } } });
  const b = await api(base, 'POST', '/gists', { description: 'Tafel – Fotos', public: false, files: { 'README.md': { content: '# Tafel' } } });
  const t = Date.now();
  const list = dishes();
  // Zubereitungszeiten (Minuten); Espresso, Wasser und Rotwein ohne Angabe
  const PREP = { 'd-bruschetta': 10, 'd-hummus': 5, 'd-miso': 10, 'd-guac': 10, 'd-carbonara': 20, 'd-lachs': 25, 'd-padthai': 15, 'd-schnitzel': 35, 'd-gyros': 20, 'd-tiramisu': 5, 'd-creme': 90, 'd-mango': 180, 'd-limo': 5, 'd-matcha': 5, 'd-mojito': 5, 'd-gintonic': 3, 'd-spritz': 3 };
  for (const d of list) d.prepMinutes = PREP[d.id] ?? null;
  const photos = await renderPhotos(browser, list);
  const imgFiles = {};
  const dishMap = {};
  for (const d of list) {
    const imageId = `i${d.id.slice(2)}`;
    imgFiles[`img-${imageId}.txt`] = { content: photos[d.id] };
    const { art, ...rest } = d;
    dishMap[d.id] = { ...rest, imageId: d.id === 'd-espresso' ? null : imageId, updatedAt: t };
  }
  await api(base, 'PATCH', `/gists/${b.id}`, { files: imgFiles });
  const ingredients = Object.fromEntries(Object.entries(ING).map(([id, name]) => [id, { id, name, available: !MISSING.has(id), updatedAt: t }]));
  const kitchenDoc = {
    v: 1,
    device: { id: KITCHEN_ID, name: 'Küche', role: 'kitchen', updatedAt: t, heartbeat: t },
    menu: { ingredients, dishes: dishMap },
    status: {},
  };
  await api(base, 'PATCH', `/gists/${a.id}`, { files: { [KITCHEN_FILE]: { content: JSON.stringify(kitchenDoc) } } });
  const code = setupCode({ t: 'test-token', g: a.id, i: b.id, w: `${base}/worker`, k: 'test', a: `${base}/api` });
  return { gistId: a.id, imgGistId: b.id, code, kitchenDoc };
}

export function setupCode(o) {
  return 'TAFEL1:' + Buffer.from(JSON.stringify(o), 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const port = +process.argv[2] || 8102;
  const browser = await chromium.launch();
  const r = await seed(`http://localhost:${port}`, browser);
  await browser.close();
  console.log(JSON.stringify({ gistId: r.gistId, imgGistId: r.imgGistId, code: r.code }, null, 2));
}
