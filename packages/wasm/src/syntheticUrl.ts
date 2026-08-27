/* eslint-disable no-bitwise */
// V8 gives WebAssembly modules that are compiled from raw bytes (instead of
// via the streaming APIs, which carry the response URL) a synthetic script
// name of the form `wasm://wasm/<hash>`, or `wasm://wasm/<name>-<hash>` when
// the module has a module name in its "name" section. Stack frames of such
// modules use that synthetic name as their "url", so registering the debug
// image under the same name is the only way to associate frames with the
// image.
//
// The hash is V8's internal string hash of the wire bytes, and it is only a
// content hash for inputs up to 16383 bytes. Above that V8 skips hashing and
// derives the value from the byte length alone, which is what this module
// reproduces. That rule has been stable across every V8 version since 8.0,
// and real modules are practically always above the cutoff.
//
// Modules at or below the cutoff get a placeholder name instead. Their frames
// are matched by the single-module fallback in `patchFrames`, which does not
// need the name at all. The same fallback covers Firefox, which derives
// script names from the compile call site for modules of any size.
//
// See `CreateWasmScript` in src/wasm/wasm-engine.cc and `GetTrivialHash` in
// src/strings/string-hasher-inl.h in https://github.com/v8/v8.

const V8_MAX_HASH_CALC_LENGTH = 16383;

// Never collides with a real name, which always ends in 8 hex characters.
const UNKNOWN_HASH_PLACEHOLDER = 'unknown';

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
 * Builds the script name to register a buffer-compiled module under.
 *
 * The name is the one V8 reports in stack frames when the wire bytes are
 * above the content-hashing cutoff, and a placeholder otherwise.
 *
 * @param module the compiled module
 * @param byteLength length of the wire bytes, read before the caller had a
 *                   chance to mutate or detach the buffer
 */
export function getSyntheticUrl(module: WebAssembly.Module, byteLength: number): string {
  const moduleName = getModuleName(module);
  const prefix = moduleName ? `${moduleName}-` : '';
  // V8 stores string hashes in the upper 30 bits of a tagged field.
  const suffix =
    byteLength > V8_MAX_HASH_CALC_LENGTH
      ? ((byteLength * 4 + 2) >>> 0).toString(16).padStart(8, '0')
      : UNKNOWN_HASH_PLACEHOLDER;
  return `wasm://wasm/${prefix}${suffix}`;
}
