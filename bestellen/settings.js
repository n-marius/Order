// Einstellungen und Ersteinrichtung.

import { h, saveSettings, parseSetupCode, applyTheme, fmtAgo, APP_VERSION, isConfigured } from '../shared/core.js';
import { section, cell, segmented, switchEl, sheet, alert, confirm, toast, iconEl } from '../shared/ui.js';
import { pushState, enablePush, sendTestPush } from '../shared/push.js';
import { S, view } from './store.js';
import { kitchenText } from './watch.js';

/** Einstellungen ändern und Sync neu konfigurieren (immer neues Objekt, damit Sync den Gist-Wechsel erkennt). */
export function updateSettings(patch) {
  const before = S.settings;
  S.settings = { ...S.settings, ...patch };
  saveSettings(S.settings);
  S.sync.reconfigure(S.settings);
  if (patch.deviceName != null && patch.deviceName !== before.deviceName && isConfigured(S.settings)) {
    S.sync.mutate(() => {}, { silent: true }); // Raumname in die Gerätedatei übernehmen
  }
  if (patch.theme) applyTheme(patch.theme);
}

function fieldCell(label, value, { type = 'text', placeholder = '', onCommit, inputmode, reveal = false } = {}) {
  const input = h('input', {
    class: 'field', type, value: value || '', placeholder, inputmode, autocomplete: 'off', autocapitalize: 'off', spellcheck: false,
    'aria-label': label,
    onchange: () => onCommit?.(input.value.trim()),
  });
  const toggle = reveal ? h('button', {
    class: 'reveal-btn', type: 'button',
    onclick: (e) => { e.preventDefault(); input.type = input.type === 'password' ? 'text' : 'password'; toggle.textContent = input.type === 'password' ? 'Zeigen' : 'Verbergen'; },
  }, 'Zeigen') : null;
  const el = h('label', { class: 'cell field-cell' }, h('span', { class: 'cell-label' }, label), input, toggle);
  el.input = input;
  return el;
}

const PUSH_TEXT = {
  unsupported: 'Nicht unterstützt', install: 'Installation erforderlich', noworker: 'Push-Server fehlt',
  denied: 'Abgelehnt', default: 'Nicht aktiviert', granted: 'Aktiv',
};

// ---------- Einstellungen ----------

