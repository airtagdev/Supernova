import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const roms = Object.freeze({
  'awesome-mario-world.sfc': 'fa6c2b95271e78404540e6cbcea257687e692b33b48b61b34ac1a8683632d083',
  'mega-mario-world.sfc': 'da91ba1324a467aa0eeda7507f867cec8f7e6bf5ad4b7d5a66062b8313a59ca9',
  'super-mario-legacy.sfc': '63b38b534eb704283ffa0b76eeeb9a47f1d2c6f0ce112a4b9660e4d2c7fbb38b',
  'superstar-mario-world.sfc': 'd453f9b8938b0dbdf7217e145556877c76278953060572d8b4c83a279a3ce516',
  'total-mario-world.sfc': 'b0c43f8e98d524d994b921f74f8032db5fcd91c489d4b6eb5e0cebda4ab8f982'
});

test('bundled SMW ROMs are present and match their verified files', async () => {
  for (const [filename, expectedHash] of Object.entries(roms)) {
    const file = await readFile(new URL(`../public/games/smw/roms/${filename}`, import.meta.url));
    assert.ok(file.length >= 1024 * 1024, `${filename} is unexpectedly small`);
    assert.equal(file.length % 0x8000, 0, `${filename} has an invalid SNES ROM size`);
    assert.equal(createHash('sha256').update(file).digest('hex'), expectedHash);
  }
});
