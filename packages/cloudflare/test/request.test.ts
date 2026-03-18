// Note: These tests run the handler in Node.js, which has some differences to the cloudflare workers runtime.
// Although this is not ideal, this is the best we can do until we have a better way to test cloudflare workers.

import type { ExecutionContext } from '@cloudflare/workers-types';
import type { Event } from '@sentry/core';
import * as SentryCore from '@sentry/core';
import { beforeAll, beforeEach, describe, expect, onTestFinished, test, vi } from 'vitest';
import { setAsyncLocalStorageAsyncContextStrategy } from '../src/async';
import type { CloudflareOptions } from '../src/client';
import { CloudflareClient } from '../src/client';
import { wrapRequestHandler } from '../src/request';

const MOCK_OPTIONS: CloudflareOptions = {
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
};

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
    );

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
      const response = new Response('test');
      // Add Content-Length to skip probing
      response.headers.set('content-length', '4');
      return response;
    });
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
      );

      // Wait for async span end and transaction capture
      await new Promise(resolve => setTimeout(resolve, 50));

      expect(sentryEvent.transaction).toEqual('GET /');
      expect(sentryEvent.spans).toHaveLength(0);
      expect(sentryEvent.contexts?.trace).toEqual({
        data: {
          'sentry.origin': 'auto.http.cloudflare',
          'sentry.op': 'http.server',
          'sentry.source': 'route',
          'http.request.method': 'GET',
          'url.full': 'https://example.com/',
          'server.address': 'example.com',
          'network.protocol.name': 'HTTP/1.1',
          'url.scheme': 'https:',
          'url.path': '/',
          'sentry.sample_rate': 1,
          'http.response.status_code': 200,
          'http.request.body.size': 10,
          'http.request.header.content_length': '10',
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
      const response = new Response('test');
      response.headers.set('content-length', '4');
      return response;
    });

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
