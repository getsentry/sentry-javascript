// Note: These tests run the handler in Node.js, which has some differences to the cloudflare workers runtime.
// Although this is not ideal, this is the best we can do until we have a better way to test cloudflare workers.

import type { ExecutionContext } from '@cloudflare/workers-types';
import type { Event } from '@sentry/core';
import * as SentryCore from '@sentry/core';
import { beforeAll, beforeEach, describe, expect, onTestFinished, test, vi } from 'vitest';
import { setAsyncLocalStorageAsyncContextStrategy } from '@sentry/server-utils/no-diagnostic-channels';
import type { CloudflareOptions } from '../src/client';
import { CloudflareClient } from '../src/client';
import { httpServerIntegration } from '../src/integrations/httpServer';
import { wrapRequestHandler } from '../src/request';
import { _clearGlobalClientCache, init } from '../src/sdk';

const MOCK_OPTIONS: CloudflareOptions = {
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  traceLifecycle: 'static',
  cacheClient: false,
};

const NODE_MAJOR_VERSION = parseInt(process.versions.node.split('.')[0]!);

function addDelayedWaitUntil(context: ExecutionContext) {
  context.waitUntil(new Promise<void>(resolve => setTimeout(() => resolve())));
}

describe('withSentry', () => {
  beforeAll(() => {
    setAsyncLocalStorageAsyncContextStrategy();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('with span streaming enabled', () => {
    async function segmentSpanNameFor(url: string): Promise<string | undefined> {
      let spanName: string | undefined;

      await wrapRequestHandler(
        {
          options: { ...MOCK_OPTIONS, traceLifecycle: 'stream', tracesSampleRate: 1 },
          request: new Request(url),
          context: createMockExecutionContext(),
        },
        () => {
          // Read the name while the request is in flight: the gate applies at span start.
          const activeSpan = SentryCore.getActiveSpan();
          spanName = activeSpan ? SentryCore.spanToJSON(SentryCore.getRootSpan(activeSpan)).name : undefined;
          return new Response('test');
        },
      );

      return spanName;
    }

    test('names a span without a resolvable route after the request method', async () => {
      expect(await segmentSpanNameFor('https://example.com/users/42')).toBe('GET');
    });

    test('keeps the root path, which is already low cardinality', async () => {
      expect(await segmentSpanNameFor('https://example.com/')).toBe('GET /');
    });
  });

  test('passes through the response from the handler', async () => {
    const response = new Response('test');
    const result = await wrapRequestHandler(
      { options: MOCK_OPTIONS, request: new Request('https://example.com'), context: createMockExecutionContext() },
      () => response,
    );
    // Response may be wrapped for streaming detection, verify content matches
    expect(result.status).toBe(response.status);
    expect(await result.text()).toBe('test');
  });

  test('flushes the event after the handler is done using the cloudflare context.waitUntil', async () => {
    const context = createMockExecutionContext();
    const waitUntilSpy = vi.spyOn(context, 'waitUntil');
    await wrapRequestHandler(
      { options: MOCK_OPTIONS, request: new Request('https://example.com'), context },
      () => new Response('test'),
    ).then(response => response.text());

    expect(waitUntilSpy).toHaveBeenCalledTimes(1);
    expect(waitUntilSpy).toHaveBeenLastCalledWith(expect.any(Promise));
  });

  test('handles streaming responses correctly', async () => {
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('chunk1'));
        controller.enqueue(new TextEncoder().encode('chunk2'));
        controller.close();
      },
    });
    const streamingResponse = new Response(stream);

    const result = await wrapRequestHandler(
      { options: MOCK_OPTIONS, request: new Request('https://example.com'), context: createMockExecutionContext() },
      () => streamingResponse,
    );

    const text = await result.text();
    expect(text).toBe('chunk1chunk2');
  });

  test("doesn't error if context is undefined", () => {
    expect(() =>
      wrapRequestHandler(
        { options: MOCK_OPTIONS, request: new Request('https://example.com'), context: undefined as any },
        () => new Response('test'),
      ),
    ).not.toThrow();
  });

  test('creates a cloudflare client and sets it on the handler', async () => {
    const initAndBindSpy = vi.spyOn(SentryCore, 'initAndBind');
    await wrapRequestHandler(
      { options: MOCK_OPTIONS, request: new Request('https://example.com'), context: createMockExecutionContext() },
      () => new Response('test'),
    );

    expect(initAndBindSpy).toHaveBeenCalledTimes(1);
    expect(initAndBindSpy).toHaveBeenLastCalledWith(CloudflareClient, expect.any(Object));
  });

  test('flush must be called when all waitUntil are done', async () => {
    // Spy on Client.prototype.flush and mock it to resolve immediately to avoid timeout issues with fake timers
    const flushSpy = vi.spyOn(SentryCore.Client.prototype, 'flush').mockResolvedValue(true);
    vi.useFakeTimers();
    onTestFinished(() => {
      vi.useRealTimers();
    });

    // Measure delta instead of absolute call count to avoid interference from parallel tests.
    // Since we spy on the prototype, other tests running in parallel may also call flush.
    // By measuring before/after, we only verify that THIS test triggered exactly one flush call.
    const before = flushSpy.mock.calls.length;

    const waits: Promise<unknown>[] = [];
    const waitUntil = vi.fn(promise => waits.push(promise));

    const context = {
      waitUntil,
    } as unknown as ExecutionContext;

    await wrapRequestHandler({ options: MOCK_OPTIONS, request: new Request('https://example.com'), context }, () => {
      addDelayedWaitUntil(context);
      return new Response('test');
    }).then(response => response.text());
    expect(waitUntil).toBeCalled();
    vi.advanceTimersToNextTimer().runAllTimers();
    await Promise.all(waits);

    const after = flushSpy.mock.calls.length;
    const delta = after - before;

    // Verify that exactly one flush call was made during this test
    expect(delta).toBe(1);
  });

  describe('scope instrumentation', () => {
    test('adds cloud resource context', async () => {
      let sentryEvent: Event = {};
      await wrapRequestHandler(
        {
          options: {
            ...MOCK_OPTIONS,
            beforeSend(event) {
              sentryEvent = event;
              return null;
            },
          },
          request: new Request('https://example.com'),
          context: createMockExecutionContext(),
        },
        () => {
          SentryCore.captureMessage('cloud resource');
          return new Response('test');
        },
      );

      expect(sentryEvent.contexts?.cloud_resource).toEqual({ 'cloud.provider': 'cloudflare' });
    });

    test('adds request information', async () => {
      let sentryEvent: Event = {};
      await wrapRequestHandler(
        {
          options: {
            ...MOCK_OPTIONS,
            beforeSend(event) {
              sentryEvent = event;
              return null;
            },
          },
          request: new Request('https://example.com'),
          context: createMockExecutionContext(),
        },
        () => {
          SentryCore.captureMessage('request');
          return new Response('test');
        },
      );

      expect(sentryEvent.sdkProcessingMetadata?.normalizedRequest).toEqual({
        headers: {},
        url: 'https://example.com/',
        method: 'GET',
      });
    });

    test('adds culture context', async () => {
      const mockRequest = new Request('https://example.com') as any;
      mockRequest.cf = {
        timezone: 'UTC',
      };

      let sentryEvent: Event = {};
      await wrapRequestHandler(
        {
          options: {
            ...MOCK_OPTIONS,
            beforeSend(event) {
              sentryEvent = event;
              return null;
            },
          },
          request: mockRequest,
          context: createMockExecutionContext(),
        },
        () => {
          SentryCore.captureMessage('culture');
          return new Response('test');
        },
      );

      expect(sentryEvent.contexts?.culture).toEqual({ timezone: 'UTC' });
    });

    test('captures request body by default (all body types included by default)', async () => {
      let sentryEvent: Event = {};
      const context = createMockExecutionContext();

      await wrapRequestHandler(
        {
          options: {
            ...MOCK_OPTIONS,
            beforeSend(event) {
              sentryEvent = event;
              return null;
            },
          },
          request: new Request('https://example.com', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ username: 'test', data: 'value' }),
          }),
          context,
        },
        () => {
          SentryCore.captureMessage('request body');
          return new Response('test');
        },
      );

      expect(sentryEvent.sdkProcessingMetadata?.normalizedRequest?.data).toEqual(
        JSON.stringify({ username: 'test', data: 'value' }),
      );
    });

    test('does not capture request body when dataCollection.httpBodies excludes incomingRequest', async () => {
      let sentryEvent: Event = {};
      const context = createMockExecutionContext();

      await wrapRequestHandler(
        {
          options: {
            ...MOCK_OPTIONS,
            dataCollection: { httpBodies: [] },
            beforeSend(event) {
              sentryEvent = event;
              return null;
            },
          },
          request: new Request('https://example.com', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ username: 'test', data: 'value' }),
          }),
          context,
        },
        () => {
          SentryCore.captureMessage('request body');
          return new Response('test');
        },
      );

      expect(sentryEvent.sdkProcessingMetadata?.normalizedRequest?.data).toBeUndefined();
    });

    test('captures cookies with denylist filtering by default', async () => {
      let sentryEvent: Event = {};

      await wrapRequestHandler(
        {
          options: {
            ...MOCK_OPTIONS,
            dataCollection: { httpBodies: [] },
            beforeSend(event) {
              sentryEvent = event;
              return null;
            },
          },
          request: new Request('https://example.com', { headers: { cookie: 'foo=bar; session=secret' } }),
          context: createMockExecutionContext(),
        },
        () => {
          SentryCore.captureMessage('request body');
          return new Response('test');
        },
      );

      expect(sentryEvent.request?.cookies).toEqual({ foo: 'bar', session: '[Filtered]' });
    });

    test('explicit maxRequestBodySize overrides dataCollection.httpBodies', async () => {
      let sentryEvent: Event = {};
      const context = createMockExecutionContext();

      await wrapRequestHandler(
        {
          options: {
            ...MOCK_OPTIONS,
            dataCollection: { httpBodies: [] },
            integrations: [httpServerIntegration({ maxRequestBodySize: 'medium' })],
            beforeSend(event) {
              sentryEvent = event;
              return null;
            },
          },
          request: new Request('https://example.com', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ key: 'value' }),
          }),
          context,
        },
        () => {
          SentryCore.captureMessage('request body');
          return new Response('test');
        },
      );

      expect(sentryEvent.sdkProcessingMetadata?.normalizedRequest?.data).toEqual(JSON.stringify({ key: 'value' }));
    });

    test.each([
      ['matches', () => true],
      [
        'throws',
        () => {
          throw new Error('filter failed');
        },
      ],
    ])('does not capture the body when ignoreRequestBody %s', async (_label, ignoreRequestBody) => {
      let sentryEvent: Event = {};

      const response = await wrapRequestHandler(
        {
          options: {
            ...MOCK_OPTIONS,
            integrations: [httpServerIntegration({ ignoreRequestBody })],
            beforeSend(event) {
              sentryEvent = event;
              return null;
            },
          },
          request: new Request('https://example.com/login', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ password: 'secret' }),
          }),
          context: createMockExecutionContext(),
        },
        () => {
          SentryCore.captureMessage('request body');
          return new Response('test');
        },
      );

      expect(await response.text()).toBe('test');
      expect(sentryEvent.message).toBe('request body');
      expect(sentryEvent.sdkProcessingMetadata?.normalizedRequest?.data).toBeUndefined();
    });

    test('does not capture cookies when dataCollection.cookies is disabled', async () => {
      let sentryEvent: Event = {};

      await wrapRequestHandler(
        {
          options: {
            ...MOCK_OPTIONS,
            dataCollection: { cookies: false },
            beforeSend(event) {
              sentryEvent = event;
              return null;
            },
          },
          request: new Request('https://example.com', { headers: { cookie: 'foo=bar' } }),
          context: createMockExecutionContext(),
        },
        () => {
          SentryCore.captureMessage('cookies');
          return new Response('test');
        },
      );

      expect(sentryEvent.request?.cookies).toBeUndefined();
    });

    test('does not capture request body for GET requests', async () => {
      let sentryEvent: Event = {};
      const context = createMockExecutionContext();

      await wrapRequestHandler(
        {
          options: {
            ...MOCK_OPTIONS,
            beforeSend(event) {
              sentryEvent = event;
              return null;
            },
          },
          request: new Request('https://example.com'),
          context,
        },
        () => {
          SentryCore.captureMessage('get request');
          return new Response('test');
        },
      );

      expect(sentryEvent.sdkProcessingMetadata?.normalizedRequest?.data).toBeUndefined();
    });

    test('does not capture request body for HEAD requests', async () => {
      let sentryEvent: Event = {};
      const context = createMockExecutionContext();

      await wrapRequestHandler(
        {
          options: {
            ...MOCK_OPTIONS,
            beforeSend(event) {
              sentryEvent = event;
              return null;
            },
          },
          request: new Request('https://example.com', { method: 'HEAD' }),
          context,
        },
        () => {
          SentryCore.captureMessage('head request');
          return new Response('test');
        },
      );

      expect(sentryEvent.sdkProcessingMetadata?.normalizedRequest?.data).toBeUndefined();
    });

    test('does not capture request body for OPTIONS requests', async () => {
      let sentryEvent: Event = {};
      const context = createMockExecutionContext();

      await wrapRequestHandler(
        {
          options: {
            ...MOCK_OPTIONS,
            beforeSend(event) {
              sentryEvent = event;
              return null;
            },
          },
          request: new Request('https://example.com', { method: 'OPTIONS' }),
          context,
        },
        () => {
          SentryCore.captureMessage('options request');
          return new Response('test');
        },
      );

      expect(sentryEvent.sdkProcessingMetadata?.normalizedRequest?.data).toBeUndefined();
    });

    test('does not capture request body for binary content types', async () => {
      let sentryEvent: Event = {};
      const context = createMockExecutionContext();

      await wrapRequestHandler(
        {
          options: {
            ...MOCK_OPTIONS,
            beforeSend(event) {
              sentryEvent = event;
              return null;
            },
          },
          request: new Request('https://example.com', {
            method: 'POST',
            headers: { 'content-type': 'image/png' },
            body: new Uint8Array([0x89, 0x50, 0x4e, 0x47]),
          }),
          context,
        },
        () => {
          SentryCore.captureMessage('binary');
          return new Response('test');
        },
      );

      expect(sentryEvent.sdkProcessingMetadata?.normalizedRequest?.data).toBeUndefined();
    });
  });

  describe('error instrumentation', () => {
    test('captures errors thrown by the handler', async () => {
      const captureExceptionSpy = vi.spyOn(SentryCore, 'captureException');
      const error = new Error('test');

      expect(captureExceptionSpy).not.toHaveBeenCalled();

      try {
        await wrapRequestHandler(
          { options: MOCK_OPTIONS, request: new Request('https://example.com'), context: createMockExecutionContext() },
          () => {
            throw error;
          },
        );
      } catch {
        // ignore
      }

      expect(captureExceptionSpy).toHaveBeenCalledTimes(1);
      expect(captureExceptionSpy).toHaveBeenLastCalledWith(error, {
        mechanism: { handled: false, type: 'auto.http.cloudflare' },
      });
    });

    test('re-throws the error after capturing', async () => {
      const error = new Error('test');
      let thrownError: Error | undefined;
      try {
        await wrapRequestHandler(
          { options: MOCK_OPTIONS, request: new Request('https://example.com'), context: createMockExecutionContext() },
          () => {
            throw error;
          },
        );
      } catch (e: any) {
        thrownError = e;
      }

      expect(thrownError).toBe(error);
    });

    test("doesn't capture errors if `captureErrors` is false", async () => {
      const captureExceptionSpy = vi.spyOn(SentryCore, 'captureException');
      const error = new Error('test');

      expect(captureExceptionSpy).not.toHaveBeenCalled();
      let thrownError: Error | undefined;

      try {
        await wrapRequestHandler(
          {
            options: MOCK_OPTIONS,
            request: new Request('https://example.com'),
            context: createMockExecutionContext(),
            captureErrors: false,
          },
          () => {
            throw error;
          },
        );
      } catch (e: any) {
        thrownError = e;
      }

      expect(captureExceptionSpy).not.toHaveBeenCalled();
      expect(thrownError).toBe(error);
    });
  });

  describe('tracing instrumentation', () => {
    test('continues trace with sentry trace and baggage', async () => {
      const mockRequest = new Request('https://example.com') as any;
      mockRequest.headers.set('sentry-trace', '12312012123120121231201212312012-1121201211212012-1');
      mockRequest.headers.set(
        'baggage',
        'sentry-release=2.1.12,sentry-public_key=public,sentry-trace_id=12312012123120121231201212312012,sentry-sample_rate=0.3232',
      );

      let sentryEvent: Event = {};
      await wrapRequestHandler(
        {
          options: {
            ...MOCK_OPTIONS,
            tracesSampleRate: 0,
            beforeSend(event) {
              sentryEvent = event;
              return null;
            },
          },
          request: mockRequest,
          context: createMockExecutionContext(),
        },
        () => {
          SentryCore.captureMessage('sentry-trace');
          return new Response('test');
        },
      );
      expect(sentryEvent.contexts?.trace).toEqual({
        parent_span_id: '1121201211212012',
        span_id: expect.stringMatching(/[a-f0-9]{16}/),
        trace_id: '12312012123120121231201212312012',
      });
    });

    test('creates a span that wraps request handler', async () => {
      const mockRequest = new Request('https://example.com') as any;
      mockRequest.cf = {
        httpProtocol: 'HTTP/1.1',
      };
      mockRequest.headers.set('content-length', '10');

      let sentryEvent: Event = {};
      await wrapRequestHandler(
        {
          options: {
            ...MOCK_OPTIONS,
            tracesSampleRate: 1,
            beforeSendTransaction(event) {
              sentryEvent = event;
              return null;
            },
          },
          request: mockRequest,
          context: createMockExecutionContext(),
        },
        () => {
          SentryCore.captureMessage('sentry-trace');
          return new Response('test');
        },
      ).then(response => response.text());

      // Wait for async span end and transaction capture
      await new Promise(resolve => setTimeout(resolve, 50));

      expect(sentryEvent.transaction).toEqual('GET /');
      expect(sentryEvent.spans).toHaveLength(0);
      expect(sentryEvent.contexts?.trace).toEqual({
        data: {
          'sentry.origin': 'auto.http.cloudflare',
          'sentry.op': 'http.server',
          'sentry.segment.name.source': 'route',
          'http.request.method': 'GET',
          'url.full': 'https://example.com/',
          'server.address': 'example.com',
          'network.protocol.name': 'http',
          'network.protocol.version': '1.1',
          'url.scheme': 'https:',
          'url.path': '/',
          'sentry.sample_rate': 1,
          'http.response.status_code': 200,
          'http.request.body.size': 10,
          'http.request.header.content-length': ['10'],
          'http.response.header.content-type': ['text/plain;charset=UTF-8'],
        },
        op: 'http.server',
        origin: 'auto.http.cloudflare',
        span_id: expect.stringMatching(/[a-f0-9]{16}/),
        status: 'ok',
        trace_id: expect.stringMatching(/[a-f0-9]{32}/),
        parent_span_id: undefined,
        links: undefined,
      });
    });
  });

  describe('httpServerIntegration span options', () => {
    // Whether a span is active in the handler.
    async function hasActiveSpan(
      options: Partial<CloudflareOptions>,
      url = 'https://example.com/users?id=1',
      init?: RequestInit,
    ): Promise<boolean> {
      let active = false;
      const response = await wrapRequestHandler(
        {
          options: { ...MOCK_OPTIONS, tracesSampleRate: 1, ...options },
          request: new Request(url, init),
          context: createMockExecutionContext(),
        },
        () => {
          active = !!SentryCore.getActiveSpan();
          return new Response('ok');
        },
      );
      expect(await response.text()).toBe('ok');
      return active;
    }

    test('creates a span by default', async () => {
      expect(await hasActiveSpan({})).toBe(true);
    });

    test('does not create spans for requests that ignoreIncomingRequests matches', async () => {
      const calls: [string, string][] = [];
      const integrations = [
        httpServerIntegration({
          ignoreIncomingRequests: (urlPath, request) => {
            calls.push([urlPath, request.method]);
            return urlPath.startsWith('/health');
          },
        }),
      ];

      expect(await hasActiveSpan({ integrations }, 'https://example.com/health?probe=1')).toBe(false);
      expect(await hasActiveSpan({ integrations }, 'https://example.com/users')).toBe(true);
      expect(calls).toEqual([
        ['/health?probe=1', 'GET'],
        ['/users', 'GET'],
      ]);
    });

    test('creates the span when ignoreIncomingRequests throws', async () => {
      const integrations = [
        httpServerIntegration({
          ignoreIncomingRequests: () => {
            throw new Error('filter failed');
          },
        }),
      ];

      expect(await hasActiveSpan({ integrations })).toBe(true);
    });

    test('does not create spans for GET requests to static assets by default', async () => {
      expect(await hasActiveSpan({}, 'https://example.com/favicon.ico')).toBe(false);
      expect(await hasActiveSpan({}, 'https://example.com/assets/app.js')).toBe(false);
      expect(await hasActiveSpan({}, 'https://example.com/favicon.ico', { method: 'POST', body: 'x' })).toBe(true);
    });

    test('creates spans for static assets when ignoreStaticAssets is false', async () => {
      const integrations = [httpServerIntegration({ ignoreStaticAssets: false })];

      expect(await hasActiveSpan({ integrations }, 'https://example.com/favicon.ico')).toBe(true);
    });

    test('does not create spans when tracing is disabled', async () => {
      expect(await hasActiveSpan({ tracesSampleRate: undefined })).toBe(false);
    });

    test('does not create spans when spans is false, but still captures errors and continues the trace', async () => {
      const events: Event[] = [];
      const request = new Request('https://example.com/users');
      request.headers.set('sentry-trace', '12312012123120121231201212312012-1121201211212012-1');
      const error = new Error('handler failed');

      await expect(
        wrapRequestHandler(
          {
            options: {
              ...MOCK_OPTIONS,
              tracesSampleRate: 1,
              integrations: [httpServerIntegration({ spans: false })],
              beforeSend(event) {
                events.push(event);
                return null;
              },
            },
            request,
            context: createMockExecutionContext(),
          },
          () => {
            expect(SentryCore.getActiveSpan()).toBeUndefined();
            throw error;
          },
        ),
      ).rejects.toBe(error);

      expect(events).toHaveLength(1);
      expect(events[0]?.exception?.values?.[0]?.mechanism).toEqual({ handled: false, type: 'auto.http.cloudflare' });
      expect(events[0]?.contexts?.trace?.trace_id).toBe('12312012123120121231201212312012');
    });

    test('calls onSpanCreated and onSpanEnd', async () => {
      const calls: string[] = [];
      let transaction: Event | undefined;

      await wrapRequestHandler(
        {
          options: {
            ...MOCK_OPTIONS,
            tracesSampleRate: 1,
            integrations: [
              httpServerIntegration({
                onSpanCreated: (span, request) => {
                  calls.push(`created ${request.method} ${new URL(request.url).pathname}`);
                  span.setAttribute('onSpanCreated', 'yes');
                },
                onSpanEnd: (span, request, response) => {
                  calls.push(`end ${request.method} ${response.status}`);
                  span.setAttribute('onSpanEnd', response.status);
                },
              }),
            ],
            beforeSendTransaction(event) {
              transaction = event;
              return null;
            },
          },
          request: new Request('https://example.com/users'),
          context: createMockExecutionContext(),
        },
        () => {
          calls.push('handler');
          return new Response('ok', { status: 201 });
        },
      ).then(response => response.text());

      await vi.waitFor(() => expect(transaction).toBeDefined());
      expect(calls).toEqual(['created GET /users', 'handler', 'end GET 201']);
      expect(transaction?.contexts?.trace?.data).toEqual(
        expect.objectContaining({ onSpanCreated: 'yes', onSpanEnd: 201 }),
      );
    });

    test('calls onSpanEnd when a streamed response finishes', async () => {
      const onSpanEnd = vi.fn();
      let controller: ReadableStreamDefaultController<Uint8Array>;
      const source = new ReadableStream<Uint8Array>({
        start(value) {
          controller = value;
        },
      });

      const response = await wrapRequestHandler(
        {
          options: { ...MOCK_OPTIONS, tracesSampleRate: 1, integrations: [httpServerIntegration({ onSpanEnd })] },
          request: new Request('https://example.com/events'),
          context: createMockExecutionContext(),
        },
        () => new Response(source, { headers: { 'content-type': 'text/event-stream' } }),
      );

      controller!.enqueue(new TextEncoder().encode('data: one\n\n'));
      expect(onSpanEnd).not.toHaveBeenCalled();

      controller!.close();
      expect(await response.text()).toBe('data: one\n\n');
      expect(onSpanEnd).toHaveBeenCalledTimes(1);
      expect(onSpanEnd).toHaveBeenCalledWith(expect.anything(), expect.any(Request), expect.any(Response));
    });

    test.each(['onSpanCreated', 'onSpanEnd'] as const)('still responds when %s throws', async hook => {
      const integrations = [
        httpServerIntegration({
          [hook]: () => {
            throw new Error(`${hook} failed`);
          },
        }),
      ];

      expect(await hasActiveSpan({ integrations })).toBe(true);
    });

    test('flushes after a streamed response finishes when no span is created', async () => {
      const context = createMockExecutionContext();
      const waitUntilSpy = vi.spyOn(context, 'waitUntil');
      let controller: ReadableStreamDefaultController<Uint8Array>;
      const source = new ReadableStream<Uint8Array>({
        start(value) {
          controller = value;
        },
      });

      const response = await wrapRequestHandler(
        {
          options: { ...MOCK_OPTIONS, tracesSampleRate: undefined },
          request: new Request('https://example.com/events'),
          context,
        },
        () => new Response(source, { headers: { 'content-type': 'text/event-stream' } }),
      );
      expect(waitUntilSpy).not.toHaveBeenCalled();

      controller!.close();
      await response.text();
      expect(waitUntilSpy).toHaveBeenCalledTimes(1);
    });
  });
});

