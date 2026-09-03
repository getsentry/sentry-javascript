import { afterEach, describe, expect, it, vi } from 'vitest';
import { patchWebAssembly } from '../src/patchWebAssembly';

const RESPONSE = { url: 'http://localhost:8001/main.wasm' } as Response;
const MODULE = {} as WebAssembly.Module;

describe('patchWebAssembly()', () => {
  const originalInstantiateStreaming = WebAssembly.instantiateStreaming;
  const originalCompileStreaming = WebAssembly.compileStreaming;

  afterEach(() => {
    WebAssembly.instantiateStreaming = originalInstantiateStreaming;
    WebAssembly.compileStreaming = originalCompileStreaming;
  });

  it('forwards every argument to instantiateStreaming and registers the module', async () => {
    const orig = vi.fn().mockResolvedValue({ module: MODULE, instance: {} });
    WebAssembly.instantiateStreaming = orig as unknown as typeof WebAssembly.instantiateStreaming;
    const registered: Array<[WebAssembly.Module, string]> = [];

    patchWebAssembly((module, url) => registered.push([module, url]));

    const importObject = { env: {} };
    const compileOptions = { builtins: ['js-string'] };
    await (WebAssembly.instantiateStreaming as unknown as (...args: unknown[]) => Promise<unknown>)(
      RESPONSE,
      importObject,
      compileOptions,
    );

    expect(orig).toHaveBeenCalledWith(RESPONSE, importObject, compileOptions);
    expect(registered).toEqual([[MODULE, RESPONSE.url]]);
  });

  it('forwards every argument to compileStreaming and registers the module', async () => {
    const orig = vi.fn().mockResolvedValue(MODULE);
    WebAssembly.compileStreaming = orig as unknown as typeof WebAssembly.compileStreaming;
    const registered: Array<[WebAssembly.Module, string]> = [];

    patchWebAssembly((module, url) => registered.push([module, url]));

    const compileOptions = { builtins: ['js-string'] };
    await (WebAssembly.compileStreaming as unknown as (...args: unknown[]) => Promise<unknown>)(
      RESPONSE,
      compileOptions,
    );

    expect(orig).toHaveBeenCalledWith(RESPONSE, compileOptions);
    expect(registered).toEqual([[MODULE, RESPONSE.url]]);
  });

  it('does not register modules of responses without a url', async () => {
    WebAssembly.compileStreaming = vi.fn().mockResolvedValue(MODULE) as unknown as typeof WebAssembly.compileStreaming;
    const registered: string[] = [];

    patchWebAssembly((_module, url) => registered.push(url));

    await WebAssembly.compileStreaming({ url: '' } as Response);

    expect(registered).toEqual([]);
  });

  it('resolves the original result even if registration throws', async () => {
    WebAssembly.compileStreaming = vi.fn().mockResolvedValue(MODULE) as unknown as typeof WebAssembly.compileStreaming;

    patchWebAssembly(() => {
      throw new Error('registration failed');
    });

    await expect(WebAssembly.compileStreaming(RESPONSE)).resolves.toBe(MODULE);
  });
});
