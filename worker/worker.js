// Tafel – Push-Server (Cloudflare Worker, ES-Modul, ohne Abhängigkeiten)
//
// Web Push nach RFC 8030 (Zustellung), RFC 8291 (Verschlüsselung, aes128gcm) und RFC 8292 (VAPID).
// Ausgelegt für Apple (web.push.apple.com, iOS/iPadOS 16.4+), Google FCM, Mozilla und Microsoft (WNS).
//
// Bindings:
//   TAFEL_KV        KV-Namespace (Pflicht)
//   TAFEL_KEY       Secret: Haushaltsschlüssel (Pflicht)
//   VAPID_SUBJECT   optional: Kontakt für die Push-Dienste, "mailto:name@domain.de" oder "https://…"
//   ALLOWED_ORIGIN  optional: erlaubte Herkunft(en) für CORS, z. B. "https://name.github.io"
//                   (mehrere durch Komma getrennt; leer = alle)
//
// Endpunkte (außer GET / und OPTIONS mit Header X-Tafel-Key):
//   GET  /vapid      → { publicKey }
//   POST /subscribe  { deviceId, role, name, subscription }
//   POST /notify     { to: { role?, deviceIds? }, title, body, tag?, url? } → { sent, failed, removed }
//
// KV-Schlüssel:
//   vapid                       privater VAPID-Schlüssel als JWK
//   sub:<role>:<deviceId>       Abo (JSON), Kurzform zusätzlich als Metadaten (spart Lesezugriffe)
//   jwt:<aud>                   zwischengespeicherter VAPID-JWT je Push-Dienst (Apple: höchstens 1×/h erneuern)

const ROLES = ['kitchen', 'order'];
const TTL_SECONDS = 86400;            // Aufbewahrung beim Push-Dienst, wenn das Gerät offline ist
const JWT_LIFETIME = 12 * 3600;       // RFC 8292: ≤ 24 h; Apple: nicht mehr als 1 Tag in der Zukunft
const JWT_RENEW_BEFORE = 2 * 3600;    // erneuern, wenn weniger als 2 h Restlaufzeit
const RECORD_SIZE = 4096;
// Push-Dienste garantieren 4096 Byte Nutzlast (verschlüsselt, inkl. 86 Byte Header, 0x02 und 16 Byte Tag)
const MAX_PLAINTEXT = 4096 - 86 - 1 - 16;
const MAX_REQUEST_BYTES = 16384;

const enc = new TextEncoder();

// ---------- Hilfsfunktionen ----------

function b64u(bytes) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = '';
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000));
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function unb64u(str) {
  const s = String(str).trim().replace(/-/g, '+').replace(/_/g, '/').replace(/=+$/, '');
  const bin = atob(s + '==='.slice((s.length + 3) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function concat(...parts) {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

async function sha256(data) {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', typeof data === 'string' ? enc.encode(data) : data));
}

/** Zeitkonstanter Vergleich (über SHA-256, damit auch die Länge nichts verrät). */
async function safeEqual(a, b) {
  const [x, y] = await Promise.all([sha256(String(a)), sha256(String(b))]);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

function utf8Truncate(str, maxBytes) {
  str = String(str ?? '');
  if (enc.encode(str).length <= maxBytes) return str;
  let lo = 0, hi = str.length;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (enc.encode(str.slice(0, mid)).length + 3 <= maxBytes) lo = mid; else hi = mid - 1;
  }
  return str.slice(0, lo).replace(/[\uD800-\uDBFF]$/, '') + '…';
}

// ---------- HTTP / CORS ----------

function corsHeaders(req, env) {
  const allowed = String(env.ALLOWED_ORIGIN || '').split(',').map((s) => s.trim().replace(/\/$/, '')).filter(Boolean);
  const origin = req.headers.get('Origin') || '';
  let allow = '*';
  if (allowed.length && !allowed.includes('*')) allow = allowed.includes(origin) ? origin : allowed[0];
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Tafel-Key',
    'Access-Control-Max-Age': '86400',
    ...(allow === '*' ? {} : { Vary: 'Origin' }),
  };
}

function json(data, status, cors) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...cors },
  });
}

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

