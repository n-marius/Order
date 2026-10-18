// Service Worker der App „Bestellen“. Bei Änderungen an der Dateiliste die Versionsnummer erhöhen.
self.TAFEL_CACHE = 'tafel-bestellen-v5';
self.TAFEL_ASSETS = [
  './',
  './index.html',
  './app.js',
  './store.js',
  './menu.js',
  './cart.js',
  './orders.js',
  './watch.js',
  './settings.js',
  './stock.js',
  './app.css',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-180.png',
  './icons/logo.svg',
  '../shared/core.js',
  '../shared/db.js',
  '../shared/sync.js',
  '../shared/model.js',
  '../shared/push.js',
  '../shared/sound.js',
  '../shared/icons.js',
  '../shared/ui.js',
  '../shared/styles.css',
];
importScripts('../shared/sw-core.js');
