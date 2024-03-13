import * as domain from 'domain';
import { SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN, SEMANTIC_ATTRIBUTE_SENTRY_SOURCE } from '@sentry/core';

import type { Event } from '@sentry/types';
import { wrapEventFunction } from '../../src/gcpfunction/events';
import type { EventFunction, EventFunctionWithCallback } from '../../src/gcpfunction/general';

const mockStartSpanManual = jest.fn((...spanArgs) => ({ ...spanArgs }));
const mockFlush = jest.fn((...args) => Promise.resolve(args));
const mockCaptureException = jest.fn();

const mockScope = {
  setContext: jest.fn(),
};

const mockSpan = {
  end: jest.fn(),
};

jest.mock('@sentry/node', () => {
  const original = jest.requireActual('@sentry/node');
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
    jest.clearAllMocks();
  });

  function handleEvent(fn: EventFunctionWithCallback): Promise<any> {
    return new Promise((resolve, reject) => {
      const d = domain.create();
      // d.on('error', () => res.end());
      const context = {
        eventType: 'event.type',
        resource: 'some.resource',
      };
      d.on('error', reject);
      d.run(() =>
        process.nextTick(fn, {}, context, (err: any, result: any) => {
          if (err != null || err != undefined) {
            reject(err);
          } else {
            resolve(result);
          }
        }),
      );
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
    scopeFunction({ addEventProcessor: jest.fn().mockImplementation(proc => (evtProcessor = proc)) });

    expect(evtProcessor).toBeInstanceOf(Function);
    // @ts-expect-error just mocking around...
    expect(evtProcessor(event).exception.values[0].mechanism).toEqual({
      handled: false,
      type: 'generic',
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