export function renderSettings() {
  const s = S.settings;
  const v = view();
  const ps = pushState(s);

  const infoSync = h('span');
  const infoKitchen = h('span');
  const refresh = () => {
    infoSync.textContent = S.sync.state.lastPull ? fmtAgo(S.sync.state.lastPull) : 'Noch nie';
    infoKitchen.textContent = view().kitchenLastSeen ? fmtAgo(view().kitchenLastSeen) : 'Noch nie';
  };

  const pushCells = [
    fieldCell('Push-Server', s.workerUrl, { type: 'url', placeholder: 'https://…workers.dev', onCommit: (x) => { updateSettings({ workerUrl: x }); rerender(); } }),
    fieldCell('Schlüssel', s.workerKey, { type: 'password', placeholder: 'Haushaltsschlüssel', reveal: true, onCommit: (x) => updateSettings({ workerKey: x }) }),
    cell({ title: 'Status', value: PUSH_TEXT[ps] || ps }),
  ];
  if (ps !== 'granted' && ps !== 'install' && ps !== 'unsupported') {
    pushCells.push(cell({ title: 'Mitteilungen aktivieren', cls: 'action', onClick: activatePush }));
  }
  if (ps === 'granted') pushCells.push(cell({ title: 'Test senden', cls: 'action', onClick: testPush }));

  const pushFoot = ps === 'install'
    ? 'Mitteilungen stehen erst nach der Installation zur Verfügung: in Safari „Teilen“ → „Zum Home-Bildschirm“ wählen und die App anschließend vom Home-Bildschirm öffnen.'
    : ps === 'denied' ? 'Mitteilungen wurden abgelehnt. Sie lassen sich in den Systemeinstellungen für diese App wieder erlauben.'
      : 'Rückmeldungen der Küche (Stornos, Nachfragen) erscheinen als Mitteilung, auch wenn die App geschlossen ist.';

  const el = h('div', { class: 'page settings-page' },
    h('header', { class: 'page-head' },
      h('h1', { class: 't-large' }, 'Einstellungen'),
      h('div', { class: 'page-sub' }, `Bestellgerät · ${s.deviceName || 'ohne Raumnamen'}`)),
    h('div', { class: 'settings-cols' },
      h('div', { class: 'settings-col' },
        section('Gerät', [
          fieldCell('Raumname', s.deviceName, { placeholder: 'z. B. Wohnzimmer', onCommit: (x) => { if (x) updateSettings({ deviceName: x }); } }),
        ], 'Der Raumname erscheint in der Küche bei jeder Bestellung.'),
        section('Verbindung', [
          cell({ title: 'Status', end: S.connPillClone?.() || null }),
          cell({ title: 'Einrichtungscode einfügen', icon: 'key', iconBg: 'var(--tint)', chevron: true, onClick: () => openSetupCode(rerender) }),
          fieldCell('Token', s.token, { type: 'password', placeholder: 'ghp_…', reveal: true, onCommit: (x) => updateSettings({ token: x }) }),
          fieldCell('Daten-Gist', s.gistId, { placeholder: 'Gist-ID', onCommit: (x) => updateSettings({ gistId: x }) }),
          fieldCell('Bilder-Gist', s.imgGistId, { placeholder: 'Gist-ID', onCommit: (x) => updateSettings({ imgGistId: x }) }),
          cell({ title: 'Verbindung testen', cls: 'action', onClick: testConnection }),
        ], 'Token und Gist-IDs werden mit dem Einrichtungscode automatisch übernommen.'),
        section('Mitteilungen', pushCells, pushFoot)),
      h('div', { class: 'settings-col' },
        section('Darstellung', [
          h('div', { class: 'cell seg-cell' },
            segmented([{ value: 'system', label: 'System' }, { value: 'light', label: 'Hell' }, { value: 'dark', label: 'Dunkel' }], s.theme || 'system', (t) => updateSettings({ theme: t }), { large: true })),
        ]),
        section('Ton', [
          cell({ title: 'Signalton bei Rückmeldungen', end: switchEl(s.sound, (on) => updateSettings({ sound: on }), { label: 'Signalton' }) }),
        ], 'Bei Stornos und Nachfragen der Küche.'),
        section('Erweitert', [
          fieldCell('API-Basis', s.apiBase, { type: 'url', placeholder: 'https://api.github.com', onCommit: (x) => updateSettings({ apiBase: x || 'https://api.github.com' }) }),
        ]),
        section('Info', [
          cell({ title: 'Version', value: APP_VERSION }),
          cell({ title: 'Letzte Synchronisierung', end: h('div', { class: 'cell-value' }, infoSync) }),
          cell({ title: 'Küche zuletzt aktiv', end: h('div', { class: 'cell-value' }, infoKitchen) }),
          cell({ title: 'Geräte-ID', value: s.deviceId }),
        ], v.kitchenLastSeen ? kitchenText(v) : null))));

  refresh();
  el.refresh = refresh;
  return el;

  function rerender() { S.rerender?.(); }

  async function activatePush() {
    try {
      await enablePush(S.settings);
      toast('Mitteilungen aktiviert', { tone: 'green', icon: 'bell' });
    } catch (e) {
      await alert({ title: 'Mitteilungen nicht aktiviert', message: e.message });
    }
    rerender();
  }
  async function testPush() {
    try { await sendTestPush(S.settings); toast('Test gesendet', { icon: 'bell', tone: 'green', ms: 2500 }); }
    catch (e) { await alert({ title: 'Test fehlgeschlagen', message: e.message }); }
  }
}

export async function testConnection() {
  try {
    const r = await S.sync.testConnection();
    toast('Verbindung hergestellt', { message: `${r.files} Dateien im Daten-Gist`, tone: 'green', icon: 'checkCircle' });
    return true;
  } catch (e) {
    await alert({ title: 'Keine Verbindung', message: e.offline ? 'Der Server ist nicht erreichbar.' : e.message });
    return false;
  }
}

function openSetupCode(after) {
  const ta = h('textarea', { class: 'textarea code-input', rows: 4, placeholder: 'TAFEL1:…', autocapitalize: 'off', spellcheck: false });
  const paste = h('button', {
    class: 'btn tinted mid', onclick: async () => {
      try { ta.value = (await navigator.clipboard.readText()).trim(); } catch { ta.focus(); }
    },
  }, iconEl('copy'), 'Aus Zwischenablage einfügen');
  const sh = sheet({
    title: 'Einrichtungscode',
    body: h('div', { class: 'code-sheet' },
      h('p', { class: 'c2 t-sub' }, 'Der Einrichtungscode wird in der Küchen-App erzeugt und enthält alle Verbindungsdaten.'),
      ta, paste),
    right: {
      text: 'Übernehmen', bold: true,
      onClick: async () => {
        let patch;
        try { patch = parseSetupCode(ta.value); } catch (e) { await alert({ title: 'Ungültiger Code', message: 'Der Einrichtungscode konnte nicht gelesen werden.' }); return; }
        sh.close('save');
        updateSettings(patch);
        after?.();
        await testConnection();
      },
    },
  });
}

