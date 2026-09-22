import test from 'node:test';
import assert from 'node:assert/strict';
import { getEventListeners } from 'node:events';
import { workerUrl, waitForWorker, registerProxyWorker, scramjetConfig, withTimeout } from '../public/proxy-runtime.js';

const origin = 'https://supernova.test';
const scriptURL = new URL(workerUrl, origin).href;
function worker(url = scriptURL, state = 'activated') {
  return Object.assign(new EventTarget(), { scriptURL: url, state, messages: [], postMessage(message) { this.messages.push(message); } });
}
function setup() {
  const active = worker();
  const registration = Object.assign(new EventTarget(), { active, scope: origin + '/' });
  const container = Object.assign(new EventTarget(), { controller: active });
  return { active, registration, container };
}
test('fresh worker is ready only after activation AND control', async () => {
  const { active, registration, container } = setup();
  active.state = 'activating'; container.controller = null;
  let ready = false;
  const pending = waitForWorker(container, registration, scriptURL).then(() => { ready = true; });
  active.state = 'activated'; active.dispatchEvent(new Event('statechange'));
  await Promise.resolve(); assert.equal(ready, false);
  container.controller = active; container.dispatchEvent(new Event('controllerchange'));
  await pending;
  assert.equal(getEventListeners(container, 'controllerchange').length, 0);
  assert.equal(getEventListeners(active, 'statechange').length, 0);
});
test('an old active worker does not satisfy an update; waiting worker is promoted', async () => {
  const { registration, container } = setup();
  const old = worker(origin + '/sw.js?v=old');
  const next = worker(scriptURL, 'installed');
  registration.active = old; registration.waiting = next; container.controller = old;
  let ready = false;
  const pending = waitForWorker(container, registration, scriptURL).then(() => { ready = true; });
  await Promise.resolve(); assert.equal(ready, false);
  assert.equal(next.messages[0].type, 'SKIP_WAITING');
  next.state = 'activated'; registration.active = next; registration.waiting = null;
  next.dispatchEvent(new Event('statechange'));
  await Promise.resolve(); assert.equal(ready, false);
  container.controller = next; container.dispatchEvent(new Event('controllerchange'));
  await pending;
});
test('already-active worker resolves immediately (no missed statechange race)', async () => {
  const { container, registration } = setup();
  assert.equal(await waitForWorker(container, registration, scriptURL), registration);
});
test('failed installation rejects without waiting indefinitely', async () => {
  const { container, registration } = setup();
  container.controller = null; registration.active = null;
  const installing = worker(scriptURL, 'installing'); registration.installing = installing;
  const pending = waitForWorker(container, registration, scriptURL);
  registration.installing = null; installing.state = 'redundant'; installing.dispatchEvent(new Event('statechange'));
  await assert.rejects(pending, /failed to install/);
});
test('worker timeout cleans up listeners and returns a repair instruction', async () => {
  const { container, registration } = setup(); container.controller = null;
  await assert.rejects(waitForWorker(container, registration, scriptURL, 5), /did not take control/);
  assert.equal(getEventListeners(container, 'controllerchange').length, 0);
  assert.equal(getEventListeners(registration, 'updatefound').length, 0);
});
test('UV-first migration registers root and removes only the owned legacy scope', async () => {
  const { container, registration } = setup();
  const removed = [];
  const legacy = { scope: origin + '/uv/service/', active: worker(origin + '/uv-sw.js?v=old'), unregister: async () => removed.push('uv') };
  const unrelated = { scope: origin + '/games/', active: worker(origin + '/games/sw.js'), unregister: async () => removed.push('game') };
  container.register = async (url, options) => { assert.equal(url, workerUrl); assert.equal(options.scope, '/'); return registration; };
  container.getRegistrations = async () => [registration, legacy, unrelated];
  await registerProxyWorker(container, origin);
  assert.deepEqual(removed, ['uv']);
});
test('startup operations time out with a useful error and preserve rejections', async () => {
  await assert.rejects(withTimeout(new Promise(() => {}), 'transport timed out', 5), /transport timed out/);
  await assert.rejects(withTimeout(Promise.reject(new Error('storage failed')), 'timeout'), /storage failed/);
  assert.equal(await withTimeout(Promise.resolve(7), 'timeout'), 7);
});
test('game profile covers portal and nested CDN frames without matching unrelated hosts', () => {
  const config = scramjetConfig();
  const matches = url => Object.entries(config.siteFlags).some(([pattern, flags]) => new RegExp(pattern).test(url) && flags.syncxhr);
  for (const url of ['https://poki.com/en/g/example', 'https://games.poki-gdn.com/game/index.html', 'https://a.poki-cdn.com/loader.js', 'https://www.crazygames.com/game/example', 'https://games.crazygames.com/en_US/example/index.html', 'https://files.crazygamesfiles.com/game.data']) assert.equal(matches(url), true, url);
  for (const url of ['https://example.com/?url=https://poki.com/', 'https://poki.com.evil.test/', 'https://notpoki.com/', 'https://poki.com@evil.test/', 'https://example.com/']) assert.equal(matches(url), false, url);
  assert.equal(config.flags, undefined); // Other sites retain upstream defaults.
});
