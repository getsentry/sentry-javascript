import { expect, test } from '@playwright/test';
import { waitForError, waitForRequest, waitForTransaction } from '@sentry-internal/test-utils';
import { SDK_VERSION } from '@sentry/cloudflare';
import { WebSocket } from 'ws';

test('Index page', async ({ baseURL }) => {
  const result = await fetch(baseURL!);
  expect(result.status).toBe(200);
  await expect(result.text()).resolves.toBe('Hello World!');
});

test("worker's withSentry", async ({ baseURL }) => {
  const eventWaiter = waitForError('cloudflare-workers', event => {
    return event.exception?.values?.[0]?.mechanism?.type === 'auto.http.cloudflare';
  });
  const response = await fetch(`${baseURL}/throwException`);
  expect(response.status).toBe(500);
  const event = await eventWaiter;
  expect(event.exception?.values?.[0]?.value).toBe('To be recorded in Sentry.');
});

test('RPC method which throws an exception to be logged to sentry', async ({ baseURL }) => {
  const eventWaiter = waitForError('cloudflare-workers', event => {
    return event.exception?.values?.[0]?.mechanism?.type === 'auto.faas.cloudflare.durable_object';
  });
  const response = await fetch(`${baseURL}/rpc/throwException`);
  expect(response.status).toBe(500);
  const event = await eventWaiter;
  expect(event.exception?.values?.[0]?.value).toBe('Should be recorded in Sentry.');
});

test("Request processed by DurableObject's fetch is recorded", async ({ baseURL }) => {
  const eventWaiter = waitForError('cloudflare-workers', event => {
    return event.exception?.values?.[0]?.mechanism?.type === 'auto.faas.cloudflare.durable_object';
  });
  const response = await fetch(`${baseURL}/pass-to-object/throwException`);
  expect(response.status).toBe(500);
  const event = await eventWaiter;
  expect(event.exception?.values?.[0]?.value).toBe('Should be recorded in Sentry.');
});

test('Websocket.webSocketMessage', async ({ baseURL }) => {
  const eventWaiter = waitForError('cloudflare-workers', event => {
    return !!event.exception?.values?.[0];
  });
  const url = new URL('/pass-to-object/ws', baseURL);
  url.protocol = url.protocol.replace('http', 'ws');
  const socket = new WebSocket(url.toString());
  socket.addEventListener('open', () => {
    socket.send('throwException');
  });
  const event = await eventWaiter;
  socket.close();
  expect(event.exception?.values?.[0]?.value).toBe('Should be recorded in Sentry: webSocketMessage');
  expect(event.exception?.values?.[0]?.mechanism?.type).toBe('auto.faas.cloudflare.durable_object');
});

test('Websocket.webSocketClose', async ({ baseURL }) => {
  const eventWaiter = waitForError('cloudflare-workers', event => {
    return !!event.exception?.values?.[0];
  });
  const url = new URL('/pass-to-object/ws', baseURL);
  url.protocol = url.protocol.replace('http', 'ws');
  const socket = new WebSocket(url.toString());
  socket.addEventListener('open', () => {
    socket.send('throwOnExit');
    socket.close();
  });
  const event = await eventWaiter;
  expect(event.exception?.values?.[0]?.value).toBe('Should be recorded in Sentry: webSocketClose');
  expect(event.exception?.values?.[0]?.mechanism?.type).toBe('auto.faas.cloudflare.durable_object');
});

test('sends user-agent header with SDK name and version in envelope requests', async ({ baseURL }) => {
  const requestPromise = waitForRequest('cloudflare-workers', () => true);

  await fetch(`${baseURL}/throwException`);

  const request = await requestPromise;

  expect(request.rawProxyRequestHeaders).toMatchObject({
    'user-agent': `sentry.javascript.cloudflare/${SDK_VERSION}`,
  });
});

