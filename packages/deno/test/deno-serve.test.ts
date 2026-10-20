// <reference lib="deno.ns" />

import type { AggregationCounts, Envelope, ErrorEvent, Span, TransactionEvent } from '@sentry/core';
import { forEachEnvelopeItem, getMainCarrier } from '@sentry/core';
import { assertEquals, assertExists, assertMatch, assertNotEquals } from 'https://deno.land/std@0.212.0/assert/mod.ts';
import type { DenoClient, DenoOptions } from '../build/esm/index.js';
import { captureException, captureMessage, init, denoServeIntegration, setTag, setUser } from '../build/esm/index.js';

import { makeTestTransport } from './transport.ts';

const LOOPBACK_ADDRESS = /^(127\.0\.0\.1|::1|::ffff:127\.0\.0\.1)$/;

function resetGlobals(): void {
  getMainCarrier().__SENTRY__ = undefined;
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
    traceLifecycle: 'static',
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

Deno.test('Deno.serve should instrument QUERY requests with bodies', async () => {
  resetGlobals();
  const transactionEvents: TransactionEvent[] = [];

  init({
    dsn: 'https://username@domain/123',
    tracesSampleRate: 1,
    traceLifecycle: 'static',
    beforeSendTransaction: (event: TransactionEvent) => {
      transactionEvents.push(event);
      return null;
    },
  }) as DenoClient;

  const abortController = new AbortController();
  let onListen: ((_: unknown) => void) | undefined = undefined;
  const p = new Promise(resolve => (onListen = resolve));
  const requestBody = JSON.stringify({ query: '{ viewer { id } }' });
  const server = Deno.serve({ port: 0, signal: abortController.signal, onListen }, async request => {
    assertEquals(await request.text(), requestBody);
    return new Response('OK');
  });
  await p;

  const response = await fetch(`http://localhost:${server.addr.port}/graphql`, {
    method: 'QUERY',
    headers: { 'content-type': 'application/json' },
    body: requestBody,
  });
  assertEquals(await response.text(), 'OK');

  abortController.abort();
  await server.finished;

  assertEquals(transactionEvents.length, 1);
  const [transaction] = transactionEvents;
  assertEquals(transaction?.transaction, 'QUERY /graphql');
  assertEquals(transaction?.request?.method, 'QUERY');
  assertEquals(transaction?.contexts?.trace?.data?.['http.request.method'], 'QUERY');
  assertEquals(transaction?.request?.data, requestBody);
});

Deno.test('Deno.serve should capture incoming request bodies by default', async () => {
  resetGlobals();
  const transactionEvents: TransactionEvent[] = [];

  init({
    dsn: 'https://username@domain/123',
    tracesSampleRate: 1,
    traceLifecycle: 'static',
    beforeSendTransaction: (event: TransactionEvent) => {
      transactionEvents.push(event);
      return null;
    },
  }) as DenoClient;

  const abortController = new AbortController();
  let onListen: ((_: unknown) => void) | undefined = undefined;
  const p = new Promise(resolve => (onListen = resolve));
  const server = Deno.serve({ port: 0, signal: abortController.signal, onListen }, async request => {
    assertEquals(await request.json(), { username: 'test', action: 'login' });
    return new Response('OK');
  });
  await p;

  const requestBody = JSON.stringify({ username: 'test', action: 'login' });
  const response = await fetch(`http://localhost:${server.addr.port}/test`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: requestBody,
  });
  assertEquals(await response.text(), 'OK');

  abortController.abort();
  await server.finished;

  assertEquals(transactionEvents.length, 1);
  assertEquals(transactionEvents[0]?.request?.data, requestBody);
});

Deno.test('Deno.serve should not capture incoming request bodies when disabled', async () => {
  resetGlobals();
  const transactionEvents: TransactionEvent[] = [];

  init({
    dsn: 'https://username@domain/123',
    tracesSampleRate: 1,
    traceLifecycle: 'static',
    dataCollection: { httpBodies: [] },
    beforeSendTransaction: (event: TransactionEvent) => {
      transactionEvents.push(event);
      return null;
    },
  }) as DenoClient;

  const abortController = new AbortController();
  let onListen: ((_: unknown) => void) | undefined = undefined;
  const p = new Promise(resolve => (onListen = resolve));
  const server = Deno.serve({ port: 0, signal: abortController.signal, onListen }, async request => {
    assertEquals(await request.json(), { secret: 'do-not-capture' });
    return new Response('OK');
  });
  await p;

  const response = await fetch(`http://localhost:${server.addr.port}/test`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ secret: 'do-not-capture' }),
  });
  assertEquals(await response.text(), 'OK');

  abortController.abort();
  await server.finished;

  assertEquals(transactionEvents.length, 1);
  assertEquals(transactionEvents[0]?.request?.data, undefined);
});