function createMockExecutionContext(): ExecutionContext {
  return {
    waitUntil: vi.fn(),
    passThroughOnException: vi.fn(),
  };
}

describe('flushAndDispose', () => {
  test('dispose is called after flush completes', async () => {
    const context = createMockExecutionContext();
    const waits: Promise<unknown>[] = [];
    const waitUntil = vi.fn(promise => waits.push(promise));
    (context as any).waitUntil = waitUntil;

    const disposeSpy = vi.spyOn(CloudflareClient.prototype, 'dispose');
    const flushSpy = vi.spyOn(SentryCore.Client.prototype, 'flush').mockResolvedValue(true);

    await wrapRequestHandler({ options: MOCK_OPTIONS, request: new Request('https://example.com'), context }, () => {
      return new Response('test');
    }).then(response => response.text());

    // Wait for all waitUntil promises to resolve
    await Promise.all(waits);

    expect(flushSpy).toHaveBeenCalled();
    expect(disposeSpy).toHaveBeenCalled();

    flushSpy.mockRestore();
    disposeSpy.mockRestore();
  });

  test('dispose is called after handler throws error', async () => {
    const context = createMockExecutionContext();
    const waits: Promise<unknown>[] = [];
    const waitUntil = vi.fn(promise => waits.push(promise));
    (context as any).waitUntil = waitUntil;

    const disposeSpy = vi.spyOn(CloudflareClient.prototype, 'dispose');
    const flushSpy = vi.spyOn(SentryCore.Client.prototype, 'flush').mockResolvedValue(true);

    try {
      await wrapRequestHandler({ options: MOCK_OPTIONS, request: new Request('https://example.com'), context }, () => {
        throw new Error('test error');
      });
    } catch {
      // Expected to throw
    }

    // Wait for all waitUntil promises to resolve
    await Promise.all(waits);

    expect(disposeSpy).toHaveBeenCalled();

    flushSpy.mockRestore();
    disposeSpy.mockRestore();
  });

  test('dispose is called for OPTIONS requests', async () => {
    const context = createMockExecutionContext();
    const waits: Promise<unknown>[] = [];
    const waitUntil = vi.fn(promise => waits.push(promise));
    (context as any).waitUntil = waitUntil;

    const disposeSpy = vi.spyOn(CloudflareClient.prototype, 'dispose');
    const flushSpy = vi.spyOn(SentryCore.Client.prototype, 'flush').mockResolvedValue(true);

    await wrapRequestHandler(
      {
        options: MOCK_OPTIONS,
        request: new Request('https://example.com', { method: 'OPTIONS' }),
        context,
      },
      () => new Response('', { status: 200 }),
    );

    // Wait for all waitUntil promises to resolve
    await Promise.all(waits);

    expect(disposeSpy).toHaveBeenCalled();

    flushSpy.mockRestore();
    disposeSpy.mockRestore();
  });

  test('dispose is called for HEAD requests', async () => {
    const context = createMockExecutionContext();
    const waits: Promise<unknown>[] = [];
    const waitUntil = vi.fn(promise => waits.push(promise));
    (context as any).waitUntil = waitUntil;

    const disposeSpy = vi.spyOn(CloudflareClient.prototype, 'dispose');
    const flushSpy = vi.spyOn(SentryCore.Client.prototype, 'flush').mockResolvedValue(true);

    await wrapRequestHandler(
      {
        options: MOCK_OPTIONS,
        request: new Request('https://example.com', { method: 'HEAD' }),
        context,
      },
      () => new Response('', { status: 200 }),
    );

    // Wait for all waitUntil promises to resolve
    await Promise.all(waits);

    expect(disposeSpy).toHaveBeenCalled();

    flushSpy.mockRestore();
    disposeSpy.mockRestore();
  });

  test('dispose is called after streaming response completes', async () => {
    const context = createMockExecutionContext();
    const waits: Promise<unknown>[] = [];
    const waitUntil = vi.fn(promise => waits.push(promise));
    (context as any).waitUntil = waitUntil;

    const disposeSpy = vi.spyOn(CloudflareClient.prototype, 'dispose');
    const flushSpy = vi.spyOn(SentryCore.Client.prototype, 'flush').mockResolvedValue(true);

    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('chunk1'));
        controller.enqueue(new TextEncoder().encode('chunk2'));
        controller.close();
      },
    });

    const result = await wrapRequestHandler(
      { options: MOCK_OPTIONS, request: new Request('https://example.com'), context },
      () => new Response(stream),
    );

    // Consume the response to trigger stream completion
    await result.text();

    // Wait for all waitUntil promises to resolve
    await Promise.all(waits);

    expect(disposeSpy).toHaveBeenCalled();

    flushSpy.mockRestore();
    disposeSpy.mockRestore();
  });

  // Regression tests for https://github.com/getsentry/sentry-javascript/issues/20409
  //
  // Pre-fix: streaming responses were observed via `body.tee()` + a long-running
  // `waitUntil(streamMonitor)`. Cloudflare caps `waitUntil` at ~30s after the
  // handler returns, so any stream taking longer than 30s to fully emit had the
  // monitor cancelled before `span.end()` / `flushAndDispose()` ran — silently
  // dropping the root `http.server` span.
  //
  // Post-fix: the body is piped through a passthrough `TransformStream`; the
  // `flush` (normal completion) and `cancel` (client disconnect) callbacks fire
  // while the response stream is still active (no waitUntil cap), so they can
  // safely end the span and register `flushAndDispose` via a fresh `waitUntil`
  // window. The contract guaranteed below: `waitUntil` is NOT called with any
  // long-running stream-observation promise — only with `flushAndDispose`, and
  // only after the response stream has finished (either by completion or cancel).
  describe('regression #20409: streaming responses do not park stream observation in waitUntil', () => {
    test('waitUntil is not called until streaming response is fully delivered', async () => {
      const waits: Promise<unknown>[] = [];
      const waitUntil = vi.fn((promise: Promise<unknown>) => waits.push(promise));
      const context = { waitUntil } as unknown as ExecutionContext;

      const flushSpy = vi.spyOn(SentryCore.Client.prototype, 'flush').mockResolvedValue(true);
      const disposeSpy = vi.spyOn(CloudflareClient.prototype, 'dispose');

      // Stream emits chunk1, then waits indefinitely until we open the gate
      // before emitting chunk2 + closing. Models a long-running upstream
      // (e.g. SSE / LLM streaming) whose body takes longer than the
      // handler-return time to fully drain.
      let releaseLastChunk!: () => void;
      const lastChunkGate = new Promise<void>(resolve => {
        releaseLastChunk = resolve;
      });

      const stream = new ReadableStream({
        async start(controller) {
          controller.enqueue(new TextEncoder().encode('chunk1'));
          await lastChunkGate;
          controller.enqueue(new TextEncoder().encode('chunk2'));
          controller.close();
        },
      });

      const result = await wrapRequestHandler(
        { options: MOCK_OPTIONS, request: new Request('https://example.com'), context },
        () => new Response(stream, { headers: { 'content-type': 'text/event-stream' } }),
      );

      // Handler has returned, but the source stream has NOT closed yet.
      // The pre-fix code would have already enqueued a long-running
      // `waitUntil(streamMonitor)` task at this point. The post-fix code
      // must not call waitUntil at all here.
      expect(waitUntil).not.toHaveBeenCalled();

      // Drain the response — Cloudflare would do this when forwarding to the client.
      const reader = result.body!.getReader();
      await reader.read(); // chunk1
      // Source still hasn't closed — still no waitUntil.
      expect(waitUntil).not.toHaveBeenCalled();

      releaseLastChunk();
      await reader.read(); // chunk2
      await reader.read(); // done
      reader.releaseLock();

      // Stream completed → TransformStream `flush` fired → span ended →
      // `flushAndDispose(client)` queued via waitUntil exactly once.
      await Promise.all(waits);
      expect(waitUntil).toHaveBeenCalledTimes(1);
      expect(waitUntil).toHaveBeenLastCalledWith(expect.any(Promise));
      expect(flushSpy).toHaveBeenCalled();
      expect(disposeSpy).toHaveBeenCalled();

      flushSpy.mockRestore();
      disposeSpy.mockRestore();
    });

    // Node 18's TransformStream does not invoke the transformer's `cancel` hook
    // when the downstream consumer cancels (WHATWG spec addition landed in Node 20).
    // Cloudflare Workers run modern V8 where this works, so we only skip the
    // test under Node 18.
    test.skipIf(NODE_MAJOR_VERSION < 20)(
      'waitUntil is called once and dispose runs when client cancels mid-stream',
      async () => {
        const waits: Promise<unknown>[] = [];
        const waitUntil = vi.fn((promise: Promise<unknown>) => waits.push(promise));
        const context = { waitUntil } as unknown as ExecutionContext;

        const flushSpy = vi.spyOn(SentryCore.Client.prototype, 'flush').mockResolvedValue(true);
        const disposeSpy = vi.spyOn(CloudflareClient.prototype, 'dispose');

        // Stream emits one chunk and then never closes — models an upstream
        // that keeps emitting indefinitely. We then cancel the response from
        // the consumer side to model a client disconnect.
        let sourceCancelled = false;
        const stream = new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode('chunk1'));
            // intentionally don't close
          },
          cancel() {
            sourceCancelled = true;
          },
        });

        const result = await wrapRequestHandler(
          { options: MOCK_OPTIONS, request: new Request('https://example.com'), context },
          () => new Response(stream, { headers: { 'content-type': 'text/event-stream' } }),
        );

        // Handler returned, source still open — no waitUntil yet.
        expect(waitUntil).not.toHaveBeenCalled();

        const reader = result.body!.getReader();
        await reader.read(); // chunk1
        await reader.cancel('client disconnected'); // simulates client disconnect
        reader.releaseLock();

        // TransformStream `cancel` fired → span ended → flushAndDispose queued.
        await Promise.all(waits);
        expect(waitUntil).toHaveBeenCalledTimes(1);
        expect(waitUntil).toHaveBeenLastCalledWith(expect.any(Promise));
        expect(flushSpy).toHaveBeenCalled();
        expect(disposeSpy).toHaveBeenCalled();
        // pipeThrough should also propagate the cancel upstream to the source.
        expect(sourceCancelled).toBe(true);

        flushSpy.mockRestore();
        disposeSpy.mockRestore();
      },
    );

    test('waitUntil is called exactly once even if the response is consumed multiple times', async () => {
      // Sanity: no matter how the response is drained, the TransformStream's
      // flush callback must only end the span (and queue flushAndDispose) once.
      const waits: Promise<unknown>[] = [];
      const waitUntil = vi.fn((promise: Promise<unknown>) => waits.push(promise));
      const context = { waitUntil } as unknown as ExecutionContext;

      const flushSpy = vi.spyOn(SentryCore.Client.prototype, 'flush').mockResolvedValue(true);
      const disposeSpy = vi.spyOn(CloudflareClient.prototype, 'dispose');

      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('a'));
          controller.enqueue(new TextEncoder().encode('b'));
          controller.close();
        },
      });

      const result = await wrapRequestHandler(
        { options: MOCK_OPTIONS, request: new Request('https://example.com'), context },
        () => new Response(stream, { headers: { 'content-type': 'text/event-stream' } }),
      );

      const text = await result.text();
      expect(text).toBe('ab');

      await Promise.all(waits);
      expect(waitUntil).toHaveBeenCalledTimes(1);

      flushSpy.mockRestore();
      disposeSpy.mockRestore();
    });
  });

  describe('streaming response classification', () => {
    const options: CloudflareOptions = { dsn: MOCK_OPTIONS.dsn, cacheClient: false };

    test('defers teardown until a text/x-component body without Content-Length is consumed', async () => {
      const waits: Promise<unknown>[] = [];
      const waitUntil = vi.fn((promise: Promise<unknown>) => waits.push(promise));
      const context = { waitUntil } as unknown as ExecutionContext;

      const flushSpy = vi.spyOn(SentryCore.Client.prototype, 'flush').mockResolvedValue(true);

      let releaseLastChunk!: () => void;
      const lastChunkGate = new Promise<void>(resolve => {
        releaseLastChunk = resolve;
      });

      const stream = new ReadableStream({
        async start(controller) {
          controller.enqueue(new TextEncoder().encode('<div>shell</div>'));
          await lastChunkGate;
          controller.enqueue(new TextEncoder().encode('<div>suspended</div>'));
          controller.close();
        },
      });

      const result = await wrapRequestHandler(
        { options, request: new Request('https://example.com'), context },
        () => new Response(stream, { headers: { 'content-type': 'text/x-component;charset=utf-8' } }),
      );

      expect(waitUntil).not.toHaveBeenCalled();

      releaseLastChunk();
      expect(await result.text()).toBe('<div>shell</div><div>suspended</div>');

      await Promise.all(waits);
      expect(waitUntil).toHaveBeenCalledTimes(1);

      flushSpy.mockRestore();
    });

    test('tears down at handler return for a text/html body without Content-Length', async () => {
      const waitUntil = vi.fn();
      const context = { waitUntil } as unknown as ExecutionContext;

      const flushSpy = vi.spyOn(SentryCore.Client.prototype, 'flush').mockResolvedValue(true);

      const response = new Response('<div>page</div>', { headers: { 'content-type': 'text/html;charset=utf-8' } });

      const result = await wrapRequestHandler(
        { options, request: new Request('https://example.com'), context },
        () => response,
      );

      expect(result).toBe(response);
      expect(waitUntil).toHaveBeenCalledTimes(1);

      flushSpy.mockRestore();
    });

    test.each(['text/x-component;charset=utf-8', 'text/html;charset=utf-8'])(
      'tears down at handler return for a %s body with a Content-Length',
      async contentType => {
        const waitUntil = vi.fn();
        const context = { waitUntil } as unknown as ExecutionContext;

        const flushSpy = vi.spyOn(SentryCore.Client.prototype, 'flush').mockResolvedValue(true);

        const response = new Response('<div>prerendered</div>', {
          headers: { 'content-type': contentType, 'content-length': '22' },
        });

        const result = await wrapRequestHandler(
          { options, request: new Request('https://example.com'), context },
          () => response,
        );

        expect(result).toBe(response);
        expect(waitUntil).toHaveBeenCalledTimes(1);

        flushSpy.mockRestore();
      },
    );

    test('tears down at handler return when the ReadableStream constructor is not available', async () => {
      const response = new Response('<div>shell</div>', {
        headers: { 'content-type': 'text/x-component;charset=utf-8' },
      });
      // workerd before the 2022-11-30 compatibility date, without `streams_enable_constructors`.
      vi.stubGlobal(
        'ReadableStream',
        class {
          constructor() {
            throw new TypeError('To use the new ReadableStream() constructor, enable streams_enable_constructors.');
          }
        },
      );
      onTestFinished(() => {
        vi.unstubAllGlobals();
      });

      const waitUntil = vi.fn();
      const context = { waitUntil } as unknown as ExecutionContext;

      const flushSpy = vi.spyOn(SentryCore.Client.prototype, 'flush').mockResolvedValue(true);

      const result = await wrapRequestHandler(
        { options, request: new Request('https://example.com'), context },
        () => response,
      );

      expect(result).toBe(response);
      expect(result.bodyUsed).toBe(false);
      expect(result.body?.locked).toBe(false);
      expect(waitUntil).toHaveBeenCalledTimes(1);

      flushSpy.mockRestore();
    });

    test('tears down at handler return when isStreamingResponse returns false', async () => {
      const waitUntil = vi.fn();
      const context = { waitUntil } as unknown as ExecutionContext;

      const flushSpy = vi.spyOn(SentryCore.Client.prototype, 'flush').mockResolvedValue(true);

      const response = new Response('<div>buffered</div>', {
        headers: { 'content-type': 'text/x-component;charset=utf-8' },
      });

      const result = await wrapRequestHandler(
        {
          options: { ...options, isStreamingResponse: () => false },
          request: new Request('https://example.com'),
          context,
        },
        () => response,
      );

      expect(result).toBe(response);
      expect(waitUntil).toHaveBeenCalledTimes(1);

      flushSpy.mockRestore();
    });

    test('defers teardown when isStreamingResponse returns true for the request route', async () => {
      const waits: Promise<unknown>[] = [];
      const waitUntil = vi.fn((promise: Promise<unknown>) => waits.push(promise));
      const context = { waitUntil } as unknown as ExecutionContext;

      const flushSpy = vi.spyOn(SentryCore.Client.prototype, 'flush').mockResolvedValue(true);

      let releaseLastChunk!: () => void;
      const lastChunkGate = new Promise<void>(resolve => {
        releaseLastChunk = resolve;
      });

      const stream = new ReadableStream({
        async start(controller) {
          controller.enqueue(new TextEncoder().encode('first'));
          await lastChunkGate;
          controller.enqueue(new TextEncoder().encode('deferred'));
          controller.close();
        },
      });

      const result = await wrapRequestHandler(
        {
          options: {
            ...options,
            isStreamingResponse: (_response, request) => (request.url.endsWith('.data') ? true : undefined),
          },
          request: new Request('https://example.com/products.data'),
          context,
        },
        () => new Response(stream, { headers: { 'content-type': 'text/x-script' } }),
      );

      expect(waitUntil).not.toHaveBeenCalled();

      releaseLastChunk();
      expect(await result.text()).toBe('firstdeferred');

      await Promise.all(waits);
      expect(waitUntil).toHaveBeenCalledTimes(1);

      flushSpy.mockRestore();
    });

    test('uses the default classification when isStreamingResponse throws', async () => {
      const waitUntil = vi.fn();
      const context = { waitUntil } as unknown as ExecutionContext;

      const flushSpy = vi.spyOn(SentryCore.Client.prototype, 'flush').mockResolvedValue(true);

      const response = new Response('<div>shell</div>', {
        headers: { 'content-type': 'text/x-component;charset=utf-8' },
      });

      const result = await wrapRequestHandler(
        {
          options: {
            ...options,
            isStreamingResponse: () => {
              throw new Error('isStreamingResponse failed');
            },
          },
          request: new Request('https://example.com'),
          context,
        },
        () => response,
      );

      expect(result).not.toBe(response);
      expect(waitUntil).not.toHaveBeenCalled();
      expect(await result.text()).toBe('<div>shell</div>');

      flushSpy.mockRestore();
    });

    test('uses the default classification when isStreamingResponse returns a promise', async () => {
      const waitUntil = vi.fn();
      const context = { waitUntil } as unknown as ExecutionContext;

      const flushSpy = vi.spyOn(SentryCore.Client.prototype, 'flush').mockResolvedValue(true);

      const response = new Response('<div>page</div>', { headers: { 'content-type': 'text/html;charset=utf-8' } });

      const result = await wrapRequestHandler(
        {
          options: {
            ...options,
            isStreamingResponse: (async () => true) as unknown as CloudflareOptions['isStreamingResponse'],
          },
          request: new Request('https://example.com'),
          context,
        },
        () => response,
      );

      expect(result).toBe(response);
      expect(waitUntil).toHaveBeenCalledTimes(1);

      flushSpy.mockRestore();
    });
  });

  test('dispose is NOT called for protocol upgrade responses (status 101)', async () => {
    const context = createMockExecutionContext();
    const waits: Promise<unknown>[] = [];
    const waitUntil = vi.fn(promise => waits.push(promise));
    (context as any).waitUntil = waitUntil;

    const disposeSpy = vi.spyOn(CloudflareClient.prototype, 'dispose');
    const flushSpy = vi.spyOn(CloudflareClient.prototype, 'flush').mockResolvedValue(true);

    // Create a mock protocol upgrade response (Node.js Response doesn't allow status 101)
    // In Cloudflare Workers, this is a valid response for WebSocket upgrades and other protocol switches
    const mockWebSocketResponse = {
      status: 101,
      statusText: 'Switching Protocols',
      headers: new Headers(),
      body: null,
      ok: false,
      redirected: false,
      type: 'basic' as ResponseType,
      url: '',
      clone: () => mockWebSocketResponse,
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
      blob: () => Promise.resolve(new Blob()),
      formData: () => Promise.resolve(new FormData()),
      json: () => Promise.resolve({}),
      text: () => Promise.resolve(''),
      bodyUsed: false,
      bytes: () => Promise.resolve(new Uint8Array()),
    } as Response;

    await wrapRequestHandler(
      { options: MOCK_OPTIONS, request: new Request('https://example.com'), context },
      () => mockWebSocketResponse,
    );

    // Wait for all waitUntil promises to resolve
    await Promise.all(waits);

    // dispose should NOT be called for protocol upgrades (101) since the connection stays alive
    // and subsequent handlers (e.g., webSocketMessage/webSocketClose) may still need the client
    expect(disposeSpy).not.toHaveBeenCalled();
    // But flush should still be called
    expect(flushSpy).toHaveBeenCalled();

    flushSpy.mockRestore();
    disposeSpy.mockRestore();
  });
});

