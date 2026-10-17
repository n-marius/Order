// Gemeinsame Hilfsfunktionen, Konstanten und Einstellungen.

export const APP_VERSION = '1.0.0';

export const CATEGORIES = [
  { id: 'vorspeise', name: 'Vorspeisen', single: 'Vorspeise', icon: 'leaf' },
  { id: 'hauptspeise', name: 'Hauptspeisen', single: 'Hauptspeise', icon: 'forkKnife' },
  { id: 'dessert', name: 'Desserts', single: 'Dessert', icon: 'cake' },
  { id: 'getraenk', name: 'Getränke', single: 'Getränk', icon: 'cup' },
  { id: 'alkohol', name: 'Alkoholische Getränke', single: 'Alkoholisches Getränk', short: 'Alkoholisch', icon: 'wineglass' },
];
export const DRINK_CATEGORIES = ['getraenk', 'alkohol'];
export const categoryById = (id) => CATEGORIES.find((c) => c.id === id);

export const COUNTRIES = [
  ['', 'Keine'], ['DE', 'Deutschland'], ['AT', 'Österreich'], ['CH', 'Schweiz'], ['IT', 'Italien'],
  ['FR', 'Frankreich'], ['ES', 'Spanien'], ['PT', 'Portugal'], ['GR', 'Griechenland'], ['TR', 'Türkei'],
  ['GB', 'Großbritannien'], ['IE', 'Irland'], ['NL', 'Niederlande'], ['BE', 'Belgien'], ['DK', 'Dänemark'],
  ['SE', 'Schweden'], ['NO', 'Norwegen'], ['FI', 'Finnland'], ['PL', 'Polen'], ['CZ', 'Tschechien'],
  ['HU', 'Ungarn'], ['HR', 'Kroatien'], ['RU', 'Russland'], ['UA', 'Ukraine'], ['US', 'USA'],
  ['CA', 'Kanada'], ['MX', 'Mexiko'], ['CU', 'Kuba'], ['BR', 'Brasilien'], ['AR', 'Argentinien'],
  ['PE', 'Peru'], ['CL', 'Chile'], ['JP', 'Japan'], ['CN', 'China'], ['KR', 'Korea'], ['TH', 'Thailand'],
  ['VN', 'Vietnam'], ['IN', 'Indien'], ['ID', 'Indonesien'], ['PH', 'Philippinen'], ['LB', 'Libanon'],
  ['IL', 'Israel'], ['IR', 'Iran'], ['MA', 'Marokko'], ['TN', 'Tunesien'], ['EG', 'Ägypten'],
  ['ET', 'Äthiopien'], ['ZA', 'Südafrika'], ['AU', 'Australien'], ['JM', 'Jamaika'], ['GB-SCT', 'Schottland'],
];

export function flag(code) {
  if (!code) return '';
  if (code === 'GB-SCT') return '\u{1F3F4}\u{E0067}\u{E0062}\u{E0073}\u{E0063}\u{E0074}\u{E007F}';
  if (!/^[A-Z]{2}$/.test(code)) return '';
  return String.fromCodePoint(...[...code].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
}
export const countryName = (code) => (COUNTRIES.find((c) => c[0] === code) || [, ''])[1];

export const now = () => Date.now();

export function uid(prefix = '') {
  const b = crypto.getRandomValues(new Uint8Array(9));
  return prefix + [...b].map((x) => x.toString(36).padStart(2, '0')).join('').slice(0, 12);
}

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

/**
 * Element-Builder: h('div', { class: 'x', onclick: fn, html: '<b>' }, child, 'text', [kinder])
 * Attribute: class, style (String/Objekt), dataset, html (innerHTML), on<event>, boolean props.
 */
export function h(tag, attrs, ...children) {
  const el = document.createElement(tag);
  if (attrs && (typeof attrs !== 'object' || attrs instanceof Node || Array.isArray(attrs))) {
    children.unshift(attrs);
    attrs = null;
  }
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k in el && typeof v !== 'string') el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  append(el, children);
  return el;
}
function append(el, children) {
  for (const c of children) {
    if (c == null || c === false) continue;
    if (Array.isArray(c)) append(el, c);
    else el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}

export function debounce(fn, ms) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

const timeFmt = new Intl.DateTimeFormat('de-DE', { hour: '2-digit', minute: '2-digit' });
const dateFmt = new Intl.DateTimeFormat('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' });
export const fmtTime = (ts) => (ts ? timeFmt.format(ts) : '');
export function fmtDateTime(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  const today = new Date();
  return d.toDateString() === today.toDateString() ? timeFmt.format(d) : `${dateFmt.format(d)}, ${timeFmt.format(d)}`;
}
export function fmtAgo(ts) {
  if (!ts) return 'nie';
  const s = Math.round((now() - ts) / 1000);
  if (s < 45) return 'gerade eben';
  const m = Math.round(s / 60);
  if (m < 60) return `vor ${m} Min.`;
  const hh = Math.round(m / 60);
  if (hh < 24) return `vor ${hh} Std.`;
  return fmtDateTime(ts);
}

