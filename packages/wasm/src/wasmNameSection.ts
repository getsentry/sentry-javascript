/* eslint-disable no-bitwise -- LEB128 is a bitwise encoding */

/**
 * Parses the wasm `name` custom section payload — the bytes
 * `WebAssembly.Module.customSections(module, 'name')` returns.
 *
 * Chrome's buffer-compiled stacks use this module name as `wasm://wasm/<name>-<hash>`,
 * which often differs from the fetch URL (wasm-bindgen `demo.wasm` vs `demo_bg.wasm`).
 * Missing, stripped, or malformed sections return null. Callers then guess from
 * the fetch URL basename if the name is missing or does not match the stack.
 *
 * @see https://webassembly.github.io/spec/core/appendix/custom.html#name-section
 */
export function parseNameSectionModuleName(source: ArrayBuffer | Uint8Array): string | null {
  try {
    return readModuleName(toBytes(source));
  } catch {
    return null;
  }
}

function toBytes(source: ArrayBuffer | Uint8Array): Uint8Array {
  if (source instanceof ArrayBuffer) {
    return new Uint8Array(source);
  }
  return new Uint8Array(source.buffer, source.byteOffset, source.byteLength);
}

function readModuleName(bytes: Uint8Array): string | null {
  const cursor = { offset: 0 };
  while (cursor.offset < bytes.length) {
    const id = bytes[cursor.offset];
    cursor.offset += 1;
    if (id === undefined) {
      return null;
    }

    const size = readU32Leb(bytes, cursor);
    if (size === undefined || cursor.offset + size > bytes.length) {
      return null;
    }

    const start = cursor.offset;
    cursor.offset += size;
    if (id === 0) {
      return readName(bytes.subarray(start, start + size));
    }
  }

  return null;
}

function readName(bytes: Uint8Array): string | null {
  const cursor = { offset: 0 };
  const length = readU32Leb(bytes, cursor);
  if (length === undefined || length === 0 || cursor.offset + length !== bytes.length) {
    return null;
  }

  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(cursor.offset));
  } catch {
    return null;
  }
}

function readU32Leb(bytes: Uint8Array, cursor: { offset: number }): number | undefined {
  let result = 0;
  let shift = 0;

  while (cursor.offset < bytes.length) {
    const byte = bytes[cursor.offset];
    cursor.offset += 1;
    if (byte === undefined || shift >= 35) {
      return undefined;
    }

    result |= (byte & 0x7f) << shift;
    if ((byte & 0x80) === 0) {
      return result >>> 0;
    }
    shift += 7;
  }

  return undefined;
}
