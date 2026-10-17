// Gist-Synchronisation. Jedes Gerät schreibt nur seine eigene Datei dev-<id>.json und liest alle.
//
// Ereignisse (EventTarget):
//   'data'   – zusammengeführte Daten haben sich geändert (lokal oder remote)
//   'status' – Verbindungsstatus geändert (sync.state)

import { now, isConfigured, APP_VERSION } from './core.js';
import { idbGet, idbSet, idbDel } from './db.js';

const POLL_MS = 4000;
const HEARTBEAT_MS = 60000;
const TIMEOUT_MS = 15000;

export class Sync extends EventTarget {
  constructor(settings, { beforePush } = {}) {
    super();
    this.settings = settings;
    this.role = settings.role;
    this.beforePush = beforePush;
    this.fileName = `dev-${settings.deviceId}.json`;
    this.state = { online: navigator.onLine, syncing: false, lastPull: 0, lastPush: 0, error: '', dirty: false, rateRemaining: null };
    this.remote = new Map(); // Dateiname → Dokument (ohne eigene Datei)
    this.etag = '';
    this.imgEtag = '';
    this.images = new Map();
    this._dirtySeq = 0;
    this._pushedSeq = 0;
    this._timer = null;
    this._pushTimer = null;
    this._loadLocal();
  }

  // ---------- lokaler Zustand ----------

  _key(k) { return `tafel.${k}.${this.role}`; }

  _loadLocal() {
    let doc = null;
    try { doc = JSON.parse(localStorage.getItem(this._key('doc')) || 'null'); } catch {}
    this.local = doc || { v: 1 };
    this.local.device = { ...(this.local.device || {}), id: this.settings.deviceId, role: this.role };
    if (this.role === 'kitchen') {
      this.local.menu ||= { ingredients: {}, dishes: {} };
      this.local.status ||= {};
    } else {
      this.local.orders ||= {};
    }
    try {
      const snap = JSON.parse(localStorage.getItem(this._key('remote')) || '{}');
      if (snap.gistId === this.settings.gistId) {
        this.remote = new Map(Object.entries(snap.files || {}));
        this.state.lastPull = snap.at || 0;
      }
    } catch {}
    try { this._notifyQueue = JSON.parse(localStorage.getItem(this._key('notify')) || '[]'); } catch { this._notifyQueue = []; }
    try { this._imgQueue = JSON.parse(localStorage.getItem(this._key('imgqueue')) || '[]'); } catch { this._imgQueue = []; }
    this.state.dirty = localStorage.getItem(this._key('dirty')) === '1';
    if (this.state.dirty) this._dirtySeq = 1;
  }

  _saveLocal() {
    try {
      localStorage.setItem(this._key('doc'), JSON.stringify(this.local));
      localStorage.setItem(this._key('dirty'), this.state.dirty ? '1' : '0');
    } catch (e) { console.warn('localStorage voll?', e); }
  }

  _saveRemote() {
    try {
      localStorage.setItem(this._key('remote'), JSON.stringify({ gistId: this.settings.gistId, at: this.state.lastPull, files: Object.fromEntries(this.remote) }));
    } catch {}
  }

  /** Alle Gerätedokumente inkl. des eigenen (lokaler Stand hat Vorrang). */
  docs() {
    return [...[...this.remote.values()].filter((d) => d?.device?.id !== this.settings.deviceId), this.local];
  }

  /** Eigenes Dokument ändern. fn(doc) darf das Dokument direkt verändern. */
  mutate(fn, { silent = false } = {}) {
    fn(this.local);
    this.local.device.name = this.settings.deviceName;
    this.local.device.updatedAt = now();
    this.local.device.appVersion = APP_VERSION;
    this.state.dirty = true;
    this._dirtySeq++;
    this._saveLocal();
    clearTimeout(this._pushTimer);
    this._pushTimer = setTimeout(() => this.tick(), 350);
    if (!silent) this._emit('data');
    this._emit('status');
  }

  /** Mitteilung über den Worker versenden, sobald der aktuelle Stand im Gist liegt. */
  queueNotify(msg) {
    if (!this.settings.workerUrl) return;
    this._notifyQueue.push({ ...msg, seq: this._dirtySeq, at: now() });
    localStorage.setItem(this._key('notify'), JSON.stringify(this._notifyQueue));
    if (!this.state.dirty) this._flushNotify();
  }

  // ---------- Ablauf ----------

  start() {
    if (this._started) return;
    this._started = true;
    document.addEventListener('visibilitychange', () => { if (!document.hidden) this.tick(); });
    addEventListener('online', () => { this.tick(); });
    addEventListener('offline', () => this._setOnline(false));
    if (this.role === 'kitchen') {
      setInterval(() => {
        if (!document.hidden && isConfigured(this.settings)) this.mutate((d) => { d.device.heartbeat = now(); }, { silent: true });
      }, HEARTBEAT_MS);
      if (isConfigured(this.settings)) this.mutate((d) => { d.device.heartbeat = now(); }, { silent: true });
    }
    this._emit('data');
    this.tick();
  }

