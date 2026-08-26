/* eslint-disable no-bitwise */
// V8 gives WebAssembly modules that are compiled from raw bytes (instead of
// via the streaming APIs, which carry the response URL) a synthetic script
// name of the form `wasm://wasm/<hash>` or `wasm://wasm/<name>-<hash>` when
// the module has a module name in its "name" section. Stack frames of such
// modules use that synthetic name as their "url", so registering the debug
// image under the same name is the only way to associate frames with the
// image. The hash is V8's internal string hash field of the wire bytes:
// - for byte lengths above kMaxHashCalcLength (16383), V8 does not hash the
//   content at all and derives the hash field from the length alone, which
//   has been stable across all V8 versions in use,
// - for smaller modules, the content is hashed. V8 <= 13.3 (Chrome <= 133,
//   Node <= 24) uses a Jenkins one-at-a-time hash, V8 >= 13.4 uses rapidhash
//   (with the seed and secret pinned to their defaults for wasm script names,
//   so the output is never process-randomized). We register both candidates
//   since we cannot detect the engine version.
// If V8 ever changes this scheme, matching degrades to the single-image
// fallback in `patchFrames` and streaming modules stay unaffected.

const V8_MAX_HASH_CALC_LENGTH = 16383;

// V8 tags hash fields with 2 bits (hash << 2 | kHashTag).
function toHashField(hash: number): number {
  return (hash * 4 + 2) >>> 0;
}

function toHex(hashField: number): string {
  return hashField.toString(16).padStart(8, '0');
}

// Jenkins one-at-a-time with V8's finalization and zero seed, masked to the
// 30 hash bits V8 stores (V8 < 13.x).
function jenkinsHashField(bytes: Uint8Array): number {
  let h = 0;
  for (const byte of bytes) {
    h = (h + byte) >>> 0;
    h = (h + ((h << 10) >>> 0)) >>> 0;
    h = (h ^ (h >>> 6)) >>> 0;
  }
  h = (h + ((h << 3) >>> 0)) >>> 0;
  h = (h ^ (h >>> 11)) >>> 0;
  h = (h + ((h << 15) >>> 0)) >>> 0;
  h = h & 0x3fffffff;
  if (h === 0) {
    h = 27; // V8 kZeroHash
  }
  return toHashField(h);
}

// V8 does not hash the content of strings longer than kMaxHashCalcLength but
// uses the length itself as the hash.
function lengthHashField(byteLength: number): number {
  return toHashField(byteLength);
}

const MASK_64 = (1n << 64n) - 1n;
const RAPIDHASH_SECRET_0 = 0x2d358dccaa6c78a5n;
const RAPIDHASH_SECRET_1 = 0x8bb84b93962eacc9n;
const RAPIDHASH_SECRET_2 = 0x4b33a62ed433d4a3n;

function rapidMix(a: bigint, b: bigint): bigint {
  const product = a * b;
  return (product & MASK_64) ^ (product >> 64n);
}

function read64(bytes: Uint8Array, offset: number): bigint {
  let value = 0n;
  for (let i = 7; i >= 0; i--) {
    value = (value << 8n) | BigInt(bytes[offset + i] ?? 0);
  }
  return value;
}

function read32(bytes: Uint8Array, offset: number): bigint {
  let value = 0n;
  for (let i = 3; i >= 0; i--) {
    value = (value << 8n) | BigInt(bytes[offset + i] ?? 0);
  }
  return value;
}

