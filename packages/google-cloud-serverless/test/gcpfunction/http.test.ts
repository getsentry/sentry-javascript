import {
  SENTRY_SEGMENT_NAME_SOURCE,
  FAAS_NAME,
  FAAS_TRIGGER,
  HTTP_REQUEST_METHOD,
  SENTRY_OP,
  URL_PATH,
} from '@sentry/conventions/attributes';
import { FUNCTION_GCP } from '@sentry/conventions/op';
import type { Client, Integration } from '@sentry/core';
import * as SentryCore from '@sentry/core';
import { SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN, SERVERLESS_FUNCTION_SPAN_NAME_FALLBACK } from '@sentry/core';
import { afterEach, beforeEach, describe, expect, type MockInstance, test, vi } from 'vitest';
import type { HttpFunction, Request, Response } from '../../src/gcpfunction/general';
import { wrapHttpFunction } from '../../src/gcpfunction/http';
import { init } from '../../src/sdk';

const mockStartSpanManual = vi.fn((...spanArgs) => ({ ...spanArgs }));
const mockFlush = vi.fn((...args) => Promise.resolve(args));
const mockCaptureException = vi.fn();
const mockInit = vi.fn();

const mockScope = {
  setSDKProcessingMetadata: vi.fn(),
};

const mockSpan = {
  end: vi.fn(),
};