  /** Einstellungen haben sich geändert (z. B. neuer Gist). */
  reconfigure(settings) {
    const gistChanged = settings.gistId !== this.settings.gistId;
    this.settings = settings;
    if (gistChanged) {
      this.remote = new Map();
      this.etag = '';
      this.imgEtag = '';
      this.state.dirty = true;
      this._dirtySeq++;
    }
    this.state.error = '';
    this.tick();
    this._emit('data');
  }

  async tick() {
    clearTimeout(this._timer);
    if (this._running) { this._again = true; return; }
    this._running = true;
    try {
      if (isConfigured(this.settings)) {
        if (this.state.dirty) await this.push();
        await this.pull();
        if (this._imgQueue.length) await this._uploadImages();
      }
    } finally {
      this._running = false;
      const delay = this._again ? 0 : document.hidden ? 30000 : POLL_MS;
      this._again = false;
      this._timer = setTimeout(() => this.tick(), delay);
    }
  }

  async request(method, path, body, extraHeaders = {}) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(this.settings.apiBase.replace(/\/$/, '') + path, {
        method,
        cache: 'no-store',
        signal: ctrl.signal,
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${this.settings.token}`,
          'X-GitHub-Api-Version': '2022-11-28',
          ...(body ? { 'Content-Type': 'application/json' } : {}),
          ...extraHeaders,
        },
        body: body ? JSON.stringify(body) : undefined,
      });
      const rl = res.headers.get('x-ratelimit-remaining');
      if (rl != null) this.state.rateRemaining = +rl;
      this._setOnline(true);
      if (res.status === 304) return { status: 304 };
      if (!res.ok) {
        let msg = `GitHub ${res.status}`;
        try { msg += ': ' + (await res.json()).message; } catch {}
        const err = new Error(res.status === 401 ? 'Token ungültig oder abgelaufen' : res.status === 404 ? 'Gist nicht gefunden (ID oder Token-Berechtigung prüfen)' : msg);
        err.status = res.status;
        throw err;
      }
      return { status: res.status, etag: res.headers.get('etag') || '', json: res.status === 204 ? null : await res.json() };
    } catch (e) {
      if (e.status == null) { this._setOnline(false); e.offline = true; }
      throw e;
    } finally {
      clearTimeout(t);
    }
  }

  async pull() {
    this._setSyncing(true);
    try {
      const r = await this.request('GET', `/gists/${this.settings.gistId}`, null, this.etag ? { 'If-None-Match': this.etag } : {});
      this.state.lastPull = now();
      this.state.error = '';
      if (r.status !== 304) {
        this.etag = r.etag;
        const files = new Map();
        for (const [name, f] of Object.entries(r.json.files || {})) {
          if (!/^dev-.+\.json$/.test(name) || name === this.fileName) continue;
          try {
            const content = f.truncated ? await (await fetch(f.raw_url, { cache: 'no-store' })).text() : f.content;
            files.set(name, JSON.parse(content));
          } catch (e) { console.warn('Datei unlesbar', name, e); }
        }
        const changed = JSON.stringify([...files]) !== JSON.stringify([...this.remote]);
        this.remote = files;
        this._saveRemote();
        if (changed) this._emit('data');
      }
    } catch (e) {
      if (!e.offline) this.state.error = e.message;
    } finally {
      this._setSyncing(false);
    }
  }

  async push() {
    const seq = this._dirtySeq;
    this.beforePush?.(this.local, this.docs());
    this._setSyncing(true);
    try {
      await this.request('PATCH', `/gists/${this.settings.gistId}`, { files: { [this.fileName]: { content: JSON.stringify(this.local) } } });
      this.state.lastPush = now();
      this.state.error = '';
      this._pushedSeq = Math.max(this._pushedSeq, seq);
      if (this._dirtySeq === seq) this.state.dirty = false;
      this._saveLocal();
      this.etag = ''; // eigene Änderung → beim nächsten Abruf vollständig laden
      this._flushNotify();
      this._emit('data');
    } catch (e) {
      if (!e.offline) this.state.error = e.message;
    } finally {
      this._setSyncing(false);
    }
  }

  async _flushNotify() {
    if (!this._notifyQueue.length || !this.settings.workerUrl) return;
    const due = this._notifyQueue.filter((m) => m.seq <= this._pushedSeq || !this.state.dirty);
    if (!due.length) return;
    const rest = [];
    for (const m of due) {
      try {
        const res = await fetch(this.settings.workerUrl.replace(/\/$/, '') + '/notify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Tafel-Key': this.settings.workerKey },
          body: JSON.stringify({ to: m.to, title: m.title, body: m.body, tag: m.tag, url: m.url }),
        });
        if (!res.ok && res.status >= 500 && now() - m.at < 3600e3) rest.push(m);
      } catch {
        if (now() - m.at < 3600e3) rest.push(m);
      }
    }
    this._notifyQueue = [...this._notifyQueue.filter((m) => !due.includes(m)), ...rest];
    localStorage.setItem(this._key('notify'), JSON.stringify(this._notifyQueue));
  }

  _setOnline(v) {
    if (this.state.online !== v) { this.state.online = v; this._emit('status'); }
  }
  _setSyncing(v) {
    this.state.syncing = v;
    this._emit('status');
  }
  _emit(type) { this.dispatchEvent(new Event(type)); }

  // ---------- Fotos (Bilder-Gist) ----------

  /** Data-URL für imageId oder null. Lädt bei Bedarf den Bilder-Gist. */
  async getImage(id) {
    if (!id) return null;
    if (this.images.has(id)) return this.images.get(id);
    const cached = await idbGet(`img:${id}`);
    if (cached) { this.images.set(id, cached); return cached; }
    if (!this.settings.imgGistId || !isConfigured(this.settings)) return null;
    this._imgLoad ||= this._loadImageGist().finally(() => setTimeout(() => { this._imgLoad = null; }, 10000));
    await this._imgLoad;
    return this.images.get(id) || null;
  }

  async _loadImageGist() {
    try {
      const r = await this.request('GET', `/gists/${this.settings.imgGistId}`, null, this.imgEtag ? { 'If-None-Match': this.imgEtag } : {});
      if (r.status === 304) return;
      this.imgEtag = r.etag;
      for (const [name, f] of Object.entries(r.json.files || {})) {
        const m = name.match(/^img-(.+)\.txt$/);
        if (!m || this.images.has(m[1])) continue;
        const content = f.truncated ? await (await fetch(f.raw_url)).text() : f.content;
        this.images.set(m[1], content);
        idbSet(`img:${m[1]}`, content);
      }
    } catch (e) { console.warn('Bilder-Gist', e); }
  }

  /** Foto speichern (Data-URL). Gibt die neue imageId zurück; Upload läuft im Hintergrund. */
  async putImage(dataUrl) {
    const id = 'i' + crypto.getRandomValues(new Uint32Array(2)).join('').slice(0, 14);
    this.images.set(id, dataUrl);
    await idbSet(`img:${id}`, dataUrl);
    this._imgQueue.push({ id, op: 'put' });
    localStorage.setItem(this._key('imgqueue'), JSON.stringify(this._imgQueue));
    this.tick();
    return id;
  }

  deleteImage(id) {
    if (!id) return;
    this._imgQueue = this._imgQueue.filter((q) => q.id !== id);
    this._imgQueue.push({ id, op: 'del' });
    localStorage.setItem(this._key('imgqueue'), JSON.stringify(this._imgQueue));
    this.images.delete(id);
    idbDel(`img:${id}`);
  }

  async _uploadImages() {
    if (!this.settings.imgGistId) return;
    while (this._imgQueue.length) {
      const q = this._imgQueue[0];
      try {
        if (q.op === 'put') {
          const data = this.images.get(q.id) || (await idbGet(`img:${q.id}`));
          if (data) await this.request('PATCH', `/gists/${this.settings.imgGistId}`, { files: { [`img-${q.id}.txt`]: { content: data } } });
        } else {
          await this.request('PATCH', `/gists/${this.settings.imgGistId}`, { files: { [`img-${q.id}.txt`]: null } }).catch((e) => { if (e.status !== 422) throw e; });
        }
        this._imgQueue.shift();
        localStorage.setItem(this._key('imgqueue'), JSON.stringify(this._imgQueue));
      } catch (e) {
        if (!e.offline) this.state.error = 'Foto-Upload: ' + e.message;
        return;
      }
    }
  }

  get pendingImages() { return this._imgQueue.length; }

  // ---------- Einrichtung ----------

  /** Legt Daten- und Bilder-Gist an (privat/„secret“). */
  async createGists() {
    const readme = '# Tafel\nDatenablage der Tafel-Apps. Bitte nicht von Hand bearbeiten.\n';
    const a = await this.request('POST', '/gists', { description: 'Tafel – Daten', public: false, files: { 'README.md': { content: readme } } });
    const b = await this.request('POST', '/gists', { description: 'Tafel – Fotos', public: false, files: { 'README.md': { content: readme } } });
    return { gistId: a.json.id, imgGistId: b.json.id };
  }

  async testConnection() {
    const r = await this.request('GET', `/gists/${this.settings.gistId}`);
    return { ok: true, files: Object.keys(r.json.files || {}).length };
  }
}
