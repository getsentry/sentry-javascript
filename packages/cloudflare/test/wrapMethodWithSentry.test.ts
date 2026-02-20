import * as sentryCore from '@sentry/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isInstrumented } from '../src/instrument';
import { wrapMethodWithSentry } from '../src/wrapMethodWithSentry';

// Mock the SDK init to avoid actual SDK initialization
vi.mock('../src/sdk', () => ({
  init: vi.fn(() => ({
    getOptions: () => ({}),
    on: vi.fn(),
  })),
}));

// Mock sentry/core functions
vi.mock('@sentry/core', async importOriginal => {
  const actual = await importOriginal();
  return {
    ...actual,
    getClient: vi.fn(),
    withIsolationScope: vi.fn((callback: (scope: any) => any) => callback(createMockScope())),
    withScope: vi.fn((callback: (scope: any) => any) => callback(createMockScope())),
    startSpan: vi.fn((opts, callback) => callback(createMockSpan())),
    startNewTrace: vi.fn(callback => callback()),
    captureException: vi.fn(),
    flush: vi.fn().mockResolvedValue(true),
    getActiveSpan: vi.fn(),
  };
});

function createMockScope() {
  return {
    getClient: vi.fn(),
    setClient: vi.fn(),
  };
}

function createMockSpan() {
  return {
    setAttribute: vi.fn(),
    setAttributes: vi.fn(),
    spanContext: vi.fn().mockReturnValue({
      traceId: 'test-trace-id-12345678901234567890',
      spanId: 'test-span-id',
    }),
  };
}

function createMockContext(options: { hasStorage?: boolean; hasWaitUntil?: boolean } = {}) {
  const mockStorage = {
    get: vi.fn().mockResolvedValue(undefined),
    put: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(false),
  };

  return {
    waitUntil: options.hasWaitUntil !== false ? vi.fn() : undefined,
    storage: options.hasStorage !== false ? mockStorage : undefined,
    originalStorage: options.hasStorage !== false ? mockStorage : undefined,
  } as any;
}

