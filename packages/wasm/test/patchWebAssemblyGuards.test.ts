import { afterEach, describe, expect, it, vi } from 'vitest';
import { patchWebAssembly } from '../src/patchWebAssembly';
import { registerModule } from '../src/registry';
import { restoreWasmGlobals, saveWasmGlobals } from './wasmTestHelpers';

describe('patchWebAssembly() guards', () => {
  const savedGlobals = saveWasmGlobals();

  afterEach(() => {
    vi.unstubAllGlobals();
    restoreWasmGlobals(savedGlobals);
  });

  it('does not throw when WebAssembly is frozen', () => {
    vi.stubGlobal('WebAssembly', Object.freeze(Object.create(WebAssembly)));

    expect(() => patchWebAssembly(registerModule)).not.toThrow();
  });

  it('does not throw when WebAssembly is missing', () => {
    vi.stubGlobal('WebAssembly', undefined);

    expect(() => patchWebAssembly(registerModule)).not.toThrow();
  });
});
