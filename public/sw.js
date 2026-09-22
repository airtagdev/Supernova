// One root worker owns both engines, including subresources and nested frames.
importScripts('/scram/scramjet.all.js', '/uv/uv.bundle.js', '/uv-config.js', '/uv/uv.sw.js');
const { ScramjetServiceWorker } = $scramjetLoadWorker();
const scramjet = new ScramjetServiceWorker();
const ultraviolet = new UVServiceWorker();
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
self.addEventListener('message', event => { if (event.data?.type === 'SKIP_WAITING') self.skipWaiting(); });
async function proxyRequest(event) {
  // UV must work on a fresh profile, without a Scramjet config in IndexedDB.
  if (ultraviolet.route(event)) return ultraviolet.fetch(event);
  await scramjet.loadConfig();
  if (!scramjet.config) throw new Error('Scramjet configuration is missing. Reopen the page from Supernova.');
  return scramjet.route(event) ? scramjet.fetch(event) : fetch(event.request);
}
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  if (!url.pathname.startsWith('/service/') && !url.pathname.startsWith('/uv/service/')
      && url.pathname !== '/scram/scramjet.wasm.wasm') return;
  // A missing Scramjet config must never block UI, chat, or transport assets.
  event.respondWith(proxyRequest(event).catch(error => {
    console.error('Proxy request failed:', error);
    const document = ['document', 'iframe'].includes(event.request.destination);
    return new Response(document
      ? '<!doctype html><title>Unable to load page</title><h1 id="supernova-proxy-error">The proxy could not load this page.</h1><p>Use Retry in the Supernova toolbar, or try the other proxy engine in Settings.</p>'
      : 'Proxy request failed', {
      status: 502,
      headers: { 'Content-Type': document ? 'text/html; charset=utf-8' : 'text/plain; charset=utf-8', 'Cross-Origin-Embedder-Policy': 'require-corp', 'Cache-Control': 'no-store' }
    });
  }));
});