describe('wrapMethodWithSentry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('basic wrapping', () => {
    it('wraps a sync method and returns its result synchronously (not a Promise)', () => {
      const handler = vi.fn().mockReturnValue('sync-result');
      const options = {
        options: {},
        context: createMockContext(),
      };

      const wrapped = wrapMethodWithSentry(options, handler);
      const result = wrapped();

      expect(handler).toHaveBeenCalled();
      expect(result).not.toBeInstanceOf(Promise);
      expect(result).toBe('sync-result');
    });

    it('wraps a sync method with spanName and returns synchronously (not a Promise)', () => {
      const handler = vi.fn().mockReturnValue('sync-result');
      const options = {
        options: {},
        context: createMockContext(),
        spanName: 'test-span',
      };

      const wrapped = wrapMethodWithSentry(options, handler);
      const result = wrapped();

      expect(handler).toHaveBeenCalled();
      expect(result).not.toBeInstanceOf(Promise);
      expect(result).toBe('sync-result');
    });

    it('wraps a sync method with startNewTrace and returns synchronously (not a Promise)', () => {
      const handler = vi.fn().mockReturnValue('sync-result');
      const options = {
        options: {},
        context: createMockContext(),
        spanName: 'test-span',
        startNewTrace: true,
      };

      const wrapped = wrapMethodWithSentry(options, handler);
      const result = wrapped();

      expect(handler).toHaveBeenCalled();
      expect(result).not.toBeInstanceOf(Promise);
      expect(result).toBe('sync-result');
    });

    it('wraps an async method and returns a promise', async () => {
      const handler = vi.fn().mockResolvedValue('async-result');
      const options = {
        options: {},
        context: createMockContext(),
      };

      const wrapped = wrapMethodWithSentry(options, handler);
      const result = wrapped();

      expect(result).toBeInstanceOf(Promise);
      await expect(result).resolves.toBe('async-result');
      expect(handler).toHaveBeenCalled();
    });

    it('returns a Promise when linkPreviousTrace is true (even for sync handlers)', async () => {
      const handler = vi.fn().mockReturnValue('sync-result');
      const mockStorage = {
        get: vi.fn().mockResolvedValue(undefined),
        put: vi.fn().mockResolvedValue(undefined),
      };
      const context = {
        waitUntil: vi.fn(),
        originalStorage: mockStorage,
      } as any;

      const options = {
        options: {},
        context,
        spanName: 'alarm',
        startNewTrace: true,
        linkPreviousTrace: true,
      };

      const wrapped = wrapMethodWithSentry(options, handler);
      const result = wrapped();

      expect(result).toBeInstanceOf(Promise);
      await expect(result).resolves.toBe('sync-result');
    });

    it('marks handler as instrumented', () => {
      const handler = vi.fn();
      const options = {
        options: {},
        context: createMockContext(),
      };

      expect(isInstrumented(handler)).toBeUndefined();

      wrapMethodWithSentry(options, handler);

      expect(isInstrumented(handler)).toBe(true);
    });

    it('does not re-wrap already instrumented handler', () => {
      const handler = vi.fn();
      const options = {
        options: {},
        context: createMockContext(),
      };

      const wrapped1 = wrapMethodWithSentry(options, handler);
      const wrapped2 = wrapMethodWithSentry(options, wrapped1);

      // Should return the same wrapped function
      expect(wrapped2).toBe(wrapped1);
    });

    it('does not mark handler when noMark is true', () => {
      const handler = vi.fn();
      const options = {
        options: {},
        context: createMockContext(),
      };

      wrapMethodWithSentry(options, handler, undefined, true);

      expect(isInstrumented(handler)).toBeFalsy();
    });
  });

  describe('span creation', () => {
    it('creates span with spanName when provided', async () => {
      const handler = vi.fn().mockResolvedValue('result');
      const options = {
        options: {},
        context: createMockContext(),
        spanName: 'test-span',
        spanOp: 'test-op',
      };

      const wrapped = wrapMethodWithSentry(options, handler);
      await wrapped();

      expect(sentryCore.startSpan).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'test-span',
        }),
        expect.any(Function),
      );
    });

    it('does not create span when spanName is not provided', async () => {
      const handler = vi.fn().mockResolvedValue('result');
      const options = {
        options: {},
        context: createMockContext(),
      };

      const wrapped = wrapMethodWithSentry(options, handler);
      await wrapped();

      // startSpan should not be called when no spanName is provided
      expect(sentryCore.startSpan).not.toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    it('captures exceptions from sync methods', async () => {
      const error = new Error('Test sync error');
      const handler = vi.fn().mockImplementation(() => {
        throw error;
      });
      const options = {
        options: {},
        context: createMockContext(),
      };

      const wrapped = wrapMethodWithSentry(options, handler);

      await expect(async () => wrapped()).rejects.toThrow('Test sync error');
      expect(sentryCore.captureException).toHaveBeenCalledWith(error, {
        mechanism: {
          type: 'auto.faas.cloudflare.durable_object',
          handled: false,
        },
      });
    });

    it('captures exceptions from async methods', async () => {
      const error = new Error('Test async error');
      const handler = vi.fn().mockRejectedValue(error);
      const options = {
        options: {},
        context: createMockContext(),
      };

      const wrapped = wrapMethodWithSentry(options, handler);

      await expect(wrapped()).rejects.toThrow('Test async error');
      expect(sentryCore.captureException).toHaveBeenCalledWith(error, {
        mechanism: {
          type: 'auto.faas.cloudflare.durable_object',
          handled: false,
        },
      });
    });
  });

  describe('startNewTrace option', () => {
    it('uses withIsolationScope when startNewTrace is true', async () => {
      const handler = vi.fn().mockResolvedValue('result');
      const options = {
        options: {},
        context: createMockContext(),
        startNewTrace: true,
        spanName: 'alarm',
      };

      const wrapped = wrapMethodWithSentry(options, handler);
      await wrapped();

      expect(sentryCore.withIsolationScope).toHaveBeenCalled();
    });

    it('uses startNewTrace when startNewTrace is true and spanName is set', async () => {
      const handler = vi.fn().mockResolvedValue('result');
      const options = {
        options: {},
        context: createMockContext(),
        startNewTrace: true,
        spanName: 'alarm',
      };

      const wrapped = wrapMethodWithSentry(options, handler);
      await wrapped();

      expect(sentryCore.startNewTrace).toHaveBeenCalledWith(expect.any(Function));
    });

    it('does not use startNewTrace when startNewTrace is false', async () => {
      const handler = vi.fn().mockResolvedValue('result');
      const options = {
        options: {},
        context: createMockContext(),
        startNewTrace: false,
        spanName: 'test-span',
      };

      const wrapped = wrapMethodWithSentry(options, handler);
      await wrapped();

      expect(sentryCore.startNewTrace).not.toHaveBeenCalled();
    });
  });

  describe('linkPreviousTrace option', () => {
    it('retrieves stored span context when linkPreviousTrace is true', async () => {
      const storedContext = {
        traceId: 'previous-trace-id-1234567890123456',
        spanId: 'previous-span-id',
      };
      const mockStorage = {
        get: vi.fn().mockResolvedValue(storedContext),
        put: vi.fn().mockResolvedValue(undefined),
      };
      const context = {
        waitUntil: vi.fn(),
        originalStorage: mockStorage,
      } as any;

      const handler = vi.fn().mockResolvedValue('result');
      const options = {
        options: {},
        context,
        startNewTrace: true,
        linkPreviousTrace: true,
        spanName: 'alarm',
      };

      const wrapped = wrapMethodWithSentry(options, handler);
      await wrapped();

      expect(mockStorage.get).toHaveBeenCalledWith('__SENTRY_TRACE_LINK__alarm');
    });

    it('builds span links from stored context', async () => {
      const storedContext = {
        traceId: 'previous-trace-id-1234567890123456',
        spanId: 'previous-span-id',
      };
      const mockStorage = {
        get: vi.fn().mockResolvedValue(storedContext),
        put: vi.fn().mockResolvedValue(undefined),
      };
      const context = {
        waitUntil: vi.fn(),
        originalStorage: mockStorage,
      } as any;

      const handler = vi.fn().mockResolvedValue('result');
      const options = {
        options: {},
        context,
        startNewTrace: true,
        linkPreviousTrace: true,
        spanName: 'alarm',
      };

      const wrapped = wrapMethodWithSentry(options, handler);
      await wrapped();

      // startSpan should be called with links
      expect(sentryCore.startSpan).toHaveBeenCalledWith(
        expect.objectContaining({
          links: expect.arrayContaining([
            expect.objectContaining({
              context: expect.objectContaining({
                traceId: 'previous-trace-id-1234567890123456',
                spanId: 'previous-span-id',
              }),
              attributes: { 'sentry.link.type': 'previous_trace' },
            }),
          ]),
        }),
        expect.any(Function),
      );
    });

    it('stores span context after execution when linkPreviousTrace is true', async () => {
      vi.mocked(sentryCore.getActiveSpan).mockReturnValue({
        spanContext: vi.fn().mockReturnValue({
          traceId: 'current-trace-id-123456789012345678',
          spanId: 'current-span-id',
        }),
      } as any);

      const mockStorage = {
        get: vi.fn().mockResolvedValue(undefined),
        put: vi.fn().mockResolvedValue(undefined),
      };
      const context = {
        waitUntil: vi.fn(),
        originalStorage: mockStorage,
      } as any;

      const handler = vi.fn().mockResolvedValue('result');
      const options = {
        options: {},
        context,
        startNewTrace: true,
        linkPreviousTrace: true,
        spanName: 'alarm',
      };

      const wrapped = wrapMethodWithSentry(options, handler);
      await wrapped();

      // Should store span context for future linking
      expect(mockStorage.put).toHaveBeenCalledWith('__SENTRY_TRACE_LINK__alarm', expect.any(Object));
    });

    it('does not retrieve stored context when linkPreviousTrace is false', async () => {
      const mockStorage = {
        get: vi.fn().mockResolvedValue(undefined),
        put: vi.fn().mockResolvedValue(undefined),
      };
      const context = {
        waitUntil: vi.fn(),
        originalStorage: mockStorage,
      } as any;

      const handler = vi.fn().mockResolvedValue('result');
      const options = {
        options: {},
        context,
        startNewTrace: true,
        linkPreviousTrace: false,
        spanName: 'alarm',
      };

      const wrapped = wrapMethodWithSentry(options, handler);
      await wrapped();

      expect(mockStorage.get).not.toHaveBeenCalled();
    });
  });

  describe('callback execution', () => {
    it('executes callback before handler', async () => {
      const callOrder: string[] = [];
      const handler = vi.fn().mockImplementation(() => {
        callOrder.push('handler');
        return 'result';
      });
      const callback = vi.fn().mockImplementation(() => {
        callOrder.push('callback');
      });
      const options = {
        options: {},
        context: createMockContext(),
      };

      const wrapped = wrapMethodWithSentry(options, handler, callback);
      await wrapped('arg1', 'arg2');

      expect(callback).toHaveBeenCalledWith('arg1', 'arg2');
      expect(callOrder).toEqual(['callback', 'handler']);
    });
  });

  describe('waitUntil flush', () => {
    it('calls waitUntil with flush when context has waitUntil', async () => {
      const waitUntil = vi.fn();
      const context = {
        waitUntil,
        originalStorage: undefined,
      } as any;

      const handler = vi.fn().mockResolvedValue('result');
      const options = {
        options: {},
        context,
      };

      const wrapped = wrapMethodWithSentry(options, handler);
      await wrapped();

      expect(waitUntil).toHaveBeenCalled();
      expect(sentryCore.flush).toHaveBeenCalledWith(2000);
    });

    it('handles missing waitUntil gracefully', async () => {
      const context = {
        originalStorage: undefined,
      } as any;

      const handler = vi.fn().mockResolvedValue('result');
      const options = {
        options: {},
        context,
      };

      const wrapped = wrapMethodWithSentry(options, handler);

      // Should not throw
      await expect(wrapped()).resolves.toBeDefined();
    });
  });

  describe('argument passing', () => {
    it('passes arguments to handler', async () => {
      const handler = vi.fn().mockResolvedValue('result');
      const options = {
        options: {},
        context: createMockContext(),
      };

      const wrapped = wrapMethodWithSentry(options, handler);
      await wrapped('arg1', 'arg2', { key: 'value' });

      expect(handler).toHaveBeenCalledWith('arg1', 'arg2', { key: 'value' });
    });

    it('preserves this context', async () => {
      const thisArg = { name: 'test-context' };
      const handler = vi.fn(function (this: any) {
        return this.name;
      });
      const options = {
        options: {},
        context: createMockContext(),
      };

      const wrapped = wrapMethodWithSentry(options, handler);
      await wrapped.call(thisArg);

      expect(handler.mock.instances[0]).toBe(thisArg);
    });
  });
});
