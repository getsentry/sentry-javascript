import { expect, test } from '@playwright/test';
import { waitForTransaction } from '@sentry-internal/test-utils';
import { APP_NAME, RUNTIME } from './constants';

test('sends a transaction for the index route', async ({ baseURL }) => {
  const transactionPromise = waitForTransaction(APP_NAME, event => {
    return event.contexts?.trace?.op === 'http.server' && event.transaction === 'GET /';
  });

  const response = await fetch(`${baseURL}/`);
  expect(response.status).toBe(200);

  const transaction = await transactionPromise;
  expect(transaction.transaction).toBe('GET /');
  expect(transaction.contexts?.trace?.op).toBe('http.server');
});

test('sends a transaction for a parameterized route', async ({ baseURL }) => {
  const transactionPromise = waitForTransaction(APP_NAME, event => {
    return event.contexts?.trace?.op === 'http.server' && !!event.transaction?.includes('/test-param/');
  });

  const response = await fetch(`${baseURL}/test-param/123`);
  expect(response.status).toBe(200);

  const transaction = await transactionPromise;
  expect(transaction.transaction).toBe('GET /test-param/:paramId');
  expect(transaction.contexts?.trace?.op).toBe('http.server');
});

test('attaches HTTP connection info to the server transaction', async ({ baseURL, page }) => {
  page.on('console', msg => {
    console.log(`PAGE LOG: ${msg.text()}`);
  });
  const transactionPromise = waitForTransaction(APP_NAME, event => {
    return event.contexts?.trace?.op === 'http.server' && event.transaction === 'GET /';
  });

  const response = await fetch(`${baseURL}/`);
  expect(response.status).toBe(200);

  const transaction = await transactionPromise;
  const data = transaction.contexts?.trace?.data ?? {};

  expect(data['client.address']).toEqual(expect.any(String));
  expect(data['network.peer.address']).toBe(data['client.address']);

  if (RUNTIME === 'node' || RUNTIME === 'bun') {
    // Node (@hono/node-server) and Bun expose socket-level port and address family.
    expect(data['client.port']).toEqual(expect.any(Number));
    expect(data['network.peer.port']).toBe(data['client.port']);
    expect(data['network.type']).toMatch(/^ipv[46]$/);
  } else {
    // Cloudflare Workers expose no port, address family, or transport.
    // This could change in the future and checking for the absence of these fields allows us to notice if/when that happens.
    expect(data['client.port']).toBeUndefined();
    expect(data['network.peer.port']).toBeUndefined();
    expect(data['network.type']).toBeUndefined();
  }

  // Only available in `hono/deno`
  expect(data['network.transport']).toBeUndefined();
});

test('sends a transaction for a route that throws', async ({ baseURL }) => {
  const transactionPromise = waitForTransaction(APP_NAME, event => {
    return event.contexts?.trace?.op === 'http.server' && !!event.transaction?.includes('/error/');
  });

  await fetch(`${baseURL}/error/test-cause`);

  const transaction = await transactionPromise;
  expect(transaction.transaction).toBe('GET /error/:cause');
  expect(transaction.contexts?.trace?.op).toBe('http.server');
  expect(transaction.contexts?.trace?.status).toBe('internal_error');
});
