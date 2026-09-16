import { expect, test } from '@playwright/test';
import { waitForStreamedSpan, getSpanOp } from '@sentry-internal/test-utils';
import { APP_NAME, RUNTIME, type Runtime } from './constants';

const anyString = expect.any(String) as unknown;
const anyNumber = expect.any(Number) as unknown;
const ipvType = expect.stringMatching(/^ipv[46]$/) as unknown;

// Per-runtime `http.server` connection-info expectations. Each runtime's `getConnInfo` helper exposes
// a different set of fields, so the expected attribute values are declared here once (keyed by
// runtime) instead of branching inside the tests. `undefined` means the attribute must be absent.
// Relational checks (`network.peer.*` mirroring `client.*`) are asserted in the tests, since they
// hold on every runtime (including when both sides are absent).
//
// - `added`: attributes Hono's conninfo middleware contributes.
// - `baseline`: attributes the SDK sends independent of conninfo (regression guard that conninfo only
//   adds, never clobbers).
const CONN_INFO: Record<Runtime, { added: Record<string, unknown>; baseline: Record<string, unknown> }> = {
  node: {
    added: { 'client.address': anyString, 'client.port': anyNumber, 'network.type': ipvType, 'network.transport': undefined },
    baseline: {
      'server.address': 'localhost',
      'server.port': anyNumber,
      'client.port': anyNumber,
      'network.type': ipvType,
      'network.protocol.name': 'http',
      'network.protocol.version': '1.1',
      'network.transport': undefined,
      'network.local.address': anyString,
      'network.local.port': anyNumber,
    },
  },
  bun: {
    added: { 'client.address': anyString, 'client.port': anyNumber, 'network.type': ipvType, 'network.transport': undefined },
    baseline: { 'client.port': anyNumber, 'network.type': ipvType },
  },
  deno: {
    // Only `hono/deno` exposes `network.transport`.
    added: { 'client.address': anyString, 'client.port': anyNumber, 'network.transport': expect.stringMatching(/tcp/) },
    baseline: {
      'server.address': 'localhost',
      'client.port': anyNumber,
      'network.transport': 'tcp',
      'network.protocol.name': 'http',
    },
  },
  cloudflare: {
    // Cloudflare Workers expose no client address, port, address family, or transport: there is no
    // `getConnInfo` on Workers and nothing else populates `client.address`, so all of these are
    // absent. Asserting `undefined` here lets us notice if that ever changes.
    added: {
      'client.address': undefined,
      'client.port': undefined,
      'network.type': undefined,
      'network.transport': undefined,
    },
    baseline: {
      'server.address': 'localhost',
      'network.protocol.name': 'http',
      'network.protocol.version': '1.1',
    },
  },
};

const connInfo = CONN_INFO[RUNTIME];

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

  for (const [key, expected] of Object.entries(connInfo.added)) {
    expect(data[key]?.value).toEqual(expected);
  }

  // conninfo must only *add* attributes, never replace: peer mirrors client on every runtime
  // (including when both are absent).
  expect(data['network.peer.address']?.value).toBe(data['client.address']?.value);
  expect(data['network.peer.port']?.value).toBe(data['client.port']?.value);
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

  for (const [key, expected] of Object.entries(connInfo.baseline)) {
    expect(data[key]?.value).toEqual(expected);
  }

  // Relational checks that hold on every runtime (both sides absent → still equal).
  expect(data['network.peer.address']?.value).toBe(data['client.address']?.value);
  expect(data['network.peer.port']?.value).toBe(data['client.port']?.value);
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
