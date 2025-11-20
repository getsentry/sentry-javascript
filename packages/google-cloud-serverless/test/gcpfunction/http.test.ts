import type { Integration } from '@sentry/core';
import { SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN, SEMANTIC_ATTRIBUTE_SENTRY_SOURCE } from '@sentry/core';
import { beforeEach, describe, expect, type MockInstance, test, vi } from 'vitest';
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
      } catch (error) {
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
        op: 'function.gcp.http',
        attributes: {
          [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'route',
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.function.serverless.gcp_http',
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
        op: 'function.gcp.http',
        attributes: {
          [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'route',
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.function.serverless.gcp_http',
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