function createMockDOContext(): ExecutionContext {
  return {
    waitUntil: vi.fn(),
    passThroughOnException: vi.fn(),
    storage: {},
  } as unknown as ExecutionContext;
}

describe('Durable Object (DO) context', () => {
  test('DO handler registers teardown via waitUntil', async () => {
    const context = createMockDOContext();
    const waitUntilSpy = vi.spyOn(context, 'waitUntil');

    // Send a body with a content-length so the response is treated as non-streaming
    // and teardown runs at the handler boundary rather than on stream completion.
    const result = await wrapRequestHandler(
      { options: MOCK_OPTIONS, request: new Request('https://example.com'), context },
      () => new Response('test', { headers: { 'content-type': 'application/json' } }),
    );

    expect(result.status).toBe(200);
    // Teardown is registered via waitUntil (a DurableObjectState.waitUntil exists
    // for API compatibility and still runs the passed promise)
    expect(waitUntilSpy).toHaveBeenCalled();
  });

  test('DO handler error path registers teardown via waitUntil', async () => {
    const context = createMockDOContext();
    const waitUntilSpy = vi.spyOn(context, 'waitUntil');
    const flushSpy = vi.spyOn(SentryCore.Client.prototype, 'flush').mockResolvedValue(true);

    try {
      await wrapRequestHandler({ options: MOCK_OPTIONS, request: new Request('https://example.com'), context }, () => {
        throw new Error('test error');
      });
    } catch {
      // Expected
    }

    // Teardown is registered via waitUntil on error too
    expect(waitUntilSpy).toHaveBeenCalled();
    await Promise.all(waitUntilSpy.mock.calls.map(([promise]) => promise));
    // And flush runs as part of that teardown
    expect(flushSpy).toHaveBeenCalled();

    flushSpy.mockRestore();
  });

  test('DO handler for OPTIONS registers teardown via waitUntil', async () => {
    const context = createMockDOContext();
    const waitUntilSpy = vi.spyOn(context, 'waitUntil');
    const flushSpy = vi.spyOn(SentryCore.Client.prototype, 'flush').mockResolvedValue(true);

    await wrapRequestHandler(
      {
        options: MOCK_OPTIONS,
        request: new Request('https://example.com', { method: 'OPTIONS' }),
        context,
      },
      () => new Response('', { status: 200 }),
    );

    expect(waitUntilSpy).toHaveBeenCalled();
    await Promise.all(waitUntilSpy.mock.calls.map(([promise]) => promise));
    expect(flushSpy).toHaveBeenCalled();

    flushSpy.mockRestore();
  });

  test('DO handler for HEAD registers teardown via waitUntil', async () => {
    const context = createMockDOContext();
    const waitUntilSpy = vi.spyOn(context, 'waitUntil');
    const flushSpy = vi.spyOn(SentryCore.Client.prototype, 'flush').mockResolvedValue(true);

    await wrapRequestHandler(
      {
        options: MOCK_OPTIONS,
        request: new Request('https://example.com', { method: 'HEAD' }),
        context,
      },
      () => new Response('', { status: 200 }),
    );

    expect(waitUntilSpy).toHaveBeenCalled();
    await Promise.all(waitUntilSpy.mock.calls.map(([promise]) => promise));
    expect(flushSpy).toHaveBeenCalled();

    flushSpy.mockRestore();
  });

  test('DO handler for streaming response registers teardown via waitUntil', async () => {
    const context = createMockDOContext();
    const waitUntilSpy = vi.spyOn(context, 'waitUntil');
    const flushSpy = vi.spyOn(SentryCore.Client.prototype, 'flush').mockResolvedValue(true);

    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('chunk1'));
        controller.enqueue(new TextEncoder().encode('chunk2'));
        controller.close();
      },
    });

    const result = await wrapRequestHandler(
      { options: MOCK_OPTIONS, request: new Request('https://example.com'), context },
      () => new Response(stream),
    );

    await result.text();

    // Teardown is registered via waitUntil
    expect(waitUntilSpy).toHaveBeenCalled();
    // And flush runs as part of that teardown
    expect(flushSpy).toHaveBeenCalled();

    flushSpy.mockRestore();
  });

  test('DO handler for protocol upgrade (101) registers teardown via waitUntil', async () => {
    const context = createMockDOContext();
    const waitUntilSpy = vi.spyOn(context, 'waitUntil');
    const flushSpy = vi.spyOn(CloudflareClient.prototype, 'flush').mockResolvedValue(true);
    const disposeSpy = vi.spyOn(CloudflareClient.prototype, 'dispose');

    const mockWebSocketResponse = {
      status: 101,
      statusText: 'Switching Protocols',
      headers: new Headers(),
      body: null,
      ok: false,
      redirected: false,
      type: 'basic' as ResponseType,
      url: '',
      clone: () => mockWebSocketResponse,
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
      blob: () => Promise.resolve(new Blob()),
      formData: () => Promise.resolve(new FormData()),
      json: () => Promise.resolve({}),
      text: () => Promise.resolve(''),
      bodyUsed: false,
      bytes: () => Promise.resolve(new Uint8Array()),
    } as Response;

    await wrapRequestHandler(
      { options: MOCK_OPTIONS, request: new Request('https://example.com'), context },
      () => mockWebSocketResponse,
    );

    // Teardown is registered via waitUntil
    expect(waitUntilSpy).toHaveBeenCalled();
    // Flush runs as part of that teardown
    expect(flushSpy).toHaveBeenCalled();
    // Dispose should NOT be called for 101
    expect(disposeSpy).not.toHaveBeenCalled();

    flushSpy.mockRestore();
    disposeSpy.mockRestore();
  });
});

