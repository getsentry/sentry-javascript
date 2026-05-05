import { expect, test } from '@playwright/test';
import {
  getSpanOp,
  waitForError,
  waitForRequest,
  waitForStreamedSpan,
  waitForStreamedSpans,
} from '@sentry-internal/test-utils';
import { SDK_VERSION } from '@sentry/cloudflare';
import { WebSocket } from 'ws';

test('Index page', async ({ baseURL }) => {
  const result = await fetch(baseURL!);
  expect(result.status).toBe(200);
  await expect(result.text()).resolves.toBe('Hello World!');
});

test('Sends a streamed span for a basic request', async ({ baseURL }) => {
  const spanPromise = waitForStreamedSpan('cloudflare-workers-streaming', span => {
    return getSpanOp(span) === 'http.server' && span.is_segment;
  });

  await fetch(baseURL!);

  const span = await spanPromise;

  expect(span.trace_id).toMatch(/[a-f0-9]{32}/);
  expect(span.status).toBe('ok');
});

test("worker's withSentry", async ({ baseURL }) => {
  const eventWaiter = waitForError('cloudflare-workers-streaming', event => {
    return event.exception?.values?.[0]?.mechanism?.type === 'auto.http.cloudflare';
  });
  const response = await fetch(`${baseURL}/throwException`);
  expect(response.status).toBe(500);
  const event = await eventWaiter;
  expect(event.exception?.values?.[0]?.value).toBe('To be recorded in Sentry.');
});

test('RPC method which throws an exception to be logged to sentry', async ({ baseURL }) => {
  const eventWaiter = waitForError('cloudflare-workers-streaming', event => {
    return event.exception?.values?.[0]?.mechanism?.type === 'auto.faas.cloudflare.durable_object';
  });
  const response = await fetch(`${baseURL}/rpc/throwException`);
  expect(response.status).toBe(500);
  const event = await eventWaiter;
  expect(event.exception?.values?.[0]?.value).toBe('Should be recorded in Sentry.');
});

test("Request processed by DurableObject's fetch is recorded", async ({ baseURL }) => {
  const eventWaiter = waitForError('cloudflare-workers-streaming', event => {
    return event.exception?.values?.[0]?.mechanism?.type === 'auto.faas.cloudflare.durable_object';
  });
  const response = await fetch(`${baseURL}/pass-to-object/throwException`);
  expect(response.status).toBe(500);
  const event = await eventWaiter;
  expect(event.exception?.values?.[0]?.value).toBe('Should be recorded in Sentry.');
});

test('Websocket.webSocketMessage', async ({ baseURL }) => {
  const eventWaiter = waitForError('cloudflare-workers-streaming', event => {
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
  const eventWaiter = waitForError('cloudflare-workers-streaming', event => {
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
  const requestPromise = waitForRequest('cloudflare-workers-streaming', () => true);

  await fetch(`${baseURL}/throwException`);

  const request = await requestPromise;

  expect(request.rawProxyRequestHeaders).toMatchObject({
    'user-agent': `sentry.javascript.cloudflare/${SDK_VERSION}`,
  });
});

test('Storage operations create spans in Durable Object', async ({ baseURL }) => {
  const spansPromise = waitForStreamedSpans('cloudflare-workers-streaming', spans => {
    return spans.some(span => span.name === 'durable_object_storage_put' && getSpanOp(span) === 'db');
  });

  const response = await fetch(`${baseURL}/pass-to-object/storage/put`);
  expect(response.status).toBe(200);

  const spans = await spansPromise;
  const putSpan = spans.find(span => span.name === 'durable_object_storage_put' && getSpanOp(span) === 'db');

  expect(putSpan).toBeDefined();
  expect(putSpan?.attributes?.['db.system.name']?.value).toBe('cloudflare.durable_object.storage');
  expect(putSpan?.attributes?.['db.operation.name']?.value).toBe('put');
});

test.describe('Alarm instrumentation', () => {
  test.describe.configure({ mode: 'serial' });

  test('captures error from alarm handler', async ({ baseURL }) => {
    const errorWaiter = waitForError('cloudflare-workers-streaming', event => {
      return event.exception?.values?.[0]?.value === 'Alarm error captured by Sentry';
    });

    const response = await fetch(`${baseURL}/pass-to-object/setAlarm?action=throw`);
    expect(response.status).toBe(200);

    const event = await errorWaiter;
    expect(event.exception?.values?.[0]?.mechanism?.type).toBe('auto.faas.cloudflare.durable_object');
  });

  test('creates a streamed span for alarm with new trace linked to setAlarm', async ({ baseURL }) => {
    const setAlarmSpanPromise = waitForStreamedSpan('cloudflare-workers-streaming', span => {
      return span.name === 'durable_object_storage_setAlarm' && span.is_segment === false;
    });

    const alarmSpanPromise = waitForStreamedSpan('cloudflare-workers-streaming', span => {
      return span.name === 'alarm' && getSpanOp(span) === 'function' && span.is_segment;
    });

    const response = await fetch(`${baseURL}/pass-to-object/setAlarm`);
    expect(response.status).toBe(200);

    const setAlarmSpan = await setAlarmSpanPromise;
    const alarmSpan = await alarmSpanPromise;

    expect(getSpanOp(alarmSpan)).toBe('function');
    expect(alarmSpan.attributes?.['sentry.origin']?.value).toBe('auto.faas.cloudflare.durable_object');

    // Alarm starts a new trace (different trace ID from the request that called setAlarm)
    expect(alarmSpan.trace_id).not.toBe(setAlarmSpan.trace_id);

    // Alarm links to the trace that called setAlarm via sentry.previous_trace attribute
    const previousTrace = alarmSpan.attributes?.['sentry.previous_trace']?.value;
    expect(previousTrace).toBeDefined();
    expect(previousTrace).toContain(setAlarmSpan.trace_id);
  });
});