Deno.test('Deno.serve should truncate incoming request bodies using an explicit size', async () => {
  resetGlobals();
  const transactionEvents: TransactionEvent[] = [];

  init({
    dsn: 'https://username@domain/123',
    tracesSampleRate: 1,
    traceLifecycle: 'static',
    dataCollection: { httpBodies: [] },
    integrations: integrations => [
      ...integrations.filter(integration => integration.name !== 'DenoServe'),
      denoServeIntegration({ maxRequestBodySize: 'small' }),
    ],
    beforeSendTransaction: (event: TransactionEvent) => {
      transactionEvents.push(event);
      return null;
    },
  }) as DenoClient;

  const abortController = new AbortController();
  let onListen: ((_: unknown) => void) | undefined = undefined;
  const p = new Promise(resolve => (onListen = resolve));
  const requestBody = 'a'.repeat(1_001);
  const server = Deno.serve({ port: 0, signal: abortController.signal, onListen }, async request => {
    assertEquals(await request.text(), requestBody);
    return new Response('OK');
  });
  await p;

  const response = await fetch(`http://localhost:${server.addr.port}/test`, {
    method: 'POST',
    headers: { 'content-type': 'text/plain' },
    body: requestBody,
  });
  assertEquals(await response.text(), 'OK');

  abortController.abort();
  await server.finished;

  assertEquals(transactionEvents.length, 1);
  assertEquals(transactionEvents[0]?.request?.data, `${'a'.repeat(997)}...`);
});

Deno.test('Deno.serve should honor explicit none when incoming request bodies are enabled', async () => {
  resetGlobals();
  const transactionEvents: TransactionEvent[] = [];

  init({
    dsn: 'https://username@domain/123',
    tracesSampleRate: 1,
    traceLifecycle: 'static',
    dataCollection: { httpBodies: ['incomingRequest'] },
    integrations: integrations => [
      ...integrations.filter(integration => integration.name !== 'DenoServe'),
      denoServeIntegration({ maxRequestBodySize: 'none' }),
    ],
    beforeSendTransaction: (event: TransactionEvent) => {
      transactionEvents.push(event);
      return null;
    },
  }) as DenoClient;

  const abortController = new AbortController();
  let onListen: ((_: unknown) => void) | undefined = undefined;
  const p = new Promise(resolve => (onListen = resolve));
  const server = Deno.serve({ port: 0, signal: abortController.signal, onListen }, async request => {
    assertEquals(await request.text(), 'do-not-capture');
    return new Response('OK');
  });
  await p;

  const response = await fetch(`http://localhost:${server.addr.port}/test`, {
    method: 'POST',
    headers: { 'content-type': 'text/plain' },
    body: 'do-not-capture',
  });
  assertEquals(await response.text(), 'OK');

  abortController.abort();
  await server.finished;

  assertEquals(transactionEvents.length, 1);
  assertEquals(transactionEvents[0]?.request?.data, undefined);
});

