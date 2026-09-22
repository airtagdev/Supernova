importScripts('/uv/uv.bundle.js', '/uv-config.js', '/uv/uv.sw.js');
const ultraviolet = new UVServiceWorker();
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
self.addEventListener('message', event => { if (event.data?.type === 'SKIP_WAITING') self.skipWaiting(); });
self.addEventListener('fetch', event => {
  if (ultraviolet.route(event)) event.respondWith(ultraviolet.fetch(event));
});
