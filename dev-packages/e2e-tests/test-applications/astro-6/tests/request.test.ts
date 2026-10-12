import { expect, test } from '@playwright/test';
import { collectStreamedSpansUntilSegment, getSpanOp, waitForError } from '@sentry-internal/test-utils';
import { APP_NAME } from './constants';

const TRACE_ID = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const PARENT_SPAN_ID = 'bbbbbbbbbbbbbbbb';

test('names the request span of an endpoint after the parameterized route', async ({ request }) => {
  const spansPromise = collectStreamedSpansUntilSegment(APP_NAME, 'GET /api/user/[userId].json');

  const response = await request.get('/api/user/42.json');
  expect(await response.json()).toEqual({ greeting: 'Hello 42', userId: '42' });

  const segmentSpan = (await spansPromise).find(span => span.is_segment)!;
  expect(segmentSpan.status).toBe('ok');
  expect(segmentSpan.attributes).toMatchObject({
    'sentry.op': { type: 'string', value: 'http.server' },
    'sentry.origin': { type: 'string', value: 'auto.http.astro' },
    'sentry.segment.name.source': { type: 'string', value: 'route' },
    'http.request.method': { type: 'string', value: 'GET' },
    'http.response.status_code': { type: 'integer', value: 200 },
    'http.route': { type: 'string', value: '/api/user/[userId].json' },
    'url.path': { type: 'string', value: '/api/user/42.json' },
    'url.full': { type: 'string', value: 'http://localhost:3030/api/user/42.json' },
  });
});

test('keeps the scope data of concurrent requests apart', async ({ request }) => {
  const tags = ['alpha', 'beta', 'gamma'];
  const errorPromises = tags.map(tag =>
    waitForError(APP_NAME, event => event.exception?.values?.[0]?.value === `Isolation error ${tag}`),
  );

  await Promise.all(tags.map(tag => request.get(`/isolation?tag=${tag}`)));

  const errors = await Promise.all(errorPromises);
  errors.forEach((error, index) => {
    expect(error.tags?.['isolation-tag']).toBe(tags[index]);
  });

  const traceIds = errors.map(error => error.contexts?.trace?.trace_id);
  expect(new Set(traceIds).size).toBe(tags.length);
});

test('continues the trace of an incoming request', async ({ request }) => {
  const spansPromise = collectStreamedSpansUntilSegment(
    APP_NAME,
    span => span.name === 'GET /test-ssr' && span.trace_id === TRACE_ID,
  );

  await request.get('/test-ssr', {
    headers: {
      'sentry-trace': `${TRACE_ID}-${PARENT_SPAN_ID}-1`,
      baggage: `sentry-trace_id=${TRACE_ID},sentry-environment=qa,sentry-public_key=public,sentry-sampled=true`,
    },
  });

  const segmentSpan = (await spansPromise).find(span => span.is_segment)!;
  expect(getSpanOp(segmentSpan)).toBe('http.server');
  expect(segmentSpan.trace_id).toBe(TRACE_ID);
  expect(segmentSpan.parent_span_id).toBe(PARENT_SPAN_ID);
});

test('propagates the trace to an outgoing fetch request', async ({ request }) => {
  const spansPromise = collectStreamedSpansUntilSegment(APP_NAME, 'GET /outgoing-fetch');

  const response = await request.get('/outgoing-fetch');
  const receivedHeaders = (await response.json()) as { sentryTrace: string | null; baggage: string | null };

  const spans = await spansPromise;
  const segmentSpan = spans.find(span => span.is_segment)!;
  const fetchSpan = spans.find(
    span => getSpanOp(span) === 'http.client' && String(span.attributes['url.full']?.value).endsWith('/api/headers'),
  );

  expect(fetchSpan).toBeDefined();
  expect(fetchSpan!.trace_id).toBe(segmentSpan.trace_id);
  expect(fetchSpan!.attributes['http.request.method']).toEqual({ type: 'string', value: 'GET' });

  expect(receivedHeaders.sentryTrace).toBe(`${segmentSpan.trace_id}-${fetchSpan!.span_id}-1`);
  expect(receivedHeaders.baggage).toContain(`sentry-trace_id=${segmentSpan.trace_id}`);
  expect(receivedHeaders.baggage).toContain('sentry-environment=qa');
});
