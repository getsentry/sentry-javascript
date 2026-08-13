/* eslint-disable no-bitwise */
import type { Event, StackFrame } from '@sentry/core';
import { GLOBAL_OBJ } from '@sentry/core';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { patchFrames, registerWebWorkerWasm, wasmIntegration } from '../src/index';
import { patchWebAssembly } from '../src/patchWebAssembly';
import type { WasmDebugImage } from '../src/registry';
import { getImages, IMAGES, registerModule } from '../src/registry';
import { getHashCandidates, getModuleName, toByteView } from '../src/syntheticUrl';

const BUILD_ID_BYTES = [0x0b, 0xa0, 0x20, 0xcd, 0xd2, 0x44, 0x4f, 0x7e, 0xaf, 0xdd, 0x25, 0x99, 0x9a, 0x8e, 0x90, 0x10];
const BUILD_ID_HEX = '0ba020cdd2444f7eafdd25999a8e9010';

function leb128(value: number): number[] {
  const out = [];
  let n = value;
  do {
    let byte = n & 0x7f;
    n >>>= 7;
    if (n !== 0) {
      byte |= 0x80;
    }
    out.push(byte);
  } while (n !== 0);
  return out;
}

function customSection(name: string, payload: number[]): number[] {
  const nameBytes = [...name].map(c => c.charCodeAt(0));
  const content = [...leb128(nameBytes.length), ...nameBytes, ...payload];
  return [0x00, ...leb128(content.length), ...content];
}

interface BuildWasmOptions {
  buildId?: boolean;
  moduleName?: string;
  padding?: number;
  padSeed?: number;
}

const WASM_HEADER = [0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00];
const TYPE_SECTION = [0x01, 0x04, 0x01, 0x60, 0x00, 0x00]; // () -> ()
const FUNCTION_SECTION = [0x03, 0x02, 0x01, 0x00];
const EXPORT_SECTION = [0x07, 0x05, 0x01, 0x01, 0x66, 0x00, 0x00]; // exports func 0 as "f"
const CODE_SECTION = [0x0a, 0x05, 0x01, 0x03, 0x00, 0x00, 0x0b]; // body: unreachable

// A minimal module exporting a function "f" whose body traps (unreachable),
// optionally with build_id / name sections and a padding custom section.
function buildWasm({
  buildId = true,
  moduleName,
  padding = 0,
  padSeed = 0,
}: BuildWasmOptions = {}): Uint8Array<ArrayBuffer> {
  const bytes = [...WASM_HEADER, ...TYPE_SECTION, ...FUNCTION_SECTION, ...EXPORT_SECTION, ...CODE_SECTION];
  if (buildId) {
    bytes.push(...customSection('build_id', BUILD_ID_BYTES));
  }
  if (moduleName) {
    const nameBytes = [...moduleName].map(c => c.charCodeAt(0));
    const subsection = [0x00, ...leb128(nameBytes.length + 1), ...leb128(nameBytes.length), ...nameBytes];
    bytes.push(...customSection('name', subsection));
  }
  if (padding > 0) {
    const payload = [];
    for (let i = 0; i < padding; i++) {
      payload.push((i * 31 + 7 + padSeed) & 0xff);
    }
    bytes.push(...customSection('p', payload));
  }
  return new Uint8Array(bytes);
}

// Extracts the synthetic script name the engine actually reports for the
// module by trapping it. The `:wasm-function[i]:0xaddr` suffix gets mangled
// by vitest's stack rewriting, so the frame filename is rebuilt from the
// engine-reported url; suffix parsing is covered by the parsing tests.
function trapAndGetWasmFilename(instance: WebAssembly.Instance): string {
  try {
    (instance.exports.f as () => void)();
  } catch (e) {
    const match = (e as Error).stack?.match(/(wasm:\/\/wasm\/[^):\s]+)/);
    if (match?.[1]) {
      return `${match[1]}:wasm-function[0]:0x1e`;
    }
  }
  throw new Error('could not extract wasm frame filename');
}

function frameForFilename(filename: string): StackFrame {
  return { filename, function: 'f', in_app: true };
}

beforeAll(() => {
  patchWebAssembly(registerModule);
});

afterEach(() => {
  IMAGES.length = 0;
});