Deno.test('Deno.serve should isolate context between concurrent requests', async () => {
  resetGlobals();
  const transactionEvents: TransactionEvent[] = [];
  const errorEvents: ErrorEvent[] = [];

  init({
    dsn: 'https://username@domain/123',
    tracesSampleRate: 1,
    traceLifecycle: 'static',
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
    traceLifecycle: 'static',
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
    traceLifecycle: 'static',
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
    traceLifecycle: 'static',
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
  assertEquals(transaction?.contexts?.trace?.data?.['http.response.header.content-type'], ['text/plain']);
  assertEquals(transaction?.contexts?.trace?.data?.['http.response.header.x-custom-header'], ['test']);
});

Deno.test('Deno.serve should capture client address and port by default', async () => {
  resetGlobals();
  const transactionEvents: TransactionEvent[] = [];

  init({
    dsn: 'https://username@domain/123',
    tracesSampleRate: 1,
    traceLifecycle: 'static',
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

  const res = await fetch(`http://localhost:${server.addr.port}/test`);
  assertEquals(await res.text(), 'OK');

  abortController.abort();
  await server.finished;

  assertEquals(transactionEvents.length, 1);
  const [transaction] = transactionEvents;

  assertExists(transaction?.contexts?.trace?.data?.['client.address']);
  assertExists(transaction?.contexts?.trace?.data?.['client.port']);
});

Deno.test('Deno.serve should prefer the forwarded client address, without the socket port', async () => {
  resetGlobals();
  const transactionEvents: TransactionEvent[] = [];

  init({
    dsn: 'https://username@domain/123',
    tracesSampleRate: 1,
    traceLifecycle: 'static',
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

  const res = await fetch(`http://localhost:${server.addr.port}/test`, {
    headers: { 'X-Forwarded-For': '203.0.113.7, 10.0.0.1' },
  });
  assertEquals(await res.text(), 'OK');

  abortController.abort();
  await server.finished;

  assertEquals(transactionEvents.length, 1);
  const [transaction] = transactionEvents;

  assertEquals(transaction?.contexts?.trace?.data?.['client.address'], '203.0.113.7');
  assertEquals(transaction?.contexts?.trace?.data?.['client.port'], undefined);
});

Deno.test('Deno.serve should fall back to the socket address when the forwarding header is not an IP', async () => {
  resetGlobals();
  const transactionEvents: TransactionEvent[] = [];

  init({
    dsn: 'https://username@domain/123',
    tracesSampleRate: 1,
    traceLifecycle: 'static',
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

  const res = await fetch(`http://localhost:${server.addr.port}/test`, {
    headers: { 'X-Forwarded-For': 'unknown' },
  });
  assertEquals(await res.text(), 'OK');

  abortController.abort();
  await server.finished;

  assertEquals(transactionEvents.length, 1);
  const [transaction] = transactionEvents;

  assertMatch(String(transaction?.contexts?.trace?.data?.['client.address']), LOOPBACK_ADDRESS);
  assertEquals(typeof transaction?.contexts?.trace?.data?.['client.port'], 'number');
});

Deno.test('Deno.serve should set the socket address as the user IP on error events', async () => {
  resetGlobals();
  const errorEvents: ErrorEvent[] = [];

  init({
    dsn: 'https://username@domain/123',
    tracesSampleRate: 1,
    traceLifecycle: 'static',
    beforeSend: (event: ErrorEvent) => {
      errorEvents.push(event);
      return null;
    },
  }) as DenoClient;

  const abortController = new AbortController();
  let onListen: ((_: unknown) => void) | undefined = undefined;
  const p = new Promise(resolve => (onListen = resolve));
  const server = Deno.serve({ port: 0, signal: abortController.signal, onListen }, () => {
    captureException(new Error('Boom'));
    return new Response('OK');
  });
  await p;

  const res = await fetch(`http://localhost:${server.addr.port}/test`);
  assertEquals(await res.text(), 'OK');

  abortController.abort();
  await server.finished;

  assertEquals(errorEvents.length, 1);
  assertMatch(String(errorEvents[0]?.user?.ip_address), LOOPBACK_ADDRESS);
});

Deno.test('Deno.serve should not capture client address when userInfo collection is disabled', async () => {
  resetGlobals();
  const transactionEvents: TransactionEvent[] = [];

  init({
    dsn: 'https://username@domain/123',
    tracesSampleRate: 1,
    traceLifecycle: 'static',
    dataCollection: { userInfo: false },
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

  const res = await fetch(`http://localhost:${server.addr.port}/test`);
  assertEquals(await res.text(), 'OK');

  abortController.abort();
  await server.finished;

  assertEquals(transactionEvents.length, 1);
  const [transaction] = transactionEvents;

  assertEquals(transaction?.contexts?.trace?.data?.['client.address'], undefined);
  assertEquals(transaction?.contexts?.trace?.data?.['client.port'], undefined);
});

Deno.test('Deno.serve should keep PII request headers by default', async () => {
  resetGlobals();
  const transactionEvents: TransactionEvent[] = [];

  init({
    dsn: 'https://username@domain/123',
    tracesSampleRate: 1,
    traceLifecycle: 'static',
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

  const res = await fetch(`http://localhost:${server.addr.port}/test`, {
    headers: { 'X-Forwarded-For': '203.0.113.7' },
  });
  assertEquals(await res.text(), 'OK');

  abortController.abort();
  await server.finished;

  assertEquals(transactionEvents.length, 1);
  const [transaction] = transactionEvents;

  assertEquals(transaction?.contexts?.trace?.data?.['http.request.header.x-forwarded-for'], ['203.0.113.7']);
});

Deno.test('Deno.serve should filter PII request headers when configured', async () => {
  resetGlobals();
  const transactionEvents: TransactionEvent[] = [];

  init({
    dsn: 'https://username@domain/123',
    tracesSampleRate: 1,
    traceLifecycle: 'static',
    dataCollection: { httpHeaders: { request: { deny: ['forwarded'] } } },
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

  const res = await fetch(`http://localhost:${server.addr.port}/test`, {
    headers: { 'X-Forwarded-For': '203.0.113.7' },
  });
  assertEquals(await res.text(), 'OK');

  abortController.abort();
  await server.finished;

  assertEquals(transactionEvents.length, 1);
  const [transaction] = transactionEvents;

  assertEquals(transaction?.contexts?.trace?.data?.['http.request.header.x-forwarded-for'], ['[Filtered]']);
});

Deno.test('Deno.serve should support distributed tracing with sentry-trace header', async () => {
  resetGlobals();
  const transactionEvents: TransactionEvent[] = [];

  init({
    dsn: 'https://username@domain/123',
    tracesSampleRate: 1,
    traceLifecycle: 'static',
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
    traceLifecycle: 'static',
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
    traceLifecycle: 'static',
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

async function serveForTest(
  handler: (request: Request) => Response | Promise<Response>,
): Promise<{ url: string; close: () => Promise<void> }> {
  const abortController = new AbortController();
  let onListen: ((_: unknown) => void) | undefined = undefined;
  const p = new Promise(resolve => (onListen = resolve));
  const server = Deno.serve(
    {
      port: 0,
      signal: abortController.signal,
      onListen,
      onError: error => new Response((error as Error).message, { status: 500 }),
    },
    handler,
  );
  await p;
  return {
    url: `http://localhost:${server.addr.port}`,
    close: async () => {
      abortController.abort();
      await server.finished;
    },
  };
}

Deno.test('Deno.serve should not capture request bodies that ignoreRequestBody matches', async () => {
  resetGlobals();
  const transactionEvents: TransactionEvent[] = [];
  const ignoreRequestBodyCalls: [string, string][] = [];

  init({
    dsn: 'https://username@domain/123',
    tracesSampleRate: 1,
    traceLifecycle: 'static',
    integrations: integrations => [
      ...integrations.filter(integration => integration.name !== 'DenoServe'),
      denoServeIntegration({
        ignoreRequestBody: (url, request) => {
          ignoreRequestBodyCalls.push([url, request.method]);
          return url.includes('/upload');
        },
      }),
    ],
    beforeSendTransaction: (event: TransactionEvent) => {
      transactionEvents.push(event);
      return null;
    },
  }) as DenoClient;

  const handlerBodies: string[] = [];
  const server = await serveForTest(async request => {
    handlerBodies.push(await request.text());
    return new Response('OK');
  });

  await (await fetch(`${server.url}/upload?id=1`, { method: 'POST', body: 'secret' })).text();
  await (await fetch(`${server.url}/other`, { method: 'POST', body: 'public' })).text();
  await server.close();

  assertEquals(handlerBodies, ['secret', 'public']);
  assertEquals(ignoreRequestBodyCalls, [
    [`${server.url}/upload?id=1`, 'POST'],
    [`${server.url}/other`, 'POST'],
  ]);
  assertEquals(transactionEvents.length, 2);
  const upload = transactionEvents.find(event => event.request?.url?.includes('/upload'));
  const other = transactionEvents.find(event => event.request?.url?.includes('/other'));
  assertEquals(upload?.request?.data, undefined);
  assertEquals(other?.request?.data, 'public');
});

Deno.test('Deno.serve should not create spans for requests that ignoreIncomingRequests matches', async () => {
  resetGlobals();
  const transactionEvents: TransactionEvent[] = [];
  const errorEvents: ErrorEvent[] = [];
  const urlPaths: string[] = [];

  const client = init({
    dsn: 'https://username@domain/123',
    tracesSampleRate: 1,
    traceLifecycle: 'static',
    integrations: integrations => [
      ...integrations.filter(integration => integration.name !== 'DenoServe'),
      denoServeIntegration({
        ignoreIncomingRequests: (urlPath, request) => {
          urlPaths.push(urlPath);
          return request.method === 'GET' && urlPath.startsWith('/health');
        },
      }),
    ],
    beforeSend: (event: ErrorEvent) => {
      errorEvents.push(event);
      return null;
    },
    beforeSendTransaction: (event: TransactionEvent) => {
      transactionEvents.push(event);
      return null;
    },
  }) as DenoClient;

  const server = await serveForTest(request => {
    if (request.url.includes('fail')) {
      throw new Error('health check failed');
    }
    return new Response('OK');
  });

  await (await fetch(`${server.url}/health?ok=1`)).text();
  await (await fetch(`${server.url}/health/fail`)).text();
  await (await fetch(`${server.url}/users`)).text();
  await server.close();
  await client.flush();

  assertEquals(urlPaths, ['/health?ok=1', '/health/fail', '/users']);
  assertEquals(
    transactionEvents.map(event => event.transaction),
    ['GET /users'],
  );
  assertEquals(errorEvents.length, 1);
  assertEquals(errorEvents[0]?.exception?.values?.[0]?.value, 'health check failed');
  assertEquals(errorEvents[0]?.exception?.values?.[0]?.mechanism?.type, 'auto.http.deno');
  assertEquals(errorEvents[0]?.request?.url?.includes('/health/fail'), true);
});

Deno.test('Deno.serve should not create spans for static assets by default', async () => {
  resetGlobals();
  const transactionEvents: TransactionEvent[] = [];

  init({
    dsn: 'https://username@domain/123',
    tracesSampleRate: 1,
    traceLifecycle: 'static',
    beforeSendTransaction: (event: TransactionEvent) => {
      transactionEvents.push(event);
      return null;
    },
  }) as DenoClient;

  const server = await serveForTest(() => new Response('OK'));
  await (await fetch(`${server.url}/favicon.ico`)).text();
  await (await fetch(`${server.url}/robots.txt`)).text();
  await (await fetch(`${server.url}/assets/app.js?v=2`)).text();
  await (await fetch(`${server.url}/assets/app.js`, { method: 'POST' })).text();
  await (await fetch(`${server.url}/page`)).text();
  await server.close();

  assertEquals(transactionEvents.map(event => event.transaction).sort(), ['GET /page', 'POST /assets/app.js']);
});

Deno.test('Deno.serve should create spans for static assets when ignoreStaticAssets is false', async () => {
  resetGlobals();
  const transactionEvents: TransactionEvent[] = [];

  init({
    dsn: 'https://username@domain/123',
    tracesSampleRate: 1,
    traceLifecycle: 'static',
    integrations: integrations => [
      ...integrations.filter(integration => integration.name !== 'DenoServe'),
      denoServeIntegration({ ignoreStaticAssets: false }),
    ],
    beforeSendTransaction: (event: TransactionEvent) => {
      transactionEvents.push(event);
      return null;
    },
  }) as DenoClient;

  const server = await serveForTest(() => new Response('OK'));
  await (await fetch(`${server.url}/favicon.ico`)).text();
  await server.close();

  assertEquals(
    transactionEvents.map(event => event.transaction),
    ['GET /favicon.ico'],
  );
});

Deno.test('Deno.serve should not create spans when spans is false, but still capture errors', async () => {
  resetGlobals();
  const transactionEvents: TransactionEvent[] = [];
  const errorEvents: ErrorEvent[] = [];

  const client = init({
    dsn: 'https://username@domain/123',
    tracesSampleRate: 1,
    traceLifecycle: 'static',
    integrations: integrations => [
      ...integrations.filter(integration => integration.name !== 'DenoServe'),
      denoServeIntegration({ spans: false }),
    ],
    beforeSend: (event: ErrorEvent) => {
      errorEvents.push(event);
      return null;
    },
    beforeSendTransaction: (event: TransactionEvent) => {
      transactionEvents.push(event);
      return null;
    },
  }) as DenoClient;

  const server = await serveForTest(async request => {
    if (request.url.includes('error')) {
      throw new Error(`failed with ${await request.text()}`);
    }
    return new Response('OK');
  });

  await (await fetch(`${server.url}/ok`)).text();
  await (await fetch(`${server.url}/error`, { method: 'POST', body: 'payload' })).text();
  await server.close();
  await client.flush();

  assertEquals(transactionEvents.length, 0);
  assertEquals(errorEvents.length, 1);
  assertEquals(errorEvents[0]?.exception?.values?.[0]?.value, 'failed with payload');
  assertEquals(errorEvents[0]?.exception?.values?.[0]?.mechanism?.handled, false);
  assertEquals(errorEvents[0]?.request?.url?.includes('/error'), true);
  assertEquals(errorEvents[0]?.request?.data, 'payload');
});

Deno.test('Deno.serve should not create spans when tracing is disabled', async () => {
  resetGlobals();
  let spanCreatedCalls = 0;

  init({
    dsn: 'https://username@domain/123',
    integrations: integrations => [
      ...integrations.filter(integration => integration.name !== 'DenoServe'),
      denoServeIntegration({
        onSpanCreated: () => {
          spanCreatedCalls++;
        },
      }),
    ],
  }) as DenoClient;

  const server = await serveForTest(() => new Response('OK'));
  await (await fetch(`${server.url}/page`)).text();
  await server.close();

  assertEquals(spanCreatedCalls, 0);
});

Deno.test('Deno.serve should call onSpanCreated and onSpanEnd', async () => {
  resetGlobals();
  const transactionEvents: TransactionEvent[] = [];
  const hookCalls: string[] = [];

  init({
    dsn: 'https://username@domain/123',
    tracesSampleRate: 1,
    traceLifecycle: 'static',
    integrations: integrations => [
      ...integrations.filter(integration => integration.name !== 'DenoServe'),
      denoServeIntegration({
        onSpanCreated: (span: Span, request: Request) => {
          hookCalls.push(`created ${new URL(request.url).pathname}`);
          span.setAttribute('test.created', true);
        },
        onSpanEnd: (span: Span, request: Request, response: Response) => {
          hookCalls.push(`end ${new URL(request.url).pathname} ${response.status}`);
          span.setAttribute('test.response_header', response.headers.get('x-test') ?? undefined);
        },
      }),
    ],
    beforeSendTransaction: (event: TransactionEvent) => {
      transactionEvents.push(event);
      return null;
    },
  }) as DenoClient;

  const server = await serveForTest(() => {
    hookCalls.push('handler');
    return new Response('OK', { status: 201, headers: { 'x-test': 'yes' } });
  });
  await (await fetch(`${server.url}/hooks`)).text();
  await server.close();

  assertEquals(hookCalls, ['created /hooks', 'handler', 'end /hooks 201']);
  assertEquals(transactionEvents.length, 1);
  assertEquals(transactionEvents[0]?.contexts?.trace?.data?.['test.created'], true);
  assertEquals(transactionEvents[0]?.contexts?.trace?.data?.['test.response_header'], 'yes');
});

Deno.test('Deno.serve should call onSpanEnd when a streamed response finishes', async () => {
  resetGlobals();
  const transactionEvents: TransactionEvent[] = [];
  const hookCalls: string[] = [];

  init({
    dsn: 'https://username@domain/123',
    tracesSampleRate: 1,
    traceLifecycle: 'static',
    integrations: integrations => [
      ...integrations.filter(integration => integration.name !== 'DenoServe'),
      denoServeIntegration({
        onSpanEnd: (span: Span) => {
          hookCalls.push('end');
          span.setAttribute('test.ended', true);
        },
      }),
    ],
    beforeSendTransaction: (event: TransactionEvent) => {
      transactionEvents.push(event);
      return null;
    },
  }) as DenoClient;

  const server = await serveForTest(() => {
    const stream = new ReadableStream({
      async pull(controller) {
        hookCalls.push('chunk');
        controller.enqueue(new TextEncoder().encode('chunk\n'));
        controller.close();
      },
    });
    return new Response(stream, { headers: { 'content-type': 'text/event-stream' } });
  });
  assertEquals(await (await fetch(`${server.url}/stream`)).text(), 'chunk\n');
  await server.close();

  assertEquals(hookCalls, ['chunk', 'end']);
  assertEquals(transactionEvents.length, 1);
  assertEquals(transactionEvents[0]?.contexts?.trace?.data?.['test.ended'], true);
});

Deno.test('Deno.serve should still respond and end the span when onSpanCreated throws', async () => {
  resetGlobals();
  const transactionEvents: TransactionEvent[] = [];

  init({
    dsn: 'https://username@domain/123',
    tracesSampleRate: 1,
    traceLifecycle: 'static',
    integrations: integrations => [
      ...integrations.filter(integration => integration.name !== 'DenoServe'),
      denoServeIntegration({
        onSpanCreated: () => {
          throw new Error('onSpanCreated failed');
        },
      }),
    ],
    beforeSendTransaction: (event: TransactionEvent) => {
      transactionEvents.push(event);
      return null;
    },
  }) as DenoClient;

  const server = await serveForTest(() => new Response('OK'));
  const response = await fetch(`${server.url}/created`);
  assertEquals(response.status, 200);
  assertEquals(await response.text(), 'OK');
  await server.close();

  assertEquals(
    transactionEvents.map(event => event.transaction),
    ['GET /created'],
  );
});

for (const [label, makeResponse] of [
  ['a response', () => new Response('OK')],
  [
    'a streamed response',
    () =>
      new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode('OK'));
            controller.close();
          },
        }),
        { headers: { 'content-type': 'text/event-stream' } },
      ),
  ],
] as const) {
  Deno.test(`Deno.serve should still respond and end the span when onSpanEnd throws for ${label}`, async () => {
    resetGlobals();
    const transactionEvents: TransactionEvent[] = [];

    init({
      dsn: 'https://username@domain/123',
      tracesSampleRate: 1,
      traceLifecycle: 'static',
      integrations: integrations => [
        ...integrations.filter(integration => integration.name !== 'DenoServe'),
        denoServeIntegration({
          onSpanEnd: () => {
            throw new Error('onSpanEnd failed');
          },
        }),
      ],
      beforeSendTransaction: (event: TransactionEvent) => {
        transactionEvents.push(event);
        return null;
      },
    }) as DenoClient;

    const server = await serveForTest(makeResponse);
    const response = await fetch(`${server.url}/ended`);
    assertEquals(response.status, 200);
    assertEquals(await response.text(), 'OK');
    await server.close();

    assertEquals(
      transactionEvents.map(event => event.transaction),
      ['GET /ended'],
    );
  });
}

Deno.test('Deno.serve should not capture the body and still respond when ignoreRequestBody throws', async () => {
  resetGlobals();
  const transactionEvents: TransactionEvent[] = [];
  const errorEvents: ErrorEvent[] = [];

  const client = init({
    dsn: 'https://username@domain/123',
    tracesSampleRate: 1,
    traceLifecycle: 'static',
    integrations: integrations => [
      ...integrations.filter(integration => integration.name !== 'DenoServe'),
      denoServeIntegration({
        ignoreRequestBody: () => {
          throw new Error('ignoreRequestBody failed');
        },
      }),
    ],
    beforeSend: (event: ErrorEvent) => {
      errorEvents.push(event);
      return null;
    },
    beforeSendTransaction: (event: TransactionEvent) => {
      transactionEvents.push(event);
      return null;
    },
  }) as DenoClient;

  const server = await serveForTest(async request => new Response(await request.text()));
  const response = await fetch(`${server.url}/upload`, { method: 'POST', body: 'secret' });
  assertEquals(response.status, 200);
  assertEquals(await response.text(), 'secret');
  await server.close();
  await client.flush();

  assertEquals(errorEvents.length, 0);
  assertEquals(transactionEvents.length, 1);
  assertEquals(transactionEvents[0]?.request?.data, undefined);
});

Deno.test('Deno.serve should create the span and still respond when ignoreIncomingRequests throws', async () => {
  resetGlobals();
  const transactionEvents: TransactionEvent[] = [];
  const errorEvents: ErrorEvent[] = [];

  const client = init({
    dsn: 'https://username@domain/123',
    tracesSampleRate: 1,
    traceLifecycle: 'static',
    integrations: integrations => [
      ...integrations.filter(integration => integration.name !== 'DenoServe'),
      denoServeIntegration({
        ignoreIncomingRequests: () => {
          throw new Error('ignoreIncomingRequests failed');
        },
      }),
    ],
    beforeSend: (event: ErrorEvent) => {
      errorEvents.push(event);
      return null;
    },
    beforeSendTransaction: (event: TransactionEvent) => {
      transactionEvents.push(event);
      return null;
    },
  }) as DenoClient;

  const server = await serveForTest(() => new Response('OK'));
  const response = await fetch(`${server.url}/page`);
  assertEquals(response.status, 200);
  assertEquals(await response.text(), 'OK');
  await server.close();
  await client.flush();

  assertEquals(errorEvents.length, 0);
  assertEquals(
    transactionEvents.map(event => event.transaction),
    ['GET /page'],
  );
});

type SessionCounts = Omit<AggregationCounts, 'started'>;

function initWithSessionTransport(options: DenoOptions = {}): {
  client: DenoClient;
  sessions: SessionCounts[];
  firstSession: Promise<void>;
} {
  const sessions: SessionCounts[] = [];
  let resolveFirstSession: () => void;
  const firstSession = new Promise<void>(resolve => (resolveFirstSession = resolve));
  const client = init({
    dsn: 'https://username@domain/123',
    release: '1.0.0',
    transport: makeTestTransport((envelope: Envelope) => {
      forEachEnvelopeItem(envelope, (item, type) => {
        if (type === 'sessions') {
          for (const { started: _started, ...counts } of (item[1] as { aggregates: AggregationCounts[] }).aggregates) {
            sessions.push(counts);
          }
          resolveFirstSession();
        }
      });
    }),
    ...options,
  }) as DenoClient;
  return { client, sessions, firstSession };
}

Deno.test('Deno.serve should record an exited session for a successful request', async () => {
  resetGlobals();
  const { client, sessions } = initWithSessionTransport();

  const server = await serveForTest(() => new Response('OK'));
  await (await fetch(`${server.url}/ok`)).text();
  await server.close();
  await client.flush();

  assertEquals(sessions, [{ exited: 1, errored: 0, crashed: 0 }]);
});

Deno.test('Deno.serve should record an errored session for a handled exception', async () => {
  resetGlobals();
  const { client, sessions } = initWithSessionTransport();

  const server = await serveForTest(() => {
    captureException(new Error('handled'));
    return new Response('OK');
  });
  await (await fetch(`${server.url}/handled`)).text();
  await server.close();
  await client.flush();

  assertEquals(sessions, [{ exited: 0, errored: 1, crashed: 0 }]);
});

Deno.test('Deno.serve should record a crashed session when the handler throws', async () => {
  resetGlobals();
  const { client, sessions } = initWithSessionTransport();

  const server = await serveForTest(() => {
    throw new Error('unhandled');
  });
  await (await fetch(`${server.url}/throws`)).text();
  await server.close();
  await client.flush();

  assertEquals(sessions, [{ exited: 0, errored: 0, crashed: 1 }]);
});

Deno.test('Deno.serve should record sessions for OPTIONS and HEAD requests', async () => {
  resetGlobals();
  const { client, sessions } = initWithSessionTransport();

  const server = await serveForTest(() => new Response('OK'));
  await (await fetch(`${server.url}/cors`, { method: 'OPTIONS' })).text();
  await (await fetch(`${server.url}/cors`, { method: 'HEAD' })).text();
  await server.close();
  await client.flush();

  assertEquals(sessions, [{ exited: 2, errored: 0, crashed: 0 }]);
});

Deno.test('Deno.serve should not record sessions when sessions is false', async () => {
  resetGlobals();
  const { client, sessions } = initWithSessionTransport({
    integrations: integrations => [
      ...integrations.filter(integration => integration.name !== 'DenoServe'),
      denoServeIntegration({ sessions: false }),
    ],
  });

  const server = await serveForTest(() => new Response('OK'));
  await (await fetch(`${server.url}/ok`)).text();
  await server.close();
  await client.flush();

  assertEquals(sessions, []);
});

Deno.test('Deno.serve should send the session aggregate after sessionFlushingDelayMS', async () => {
  resetGlobals();
  const { sessions, firstSession } = initWithSessionTransport({
    integrations: integrations => [
      ...integrations.filter(integration => integration.name !== 'DenoServe'),
      denoServeIntegration({ sessionFlushingDelayMS: 50 }),
    ],
  });

  const server = await serveForTest(() => new Response('OK'));
  await (await fetch(`${server.url}/ok`)).text();
  await server.close();

  // The timeout only bounds a failure. With the default 60s delay, no
  // session arrives within it.
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timedOut = new Promise<'timed out'>(resolve => {
    timeoutId = setTimeout(() => resolve('timed out'), 10_000);
  });
  const result = await Promise.race([firstSession.then(() => 'sent' as const), timedOut]);
  clearTimeout(timeoutId);

  assertEquals(result, 'sent');
  assertEquals(sessions, [{ exited: 1, errored: 0, crashed: 0 }]);
});

for (const [label, options] of [
  ['when tracing is enabled', { tracesSampleRate: 1, traceLifecycle: 'static' }],
  ['when tracing is disabled', {}],
] as const) {
  Deno.test(`Deno.serve should record a streamed response session when the stream finishes ${label}`, async () => {
    resetGlobals();
    const { client, sessions } = initWithSessionTransport(options);

    let streamController: ReadableStreamDefaultController<Uint8Array> | undefined;
    const server = await serveForTest(() => {
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          streamController = controller;
          controller.enqueue(new TextEncoder().encode('chunk\n'));
        },
      });
      return new Response(stream, { headers: { 'content-type': 'text/event-stream' } });
    });

    const response = await fetch(`${server.url}/stream`);
    await client.flush();
    assertEquals(sessions, []);

    streamController!.close();
    assertEquals(await response.text(), 'chunk\n');
    await server.close();
    await client.flush();

    assertEquals(sessions, [{ exited: 1, errored: 0, crashed: 0 }]);
  });
}

Deno.test('Deno.serve should record sessions for requests without a span', async () => {
  resetGlobals();
  const { client, sessions } = initWithSessionTransport({
    tracesSampleRate: 1,
    traceLifecycle: 'static',
    integrations: integrations => [
      ...integrations.filter(integration => integration.name !== 'DenoServe'),
      denoServeIntegration({ ignoreIncomingRequests: urlPath => urlPath === '/health' }),
    ],
  });

  const server = await serveForTest(() => new Response('OK'));
  await (await fetch(`${server.url}/health`)).text();
  await (await fetch(`${server.url}/favicon.ico`)).text();
  await server.close();
  await client.flush();

  assertEquals(sessions, [{ exited: 2, errored: 0, crashed: 0 }]);
});