test.only('waitUntil', async ({ baseURL }) => {
  const errorWaiter = waitForError(
    'cloudflare-workers',
    event => event.exception?.values?.[0]?.value === 'ʕノ•ᴥ•ʔノ ︵ ┻━┻',
  );
  const httpTransactionWaiter = waitForTransaction(
    'cloudflare-workers',
    transactionEvent => transactionEvent.contexts?.trace?.op === 'http.server',
  );

  const response = await fetch(`${baseURL}/waitUntil`);

  expect(response.status).toBe(200);

  const [errorEvent, transactionEvent] = await Promise.all([errorWaiter, httpTransactionWaiter]);

  // ===== Error Event Assertions =====
  expect(errorEvent.exception?.values?.[0]).toMatchObject({
    type: 'Error',
    value: 'ʕノ•ᴥ•ʔノ ︵ ┻━┻',
    mechanism: {
      type: 'generic',
      handled: true,
    },
  });

  // Error should have trace context linking it to the transaction
  expect(errorEvent.contexts?.trace?.trace_id).toBeDefined();
  expect(errorEvent.contexts?.trace?.span_id).toBeDefined();

  // Error should have cloudflare-specific contexts
  expect(errorEvent.contexts?.cloud_resource).toEqual({ 'cloud.provider': 'cloudflare' });
  expect(errorEvent.contexts?.runtime).toEqual({ name: 'cloudflare' });

  // Error should have request data
  expect(errorEvent.request).toMatchObject({
    method: 'GET',
    url: expect.stringContaining('/waitUntil'),
  });

  // Error should have console breadcrumbs from before the error
  expect(errorEvent.breadcrumbs).toEqual([
    expect.objectContaining({ category: 'console', message: 'waitUntil called' }),
    expect.objectContaining({ category: 'console', message: 'ʕっ•ᴥ•ʔっ' }),
  ]);

  // ===== Transaction Event Assertions =====
  expect(transactionEvent.transaction).toBe('GET /waitUntil');
  expect(transactionEvent.type).toBe('transaction');
  expect(transactionEvent.transaction_info?.source).toBe('url');

  // Transaction trace context (root span - no status/response code, those are on the fetch child span)
  expect(transactionEvent.contexts?.trace).toMatchObject({
    op: 'http.server',
    origin: 'auto.http.cloudflare',
    data: expect.objectContaining({
      'sentry.op': 'http.server',
      'sentry.origin': 'auto.http.cloudflare',
      'url.path': '/waitUntil',
    }),
  });

  expect(transactionEvent.contexts?.trace).not.toEqual(
    expect.objectContaining({
      status: 'ok',
      description: 'fetch',
      op: 'http.server',
      origin: 'auto.http.cloudflare',
      data: expect.objectContaining({
        'http.request.method': 'GET',
        'http.response.status_code': 200,
      }),
    }),
  );

  expect(transactionEvent.spans).toEqual([
    expect.objectContaining({
      description: 'waitUntil',
      op: 'cloudflare.wait_until',
      origin: 'manual',
      parent_span_id: transactionEvent.spans?.[0]?.span_id,
    }),
    expect.objectContaining({
      description: 'longRunningTask',
      origin: 'manual',
      parent_span_id: transactionEvent.spans?.[0]?.span_id,
    }),
  ]);

  // Transaction should have all console breadcrumbs including the one after the span completes
  expect(transactionEvent.breadcrumbs).toEqual([
    expect.objectContaining({ category: 'console', message: 'waitUntil called' }),
    expect.objectContaining({ category: 'console', message: 'ʕっ•ᴥ•ʔっ' }),
    expect.objectContaining({ category: 'console', message: ' /|\ ^._.^ /|\ ' }),
  ]);

  // ===== Cross-event Assertions =====
  // Error and transaction should share the same trace_id
  expect(transactionEvent.contexts?.trace?.trace_id).toBe(errorEvent.contexts?.trace?.trace_id);

  // The error's span_id should match the fetch span's span_id (error captured during waitUntil execution)
  expect(errorEvent.contexts?.trace?.span_id).toBe(transactionEvent.spans?.[0]?.span_id);
});