describe('non-streaming WebAssembly patching', () => {
  it('registers modules compiled via WebAssembly.instantiate(buffer) and matches real stack frames', async () => {
    // Two modules with different content and sizes on both sides of V8's
    // 16383-byte content-hashing cutoff, so that matching must go through the
    // computed synthetic names and cannot silently succeed via the
    // single-image fallback.
    const small = buildWasm({ padding: 100 });
    const large = buildWasm({ padding: 20000 });

    const { instance: smallInstance } = await WebAssembly.instantiate(small);
    const { instance: largeInstance } = await WebAssembly.instantiate(large);

    expect(getImages()).toHaveLength(2);
    expect(getImages()[0]?.code_id).toBe(BUILD_ID_HEX);
    expect(getImages()[0]?.code_file).toMatch(/^wasm:\/\/wasm\/[0-9a-f]{8}$/);

    const smallFilename = trapAndGetWasmFilename(smallInstance);
    const largeFilename = trapAndGetWasmFilename(largeInstance);

    const frames = [frameForFilename(smallFilename), frameForFilename(largeFilename)];
    const result = patchFrames(frames);

    expect(result).toBe(true);
    expect(frames[0]?.platform).toBe('native');
    expect(frames[0]?.addr_mode).toBe('rel:0');
    expect(frames[1]?.addr_mode).toBe('rel:1');
  });

  it('registers modules compiled via new WebAssembly.Module() synchronously', () => {
    const bytes = buildWasm({ padding: 17000 });
    const module = new WebAssembly.Module(bytes);

    expect(getImages()).toHaveLength(1);
    expect(module).toBeInstanceOf(WebAssembly.Module);
    expect(WebAssembly.Module.customSections(module, 'build_id')).toHaveLength(1);

    const instance = new WebAssembly.Instance(module);
    const filename = trapAndGetWasmFilename(instance);
    const frames = [frameForFilename(filename)];

    expect(patchFrames(frames)).toBe(true);
    expect(frames[0]?.addr_mode).toBe('rel:0');
  });

  it('registers modules compiled via WebAssembly.compile()', async () => {
    const module = await WebAssembly.compile(buildWasm({ padding: 18000 }));

    expect(getImages()).toHaveLength(1);

    const instance = new WebAssembly.Instance(module);
    const filename = trapAndGetWasmFilename(instance);
    const frames = [frameForFilename(filename)];

    expect(patchFrames(frames)).toBe(true);
    expect(frames[0]?.addr_mode).toBe('rel:0');
  });

  it('includes the module name from the name section in the synthetic url', async () => {
    const bytes = buildWasm({ moduleName: 'mymod', padding: 20000 });
    const { instance } = await WebAssembly.instantiate(bytes);

    expect(getImages()[0]?.code_file).toMatch(/^wasm:\/\/wasm\/mymod-[0-9a-f]{8}$/);

    const filename = trapAndGetWasmFilename(instance);
    const frames = [frameForFilename(filename)];

    expect(patchFrames(frames)).toBe(true);
    expect(frames[0]?.addr_mode).toBe('rel:0');
  });

  it('supports the WebAssembly.instantiate(module) overload without re-registering', async () => {
    const module = await WebAssembly.compile(buildWasm({ padding: 17500 }));
    const instance = await WebAssembly.instantiate(module);

    expect(instance).toBeInstanceOf(WebAssembly.Instance);
    expect(getImages()).toHaveLength(1);
  });

  it('accepts typed-array views over a larger buffer', async () => {
    const bytes = buildWasm({ padding: 17000 });
    const oversized = new Uint8Array(bytes.length + 64);
    oversized.set(bytes, 32);
    const view = oversized.subarray(32, 32 + bytes.length);

    const { instance } = await WebAssembly.instantiate(view);
    const filename = trapAndGetWasmFilename(instance);
    const frames = [frameForFilename(filename)];

    expect(patchFrames(frames)).toBe(true);
    expect(frames[0]?.addr_mode).toBe('rel:0');
  });

  it('does not register modules without a build_id', async () => {
    await WebAssembly.instantiate(buildWasm({ buildId: false, padding: 17000 }));
    expect(getImages()).toHaveLength(0);
  });

  it('rejects like the original on invalid bytes', async () => {
    await expect(WebAssembly.instantiate(new Uint8Array([0, 1, 2, 3]))).rejects.toThrow();
    expect(getImages()).toHaveLength(0);
  });

  it('rejects asynchronously instead of throwing when the buffer is detached', async () => {
    const bytes = buildWasm({ padding: 17000 });
    const buffer = bytes.buffer;
    structuredClone(buffer, { transfer: [buffer] });

    await expect(WebAssembly.instantiate(buffer)).rejects.toThrow();
    await expect(WebAssembly.compile(buffer)).rejects.toThrow();
    expect(getImages()).toHaveLength(0);
  });
});

