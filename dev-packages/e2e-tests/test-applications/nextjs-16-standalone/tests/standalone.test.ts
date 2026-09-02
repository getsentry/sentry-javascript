import { expect, test } from '@playwright/test';
import { getSpanOp, waitForError, waitForStreamedSpan } from '@sentry-internal/test-utils';

test('sends a server span from the standalone server', async ({ page }) => {
  const spanPromise = waitForStreamedSpan('nextjs-16-standalone', span => {
    return span.name === 'GET /' && getSpanOp(span) === 'http.server' && span.is_segment;
  });

  await page.goto('/');

  const span = await spanPromise;
  expect(span.status).toBe('ok');
});

test('captures an error thrown in a route handler', async ({ request }) => {
  const errorEventPromise = waitForError('nextjs-16-standalone', errorEvent => {
    return errorEvent.exception?.values?.some(value => value.value === 'nextjs-16-standalone-server-error') ?? false;
  });

  const spanPromise = waitForStreamedSpan('nextjs-16-standalone', span => {
    return span.name === 'GET /api/server-error' && getSpanOp(span) === 'http.server' && span.is_segment;
  });

  request.get('/api/server-error').catch(() => {
    // expected to fail
  });

  const errorEvent = await errorEventPromise;
  const span = await spanPromise;

  expect(errorEvent.exception?.values?.[0]?.value).toBe('nextjs-16-standalone-server-error');
  expect(errorEvent.contexts?.trace?.trace_id).toBe(span.trace_id);
  expect(span.status).toBe('error');
});
