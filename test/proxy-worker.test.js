import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('../public/sw.js', import.meta.url), 'utf8');
function harness({ config = true, fail = false } = {}) {
  const handlers = new Map(), calls = [];
  class ScramjetServiceWorker {
    async loadConfig() { calls.push('config'); this.config = config ? { prefix: '/service/' } : null; }
    route(event) { return event.request.url.includes('/service/') || event.request.url.endsWith('/scramjet.wasm.wasm'); }
    async fetch(event) { calls.push(['scramjet', event]); if (fail) throw new Error('transport failed'); return new Response('scramjet'); }
  }
  class UVServiceWorker {
    route(event) { return event.request.url.startsWith('https://supernova.test/uv/service/'); }
    async fetch(event) { calls.push(['uv', event]); if (fail) throw new Error('transport failed'); return new Response('ultraviolet'); }
  }
  const self = { location: { origin: 'https://supernova.test' }, addEventListener: (type, fn) => handlers.set(type, fn), skipWaiting() {}, clients: { claim() {} } };
  vm.runInNewContext(source, { self, URL, Response, importScripts() {}, $scramjetLoadWorker: () => ({ ScramjetServiceWorker }), UVServiceWorker, console: { error() {} }, fetch: async () => { calls.push('network'); return new Response('network'); } });
  function request(path, destination = 'iframe') {
    let response;
    const event = { request: { url: new URL(path, self.location.origin).href, destination }, clientId: 'nested-game-frame', respondWith(value) { response = value; } };
    handlers.get('fetch')(event);
    return { response, event };
  }
  return { calls, request };
}
test('UV navigation works without any Scramjet configuration', async () => {
  const { request, calls } = harness({ config: false });
  assert.equal(await (await request('/uv/service/encoded-url').response).text(), 'ultraviolet');
  assert.equal(calls.some(call => call === 'config'), false);
});
test('app, chat, UV scripts and BareMux worker bypass Scramjet storage', () => {
  const { request, calls } = harness({ config: false });
  for (const path of ['/', '/app.js', '/health', '/api/chat/events', '/uv/uv.bundle.js', '/baremux/worker.js', '/libcurl/index.mjs']) assert.equal(request(path).response, undefined, path);
  assert.deepEqual(calls, []);
});
test('nested frames, workers and WASM requests retain their original event and client id', async () => {
  for (const [path, destination, engine] of [
    ['/service/https%3A%2F%2Fgames.poki-gdn.com%2Findex.html', 'iframe', 'scramjet'],
    ['/service/https%3A%2F%2Fgames.crazygames.com%2Fworker.js', 'worker', 'scramjet'],
    ['/service/https%3A%2F%2Fgames.crazygames.com%2Fgame.wasm', '', 'scramjet'],
    ['/uv/service/encoded-worker', 'worker', 'uv'],
    ['/scram/scramjet.wasm.wasm', '', 'scramjet']
  ]) {
    const { request, calls } = harness(); const result = request(path, destination);
    await result.response;
    assert.equal(calls.at(-1)[0], engine); assert.equal(calls.at(-1)[1], result.event);
  }
});
test('missing config returns a visible error rather than a rejected fetch', async () => {
  const result = await harness({ config: false }).request('/service/encoded-url').response;
  assert.equal(result.status, 502);
  assert.match(await result.text(), /id="supernova-proxy-error"/);
  assert.equal(result.headers.get('cross-origin-embedder-policy'), 'require-corp');
});
test('transport errors have document and subresource appropriate responses', async () => {
  const { request } = harness({ fail: true });
  for (const path of ['/service/encoded-url', '/uv/service/encoded-url']) {
    const document = await request(path).response;
    assert.equal(document.status, 502); assert.match(await document.text(), /supernova-proxy-error/);
    const binary = await request(path, '').response;
    assert.equal(binary.status, 502); assert.equal(await binary.text(), 'Proxy request failed');
  }
});
