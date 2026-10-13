/* Wi-Fi Hub service worker. Keep network/API responses out of the cache. */
const CACHE_NAME = 'wifi-hub-static-v10';
const APP_SHELL = [
  './', './index.html', './home.html','./activity.html','./js/v10-enhancements.js','./help.html','./js/help.js','./js/theme-menu.js',  './network.html', './templates.html', './js/templates.js',
  './devices.html', './bluetooth.html', './profile.html', './users.html',
  './settings.html', './ai-tutor.html', './css/style.css', './css/app.css',
  './assets/wifi-hub-logo.svg', './manifest.json', './js/common.js', './js/firebase.js', './js/auth.js', './js/dashboard.js','./js/bluetooth.js', './js/devices.js', './js/bluetooth.js', './js/settings.js', './js/profile.js', './js/network.js', './js/users.js', './js/ai-tutor.js', './js/install.js', './icons/icon-192.png', './icons/icon-512.png'
];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL)).catch(() => {}));
  self.skipWaiting();
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key)))));
  self.clients.claim();
});
self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.includes('/api/')) return;
  event.respondWith(fetch(request).then(response => {
    if (response.ok && (request.destination === 'style' || request.destination === 'script' || request.destination === 'image' || request.mode === 'navigate')) {
      const copy = response.clone(); caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
    }
    return response;
  }).catch(() => caches.match(request).then(cached => cached || (request.mode === 'navigate' ? caches.match('./index.html') : undefined))));
});
