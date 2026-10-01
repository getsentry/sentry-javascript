import { expect, test } from '@playwright/test';
import { collectStreamedSpansUntilSegment, waitForError } from '@sentry-internal/test-utils';

test('Captures a route handler error in the trace of the request', async ({ request }) => {
  const errorPromise = waitForError('vinext-cf-workers', event => {
    return event.exception?.values?.[0]?.value === 'Route handler error from vinext';
  });
  const spansPromise = collectStreamedSpansUntilSegment('vinext-cf-workers', 'GET /api/throw');

  const response = await request.get('/api/throw');
  expect(response.status()).toBe(500);

  const errorEvent = await errorPromise;
  const spans = await spansPromise;
  const segmentSpan = spans.find(span => span.is_segment)!;

  expect(errorEvent.sdk?.name).toBe('sentry.javascript.nextjs');
  // `sentry.server.config.ts` sets another environment, so the client of `withSentry` sent the event.
  expect(errorEvent.environment).toBe('qa');
  expect(errorEvent.transaction).toBe('GET /api/throw');
  expect(errorEvent.exception?.values?.[0]?.mechanism).toMatchObject({
    type: 'auto.function.nextjs.on_request_error',
    handled: false,
  });
  expect(errorEvent.contexts?.trace?.trace_id).toBe(segmentSpan.trace_id);
  expect(segmentSpan.status).toBe('error');
});
