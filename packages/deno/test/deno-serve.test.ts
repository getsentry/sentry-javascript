// <reference lib="deno.ns" />

import type { ErrorEvent, TransactionEvent } from '@sentry/core';
import { assertEquals, assertExists, assertNotEquals } from 'https://deno.land/std@0.212.0/assert/mod.ts';
import type { DenoClient } from '../build/esm/index.js';
import {
  captureException,
  captureMessage,
  getCurrentScope,
  getGlobalScope,
  getIsolationScope,
  init,
  setTag,
  setUser,
} from '../build/esm/index.js';

function resetGlobals(): void {
  getCurrentScope().clear();
  getCurrentScope().setClient(undefined);
  getIsolationScope().clear();
  getGlobalScope().clear();
}

function delay(time: number): Promise<void> {
  return new Promise(resolve => {
    setTimeout(resolve, time);
  });
}

Deno.test('Deno.serve should create http.server spans', async () => {
  resetGlobals();
  const transactionEvents: TransactionEvent[] = [];

  init({
    dsn: 'https://username@domain/123',
    tracesSampleRate: 1,
    beforeSendTransaction: (event: TransactionEvent) => {
      transactionEvents.push(event);
      return null;
    },
  }) as DenoClient;

  const abortController = new AbortController();
  let onListen: ((_: unknown) => void) | undefined = undefined;
  const p = new Promise(resolve => (onListen = resolve));
  const server = Deno.serve({ port: 0, signal: abortController.signal, onListen }, () => {
    return new Response('Hello World');
  });
  await p;

  const response = await fetch(`http://localhost:${server.addr.port}/test`);
  assertEquals(await response.text(), 'Hello World');

  abortController.abort();
  await server.finished;

  assertEquals(transactionEvents.length, 1);
  const [transaction] = transactionEvents;

  assertEquals(transaction?.contexts?.trace?.op, 'http.server');
  assertEquals(transaction?.contexts?.trace?.status, 'ok');
  assertEquals(transaction?.request?.method, 'GET');
  assertExists(transaction?.request?.url);
  assertEquals(transaction?.request?.url?.includes('/test'), true);
});

Deno.test('Deno.serve should isolate context between concurrent requests', async () => {
  resetGlobals();
  const transactionEvents: TransactionEvent[] = [];
  const errorEvents: ErrorEvent[] = [];

  init({
    dsn: 'https://username@domain/123',
    tracesSampleRate: 1,
    beforeSendTransaction: (event: TransactionEvent) => {
      transactionEvents.push(event);
      return null;
    },
    beforeSend: (event: ErrorEvent) => {
      errorEvents.push(event);
      return null;
    },
  }) as DenoClient;

  const abortController = new AbortController();
  let onListen: ((_: unknown) => void) | undefined = undefined;
  const p = new Promise(resolve => (onListen = resolve));
  const server = Deno.serve({ port: 0, signal: abortController.signal, onListen }, async (req: Request) => {
    const url = new URL(req.url);
    const userId = url.searchParams.get('user');

    setUser({ id: userId || 'unknown' });
    setTag('request.id', userId || 'unknown');

    // Simulate async work to ensure contexts don't leak
    await delay(50);

    if (url.searchParams.get('error')) {
      captureMessage(`Error for user ${userId}`);
    }

    return new Response(`Hello ${userId}`);
  });
  await p;

  // Make concurrent requests with different user contexts
  const [response1, response2, response3] = await Promise.all([
    fetch(`http://localhost:${server.addr.port}/?user=user1&error=true`),
    fetch(`http://localhost:${server.addr.port}/?user=user2`),
    fetch(`http://localhost:${server.addr.port}/?user=user3&error=true`),
  ]);

  assertEquals(await response1.text(), 'Hello user1');
  assertEquals(await response2.text(), 'Hello user2');
  assertEquals(await response3.text(), 'Hello user3');

  abortController.abort();
  await server.finished;

  // Should have 3 transaction events (one per request)
  assertEquals(transactionEvents.length, 3);

  // Should have 2 error events (user1 and user3)
  assertEquals(errorEvents.length, 2);

  // Verify context isolation - each error should have the correct user
  const errorUsers = errorEvents.map((e: any) => e.user?.id).sort();
  assertEquals(errorUsers, ['user1', 'user3']);

  // Verify tags are isolated
  const errorTags = errorEvents.map((e: any) => e.tags?.['request.id']).sort();
  assertEquals(errorTags, ['user1', 'user3']);

  // Verify each transaction has correct user context
  const transactionUsers = transactionEvents.map((t: any) => t.user?.id).sort();
  assertEquals(transactionUsers, ['user1', 'user2', 'user3']);
});

