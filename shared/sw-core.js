// Gemeinsame Service-Worker-Logik. Wird per importScripts() aus kueche/sw.js bzw. bestellen/sw.js geladen,
// die vorher self.TAFEL_CACHE und self.TAFEL_ASSETS setzen.

const CACHE = self.TAFEL_CACHE;
const ASSETS = self.TAFEL_ASSETS || [];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  const prefix = CACHE.replace(/-v[^-]+$/, '-');
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith(prefix) && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// Eigene Dateien: Netz zuerst (Updates sofort, keine gemischten Versionen), nach 2,5 s oder offline aus dem Cache.
// Fremde Hosts (GitHub-API, Worker) nie cachen.
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const net = fetch(e.request, { cache: 'no-cache' })
      .then((res) => { if (res.ok) cache.put(e.request, res.clone()); return res; })
      .catch(() => null);
    const timeout = new Promise((r) => setTimeout(() => r(null), 2500));
    const first = await Promise.race([net, timeout]);
    if (first) return first;
    const hit = await cache.match(e.request, { ignoreSearch: true })
      || (e.request.mode === 'navigate' ? await cache.match('./index.html') : null);
    if (hit) { e.waitUntil(net); return hit; }
    return (await net) || Response.error();
  })());
});

self.addEventListener('push', (e) => {
  let data = {};
  try { data = e.data ? e.data.json() : {}; } catch { data = { body: e.data?.text() }; }
  const title = data.title || 'Tafel';
  e.waitUntil((async () => {
    await self.registration.showNotification(title, {
      body: data.body || '',
      tag: data.tag || undefined,
      renotify: !!data.tag,
      icon: './icons/icon-192.png',
      badge: './icons/icon-192.png',
      data: { url: data.url || './' },
    });
    const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    clients.forEach((c) => c.postMessage({ type: 'push', data }));
  })());
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const target = new URL(e.notification.data?.url || './', self.registration.scope).href;
  e.waitUntil((async () => {
    const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of clients) {
      if (c.url.startsWith(self.registration.scope)) {
        c.postMessage({ type: 'open', url: target });
        return c.focus();
      }
    }
    return self.clients.openWindow(target);
  })());
});
