import { expect, test } from '@playwright/test';
import { waitForError } from '@sentry-internal/test-utils';
import { WebSocket } from 'ws';

test('Index page', async ({ baseURL }) => {
  const result = await fetch(baseURL!);
  expect(result.status).toBe(200);
  await expect(result.text()).resolves.toBe('Hello World!');
});

test("worker's withSentry", async ({ baseURL }) => {
  const eventWaiter = waitForError('cloudflare-workers', event => {
    return event.exception?.values?.[0]?.mechanism?.type === 'cloudflare';
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
  console.log('xx Request processed by DurableObject');
  const eventWaiter = waitForError('cloudflare-workers', event => {
    return event.exception?.values?.[0]?.mechanism?.type === 'cloudflare_durableobject';
  });
  const response = await fetch(`${baseURL}/pass-to-object/throwException`);
  expect(response.status).toBe(500);
  const event = await eventWaiter;
  expect(event.exception?.values?.[0]?.value).toBe('Should be recorded in Sentry.');
});

test('Websocket.webSocketMessage', async ({ baseURL }) => {
  const eventWaiter = waitForError('cloudflare-workers', event => {
    return event.exception?.values?.[0]?.mechanism?.type === 'cloudflare_durableobject';
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
});

test('Websocket.webSocketClose', async ({ baseURL }) => {
  const eventWaiter = waitForError('cloudflare-workers', event => {
    return event.exception?.values?.[0]?.mechanism?.type === 'auto.faas.cloudflare.durable_object';
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
});
