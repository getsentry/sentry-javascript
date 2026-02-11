import { SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN, SEMANTIC_ATTRIBUTE_SENTRY_SOURCE } from '@sentry/core';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { wrapCloudEventFunction } from '../../src/gcpfunction/cloud_events';
import type { CloudEventFunction, CloudEventFunctionWithCallback } from '../../src/gcpfunction/general';

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

describe('wrapCloudEventFunction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function handleCloudEvent(fn: CloudEventFunctionWithCallback): Promise<any> {
    return new Promise((resolve, reject) => {
      const context = {
        id: 'test-event-id',
        specversion: '1.0',
        type: 'event.type',
      };

      try {
        fn(context, (err: any, result: any) => {
          if (err != null || err != undefined) {
            reject(err);
          } else {
            resolve(result);
          }
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  describe('wrapCloudEventFunction() without callback', () => {
    test('successful execution', async () => {
      const func: CloudEventFunction = _context => {
        return 42;
      };
      const wrappedHandler = wrapCloudEventFunction(func);
      await expect(handleCloudEvent(wrappedHandler)).resolves.toBe(42);

      const fakeTransactionContext = {
        name: 'event.type',
        op: 'function.gcp.cloud_event',
        attributes: {
          [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'component',
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.function.serverless.gcp_cloud_event',
        },
      };

      expect(mockStartSpanManual).toBeCalledWith(fakeTransactionContext, expect.any(Function));
      expect(mockSpan.end).toBeCalled();
      expect(mockFlush).toBeCalledWith(2000);
    });

    describe('wrapEventFunction() as Promise', () => {
      test('successful execution', async () => {
        const func: CloudEventFunction = _context =>
          new Promise(resolve => {
            setTimeout(() => {
              resolve(42);
            }, 10);
          });
        const wrappedHandler = wrapCloudEventFunction(func);
        await expect(handleCloudEvent(wrappedHandler)).resolves.toBe(42);

        const fakeTransactionContext = {
          name: 'event.type',
          op: 'function.gcp.cloud_event',
          attributes: {
            [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'component',
            [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.function.serverless.gcp_cloud_event',
          },
        };

        expect(mockStartSpanManual).toBeCalledWith(fakeTransactionContext, expect.any(Function));
        expect(mockSpan.end).toBeCalled();
        expect(mockFlush).toBeCalledWith(2000);
      });

      test('capture error', async () => {
        const error = new Error('wat');
        const handler: CloudEventFunction = _context =>
          new Promise((_, reject) => {
            setTimeout(() => {
              reject(error);
            }, 10);
          });

        const wrappedHandler = wrapCloudEventFunction(handler);
        await expect(handleCloudEvent(wrappedHandler)).rejects.toThrowError(error);

        const fakeTransactionContext = {
          name: 'event.type',
          op: 'function.gcp.cloud_event',
          attributes: {
            [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'component',
            [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.function.serverless.gcp_cloud_event',
          },
        };

        expect(mockStartSpanManual).toBeCalledWith(fakeTransactionContext, expect.any(Function));
        expect(mockCaptureException).toBeCalledWith(error, expect.any(Function));

        const scopeFunction = mockCaptureException.mock.calls[0][1];
        const event: Event = { exception: { values: [{}] } };
        let evtProcessor: ((e: Event) => Event) | undefined = undefined;
        scopeFunction({ addEventProcessor: vi.fn().mockImplementation(proc => (evtProcessor = proc)) });

        expect(evtProcessor).toBeInstanceOf(Function);
        // @ts-expect-error just mocking around...
        expect(evtProcessor(event).exception.values[0]?.mechanism).toEqual({
          handled: false,
          type: 'auto.function.serverless.gcp_cloud_event',
        });

        expect(mockSpan.end).toBeCalled();
        expect(mockFlush).toBeCalled();
      });
    });

    test('capture error', async () => {
      const error = new Error('wat');
      const handler: CloudEventFunction = _context => {
        throw error;
      };
      const wrappedHandler = wrapCloudEventFunction(handler);
      await expect(handleCloudEvent(wrappedHandler)).rejects.toThrowError(error);

      const fakeTransactionContext = {
        name: 'event.type',
        op: 'function.gcp.cloud_event',
        attributes: {
          [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'component',
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.function.serverless.gcp_cloud_event',
        },
      };

      expect(mockStartSpanManual).toBeCalledWith(fakeTransactionContext, expect.any(Function));
      expect(mockCaptureException).toBeCalledWith(error, expect.any(Function));

      const scopeFunction = mockCaptureException.mock.calls[0][1];
      const event: Event = { exception: { values: [{}] } };
      let evtProcessor: ((e: Event) => Event) | undefined = undefined;
      scopeFunction({ addEventProcessor: vi.fn().mockImplementation(proc => (evtProcessor = proc)) });

      expect(evtProcessor).toBeInstanceOf(Function);
      // @ts-expect-error just mocking around...
      expect(evtProcessor(event).exception.values[0]?.mechanism).toEqual({
        handled: false,
        type: 'auto.function.serverless.gcp_cloud_event',
      });

      expect(mockSpan.end).toBeCalled();
      expect(mockFlush).toBeCalled();
    });
  });

  describe('wrapCloudEventFunction() with callback', () => {
    test('successful execution', async () => {
      const func: CloudEventFunctionWithCallback = (_context, cb) => {
        cb(null, 42);
      };
      const wrappedHandler = wrapCloudEventFunction(func);
      await expect(handleCloudEvent(wrappedHandler)).resolves.toBe(42);

      const fakeTransactionContext = {
        name: 'event.type',
        op: 'function.gcp.cloud_event',
        attributes: {
          [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'component',
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.function.serverless.gcp_cloud_event',
        },
      };

      expect(mockStartSpanManual).toBeCalledWith(fakeTransactionContext, expect.any(Function));
      expect(mockSpan.end).toBeCalled();
      expect(mockFlush).toBeCalledWith(2000);
    });

    test('capture error', async () => {
      const error = new Error('wat');
      const handler: CloudEventFunctionWithCallback = (_context, cb) => {
        cb(error);
      };
      const wrappedHandler = wrapCloudEventFunction(handler);
      await expect(handleCloudEvent(wrappedHandler)).rejects.toThrowError(error);

      const fakeTransactionContext = {
        name: 'event.type',
        op: 'function.gcp.cloud_event',
        attributes: {
          [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'component',
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.function.serverless.gcp_cloud_event',
        },
      };

      expect(mockStartSpanManual).toBeCalledWith(fakeTransactionContext, expect.any(Function));
      expect(mockCaptureException).toBeCalledWith(error, expect.any(Function));

      const scopeFunction = mockCaptureException.mock.calls[0][1];
      const event: Event = { exception: { values: [{}] } };
      let evtProcessor: ((e: Event) => Event) | undefined = undefined;
      scopeFunction({ addEventProcessor: vi.fn().mockImplementation(proc => (evtProcessor = proc)) });

      expect(evtProcessor).toBeInstanceOf(Function);
      // @ts-expect-error just mocking around...
      expect(evtProcessor(event).exception.values[0]?.mechanism).toEqual({
        handled: false,
        type: 'auto.function.serverless.gcp_cloud_event',
      });

      expect(mockSpan.end).toBeCalled();
      expect(mockFlush).toBeCalled();
    });

    test('capture exception', async () => {
      const error = new Error('wat');
      const handler: CloudEventFunctionWithCallback = (_context, _cb) => {
        throw error;
      };
      const wrappedHandler = wrapCloudEventFunction(handler);
      await expect(handleCloudEvent(wrappedHandler)).rejects.toThrowError(error);

      const fakeTransactionContext = {
        name: 'event.type',
        op: 'function.gcp.cloud_event',
        attributes: {
          [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'component',
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.function.serverless.gcp_cloud_event',
        },
      };

      expect(mockStartSpanManual).toBeCalledWith(fakeTransactionContext, expect.any(Function));
      expect(mockCaptureException).toBeCalledWith(error, expect.any(Function));

      const scopeFunction = mockCaptureException.mock.calls[0][1];
      const event: Event = { exception: { values: [{}] } };
      let evtProcessor: ((e: Event) => Event) | undefined = undefined;
      scopeFunction({ addEventProcessor: vi.fn().mockImplementation(proc => (evtProcessor = proc)) });

      expect(evtProcessor).toBeInstanceOf(Function);
      // @ts-expect-error just mocking around...
      expect(evtProcessor(event).exception.values[0]?.mechanism).toEqual({
        handled: false,
        type: 'auto.function.serverless.gcp_cloud_event',
      });
    });
  });

  test('wrapCloudEventFunction scope data', async () => {
    const handler: CloudEventFunction = _context => 42;
    const wrappedHandler = wrapCloudEventFunction(handler);
    await handleCloudEvent(wrappedHandler);
    expect(mockScope.setContext).toBeCalledWith('gcp.function.context', {
      id: 'test-event-id',
      specversion: '1.0',
      type: 'event.type',
    });
  });
});
