import test from 'node:test';
import assert from 'node:assert/strict';
import { isRammerheadRequest, rammerheadUrl } from '../rammerhead-runtime.js';

test('Rammerhead traffic is separated from Supernova routes', () => {
  const id = '0123456789abcdef0123456789abcdef';
  for (const path of [
    `/${id}/https://example.com/game`,
    '/hammerhead.js',
    '/iframe-task.js',
    '/messaging',
    '/rammerhead.js',
    '/syncLocalStorage?sessionId=abc',
    '/task.js',
    '/transport-worker.js',
    '/worker-hammerhead.js',
    '/api/shuffleDict?id=abc'
  ]) assert.equal(isRammerheadRequest(path), true, path);

  for (const path of ['/', '/app.js', '/games.json', '/api/chat/events', '/api/proxy/rammerhead/session', '/health']) {
    assert.equal(isRammerheadRequest(path), false, path);
  }
});

test('Rammerhead URLs only accept valid sessions and web destinations', () => {
  const id = '0123456789abcdef0123456789abcdef';
  assert.equal(rammerheadUrl(id, 'https://example.com/game?q=1'), `/${id}/https://example.com/game?q=1`);
  assert.throws(() => rammerheadUrl('bad', 'https://example.com'), /Invalid Rammerhead session/);
  assert.throws(() => rammerheadUrl(id, 'file:///etc/passwd'), /only supports HTTP and HTTPS/);
});
