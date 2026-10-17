// Einstellungen und Ersteinrichtung der Küche.

import { h, now, fmtAgo, makeSetupCode, parseSetupCode, applyTheme, APP_VERSION } from '../shared/core.js';
import { sheet, alert, confirm, prompt, toast, iconEl, segmented, switchEl, section, cell, copyText } from '../shared/ui.js';
import { pushState, enablePush, sendTestPush, isStandalone } from '../shared/push.js';
import { chime } from '../shared/sound.js';
import { app, updateSettings, largeTitle, formRow, actionCell, put } from './ctx.js';
import { resetSeen } from './signals.js';

const DEFAULT_API = 'https://api.github.com';
const TOKEN_HINT = 'Benötigt wird ein Fine-grained Personal Access Token mit der Berechtigung „Gists: Read and write“ (github.com → Settings → Developer settings → Personal access tokens).';

const mask = (s) => (!s ? 'Nicht festgelegt' : s.length <= 10 ? '••••••' : `${s.slice(0, 4)}••••${s.slice(-4)}`);
const shortId = (s) => (!s ? 'Nicht festgelegt' : s.length > 14 ? `${s.slice(0, 6)}…${s.slice(-6)}` : s);

const PUSH_TEXT = {
  unsupported: 'Auf diesem Gerät nicht verfügbar',
  install: 'Erst nach Hinzufügen zum Home-Bildschirm',
  noworker: 'Kein Push-Server eingetragen',
  denied: 'In den Systemeinstellungen abgelehnt',
  default: 'Nicht aktiviert',
  granted: 'Aktiv',
};

function spinner() { return h('span', { class: 'k-spinner', 'aria-hidden': 'true' }); }

/** Knopf, der während einer asynchronen Aktion einen Ladezustand zeigt. */
async function busy(btn, fn) {
  if (btn.disabled) return;
  const old = [...btn.childNodes];
  btn.disabled = true;
  btn.replaceChildren(spinner(), h('span', null, 'Bitte warten …'));
  try { return await fn(); } finally { btn.disabled = false; btn.replaceChildren(...old); }
}

function textField(value, onCommit, { placeholder = '', type = 'text', mono = false, label = '' } = {}) {
  const i = h('input', {
    class: `field${mono ? ' k-mono' : ''}`, type, value: value || '', placeholder, 'aria-label': label,
    autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', enterkeyhint: 'done',
    onchange: (e) => onCommit(e.target.value.trim(), e.target),
    onkeydown: (e) => { if (e.key === 'Enter') e.target.blur(); },
  });
  return i;
}

// ---------- Ansicht ----------

