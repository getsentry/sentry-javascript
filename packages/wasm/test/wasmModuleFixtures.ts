/* eslint-disable no-bitwise -- LEB128 is a bitwise encoding */

const WASM_MAGIC = [0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00];

export function u32leb(n: number): number[] {
  const bytes: number[] = [];
  let value = n >>> 0;
  do {
    let byte = value & 0x7f;
    value >>>= 7;
    if (value !== 0) {
      byte |= 0x80;
    }
    bytes.push(byte);
  } while (value !== 0);
  return bytes;
}

export function encodeUtf8(text: string): number[] {
  return Array.from(new TextEncoder().encode(text));
}

export function customSection(sectionName: string, payload: number[]): number[] {
  const nameBytes = encodeUtf8(sectionName);
  const body = [...u32leb(nameBytes.length), ...nameBytes, ...payload];
  return [0, ...u32leb(body.length), ...body];
}

/** Payload of a `name` custom section containing only the module-name subsection. */
export function nameSectionPayload(moduleName: string): number[] {
  const nameBytes = encodeUtf8(moduleName);
  const subsection = [...u32leb(nameBytes.length), ...nameBytes];
  return [0, ...u32leb(subsection.length), ...subsection];
}

export function wasmModuleBytes(sections: number[][]): Uint8Array {
  return Uint8Array.from([...WASM_MAGIC, ...sections.flat()]);
}

export function compileFixture(bytes: Uint8Array): WebAssembly.Module {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return new WebAssembly.Module(buffer);
}

export function wasmWithBuildIdAndModuleName(buildId: number[], moduleName: string): Uint8Array {
  return wasmModuleBytes([customSection('build_id', buildId), customSection('name', nameSectionPayload(moduleName))]);
}

export function wasmWithBuildIdOnly(buildId: number[]): Uint8Array {
  return wasmModuleBytes([customSection('build_id', buildId)]);
}

export function wasmWithBuildIdAndFunctionNamesOnly(buildId: number[]): Uint8Array {
  return wasmModuleBytes([customSection('build_id', buildId), customSection('name', [1, ...u32leb(1), 0])]);
}
