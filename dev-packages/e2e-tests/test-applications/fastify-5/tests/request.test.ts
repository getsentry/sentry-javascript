import { expect, test } from '@playwright/test';
import { collectStreamedSpansUntilSegment, waitForError } from '@sentry-internal/test-utils';

const TRACE_ID = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const PARENT_SPAN_ID = 'bbbbbbbbbbbbbbbb';

test('Names the request span after the parameterized route', async ({ baseURL }) => {
  const spansPromise = collectStreamedSpansUntilSegment('fastify-5', 'GET /test-param/:param');

  const response = await fetch(`${baseURL}/test-param/123`);
  expect(await response.json()).toEqual({ paramWas: '123' });

  const segmentSpan = (await spansPromise).find(span => span.is_segment)!;
  expect(segmentSpan.attributes).toMatchObject({
    'sentry.op': { type: 'string', value: 'http.server' },
    'sentry.segment.name.source': { type: 'string', value: 'route' },
    'http.route': { type: 'string', value: '/test-param/:param' },
    'url.path': { type: 'string', value: '/test-param/123' },
  });
});

test('Keeps the scope data of concurrent requests apart', async ({ baseURL }) => {
  const ids = ['1', '2', '3'];
  const errorPromises = ids.map(id =>
    waitForError('fastify-5', event => event.exception?.values?.[0]?.value === `Isolated error ${id}`),
  );

  await Promise.all(ids.map(id => fetch(`${baseURL}/test-isolation/${id}`)));

  const errors = await Promise.all(errorPromises);
  errors.forEach((error, index) => {
    expect(error.tags?.['isolation-id']).toBe(ids[index]);
    expect(error.transaction).toBe('GET /test-isolation/:id');
  });

  const traceIds = errors.map(error => error.contexts?.trace?.trace_id);
  expect(new Set(traceIds).size).toBe(ids.length);
});

test('Continues the trace of an incoming request', async ({ baseURL }) => {
  const spansPromise = collectStreamedSpansUntilSegment(
    'fastify-5',
    span => span.name === 'GET /test-param/:param' && span.trace_id === TRACE_ID,
  );

  await fetch(`${baseURL}/test-param/continued`, {
    headers: {
      'sentry-trace': `${TRACE_ID}-${PARENT_SPAN_ID}-1`,
      baggage: `sentry-trace_id=${TRACE_ID},sentry-environment=qa,sentry-public_key=public,sentry-sampled=true`,
    },
  });

  const segmentSpan = (await spansPromise).find(span => span.is_segment)!;
  expect(segmentSpan.trace_id).toBe(TRACE_ID);
  expect(segmentSpan.parent_span_id).toBe(PARENT_SPAN_ID);
});
