// Tests für den Push-Worker: node worker/test.mjs   (Node ≥ 20)
//
// Prüft den fetch-Handler mit In-Memory-KV und abgefangenem fetch. Die Push-Nachricht wird hier
// UNABHÄNGIG (node:crypto, RFC 8291) entschlüsselt und der VAPID-JWT (RFC 8292) unabhängig verifiziert.
//
// Optionaler Gegencheck mit dem npm-Paket http_ece (nicht im Repo):
//   HTTP_ECE=/abs/pfad/node_modules/http_ece node worker/test.mjs

import nodeCrypto from 'node:crypto';
import assert from 'node:assert/strict';
import worker from './worker.js';

const BASE = 'https://tafel-push.beispiel.workers.dev';
const KEY = 'test-haushaltsschluessel-0123456789';

// ---------- Mocks ----------

class MemoryKV {
  constructor() { this.map = new Map(); this.ops = { get: 0, put: 0, delete: 0, list: 0 }; }
  async get(key, type) {
    this.ops.get++;
    const e = this.map.get(key);
    if (!e) return null;
    const t = typeof type === 'object' ? type?.type : type;
    return t === 'json' ? JSON.parse(e.value) : e.value;
  }
  async put(key, value, opts = {}) {
    this.ops.put++;
    if (typeof value !== 'string') throw new Error('Mock erwartet String');
    if (opts.metadata && JSON.stringify(opts.metadata).length > 1024) throw new Error('Metadaten > 1024 Byte');
    this.map.set(key, { value, metadata: opts.metadata ?? null });
  }
  async delete(key) { this.ops.delete++; this.map.delete(key); }
  async list({ prefix = '', cursor, limit = 1000 } = {}) {
    this.ops.list++;
    const names = [...this.map.keys()].filter((k) => k.startsWith(prefix)).sort();
    const start = cursor ? +cursor : 0;
    const page = names.slice(start, start + Math.min(limit, 2)); // kleine Seiten, um die Cursor-Schleife zu testen
    const done = start + page.length >= names.length;
    return {
      keys: page.map((name) => ({ name, ...(this.map.get(name).metadata ? { metadata: this.map.get(name).metadata } : {}) })),
      list_complete: done,
      ...(done ? {} : { cursor: String(start + page.length) }),
    };
  }
}

const captured = [];
const statusFor = new Map(); // endpoint → HTTP-Status
globalThis.fetch = async (input, init = {}) => {
  const url = typeof input === 'string' ? input : input.url;
  const headers = new Headers(init.headers);
  const body = new Uint8Array(await new Response(init.body).arrayBuffer());
  captured.push({ url, method: init.method, headers, body });
  const status = statusFor.get(url) ?? 201;
  return new Response(status === 201 ? null : JSON.stringify({ reason: 'Test' }), { status });
};

const env = { TAFEL_KV: new MemoryKV(), TAFEL_KEY: KEY };

async function call(method, path, body, { key = KEY, origin, headers = {}, envOverride } = {}) {
  const h = new Headers(headers);
  if (key != null) h.set('X-Tafel-Key', key);
  if (body !== undefined) h.set('Content-Type', 'application/json');
  if (origin) h.set('Origin', origin);
  const req = new Request(BASE + path, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) });
  const res = await worker.fetch(req, envOverride || env, { waitUntil() {}, passThroughOnException() {} });
  const text = await res.text();
  let data = text;
  try { data = JSON.parse(text); } catch {}
  return { status: res.status, headers: res.headers, data };
}

// ---------- Unabhängige Kryptografie (node:crypto) ----------

const b64u = (buf) => Buffer.from(buf).toString('base64url');
const unb64u = (s) => Buffer.from(s, 'base64url');
const hmac = (key, data) => nodeCrypto.createHmac('sha256', key).update(data).digest();
// HKDF nach RFC 5869, eine Expand-Runde (≤ 32 Byte)
const hkdf = (salt, ikm, info, len) => hmac(hmac(salt, ikm), Buffer.concat([info, Buffer.from([1])])).subarray(0, len);

