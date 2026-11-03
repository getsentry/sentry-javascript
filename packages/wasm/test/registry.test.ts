import { afterEach, describe, expect, it } from 'vitest';
import { getModuleInfo, IMAGES, registerModule, toProtocolDebugImage } from '../src/registry';
import {
  compileFixture,
  customSection,
  wasmModuleBytes,
  wasmWithBuildIdAndFunctionNamesOnly,
  wasmWithBuildIdAndModuleName,
  wasmWithBuildIdOnly,
} from './wasmModuleFixtures';

const CODE_FILE = 'http://localhost:8080/web/assets/rust/demo_bg.wasm';

describe('registerModule() build ID', () => {
  afterEach(() => {
    IMAGES.length = 0;
  });

  it('excludes the length prefix and keeps every byte of a 16-byte build ID', () => {
    const buildId = [0x10, 0x11, 0x22, 0x33, 0x44, 0x55, 0x66, 0x77, 0x88, 0x99, 0xaa, 0xbb, 0xcc, 0xdd, 0xee, 0xff];
    const module = compileFixture(wasmModuleBytes([customSection('build_id', [0x10, ...buildId])]));

    const image = registerModule(module, CODE_FILE);

    expect(image).toEqual({
      type: 'wasm',
      code_id: '10112233445566778899aabbccddeeff',
      code_file: CODE_FILE,
      debug_file: null,
      debug_id: '10112233445566778899aabbccddeeff0',
    });
  });

  it('preserves a legacy 16-byte build ID that starts with 0x10', () => {
    const buildId = [0x10, 0x11, 0x22, 0x33, 0x44, 0x55, 0x66, 0x77, 0x88, 0x99, 0xaa, 0xbb, 0xcc, 0xdd, 0xee, 0xff];
    const module = compileFixture(wasmWithBuildIdOnly(buildId));

    const image = registerModule(module, CODE_FILE);

    expect(image).toEqual({
      type: 'wasm',
      code_id: '10112233445566778899aabbccddeeff',
      code_file: CODE_FILE,
      debug_file: null,
      debug_id: '10112233445566778899aabbccddeeff0',
    });
  });

  it('preserves a 17-byte raw build ID without a matching length prefix', () => {
    const buildId = [
      0x20, 0x10, 0x11, 0x22, 0x33, 0x44, 0x55, 0x66, 0x77, 0x88, 0x99, 0xaa, 0xbb, 0xcc, 0xdd, 0xee, 0xff,
    ];
    const module = compileFixture(wasmWithBuildIdOnly(buildId));

    const image = registerModule(module, CODE_FILE);

    expect(image).toEqual({
      type: 'wasm',
      code_id: '2010112233445566778899aabbccddeeff',
      code_file: CODE_FILE,
      debug_file: null,
      debug_id: '2010112233445566778899aabbccddee0',
    });
  });
});

describe('registerModule() name section', () => {
  afterEach(() => {
    IMAGES.length = 0;
  });

  it('stores the name-section module name on the debug image', () => {
    const module = compileFixture(wasmWithBuildIdAndModuleName([0xaa, 0xbb], 'demo.wasm'));

    const image = registerModule(module, CODE_FILE);

    expect(image).toEqual({
      type: 'wasm',
      code_id: 'aabb',
      code_file: CODE_FILE,
      debug_file: null,
      debug_id: 'aabb00000000000000000000000000000',
      moduleName: 'demo.wasm',
    });
  });

  it('omits moduleName when the name section is stripped', () => {
    const module = compileFixture(wasmWithBuildIdOnly([0xaa, 0xbb]));

    const image = registerModule(module, CODE_FILE);

    expect(image?.moduleName).toBeUndefined();
    expect(getModuleInfo(module).moduleName).toBeNull();
  });

  it('omits moduleName when the name section has no module name', () => {
    const module = compileFixture(wasmWithBuildIdAndFunctionNamesOnly([0xaa, 0xbb]));

    const image = registerModule(module, CODE_FILE);

    expect(image?.moduleName).toBeUndefined();
  });

  it('omits moduleName from the protocol debug image', () => {
    const module = compileFixture(wasmWithBuildIdAndModuleName([0xaa, 0xbb], 'demo.wasm'));
    const image = registerModule(module, CODE_FILE);

    expect(image).not.toBeNull();
    expect(toProtocolDebugImage(image!)).toEqual({
      type: 'wasm',
      code_id: 'aabb',
      code_file: CODE_FILE,
      debug_file: null,
      debug_id: 'aabb00000000000000000000000000000',
    });
  });
});
