import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { patchWebAssembly } from '../src/patchWebAssembly';
import { getImage, IMAGES, registerModule } from '../src/registry';
import { restoreWasmGlobals, saveWasmGlobals } from './wasmTestHelpers';

const RESPONSE = { url: 'http://localhost:8001/main.wasm' } as Response;
const MODULE = {} as WebAssembly.Module;

const testDir = path.dirname(fileURLToPath(import.meta.url));
const SIMPLE_WASM_PATH = path.resolve(
  testDir,
  '../../../dev-packages/browser-integration-tests/suites/wasm/simple.wasm',
);

const WASM_URL = 'https://example.com/simple.wasm';

const WASM_IMPORTS = {
  env: {
    external_func: () => {},
  },
};

async function loadWasmBytes(): Promise<Uint8Array> {
  return new Uint8Array(fs.readFileSync(SIMPLE_WASM_PATH));
}

async function fetchWasmBytes(): Promise<ArrayBuffer> {
  const bytes = await loadWasmBytes();
  const response = new Response(bytes, {
    headers: { 'Content-Type': 'application/wasm' },
  });
  Object.defineProperty(response, 'url', { value: WASM_URL });

  return response.arrayBuffer();
}

describe('patchWebAssembly() streaming registration', () => {
  const savedGlobals = saveWasmGlobals();

  afterEach(() => {
    restoreWasmGlobals(savedGlobals);
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

describe('patchWebAssembly() non-streaming registration', () => {
  const savedGlobals = saveWasmGlobals();

  beforeAll(() => {
    patchWebAssembly(registerModule);
  });

  afterAll(() => {
    restoreWasmGlobals(savedGlobals);
  });

  beforeEach(() => {
    IMAGES.length = 0;
  });

  it('registers modules loaded via fetch → arrayBuffer → instantiate', async () => {
    const buffer = await fetchWasmBytes();

    await WebAssembly.instantiate(buffer, WASM_IMPORTS);

    expect(getImage(WASM_URL)).toBe(0);
    expect(IMAGES[0]?.code_file).toBe(WASM_URL);
    expect(IMAGES[0]?.code_id).toBe('0ba020cdd2444f7eafdd25999a8e9010');
  });

  it('registers modules loaded via fetch → arrayBuffer → Uint8Array → instantiate', async () => {
    const buffer = await fetchWasmBytes();
    const view = new Uint8Array(buffer);

    await WebAssembly.instantiate(view, WASM_IMPORTS);

    expect(getImage(WASM_URL)).toBe(0);
    expect(IMAGES[0]?.code_file).toBe(WASM_URL);
  });

  it('registers modules loaded via fetch → arrayBuffer → compile', async () => {
    const buffer = await fetchWasmBytes();

    await WebAssembly.compile(buffer);

    expect(getImage(WASM_URL)).toBe(0);
    expect(IMAGES[0]?.code_file).toBe(WASM_URL);
  });

  it('does not register modules when the buffer has no tagged URL', async () => {
    const bytes = await loadWasmBytes();

    await WebAssembly.instantiate(bytes, WASM_IMPORTS);

    expect(IMAGES).toHaveLength(0);
  });
});

describe('patchWebAssembly() non-streaming argument forwarding', () => {
  const savedGlobals = saveWasmGlobals();

  afterEach(() => {
    restoreWasmGlobals(savedGlobals);
  });

  it('forwards every argument to instantiate', async () => {
    const orig = vi.fn().mockResolvedValue({ module: MODULE, instance: {} });
    WebAssembly.instantiate = orig as unknown as typeof WebAssembly.instantiate;

    patchWebAssembly(registerModule);

    const bytes = new Uint8Array(8);
    const compileOptions = { builtins: ['js-string'] };
    await (WebAssembly.instantiate as unknown as (...args: unknown[]) => Promise<unknown>)(
      bytes,
      WASM_IMPORTS,
      compileOptions,
    );

    expect(orig).toHaveBeenCalledWith(bytes, WASM_IMPORTS, compileOptions);
  });

  it('forwards every argument to compile', async () => {
    const orig = vi.fn().mockResolvedValue(MODULE);
    WebAssembly.compile = orig as unknown as typeof WebAssembly.compile;

    patchWebAssembly(registerModule);

    const bytes = new Uint8Array(8);
    const compileOptions = { builtins: ['js-string'] };
    await (WebAssembly.compile as unknown as (...args: unknown[]) => Promise<unknown>)(bytes, compileOptions);

    expect(orig).toHaveBeenCalledWith(bytes, compileOptions);
  });

  it('resolves the original result even if registration throws', async () => {
    patchWebAssembly(() => {
      throw new Error('registration failed');
    });

    const buffer = await fetchWasmBytes();

    await expect(WebAssembly.compile(buffer)).resolves.toBeInstanceOf(WebAssembly.Module);
  });
});
