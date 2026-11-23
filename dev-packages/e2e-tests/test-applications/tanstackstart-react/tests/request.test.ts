import { expect, test } from '@playwright/test';
import { collectStreamedSpansUntilSegment, getSpanOp, waitForError } from '@sentry-internal/test-utils';
import {
  HTTP_REQUEST_METHOD,
  HTTP_RESPONSE_STATUS_CODE,
  HTTP_ROUTE,
  SENTRY_OP,
  SENTRY_ORIGIN,
  SENTRY_SEGMENT_NAME_SOURCE,
  URL_PATH,
} from '@sentry/conventions/attributes';
import { HTTP_CLIENT, HTTP_SERVER } from '@sentry/conventions/op';
import type { IncomingHttpHeaders } from 'node:http';
import { createServer } from 'node:http';
import { RUNTIME } from './constants';

const TRACE_ID = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const PARENT_SPAN_ID = 'bbbbbbbbbbbbbbbb';

// Nitro serves with `node:http` on Node and Deno, and with `Bun.serve` on Bun.
const SERVER_ORIGINS = {
  node: 'auto.http.http_server',
  bun: 'auto.http.bun.serve',
  deno: 'auto.http.http_server',
  cloudflare: 'auto.http.cloudflare',
};

test('Sends an http.server span named after the parameterized route', async ({ baseURL }) => {
  const spansPromise = collectStreamedSpansUntilSegment('tanstackstart-react', 'GET /api/user/$id');

  const response = await fetch(`${baseURL}/api/user/123`);
  expect(await response.json()).toEqual({ id: '123' });

  const segmentSpan = (await spansPromise).find(span => span.is_segment)!;
  expect(segmentSpan.status).toBe('ok');
  expect(segmentSpan.attributes).toMatchObject({
    [SENTRY_OP]: { type: 'string', value: HTTP_SERVER },
    [SENTRY_ORIGIN]: { type: 'string', value: SERVER_ORIGINS[RUNTIME] },
    [SENTRY_SEGMENT_NAME_SOURCE]: { type: 'string', value: 'route' },
    [HTTP_ROUTE]: { type: 'string', value: '/api/user/$id' },
    [HTTP_REQUEST_METHOD]: { type: 'string', value: 'GET' },
    [HTTP_RESPONSE_STATUS_CODE]: { type: 'integer', value: 200 },
    [URL_PATH]: { type: 'string', value: '/api/user/123' },
    'sentry.kind': { type: 'string', value: 'server' },
  });
});

test('Keeps the scope data of concurrent requests apart', async ({ baseURL }) => {
  const requests = [
    { tag: 'alpha', traceId: 'a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1' },
    { tag: 'beta', traceId: 'b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2' },
    { tag: 'gamma', traceId: 'c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3' },
  ];
  const errorPromises = requests.map(({ tag }) =>
    waitForError('tanstackstart-react', event => event.exception?.values?.[0]?.value === `Isolation error ${tag}`),
  );
  const spansPromises = requests.map(({ traceId }) =>
    collectStreamedSpansUntilSegment(
      'tanstackstart-react',
      span => span.name === 'GET /api/isolation' && span.trace_id === traceId,
    ),
  );

  await Promise.all(
    requests.map(({ tag, traceId }) =>
      fetch(`${baseURL}/api/isolation?tag=${tag}`, {
        headers: { 'sentry-trace': `${traceId}-${PARENT_SPAN_ID}-1` },
      }),
    ),
  );

  const errors = await Promise.all(errorPromises);
  const spansOfRequests = await Promise.all(spansPromises);
  errors.forEach((error, index) => {
    const segmentSpan = spansOfRequests[index]!.find(span => span.is_segment)!;
    expect(segmentSpan.attributes).toMatchObject({
      [SENTRY_SEGMENT_NAME_SOURCE]: { type: 'string', value: 'route' },
      [HTTP_ROUTE]: { type: 'string', value: '/api/isolation' },
    });
    expect(error.tags?.['isolation-tag']).toBe(requests[index]!.tag);
    expect(error.contexts?.trace?.trace_id).toBe(segmentSpan.trace_id);
  });
});

test('Keeps the scope data of an SSR request out of the next request on the same connection', async ({ request }) => {
  // On Deno, `node:http` starts the next request on a keep-alive connection in the async context of the SSR request
  // before it, so the scopes of the new request are cloned from the scopes of the SSR request.
  test.fail(RUNTIME === 'deno', 'Deno starts the next request in the async context of the SSR request');

  const errorPromise = waitForError(
    'tanstackstart-react',
    event => event.exception?.values?.[0]?.value === 'Isolation error after-ssr',
  );

  await request.get('/isolation-ssr');
  await request.get('/api/isolation?tag=after-ssr');

  const error = await errorPromise;
  expect(error.tags?.['isolation-tag']).toBe('after-ssr');
  expect(error.tags?.['ssr-tag']).toBeUndefined();
});

test('Continues the trace of an incoming request', async ({ baseURL }) => {
  const spansPromise = collectStreamedSpansUntilSegment(
    'tanstackstart-react',
    span => span.name === 'GET /api/user/$id' && span.trace_id === TRACE_ID,
  );

  await fetch(`${baseURL}/api/user/continued`, {
    headers: {
      'sentry-trace': `${TRACE_ID}-${PARENT_SPAN_ID}-1`,
      baggage: `sentry-trace_id=${TRACE_ID},sentry-environment=qa,sentry-public_key=public,sentry-sampled=true`,
    },
  });

  const segmentSpan = (await spansPromise).find(span => span.is_segment)!;
  expect(segmentSpan.trace_id).toBe(TRACE_ID);
  expect(segmentSpan.parent_span_id).toBe(PARENT_SPAN_ID);
});

test('Propagates the trace to an outgoing fetch request', async ({ baseURL }) => {
  let receivedHeaders: IncomingHttpHeaders | undefined;
  const server = createServer((req, res) => {
    receivedHeaders = req.headers;
    res.end('ok');
  });
  await new Promise<void>(resolve => server.listen(3040, resolve));

  try {
    const spansPromise = collectStreamedSpansUntilSegment(
      'tanstackstart-react',
      'GET /api/outgoing-fetch',
      span => getSpanOp(span) === HTTP_CLIENT,
    );

    const response = await fetch(`${baseURL}/api/outgoing-fetch`);
    expect(await response.json()).toEqual({ status: 200 });

    const spans = await spansPromise;
    const segmentSpan = spans.find(span => span.is_segment)!;
    const fetchSpan = spans.find(span => getSpanOp(span) === HTTP_CLIENT)!;

    expect(fetchSpan.trace_id).toBe(segmentSpan.trace_id);
    expect(fetchSpan.attributes[HTTP_REQUEST_METHOD]).toEqual({ type: 'string', value: 'GET' });

    expect(receivedHeaders?.['sentry-trace']).toBe(`${segmentSpan.trace_id}-${fetchSpan.span_id}-1`);
    expect(receivedHeaders?.baggage).toContain(`sentry-trace_id=${segmentSpan.trace_id}`);
    expect(receivedHeaders?.baggage).toContain('sentry-environment=qa');
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});
