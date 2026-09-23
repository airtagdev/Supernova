import test from 'node:test';
import assert from 'node:assert/strict';
import { getSmwGameArchive, smwGameArchives } from '../smw-games.js';

test('SMW archive allowlist contains only the five library games', () => {
  assert.deepEqual(Object.keys(smwGameArchives).sort(), [
    'awesome-mario-world',
    'mega-mario-world',
    'super-mario-legacy',
    'superstar-mario-world',
    'total-mario-world'
  ]);
  for (const url of Object.values(smwGameArchives)) {
    const parsed = new URL(url);
    assert.equal(parsed.protocol, 'https:');
    assert.equal(parsed.hostname, 'files.smwgames.com');
    assert.match(parsed.pathname, /\/\d+\.7z$/);
  }
});

test('SMW archive lookup rejects unknown and inherited keys', () => {
  assert.equal(getSmwGameArchive('not-a-game'), null);
  assert.equal(getSmwGameArchive('toString'), null);
  assert.equal(getSmwGameArchive('awesome-mario-world'), smwGameArchives['awesome-mario-world']);
});