async function readJson(req) {
  const text = await req.text();
  if (text.length > MAX_REQUEST_BYTES) throw new HttpError(413, 'Anfrage zu groß.');
  try { return JSON.parse(text || '{}'); } catch { throw new HttpError(400, 'Ungültiges JSON.'); }
}

// ---------- VAPID ----------

const mem = { vapid: null, jwt: new Map() }; // Zwischenspeicher je Worker-Instanz

/** Liefert { privateKey (CryptoKey), publicKey (base64url, 65 Byte) }; erzeugt das Paar beim ersten Aufruf. */
async function getVapid(env) {
  if (mem.vapid) return mem.vapid;
  let jwk = await env.TAFEL_KV.get('vapid', 'json');
  if (!jwk || !jwk.d || !jwk.x || !jwk.y) {
    const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
    jwk = await crypto.subtle.exportKey('jwk', pair.privateKey);
    jwk = { kty: 'EC', crv: 'P-256', x: jwk.x, y: jwk.y, d: jwk.d, createdAt: new Date().toISOString() };
    await env.TAFEL_KV.put('vapid', JSON.stringify(jwk));
  }
  const privateKey = await crypto.subtle.importKey(
    'jwk', { kty: 'EC', crv: 'P-256', x: jwk.x, y: jwk.y, d: jwk.d, ext: true },
    { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign'],
  );
  const publicKey = b64u(concat(new Uint8Array([4]), unb64u(jwk.x), unb64u(jwk.y)));
  mem.vapid = { privateKey, publicKey };
  return mem.vapid;
}

const isLocalHost = (h) => /^(localhost|127\.|0\.0\.0\.0|\[::1\]|.*\.local$|.*\.localhost$|.*\.invalid$|.*\.test$|.*\.example$)/i.test(h);

/** Gültige Kontaktangabe für den `sub`-Claim. Apple lehnt Leerzeichen, <>, localhost u. Ä. ab (BadJwtToken). */
function vapidSubject(env, reqUrl) {
  const s = String(env.VAPID_SUBJECT || '').trim().replace(/^mailto:\s*<?\s*/i, 'mailto:').replace(/>$/, '');
  if (/^mailto:[^\s<>@,]+@[^\s<>@,]+\.[A-Za-z]{2,}$/i.test(s) && !isLocalHost(s.split('@')[1])) return s;
  if (/^https:\/\/[^\s<>]+$/i.test(s)) { try { if (!isLocalHost(new URL(s).hostname)) return s; } catch {} }
  for (const o of String(env.ALLOWED_ORIGIN || '').split(',').map((x) => x.trim())) {
    try { const u = new URL(o); if (u.protocol === 'https:' && !isLocalHost(u.hostname)) return u.origin; } catch {}
  }
  // Eigene Worker-Adresse (https://tafel-push.<konto>.workers.dev) – öffentlich erreichbar, von Apple akzeptiert.
  return new URL(reqUrl).origin;
}

async function signJwt(privateKey, claims) {
  const head = b64u(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const body = b64u(enc.encode(JSON.stringify(claims)));
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, privateKey, enc.encode(`${head}.${body}`));
  return `${head}.${body}.${b64u(sig)}`; // WebCrypto liefert r||s (64 Byte) – genau das Format für ES256
}

/** VAPID-JWT je Push-Dienst (aud), in Speicher und KV zwischengespeichert. */
async function vapidJwt(env, vapid, aud, sub) {
  const nowS = Math.floor(Date.now() / 1000);
  const fresh = (c) => c && c.k === vapid.publicKey && c.sub === sub && c.exp - nowS > JWT_RENEW_BEFORE;
  let c = mem.jwt.get(aud);
  if (fresh(c)) return c.t;
  try { c = await env.TAFEL_KV.get('jwt:' + aud, 'json'); } catch { c = null; }
  if (!fresh(c)) {
    const exp = nowS + JWT_LIFETIME;
    c = { t: await signJwt(vapid.privateKey, { aud, exp, sub }), exp, k: vapid.publicKey, sub };
    try { await env.TAFEL_KV.put('jwt:' + aud, JSON.stringify(c), { expirationTtl: JWT_LIFETIME }); } catch {}
  }
  mem.jwt.set(aud, c);
  return c.t;
}

// ---------- Verschlüsselung (RFC 8291, aes128gcm) ----------

async function hkdf(salt, ikm, info, bits) {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, key, bits));
}