/** Simuliertes Browser-Abo: eigenes P-256-Schlüsselpaar und 16 Byte auth. */
function fakeBrowser(host = 'https://web.push.apple.com', id = nodeCrypto.randomBytes(8).toString('hex')) {
  const ecdh = nodeCrypto.createECDH('prime256v1');
  ecdh.generateKeys();
  const auth = nodeCrypto.randomBytes(16);
  return {
    ecdh, auth,
    subscription: { endpoint: `${host}/push/${id}`, expirationTime: null, keys: { p256dh: b64u(ecdh.getPublicKey()), auth: b64u(auth) } },
  };
}

/** Entschlüsselt einen aes128gcm-Body nach RFC 8188/8291 mit den Schlüsseln des Fake-Browsers. */
function decrypt(body, browser) {
  const buf = Buffer.from(body);
  const salt = buf.subarray(0, 16);
  const rs = buf.readUInt32BE(16);
  const idlen = buf[20];
  const asPublic = buf.subarray(21, 21 + idlen);
  const ciphertext = buf.subarray(21 + idlen);
  assert.equal(rs, 4096, 'Record-Size 4096');
  assert.equal(idlen, 65, 'keyid = unkomprimierter P-256-Punkt');
  assert.equal(asPublic[0], 4);
  assert.ok(ciphertext.length <= rs, 'genau ein Record');

  const uaPublic = browser.ecdh.getPublicKey();
  const ecdhSecret = browser.ecdh.computeSecret(asPublic);
  const keyInfo = Buffer.concat([Buffer.from('WebPush: info\0'), uaPublic, asPublic]);
  const ikm = hkdf(browser.auth, ecdhSecret, keyInfo, 32);
  const cek = hkdf(salt, ikm, Buffer.from('Content-Encoding: aes128gcm\0'), 16);
  const nonce = hkdf(salt, ikm, Buffer.from('Content-Encoding: nonce\0'), 12);

  const d = nodeCrypto.createDecipheriv('aes-128-gcm', cek, nonce);
  d.setAuthTag(ciphertext.subarray(-16));
  const record = Buffer.concat([d.update(ciphertext.subarray(0, -16)), d.final()]);
  let end = record.length - 1;
  while (end >= 0 && record[end] === 0) end--; // optionales Null-Padding
  assert.equal(record[end], 2, 'Padding-Trennzeichen 0x02 (letzter Record)');
  return record.subarray(0, end).toString('utf8');
}

