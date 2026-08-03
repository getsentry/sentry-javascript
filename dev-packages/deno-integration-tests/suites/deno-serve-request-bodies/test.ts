// <reference lib="deno.ns" />

import { denoServeIntegration, init } from '@sentry/deno';
import { assertEquals } from 'https://deno.land/std@0.212.0/assert/assert_equals.ts';
import { resetGlobals, transactionSink, withTimeout } from '../../src/index.ts';

Deno.test('Deno.serve captures incoming request bodies by default', async () => {
  resetGlobals();
  const sink = transactionSink();

  init({
    traceLifecycle: 'static',
    dsn: 'https://username@domain/123',
    tracesSampleRate: 1,
    beforeSendTransaction: sink.beforeSendTransaction,
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

  const transactionPromise = withTimeout(
    sink.waitFor(event => event.request?.url?.endsWith('/default') === true),
    5_000,
    'transaction for /default',
  );
  const response = await fetch(`http://localhost:${server.addr.port}/default`, {
    method: 'POST',
    headers: { 'content-type': 'text/plain' },
    body: requestBody,
  });
  assertEquals(await response.text(), 'OK');

  const transaction = await transactionPromise;
  assertEquals(transaction.request?.data, requestBody);

  abortController.abort();
  await server.finished;
});

Deno.test('Deno.serve explicit small overrides disabled incoming request body collection', async () => {
  resetGlobals();
  const sink = transactionSink();

  init({
    traceLifecycle: 'static',
    dsn: 'https://username@domain/123',
    tracesSampleRate: 1,
    dataCollection: { httpBodies: [] },
    integrations: integrations => [
      ...integrations.filter(integration => integration.name !== 'DenoServe'),
      denoServeIntegration({ maxRequestBodySize: 'small' }),
    ],
    beforeSendTransaction: sink.beforeSendTransaction,
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

  const transactionPromise = withTimeout(
    sink.waitFor(event => event.request?.url?.endsWith('/explicit-small') === true),
    5_000,
    'transaction for /explicit-small',
  );
  const response = await fetch(`http://localhost:${server.addr.port}/explicit-small`, {
    method: 'POST',
    headers: { 'content-type': 'text/plain' },
    body: requestBody,
  });
  assertEquals(await response.text(), 'OK');

  const transaction = await transactionPromise;
  assertEquals(transaction.request?.data, expectedBody);

  abortController.abort();
  await server.finished;
});

Deno.test('Deno.serve explicit none overrides enabled incoming request body collection', async () => {
  resetGlobals();
  const sink = transactionSink();

  init({
    traceLifecycle: 'static',
    dsn: 'https://username@domain/123',
    tracesSampleRate: 1,
    dataCollection: { httpBodies: ['incomingRequest'] },
    integrations: integrations => [
      ...integrations.filter(integration => integration.name !== 'DenoServe'),
      denoServeIntegration({ maxRequestBodySize: 'none' }),
    ],
    beforeSendTransaction: sink.beforeSendTransaction,
  });

  const abortController = new AbortController();
  let onListen: ((_: unknown) => void) | undefined;
  const listening = new Promise(resolve => (onListen = resolve));
  const server = Deno.serve({ port: 0, signal: abortController.signal, onListen }, async request => {
    assertEquals(await request.text(), 'do-not-capture');
    return new Response('OK');
  });
  await listening;

  const transactionPromise = withTimeout(
    sink.waitFor(event => event.request?.url?.endsWith('/explicit-none') === true),
    5_000,
    'transaction for /explicit-none',
  );
  const response = await fetch(`http://localhost:${server.addr.port}/explicit-none`, {
    method: 'POST',
    headers: { 'content-type': 'text/plain' },
    body: 'do-not-capture',
  });
  assertEquals(await response.text(), 'OK');

  const transaction = await transactionPromise;
  assertEquals(transaction.request?.data, undefined);

  abortController.abort();
  await server.finished;
});