Deno.test('Deno.serve should capture unhandled errors', async () => {
  resetGlobals();
  const errorEvents: ErrorEvent[] = [];

  init({
    dsn: 'https://username@domain/123',
    beforeSend: (event: ErrorEvent) => {
      errorEvents.push(event);
      return null;
    },
  }) as DenoClient;

  const abortController = new AbortController();
  let onListen: ((_: unknown) => void) | undefined = undefined;
  const p = new Promise(resolve => (onListen = resolve));
  let threw = false;

  const server = Deno.serve(
    {
      port: 0,
      signal: abortController.signal,
      onListen,
      onError: error => {
        threw = true;
        return new Response((error as Error).message, { status: 500 });
      },
    },
    (req: Request) => {
      if (req.url.includes('error')) {
        throw new Error('Test error');
      }
      return new Response('OK');
    },
  );
  await p;

  // Request that throws error
  const res = await fetch(`http://localhost:${server.addr.port}/error`);
  assertEquals(await res.text(), 'Test error');

  assertEquals(threw, true);

  abortController.abort();
  await server.finished;
  // delay so that the error has a chance to be handled
  await delay(100);

  assertEquals(errorEvents.length, 1);
  const [errorEvent] = errorEvents;

  assertEquals(errorEvent?.exception?.values?.[0]?.value, 'Test error');
  assertEquals(errorEvent?.exception?.values?.[0]?.mechanism?.handled, false);
  assertEquals(errorEvent?.exception?.values?.[0]?.mechanism?.type, 'auto.http.deno');
});

Deno.test('Deno.serve should handle OPTIONS and HEAD requests without creating spans', async () => {
  resetGlobals();
  const transactionEvents: TransactionEvent[] = [];

  init({
    dsn: 'https://username@domain/123',
    tracesSampleRate: 1,
    beforeSendTransaction: (event: TransactionEvent) => {
      transactionEvents.push(event);
      return null;
    },
  }) as DenoClient;

  const abortController = new AbortController();
  let onListen: ((_: unknown) => void) | undefined = undefined;
  const p = new Promise(resolve => (onListen = resolve));
  const server = Deno.serve({ port: 0, signal: abortController.signal, onListen }, () => {
    return new Response('OK', {
      headers: { 'Access-Control-Allow-Origin': '*' },
    });
  });
  await p;

  const addr = server.addr;

  // Make OPTIONS request
  const optionRes = await fetch(`http://localhost:${addr.port}/test`, { method: 'OPTIONS' });
  await optionRes.text();

  // Make HEAD request
  const headRes = await fetch(`http://localhost:${addr.port}/test`, { method: 'HEAD' });
  await headRes.text();

  abortController.abort();
  await server.finished;

  // OPTIONS and HEAD requests should not create transaction spans
  // (they are handled separately in wrap-deno-request-handler.ts)
  assertEquals(transactionEvents.length, 0);
});

Deno.test('Deno.serve should work with handler in options object', async () => {
  resetGlobals();
  const transactionEvents: TransactionEvent[] = [];

  init({
    dsn: 'https://username@domain/123',
    tracesSampleRate: 1,
    beforeSendTransaction: (event: TransactionEvent) => {
      transactionEvents.push(event);
      return null;
    },
  }) as DenoClient;

  const abortController = new AbortController();
  let onListen: ((_: unknown) => void) | undefined = undefined;
  const p = new Promise(resolve => (onListen = resolve));
  const server = Deno.serve({
    port: 0,
    signal: abortController.signal,
    onListen,
    handler: () => {
      return new Response('Handler in options');
    },
  });
  await p;

  const addr = server.addr;
  const response = await fetch(`http://localhost:${addr.port}/`);
  assertEquals(await response.text(), 'Handler in options');

  abortController.abort();
  await server.finished;

  assertEquals(transactionEvents.length, 1);
  assertEquals(transactionEvents[0]?.contexts?.trace?.op, 'http.server');
});

Deno.test('Deno.serve should capture request headers and set response context', async () => {
  resetGlobals();
  const transactionEvents: TransactionEvent[] = [];

  init({
    dsn: 'https://username@domain/123',
    tracesSampleRate: 1,
    sendDefaultPii: true,
    beforeSendTransaction: (event: TransactionEvent) => {
      transactionEvents.push(event);
      return null;
    },
  }) as DenoClient;

  const abortController = new AbortController();
  let onListen: ((_: unknown) => void) | undefined = undefined;
  const p = new Promise(resolve => (onListen = resolve));
  const server = Deno.serve({ port: 0, signal: abortController.signal, onListen }, () => {
    return new Response('OK', {
      status: 201,
      headers: {
        'Content-Type': 'text/plain',
        'X-Custom-Header': 'test',
      },
    });
  });
  await p;

  const addr = server.addr;
  const res = await fetch(`http://localhost:${addr.port}/test`, {
    headers: {
      'User-Agent': 'Test/1.0',
      'X-Request-ID': 'test-123',
    },
  });
  assertEquals(await res.text(), 'OK');

  abortController.abort();
  await server.finished;

  assertEquals(transactionEvents.length, 1);
  const [transaction] = transactionEvents;

  // Check that request headers are captured
  assertEquals(transaction?.request?.headers?.['user-agent'], 'Test/1.0');

  // Check response context
  assertEquals(transaction?.contexts?.response?.status_code, 201);
  assertExists(transaction?.contexts?.response?.headers);
  assertEquals(transaction?.contexts?.response?.headers?.['content-type'], 'text/plain');
  assertEquals(transaction?.contexts?.response?.headers?.['x-custom-header'], 'test');
});