async function encryptPayload(plaintext, p256dh, auth) {
  const uaPublic = unb64u(p256dh);
  const authSecret = unb64u(auth);
  const asPair = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const asPublic = new Uint8Array(await crypto.subtle.exportKey('raw', asPair.publicKey));
  const uaKey = await crypto.subtle.importKey('raw', uaPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const ecdhSecret = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, asPair.privateKey, 256));

  // IKM = HKDF(auth_secret, ecdh_secret, "WebPush: info" || 0x00 || ua_public || as_public, 32)
  const keyInfo = concat(enc.encode('WebPush: info\0'), uaPublic, asPublic);
  const ikm = await hkdf(authSecret, ecdhSecret, keyInfo, 256);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, enc.encode('Content-Encoding: aes128gcm\0'), 128);
  const nonce = await hkdf(salt, ikm, enc.encode('Content-Encoding: nonce\0'), 96);

  // Ein einziger (letzter) Record: Klartext || 0x02, ohne weiteres Padding
  const record = concat(plaintext, new Uint8Array([2]));
  const aesKey = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce, tagLength: 128 }, aesKey, record));

  // Header: salt(16) || rs(4, big endian) || idlen(1) || keyid(as_public, 65)
  const header = new Uint8Array(16 + 4 + 1 + asPublic.length);
  header.set(salt, 0);
  new DataView(header.buffer).setUint32(16, RECORD_SIZE);
  header[20] = asPublic.length;
  header.set(asPublic, 21);
  return concat(header, cipher);
}

// ---------- Abos ----------

function parseSubscription(s) {
  const endpoint = s && typeof s.endpoint === 'string' ? s.endpoint : '';
  const p256dh = s?.keys?.p256dh, auth = s?.keys?.auth;
  let url;
  try { url = new URL(endpoint); } catch { throw new HttpError(400, 'subscription.endpoint ist ungültig.'); }
  if (url.protocol !== 'https:' || endpoint.length > 2048) throw new HttpError(400, 'subscription.endpoint muss eine https-Adresse sein.');
  let pk, au;
  try { pk = unb64u(p256dh); au = unb64u(auth); } catch { throw new HttpError(400, 'subscription.keys sind ungültig.'); }
  if (pk.length !== 65 || pk[0] !== 4) throw new HttpError(400, 'subscription.keys.p256dh ist ungültig.');
  if (au.length !== 16) throw new HttpError(400, 'subscription.keys.auth ist ungültig.');
  return { endpoint, keys: { p256dh: b64u(pk), auth: b64u(au) } };
}

const validId = (id) => typeof id === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(id);

async function handleSubscribe(req, env) {
  const b = await readJson(req);
  if (!validId(b.deviceId)) throw new HttpError(400, 'deviceId fehlt oder ist ungültig.');
  if (!ROLES.includes(b.role)) throw new HttpError(400, 'role muss "kitchen" oder "order" sein.');
  const subscription = parseSubscription(b.subscription);
  const name = String(b.name ?? '').slice(0, 100);
  const key = `sub:${b.role}:${b.deviceId}`;
  const record = { deviceId: b.deviceId, role: b.role, name, subscription, updatedAt: new Date().toISOString() };
  // Kurzform als Metadaten (≤ 1024 Byte): /notify kommt dann ohne einzelne Lesezugriffe aus.
  const meta = { e: subscription.endpoint, p: subscription.keys.p256dh, a: subscription.keys.auth };
  const opts = JSON.stringify(meta).length <= 1000 ? { metadata: meta } : {};
  await env.TAFEL_KV.put(key, JSON.stringify(record), opts);
  return { ok: true };
}

