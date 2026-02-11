import type { Event } from '@sentry/core';
import { SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN, SEMANTIC_ATTRIBUTE_SENTRY_SOURCE } from '@sentry/core';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { wrapEventFunction } from '../../src/gcpfunction/events';
import type { EventFunction, EventFunctionWithCallback } from '../../src/gcpfunction/general';

const mockStartSpanManual = vi.fn((...spanArgs) => ({ ...spanArgs }));
const mockFlush = vi.fn((...args) => Promise.resolve(args));
const mockCaptureException = vi.fn();

const mockScope = {
  setContext: vi.fn(),
};

const mockSpan = {
  end: vi.fn(),
};

vi.mock('@sentry/node', async () => {
  const original = await vi.importActual('@sentry/node');
  return {
    ...original,
    startSpanManual: (...args: unknown[]) => {
      mockStartSpanManual(...args);
      mockSpan.end();
      return original.startSpanManual(...args);
    },
    getCurrentScope: () => {
      return mockScope;
    },
    flush: (...args: unknown[]) => {
      return mockFlush(...args);
    },
    captureException: (...args: unknown[]) => {
      mockCaptureException(...args);
    },
  };
});

describe('wrapEventFunction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function handleEvent(fn: EventFunctionWithCallback): Promise<any> {
    return new Promise((resolve, reject) => {
      const context = {
        eventType: 'event.type',
        resource: 'some.resource',
      };

      fn({}, context, (err: any, result: any) => {
        if (err != null || err != undefined) {
          reject(err);
        } else {
          resolve(result);
        }
      });
    });
  }

  describe('wrapEventFunction() without callback', () => {
    test('successful execution', async () => {
      const func: EventFunction = (_data, _context) => {
        return 42;
      };
      const wrappedHandler = wrapEventFunction(func);
      await expect(handleEvent(wrappedHandler)).resolves.toBe(42);

      const fakeTransactionContext = {
        name: 'event.type',
        op: 'function.gcp.event',
        attributes: {
          [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'component',
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.function.serverless.gcp_event',
        },
      };

      expect(mockStartSpanManual).toBeCalledWith(fakeTransactionContext, expect.any(Function));
      expect(mockSpan.end).toBeCalled();
      expect(mockFlush).toBeCalledWith(2000);
    });

    test('capture error', async () => {
      const error = new Error('wat');
      const handler: EventFunction = (_data, _context) => {
        throw error;
      };
      const wrappedHandler = wrapEventFunction(handler);
      await expect(handleEvent(wrappedHandler)).rejects.toThrowError(error);

      const fakeTransactionContext = {
        name: 'event.type',
        op: 'function.gcp.event',
        attributes: {
          [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'component',
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.function.serverless.gcp_event',
        },
      };

      expect(mockStartSpanManual).toBeCalledWith(fakeTransactionContext, expect.any(Function));
      expect(mockCaptureException).toBeCalledWith(error, expect.any(Function));
      expect(mockSpan.end).toBeCalled();
      expect(mockFlush).toBeCalled();
    });
  });

  describe('wrapEventFunction() as Promise', () => {
    test('successful execution', async () => {
      const func: EventFunction = (_data, _context) =>
        new Promise(resolve => {
          setTimeout(() => {
            resolve(42);
          }, 10);
        });
      const wrappedHandler = wrapEventFunction(func);
      await expect(handleEvent(wrappedHandler)).resolves.toBe(42);

      const fakeTransactionContext = {
        name: 'event.type',
        op: 'function.gcp.event',
        attributes: {
          [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'component',
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.function.serverless.gcp_event',
        },
      };

      expect(mockStartSpanManual).toBeCalledWith(fakeTransactionContext, expect.any(Function));
      expect(mockSpan.end).toBeCalled();
      expect(mockFlush).toBeCalledWith(2000);
    });

    test('capture error', async () => {
      const error = new Error('wat');
      const handler: EventFunction = (_data, _context) =>
        new Promise((_, reject) => {
          setTimeout(() => {
            reject(error);
          }, 10);
        });

      const wrappedHandler = wrapEventFunction(handler);
      await expect(handleEvent(wrappedHandler)).rejects.toThrowError(error);

      const fakeTransactionContext = {
        name: 'event.type',
        op: 'function.gcp.event',
        attributes: {
          [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'component',
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.function.serverless.gcp_event',
        },
      };

      expect(mockStartSpanManual).toBeCalledWith(fakeTransactionContext, expect.any(Function));
      expect(mockCaptureException).toBeCalledWith(error, expect.any(Function));
      expect(mockSpan.end).toBeCalled();
      expect(mockFlush).toBeCalled();
    });
  });

  describe('wrapEventFunction() with callback', () => {
    test('successful execution', async () => {
      const func: EventFunctionWithCallback = (_data, _context, cb) => {
        cb(null, 42);
      };
      const wrappedHandler = wrapEventFunction(func);
      await expect(handleEvent(wrappedHandler)).resolves.toBe(42);

      const fakeTransactionContext = {
        name: 'event.type',
        op: 'function.gcp.event',
        attributes: {
          [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'component',
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.function.serverless.gcp_event',
        },
      };

      expect(mockStartSpanManual).toBeCalledWith(fakeTransactionContext, expect.any(Function));
      expect(mockSpan.end).toBeCalled();
      expect(mockFlush).toBeCalledWith(2000);
    });

    test('capture error', async () => {
      const error = new Error('wat');
      const handler: EventFunctionWithCallback = (_data, _context, cb) => {
        cb(error);
      };
      const wrappedHandler = wrapEventFunction(handler);
      await expect(handleEvent(wrappedHandler)).rejects.toThrowError(error);

      const fakeTransactionContext = {
        name: 'event.type',
        op: 'function.gcp.event',
        attributes: {
          [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'component',
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.function.serverless.gcp_event',
        },
      };

      expect(mockStartSpanManual).toBeCalledWith(fakeTransactionContext, expect.any(Function));
      expect(mockCaptureException).toBeCalledWith(error, expect.any(Function));
      expect(mockSpan.end).toBeCalled();
      expect(mockFlush).toBeCalled();
    });

    test('capture exception', async () => {
      const error = new Error('wat');
      const handler: EventFunctionWithCallback = (_data, _context, _cb) => {
        throw error;
      };
      const wrappedHandler = wrapEventFunction(handler);
      await expect(handleEvent(wrappedHandler)).rejects.toThrowError(error);

      const fakeTransactionContext = {
        name: 'event.type',
        op: 'function.gcp.event',
        attributes: {
          [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'component',
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.function.serverless.gcp_event',
        },
      };

      expect(mockStartSpanManual).toBeCalledWith(fakeTransactionContext, expect.any(Function));
      expect(mockCaptureException).toBeCalledWith(error, expect.any(Function));
    });
  });

  test('marks the captured error as unhandled', async () => {
    const error = new Error('wat');
    const handler: EventFunctionWithCallback = (_data, _context, _cb) => {
      throw error;
    };
    const wrappedHandler = wrapEventFunction(handler);
    await expect(handleEvent(wrappedHandler)).rejects.toThrowError(error);

    expect(mockCaptureException).toBeCalledWith(error, expect.any(Function));

    const scopeFunction = mockCaptureException.mock.calls[0][1];
    const event: Event = { exception: { values: [{}] } };
    let evtProcessor: ((e: Event) => Event) | undefined = undefined;
    scopeFunction({ addEventProcessor: vi.fn().mockImplementation(proc => (evtProcessor = proc)) });

    expect(evtProcessor).toBeInstanceOf(Function);
    // @ts-expect-error just mocking around...
    expect(evtProcessor(event).exception.values[0]?.mechanism).toEqual({
      handled: false,
      type: 'auto.function.serverless.gcp_event',
    });
  });

  test('wrapEventFunction scope data', async () => {
    const handler: EventFunction = (_data, _context) => 42;
    const wrappedHandler = wrapEventFunction(handler);
    await handleEvent(wrappedHandler);
    expect(mockScope.setContext).toBeCalledWith('gcp.function.context', {
      eventType: 'event.type',
      resource: 'some.resource',
    });
  });
});
