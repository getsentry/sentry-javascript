import { expect, test } from '@playwright/test';
import { collectStreamedSpansUntilSegment, getSpanOp, waitForError } from '@sentry-internal/test-utils';

const APP_NAME = 'void-cloudflare';

test('names the request span after the Void route and adds middleware spans', async ({ baseURL }) => {
  const spansPromise = collectStreamedSpansUntilSegment(
    APP_NAME,
    segment => getSpanOp(segment) === 'http.server' && !!segment.name?.includes('/api/users'),
  );

  const response = await fetch(`${baseURL}/api/users/42`);
  expect(response.status).toBe(200);

  const spans = await spansPromise;
  const segment = spans.find(span => span.is_segment && getSpanOp(span) === 'http.server')!;

  expect(segment.name).toBe('GET /api/users/:id');
  expect(segment.attributes['sentry.origin']?.value).toBe('auto.http.cloudflare');
  // Only `instrument.server.ts` sets this environment.
  expect(segment.attributes['sentry.environment']?.value).toBe('qa');

  expect(
    spans.filter(
      span =>
        getSpanOp(span) === 'middleware' &&
        span.attributes['sentry.origin']?.value === 'auto.middleware.hono' &&
        span.attributes['sentry.segment.id']?.value === segment.span_id,
    ),
  ).not.toHaveLength(0);
});

test('captures an error that a Void route throws', async ({ baseURL }) => {
  const errorPromise = waitForError(APP_NAME, event => event.exception?.values?.[0]?.value === 'Void route error');

  const response = await fetch(`${baseURL}/api/error`);
  expect(response.status).toBe(500);

  const errorEvent = await errorPromise;

  expect(errorEvent.exception?.values?.[0]?.mechanism).toEqual({
    handled: false,
    type: 'auto.http.hono.context_error',
  });
  expect(errorEvent.transaction).toBe('GET /api/error');
});