/** Passende Abos als [{ key, deviceId, endpoint, keys }] (ohne Duplikate). */
async function findSubscriptions(env, to) {
  const found = new Map();
  const add = (key, sub) => { if (sub?.endpoint && sub?.keys && !found.has(key)) found.set(key, { key, deviceId: key.split(':')[2], ...sub }); };

  if (to.role) {
    let cursor;
    const missing = [];
    do {
      const r = await env.TAFEL_KV.list({ prefix: `sub:${to.role}:`, cursor });
      for (const k of r.keys) {
        const m = k.metadata;
        if (m && m.e && m.p && m.a) add(k.name, { endpoint: m.e, keys: { p256dh: m.p, auth: m.a } });
        else missing.push(k.name);
      }
      cursor = r.list_complete ? null : r.cursor;
    } while (cursor);
    await Promise.all(missing.map(async (name) => add(name, (await env.TAFEL_KV.get(name, 'json'))?.subscription)));
  }
  if (to.deviceIds?.length) {
    const keys = to.deviceIds.flatMap((id) => ROLES.map((r) => `sub:${r}:${id}`)).filter((k) => !found.has(k));
    await Promise.all(keys.map(async (name) => add(name, (await env.TAFEL_KV.get(name, 'json'))?.subscription)));
  }
  return [...found.values()];
}

// ---------- Senden ----------

function buildPayload(b) {
  const msg = {
    title: utf8Truncate(b.title || 'Tafel', 200),
    body: utf8Truncate(b.body ?? '', 1500),
    ...(b.tag != null && b.tag !== '' ? { tag: String(b.tag).slice(0, 100) } : {}),
    ...(b.url != null && b.url !== '' ? { url: utf8Truncate(b.url, 1000) } : {}),
  };
  let bytes = enc.encode(JSON.stringify(msg));
  // Sicherheitsnetz (JSON-Maskierung kann Text verlängern)
  for (const limit of [500, 100, 0]) {
    if (bytes.length <= MAX_PLAINTEXT) break;
    msg.body = limit ? utf8Truncate(msg.body, limit) : '';
    if (!limit) { msg.title = utf8Truncate(msg.title, 100); delete msg.url; }
    bytes = enc.encode(JSON.stringify(msg));
  }
  return bytes;
}

