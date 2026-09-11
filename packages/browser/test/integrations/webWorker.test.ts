/**
 * @vitest-environment jsdom
 */

import * as SentryCore from '@sentry/core';
import type { MockInstance } from 'vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BrowserClient } from '../../src/client';
import * as helpers from '../../src/helpers';
import { INTEGRATION_NAME, registerWebWorker, webWorkerIntegration } from '../../src/integrations/webWorker';
import { defaultStackParser } from '../../src/stack-parsers';
import { getDefaultBrowserClientOptions } from '../helper/browser-client-options';

// Mock @sentry/core
vi.mock('@sentry/core', async importActual => {
  return {
    ...((await importActual()) as any),
    debug: {
      log: vi.fn(),
    },
  };
});

// Mock debug build
vi.mock('../../src/debug-build', () => ({
  DEBUG_BUILD: true,
}));

// Mock helpers
vi.mock('../../src/helpers', () => ({
  WINDOW: {
    _sentryDebugIds: undefined,
  },
  ignoreNextOnError: vi.fn(),
}));

function getListener(addEventListener: ReturnType<typeof vi.fn>, type: string): (event: any) => void {
  const call = addEventListener.mock.calls.find(([eventType]) => eventType === type);
  if (!call) {
    throw new Error(`No ${type} listener registered`);
  }
  return call[1];
}

