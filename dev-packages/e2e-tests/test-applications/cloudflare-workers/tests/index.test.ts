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

test('Storage operations create spans in Durable Object transactions', async ({ baseURL }) => {
  const transactionWaiter = waitForTransaction('cloudflare-workers', event => {
    return event.spans?.some(span => span.op === 'db' && span.description === 'durable_object_storage_put') ?? false;
  });

  const response = await fetch(`${baseURL}/pass-to-object/storage/put`);
  expect(response.status).toBe(200);

  const transaction = await transactionWaiter;
  const putSpan = transaction.spans?.find(span => span.description === 'durable_object_storage_put');

  expect(putSpan).toBeDefined();
  expect(putSpan?.op).toBe('db');
  expect(putSpan?.data?.['db.system.name']).toBe('cloudflare.durable_object.storage');
  expect(putSpan?.data?.['db.operation.name']).toBe('put');
});

test.describe('Alarm instrumentation', () => {
  test.describe.configure({ mode: 'serial' });

  test('captures error from alarm handler', async ({ baseURL }) => {
    const errorWaiter = waitForError('cloudflare-workers', event => {
      return event.exception?.values?.[0]?.value === 'Alarm error captured by Sentry';
    });

    const response = await fetch(`${baseURL}/pass-to-object/setAlarm?action=throw`);
    expect(response.status).toBe(200);

    const event = await errorWaiter;
    expect(event.exception?.values?.[0]?.mechanism?.type).toBe('auto.faas.cloudflare.durable_object');
  });

  test('creates a transaction for alarm with new trace linked to setAlarm', async ({ baseURL }) => {
    const setAlarmTransactionWaiter = waitForTransaction('cloudflare-workers', event => {
      return event.spans?.some(span => span.description?.includes('storage_setAlarm')) ?? false;
    });

    const alarmTransactionWaiter = waitForTransaction('cloudflare-workers', event => {
      return event.transaction === 'alarm' && event.contexts?.trace?.op === 'function';
    });

    const response = await fetch(`${baseURL}/pass-to-object/setAlarm`);
    expect(response.status).toBe(200);

    const setAlarmTransaction = await setAlarmTransactionWaiter;
    const alarmTransaction = await alarmTransactionWaiter;

    // Alarm creates a transaction with correct attributes
    expect(alarmTransaction.contexts?.trace?.op).toBe('function');
    expect(alarmTransaction.contexts?.trace?.origin).toBe('auto.faas.cloudflare.durable_object');

    // Alarm starts a new trace (different trace ID from the request that called setAlarm)
    expect(alarmTransaction.contexts?.trace?.trace_id).not.toBe(setAlarmTransaction.contexts?.trace?.trace_id);

    // Alarm links to the trace that called setAlarm via sentry.previous_trace attribute
    const previousTrace = alarmTransaction.contexts?.trace?.data?.['sentry.previous_trace'];
    expect(previousTrace).toBeDefined();
    expect(previousTrace).toContain(setAlarmTransaction.contexts?.trace?.trace_id);
  });
});
