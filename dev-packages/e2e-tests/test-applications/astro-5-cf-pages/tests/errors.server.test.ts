import { expect, test } from '@playwright/test';
import { getSpanOp, waitForError, waitForStreamedSpan } from '@sentry-internal/test-utils';

test('captures an API route error with the Cloudflare-backed server SDK', async ({ request }) => {
  const errorEventPromise = waitForError('astro-5-cf-pages', errorEvent => {
    return errorEvent?.exception?.values?.[0]?.value === 'This is a test error from an API route';
  });

  const spanPromise = waitForStreamedSpan('astro-5-cf-pages', span => {
    return getSpanOp(span) === 'http.server' && span.is_segment && span.name === 'GET /api/test-error';
  });

  await request.get('/api/test-error');

  const errorEvent = await errorEventPromise;
  const span = await spanPromise;

  expect(errorEvent).toMatchObject({
    contexts: {
      trace: {
        trace_id: span.trace_id,
        span_id: span.span_id,
      },
    },
    environment: 'qa',
    exception: {
      values: [
        {
          mechanism: expect.objectContaining({ handled: false }),
          type: 'Error',
          value: 'This is a test error from an API route',
        },
      ],
    },
    request: {
      method: 'GET',
      url: expect.stringContaining('/api/test-error'),
    },
    sdk: {
      name: 'sentry.javascript.astro',
      packages: [
        { name: 'npm:@sentry/astro', version: expect.any(String) },
        { name: 'npm:@sentry/cloudflare', version: expect.any(String) },
      ],
    },
  });
});
