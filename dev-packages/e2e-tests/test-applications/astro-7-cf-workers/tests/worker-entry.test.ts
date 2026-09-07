import { expect, test } from '@playwright/test';
import { getSpanOp, waitForError, waitForStreamedSpan } from '@sentry-internal/test-utils';

const APP_NAME = 'astro-7-cf-workers';

// This app has no `Sentry.init` of its own and no hand-written Worker entry, so the Cloudflare SDK
// only reports anything because `@sentry/astro` wrapped the adapter's Worker entry with `withSentry`.
test.describe('Cloudflare Worker entry wrapped by @sentry/astro', () => {
  test('captures an API route error and its request span without any page render', async ({ request }) => {
    const errorEventPromise = waitForError(APP_NAME, errorEvent => {
      return errorEvent?.exception?.values?.[0]?.value === 'This is a test error from an API route';
    });
    const spanPromise = waitForStreamedSpan(APP_NAME, span => {
      return getSpanOp(span) === 'http.server' && span.is_segment && span.name === 'GET /api/test-error';
    });

    const response = await request.get('/api/test-error');
    expect(response.status()).toBe(500);

    const errorEvent = await errorEventPromise;
    const span = await spanPromise;

    expect(span.parent_span_id).toBeUndefined();
    expect(span.attributes).toMatchObject({
      'sentry.op': { value: 'http.server', type: 'string' },
      'sentry.sdk.name': { value: 'sentry.javascript.cloudflare', type: 'string' },
      'http.response.status_code': { value: 500, type: 'integer' },
      'url.full': { value: expect.stringContaining('/api/test-error'), type: 'string' },
    });

    expect(errorEvent).toMatchObject({
      contexts: {
        cloud_resource: { 'cloud.provider': 'cloudflare' },
        runtime: { name: 'cloudflare' },
        trace: {
          trace_id: span.trace_id,
          span_id: span.span_id,
        },
      },
      exception: {
        values: [
          {
            mechanism: {
              handled: false,
              type: 'auto.middleware.astro',
            },
            type: 'Error',
            value: 'This is a test error from an API route',
          },
        ],
      },
      sdk: {
        name: 'sentry.javascript.cloudflare',
        packages: [{ name: 'npm:@sentry/cloudflare', version: expect.any(String) }],
      },
      transaction: 'GET /api/test-error',
    });
  });
});