/** Prüft den Authorization-Header (RFC 8292) und liefert die Claims. */
function verifyVapid(authHeader, endpoint, expectedK) {
  const m = /^vapid t=([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+), k=([A-Za-z0-9_-]+)$/.exec(authHeader);
  assert.ok(m, `Authorization-Format: ${authHeader}`);
  const [, jwt, k] = m;
  assert.equal(k, expectedK, 'k= entspricht /vapid');
  const raw = unb64u(k);
  assert.equal(raw.length, 65);
  assert.equal(raw[0], 4);
  const [h, p, s] = jwt.split('.');
  const header = JSON.parse(unb64u(h));
  const claims = JSON.parse(unb64u(p));
  assert.deepEqual(header, { typ: 'JWT', alg: 'ES256' });
  const pub = nodeCrypto.createPublicKey({ key: { kty: 'EC', crv: 'P-256', x: b64u(raw.subarray(1, 33)), y: b64u(raw.subarray(33)) }, format: 'jwk' });
  assert.equal(unb64u(s).length, 64, 'ES256-Signatur r||s, 64 Byte');
  assert.ok(nodeCrypto.verify('sha256', Buffer.from(`${h}.${p}`), { key: pub, dsaEncoding: 'ieee-p1363' }, unb64u(s)), 'JWT-Signatur gültig');
  assert.equal(claims.aud, new URL(endpoint).origin, 'aud = Origin des Endpunkts');
  const nowS = Date.now() / 1000;
  assert.ok(claims.exp > nowS + 3600 && claims.exp <= nowS + 86400, 'exp in (1 h, 24 h]');
  assert.match(claims.sub, /^(mailto:[^\s<>]+@[^\s<>]+\.[a-z]{2,}|https:\/\/[^\s<>]+)$/i, 'sub ist mailto: oder https:');
  return claims;
}

// ---------- Tests ----------

let passed = 0;
async function test(name, fn) {
  try { await fn(); passed++; console.log(`ok   ${name}`); }
  catch (e) { console.error(`FAIL ${name}\n${e.stack}`); process.exitCode = 1; }
}

await test('GET / liefert Status ohne Schlüssel', async () => {
  const r = await call('GET', '/', undefined, { key: null });
  assert.equal(r.status, 200);
  assert.match(r.data, /in Betrieb/);
  assert.match(r.data, /TAFEL_KV: verbunden/);
  assert.match(r.data, /TAFEL_KEY: gesetzt/);
});

await test('CORS-Preflight', async () => {
  const req = new Request(BASE + '/notify', { method: 'OPTIONS', headers: { Origin: 'https://beispiel.github.io', 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type,x-tafel-key' } });
  const res = await worker.fetch(req, env, {});
  assert.equal(res.status, 204);
  assert.equal(res.headers.get('Access-Control-Allow-Origin'), '*');
  assert.match(res.headers.get('Access-Control-Allow-Headers'), /X-Tafel-Key/i);
  assert.match(res.headers.get('Access-Control-Allow-Headers'), /Content-Type/i);
  assert.match(res.headers.get('Access-Control-Allow-Methods'), /POST/);

  const env2 = { ...env, ALLOWED_ORIGIN: 'https://beispiel.github.io' };
  const ok = await worker.fetch(new Request(BASE + '/vapid', { method: 'OPTIONS', headers: { Origin: 'https://beispiel.github.io' } }), env2, {});
  assert.equal(ok.headers.get('Access-Control-Allow-Origin'), 'https://beispiel.github.io');
  const other = await worker.fetch(new Request(BASE + '/vapid', { method: 'OPTIONS', headers: { Origin: 'https://fremd.example.com' } }), env2, {});
  assert.notEqual(other.headers.get('Access-Control-Allow-Origin'), 'https://fremd.example.com');
});

await test('401 ohne oder mit falschem Schlüssel (auch mit CORS-Header)', async () => {
  for (const key of [null, '', 'falsch', KEY + 'x', KEY.slice(0, -1)]) {
    for (const [m, p, b] of [['GET', '/vapid'], ['POST', '/subscribe', {}], ['POST', '/notify', {}]]) {
      const r = await call(m, p, b, { key });
      assert.equal(r.status, 401, `${m} ${p} mit ${key}`);
      assert.ok(r.headers.get('Access-Control-Allow-Origin'));
    }
  }
});

let publicKey;
await test('GET /vapid erzeugt Schlüssel einmalig und verwendet ihn wieder', async () => {
  const r1 = await call('GET', '/vapid');
  assert.equal(r1.status, 200);
  publicKey = r1.data.publicKey;
  const raw = unb64u(publicKey);
  assert.equal(raw.length, 65);
  assert.equal(raw[0], 4);
  assert.doesNotMatch(publicKey, /[+/=]/);
  const stored = JSON.parse(env.TAFEL_KV.map.get('vapid').value);
  assert.equal(stored.kty, 'EC');
  assert.equal(stored.crv, 'P-256');
  assert.ok(stored.d && stored.x && stored.y);
  const r2 = await call('GET', '/vapid');
  assert.equal(r2.data.publicKey, publicKey);
  // Auch eine neue Worker-Instanz (ohne Speicher-Cache) liest denselben Schlüssel aus KV
  const fresh = await import('./worker.js?instanz=2');
  const r3 = await fresh.default.fetch(new Request(BASE + '/vapid', { headers: { 'X-Tafel-Key': KEY } }), env, {});
  assert.equal((await r3.json()).publicKey, publicKey);
});

const kitchen = fakeBrowser('https://web.push.apple.com');
const kitchen2 = fakeBrowser('https://fcm.googleapis.com', 'fcm-token-abc');
const order = fakeBrowser('https://updates.push.services.mozilla.com');

await test('POST /subscribe speichert Abos, ein Gerät = ein Abo', async () => {
  const bad = await call('POST', '/subscribe', { deviceId: 'k1', role: 'gast', name: 'x', subscription: kitchen.subscription });
  assert.equal(bad.status, 400);
  const bad2 = await call('POST', '/subscribe', { deviceId: 'k1', role: 'kitchen', name: 'x', subscription: { endpoint: 'http://unsicher/', keys: kitchen.subscription.keys } });
  assert.equal(bad2.status, 400);
  const bad3 = await call('POST', '/subscribe', { deviceId: 'k1', role: 'kitchen', name: 'x', subscription: { endpoint: kitchen.subscription.endpoint, keys: { p256dh: 'abc', auth: 'def' } } });
  assert.equal(bad3.status, 400);

  // erst ein altes Abo, dann überschreiben
  const old = fakeBrowser('https://web.push.apple.com');
  assert.equal((await call('POST', '/subscribe', { deviceId: 'k1', role: 'kitchen', name: 'Küche alt', subscription: old.subscription })).status, 200);
  for (const [deviceId, role, name, b] of [['k1', 'kitchen', 'Küche', kitchen], ['k2', 'kitchen', 'Küche 2', kitchen2], ['o1', 'order', 'Wohnzimmer', order]]) {
    const r = await call('POST', '/subscribe', { deviceId, role, name, subscription: b.subscription });
    assert.equal(r.status, 200, JSON.stringify(r.data));
  }
  const rec = JSON.parse(env.TAFEL_KV.map.get('sub:kitchen:k1').value);
  assert.equal(rec.name, 'Küche');
  assert.equal(rec.subscription.endpoint, kitchen.subscription.endpoint);
  assert.ok(Date.parse(rec.updatedAt) > 0);
  assert.equal([...env.TAFEL_KV.map.keys()].filter((k) => k.startsWith('sub:')).length, 3);
});

const byUrl = (u) => captured.filter((c) => c.url === u);

await test('POST /notify an Rolle: Nutzlast unabhängig entschlüsselt, VAPID verifiziert', async () => {
  captured.length = 0;
  const msg = { to: { role: 'kitchen' }, title: 'Neue Bestellung', body: 'Wohnzimmer: 2× Spaghetti, 1× Tiramisù 🍝', tag: 'order-o1:ab.cd/ef', url: './#/order/x' };
  const r = await call('POST', '/notify', msg);
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.deepEqual(r.data, { sent: 2, failed: 0, removed: 0 });
  assert.equal(captured.length, 2);
  assert.equal(byUrl(order.subscription.endpoint).length, 0, 'Bestellgerät nicht angeschrieben');

  for (const b of [kitchen, kitchen2]) {
    const [c] = byUrl(b.subscription.endpoint);
    assert.ok(c, 'Anfrage an ' + b.subscription.endpoint);
    assert.equal(c.method, 'POST');
    assert.equal(c.headers.get('Content-Encoding'), 'aes128gcm');
    assert.equal(c.headers.get('TTL'), '86400');
    assert.equal(c.headers.get('Urgency'), 'high');
    assert.equal(c.headers.get('Topic'), 'order-o1abcdef');
    assert.equal(c.headers.get('Content-Type'), 'application/octet-stream');
    const plain = decrypt(c.body, b);
    assert.deepEqual(JSON.parse(plain), { title: msg.title, body: msg.body, tag: msg.tag, url: msg.url });
    const claims = verifyVapid(c.headers.get('Authorization'), b.subscription.endpoint, publicKey);
    assert.equal(claims.sub, BASE, 'Standard-sub = eigene https-Adresse des Workers');
  }
});

await test('POST /notify an deviceIds (über beide Rollen), ohne tag kein Topic', async () => {
  captured.length = 0;
  const r = await call('POST', '/notify', { to: { deviceIds: ['o1', 'k2', 'unbekannt'] }, title: 'Nachfrage', body: 'Mit Käse?' });
  assert.deepEqual(r.data, { sent: 2, failed: 0, removed: 0 });
  const [c] = byUrl(order.subscription.endpoint);
  assert.equal(c.headers.get('Topic'), null);
  assert.deepEqual(JSON.parse(decrypt(c.body, order)), { title: 'Nachfrage', body: 'Mit Käse?' });
  verifyVapid(c.headers.get('Authorization'), order.subscription.endpoint, publicKey);
  assert.equal(byUrl(kitchen2.subscription.endpoint).length, 1);
});

await test('VAPID-JWT wird je Push-Dienst wiederverwendet (Apple: max. 1×/h erneuern)', async () => {
  captured.length = 0;
  await call('POST', '/notify', { to: { deviceIds: ['k1'] }, title: 'a', body: '1' });
  await call('POST', '/notify', { to: { deviceIds: ['k1'] }, title: 'b', body: '2' });
  const [a, b] = captured.map((c) => c.headers.get('Authorization'));
  assert.equal(a, b);
  assert.ok(env.TAFEL_KV.map.has('jwt:https://web.push.apple.com'));
});

await test('VAPID_SUBJECT wird übernommen (bereinigt), ungültige Werte werden ersetzt', async () => {
  for (const [subject, expected] of [
    ['mailto:kueche@beispiel.de', 'mailto:kueche@beispiel.de'],
    ['mailto: <kueche@beispiel.de>', 'mailto:kueche@beispiel.de'],
    ['mailto:admin@localhost', BASE],
    ['https://beispiel.github.io/tafel/', 'https://beispiel.github.io/tafel/'],
  ]) {
    const m = await import(`./worker.js?sub=${encodeURIComponent(subject)}`);
    const b = fakeBrowser('https://web.push.apple.com');
    const kv = new MemoryKV();
    kv.map = new Map(env.TAFEL_KV.map); // gleicher VAPID-Schlüssel, aber eigener JWT-Cache
    kv.map.delete('jwt:https://web.push.apple.com');
    const e = { TAFEL_KV: kv, TAFEL_KEY: KEY, VAPID_SUBJECT: subject };
    const f = (p, body) => m.default.fetch(new Request(BASE + p, { method: 'POST', headers: { 'X-Tafel-Key': KEY, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }), e, {});
    await f('/subscribe', { deviceId: 'x1', role: 'order', name: 'X', subscription: b.subscription });
    captured.length = 0;
    const r = await (await f('/notify', { to: { role: 'order' }, title: 't', body: 'b' })).json();
    assert.equal(r.sent, 2);
    const c = byUrl(b.subscription.endpoint)[0];
    assert.equal(verifyVapid(c.headers.get('Authorization'), b.subscription.endpoint, publicKey).sub, expected, subject);
  }
});

await test('Lange Texte werden gekürzt, Nutzlast bleibt ≤ 4096 Byte', async () => {
  captured.length = 0;
  const r = await call('POST', '/notify', { to: { deviceIds: ['o1'] }, title: 'T'.repeat(4000), body: '"'.repeat(1400) + '\u0001'.repeat(300) + 'ä'.repeat(500), url: 'u'.repeat(3000) });
  assert.equal(r.data.sent, 1, JSON.stringify(r.data));
  const [c] = captured;
  assert.ok(c.body.length <= 4096, `Body ${c.body.length} Byte`);
  const msg = JSON.parse(decrypt(c.body, order));
  assert.ok(msg.title.length < 300);
  const big = await call('POST', '/notify', { to: { deviceIds: ['o1'] }, title: 'x', body: 'y'.repeat(20000) });
  assert.equal(big.status, 413);
});

await test('410/404 löscht das Abo, 5xx/403 zählt als Fehler', async () => {
  statusFor.set(kitchen.subscription.endpoint, 410);
  statusFor.set(kitchen2.subscription.endpoint, 403);
  const r = await call('POST', '/notify', { to: { role: 'kitchen' }, title: 'x', body: 'y' });
  assert.equal(r.data.sent, 0);
  assert.equal(r.data.removed, 1);
  assert.equal(r.data.failed, 1);
  assert.equal(r.data.errors[0].status, 403);
  assert.ok(!env.TAFEL_KV.map.has('sub:kitchen:k1'), 'Abo k1 gelöscht');
  assert.ok(env.TAFEL_KV.map.has('sub:kitchen:k2'), 'Abo k2 bleibt');

  statusFor.set(order.subscription.endpoint, 404);
  const r2 = await call('POST', '/notify', { to: { deviceIds: ['o1'] }, title: 'x', body: 'y' });
  assert.deepEqual(r2.data, { sent: 0, failed: 0, removed: 1 });
  assert.ok(!env.TAFEL_KV.map.has('sub:order:o1'));
  statusFor.clear();
});

await test('Netzwerkfehler beim Senden zählt als failed, ohne Absturz', async () => {
  const orig = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error('Verbindung abgebrochen'); };
  try {
    const r = await call('POST', '/notify', { to: { role: 'kitchen' }, title: 'x', body: 'y' });
    assert.equal(r.status, 200);
    assert.equal(r.data.failed, 1);
  } finally { globalThis.fetch = orig; }
});

await test('Ungültige /notify-Anfragen und Konfigurationsfehler', async () => {
  assert.equal((await call('POST', '/notify', { to: {}, title: 'x' })).status, 400);
  assert.equal((await call('POST', '/notify', { to: { role: 'chef' }, title: 'x' })).status, 400);
  assert.deepEqual((await call('POST', '/notify', { to: { role: 'order' }, title: 'x' })).data, { sent: 0, failed: 0, removed: 0 });
  assert.equal((await call('GET', '/notify')).status, 405);
  assert.equal((await call('GET', '/gibtsnicht')).status, 404);
  const r = await call('GET', '/vapid', undefined, { envOverride: { TAFEL_KV: env.TAFEL_KV } });
  assert.equal(r.status, 500);
  assert.match(r.data.error, /TAFEL_KEY/);
  const r2 = await call('GET', '/vapid', undefined, { envOverride: { TAFEL_KEY: KEY } });
  assert.match(r2.data.error, /TAFEL_KV/);
});

// ---------- optionaler Gegencheck mit http_ece ----------
if (process.env.HTTP_ECE) {
  await test('Gegencheck: http_ece entschlüsselt die Nutzlast', async () => {
    const { createRequire } = await import('node:module');
    const ece = createRequire(import.meta.url)(process.env.HTTP_ECE);
    const b = fakeBrowser('https://fcm.googleapis.com');
    await call('POST', '/subscribe', { deviceId: 'ece1', role: 'order', name: 'ECE', subscription: b.subscription });
    captured.length = 0;
    await call('POST', '/notify', { to: { deviceIds: ['ece1'] }, title: 'Gegencheck', body: 'http_ece ✓' });
    const plain = ece.decrypt(Buffer.from(captured[0].body), { version: 'aes128gcm', privateKey: b.ecdh, authSecret: b64u(b.auth) });
    assert.deepEqual(JSON.parse(plain.toString('utf8')), { title: 'Gegencheck', body: 'http_ece ✓' });
  });
} else {
  console.log('--   Gegencheck mit http_ece übersprungen (HTTP_ECE nicht gesetzt)');
}

console.log(`\n${passed} Tests bestanden${process.exitCode ? ', FEHLER siehe oben' : ''}.`);
