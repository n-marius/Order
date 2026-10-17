// Web-Push über den Cloudflare Worker sowie lokale Mitteilungen.

export const isStandalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
export const pushSupported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

/** 'unsupported' | 'install' (iOS: erst zum Home-Bildschirm) | 'noworker' | 'denied' | 'default' | 'granted' */
export function pushState(settings) {
  if (!pushSupported()) return /iPad|iPhone|Macintosh/.test(navigator.userAgent) && !isStandalone() ? 'install' : 'unsupported';
  if (!settings.workerUrl) return 'noworker';
  return Notification.permission;
}

export async function registerSW(path = './sw.js') {
  if (!('serviceWorker' in navigator)) return null;
  try { return await navigator.serviceWorker.register(path); } catch (e) { console.warn('SW', e); return null; }
}

const b64ToBytes = (s) => {
  const b = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4));
  return Uint8Array.from(b, (c) => c.charCodeAt(0));
};

async function worker(settings, path, body) {
  const res = await fetch(settings.workerUrl.replace(/\/$/, '') + path, {
    method: body ? 'POST' : 'GET',
    headers: { 'Content-Type': 'application/json', 'X-Tafel-Key': settings.workerKey },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(res.status === 401 ? 'Haushaltsschlüssel falsch' : `Push-Server: ${res.status}`);
  return res.json();
}

/** Muss aus einer Nutzeraktion (Tippen) heraus aufgerufen werden. */
export async function enablePush(settings) {
  if (!pushSupported()) throw new Error(isStandalone() ? 'Push wird hier nicht unterstützt' : 'Erst über „Teilen → Zum Home-Bildschirm“ installieren');
  if (!settings.workerUrl) throw new Error('Push-Server (Worker-URL) fehlt');
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') throw new Error('Mitteilungen wurden nicht erlaubt');
  await subscribe(settings);
}

/** Abo (erneut) beim Worker hinterlegen. Ohne Nachfrage, nur wenn bereits erlaubt. */
export async function subscribe(settings) {
  if (!pushSupported() || !settings.workerUrl || Notification.permission !== 'granted') return false;
  const reg = await navigator.serviceWorker.ready;
  const { publicKey } = await worker(settings, '/vapid');
  let sub = await reg.pushManager.getSubscription();
  const keyMatches = sub && sub.options?.applicationServerKey &&
    btoa(String.fromCharCode(...new Uint8Array(sub.options.applicationServerKey))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') === publicKey;
  if (sub && !keyMatches) { await sub.unsubscribe(); sub = null; }
  sub ||= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(publicKey) });
  await worker(settings, '/subscribe', { deviceId: settings.deviceId, role: settings.role, name: settings.deviceName, subscription: sub.toJSON() });
  localStorage.setItem(`tafel.pushsub.${settings.role}`, String(Date.now()));
  return true;
}

/** Beim Start: Abo höchstens einmal täglich auffrischen. */
export function refreshSubscription(settings) {
  const last = +localStorage.getItem(`tafel.pushsub.${settings.role}`) || 0;
  if (Date.now() - last > 86400000) subscribe(settings).catch(() => {});
}

export async function sendTestPush(settings) {
  return worker(settings, '/notify', { to: { deviceIds: [settings.deviceId] }, title: 'Test', body: 'Mitteilungen funktionieren.', tag: 'test' });
}

/**
 * Lokale Mitteilung (nur ohne Worker sinnvoll oder für rein lokale Ereignisse).
 * Wird nur gezeigt, wenn die App nicht im Vordergrund ist.
 */
export async function localNotify(title, body, tag) {
  if (!('Notification' in window) || Notification.permission !== 'granted' || !document.hidden) return;
  try {
    const reg = await navigator.serviceWorker.ready;
    await reg.showNotification(title, { body, tag, icon: './icons/icon-192.png', badge: './icons/icon-192.png' });
  } catch {}
}

/** Lokale Mitteilung, auch bei geöffneter App (für Erlaubnis ohne Worker). */
export async function requestLocalPermission() {
  if (!('Notification' in window)) return 'unsupported';
  return Notification.requestPermission();
}
