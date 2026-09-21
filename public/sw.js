// A minimal service worker: it makes the app installable and never touches a request, so nothing is cached
// and the newest version of the app is always the one that loads.
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))
self.addEventListener('fetch', () => {})
