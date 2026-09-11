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
  const spanPromise = waitForStreamedSpan('cloudflare-workersentrypoint', span => {
    return getSpanOp(span) === 'http.server' && span.is_segment;
  });

  await fetch(baseURL!);

  const span = await spanPromise;

  // The root path is a low-cardinality route, so the span keeps the full `GET /` name under streaming.
  expect(span.name).toBe('GET /');
  expect(span.trace_id).toMatch(/[a-f0-9]{32}/);
  expect(span.status).toBe('ok');
  expect(span.attributes['sentry.segment.name.source']?.value).toBe('route');
});

test("worker's withSentry", async ({ baseURL }) => {
  const eventWaiter = waitForError('cloudflare-workersentrypoint', event => {
    return event.exception?.values?.[0]?.mechanism?.type === 'auto.http.cloudflare';
  });
  const response = await fetch(`${baseURL}/throwException`);
  expect(response.status).toBe(500);
  const event = await eventWaiter;
  expect(event.exception?.values?.[0]?.value).toBe('To be recorded in Sentry.');
});

test('RPC method which throws an exception to be logged to sentry', async ({ baseURL }) => {
  const eventWaiter = waitForError('cloudflare-workersentrypoint', event => {
    return event.exception?.values?.[0]?.mechanism?.type === 'auto.faas.cloudflare.durable_object';
  });
  const response = await fetch(`${baseURL}/rpc/throwException`);
  expect(response.status).toBe(500);
  const event = await eventWaiter;
  expect(event.exception?.values?.[0]?.value).toBe('Should be recorded in Sentry.');
});

test("Request processed by DurableObject's fetch is recorded", async ({ baseURL }) => {
  const eventWaiter = waitForError('cloudflare-workersentrypoint', event => {
    return event.exception?.values?.[0]?.mechanism?.type === 'auto.faas.cloudflare.durable_object';
  });
  const response = await fetch(`${baseURL}/pass-to-object/throwException`);
  expect(response.status).toBe(500);
  const event = await eventWaiter;
  expect(event.exception?.values?.[0]?.value).toBe('Should be recorded in Sentry.');
});

test('Websocket.webSocketMessage', async ({ baseURL }) => {
  const eventWaiter = waitForError('cloudflare-workersentrypoint', event => {
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
  const eventWaiter = waitForError('cloudflare-workersentrypoint', event => {
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
  const requestPromise = waitForRequest('cloudflare-workersentrypoint', () => true);

  await fetch(`${baseURL}/throwException`);

  const request = await requestPromise;

  expect(request.rawProxyRequestHeaders['user-agent']).toBe(`sentry.javascript.cloudflare/${SDK_VERSION}`);
});

test('Storage operations create spans in Durable Object', async ({ baseURL }) => {
  const spansPromise = waitForStreamedSpans('cloudflare-workersentrypoint', spans => {
    return spans.some(span => span.name === 'durable_object_storage_put' && getSpanOp(span) === 'db');
  });

  const response = await fetch(`${baseURL}/pass-to-object/storage/put`);
  expect(response.status).toBe(200);

  const spans = await spansPromise;
  const putSpan = spans.find(span => span.name === 'durable_object_storage_put' && getSpanOp(span) === 'db');

  expect(putSpan).toBeDefined();
  expect(putSpan?.attributes['db.system.name']?.value).toBe('cloudflare.durable_object.storage');
  expect(putSpan?.attributes['db.operation.name']?.value).toBe('put');
});
