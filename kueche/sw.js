// Service Worker der App „Küche“. Bei Änderungen an der Dateiliste die Versionsnummer erhöhen.
self.TAFEL_CACHE = 'tafel-kueche-v5';
self.TAFEL_ASSETS = [
  './',
  './index.html',
  './app.js',
  './ctx.js',
  './signals.js',
  './orders.js',
  './dishes.js',
  './ingredients.js',
  './settings.js',
  './vorlage.js',
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
