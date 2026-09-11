import { afterEach, describe, expect, it } from 'vitest';
import { getModuleInfo, IMAGES, registerModule, toProtocolDebugImage } from '../src/registry';
import {
  compileFixture,
  wasmWithBuildIdAndFunctionNamesOnly,
  wasmWithBuildIdAndModuleName,
  wasmWithBuildIdOnly,
} from './wasmModuleFixtures';

const CODE_FILE = 'http://localhost:8080/web/assets/rust/demo_bg.wasm';

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
