import { expect, test } from '@playwright/test';
import { waitForStreamedSpan, getSpanOp } from '@sentry-internal/test-utils';
import { randomBytes } from 'node:crypto';
import { APP_NAME, RUNTIME, type Runtime } from './constants';

const anyString = expect.any(String) as unknown;
const anyNumber = expect.any(Number) as unknown;
const ipvType = expect.stringMatching(/^ipv[46]$/) as unknown;

// Per-runtime `http.server` connection-info expectations. Each runtime exposes
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
    added: {
      'client.address': anyString,
      'client.port': anyNumber,
      'network.type': ipvType,
      'network.transport': 'tcp',
    },
    baseline: {
      'server.address': 'localhost',
      'server.port': anyNumber,
      'client.port': anyNumber,
      'network.type': ipvType,
      'network.protocol.name': 'http',
      'network.protocol.version': '1.1',
      'network.transport': 'tcp',
      'network.local.address': anyString,
      'network.local.port': anyNumber,
    },
  },
  bun: {
    added: {
      'client.address': anyString,
      'client.port': anyNumber,
      'network.type': ipvType,
      'network.transport': undefined,
    },
    baseline: { 'client.port': anyNumber, 'network.type': ipvType },
  },
  deno: {
    // `network.transport` comes from Deno's `remoteAddr`.
    added: { 'client.address': anyString, 'client.port': anyNumber, 'network.transport': expect.stringMatching(/tcp/) },
    baseline: {
      'server.address': 'localhost',
      'client.port': anyNumber,
      'network.transport': 'tcp',
      'network.protocol.name': 'http',
    },
  },
  cloudflare: {
    // Workers give only the client address (the `cf-connecting-ip` header).
    added: {
      'client.address': anyString,
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

test('continues the trace of an incoming request', async ({ baseURL }) => {
  const traceId = randomBytes(16).toString('hex');
  const parentSpanId = randomBytes(8).toString('hex');
  const segmentPromise = waitForStreamedSpan(
    APP_NAME,
    span => span.is_segment && span.name === 'GET /test-param/:paramId' && span.trace_id === traceId,
  );

  const response = await fetch(`${baseURL}/test-param/continued`, {
    headers: {
      'sentry-trace': `${traceId}-${parentSpanId}-1`,
      baggage: `sentry-trace_id=${traceId},sentry-public_key=username,sentry-sampled=true`,
    },
  });
  expect(response.status).toBe(200);

  expect(await segmentPromise).toMatchObject({ trace_id: traceId, parent_span_id: parentSpanId });
});

test('propagates the trace to an outgoing fetch request', async ({ baseURL }) => {
  const downstreamUrl = `${baseURL}/test-trace-headers`;
  const segmentPromise = waitForStreamedSpan(
    APP_NAME,
    span => span.is_segment && span.name === 'GET /test-outgoing-fetch',
  );
  const fetchSpanPromise = waitForStreamedSpan(
    APP_NAME,
    span => getSpanOp(span) === 'http.client' && span.attributes['url.full']?.value === downstreamUrl,
  );

  const response = await fetch(`${baseURL}/test-outgoing-fetch`);
  expect(response.status).toBe(200);
  const headers = await response.json();

  const [segment, fetchSpan] = await Promise.all([segmentPromise, fetchSpanPromise]);
  expect(fetchSpan.trace_id).toBe(segment.trace_id);
  expect(fetchSpan.parent_span_id).toBe(segment.span_id);
  expect(headers.sentryTrace).toBe(`${segment.trace_id}-${fetchSpan.span_id}-1`);
  expect(headers.baggage).toContain(`sentry-trace_id=${segment.trace_id}`);
  expect(headers.baggage).toContain('sentry-environment=qa');
});

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
