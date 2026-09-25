import {
  SENTRY_SEGMENT_NAME_SOURCE,
  FAAS_TRIGGER,
  SENTRY_OP,
  FAAS_NAME,
  GCP_FUNCTION_CONTEXT_EVENT_TYPE,
  GCP_FUNCTION_CONTEXT_EVENT_ID,
  GCP_FUNCTION_CONTEXT_RESOURCE,
  GCP_FUNCTION_CONTEXT_TIMESTAMP,
} from '@sentry/conventions/attributes';
import { FUNCTION_GCP } from '@sentry/conventions/op';
import type { Client, Event } from '@sentry/core';
import * as SentryCore from '@sentry/core';
import { SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN, SERVERLESS_FUNCTION_SPAN_NAME_FALLBACK } from '@sentry/core';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
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
        eventId: '1144231683168617',
        timestamp: '2026-09-04T09:00:00.123Z',
        eventType: 'providers/cloud.firestore/eventTypes/document.write',
        resource: 'projects/my-project/databases/(default)/documents/users/abc123',
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

      const expectedStartSpanOptions = {
        name: 'providers/cloud.firestore/eventTypes/document.write',
        attributes: {
          [SENTRY_OP]: FUNCTION_GCP,
          [FAAS_NAME]: undefined,
          [FAAS_TRIGGER]: 'event',
          [SENTRY_SEGMENT_NAME_SOURCE]: 'component',
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.function.serverless.gcp_event',
          [GCP_FUNCTION_CONTEXT_EVENT_TYPE]: 'providers/cloud.firestore/eventTypes/document.write',
          [GCP_FUNCTION_CONTEXT_EVENT_ID]: '1144231683168617',
          [GCP_FUNCTION_CONTEXT_RESOURCE]: 'projects/my-project/databases/(default)/documents/users/abc123',
          [GCP_FUNCTION_CONTEXT_TIMESTAMP]: '2026-09-04T09:00:00.123Z',
        },
      };

      expect(mockStartSpanManual).toBeCalledWith(expectedStartSpanOptions, expect.any(Function));
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

      const expectedStartSpanOptions = {
        name: 'providers/cloud.firestore/eventTypes/document.write',
        attributes: {
          [SENTRY_OP]: FUNCTION_GCP,
          [FAAS_NAME]: undefined,
          [FAAS_TRIGGER]: 'event',
          [SENTRY_SEGMENT_NAME_SOURCE]: 'component',
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.function.serverless.gcp_event',
          [GCP_FUNCTION_CONTEXT_EVENT_TYPE]: 'providers/cloud.firestore/eventTypes/document.write',
          [GCP_FUNCTION_CONTEXT_EVENT_ID]: '1144231683168617',
          [GCP_FUNCTION_CONTEXT_RESOURCE]: 'projects/my-project/databases/(default)/documents/users/abc123',
          [GCP_FUNCTION_CONTEXT_TIMESTAMP]: '2026-09-04T09:00:00.123Z',
        },
      };

      expect(mockStartSpanManual).toBeCalledWith(expectedStartSpanOptions, expect.any(Function));
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

      const expectedStartSpanOptions = {
        name: 'providers/cloud.firestore/eventTypes/document.write',
        attributes: {
          [SENTRY_OP]: FUNCTION_GCP,
          [FAAS_NAME]: undefined,
          [FAAS_TRIGGER]: 'event',
          [SENTRY_SEGMENT_NAME_SOURCE]: 'component',
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.function.serverless.gcp_event',
          [GCP_FUNCTION_CONTEXT_EVENT_TYPE]: 'providers/cloud.firestore/eventTypes/document.write',
          [GCP_FUNCTION_CONTEXT_EVENT_ID]: '1144231683168617',
          [GCP_FUNCTION_CONTEXT_RESOURCE]: 'projects/my-project/databases/(default)/documents/users/abc123',
          [GCP_FUNCTION_CONTEXT_TIMESTAMP]: '2026-09-04T09:00:00.123Z',
        },
      };

      expect(mockStartSpanManual).toBeCalledWith(expectedStartSpanOptions, expect.any(Function));
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

      const expectedStartSpanOptions = {
        name: 'providers/cloud.firestore/eventTypes/document.write',
        attributes: {
          [SENTRY_OP]: FUNCTION_GCP,
          [FAAS_NAME]: undefined,
          [FAAS_TRIGGER]: 'event',
          [SENTRY_SEGMENT_NAME_SOURCE]: 'component',
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.function.serverless.gcp_event',
          [GCP_FUNCTION_CONTEXT_EVENT_TYPE]: 'providers/cloud.firestore/eventTypes/document.write',
          [GCP_FUNCTION_CONTEXT_EVENT_ID]: '1144231683168617',
          [GCP_FUNCTION_CONTEXT_RESOURCE]: 'projects/my-project/databases/(default)/documents/users/abc123',
          [GCP_FUNCTION_CONTEXT_TIMESTAMP]: '2026-09-04T09:00:00.123Z',
        },
      };

      expect(mockStartSpanManual).toBeCalledWith(expectedStartSpanOptions, expect.any(Function));
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

      const expectedStartSpanOptions = {
        name: 'providers/cloud.firestore/eventTypes/document.write',
        attributes: {
          [SENTRY_OP]: FUNCTION_GCP,
          [FAAS_NAME]: undefined,
          [FAAS_TRIGGER]: 'event',
          [SENTRY_SEGMENT_NAME_SOURCE]: 'component',
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.function.serverless.gcp_event',
          [GCP_FUNCTION_CONTEXT_EVENT_TYPE]: 'providers/cloud.firestore/eventTypes/document.write',
          [GCP_FUNCTION_CONTEXT_EVENT_ID]: '1144231683168617',
          [GCP_FUNCTION_CONTEXT_RESOURCE]: 'projects/my-project/databases/(default)/documents/users/abc123',
          [GCP_FUNCTION_CONTEXT_TIMESTAMP]: '2026-09-04T09:00:00.123Z',
        },
      };

      expect(mockStartSpanManual).toBeCalledWith(expectedStartSpanOptions, expect.any(Function));
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

      const expectedStartSpanOptions = {
        name: 'providers/cloud.firestore/eventTypes/document.write',
        attributes: {
          [SENTRY_OP]: FUNCTION_GCP,
          [FAAS_NAME]: undefined,
          [FAAS_TRIGGER]: 'event',
          [SENTRY_SEGMENT_NAME_SOURCE]: 'component',
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.function.serverless.gcp_event',
          [GCP_FUNCTION_CONTEXT_EVENT_TYPE]: 'providers/cloud.firestore/eventTypes/document.write',
          [GCP_FUNCTION_CONTEXT_EVENT_ID]: '1144231683168617',
          [GCP_FUNCTION_CONTEXT_RESOURCE]: 'projects/my-project/databases/(default)/documents/users/abc123',
          [GCP_FUNCTION_CONTEXT_TIMESTAMP]: '2026-09-04T09:00:00.123Z',
        },
      };

      expect(mockStartSpanManual).toBeCalledWith(expectedStartSpanOptions, expect.any(Function));
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

      const expectedStartSpanOptions = {
        name: 'providers/cloud.firestore/eventTypes/document.write',
        attributes: {
          [SENTRY_OP]: FUNCTION_GCP,
          [FAAS_NAME]: undefined,
          [FAAS_TRIGGER]: 'event',
          [SENTRY_SEGMENT_NAME_SOURCE]: 'component',
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.function.serverless.gcp_event',
          [GCP_FUNCTION_CONTEXT_EVENT_TYPE]: 'providers/cloud.firestore/eventTypes/document.write',
          [GCP_FUNCTION_CONTEXT_EVENT_ID]: '1144231683168617',
          [GCP_FUNCTION_CONTEXT_RESOURCE]: 'projects/my-project/databases/(default)/documents/users/abc123',
          [GCP_FUNCTION_CONTEXT_TIMESTAMP]: '2026-09-04T09:00:00.123Z',
        },
      };

      expect(mockStartSpanManual).toBeCalledWith(expectedStartSpanOptions, expect.any(Function));
      expect(mockCaptureException).toBeCalledWith(error, expect.any(Function));
    });
  });

  describe('wrapEventFunction() with span streaming enabled', () => {
    beforeEach(() => {
      vi.spyOn(SentryCore, 'getClient').mockReturnValue({
        getOptions: () => ({ traceLifecycle: 'stream' }),
      } as unknown as Client);
    });

    afterEach(() => {
      vi.restoreAllMocks();
      vi.unstubAllEnvs();
    });

    test('names the span after the function name from FUNCTION_TARGET', async () => {
      vi.stubEnv('FUNCTION_TARGET', 'myCloudFunction');

      const func: EventFunction = (_data, _context) => 42;
      const wrappedHandler = wrapEventFunction(func);
      await expect(handleEvent(wrappedHandler)).resolves.toBe(42);

      expect(mockStartSpanManual).toBeCalledWith(
        expect.objectContaining({
          name: 'myCloudFunction',
          attributes: expect.objectContaining({
            [FAAS_NAME]: 'myCloudFunction',
            // The event type stays on the span so the description can still be derived from it.
            [GCP_FUNCTION_CONTEXT_EVENT_TYPE]: 'providers/cloud.firestore/eventTypes/document.write',
          }),
        }),
        expect.any(Function),
      );
    });

    test('falls back to K_SERVICE when FUNCTION_TARGET is unset', async () => {
      vi.stubEnv('FUNCTION_TARGET', '');
      vi.stubEnv('K_SERVICE', 'my-cloud-run-service');

      const func: EventFunction = (_data, _context) => 42;
      const wrappedHandler = wrapEventFunction(func);
      await expect(handleEvent(wrappedHandler)).resolves.toBe(42);

      expect(mockStartSpanManual).toBeCalledWith(
        expect.objectContaining({
          name: 'my-cloud-run-service',
          attributes: expect.objectContaining({ [FAAS_NAME]: 'my-cloud-run-service' }),
        }),
        expect.any(Function),
      );
    });

    test('falls back to the static span name when no function name is resolvable', async () => {
      vi.stubEnv('FUNCTION_TARGET', '');
      vi.stubEnv('K_SERVICE', '');

      const func: EventFunction = (_data, _context) => 42;
      const wrappedHandler = wrapEventFunction(func);
      await expect(handleEvent(wrappedHandler)).resolves.toBe(42);

      expect(mockStartSpanManual).toBeCalledWith(
        expect.objectContaining({
          name: SERVERLESS_FUNCTION_SPAN_NAME_FALLBACK,
          attributes: expect.objectContaining({ [FAAS_NAME]: undefined }),
        }),
        expect.any(Function),
      );
    });

    test('names the span after the function name for callback-style handlers', async () => {
      vi.stubEnv('FUNCTION_TARGET', 'myCloudFunction');

      const func: EventFunctionWithCallback = (_data, _context, cb) => {
        cb(null, 42);
      };
      const wrappedHandler = wrapEventFunction(func);
      await expect(handleEvent(wrappedHandler)).resolves.toBe(42);

      expect(mockStartSpanManual).toBeCalledWith(
        expect.objectContaining({ name: 'myCloudFunction' }),
        expect.any(Function),
      );
    });

    test('keeps naming the span after the event type when span streaming is disabled', async () => {
      vi.stubEnv('FUNCTION_TARGET', 'myCloudFunction');
      vi.spyOn(SentryCore, 'getClient').mockReturnValue({
        getOptions: () => ({ traceLifecycle: 'static' }),
      } as unknown as Client);

      const func: EventFunction = (_data, _context) => 42;
      const wrappedHandler = wrapEventFunction(func);
      await expect(handleEvent(wrappedHandler)).resolves.toBe(42);

      expect(mockStartSpanManual).toBeCalledWith(
        expect.objectContaining({
          name: 'providers/cloud.firestore/eventTypes/document.write',
          attributes: expect.objectContaining({ [FAAS_NAME]: 'myCloudFunction' }),
        }),
        expect.any(Function),
      );
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
      eventId: '1144231683168617',
      timestamp: '2026-09-04T09:00:00.123Z',
      eventType: 'providers/cloud.firestore/eventTypes/document.write',
      resource: 'projects/my-project/databases/(default)/documents/users/abc123',
    });
  });
});
