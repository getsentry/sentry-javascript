// Note: These tests run the handler in Node.js, which is has some differences to the cloudflare workers runtime.
// Although this is not ideal, this is the best we can do until we have a better way to test cloudflare workers.

import { beforeEach, describe, expect, test, vi } from 'vitest';

import * as SentryCore from '@sentry/core';
import type { Event } from '@sentry/types';
import { CloudflareClient } from '../src/client';
import { withSentry } from '../src/handler';

const MOCK_ENV = {
  SENTRY_DSN: 'https://public@dsn.ingest.sentry.io/1337',
};

describe('withSentry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('gets env from handler', async () => {
    const handler = {
      fetch(_request, _env, _context) {
        return new Response('test');
      },
    } satisfies ExportedHandler;

    const optionsCallback = vi.fn().mockReturnValue({});

    const wrappedHandler = withSentry(optionsCallback, handler);
    await wrappedHandler.fetch(new Request('https://example.com'), MOCK_ENV, createMockExecutionContext());

    expect(optionsCallback).toHaveBeenCalledTimes(1);
    expect(optionsCallback).toHaveBeenLastCalledWith(MOCK_ENV);
  });

  test('passes through the response from the handler', async () => {
    const response = new Response('test');
    const handler = {
      async fetch(_request, _env, _context) {
        return response;
      },
    } satisfies ExportedHandler;

    const wrappedHandler = withSentry(() => ({}), handler);
    const result = await wrappedHandler.fetch(
      new Request('https://example.com'),
      MOCK_ENV,
      createMockExecutionContext(),
    );

    expect(result).toBe(response);
  });

  test('flushes the event after the handler is done using the cloudflare context.waitUntil', async () => {
    const handler = {
      async fetch(_request, _env, _context) {
        return new Response('test');
      },
    } satisfies ExportedHandler;

    const context = createMockExecutionContext();
    const wrappedHandler = withSentry(() => ({}), handler);
    await wrappedHandler.fetch(new Request('https://example.com'), MOCK_ENV, context);

    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(context.waitUntil).toHaveBeenCalledTimes(1);
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(context.waitUntil).toHaveBeenLastCalledWith(expect.any(Promise));
  });

  test('creates a cloudflare client and sets it on the handler', async () => {
    const handler = {
      async fetch(_request, _env, _context) {
        expect(SentryCore.getClient() instanceof CloudflareClient).toBe(true);
        return new Response('test');
      },
    } satisfies ExportedHandler;

    const context = createMockExecutionContext();
    const wrappedHandler = withSentry(() => ({}), handler);
    await wrappedHandler.fetch(new Request('https://example.com'), MOCK_ENV, context);

    expect.assertions(1);
  });

  describe('scope instrumentation', () => {
    test('adds cloud resource context', async () => {
      const handler = {
        async fetch(_request, _env, _context) {
          SentryCore.captureMessage('test');
          return new Response('test');
        },
      } satisfies ExportedHandler;

      let sentryEvent: Event = {};
      const wrappedHandler = withSentry(
        (env: any) => ({
          dsn: env.MOCK_DSN,
          beforeSend(event) {
            sentryEvent = event;
            return null;
          },
        }),
        handler,
      );
      await wrappedHandler.fetch(new Request('https://example.com'), MOCK_ENV, createMockExecutionContext());
      expect(sentryEvent.contexts?.cloud_resource).toEqual({ 'cloud.provider': 'cloudflare' });
    });

    test('adds request information', async () => {
      const handler = {
        async fetch(_request, _env, _context) {
          SentryCore.captureMessage('test');
          return new Response('test');
        },
      } satisfies ExportedHandler;

      let sentryEvent: Event = {};
      const wrappedHandler = withSentry(
        (env: any) => ({
          dsn: env.MOCK_DSN,
          beforeSend(event) {
            sentryEvent = event;
            return null;
          },
        }),
        handler,
      );
      await wrappedHandler.fetch(new Request('https://example.com'), MOCK_ENV, createMockExecutionContext());
      expect(sentryEvent.sdkProcessingMetadata?.request).toEqual({
        headers: {},
        url: 'https://example.com/',
        method: 'GET',
      });
    });

    test('adds culture context', async () => {
      const handler = {
        async fetch(_request, _env, _context) {
          SentryCore.captureMessage('test');
          return new Response('test');
        },
      } satisfies ExportedHandler;

      let sentryEvent: Event = {};
      const wrappedHandler = withSentry(
        (env: any) => ({
          dsn: env.MOCK_DSN,
          beforeSend(event) {
            sentryEvent = event;
            return null;
          },
        }),
        handler,
      );
      const mockRequest = new Request('https://example.com') as any;
      mockRequest.cf = {
        timezone: 'UTC',
      };
      await wrappedHandler.fetch(mockRequest, { ...MOCK_ENV }, createMockExecutionContext());
      expect(sentryEvent.contexts?.culture).toEqual({ timezone: 'UTC' });
    });
  });

  describe('error instrumentation', () => {
    test('captures errors thrown by the handler', async () => {
      const captureExceptionSpy = vi.spyOn(SentryCore, 'captureException');
      const error = new Error('test');
      const handler = {
        async fetch(_request, _env, _context) {
          throw error;
        },
      } satisfies ExportedHandler;

      const wrappedHandler = withSentry(() => ({}), handler);
      expect(captureExceptionSpy).not.toHaveBeenCalled();
      try {
        await wrappedHandler.fetch(new Request('https://example.com'), MOCK_ENV, createMockExecutionContext());
      } catch {
        // ignore
      }
      expect(captureExceptionSpy).toHaveBeenCalledTimes(1);
      expect(captureExceptionSpy).toHaveBeenLastCalledWith(error, { mechanism: { handled: false } });
    });

    test('re-throws the error after capturing', async () => {
      const error = new Error('test');
      const handler = {
        async fetch(_request, _env, _context) {
          throw error;
        },
      } satisfies ExportedHandler;

      const wrappedHandler = withSentry(() => ({}), handler);
      let thrownError: Error | undefined;
      try {
        await wrappedHandler.fetch(new Request('https://example.com'), MOCK_ENV, createMockExecutionContext());
      } catch (e: any) {
        thrownError = e;
      }

      expect(thrownError).toBe(error);
    });
  });

  describe('tracing instrumentation', () => {
    test('continues trace with sentry trace and baggage', async () => {
      const handler = {
        async fetch(_request, _env, _context) {
          SentryCore.captureMessage('test');
          return new Response('test');
        },
      } satisfies ExportedHandler;

      let sentryEvent: Event = {};
      const wrappedHandler = withSentry(
        (env: any) => ({
          dsn: env.MOCK_DSN,
          tracesSampleRate: 0,
          beforeSend(event) {
            sentryEvent = event;
            return null;
          },
        }),
        handler,
      );

      const request = new Request('https://example.com') as any;
      request.headers.set('sentry-trace', '12312012123120121231201212312012-1121201211212012-1');
      request.headers.set(
        'baggage',
        'sentry-release=2.1.12,sentry-public_key=public,sentry-trace_id=12312012123120121231201212312012,sentry-sample_rate=0.3232',
      );
      await wrappedHandler.fetch(request, MOCK_ENV, createMockExecutionContext());
      expect(sentryEvent.contexts?.trace).toEqual({
        parent_span_id: '1121201211212012',
        span_id: expect.any(String),
        trace_id: '12312012123120121231201212312012',
      });
    });

    test('creates a span that wraps fetch handler', async () => {
      const handler = {
        async fetch(_request, _env, _context) {
          return new Response('test');
        },
      } satisfies ExportedHandler;

      let sentryEvent: Event = {};
      const wrappedHandler = withSentry(
        (env: any) => ({
          dsn: env.MOCK_DSN,
          tracesSampleRate: 1,
          beforeSendTransaction(event) {
            sentryEvent = event;
            return null;
          },
        }),
        handler,
      );

      const request = new Request('https://example.com') as any;
      request.cf = {
        httpProtocol: 'HTTP/1.1',
      };
      request.headers.set('content-length', '10');

      await wrappedHandler.fetch(request, MOCK_ENV, createMockExecutionContext());
      expect(sentryEvent.transaction).toEqual('GET /');
      expect(sentryEvent.spans).toHaveLength(0);
      expect(sentryEvent.contexts?.trace).toEqual({
        data: {
          'sentry.origin': 'auto.http.cloudflare-worker',
          'sentry.op': 'http.server',
          'sentry.source': 'url',
          'http.request.method': 'GET',
          'url.full': 'https://example.com/',
          'server.address': 'example.com',
          'network.protocol.name': 'HTTP/1.1',
          'url.scheme': 'https',
          'sentry.sample_rate': 1,
          'http.response.status_code': 200,
          'http.request.body.size': 10,
        },
        op: 'http.server',
        origin: 'auto.http.cloudflare-worker',
        span_id: expect.any(String),
        status: 'ok',
        trace_id: expect.any(String),
      });
    });
  });
});

function createMockExecutionContext(): ExecutionContext {
  return {
    waitUntil: vi.fn(),
    passThroughOnException: vi.fn(),
  };
}
