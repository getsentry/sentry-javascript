import { expect, test } from '@playwright/test';
import { waitForError, waitForTransaction } from '@sentry-internal/test-utils';

test.describe('Cloudflare Runtime', () => {
  test('Should report cloudflare as the runtime in SSR error events', async ({ page }) => {
    const errorEventPromise = waitForError('astro-5-cf-workers', errorEvent => {
      return errorEvent?.exception?.values?.[0]?.value === "Cannot read properties of undefined (reading 'x')";
    });

    await page.goto('/ssr-error').catch(() => {
      // Expected to fail with net::ERR_HTTP_RESPONSE_CODE_FAILURE
    });

    const errorEvent = await errorEventPromise;

    expect(errorEvent.contexts?.runtime).toEqual({
      name: 'cloudflare',
    });

    // The SDK info should include cloudflare in the packages
    expect(errorEvent.sdk?.packages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'npm:@sentry/cloudflare',
        }),
      ]),
    );
  });

  test('Should report cloudflare as the runtime in API route error events', async ({ request }) => {
    const errorEventPromise = waitForError('astro-5-cf-workers', errorEvent => {
      return !!errorEvent?.exception?.values?.some(value =>
        value.value?.includes('This is a test error from an API route'),
      );
    });

    const transactionEventPromise = waitForTransaction('astro-5-cf-workers', transactionEvent => {
      return transactionEvent.transaction === 'GET /api/test-error';
    });

    request.get('/api/test-error').catch(() => {
      // Expected to fail
    });

    const errorEvent = await errorEventPromise;
    const transactionEvent = await transactionEventPromise;

    // Only the `withSentry` wrap of the Worker entry produces a request span with the Cloudflare
    // SDK for a route that renders no page.
    expect(transactionEvent).toMatchObject({
      transaction: 'GET /api/test-error',
      contexts: {
        cloud_resource: { 'cloud.provider': 'cloudflare' },
        runtime: { name: 'cloudflare' },
        trace: { op: 'http.server' },
      },
      sdk: { name: 'sentry.javascript.cloudflare' },
    });
    expect(errorEvent.contexts?.trace?.trace_id).toBe(transactionEvent.contexts?.trace?.trace_id);

    expect(errorEvent.contexts?.runtime).toEqual({
      name: 'cloudflare',
    });

    expect(errorEvent.sdk?.packages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'npm:@sentry/cloudflare',
        }),
      ]),
    );
  });
});
