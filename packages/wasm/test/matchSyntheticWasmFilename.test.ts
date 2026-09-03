import type { DebugImage } from '@sentry/core';
import { describe, expect, it } from 'vitest';
import {
  fileBasename,
  namesForRegisteredWasm,
  syntheticModuleName,
  uniqueHitByDebugId,
  uniqueImageForSyntheticFilename,
} from '../src/matchSyntheticWasmFilename';

const DEMO_BG_URL = 'http://localhost:8080/web/assets/rust/demo_bg.wasm';
const DEBUG_ID_A = 'aaa00000000000000000000000000000';
const DEBUG_ID_B = 'bbb00000000000000000000000000000';

function wasmImage(overrides: Partial<Extract<DebugImage, { type: 'wasm' }>> & { moduleName?: string }): DebugImage {
  return {
    type: 'wasm',
    code_id: 'aaa',
    code_file: DEMO_BG_URL,
    debug_file: null,
    debug_id: DEBUG_ID_A,
    ...overrides,
  };
}

describe('syntheticModuleName()', () => {
  it('strips the Chrome isolate hash', () => {
    expect(syntheticModuleName('wasm://wasm/demo.wasm-000197f6')).toBe('demo.wasm');
  });

  it('returns a hash-only label unchanged', () => {
    expect(syntheticModuleName('wasm://wasm/0bee4c4e')).toBe('0bee4c4e');
  });

  it('returns undefined for a fetch URL', () => {
    expect(syntheticModuleName(DEMO_BG_URL)).toBeUndefined();
  });
});

describe('namesForRegisteredWasm()', () => {
  it('includes the bindgen _bg alias', () => {
    expect(namesForRegisteredWasm(DEMO_BG_URL)).toEqual(['demo_bg.wasm', 'demo.wasm']);
  });

  it('does not invent an alias for a plain .wasm file', () => {
    expect(namesForRegisteredWasm('http://localhost:8080/maze.split.wasm')).toEqual(['maze.split.wasm']);
  });
});

describe('fileBasename()', () => {
  it('falls back when the value is not a URL', () => {
    expect(fileBasename('not a url/demo.wasm')).toBe('demo.wasm');
  });
});

describe('uniqueHitByDebugId()', () => {
  it('returns the first hit when every debug_id matches', () => {
    const hits = [
      { debugId: DEBUG_ID_A, codeFile: 'http://localhost:8001/v1/app.wasm' },
      { debugId: DEBUG_ID_A, codeFile: 'http://cdn.example/app.wasm' },
    ];
    expect(uniqueHitByDebugId(hits)).toEqual(hits[0]);
  });

  it('returns undefined when debug_ids differ', () => {
    expect(
      uniqueHitByDebugId([
        { debugId: DEBUG_ID_A, codeFile: 'http://localhost:8001/v1/app.wasm' },
        { debugId: DEBUG_ID_B, codeFile: 'http://localhost:8001/v2/app.wasm' },
      ]),
    ).toBeUndefined();
  });
});

describe('uniqueImageForSyntheticFilename()', () => {
  it('matches wasm://wasm/demo.wasm when the image has moduleName demo.wasm', () => {
    const image = wasmImage({ moduleName: 'demo.wasm' });

    expect(uniqueImageForSyntheticFilename('wasm://wasm/demo.wasm-000197f6', [image], [])).toEqual({
      index: 0,
      worker: false,
      codeFile: DEMO_BG_URL,
    });
  });

  it('does not guess when two modules share a moduleName but not debug_id', () => {
    const pageImages = [
      wasmImage({ moduleName: 'demo.wasm', debug_id: DEBUG_ID_A, code_file: 'http://localhost:8001/v1/demo_bg.wasm' }),
      wasmImage({
        moduleName: 'demo.wasm',
        code_id: 'bbb',
        debug_id: DEBUG_ID_B,
        code_file: 'http://localhost:8001/v2/demo_bg.wasm',
      }),
    ];

    expect(uniqueImageForSyntheticFilename('wasm://wasm/demo.wasm-000197f6', pageImages, [])).toBeUndefined();
  });

  it('falls back to the fetch basename when the name section is absent', () => {
    const image = wasmImage({
      code_file: 'http://localhost:8080/web/assets/emscripten-raycast/maze.split.wasm',
    });

    expect(uniqueImageForSyntheticFilename('wasm://wasm/maze.split.wasm-000197f6', [image], [])).toEqual({
      index: 0,
      worker: false,
      codeFile: 'http://localhost:8080/web/assets/emscripten-raycast/maze.split.wasm',
    });
  });

  it('falls back to the bindgen _bg alias when the name section is absent', () => {
    const image = wasmImage({});

    expect(uniqueImageForSyntheticFilename('wasm://wasm/demo.wasm-000197f6', [image], [])).toEqual({
      index: 0,
      worker: false,
      codeFile: DEMO_BG_URL,
    });
  });

  it('falls back to the fetch filename when stored moduleName does not match the stack', () => {
    const image = wasmImage({ moduleName: 'crate' });

    expect(uniqueImageForSyntheticFilename('wasm://wasm/demo.wasm-000197f6', [image], [])).toEqual({
      index: 0,
      worker: false,
      codeFile: DEMO_BG_URL,
    });
  });

  it('does not match when neither moduleName nor the fetch filename aliases the stack', () => {
    const image = wasmImage({
      moduleName: 'crate',
      code_file: 'http://localhost:8080/web/assets/other.wasm',
    });

    expect(uniqueImageForSyntheticFilename('wasm://wasm/demo.wasm-000197f6', [image], [])).toBeUndefined();
  });

  it('does not map a hash-only wasm:// label', () => {
    const image = wasmImage({ moduleName: 'demo.wasm' });

    expect(uniqueImageForSyntheticFilename('wasm://wasm/0bee4c4e', [image], [])).toBeUndefined();
  });

  it('matches a worker image by module name', () => {
    const image = wasmImage({ moduleName: 'demo.wasm' });

    expect(uniqueImageForSyntheticFilename('wasm://wasm/demo.wasm-000197f6', [], [image])).toEqual({
      index: 0,
      worker: true,
      codeFile: DEMO_BG_URL,
    });
  });
});
