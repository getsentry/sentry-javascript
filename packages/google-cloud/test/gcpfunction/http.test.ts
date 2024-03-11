import * as domain from 'domain';

import type { Integration } from '@sentry/types';

import { SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN, SEMANTIC_ATTRIBUTE_SENTRY_SOURCE } from '@sentry/core';

import { wrapHttpFunction } from '../../src/gcpfunction/http';

import type { HttpFunction, Request, Response } from '../../src/gcpfunction/general';

import { init } from '../../src/sdk';

const mockStartSpanManual = jest.fn((...spanArgs) => ({ ...spanArgs }));
const mockFlush = jest.fn((...args) => Promise.resolve(args));
const mockCaptureException = jest.fn();
const mockInit = jest.fn();

const mockScope = {
  setSDKProcessingMetadata: jest.fn(),
};

const mockSpan = {
  end: jest.fn(),
};

jest.mock('@sentry/node', () => {
  const original = jest.requireActual('@sentry/node');
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
    jest.clearAllMocks();
  });

  async function handleHttp(fn: HttpFunction, trace_headers: { [key: string]: string } | null = null): Promise<void> {
    let headers: { [key: string]: string } = { host: 'hostname', 'content-type': 'application/json' };
    if (trace_headers) {
      headers = { ...headers, ...trace_headers };
    }
    return new Promise((resolve, _reject) => {
      const d = domain.create();
      const req = {
        method: 'POST',
        url: '/path?q=query',
        headers: headers,
        body: { foo: 'bar' },
      } as Request;
      const res = { end: resolve } as Response;
      d.on('error', () => res.end());
      d.run(() => process.nextTick(fn, req, res));
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

      const mockEnd = jest.fn();
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

    const initOptions = (mockInit as unknown as jest.SpyInstance).mock.calls[0];
    const defaultIntegrations = initOptions[0].defaultIntegrations.map((i: Integration) => i.name);

    expect(defaultIntegrations).toContain('RequestData');

    expect(mockScope.setSDKProcessingMetadata).toHaveBeenCalledWith({
      request: {
        method: 'POST',
        url: '/path?q=query',
        headers: { host: 'hostname', 'content-type': 'application/json' },
        body: { foo: 'bar' },
      },
    });
  });
});