describe('cached client (cacheClient)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _clearGlobalClientCache();
    SentryCore.getCurrentScope().setClient(undefined);
  });

  // `init()` resolves defaults into the options object it is given, so each call
  // needs a fresh object to fingerprint identically — exactly like real callers,
  // which build their options per invocation.
  const makeOptions = (dsn?: string): CloudflareOptions => ({
    dsn: dsn ?? MOCK_OPTIONS.dsn,
    beforeSend() {
      return null;
    },
  });

  test('wrapRequestHandler reuses a client when cacheClient is enabled', async () => {
    const initAndBindSpy = vi.spyOn(SentryCore, 'initAndBind');
    const options = { ...MOCK_OPTIONS, cacheClient: true };

    await wrapRequestHandler(
      { options, request: new Request('https://example.com/first'), context: createMockExecutionContext() },
      () => new Response('first'),
    );
    await wrapRequestHandler(
      {
        options: { ...options },
        request: new Request('https://example.com/second'),
        context: createMockExecutionContext(),
      },
      () => new Response('second'),
    );

    expect(initAndBindSpy).toHaveBeenCalledTimes(1);
  });

  test('returns the same cached client for the same options', async () => {
    const client1 = init(makeOptions());
    const client2 = init(makeOptions());
    expect(client2).toBe(client1);
  });

  test('returns the isolate client even when a later init uses a different DSN', async () => {
    const client1 = init(makeOptions());
    const client2 = init(makeOptions('https://other@dsn.ingest.sentry.io/9999'));
    expect(client2).toBe(client1);
  });

  test('clears cache with _clearGlobalClientCache', async () => {
    const client1 = init(makeOptions());
    _clearGlobalClientCache();
    SentryCore.getCurrentScope().setClient(undefined);
    const client2 = init(makeOptions());
    expect(client2).not.toBe(client1);
  });
});