describe('registerWebWorkerWasm()', () => {
  it('forwards buffer images with their match urls and matches frames against them', async () => {
    const messages: Array<{ _sentryWasmImages?: WasmDebugImage[] }> = [];
    registerWebWorkerWasm({ self: { postMessage: (message: unknown) => messages.push(message as never) } });

    const bytes = buildWasm({ padding: 17000 });
    const { instance } = await WebAssembly.instantiate(bytes);

    expect(messages).toHaveLength(1);
    const forwarded = messages[0]?._sentryWasmImages?.[0];
    expect(forwarded?._matchUrls).toEqual(expect.arrayContaining([forwarded?.code_file]));

    // simulate the main thread: the image only exists as a forwarded worker
    // image, exactly as webWorkerIntegration stores it
    const filename = trapAndGetWasmFilename(instance);
    IMAGES.length = 0;
    (GLOBAL_OBJ as { _sentryWasmImages?: WasmDebugImage[] })._sentryWasmImages = [forwarded as WasmDebugImage];
    try {
      const frames = [frameForFilename(filename)];
      expect(patchFrames(frames)).toBe(true);
      expect(frames[0]?.addr_mode).toBe('rel:0');
    } finally {
      delete (GLOBAL_OBJ as { _sentryWasmImages?: WasmDebugImage[] })._sentryWasmImages;
    }
  });
});

describe('single-buffer-image fallback', () => {
  // The patched Module constructor registers the module as a buffer image.
  function registerBufferImage(bytes: Uint8Array<ArrayBuffer>): void {
    new WebAssembly.Module(bytes);
  }

  it('matches unpredicted synthetic names when exactly one buffer image exists', () => {
    registerBufferImage(buildWasm({ padding: 17000 }));

    const frames = [
      frameForFilename('http://localhost:8001/app.js line 12 > WebAssembly.instantiate:wasm-function[0]:0x1e'),
    ];

    expect(patchFrames(frames)).toBe(true);
    expect(frames[0]?.addr_mode).toBe('rel:0');
    expect(frames[0]?.platform).toBe('native');
  });

  it('does not fall back when the filename is a regular url', () => {
    registerBufferImage(buildWasm({ padding: 17000 }));

    const frames = [frameForFilename('http://localhost:8001/other.wasm:wasm-function[0]:0x1e')];

    expect(patchFrames(frames)).toBe(false);
    expect(frames[0]?.addr_mode).toBeUndefined();
  });

  it('does not fall back when multiple buffer images exist', () => {
    registerBufferImage(buildWasm({ padding: 17000 }));
    registerBufferImage(buildWasm({ padding: 18000 }));

    const frames = [
      frameForFilename('http://localhost:8001/app.js line 12 > WebAssembly.instantiate:wasm-function[0]:0x1e'),
    ];

    expect(patchFrames(frames)).toBe(false);
  });

  it('does not fall back for images registered from streaming urls', () => {
    const module = new WebAssembly.Module(buildWasm({ padding: 17000 }));
    IMAGES.length = 0; // drop the auto-registered buffer image
    registerModule(module, 'http://localhost:8001/main.wasm');

    const frames = [
      frameForFilename('http://localhost:8001/app.js line 12 > WebAssembly.instantiate:wasm-function[0]:0x1e'),
    ];

    expect(patchFrames(frames)).toBe(false);
  });

  it('does not fall back for unmatched wasm:// names of modules compiled before SDK init', () => {
    registerBufferImage(buildWasm({ padding: 17000 }));

    const frames = [frameForFilename('wasm://wasm/ffffffff:wasm-function[0]:0x1e')];

    expect(patchFrames(frames)).toBe(false);
    expect(frames[0]?.addr_mode).toBeUndefined();
  });

  it('falls back when the same module is registered on the main thread and in a worker', () => {
    const bytes = buildWasm({ padding: 17000 });
    registerBufferImage(bytes);
    (GLOBAL_OBJ as { _sentryWasmImages?: WasmDebugImage[] })._sentryWasmImages = [
      { ...(getImages()[0] as WasmDebugImage) },
    ];

    try {
      const frames = [
        frameForFilename('http://localhost:8001/app.js line 12 > WebAssembly.instantiate:wasm-function[0]:0x1e'),
      ];

      expect(patchFrames(frames)).toBe(true);
      expect(frames[0]?.addr_mode).toBe('rel:0');
    } finally {
      delete (GLOBAL_OBJ as { _sentryWasmImages?: WasmDebugImage[] })._sentryWasmImages;
    }
  });
});