vi.mock('@sentry/node', async () => {
  const original = await vi.importActual('@sentry/node');
  return {
    ...original,
    init: (options: unknown) => {
      mockInit(options);
    },
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

describe('GCPFunction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  async function handleHttp(fn: HttpFunction, trace_headers: { [key: string]: string } | null = null): Promise<void> {
    let headers: { [key: string]: string } = { host: 'hostname', 'content-type': 'application/json' };
    if (trace_headers) {
      headers = { ...headers, ...trace_headers };
    }
    return new Promise((resolve, _reject) => {
      const req = {
        method: 'POST',
        url: '/path?q=query',
        headers: headers,
        body: { foo: 'bar' },
      } as Request;
      const res = { end: resolve } as Response;

      try {
        fn(req, res);
      } catch {
        res.end();
      }
    });
  }

  describe('wrapHttpFunction() options', () => {
    test('flushTimeout', async () => {
      const handler: HttpFunction = (_, res) => {
        res.end();
      };
      const wrappedHandler = wrapHttpFunction(handler, { flushTimeout: 1337 });

      await handleHttp(wrappedHandler);
      expect(mockFlush).toBeCalledWith(1337);
    });
  });

  describe('wrapHttpFunction()', () => {
    test('successful execution', async () => {
      const handler: HttpFunction = (_req, res) => {
        res.statusCode = 200;
        res.end();
      };
      const wrappedHandler = wrapHttpFunction(handler);
      await handleHttp(wrappedHandler);

      const fakeTransactionContext = {
        name: 'POST /path',
        attributes: {
          [SENTRY_OP]: FUNCTION_GCP,
          [FAAS_NAME]: undefined,
          [FAAS_TRIGGER]: 'http',
          [SENTRY_SEGMENT_NAME_SOURCE]: 'route',
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.function.serverless.gcp_http',
          [HTTP_REQUEST_METHOD]: 'POST',
          [URL_PATH]: '/path',
        },
      };

      expect(mockStartSpanManual).toBeCalledWith(fakeTransactionContext, expect.any(Function));
      expect(mockSpan.end).toBeCalled();
      expect(mockFlush).toBeCalledWith(2000);
    });

    test('capture error', async () => {
      const error = new Error('wat');
      const handler: HttpFunction = (_req, _res) => {
        throw error;
      };
      const wrappedHandler = wrapHttpFunction(handler);

      await handleHttp(wrappedHandler);

      const fakeTransactionContext = {
        name: 'POST /path',
        attributes: {
          [SENTRY_OP]: FUNCTION_GCP,
          [FAAS_NAME]: undefined,
          [FAAS_TRIGGER]: 'http',
          [SENTRY_SEGMENT_NAME_SOURCE]: 'route',
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.function.serverless.gcp_http',
          [HTTP_REQUEST_METHOD]: 'POST',
          [URL_PATH]: '/path',
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
        type: 'auto.function.serverless.gcp_http',
      });

      expect(mockSpan.end).toBeCalled();
      expect(mockFlush).toBeCalled();
    });

    test('should not throw when flush rejects', async () => {
      const handler: HttpFunction = async (_req, res) => {
        res.statusCode = 200;
        res.end();
      };

      const wrappedHandler = wrapHttpFunction(handler);

      const request = {
        method: 'POST',
        url: '/path?q=query',
        headers: { host: 'hostname', 'content-type': 'application/json' },
        body: { foo: 'bar' },
      } as Request;

      const mockEnd = vi.fn();
      const response = { end: mockEnd } as unknown as Response;

      mockFlush.mockImplementationOnce(async () => {
        throw new Error();
      });

      await expect(wrappedHandler(request, response)).resolves.toBeUndefined();
      expect(mockEnd).toHaveBeenCalledTimes(1);
    });
  });

  describe('wrapHttpFunction() with span streaming enabled', () => {
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

      const handler: HttpFunction = (_req, res) => {
        res.statusCode = 200;
        res.end();
      };
      await handleHttp(wrapHttpFunction(handler));

      expect(mockStartSpanManual).toBeCalledWith(
        expect.objectContaining({
          name: 'myCloudFunction',
          attributes: expect.objectContaining({
            [FAAS_NAME]: 'myCloudFunction',
            // The method and path stay on the span even though they are no longer the name.
            [HTTP_REQUEST_METHOD]: 'POST',
            [URL_PATH]: '/path',
            [SENTRY_SEGMENT_NAME_SOURCE]: 'component',
          }),
        }),
        expect.any(Function),
      );
    });

    test('falls back to K_SERVICE when FUNCTION_TARGET is unset', async () => {
      vi.stubEnv('FUNCTION_TARGET', '');
      vi.stubEnv('K_SERVICE', 'my-cloud-run-service');

      const handler: HttpFunction = (_req, res) => {
        res.end();
      };
      await handleHttp(wrapHttpFunction(handler));

      expect(mockStartSpanManual).toBeCalledWith(
        expect.objectContaining({
          name: 'my-cloud-run-service',
          attributes: expect.objectContaining({
            [FAAS_NAME]: 'my-cloud-run-service',
            [SENTRY_SEGMENT_NAME_SOURCE]: 'component',
          }),
        }),
        expect.any(Function),
      );
    });

    test('falls back to the static span name when no function name is resolvable', async () => {
      vi.stubEnv('FUNCTION_TARGET', '');
      vi.stubEnv('K_SERVICE', '');

      const handler: HttpFunction = (_req, res) => {
        res.end();
      };
      await handleHttp(wrapHttpFunction(handler));

      expect(mockStartSpanManual).toBeCalledWith(
        expect.objectContaining({
          name: SERVERLESS_FUNCTION_SPAN_NAME_FALLBACK,
          attributes: expect.objectContaining({ [FAAS_NAME]: undefined, [SENTRY_SEGMENT_NAME_SOURCE]: 'component' }),
        }),
        expect.any(Function),
      );
    });

    test('keeps the raw path out of the span name', async () => {
      vi.stubEnv('FUNCTION_TARGET', 'myCloudFunction');

      const handler: HttpFunction = (_req, res) => {
        res.end();
      };
      await handleHttp(wrapHttpFunction(handler));

      const spanName = mockStartSpanManual.mock.calls[0]?.[0]?.name;
      expect(spanName).not.toContain('/path');
    });

    test('keeps naming the span after method and path when span streaming is disabled', async () => {
      vi.stubEnv('FUNCTION_TARGET', 'myCloudFunction');
      vi.spyOn(SentryCore, 'getClient').mockReturnValue({
        getOptions: () => ({ traceLifecycle: 'static' }),
      } as unknown as Client);

      const handler: HttpFunction = (_req, res) => {
        res.end();
      };
      await handleHttp(wrapHttpFunction(handler));

      expect(mockStartSpanManual).toBeCalledWith(
        expect.objectContaining({
          name: 'POST /path',
          attributes: expect.objectContaining({
            [FAAS_NAME]: 'myCloudFunction',
            [SENTRY_SEGMENT_NAME_SOURCE]: 'route',
          }),
        }),
        expect.any(Function),
      );
    });
  });

  // This tests that the necessary pieces are in place for request data to get added to event - the `RequestData`
  // integration is included in the defaults and the necessary data is stored in `sdkProcessingMetadata`. The
  // integration's tests cover testing that it uses that data correctly.
  test('wrapHttpFunction request data prereqs', async () => {
    init({});

    const handler: HttpFunction = (_req, res) => {
      res.end();
    };
    const wrappedHandler = wrapHttpFunction(handler);

    await handleHttp(wrappedHandler);

    const initOptions = (mockInit as unknown as MockInstance).mock.calls[0];
    const defaultIntegrations = initOptions?.[0]?.defaultIntegrations.map((i: Integration) => i.name);

    expect(defaultIntegrations).toContain('RequestData');

    expect(mockScope.setSDKProcessingMetadata).toHaveBeenCalledWith({
      normalizedRequest: {
        method: 'POST',
        url: 'http://hostname/path?q=query',
        headers: { host: 'hostname', 'content-type': 'application/json' },
        query_string: 'q=query',
        data: { foo: 'bar' },
      },
    });
  });
});