export function settingsView() {
  const el = h('div', { class: 'page k-narrow k-settings' });
  const pushWrap = h('div');
  const infoWrap = h('div');
  const devWrap = h('div');

  async function testConnection(btn) {
    await busy(btn, async () => {
      try {
        const r = await app.sync.testConnection();
        toast('Verbindung in Ordnung', { message: `Daten-Gist erreichbar · ${r.files} Dateien`, icon: 'checkCircle', tone: 'green', ms: 3000 });
      } catch (e) {
        await alert({ title: 'Keine Verbindung', message: e.offline ? 'Der Server ist nicht erreichbar. Netzwerkverbindung prüfen.' : e.message });
      }
    });
  }

  async function newStorage(btn) {
    const ok = await confirm('Neue Ablage anlegen?', 'Es werden zwei neue private Gists angelegt. Gerichte und Zutaten dieser Küche werden übernommen. Alle Bestellgeräte müssen anschließend mit dem neuen Einrichtungscode verbunden werden.', 'Anlegen');
    if (!ok) return;
    await busy(btn, async () => {
      try {
        const ids = await app.sync.createGists();
        updateSettings(ids);
        resetSeen();
        build();
        toast('Neue Ablage angelegt', { message: 'Einrichtungscode für die Bestellgeräte aktualisiert.', icon: 'checkCircle', tone: 'green' });
      } catch (e) {
        await alert({ title: 'Anlegen nicht möglich', message: e.offline ? 'Der Server ist nicht erreichbar.' : e.message });
      }
    });
  }

  async function editSecret(title, key, message, placeholder) {
    const v = await prompt(title, message, { placeholder, okText: 'Sichern' });
    if (v == null || !v.trim()) return;
    updateSettings({ [key]: v.trim() });
    build();
  }

  function renderPush() {
    const s = app.settings;
    const state = pushState(s);
    const rows = [
      formRow('Push-Server', textField(s.workerUrl, (v) => { updateSettings({ workerUrl: v }); renderPush(); }, { placeholder: 'https://…', type: 'url', label: 'Push-Server' })),
      h('button', { class: 'cell tappable', onclick: () => editSecret('Haushaltsschlüssel', 'workerKey', 'Gemeinsamer Schlüssel aller Geräte dieses Haushalts.', 'Schlüssel') },
        h('div', { class: 'cell-body cell-title' }, 'Haushaltsschlüssel'), h('div', { class: 'cell-value k-mono' }, mask(s.workerKey)), iconEl('chevronRight', 'cell-chevron')),
      h('div', { class: 'cell' }, h('div', { class: 'cell-body cell-title' }, 'Status'),
        h('div', { class: `cell-value k-pushstate ${state}` }, h('i'), PUSH_TEXT[state] || state)),
    ];
    if (state === 'default' || state === 'denied') {
      const b = actionCell('Mitteilungen aktivieren', null, 'bell');
      b.onclick = () => busy(b, async () => {
        try { await enablePush(app.settings); toast('Mitteilungen aktiviert', { icon: 'bell', tone: 'green', ms: 2500 }); }
        catch (e) { await alert({ title: 'Mitteilungen nicht aktiviert', message: e.message }); }
        renderPush();
      });
      rows.push(b);
    }
    if (state === 'granted') {
      const b = actionCell('Testmitteilung senden', null, 'bell');
      b.onclick = () => busy(b, async () => {
        try { await sendTestPush(app.settings); toast('Testmitteilung gesendet', { icon: 'bell', tone: 'green', ms: 2500 }); }
        catch (e) { await alert({ title: 'Senden fehlgeschlagen', message: e.message }); }
      });
      rows.push(b);
    }
    const foot = state === 'install'
      ? 'Mitteilungen sind auf iPad und iPhone erst verfügbar, nachdem die App über „Teilen → Zum Home-Bildschirm“ hinzugefügt und von dort geöffnet wurde.'
      : 'Mitteilungen über neue Bestellungen, Änderungen und Antworten senden die Bestellgeräte über den Push-Server.';
    pushWrap.replaceChildren(section('Mitteilungen', rows, foot));
  }

  function renderInfo() {
    const st = app.sync.state;
    const rows = [
      h('div', { class: 'cell' }, h('div', { class: 'cell-body cell-title' }, 'Version'), h('div', { class: 'cell-value num' }, APP_VERSION)),
      h('div', { class: 'cell' }, h('div', { class: 'cell-body cell-title' }, 'Letzte Synchronisierung'), h('div', { class: 'cell-value' }, st.lastPull ? fmtAgo(st.lastPull) : 'Noch nie')),
      h('div', { class: 'cell' }, h('div', { class: 'cell-body cell-title' }, 'Verbleibende API-Anfragen'), h('div', { class: 'cell-value num' }, st.rateRemaining == null ? '–' : String(st.rateRemaining))),
      app.sync.pendingImages ? h('div', { class: 'cell' }, h('div', { class: 'cell-body cell-title' }, 'Fotos in Warteschlange'), h('div', { class: 'cell-value num' }, String(app.sync.pendingImages))) : null,
      st.error ? h('div', { class: 'cell' }, h('div', { class: 'cell-body' }, h('div', { class: 'cell-title' }, 'Letzter Fehler'), h('div', { class: 'cell-sub red' }, st.error))) : null,
    ].filter(Boolean);
    infoWrap.replaceChildren(section('Info', rows));

    const devices = [...app.view.devices].sort((a, b) => (a.role === b.role ? (a.name || '').localeCompare(b.name || '', 'de') : a.role === 'kitchen' ? -1 : 1));
    put(devWrap, devices.length ? section('Geräte', devices.map((d) => {
      const seen = Math.max(d.heartbeat || 0, d.updatedAt || 0);
      const self = d.id === app.settings.deviceId;
      return h('div', { class: 'cell with-icon' },
        h('div', { class: 'cell-icon', style: { background: d.role === 'kitchen' ? 'var(--tint)' : 'var(--blue)' } }, iconEl(d.role === 'kitchen' ? 'flame' : 'house')),
        h('div', { class: 'cell-body' },
          h('div', { class: 'cell-title' }, d.name || 'Ohne Namen', self ? h('span', { class: 'c2' }, ' · dieses Gerät') : null),
          h('div', { class: 'cell-sub' }, d.role === 'kitchen' ? 'Küche' : 'Bestellgerät')),
        h('div', { class: 'cell-value t-sub' }, seen ? `aktiv ${fmtAgo(seen)}` : '–'));
    }), 'Ein Bestellgerät erscheint, sobald es zum ersten Mal Daten gesendet hat.') : null);
  }

  function build() {
    const s = app.settings;
    const code = s.gistId && s.token ? makeSetupCode(s) : '';
    const testBtn = actionCell('Verbindung testen', null, 'arrowClockwise');
    testBtn.onclick = () => testConnection(testBtn);
    const newBtn = actionCell('Neue Ablage anlegen', null, 'plus');
    newBtn.onclick = () => newStorage(newBtn);

    const theme = segmented([{ value: 'system', label: 'System' }, { value: 'light', label: 'Hell' }, { value: 'dark', label: 'Dunkel' }], s.theme || 'system', (v) => {
      updateSettings({ theme: v });
      applyTheme(v);
    });

    el.replaceChildren(
      largeTitle('Einstellungen'),
      section('Gerät', [
        formRow('Gerätename', textField(s.deviceName, (v, input) => {
          if (!v) { input.value = app.settings.deviceName; return; }
          updateSettings({ deviceName: v });
          app.sync.mutate(() => {}, { silent: true });
        }, { placeholder: 'Küche', label: 'Gerätename' })),
      ], 'Der Name erscheint in der Geräteliste aller Geräte.'),

      section('GitHub-Ablage', [
        h('button', { class: 'cell tappable', onclick: () => editSecret('Token ersetzen', 'token', TOKEN_HINT, 'github_pat_…') },
          h('div', { class: 'cell-body cell-title' }, 'Token'), h('div', { class: 'cell-value k-mono' }, mask(s.token)), iconEl('chevronRight', 'cell-chevron')),
        formRow('Daten-Gist', textField(s.gistId, (v) => { if (v && v !== app.settings.gistId) { updateSettings({ gistId: v }); resetSeen(); build(); } }, { mono: true, placeholder: 'ID', label: 'Daten-Gist-ID' })),
        formRow('Bilder-Gist', textField(s.imgGistId, (v) => { updateSettings({ imgGistId: v }); build(); }, { mono: true, placeholder: 'ID', label: 'Bilder-Gist-ID' })),
        testBtn,
        newBtn,
      ], 'Daten und Fotos liegen in zwei privaten Gists. Jedes Gerät schreibt ausschließlich in seine eigene Datei.'),

      h('div', { class: 'section' },
        h('div', { class: 'section-head' }, 'Bestellgeräte einrichten'),
        h('div', { class: 'list k-codebox' },
          h('div', { class: 'k-code k-mono', 'aria-label': 'Einrichtungscode' }, code || 'Erst nach der Einrichtung verfügbar'),
          h('div', { class: 'k-code-actions' },
            h('button', { class: 'btn mid tinted', disabled: !code, onclick: () => copyText(code, 'Einrichtungscode kopiert') }, iconEl('copy'), 'Code kopieren'))),
        h('ol', { class: 'section-foot k-steps-foot' },
          h('li', null, 'Code kopieren und auf das Bestellgerät übertragen, etwa per AirDrop oder Notizen.'),
          h('li', null, 'Bestell-App auf dem Gerät öffnen und den Code im Einrichtungsblatt einfügen.'),
          h('li', null, 'Als Gerätename den Raum angeben, zum Beispiel „Wohnzimmer“.')),
        h('div', { class: 'section-foot' }, 'Der Code enthält den Zugangstoken. Nur an Geräte des eigenen Haushalts weitergeben.')),

      pushWrap,

      section('Ton', [
        cell({ title: 'Signalton', sub: 'Bei neuen Bestellungen, Änderungen und Antworten', end: switchEl(s.sound, (v) => updateSettings({ sound: v }), { label: 'Signalton' }) }),
        actionCell('Ton abspielen', () => chime('order'), 'bell'),
      ]),

      section('Darstellung', [h('div', { class: 'cell k-segcell' }, theme)]),

      section('Erweitert', [
        formRow('API-Adresse', textField(s.apiBase, (v) => { updateSettings({ apiBase: v || DEFAULT_API }); build(); }, { placeholder: DEFAULT_API, type: 'url', mono: true, label: 'API-Adresse' })),
      ], 'Nur für Testumgebungen ändern. Standard: api.github.com'),

      infoWrap,
      devWrap,
    );
    renderPush();
    renderInfo();
  }

  build();
  return {
    el,
    update() {
      // Eingaben nicht unterbrechen: nur die Live-Bereiche neu zeichnen.
      renderInfo();
      if (!pushWrap.contains(document.activeElement)) renderPush();
    },
    tick: () => renderInfo(),
  };
}

