import { describe, expect, it } from 'vitest';
import { syntheticModuleName, uniqueImageForSyntheticFilename } from '../src/matchSyntheticWasmFilename';
import type { RegisteredWasmImage } from '../src/registry';

const DEMO_BG_URL = 'http://localhost:8080/web/assets/rust/demo_bg.wasm';
const DEBUG_ID_A = 'aaa00000000000000000000000000000';
const DEBUG_ID_B = 'bbb00000000000000000000000000000';

function wasmImage(overrides: Partial<RegisteredWasmImage>): RegisteredWasmImage {
  return {
    type: 'wasm',
    code_id: 'aaa',
    code_file: DEMO_BG_URL,
    debug_file: null,
    debug_id: DEBUG_ID_A,
    moduleName: 'demo.wasm',
    ...overrides,
  };
}

describe('syntheticModuleName()', () => {
  it('strips the Chrome isolate hash', () => {
    expect(syntheticModuleName('wasm://wasm/demo.wasm-000197f6')).toBe('demo.wasm');
  });

  it('returns undefined for a hash-only label', () => {
    expect(syntheticModuleName('wasm://wasm/0bee4c4e')).toBeUndefined();
  });

  it('keeps a hex-looking module name that carries a hash suffix', () => {
    expect(syntheticModuleName('wasm://wasm/ed25519-000197f6')).toBe('ed25519');
  });

  it('returns undefined for a fetch URL', () => {
    expect(syntheticModuleName(DEMO_BG_URL)).toBeUndefined();
  });
});

describe('uniqueImageForSyntheticFilename()', () => {
  it('matches the image whose moduleName equals the label', () => {
    expect(uniqueImageForSyntheticFilename('wasm://wasm/demo.wasm-000197f6', [wasmImage({})], [])).toEqual({
      index: 0,
      worker: false,
      codeFile: DEMO_BG_URL,
    });
  });

  it('accepts a hit when every image with that name shares one debug_id', () => {
    const pageImages = [
      wasmImage({ code_file: 'http://localhost:8001/v1/demo_bg.wasm' }),
      wasmImage({ code_file: 'http://cdn.example/demo_bg.wasm' }),
    ];

    expect(uniqueImageForSyntheticFilename('wasm://wasm/demo.wasm-000197f6', pageImages, [])).toEqual({
      index: 0,
      worker: false,
      codeFile: 'http://localhost:8001/v1/demo_bg.wasm',
    });
  });

  it('does not guess when two modules share a moduleName but not debug_id', () => {
    const pageImages = [
      wasmImage({ code_file: 'http://localhost:8001/v1/demo_bg.wasm' }),
      wasmImage({ code_id: 'bbb', debug_id: DEBUG_ID_B, code_file: 'http://localhost:8001/v2/demo_bg.wasm' }),
    ];

    expect(uniqueImageForSyntheticFilename('wasm://wasm/demo.wasm-000197f6', pageImages, [])).toBeUndefined();
  });

  it('does not match an image whose moduleName differs', () => {
    expect(
      uniqueImageForSyntheticFilename('wasm://wasm/demo.wasm-000197f6', [wasmImage({ moduleName: 'crate' })], []),
    ).toBeUndefined();
  });

  it('does not match an image without a name section', () => {
    expect(
      uniqueImageForSyntheticFilename('wasm://wasm/demo.wasm-000197f6', [wasmImage({ moduleName: undefined })], []),
    ).toBeUndefined();
  });

  it('matches a hex-looking module name', () => {
    const image = wasmImage({ moduleName: 'ed25519', code_file: 'http://localhost:8080/ed25519_bg.wasm' });

    expect(uniqueImageForSyntheticFilename('wasm://wasm/ed25519-000197f6', [image], [])).toEqual({
      index: 0,
      worker: false,
      codeFile: 'http://localhost:8080/ed25519_bg.wasm',
    });
  });

  it('does not map a hash-only wasm:// label', () => {
    expect(uniqueImageForSyntheticFilename('wasm://wasm/0bee4c4e', [wasmImage({})], [])).toBeUndefined();
  });

  it('matches a worker image by module name', () => {
    expect(uniqueImageForSyntheticFilename('wasm://wasm/demo.wasm-000197f6', [], [wasmImage({})])).toEqual({
      index: 0,
      worker: true,
      codeFile: DEMO_BG_URL,
    });
  });
});
