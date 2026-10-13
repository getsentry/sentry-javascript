// <reference lib="deno.ns" />

import { denoServeIntegration, flush, init } from '@sentry/deno';
import { assertEquals } from 'https://deno.land/std@0.212.0/assert/assert_equals.ts';
import { getSpanOp, resetGlobals, spanSink, withTimeout } from '../../src/index.ts';

Deno.test('Deno.serve captures incoming request bodies by default', async () => {
  resetGlobals();
  const sink = spanSink();

  init({
    dsn: 'https://username@domain/123',
    tracesSampleRate: 1,
    transport: sink.transport,
  });

  const requestBody = 'captured-by-default';
  const abortController = new AbortController();
  let onListen: ((_: unknown) => void) | undefined;
  const listening = new Promise(resolve => (onListen = resolve));
  const server = Deno.serve({ port: 0, signal: abortController.signal, onListen }, async request => {
    assertEquals(await request.text(), requestBody);
    return new Response('OK');
  });
  await listening;

  try {
    const spanPromise = withTimeout(
      sink.waitFor(
        span =>
          span.is_segment && getSpanOp(span) === 'http.server' && span.attributes['url.path']?.value === '/default',
      ),
      5_000,
      'segment span for /default',
    );
    const response = await fetch(`http://localhost:${server.addr.port}/default`, {
      method: 'POST',
      headers: { 'content-type': 'text/plain' },
      body: requestBody,
    });
    assertEquals(await response.text(), 'OK');

    await flush();
    const span = await spanPromise;
    assertEquals(span.name, 'POST');
    assertEquals(span.attributes['http.request.body.data']?.value, requestBody);
  } finally {
    abortController.abort();
    await server.finished;
  }
});

Deno.test('Deno.serve explicit small overrides disabled incoming request body collection', async () => {
  resetGlobals();
  const sink = spanSink();

  init({
    dsn: 'https://username@domain/123',
    tracesSampleRate: 1,
    dataCollection: { httpBodies: [] },
    integrations: integrations => [
      ...integrations.filter(integration => integration.name !== 'DenoServe'),
      denoServeIntegration({ maxRequestBodySize: 'small' }),
    ],
    transport: sink.transport,
  });

  const requestBody = 'a'.repeat(1_001);
  const expectedBody = `${'a'.repeat(997)}...`;
  const abortController = new AbortController();
  let onListen: ((_: unknown) => void) | undefined;
  const listening = new Promise(resolve => (onListen = resolve));
  const server = Deno.serve({ port: 0, signal: abortController.signal, onListen }, async request => {
    assertEquals(await request.text(), requestBody);
    return new Response('OK');
  });
  await listening;

  try {
    const spanPromise = withTimeout(
      sink.waitFor(
        span =>
          span.is_segment &&
          getSpanOp(span) === 'http.server' &&
          span.attributes['url.path']?.value === '/explicit-small',
      ),
      5_000,
      'segment span for /explicit-small',
    );
    const response = await fetch(`http://localhost:${server.addr.port}/explicit-small`, {
      method: 'POST',
      headers: { 'content-type': 'text/plain' },
      body: requestBody,
    });
    assertEquals(await response.text(), 'OK');

    await flush();
    const span = await spanPromise;
    assertEquals(span.name, 'POST');
    assertEquals(span.attributes['http.request.body.data']?.value, expectedBody);
  } finally {
    abortController.abort();
    await server.finished;
  }
});

Deno.test('Deno.serve explicit none overrides enabled incoming request body collection', async () => {
  resetGlobals();
  const sink = spanSink();

  init({
    dsn: 'https://username@domain/123',
    tracesSampleRate: 1,
    dataCollection: { httpBodies: ['incomingRequest'] },
    integrations: integrations => [
      ...integrations.filter(integration => integration.name !== 'DenoServe'),
      denoServeIntegration({ maxRequestBodySize: 'none' }),
    ],
    transport: sink.transport,
  });

  const abortController = new AbortController();
  let onListen: ((_: unknown) => void) | undefined;
  const listening = new Promise(resolve => (onListen = resolve));
  const server = Deno.serve({ port: 0, signal: abortController.signal, onListen }, async request => {
    assertEquals(await request.text(), 'do-not-capture');
    return new Response('OK');
  });
  await listening;

  try {
    const spanPromise = withTimeout(
      sink.waitFor(
        span =>
          span.is_segment &&
          getSpanOp(span) === 'http.server' &&
          span.attributes['url.path']?.value === '/explicit-none',
      ),
      5_000,
      'segment span for /explicit-none',
    );
    const response = await fetch(`http://localhost:${server.addr.port}/explicit-none`, {
      method: 'POST',
      headers: { 'content-type': 'text/plain' },
      body: 'do-not-capture',
    });
    assertEquals(await response.text(), 'OK');

    await flush();
    const span = await spanPromise;
    assertEquals(span.name, 'POST');
    assertEquals(span.attributes['http.request.body.data']?.value, undefined);
  } finally {
    abortController.abort();
    await server.finished;
  }
});
