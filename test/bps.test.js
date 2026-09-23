import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { applyBps, crc32, inspectBps, normalizeSource } from '../public/games/smw/bps.js';

function number(value) {
  const output = [];
  while (true) {
    const byte = value & 0x7f;
    value = Math.floor(value / 128);
    if (value === 0) { output.push(byte | 0x80); return output; }
    output.push(byte);
    value--;
  }
}

function uint32(value) {
  return [value & 0xff, value >>> 8 & 0xff, value >>> 16 & 0xff, value >>> 24 & 0xff];
}

function targetReadPatch(source, target) {
  const body = new Uint8Array([
    ...new TextEncoder().encode('BPS1'),
    ...number(source.length), ...number(target.length), ...number(0),
    ...number((target.length - 1) * 4 + 1), ...target,
    ...uint32(crc32(source)), ...uint32(crc32(target))
  ]);
  return new Uint8Array([...body, ...uint32(crc32(body))]);
}

test('BPS patching validates checksums and creates the target ROM', () => {
  const source = new Uint8Array([1, 2, 3]);
  const target = new Uint8Array([8, 7, 6, 5]);
  const patch = targetReadPatch(source, target);
  assert.deepEqual(applyBps(source, patch), target);
  assert.throws(() => applyBps(new Uint8Array([1, 2, 4]), patch), /not the clean/);
  patch[8] ^= 1;
  assert.throws(() => applyBps(source, patch), /damaged/);
});

test('copier headers are removed before patching', () => {
  const source = new Uint8Array([1, 2, 3]);
  const headered = new Uint8Array(515); headered.set(source, 512);
  assert.deepEqual(normalizeSource(headered, 3), source);
});

test('all bundled Mario patches target the same clean SMW revision', async () => {
  for (const name of ['awesome-mario-world', 'mega-mario-world', 'super-mario-legacy', 'superstar-mario-world', 'total-mario-world']) {
    const patch = await readFile(new URL(`../public/games/smw/patches/${name}.bps`, import.meta.url));
    const info = inspectBps(patch);
    assert.equal(info.sourceSize, 524288, name);
    assert.equal(info.sourceCrc, 0xb19ed489, name);
    assert.ok([2097152, 4194304].includes(info.targetSize), name);
  }
});