describe('webWorkerIntegration', () => {
  const mockDebugLog = SentryCore.debug.log as any;

  let mockWorker: {
    addEventListener: ReturnType<typeof vi.fn>;
    postMessage: ReturnType<typeof vi.fn>;
    _sentryDebugIds?: Record<string, string>;
  };

  let mockWorker2: {
    addEventListener: ReturnType<typeof vi.fn>;
    postMessage: ReturnType<typeof vi.fn>;
    _sentryDebugIds?: Record<string, string>;
  };

  let mockEvent: {
    data: any;
    stopImmediatePropagation: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.clearAllMocks();

    // Reset WINDOW mock
    (helpers.WINDOW as any)._sentryDebugIds = undefined;

    // Setup mock worker
    mockWorker = {
      addEventListener: vi.fn(),
      postMessage: vi.fn(),
    };

    mockWorker2 = {
      addEventListener: vi.fn(),
      postMessage: vi.fn(),
    };

    // Setup mock event
    mockEvent = {
      data: {},
      stopImmediatePropagation: vi.fn(),
    };
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('creates integration with correct name', () => {
    const integration = webWorkerIntegration({ worker: mockWorker as any });

    expect(integration.name).toBe(INTEGRATION_NAME);
    expect(integration.name).toBe('WebWorker');
    expect(typeof integration.setupOnce).toBe('function');
  });

  describe('setupOnce', () => {
    it('adds message event listener to the worker', () => {
      const integration = webWorkerIntegration({ worker: mockWorker as any });

      integration.setupOnce!();

      expect(mockWorker.addEventListener).toHaveBeenCalledWith('message', expect.any(Function));
    });

    it('adds message event listener to multiple workers passed to the integration', () => {
      const integration = webWorkerIntegration({ worker: [mockWorker, mockWorker2] as any });
      integration.setupOnce!();
      expect(mockWorker.addEventListener).toHaveBeenCalledWith('message', expect.any(Function));
      expect(mockWorker2.addEventListener).toHaveBeenCalledWith('message', expect.any(Function));
    });

    it('adds message event listener to a worker added later', () => {
      const integration = webWorkerIntegration({ worker: mockWorker as any });
      integration.setupOnce!();
      integration.addWorker(mockWorker2 as any);
      expect(mockWorker2.addEventListener).toHaveBeenCalledWith('message', expect.any(Function));
    });

    describe('message handler', () => {
      let messageHandler: (event: any) => void;

      beforeEach(() => {
        const integration = webWorkerIntegration({ worker: mockWorker as any });
        integration.setupOnce!();

        messageHandler = getListener(mockWorker.addEventListener, 'message');
      });

      it('ignores non-Sentry messages', () => {
        mockEvent.data = { someData: 'value' };

        messageHandler(mockEvent);

        expect(mockEvent.stopImmediatePropagation).not.toHaveBeenCalled();
        expect(mockDebugLog).not.toHaveBeenCalled();
      });

      it('ignores plain objects without _sentryMessage flag', () => {
        mockEvent.data = {
          someData: 'value',
          _sentry: {},
        };

        messageHandler(mockEvent);

        expect(mockEvent.stopImmediatePropagation).not.toHaveBeenCalled();
        expect(mockDebugLog).not.toHaveBeenCalled();
      });

      it('processes valid Sentry messages', () => {
        mockEvent.data = {
          _sentryMessage: true,
          _sentryDebugIds: { 'file1.js': 'debug-id-1' },
        };

        messageHandler(mockEvent);

        expect(mockEvent.stopImmediatePropagation).toHaveBeenCalled();
        expect(mockDebugLog).toHaveBeenCalledWith('Sentry debugId web worker message received', mockEvent.data);
      });

      it('merges debug IDs with worker precedence for new IDs', () => {
        (helpers.WINDOW as any)._sentryDebugIds = undefined;

        mockEvent.data = {
          _sentryMessage: true,
          _sentryDebugIds: {
            'worker-file1.js': 'worker-debug-1',
            'worker-file2.js': 'worker-debug-2',
          },
        };

        messageHandler(mockEvent);

        expect((helpers.WINDOW as any)._sentryDebugIds).toEqual({
          'worker-file1.js': 'worker-debug-1',
          'worker-file2.js': 'worker-debug-2',
        });
      });

      it('gives main thread precedence over worker for conflicting debug IDs', () => {
        (helpers.WINDOW as any)._sentryDebugIds = {
          'shared-file.js': 'main-debug-id',
          'main-only.js': 'main-debug-2',
        };

        mockEvent.data = {
          _sentryMessage: true,
          _sentryDebugIds: {
            'shared-file.js': 'worker-debug-id', // Should be overridden
            'worker-only.js': 'worker-debug-3', // Should be kept
          },
        };

        messageHandler(mockEvent);

        expect((helpers.WINDOW as any)._sentryDebugIds).toEqual({
          'shared-file.js': 'main-debug-id', // Main thread wins
          'main-only.js': 'main-debug-2', // Main thread preserved
          'worker-only.js': 'worker-debug-3', // Worker added
        });
      });

      it('handles empty debug IDs from worker', () => {
        (helpers.WINDOW as any)._sentryDebugIds = { 'main.js': 'main-debug' };

        mockEvent.data = {
          _sentryMessage: true,
          _sentryDebugIds: {},
        };

        messageHandler(mockEvent);

        expect((helpers.WINDOW as any)._sentryDebugIds).toEqual({
          'main.js': 'main-debug',
        });
      });

      it('processes module metadata from worker', () => {
        (helpers.WINDOW as any)._sentryModuleMetadata = undefined;
        const moduleMetadata = {
          'Error\n    at worker-file1.js:1:1': { '_sentryBundlerPluginAppKey:my-app': true },
          'Error\n    at worker-file2.js:2:2': { '_sentryBundlerPluginAppKey:my-app': true },
        };

        mockEvent.data = {
          _sentryMessage: true,
          _sentryModuleMetadata: moduleMetadata,
        };

        messageHandler(mockEvent);

        expect(mockEvent.stopImmediatePropagation).toHaveBeenCalled();
        expect(mockDebugLog).toHaveBeenCalledWith('Sentry module metadata web worker message received', mockEvent.data);
        expect((helpers.WINDOW as any)._sentryModuleMetadata).toEqual(moduleMetadata);
      });

      it('handles message with both debug IDs and module metadata', () => {
        (helpers.WINDOW as any)._sentryModuleMetadata = undefined;
        const moduleMetadata = {
          'Error\n    at worker-file.js:1:1': { '_sentryBundlerPluginAppKey:my-app': true },
        };

        mockEvent.data = {
          _sentryMessage: true,
          _sentryDebugIds: { 'worker-file.js': 'debug-id-1' },
          _sentryModuleMetadata: moduleMetadata,
        };

        messageHandler(mockEvent);

        expect(mockEvent.stopImmediatePropagation).toHaveBeenCalled();
        expect((helpers.WINDOW as any)._sentryModuleMetadata).toEqual(moduleMetadata);
        expect((helpers.WINDOW as any)._sentryDebugIds).toEqual({
          'worker-file.js': 'debug-id-1',
        });
      });

      it('accepts message with only module metadata', () => {
        (helpers.WINDOW as any)._sentryModuleMetadata = undefined;
        const moduleMetadata = {
          'Error\n    at worker-file.js:1:1': { '_sentryBundlerPluginAppKey:my-app': true },
        };

        mockEvent.data = {
          _sentryMessage: true,
          _sentryModuleMetadata: moduleMetadata,
        };

        messageHandler(mockEvent);

        expect(mockEvent.stopImmediatePropagation).toHaveBeenCalled();
        expect((helpers.WINDOW as any)._sentryModuleMetadata).toEqual(moduleMetadata);
      });

      it('ignores invalid module metadata', () => {
        mockEvent.data = {
          _sentryMessage: true,
          _sentryModuleMetadata: 'not-an-object',
        };

        messageHandler(mockEvent);

        expect(mockEvent.stopImmediatePropagation).not.toHaveBeenCalled();
      });

      it('processes WASM images from worker', () => {
        (helpers.WINDOW as any)._sentryWasmImages = undefined;
        const wasmImages = [
          {
            type: 'wasm',
            code_id: 'abc123',
            code_file: 'http://localhost:8001/worker.wasm',
            debug_file: null,
            debug_id: 'abc12300000000000000000000000000',
          },
        ];

        mockEvent.data = {
          _sentryMessage: true,
          _sentryWasmImages: wasmImages,
        };

        messageHandler(mockEvent);

        expect(mockEvent.stopImmediatePropagation).toHaveBeenCalled();
        expect(mockDebugLog).toHaveBeenCalledWith('Sentry WASM images web worker message received', mockEvent.data);
        expect((helpers.WINDOW as any)._sentryWasmImages).toEqual(wasmImages);
      });

      it('deduplicates WASM images by code_file URL', () => {
        (helpers.WINDOW as any)._sentryWasmImages = [
          {
            type: 'wasm',
            code_id: 'abc123',
            code_file: 'http://localhost:8001/existing.wasm',
            debug_file: null,
            debug_id: 'abc12300000000000000000000000000',
          },
        ];

        mockEvent.data = {
          _sentryMessage: true,
          _sentryWasmImages: [
            {
              type: 'wasm',
              code_id: 'abc123',
              code_file: 'http://localhost:8001/existing.wasm', // duplicate, should be ignored
              debug_file: null,
              debug_id: 'abc12300000000000000000000000000',
            },
            {
              type: 'wasm',
              code_id: 'def456',
              code_file: 'http://localhost:8001/new.wasm', // new, should be added
              debug_file: null,
              debug_id: 'def45600000000000000000000000000',
            },
          ],
        };

        messageHandler(mockEvent);

        expect((helpers.WINDOW as any)._sentryWasmImages).toEqual([
          {
            type: 'wasm',
            code_id: 'abc123',
            code_file: 'http://localhost:8001/existing.wasm',
            debug_file: null,
            debug_id: 'abc12300000000000000000000000000',
          },
          {
            type: 'wasm',
            code_id: 'def456',
            code_file: 'http://localhost:8001/new.wasm',
            debug_file: null,
            debug_id: 'def45600000000000000000000000000',
          },
        ]);
      });

      it('ignores invalid WASM images (not an array)', () => {
        mockEvent.data = {
          _sentryMessage: true,
          _sentryWasmImages: 'not-an-array',
        };

        messageHandler(mockEvent);

        expect(mockEvent.stopImmediatePropagation).not.toHaveBeenCalled();
      });

      it('ignores WASM images with invalid array elements (null, undefined, missing code_file)', () => {
        mockEvent.data = {
          _sentryMessage: true,
          _sentryWasmImages: [null, undefined, { type: 'wasm' }, { code_file: 123 }],
        };

        messageHandler(mockEvent);

        expect(mockEvent.stopImmediatePropagation).not.toHaveBeenCalled();
      });

      it('gives main thread precedence over worker for conflicting module metadata', () => {
        (helpers.WINDOW as any)._sentryModuleMetadata = {
          'Error\n    at shared-file.js:1:1': { '_sentryBundlerPluginAppKey:main-app': true, source: 'main' },
          'Error\n    at main-only.js:1:1': { '_sentryBundlerPluginAppKey:main-app': true },
        };

        mockEvent.data = {
          _sentryMessage: true,
          _sentryModuleMetadata: {
            'Error\n    at shared-file.js:1:1': { '_sentryBundlerPluginAppKey:worker-app': true, source: 'worker' },
            'Error\n    at worker-only.js:1:1': { '_sentryBundlerPluginAppKey:worker-app': true },
          },
        };

        messageHandler(mockEvent);

        expect((helpers.WINDOW as any)._sentryModuleMetadata).toEqual({
          'Error\n    at shared-file.js:1:1': { '_sentryBundlerPluginAppKey:main-app': true, source: 'main' }, // Main thread wins
          'Error\n    at main-only.js:1:1': { '_sentryBundlerPluginAppKey:main-app': true }, // Main thread preserved
          'Error\n    at worker-only.js:1:1': { '_sentryBundlerPluginAppKey:worker-app': true }, // Worker added
        });
      });
    });
  });
});

describe('registerWebWorker', () => {
  let mockWorkerSelf: {
    postMessage: ReturnType<typeof vi.fn>;
    addEventListener: ReturnType<typeof vi.fn>;
    _sentryDebugIds?: Record<string, string>;
    _sentryModuleMetadata?: Record<string, any>;
    location?: { href?: string };
  };

  // registerWebWorker raises this globally, so every test has to put it back.
  const originalStackTraceLimit = Error.stackTraceLimit;

  beforeEach(() => {
    vi.clearAllMocks();

    mockWorkerSelf = {
      postMessage: vi.fn(),
      addEventListener: vi.fn(),
    };
  });

  afterEach(() => {
    Error.stackTraceLimit = originalStackTraceLimit;
  });

  it('posts message with _sentryMessage flag', () => {
    registerWebWorker({ self: mockWorkerSelf as any });

    expect(mockWorkerSelf.postMessage).toHaveBeenCalledTimes(1);
    expect(mockWorkerSelf.postMessage).toHaveBeenCalledWith({
      _sentryMessage: true,
      _sentryDebugIds: undefined,
      _sentryModuleMetadata: undefined,
      _sentryForwardsErrors: true,
    });
  });

  it('includes debug IDs when available', () => {
    mockWorkerSelf._sentryDebugIds = {
      'worker-file1.js': 'debug-id-1',
      'worker-file2.js': 'debug-id-2',
    };

    registerWebWorker({ self: mockWorkerSelf as any });

    expect(mockWorkerSelf.postMessage).toHaveBeenCalledTimes(1);
    expect(mockWorkerSelf.postMessage).toHaveBeenCalledWith({
      _sentryMessage: true,
      _sentryDebugIds: {
        'worker-file1.js': 'debug-id-1',
        'worker-file2.js': 'debug-id-2',
      },
      _sentryModuleMetadata: undefined,
      _sentryForwardsErrors: true,
    });
  });

  it('handles undefined debug IDs', () => {
    mockWorkerSelf._sentryDebugIds = undefined;

    registerWebWorker({ self: mockWorkerSelf as any });

    expect(mockWorkerSelf.postMessage).toHaveBeenCalledTimes(1);
    expect(mockWorkerSelf.postMessage).toHaveBeenCalledWith({
      _sentryMessage: true,
      _sentryDebugIds: undefined,
      _sentryModuleMetadata: undefined,
      _sentryForwardsErrors: true,
    });
  });

  it('includes raw module metadata when available', () => {
    const rawMetadata = {
      'Error\n    at worker-file1.js:1:1': { '_sentryBundlerPluginAppKey:my-app': true },
      'Error\n    at worker-file2.js:1:1': { '_sentryBundlerPluginAppKey:my-app': true },
    };

    mockWorkerSelf._sentryModuleMetadata = rawMetadata;

    registerWebWorker({ self: mockWorkerSelf as any });

    expect(mockWorkerSelf.postMessage).toHaveBeenCalledWith({
      _sentryMessage: true,
      _sentryDebugIds: undefined,
      _sentryModuleMetadata: rawMetadata,
      _sentryForwardsErrors: true,
    });
  });

  it('sends undefined module metadata when not available', () => {
    mockWorkerSelf._sentryModuleMetadata = undefined;

    registerWebWorker({ self: mockWorkerSelf as any });

    expect(mockWorkerSelf.postMessage).toHaveBeenCalledWith({
      _sentryMessage: true,
      _sentryDebugIds: undefined,
      _sentryModuleMetadata: undefined,
      _sentryForwardsErrors: true,
    });
  });

  it('includes both debug IDs and module metadata when both available', () => {
    const rawMetadata = {
      'Error\n    at worker-file.js:1:1': { '_sentryBundlerPluginAppKey:my-app': true },
    };

    mockWorkerSelf._sentryDebugIds = {
      'worker-file.js': 'debug-id-1',
    };
    mockWorkerSelf._sentryModuleMetadata = rawMetadata;

    registerWebWorker({ self: mockWorkerSelf as any });

    expect(mockWorkerSelf.postMessage).toHaveBeenCalledWith({
      _sentryMessage: true,
      _sentryDebugIds: {
        'worker-file.js': 'debug-id-1',
      },
      _sentryModuleMetadata: rawMetadata,
      _sentryForwardsErrors: true,
    });
  });

  describe('error forwarding', () => {
    function trigger(type: string, event: unknown): void {
      getListener(mockWorkerSelf.addEventListener, type)(event);
    }

    it('raises the stack trace limit so forwarded stacks are not truncated', () => {
      Error.stackTraceLimit = 10;

      registerWebWorker({ self: mockWorkerSelf as any });

      expect(Error.stackTraceLimit).toBe(50);
    });

    it('forwards an uncaught error with its location, name and kind "error"', () => {
      registerWebWorker({ self: mockWorkerSelf as any });

      mockWorkerSelf.location = { href: 'http://localhost/worker.js' };
      const error = new Error('boom');
      trigger('error', {
        error,
        message: 'Uncaught Error: boom',
        filename: 'http://localhost/chunk.js',
        lineno: 12,
        colno: 9,
      });

      expect(mockWorkerSelf.postMessage).toHaveBeenLastCalledWith({
        _sentryMessage: true,
        _sentryWorkerError: {
          reason: error,
          filename: 'http://localhost/worker.js',
          kind: 'error',
          name: 'Error',
          url: 'http://localhost/chunk.js',
          lineno: 12,
          colno: 9,
        },
      });
    });

    it('sends the error name separately because structured clone resets it', () => {
      registerWebWorker({ self: mockWorkerSelf as any });

      const error = new Error('divide by zero');
      error.name = 'RuntimeError';
      trigger('error', { error });

      expect(mockWorkerSelf.postMessage).toHaveBeenLastCalledWith({
        _sentryMessage: true,
        _sentryWorkerError: expect.objectContaining({ reason: error, name: 'RuntimeError' }),
      });
    });

    it('falls back to the event message when there is no error object', () => {
      registerWebWorker({ self: mockWorkerSelf as any });

      trigger('error', { error: null, message: 'Uncaught Error: boom', lineno: 3, colno: 7 });

      expect(mockWorkerSelf.postMessage).toHaveBeenLastCalledWith({
        _sentryMessage: true,
        _sentryWorkerError: expect.objectContaining({
          reason: 'Uncaught Error: boom',
          kind: 'error',
          name: undefined,
          lineno: 3,
          colno: 7,
        }),
      });
    });

    it('tags forwarded rejections with kind "unhandledrejection"', () => {
      registerWebWorker({ self: mockWorkerSelf as any });

      const reason = new Error('rejected');
      trigger('unhandledrejection', { reason });

      expect(mockWorkerSelf.postMessage).toHaveBeenLastCalledWith({
        _sentryMessage: true,
        _sentryWorkerError: {
          reason,
          filename: undefined,
          kind: 'unhandledrejection',
          name: 'Error',
        },
      });
    });

    describe('when the reason cannot be structured-cloned', () => {
      beforeEach(() => {
        mockWorkerSelf.postMessage.mockImplementation(message => structuredClone(message));
      });

      it('retries with a fresh error that keeps message and stack but drops the cause', () => {
        registerWebWorker({ self: mockWorkerSelf as any });

        const error = new Error('boom') as Error & { cause?: unknown };
        error.cause = () => {};
        expect(() => trigger('error', { error })).not.toThrow();

        // The mocked postMessage clones for real, so a third call proves the
        // retry no longer carries the function that blocked the first one.
        expect(mockWorkerSelf.postMessage).toHaveBeenCalledTimes(3);
        expect(mockWorkerSelf.postMessage).toHaveBeenLastCalledWith({
          _sentryMessage: true,
          _sentryWorkerError: expect.objectContaining({
            reason: expect.objectContaining({ message: 'boom', stack: error.stack }),
            name: 'Error',
            kind: 'error',
          }),
        });
      });

      it('keeps the message and stack of a WebAssembly.Exception', () => {
        registerWebWorker({ self: mockWorkerSelf as any });

        const tag = new WebAssembly.Tag({ parameters: [] });
        const exception = new WebAssembly.Exception(tag, [], { traceStack: true });
        trigger('error', { error: exception });

        expect(mockWorkerSelf.postMessage).toHaveBeenLastCalledWith({
          _sentryMessage: true,
          _sentryWorkerError: expect.objectContaining({
            reason: expect.objectContaining({ message: 'wasm exception', stack: exception.stack }),
            name: 'WebAssembly.Exception',
          }),
        });
      });

      it('normalizes a reason that is not an error', () => {
        registerWebWorker({ self: mockWorkerSelf as any });

        trigger('unhandledrejection', { reason: { retry: () => {} } });

        expect(mockWorkerSelf.postMessage).toHaveBeenLastCalledWith({
          _sentryMessage: true,
          _sentryWorkerError: expect.objectContaining({
            reason: { retry: '[Function: retry]' },
            kind: 'unhandledrejection',
          }),
        });
      });

      it('does not throw out of the error handler when the retry fails as well', () => {
        registerWebWorker({ self: mockWorkerSelf as any });
        mockWorkerSelf.postMessage.mockImplementation(() => {
          throw new DOMException('could not be cloned', 'DataCloneError');
        });

        expect(() => trigger('error', { error: new Error('boom') })).not.toThrow();
      });
    });
  });
});

describe('registerWebWorker and webWorkerIntegration', () => {
  beforeEach(() => {});

  it('work together (with multiple workers)', () => {
    (helpers.WINDOW as any)._sentryDebugIds = {
      'Error at \n /main-file1.js': 'main-debug-1',
      'Error at \n /main-file2.js': 'main-debug-2',
      'Error at \n /shared-file.js': 'main-debug-id',
    };

    let cb1: ((arg0: any) => any) | undefined = undefined;
    let cb2: ((arg0: any) => any) | undefined = undefined;
    let cb3: ((arg0: any) => any) | undefined = undefined;

    // Setup mock worker
    const mockWorker = {
      _sentryDebugIds: {
        'Error at \n /worker-file1.js': 'worker-debug-1',
        'Error at \n /worker-file2.js': 'worker-debug-2',
        'Error at \n /shared-file.js': 'worker-debug-id',
      },
      addEventListener: vi.fn((_, l) => (cb1 = l)),
      postMessage: vi.fn(message => {
        // @ts-expect-error - cb is defined
        cb1({ data: message, stopImmediatePropagation: vi.fn() });
      }),
    };

    const mockWorker2 = {
      _sentryDebugIds: {
        'Error at \n /worker-2-file1.js': 'worker-2-debug-1',
        'Error at \n /worker-2-file2.js': 'worker-2-debug-2',
      },

      addEventListener: vi.fn((_, l) => (cb2 = l)),
      postMessage: vi.fn(message => {
        // @ts-expect-error - cb is defined
        cb2({ data: message, stopImmediatePropagation: vi.fn() });
      }),
    };

    const mockWorker3 = {
      _sentryDebugIds: {
        'Error at \n /worker-3-file1.js': 'worker-3-debug-1',
        'Error at \n /worker-3-file2.js': 'worker-3-debug-2',
      },
      addEventListener: vi.fn((_, l) => (cb3 = l)),
      postMessage: vi.fn(message => {
        // @ts-expect-error - cb is defined
        cb3({ data: message, stopImmediatePropagation: vi.fn() });
      }),
    };

    const integration = webWorkerIntegration({ worker: [mockWorker as any, mockWorker2 as any] });
    integration.setupOnce!();

    registerWebWorker({ self: mockWorker as any });
    registerWebWorker({ self: mockWorker2 as any });

    expect(mockWorker.addEventListener).toHaveBeenCalledWith('message', expect.any(Function));
    expect(mockWorker2.addEventListener).toHaveBeenCalledWith('message', expect.any(Function));

    expect(mockWorker.postMessage).toHaveBeenCalledWith({
      _sentryMessage: true,
      _sentryDebugIds: mockWorker._sentryDebugIds,
      _sentryModuleMetadata: undefined,
      _sentryForwardsErrors: true,
    });

    expect((helpers.WINDOW as any)._sentryDebugIds).toEqual({
      'Error at \n /main-file1.js': 'main-debug-1',
      'Error at \n /main-file2.js': 'main-debug-2',
      'Error at \n /shared-file.js': 'main-debug-id',
      'Error at \n /worker-file1.js': 'worker-debug-1',
      'Error at \n /worker-file2.js': 'worker-debug-2',
      'Error at \n /worker-2-file1.js': 'worker-2-debug-1',
      'Error at \n /worker-2-file2.js': 'worker-2-debug-2',
    });

    integration.addWorker(mockWorker3 as any);
    registerWebWorker({ self: mockWorker3 as any });

    expect(mockWorker3.addEventListener).toHaveBeenCalledWith('message', expect.any(Function));

    expect(mockWorker3.postMessage).toHaveBeenCalledWith({
      _sentryMessage: true,
      _sentryDebugIds: mockWorker3._sentryDebugIds,
      _sentryModuleMetadata: undefined,
      _sentryForwardsErrors: true,
    });

    expect((helpers.WINDOW as any)._sentryDebugIds).toEqual({
      'Error at \n /main-file1.js': 'main-debug-1',
      'Error at \n /main-file2.js': 'main-debug-2',
      'Error at \n /shared-file.js': 'main-debug-id',
      'Error at \n /worker-file1.js': 'worker-debug-1',
      'Error at \n /worker-file2.js': 'worker-debug-2',
      'Error at \n /worker-2-file1.js': 'worker-2-debug-1',
      'Error at \n /worker-2-file2.js': 'worker-2-debug-2',
      'Error at \n /worker-3-file1.js': 'worker-3-debug-1',
      'Error at \n /worker-3-file2.js': 'worker-3-debug-2',
    });
  });
});

describe('forwarded worker errors', () => {
  let client: BrowserClient;
  let captureEventSpy: MockInstance<BrowserClient['captureEvent']>;
  let mockWorker: { addEventListener: ReturnType<typeof vi.fn>; postMessage: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.clearAllMocks();

    client = new BrowserClient({
      ...getDefaultBrowserClientOptions(),
      stackParser: defaultStackParser,
    });
    SentryCore.setCurrentClient(client);
    client.init();
    captureEventSpy = vi.spyOn(client, 'captureEvent');

    mockWorker = { addEventListener: vi.fn(), postMessage: vi.fn() };
    const integration = webWorkerIntegration({ worker: mockWorker as any });
    integration.setupOnce!();
  });

  function receive(data: Record<string, unknown>): void {
    getListener(
      mockWorker.addEventListener,
      'message',
    )({
      data: { _sentryMessage: true, ...data },
      stopImmediatePropagation: vi.fn(),
    });
  }

  function forward(workerError: Record<string, unknown>): void {
    receive({ _sentryWorkerError: workerError });
  }

  function expectCapturedException(exception: Record<string, unknown>): void {
    expect(captureEventSpy).toHaveBeenCalledWith(
      expect.objectContaining({ exception: { values: [expect.objectContaining(exception)] } }),
      expect.anything(),
      expect.anything(),
    );
  }

  it('captures a forwarded error with the onerror mechanism', () => {
    const error = new Error('boom');

    forward({ reason: error, filename: 'http://localhost/worker.js', kind: 'error' });

    expect(captureEventSpy).toHaveBeenCalledWith(
      expect.objectContaining({ level: 'error' }),
      expect.objectContaining({
        originalException: error,
        mechanism: { handled: false, type: 'auto.browser.web_worker.onerror' },
      }),
      expect.anything(),
    );
  });

  it.each([
    ['kind "unhandledrejection"', 'unhandledrejection'],
    // Workers registered by an older SDK only forwarded rejections and sent no kind.
    ['no kind', undefined],
  ])('captures a forwarded rejection with %s using the onunhandledrejection mechanism', (_, kind) => {
    forward({ reason: new Error('rejected'), kind });

    expect(captureEventSpy).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        mechanism: { handled: false, type: 'auto.browser.web_worker.onunhandledrejection' },
      }),
      expect.anything(),
    );
  });

  it('does not apply promise-rejection wording to a thrown primitive', () => {
    forward({ reason: 'just a string', kind: 'error' });

    expectCapturedException({ type: 'Error', value: 'just a string' });
  });

  it('keeps promise-rejection wording for a rejected primitive', () => {
    forward({ reason: 'just a string', kind: 'unhandledrejection' });

    expectCapturedException({
      type: 'UnhandledRejection',
      value: 'Non-Error promise rejection captured with value: just a string',
    });
  });

  it('restores the name that structured clone dropped and parses the forwarded stack', () => {
    const error = new Error('divide by zero');
    error.name = 'RuntimeError';
    error.stack = [
      'RuntimeError: divide by zero',
      '    at trigger_crash (http://localhost:8080/maze.wasm:wasm-function[36]:0x2877)',
      '    at runStepGame (http://localhost:8080/worker.js:12:9)',
    ].join('\n');
    const cloned = structuredClone(error);
    expect(cloned.name).toBe('Error');

    forward({ reason: cloned, name: 'RuntimeError', kind: 'error' });

    expectCapturedException({
      type: 'RuntimeError',
      value: 'divide by zero',
      stacktrace: {
        frames: expect.arrayContaining([
          expect.objectContaining({ filename: 'http://localhost:8080/maze.wasm:wasm-function[36]:0x2877' }),
          expect.objectContaining({ filename: 'http://localhost:8080/worker.js' }),
        ]),
      },
    });
  });

  it.each([
    ['the script that threw', 'http://localhost/chunk.js', 'http://localhost/chunk.js'],
    ['the worker script when the event has no url', undefined, 'http://localhost/worker.js'],
    ['the worker script when the event url is empty', '', 'http://localhost/worker.js'],
  ])('adds a frame at %s when a message-only error has no stack', (_, url, frameFilename) => {
    forward({
      reason: 'Uncaught Error: boom',
      kind: 'error',
      filename: 'http://localhost/worker.js',
      url,
      lineno: 12,
      colno: 9,
    });

    expectCapturedException({
      value: 'Uncaught Error: boom',
      stacktrace: { frames: [expect.objectContaining({ filename: frameFilename, lineno: 12, colno: 9 })] },
    });
  });

  it('skips the global onerror copy only once the worker announced that it forwards errors', () => {
    const onWorkerError = getListener(mockWorker.addEventListener, 'error');

    onWorkerError({});
    expect(helpers.ignoreNextOnError).not.toHaveBeenCalled();

    receive({ _sentryDebugIds: undefined, _sentryForwardsErrors: true });
    onWorkerError({});
    expect(helpers.ignoreNextOnError).toHaveBeenCalledTimes(1);
  });
});
