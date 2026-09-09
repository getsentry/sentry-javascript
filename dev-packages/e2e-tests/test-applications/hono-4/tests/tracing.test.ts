import { expect, test } from '@playwright/test';
import { waitForStreamedSpan, getSpanOp } from '@sentry-internal/test-utils';
import { APP_NAME, RUNTIME } from './constants';

test('sends a span for the index route', async ({ baseURL }) => {
  const segmentPromise = waitForStreamedSpan(
    APP_NAME,
    segment => segment.is_segment && getSpanOp(segment) === 'http.server' && segment.name === 'GET /',
  );

  const response = await fetch(`${baseURL}/`);
  expect(response.status).toBe(200);

  const segment = await segmentPromise;
  expect(segment.name).toBe('GET /');
  expect(getSpanOp(segment)).toBe('http.server');
});

test('sends a span for a parameterized route', async ({ baseURL }) => {
  const segmentPromise = waitForStreamedSpan(
    APP_NAME,
    segment => segment.is_segment && getSpanOp(segment) === 'http.server' && !!segment.name?.includes('/test-param/'),
  );

  const response = await fetch(`${baseURL}/test-param/123`);
  expect(response.status).toBe(200);

  const segment = await segmentPromise;
  expect(segment.name).toBe('GET /test-param/:paramId');
  expect(getSpanOp(segment)).toBe('http.server');
});

test('attaches HTTP connection info to the server span', async ({ baseURL, page }) => {
  page.on('console', msg => {
    console.log(`PAGE LOG: ${msg.text()}`);
  });
  const segmentPromise = waitForStreamedSpan(
    APP_NAME,
    segment => segment.is_segment && getSpanOp(segment) === 'http.server' && segment.name === 'GET /',
  );

  const response = await fetch(`${baseURL}/`);
  expect(response.status).toBe(200);

  const segment = await segmentPromise;
  const data = segment.attributes ?? {};

  expect(data['client.address']?.value).toEqual(expect.any(String));
  expect(data['network.peer.address']?.value).toBe(data['client.address']?.value);

  if (RUNTIME !== 'deno') {
    // Only exposed in `hono/deno`
    expect(data['network.transport']?.value).toBeUndefined();
  } else {
    expect(data['network.transport']?.value).toMatch(/tcp/);
  }

  if (RUNTIME === 'node' || RUNTIME === 'bun') {
    // Node (@hono/node-server) and Bun expose socket-level port and address family.
    expect(data['client.port']?.value).toEqual(expect.any(Number));
    expect(data['network.peer.port']?.value).toBe(data['client.port']?.value);
    expect(data['network.type']?.value).toMatch(/^ipv[46]$/);
  } else if (RUNTIME === 'deno') {
    expect(data['client.port']?.value).toEqual(expect.any(Number));
    expect(data['network.peer.port']?.value).toBe(data['client.port']?.value);
  } else if (RUNTIME === 'cloudflare') {
    // Cloudflare Workers expose no port, address family, or transport.
    // This could change in the future and checking for the absence of these fields allows us to notice if/when that happens.
    expect(data['client.port']?.value).toBeUndefined();
    expect(data['network.peer.port']?.value).toBeUndefined();
    expect(data['network.type']?.value).toBeUndefined();
  } else {
    throw new Error(`No tests for runtime: ${RUNTIME}`);
  }
});

// Regression guard against connection info attributes.
// The conninfo middleware must only *add* attributes, never replace or clear existing ones.
// These are the baseline attributes the server transaction carries *without* the conninfo feature
test("preserves the baseline server.*, client.* and network.* server span attributes that the SDK sends without Hono's conninfo", async ({
  baseURL,
}) => {
  const segmentPromise = waitForStreamedSpan(
    APP_NAME,
    segment => segment.is_segment && getSpanOp(segment) === 'http.server' && segment.name === 'GET /',
  );

  const response = await fetch(`${baseURL}/`);
  expect(response.status).toBe(200);

  const segment = await segmentPromise;
  const data = segment.attributes ?? {};

  if (RUNTIME === 'node') {
    expect(data['server.address']?.value).toBe('localhost');
    expect(data['server.port']?.value).toBe(Number(new URL(baseURL!).port));
    expect(data['client.address']?.value).toEqual(expect.any(String));
    expect(data['client.port']?.value).toEqual(expect.any(Number));
    expect(data['network.type']?.value).toMatch(/^ipv[46]$/);
    expect(data['network.protocol.name']?.value).toBe('http');
    expect(data['network.protocol.version']?.value).toBe('1.1');
    expect(data['network.transport']?.value).toBeUndefined();
    expect(data['network.local.port']?.value).toBe(data['server.port']?.value);
    expect(data['network.local.address']?.value).toEqual(expect.any(String));
    expect(data['network.peer.address']?.value).toBe(data['client.address']?.value);
    expect(data['network.peer.port']?.value).toBe(data['client.port']?.value);
  } else if (RUNTIME === 'bun') {
    expect(data['client.address']?.value).toEqual(expect.any(String));
    expect(data['client.port']?.value).toEqual(expect.any(Number));
    expect(data['network.peer.address']?.value).toBe(data['client.address']?.value);
    expect(data['network.peer.port']?.value).toBe(data['client.port']?.value);
    expect(data['network.type']?.value).toMatch(/^ipv[46]$/);
  } else if (RUNTIME === 'cloudflare') {
    expect(data['server.address']?.value).toBe('localhost');
    expect(data['client.address']?.value).toBe('::1');
    expect(data['network.peer.address']?.value).toBe(data['client.address']?.value);
    expect(data['network.protocol.name']?.value).toBe('http');
    expect(data['network.protocol.version']?.value).toBe('1.1');
  } else if (RUNTIME === 'deno') {
    expect(data['server.address']?.value).toBe('localhost');
    expect(data['client.address']?.value).toEqual(expect.any(String));
    expect(data['client.port']?.value).toEqual(expect.any(Number));
    expect(data['network.peer.address']?.value).toBe(data['client.address']?.value);
    expect(data['network.peer.port']?.value).toBe(data['client.port']?.value);
    expect(data['network.transport']?.value).toBe('tcp');
    expect(data['network.protocol.name']?.value).toBe('http');
  } else {
    throw new Error(`No tests for runtime: ${RUNTIME}`);
  }
});

test('sends a span for a route that throws', async ({ baseURL }) => {
  const segmentPromise = waitForStreamedSpan(
    APP_NAME,
    segment => segment.is_segment && getSpanOp(segment) === 'http.server' && !!segment.name?.includes('/error/'),
  );

  await fetch(`${baseURL}/error/test-cause`);

  const segment = await segmentPromise;
  expect(segment.name).toBe('GET /error/:cause');
  expect(getSpanOp(segment)).toBe('http.server');
  expect(segment?.status).toBe('error');
});