describe('processEvent', () => {
  it('strips internal match urls from attached debug images', () => {
    const bytes = buildWasm({ padding: 17000 });
    new WebAssembly.Module(bytes);
    const candidates = getHashCandidates(bytes);

    const integration = wasmIntegration();
    const event = integration.processEvent?.(
      {
        exception: {
          values: [
            {
              stacktrace: {
                frames: [frameForFilename(`wasm://wasm/${candidates[0]}:wasm-function[0]:0x1e`)],
              },
            },
          ],
        },
      },
      {},
      {} as never,
    ) as Event;

    const images = event.debug_meta?.images as WasmDebugImage[] | undefined;
    expect(images).toHaveLength(1);
    expect(images?.[0]).not.toHaveProperty('_matchUrls');
    expect(images?.[0]?.code_id).toBe(BUILD_ID_HEX);
  });

  it('patches frames of all exception values, not only the first matching one', () => {
    const bytes = buildWasm({ padding: 17000 });
    new WebAssembly.Module(bytes);
    const candidates = getHashCandidates(bytes);
    const wasmFilename = `wasm://wasm/${candidates[0]}:wasm-function[0]:0x1e`;

    const integration = wasmIntegration();
    const event = integration.processEvent?.(
      {
        exception: {
          values: [
            { stacktrace: { frames: [frameForFilename(wasmFilename)] } },
            { stacktrace: { frames: [frameForFilename(wasmFilename)] } },
          ],
        },
      },
      {},
      {} as never,
    ) as Event;

    const frames = event.exception?.values?.map(value => value.stacktrace?.frames?.[0]);
    expect(frames?.[0]?.addr_mode).toBe('rel:0');
    expect(frames?.[1]?.addr_mode).toBe('rel:0');
  });
});

describe('syntheticUrl helpers', () => {
  it('computes the stable length-based hash for modules above the content-hash cutoff', () => {
    const bytes = new Uint8Array(20038);
    expect(getHashCandidates(bytes)).toEqual(['0001391a']);
  });

  it('normalizes BufferSource values', () => {
    const buffer = new ArrayBuffer(8);
    expect(toByteView(buffer)?.byteLength).toBe(8);
    expect(toByteView(new DataView(buffer, 2, 4))?.byteLength).toBe(4);
    expect(toByteView('nope')).toBeUndefined();
    expect(toByteView(undefined)).toBeUndefined();
  });

  it('extracts the module name from the name section', () => {
    const module = new WebAssembly.Module(buildWasm({ moduleName: 'my_module' }));
    expect(getModuleName(module)).toBe('my_module');
  });

  it('returns undefined for modules without a name section', () => {
    const module = new WebAssembly.Module(buildWasm());
    expect(getModuleName(module)).toBeUndefined();
  });

  it('ignores module names that are not valid UTF-8, like V8 does', () => {
    const bytes = [...WASM_HEADER, ...TYPE_SECTION, ...FUNCTION_SECTION, ...EXPORT_SECTION, ...CODE_SECTION];
    bytes.push(...customSection('name', [0x00, 0x03, 0x02, 0xff, 0xfe]));
    const module = new WebAssembly.Module(new Uint8Array(bytes));
    expect(getModuleName(module)).toBeUndefined();
  });
});