// ---------- Ersteinrichtung ----------

export function openSetup({ onDone }) {
  const s = app.settings;
  let mode = 'new';

  const input = (attrs) => h('input', { class: 'field left', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', ...attrs });
  const name = input({ placeholder: 'Küche', value: s.deviceName || '', autocapitalize: 'words', 'aria-label': 'Gerätename', enterkeyhint: 'next' });
  const token = input({ placeholder: 'github_pat_…', value: s.token || '', type: 'password', 'aria-label': 'GitHub-Token' });
  const token2 = input({ placeholder: 'github_pat_…', value: s.token || '', type: 'password', 'aria-label': 'GitHub-Token' });
  const gistId = input({ placeholder: 'Daten-Gist-ID', value: s.gistId || '', class: 'field left k-mono', 'aria-label': 'Daten-Gist-ID' });
  const imgGistId = input({ placeholder: 'Bilder-Gist-ID', value: s.imgGistId || '', class: 'field left k-mono', 'aria-label': 'Bilder-Gist-ID' });
  const code = h('textarea', { class: 'field left k-mono k-codein', placeholder: 'TAFEL1:…', rows: 3, autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', 'aria-label': 'Einrichtungscode' });
  const workerUrl = input({ placeholder: 'https://…', value: s.workerUrl || '', type: 'url', 'aria-label': 'Push-Server' });
  const workerKey = input({ placeholder: 'Schlüssel', value: s.workerKey || '', type: 'password', 'aria-label': 'Haushaltsschlüssel' });
  const apiBase = input({ placeholder: DEFAULT_API, value: s.apiBase && s.apiBase !== DEFAULT_API ? s.apiBase : '', type: 'url', class: 'field left k-mono', 'aria-label': 'API-Adresse' });

  const modeWrap = h('div');
  const row = (label, control) => h('label', { class: 'cell k-frow k-frow-stack' }, h('span', { class: 'k-flabel' }, label), control);

  function renderMode() {
    if (mode === 'new') {
      modeWrap.replaceChildren(section('GitHub', [row('Token', token)], TOKEN_HINT),
        h('div', { class: 'notice k-setup-note' }, iconEl('info'), h('div', { class: 't-sub' }, 'Für Daten und Fotos werden zwei private Gists im GitHub-Konto angelegt.')));
    } else if (mode === 'code') {
      modeWrap.replaceChildren(section('Einrichtungscode', [h('div', { class: 'cell' }, code)],
        'Der Code ist in den Einstellungen einer bereits eingerichteten Küche unter „Bestellgeräte einrichten“ zu finden.'));
    } else {
      modeWrap.replaceChildren(section('GitHub', [row('Token', token2), row('Daten-Gist', gistId), row('Bilder-Gist', imgGistId)], TOKEN_HINT));
    }
  }

  const modeSeg = segmented([
    { value: 'new', label: 'Neue Ablage' },
    { value: 'code', label: 'Einrichtungscode' },
    { value: 'ids', label: 'Vorhandene Gists' },
  ], mode, (v) => { mode = v; renderMode(); }, { large: true });

  const advanced = h('details', { class: 'k-adv' },
    h('summary', null, h('span', null, 'Erweitert'), iconEl('chevronDown', 'k-adv-chev')),
    section(null, [row('API-Adresse', apiBase)], 'Nur für Testumgebungen. Standard: api.github.com'));
  if (apiBase.value) advanced.open = true;

  const submit = h('button', { class: 'btn block k-setup-go', onclick: () => go() }, 'Einrichten');

  const body = h('div', { class: 'k-setup' },
    h('div', { class: 'k-setup-hero' },
      h('img', { src: 'icons/logo.svg', alt: '', class: 'k-setup-logo', width: 76, height: 76 }),
      h('h1', { class: 't-title1' }, 'Küche einrichten'),
      h('p', { class: 'c2' }, 'Die Küche verwaltet Gerichte und Zutaten und empfängt die Bestellungen der Bestellgeräte. Die Synchronisierung erfolgt über einen privaten GitHub-Gist.')),
    section('Gerät', [row('Gerätename', name)]),
    h('div', { class: 'k-setup-seg' }, modeSeg),
    modeWrap,
    section('Mitteilungen (optional)', [row('Push-Server', workerUrl), row('Schlüssel', workerKey)],
      'Ohne Push-Server erscheinen Bestellungen nur bei geöffneter App.'),
    advanced);

  const api = sheet({ title: 'Einrichtung', body, left: null, dismissable: false, foot: submit });
  api.el.classList.add('k-setup-sheet');
  renderMode();

  async function go() {
    const patch = {
      deviceName: name.value.trim() || 'Küche',
      workerUrl: workerUrl.value.trim(),
      workerKey: workerKey.value.trim(),
      apiBase: apiBase.value.trim() || DEFAULT_API,
    };
    if (mode === 'code') {
      try { Object.assign(patch, parseSetupCode(code.value)); }
      catch { await alert({ title: 'Ungültiger Code', message: 'Der Einrichtungscode beginnt mit „TAFEL1:“ und muss vollständig eingefügt werden.' }); return; }
      if (!patch.workerUrl) patch.workerUrl = workerUrl.value.trim();
      if (!patch.workerKey) patch.workerKey = workerKey.value.trim();
    } else {
      patch.token = (mode === 'new' ? token : token2).value.trim();
      if (!patch.token) { await alert({ title: 'Token fehlt', message: TOKEN_HINT }); return; }
    }
    if (mode === 'ids') {
      patch.gistId = gistId.value.trim();
      patch.imgGistId = imgGistId.value.trim();
      if (!patch.gistId) { await alert({ title: 'Daten-Gist fehlt', message: 'Die ID des Daten-Gists ist erforderlich.' }); return; }
    }

    await busy(submit, async () => {
      const prev = app.sync.settings;
      try {
        app.sync.settings = { ...app.settings, ...patch };
        if (mode === 'new') Object.assign(patch, await app.sync.createGists());
        else await app.sync.testConnection();
      } catch (e) {
        app.sync.settings = prev;
        await alert({ title: 'Einrichtung nicht möglich', message: e.offline ? 'Der Server ist nicht erreichbar. Netzwerkverbindung prüfen.' : e.message });
        return;
      }
      app.sync.settings = prev;
      resetSeen();
      updateSettings(patch);
      app.sync.mutate((d) => { d.device.heartbeat = now(); }, { silent: true });
      api.close('done');
      toast('Küche eingerichtet', { message: mode === 'new' ? 'Der Einrichtungscode für die Bestellgeräte ist in den Einstellungen zu finden.' : 'Verbunden mit der vorhandenen Ablage.', icon: 'checkCircle', tone: 'green', ms: 5000 });
      onDone?.();
    });
  }
  return api;
}

export { isStandalone };