// V8's rapidhash flavor (third_party/rapidhash-v8) with seed 0 and the
// default secret, as used for wasm script names (V8 >= 13.4). Only ever
// called for inputs of at most kMaxHashCalcLength bytes. Valid wasm is at
// least 8 bytes, so the sub-4-byte input branch of the original is omitted.
function rapidhashHashField(bytes: Uint8Array): number {
  const length = bytes.length;
  const length64 = BigInt(length);
  let seed = (rapidMix(RAPIDHASH_SECRET_0, RAPIDHASH_SECRET_1) ^ length64) & MASK_64;
  let a: bigint;
  let b: bigint;
  if (length <= 16) {
    const plast = length - 4;
    const delta = (length & 24) >> (length >> 3);
    a = ((read32(bytes, 0) << 32n) | read32(bytes, plast)) & MASK_64;
    b = ((read32(bytes, delta) << 32n) | read32(bytes, plast - delta)) & MASK_64;
  } else {
    let remaining = length;
    let p = 0;
    if (remaining > 48) {
      let see1 = seed;
      let see2 = seed;
      do {
        seed = rapidMix(read64(bytes, p) ^ RAPIDHASH_SECRET_0, read64(bytes, p + 8) ^ seed);
        see1 = rapidMix(read64(bytes, p + 16) ^ RAPIDHASH_SECRET_1, read64(bytes, p + 24) ^ see1);
        see2 = rapidMix(read64(bytes, p + 32) ^ RAPIDHASH_SECRET_2, read64(bytes, p + 40) ^ see2);
        p += 48;
        remaining -= 48;
      } while (remaining >= 48);
      seed = (seed ^ see1 ^ see2) & MASK_64;
    }
    if (remaining > 16) {
      seed = rapidMix(read64(bytes, p) ^ RAPIDHASH_SECRET_2, read64(bytes, p + 8) ^ seed ^ RAPIDHASH_SECRET_1);
      if (remaining > 32) {
        seed = rapidMix(read64(bytes, p + 16) ^ RAPIDHASH_SECRET_2, read64(bytes, p + 24) ^ seed);
      }
    }
    a = read64(bytes, p + remaining - 16);
    b = read64(bytes, p + remaining - 8);
  }
  a = (a ^ RAPIDHASH_SECRET_1) & MASK_64;
  b = (b ^ seed) & MASK_64;
  const product = a * b;
  a = product & MASK_64;
  b = (product >> 64n) & MASK_64;
  const raw = rapidMix((a ^ RAPIDHASH_SECRET_0 ^ length64) & MASK_64, (b ^ RAPIDHASH_SECRET_1) & MASK_64);
  let hash = Number(raw & 0x3fffffffn);
  if (hash === 0) {
    hash = 27; // V8 kZeroHash
  }
  return toHashField(hash);
}

/**
 * Returns a normalized byte view over a BufferSource, or undefined if the
 * value is not a BufferSource or cannot be read (e.g. a detached buffer,
 * which must reject asynchronously through the original API instead of
 * throwing synchronously here).
 */
export function toByteView(source: unknown): Uint8Array | undefined {
  try {
    // instanceof is realm-bound, the toString check also catches ArrayBuffers
    // from other realms (e.g. iframes)
    if (source instanceof ArrayBuffer || Object.prototype.toString.call(source) === '[object ArrayBuffer]') {
      return new Uint8Array(source as ArrayBuffer);
    }
    if (ArrayBuffer.isView(source)) {
      return new Uint8Array(source.buffer, source.byteOffset, source.byteLength);
    }
  } catch {
    // fall through
  }
  return undefined;
}

/**
 * Computes the hex hash-field candidates V8 may use in the synthetic script
 * name for a module with the given wire bytes.
 *
 * Must be called synchronously when the buffer is received, before the caller
 * has a chance to mutate or detach it (engines capture the bytes at call time
 * as well).
 */
export function getHashCandidates(bytes: Uint8Array): string[] {
  if (bytes.byteLength > V8_MAX_HASH_CALC_LENGTH) {
    return [toHex(lengthHashField(bytes.byteLength))];
  }
  if (bytes.byteLength < 8) {
    // shorter than the wasm header, compilation will fail anyway
    return [];
  }
  const candidates = [toHex(jenkinsHashField(bytes))];
  // Engines without BigInt predate V8's switch to rapidhash, so skipping the
  // rapidhash candidate there loses nothing.
  if (typeof BigInt === 'function') {
    candidates.unshift(toHex(rapidhashHashField(bytes)));
  }
  return candidates;
}

/**
 * Extracts the module name from the "name" custom section, if present.
 */
export function getModuleName(module: WebAssembly.Module): string | undefined {
  try {
    const nameSection = WebAssembly.Module.customSections(module, 'name')[0];
    if (!nameSection) {
      return undefined;
    }
    const bytes = new Uint8Array(nameSection);
    let pos = 0;
    const readLeb128 = (): number => {
      let result = 0;
      let shift = 0;
      let byte;
      do {
        byte = bytes[pos++] ?? 0;
        result |= (byte & 0x7f) << shift;
        shift += 7;
      } while (byte & 0x80);
      return result >>> 0;
    };
    while (pos < bytes.length) {
      const subsectionId = bytes[pos++];
      const subsectionLength = readLeb128();
      if (subsectionId === 0) {
        const nameLength = readLeb128();
        // fatal, because V8 ignores names that are not valid UTF-8
        const name = new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(pos, pos + nameLength));
        return name || undefined;
      }
      pos += subsectionLength;
    }
  } catch {
    // malformed name section, fall through
  }
  return undefined;
}

/**
 * Builds the synthetic script names V8 may report in stack frames for a
 * buffer-compiled module. The first entry is used as the debug image's
 * `code_file`, all entries are used for frame matching.
 */
export function getSyntheticUrls(module: WebAssembly.Module, hashCandidates: string[]): string[] {
  const moduleName = getModuleName(module);
  const prefix = moduleName ? `${moduleName}-` : '';
  return hashCandidates.map(hash => `wasm://wasm/${prefix}${hash}`);
}
