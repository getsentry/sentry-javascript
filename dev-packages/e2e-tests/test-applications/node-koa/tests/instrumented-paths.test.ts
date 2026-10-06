import { expect, test } from '@playwright/test';
import { getSpanOp, collectStreamedSpansUntilSegment } from '@sentry-internal/test-utils';

test('instruments RegExp router routes', async ({ baseURL }) => {
  const segmentPromise = collectStreamedSpansUntilSegment(
    'node-koa',
    segment => getSpanOp(segment) === 'http.server' && !!segment.name?.includes('test-regexp'),
  );

  await fetch(`${baseURL}/test-regexp`);

  const segmentEventSpans = await segmentPromise;
  const segmentEvent = segmentEventSpans.find(
    segment => segment.is_segment && getSpanOp(segment) === 'http.server' && !!segment.name?.includes('test-regexp'),
  )!;

  expect(
    segmentEventSpans.filter(
      span => !span.is_segment && span.attributes['sentry.segment.id']?.value === segmentEvent.span_id,
    ),
  ).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        attributes: expect.objectContaining({
          'koa.type': { value: 'router', type: 'string' },
          'sentry.op': { value: 'router', type: 'string' },
          'sentry.origin': { value: 'auto.http.koa', type: 'string' },
          'http.route': { value: '/^\\/test-regexp/', type: 'string' },
        }),
      }),
    ]),
  );
});

test('instruments nested routers with the composed http.route', async ({ baseURL }) => {
  const segmentPromise = collectStreamedSpansUntilSegment(
    'node-koa',
    segment => getSpanOp(segment) === 'http.server' && segment.name === 'GET /:first/details/:id',
  );

  await fetch(`${baseURL}/shop/details/1`);

  const segmentEventSpans = await segmentPromise;
  const segmentEvent = segmentEventSpans.find(
    segment => segment.is_segment && getSpanOp(segment) === 'http.server' && segment.name === 'GET /:first/details/:id',
  )!;

  expect(
    segmentEventSpans.filter(
      span => !span.is_segment && span.attributes['sentry.segment.id']?.value === segmentEvent.span_id,
    ),
  ).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        name: '/:first/details/:id',
        attributes: expect.objectContaining({
          'koa.type': { value: 'router', type: 'string' },
          'http.route': { value: '/:first/details/:id', type: 'string' },
          'sentry.op': { value: 'router', type: 'string' },
          'sentry.origin': { value: 'auto.http.koa', type: 'string' },
        }),
      }),
    ]),
  );
});

test('does not instrument the same middleware twice', async ({ baseURL }) => {
  const segmentPromise = collectStreamedSpansUntilSegment(
    'node-koa',
    segment => getSpanOp(segment) === 'http.server' && segment.name === 'GET /test-dedup',
  );

  await fetch(`${baseURL}/test-dedup`);

  const segmentEventSpans = await segmentPromise;
  const segmentEvent = segmentEventSpans.find(
    segment => segment.is_segment && getSpanOp(segment) === 'http.server' && segment.name === 'GET /test-dedup',
  )!;

  // The route stack is [sharedRouteMiddleware, sharedRouteMiddleware, handler]; the repeated
  // middleware instance is skipped, leaving one span for it plus the handler span.
  const dedupSpans = segmentEventSpans
    .filter(span => !span.is_segment && span.attributes['sentry.segment.id']?.value === segmentEvent.span_id)
    .filter(span => getSpanOp(span) === 'router' && span.name === '/test-dedup');
  expect(dedupSpans).toHaveLength(2);
});

test('marks the layer span as errored when a handler throws', async ({ baseURL }) => {
  const segmentPromise = collectStreamedSpansUntilSegment(
    'node-koa',
    segment => getSpanOp(segment) === 'http.server' && segment.name === 'GET /test-exception/:id',
  );

  await fetch(`${baseURL}/test-exception/123`);

  const segmentEventSpans = await segmentPromise;
  const segmentEvent = segmentEventSpans.find(
    segment => segment.is_segment && getSpanOp(segment) === 'http.server' && segment.name === 'GET /test-exception/:id',
  )!;

  expect(
    segmentEventSpans.filter(
      span => !span.is_segment && span.attributes['sentry.segment.id']?.value === segmentEvent.span_id,
    ),
  ).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        status: 'error',
        attributes: expect.objectContaining({
          'sentry.op': { value: 'router', type: 'string' },
          'sentry.origin': { value: 'auto.http.koa', type: 'string' },
        }),
      }),
    ]),
  );
});
