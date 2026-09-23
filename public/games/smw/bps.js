const crcTable = new Uint32Array(256);
for (let index = 0; index < 256; index++) {
  let value = index;
  for (let bit = 0; bit < 8; bit++) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  crcTable[index] = value >>> 0;
}

export function crc32(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  let crc = 0xffffffff;
  for (const byte of bytes) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function uint32(bytes, offset) {
  return (bytes[offset] | bytes[offset + 1] << 8 | bytes[offset + 2] << 16 | bytes[offset + 3] << 24) >>> 0;
}

class Reader {
  constructor(bytes, limit = bytes.length) { this.bytes = bytes; this.offset = 0; this.limit = limit; }
  byte() {
    if (this.offset >= this.limit) throw new Error('The BPS patch ended unexpectedly.');
    return this.bytes[this.offset++];
  }
  number() {
    let result = 0;
    let shift = 1;
    while (true) {
      const value = this.byte();
      result += (value & 0x7f) * shift;
      if (value & 0x80) return result;
      shift *= 128;
      result += shift;
      if (!Number.isSafeInteger(result) || !Number.isSafeInteger(shift)) throw new Error('The BPS patch contains an invalid number.');
    }
  }
}

export function inspectBps(input) {
  const patch = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (patch.length < 19 || String.fromCharCode(...patch.subarray(0, 4)) !== 'BPS1') throw new Error('This is not a valid BPS patch.');
  const reader = new Reader(patch, patch.length - 12);
  reader.offset = 4;
  const sourceSize = reader.number();
  const targetSize = reader.number();
  const metadataSize = reader.number();
  if (reader.offset + metadataSize > reader.limit) throw new Error('The BPS metadata is invalid.');
  reader.offset += metadataSize;
  return {
    sourceSize,
    targetSize,
    actionOffset: reader.offset,
    sourceCrc: uint32(patch, patch.length - 12),
    targetCrc: uint32(patch, patch.length - 8),
    patchCrc: uint32(patch, patch.length - 4)
  };
}

export function normalizeSource(input, expectedSize) {
  const source = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (source.length === expectedSize) return source;
  if (source.length === expectedSize + 512) return source.subarray(512);
  throw new Error(`This patch needs a ${expectedSize}-byte clean Super Mario World ROM. The selected file is ${source.length} bytes.`);
}

export function applyBps(sourceInput, patchInput) {
  const patch = patchInput instanceof Uint8Array ? patchInput : new Uint8Array(patchInput);
  const info = inspectBps(patch);
  const source = normalizeSource(sourceInput, info.sourceSize);
  if (crc32(source) !== info.sourceCrc) throw new Error('This is not the clean Super Mario World ROM required by this patch.');
  if (crc32(patch.subarray(0, patch.length - 4)) !== info.patchCrc) throw new Error('The BPS patch is damaged.');

  const reader = new Reader(patch, patch.length - 12);
  reader.offset = info.actionOffset;
  const target = new Uint8Array(info.targetSize);
  let outputOffset = 0;
  let sourceRelativeOffset = 0;
  let targetRelativeOffset = 0;
  const copy = (readByte, length) => {
    if (outputOffset + length > target.length) throw new Error('The BPS patch writes beyond the target ROM.');
    for (let index = 0; index < length; index++) target[outputOffset++] = readByte();
  };

  while (outputOffset < target.length) {
    const instruction = reader.number();
    const action = instruction % 4;
    const length = Math.floor(instruction / 4) + 1;
    if (action === 0) {
      copy(() => {
        if (outputOffset >= source.length) throw new Error('The BPS source-read action is out of range.');
        return source[outputOffset];
      }, length);
    } else if (action === 1) {
      copy(() => reader.byte(), length);
    } else if (action === 2) {
      const encoded = reader.number();
      sourceRelativeOffset += (encoded & 1 ? -1 : 1) * Math.floor(encoded / 2);
      copy(() => {
        if (sourceRelativeOffset < 0 || sourceRelativeOffset >= source.length) throw new Error('The BPS source-copy action is out of range.');
        return source[sourceRelativeOffset++];
      }, length);
    } else {
      const encoded = reader.number();
      targetRelativeOffset += (encoded & 1 ? -1 : 1) * Math.floor(encoded / 2);
      copy(() => {
        if (targetRelativeOffset < 0 || targetRelativeOffset >= outputOffset) throw new Error('The BPS target-copy action is out of range.');
        return target[targetRelativeOffset++];
      }, length);
    }
  }

  if (crc32(target) !== info.targetCrc) throw new Error('The patched ROM failed its checksum.');
  return target;
}
