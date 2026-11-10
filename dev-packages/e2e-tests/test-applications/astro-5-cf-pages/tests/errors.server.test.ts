import { expect, test } from '@playwright/test';
import { getSpanOp, waitForError, waitForStreamedSpan } from '@sentry-internal/test-utils';
import { HTTP_SERVER } from '@sentry/conventions/op';

// Several requests hit the same isolate, so later ones run with the client the first one cached.
test('captures an API route error with the Cloudflare-backed server SDK on every request', async ({ request }) => {
  for (let i = 0; i < 4; i++) {
    const errorEventPromise = waitForError('astro-5-cf-pages', errorEvent => {
      return errorEvent?.exception?.values?.[0]?.value === `API route error for request ${i}`;
    });

    const spanPromise = waitForStreamedSpan('astro-5-cf-pages', span => {
      return getSpanOp(span) === HTTP_SERVER && span.is_segment && span.name === 'GET /api/request-error';
    });

    await request.get(`/api/request-error?request=${i}`);

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
            value: `API route error for request ${i}`,
          },
        ],
      },
      request: {
        method: 'GET',
        url: expect.stringContaining(`/api/request-error?request=${i}`),
      },
      sdk: {
        name: 'sentry.javascript.astro',
        packages: [
          { name: 'npm:@sentry/astro', version: expect.any(String) },
          { name: 'npm:@sentry/cloudflare', version: expect.any(String) },
        ],
      },
    });
  }
});
