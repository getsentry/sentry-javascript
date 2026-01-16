import type { DebugImage, StackFrame } from '@sentry/core';
import { GLOBAL_OBJ } from '@sentry/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { patchFrames, registerWebWorkerWasm } from '../src/index';

const WINDOW = GLOBAL_OBJ as typeof GLOBAL_OBJ & {
  _sentryWasmImages?: Array<DebugImage>;
};

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