/** Topic: höchstens 32 Zeichen aus dem base64url-Alphabet (sonst lehnen Apple/Mozilla ab). */
const topicOf = (tag) => String(tag ?? '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 32);

async function sendOne(env, vapid, sub, payload, topic, subject) {
  const aud = new URL(sub.endpoint).origin;
  const jwt = await vapidJwt(env, vapid, aud, subject);
  const body = await encryptPayload(payload, sub.keys.p256dh, sub.keys.auth);
  const headers = {
    Authorization: `vapid t=${jwt}, k=${vapid.publicKey}`,
    'Content-Encoding': 'aes128gcm',
    'Content-Type': 'application/octet-stream',
    TTL: String(TTL_SECONDS),
    Urgency: 'high',
  };
  if (topic) headers.Topic = topic;
  const res = await fetch(sub.endpoint, { method: 'POST', headers, body });
  let reason = '';
  if (!res.ok) { try { reason = (await res.text()).slice(0, 300); } catch {} }
  else { try { await res.body?.cancel(); } catch {} }
  return { status: res.status, reason };
}

async function handleNotify(req, env) {
  const b = await readJson(req);
  const to = b.to && typeof b.to === 'object' ? b.to : {};
  if (to.role != null && !ROLES.includes(to.role)) throw new HttpError(400, 'to.role muss "kitchen" oder "order" sein.');
  const deviceIds = Array.isArray(to.deviceIds) ? to.deviceIds.filter(validId).slice(0, 100) : [];
  if (!to.role && !deviceIds.length) throw new HttpError(400, 'Empfänger fehlen (to.role oder to.deviceIds).');

  const subs = await findSubscriptions(env, { role: to.role, deviceIds });
  if (!subs.length) return { sent: 0, failed: 0, removed: 0 };

  const vapid = await getVapid(env);
  const subject = vapidSubject(env, req.url);
  const payload = buildPayload(b);
  const topic = topicOf(b.tag);
  const results = await Promise.allSettled(subs.map((s) => sendOne(env, vapid, s, payload, topic, subject)));

  let sent = 0, failed = 0, removed = 0;
  const errors = [];
  await Promise.all(results.map(async (r, i) => {
    const s = subs[i];
    if (r.status === 'fulfilled' && r.value.status >= 200 && r.value.status < 300) { sent++; return; }
    if (r.status === 'fulfilled' && (r.value.status === 404 || r.value.status === 410)) {
      // Abo abgelaufen: nur löschen, wenn inzwischen kein neues Abo hinterlegt wurde
      const cur = await env.TAFEL_KV.get(s.key, 'json');
      if (!cur || cur.subscription?.endpoint === s.endpoint) await env.TAFEL_KV.delete(s.key);
      removed++;
      return;
    }
    failed++;
    const e = r.status === 'fulfilled'
      ? { deviceId: s.deviceId, status: r.value.status, reason: r.value.reason }
      : { deviceId: s.deviceId, status: 0, reason: String(r.reason?.message || r.reason) };
    errors.push(e);
    console.warn('Push fehlgeschlagen', new URL(s.endpoint).host, e.status, e.reason);
  }));
  return { sent, failed, removed, ...(errors.length ? { errors } : {}) };
}

// ---------- Einstieg ----------

export default {
  async fetch(req, env, ctx) {
    const cors = corsHeaders(req, env);
    const { pathname } = new URL(req.url);
    const path = pathname.replace(/\/+$/, '') || '/';

    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

    if (req.method === 'GET' && path === '/') {
      const lines = [
        'Tafel-Push-Server ist in Betrieb.',
        `KV-Namespace TAFEL_KV: ${env.TAFEL_KV ? 'verbunden' : 'FEHLT'}`,
        `Secret TAFEL_KEY: ${env.TAFEL_KEY ? 'gesetzt' : 'FEHLT'}`,
      ];
      return new Response(lines.join('\n') + '\n', { headers: { 'Content-Type': 'text/plain; charset=utf-8', ...cors } });
    }

    try {
      if (!env.TAFEL_KEY) throw new HttpError(500, 'Secret TAFEL_KEY ist nicht gesetzt.');
      if (!env.TAFEL_KV) throw new HttpError(500, 'KV-Namespace TAFEL_KV ist nicht gebunden.');
      if (!(await safeEqual(req.headers.get('X-Tafel-Key') || '', env.TAFEL_KEY))) throw new HttpError(401, 'Haushaltsschlüssel fehlt oder ist falsch.');

      if (path === '/vapid' && req.method === 'GET') return json({ publicKey: (await getVapid(env)).publicKey }, 200, cors);
      if (path === '/subscribe' && req.method === 'POST') return json(await handleSubscribe(req, env), 200, cors);
      if (path === '/notify' && req.method === 'POST') return json(await handleNotify(req, env), 200, cors);
      if (['/vapid', '/subscribe', '/notify'].includes(path)) throw new HttpError(405, 'Methode nicht erlaubt.');
      throw new HttpError(404, 'Unbekannter Pfad.');
    } catch (e) {
      const status = e instanceof HttpError ? e.status : 500;
      if (status === 500 && !(e instanceof HttpError)) console.error(e);
      return json({ error: e instanceof HttpError ? e.message : 'Interner Fehler.' }, status, cors);
    }
  },
};