// ---------- Ersteinrichtung ----------

export function renderSetup(onDone) {
  const s = S.settings;
  const room = h('input', { class: 'input', placeholder: 'z. B. Wohnzimmer', value: s.deviceName || '', autocomplete: 'off', 'aria-label': 'Raumname' });
  const code = h('textarea', { class: 'textarea code-input', rows: 3, placeholder: 'TAFEL1:…', autocapitalize: 'off', spellcheck: false, 'aria-label': 'Einrichtungscode' });
  const paste = h('button', {
    class: 'btn tinted small', type: 'button', onclick: async () => {
      try { code.value = (await navigator.clipboard.readText()).trim(); } catch { code.focus(); }
    },
  }, 'Einfügen');

  const token = h('input', { class: 'input', type: 'password', placeholder: 'Token', autocomplete: 'off', value: s.token || '', 'aria-label': 'Token' });
  const gist = h('input', { class: 'input', placeholder: 'Daten-Gist-ID', autocomplete: 'off', autocapitalize: 'off', value: s.gistId || '', 'aria-label': 'Daten-Gist-ID' });
  const img = h('input', { class: 'input', placeholder: 'Bilder-Gist-ID', autocomplete: 'off', autocapitalize: 'off', value: s.imgGistId || '', 'aria-label': 'Bilder-Gist-ID' });
  const api = h('input', { class: 'input', type: 'url', placeholder: 'API-Basis', autocomplete: 'off', value: s.apiBase || '', 'aria-label': 'API-Basis' });
  const manual = h('div', { class: 'setup-manual', hidden: true },
    h('div', { class: 'setup-label' }, 'Verbindung manuell'), token, gist, img, api);
  const toggle = h('button', {
    class: 'btn plain small setup-toggle', type: 'button',
    onclick: () => { manual.hidden = !manual.hidden; codeBox.hidden = !manual.hidden; toggle.textContent = manual.hidden ? 'Ohne Einrichtungscode verbinden' : 'Mit Einrichtungscode verbinden'; },
  }, 'Ohne Einrichtungscode verbinden');
  const codeBox = h('div', { class: 'setup-code' },
    h('div', { class: 'setup-label row' }, h('span', { class: 'grow' }, 'Einrichtungscode'), paste), code,
    h('div', { class: 'setup-hint' }, 'Der Code wird in der Küchen-App erzeugt.'));
  const go = h('button', { class: 'btn block', onclick: connect }, 'Verbinden');

  const el = h('div', { class: 'setup' },
    h('div', { class: 'setup-card' },
      h('img', { class: 'setup-logo', src: 'icons/logo.svg', alt: '' }),
      h('h1', { class: 'setup-title' }, 'Tafel'),
      h('p', { class: 'setup-lead' }, 'Einrichtung als Bestellgerät. Jedes Gerät steht für einen Raum.'),
      h('div', { class: 'setup-form' },
        h('div', {}, h('div', { class: 'setup-label' }, 'Raumname'), room),
        codeBox, manual),
      go, toggle));

  async function connect() {
    const name = room.value.trim();
    if (!name) { await alert({ title: 'Raumname fehlt', message: 'Bitte einen Raumnamen angeben, z. B. „Wohnzimmer“.' }); room.focus(); return; }
    let patch = { deviceName: name };
    if (manual.hidden) {
      try { patch = { ...patch, ...parseSetupCode(code.value) }; } catch {
        await alert({ title: 'Ungültiger Code', message: 'Der Einrichtungscode konnte nicht gelesen werden.' }); return;
      }
    } else {
      if (!token.value.trim() || !gist.value.trim()) { await alert({ title: 'Angaben fehlen', message: 'Token und Daten-Gist-ID sind erforderlich.' }); return; }
      patch = { ...patch, token: token.value.trim(), gistId: gist.value.trim(), imgGistId: img.value.trim(), apiBase: api.value.trim() || 'https://api.github.com' };
    }
    const before = S.settings;
    go.disabled = true; go.textContent = 'Verbinde …';
    updateSettings(patch);
    try {
      await S.sync.testConnection();
      onDone();
    } catch (e) {
      go.disabled = false; go.textContent = 'Verbinden';
      if (e.offline) {
        if (await confirm('Server nicht erreichbar', 'Die Einrichtung wird gespeichert. Die Verbindung wird hergestellt, sobald das Netz verfügbar ist.', 'Fortfahren')) onDone();
        else updateSettings(before);
        return;
      }
      updateSettings(before);
      await alert({ title: 'Verbindung fehlgeschlagen', message: e.message });
    }
  }
  return el;
}