Deno.test('Deno.serve should support distributed tracing with sentry-trace header', async () => {
  resetGlobals();
  const transactionEvents: TransactionEvent[] = [];

  init({
    dsn: 'https://username@domain/123',
    tracesSampleRate: 1,
    beforeSendTransaction: (event: TransactionEvent) => {
      transactionEvents.push(event);
      return null;
    },
  }) as DenoClient;

  const abortController = new AbortController();
  let onListen: ((_: unknown) => void) | undefined = undefined;
  const p = new Promise(resolve => (onListen = resolve));
  const server = Deno.serve({ port: 0, signal: abortController.signal, onListen }, () => {
    return new Response('OK');
  });
  await p;

  const addr = server.addr;

  // Send request with sentry-trace header for distributed tracing
  const traceId = '12312012123120121231201212312012';
  const parentSpanId = '1231201212312012';
  const sampled = '1';

  const res = await fetch(`http://localhost:${addr.port}/test`, {
    headers: {
      'sentry-trace': `${traceId}-${parentSpanId}-${sampled}`,
      baggage: 'sentry-environment=production,sentry-release=1.0.0',
    },
  });
  assertEquals(await res.text(), 'OK');

  abortController.abort();
  await server.finished;

  assertEquals(transactionEvents.length, 1);
  const [transaction] = transactionEvents;

  // Verify trace continuation
  assertEquals(transaction?.contexts?.trace?.trace_id, traceId);
  assertEquals(transaction?.contexts?.trace?.parent_span_id, parentSpanId);
  assertNotEquals(transaction?.contexts?.trace?.span_id, parentSpanId);
});

Deno.test('Deno.serve should handle streaming responses', async () => {
  resetGlobals();
  const transactionEvents: TransactionEvent[] = [];

  init({
    dsn: 'https://username@domain/123',
    tracesSampleRate: 1,
    beforeSendTransaction: (event: TransactionEvent) => {
      transactionEvents.push(event);
      return null;
    },
  }) as DenoClient;

  const abortController = new AbortController();
  let onListen: ((_: unknown) => void) | undefined = undefined;
  const p = new Promise(resolve => (onListen = resolve));
  const server = Deno.serve({ port: 0, signal: abortController.signal, onListen }, () => {
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('chunk1\n'));
        controller.enqueue(new TextEncoder().encode('chunk2\n'));
        controller.close();
      },
    });

    return new Response(stream, {
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  });
  await p;

  const addr = server.addr;
  const response = await fetch(`http://localhost:${addr.port}/stream`);
  const text = await response.text();
  assertEquals(text, 'chunk1\nchunk2\n');

  abortController.abort();
  await server.finished;

  // Span should still be created for streaming responses
  assertEquals(transactionEvents.length, 1);
  assertEquals(transactionEvents[0]?.contexts?.trace?.op, 'http.server');
});

Deno.test('Deno.serve should work when manually capturing exceptions within handler', async () => {
  resetGlobals();
  const errorEvents: ErrorEvent[] = [];
  const transactionEvents: TransactionEvent[] = [];

  init({
    dsn: 'https://username@domain/123',
    tracesSampleRate: 1,
    beforeSend: (event: ErrorEvent) => {
      errorEvents.push(event);
      return null;
    },
    beforeSendTransaction: (event: TransactionEvent) => {
      transactionEvents.push(event);
      return null;
    },
  }) as DenoClient;

  const abortController = new AbortController();
  let onListen: ((_: unknown) => void) | undefined = undefined;
  const p = new Promise(resolve => (onListen = resolve));
  const server = Deno.serve({ port: 0, signal: abortController.signal, onListen }, async () => {
    try {
      throw new Error('Handled error');
    } catch (e) {
      captureException(e, {
        level: 'warning',
        tags: { handled: 'true' },
      });
    }
    return new Response('Error handled');
  });
  await p;

  const addr = server.addr;
  const response = await fetch(`http://localhost:${addr.port}/`);
  assertEquals(await response.text(), 'Error handled');

  abortController.abort();
  await server.finished;

  // Should have both transaction and manually captured error
  assertEquals(transactionEvents.length, 1);
  assertEquals(errorEvents.length, 1);

  const [errorEvent] = errorEvents;
  assertEquals(errorEvent?.exception?.values?.[0]?.value, 'Handled error');
  assertEquals(errorEvent?.level, 'warning');
  assertEquals(errorEvent?.tags?.handled, 'true');

  // Manually captured exceptions should have handled mechanism
  // (unless explicitly set otherwise)
  assertEquals(errorEvent?.exception?.values?.[0]?.mechanism?.handled, true);
});
