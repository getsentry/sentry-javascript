import type { DebugImage, StackFrame } from '@sentry/core';
import { GLOBAL_OBJ } from '@sentry/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { patchFrames, registerWebWorkerWasm } from '../src/index';
import { missingBuildIdWorkerMessage } from '../src/devWarnings';

const WINDOW = GLOBAL_OBJ as typeof GLOBAL_OBJ & {
  _sentryWasmImages?: Array<DebugImage>;
};

/** Minimal valid wasm module with no custom sections. */
const MINIMAL_WASM = new Uint8Array([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00]);

describe('registerWebWorkerWasm()', () => {
  afterEach(() => {
    delete WINDOW._sentryWasmImages;
    vi.restoreAllMocks();
  });

  it('should patch WebAssembly.instantiateStreaming when available', () => {
    const mockPostMessage = vi.fn();
    const mockSelf = { postMessage: mockPostMessage };

    const originalInstantiateStreaming = WebAssembly.instantiateStreaming;

    registerWebWorkerWasm({ self: mockSelf });

    expect(WebAssembly.instantiateStreaming).not.toBe(originalInstantiateStreaming);

    WebAssembly.instantiateStreaming = originalInstantiateStreaming;
  });

  it('should patch WebAssembly.compileStreaming when available', () => {
    const mockPostMessage = vi.fn();
    const mockSelf = { postMessage: mockPostMessage };

    const originalCompileStreaming = WebAssembly.compileStreaming;

    registerWebWorkerWasm({ self: mockSelf });

    expect(WebAssembly.compileStreaming).not.toBe(originalCompileStreaming);

    WebAssembly.compileStreaming = originalCompileStreaming;
  });

  it('forwards missing build_id dev warning to the parent thread', async () => {
    const mockPostMessage = vi.fn();
    registerWebWorkerWasm({ self: { postMessage: mockPostMessage } });

    const url = 'http://localhost/worker.wasm';
    const response = new Response(MINIMAL_WASM, { headers: { 'Content-Type': 'application/wasm' } });
    Object.defineProperty(response, 'url', { value: url });

    await WebAssembly.instantiateStreaming(Promise.resolve(response), {});

    expect(mockPostMessage).toHaveBeenCalledWith(missingBuildIdWorkerMessage(url));
  });
});

describe('patchFrames() with worker images', () => {
  afterEach(() => {
    delete WINDOW._sentryWasmImages;
  });

  it('should find image from worker when main thread has no matching image', () => {
    WINDOW._sentryWasmImages = [
      {
        type: 'wasm',
        code_id: 'abc123',
        code_file: 'http://localhost:8001/worker.wasm',
        debug_file: null,
        debug_id: 'abc12300000000000000000000000000',
      },
    ];

    const frames: StackFrame[] = [
      {
        filename: 'http://localhost:8001/worker.wasm:wasm-function[10]:0x1234',
        function: 'worker_function',
        in_app: true,
      },
    ];

    const result = patchFrames(frames);

    expect(result).toBe(true);
    expect(frames[0]?.filename).toBe('http://localhost:8001/worker.wasm');
    expect(frames[0]?.instruction_addr).toBe('0x1234');
    expect(frames[0]?.platform).toBe('native');
    expect(frames[0]?.addr_mode).toBe('rel:0');
  });

  it('should apply applicationKey to frames from worker images', () => {
    // Set up worker images
    WINDOW._sentryWasmImages = [
      {
        type: 'wasm',
        code_id: 'abc123',
        code_file: 'http://localhost:8001/worker.wasm',
        debug_file: null,
        debug_id: 'abc12300000000000000000000000000',
      },
    ];

    const frames: StackFrame[] = [
      {
        filename: 'http://localhost:8001/worker.wasm:wasm-function[10]:0x1234',
        function: 'worker_function',
        in_app: true,
      },
    ];

    patchFrames(frames, 'my-worker-app');

    expect(frames[0]?.module_metadata).toEqual({
      '_sentryBundlerPluginAppKey:my-worker-app': true,
    });
  });

  it('should return false when no matching image exists in main thread or worker', () => {
    WINDOW._sentryWasmImages = [];

    const frames: StackFrame[] = [
      {
        filename: 'http://localhost:8001/unknown.wasm:wasm-function[10]:0x1234',
        function: 'unknown_function',
        in_app: true,
      },
    ];

    const result = patchFrames(frames);

    expect(result).toBe(false);
    expect(frames[0]?.filename).toBe('http://localhost:8001/unknown.wasm');
    expect(frames[0]?.instruction_addr).toBe('0x1234');
    expect(frames[0]?.platform).toBe('native');
    expect(frames[0]?.addr_mode).toBeUndefined();
  });

  it('should offset addr_mode indices when existingImagesOffset is provided', () => {
    WINDOW._sentryWasmImages = [
      {
        type: 'wasm',
        code_id: 'abc123',
        code_file: 'http://localhost:8001/worker.wasm',
        debug_file: null,
        debug_id: 'abc12300000000000000000000000000',
      },
    ];

    const frames: StackFrame[] = [
      {
        filename: 'http://localhost:8001/worker.wasm:wasm-function[10]:0x1234',
        function: 'worker_function',
        in_app: true,
      },
    ];

    const result = patchFrames(frames, undefined, 3);

    expect(result).toBe(true);
    expect(frames[0]?.addr_mode).toBe('rel:3');
  });
});
