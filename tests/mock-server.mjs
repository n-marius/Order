// Lokaler Testserver: liefert das Repo statisch aus und simuliert
//   - die GitHub-Gist-API unter /api  (GET/PATCH /api/gists/:id, POST /api/gists)
//   - den Push-Worker unter /worker   (GET /vapid, POST /subscribe, POST /notify)
// Start: node tests/mock-server.mjs [port]   → http://localhost:8080/kueche/  bzw. /bestellen/
// Einstellungen in der App: apiBase = http://localhost:8080/api, Token beliebig, workerUrl = http://localhost:8080/worker
// Hilfsrouten: GET /__state (alle Gists + Notify-Log), POST /__reset, POST /__offline {on:true|false}

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const PORT = +process.argv[2] || 8080;
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml', '.md': 'text/plain; charset=utf-8' };

let gists = {};
let notifyLog = [];
let subs = {};
let offline = false;
let seq = 0;

const etagOf = (g) => `"${crypto.createHash('md5').update(JSON.stringify(g.files) + g.rev).digest('hex')}"`;
function gistJson(g) {
  return { id: g.id, description: g.description, files: Object.fromEntries(Object.entries(g.files).map(([n, c]) => [n, { filename: n, content: c, truncated: false, raw_url: '' }])) };
}

function send(res, status, body, headers = {}) {
  res.writeHead(status, {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type, If-None-Match, X-GitHub-Api-Version, X-Tafel-Key, Accept',
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, OPTIONS',
    'Access-Control-Expose-Headers': 'ETag, X-RateLimit-Remaining',
    ...(body != null && typeof body === 'object' ? { 'Content-Type': 'application/json' } : {}),
    ...headers,
  });
  res.end(body == null ? '' : typeof body === 'object' ? JSON.stringify(body) : body);
}

const readBody = (req) => new Promise((r) => { let d = ''; req.on('data', (c) => (d += c)); req.on('end', () => { try { r(d ? JSON.parse(d) : {}); } catch { r({}); } }); });

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const p = decodeURIComponent(url.pathname);
  if (req.method === 'OPTIONS') return send(res, 204);

  if (p === '/__state') return send(res, 200, { gists, notifyLog, subs, offline });
  if (p === '/__reset') { gists = {}; notifyLog = []; subs = {}; offline = false; return send(res, 200, { ok: true }); }
  if (p === '/__offline') { offline = !!(await readBody(req)).on; return send(res, 200, { offline }); }

  if (p.startsWith('/api/') || p.startsWith('/worker/')) {
    if (offline) { req.socket.destroy(); return; }
  }

  if (p.startsWith('/api/')) {
    if (!req.headers.authorization) return send(res, 401, { message: 'Requires authentication' });
    const m = p.match(/^\/api\/gists(?:\/([\w-]+))?$/);
    if (!m) return send(res, 404, { message: 'Not Found' });
    if (!m[1] && req.method === 'POST') {
      const b = await readBody(req);
      const id = 'g' + (++seq) + crypto.randomBytes(4).toString('hex');
      gists[id] = { id, description: b.description, rev: 0, files: Object.fromEntries(Object.entries(b.files || {}).map(([n, f]) => [n, f.content])) };
      return send(res, 201, gistJson(gists[id]));
    }
    const g = gists[m[1]];
    if (!g) return send(res, 404, { message: 'Not Found' });
    if (req.method === 'GET') {
      const et = etagOf(g);
      if (req.headers['if-none-match'] === et) return send(res, 304, null, { ETag: et });
      return send(res, 200, gistJson(g), { ETag: et, 'X-RateLimit-Remaining': '4999' });
    }
    if (req.method === 'PATCH') {
      const b = await readBody(req);
      for (const [n, f] of Object.entries(b.files || {})) {
        if (f === null) delete g.files[n]; else g.files[n] = f.content;
      }
      g.rev++;
      return send(res, 200, gistJson(g), { ETag: etagOf(g) });
    }
    return send(res, 405, { message: 'Method not allowed' });
  }

  if (p.startsWith('/worker/')) {
    if (req.headers['x-tafel-key'] !== 'test') return send(res, 401, { error: 'unauthorized' });
    if (p === '/worker/vapid') return send(res, 200, { publicKey: 'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U' });
    if (p === '/worker/subscribe') { const b = await readBody(req); subs[b.deviceId] = b; return send(res, 200, { ok: true }); }
    if (p === '/worker/notify') { const b = await readBody(req); notifyLog.push({ at: Date.now(), ...b }); return send(res, 200, { sent: 1 }); }
    return send(res, 404, { error: 'not found' });
  }

  let file = path.join(ROOT, p);
  if (!file.startsWith(ROOT)) return send(res, 403, 'forbidden');
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
  if (!fs.existsSync(file)) return send(res, 404, 'not found');
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  fs.createReadStream(file).pipe(res);
}).listen(PORT, () => console.log(`Testserver: http://localhost:${PORT}/`));