// ---------- Einstellungen ----------

const DEFAULTS = {
  deviceId: '', deviceName: '', token: '', gistId: '', imgGistId: '',
  workerUrl: '', workerKey: '', theme: 'system', sound: true, apiBase: 'https://api.github.com',
};

export function loadSettings(role) {
  let s = {};
  try { s = JSON.parse(localStorage.getItem(`tafel.settings.${role}`) || '{}'); } catch {}
  s = { ...DEFAULTS, ...s, role };
  if (!s.deviceId) {
    s.deviceId = uid(role === 'kitchen' ? 'k' : 'o');
    saveSettings(s);
  }
  return s;
}

export function saveSettings(s) {
  try { localStorage.setItem(`tafel.settings.${s.role}`, JSON.stringify(s)); } catch {}
  bus.dispatchEvent(new CustomEvent('settings', { detail: s }));
}

export const isConfigured = (s) => !!(s.token && s.gistId && s.deviceName);

// Einrichtungscode: alles, was ein weiteres Gerät für die Verbindung braucht.
export function makeSetupCode(s) {
  const json = JSON.stringify({ t: s.token, g: s.gistId, i: s.imgGistId, w: s.workerUrl, k: s.workerKey, a: s.apiBase !== DEFAULTS.apiBase ? s.apiBase : undefined });
  const b64 = btoa(String.fromCharCode(...new TextEncoder().encode(json)));
  return 'TAFEL1:' + b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function parseSetupCode(code) {
  const m = String(code || '').trim().match(/^TAFEL1:([A-Za-z0-9_-]+)$/);
  if (!m) throw new Error('Ungültiger Einrichtungscode');
  const b64 = m[1].replace(/-/g, '+').replace(/_/g, '/');
  const bytes = Uint8Array.from(atob(b64 + '==='.slice((b64.length + 3) % 4)), (c) => c.charCodeAt(0));
  const o = JSON.parse(new TextDecoder().decode(bytes));
  return { token: o.t || '', gistId: o.g || '', imgGistId: o.i || '', workerUrl: o.w || '', workerKey: o.k || '', ...(o.a ? { apiBase: o.a } : {}) };
}

// ---------- Darstellung ----------

export function applyTheme(theme) {
  const root = document.documentElement;
  if (theme === 'light' || theme === 'dark') root.dataset.theme = theme;
  else delete root.dataset.theme;
  const dark = theme === 'dark' || (theme !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches);
  let meta = document.querySelector('meta[name="theme-color"]');
  if (!meta) { meta = document.createElement('meta'); meta.name = 'theme-color'; document.head.append(meta); }
  meta.content = dark ? '#000000' : '#f2f2f7';
}

export function watchTheme(getTheme) {
  applyTheme(getTheme());
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => applyTheme(getTheme()));
}

// Globaler Ereignisbus: 'settings', 'sync' (Status), 'data' (neue Daten)
export const bus = new EventTarget();

export function haptic() {
  try { navigator.vibrate?.(8); } catch {}
}
