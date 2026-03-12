import { expect, test } from '@playwright/test';
import { waitForError, waitForTransaction } from '@sentry-internal/test-utils';

test.describe('server-side errors', () => {
  test('captures SSR error', async ({ page }) => {
    const errorEventPromise = waitForError('astro-5-cf-workers', errorEvent => {
      return errorEvent?.exception?.values?.[0]?.value === "Cannot read properties of undefined (reading 'x')";
    });

    const transactionEventPromise = waitForTransaction('astro-5-cf-workers', transactionEvent => {
      return transactionEvent.transaction === 'GET /ssr-error';
    });

    // This page returns an error status code, so we need to catch the navigation error
    await page.goto('/ssr-error').catch(() => {
      // Expected to fail with net::ERR_HTTP_RESPONSE_CODE_FAILURE in newer Chromium versions
    });

    const errorEvent = await errorEventPromise;
    const transactionEvent = await transactionEventPromise;

    expect(transactionEvent).toMatchObject({
      transaction: 'GET /ssr-error',
    });

    const traceId = transactionEvent.contexts?.trace?.trace_id;
    const spanId = transactionEvent.contexts?.trace?.span_id;

    expect(traceId).toMatch(/[a-f0-9]{32}/);
    expect(spanId).toMatch(/[a-f0-9]{16}/);

    expect(errorEvent).toMatchObject({
      contexts: {
        trace: {
          span_id: spanId,
          trace_id: traceId,
        },
      },
      environment: 'qa',
      event_id: expect.stringMatching(/[a-f0-9]{32}/),
      exception: {
        values: [
          {
            mechanism: expect.objectContaining({
              handled: false,
            }),
            stacktrace: expect.any(Object),
            type: 'TypeError',
            value: "Cannot read properties of undefined (reading 'x')",
          },
        ],
      },
      request: {
        headers: expect.objectContaining({
          host: expect.any(String),
          'user-agent': expect.any(String),
        }),
        method: 'GET',
        url: expect.stringContaining('/ssr-error'),
      },
      sdk: {
        integrations: expect.any(Array),
        name: 'sentry.javascript.cloudflare',
        packages: expect.any(Array),
        version: expect.any(String),
      },
      timestamp: expect.any(Number),
      transaction: 'GET /ssr-error',
    });
  });

  test('captures endpoint error', async ({ page }) => {
    const errorEventPromise = waitForError('astro-5-cf-workers', errorEvent => {
      return errorEvent?.exception?.values?.[0]?.value === 'Endpoint Error';
    });
    const transactionEventApiPromise = waitForTransaction('astro-5-cf-workers', transactionEvent => {
      return transactionEvent.transaction === 'GET /endpoint-error/api';
    });
    const transactionEventEndpointPromise = waitForTransaction('astro-5-cf-workers', transactionEvent => {
      return transactionEvent.transaction === 'GET /endpoint-error';
    });

    await page.goto('/endpoint-error');
    await page.getByText('Get Data').click();

    const errorEvent = await errorEventPromise;
    const transactionEventApi = await transactionEventApiPromise;
    const transactionEventEndpoint = await transactionEventEndpointPromise;

    expect(transactionEventEndpoint).toMatchObject({
      transaction: 'GET /endpoint-error',
    });

    const traceId = transactionEventEndpoint.contexts?.trace?.trace_id;

    expect(traceId).toMatch(/[a-f0-9]{32}/);

    expect(transactionEventApi).toMatchObject({
      transaction: 'GET /endpoint-error/api',
    });

    expect(errorEvent).toMatchObject({
      exception: {
        values: [
          {
            mechanism: expect.objectContaining({
              handled: false,
            }),
            stacktrace: expect.any(Object),
            type: 'Error',
            value: 'Endpoint Error',
          },
        ],
      },
      request: {
        headers: expect.objectContaining({
          accept: expect.any(String),
        }),
        method: 'GET',
        url: expect.stringContaining('endpoint-error/api?error=1'),
      },
      transaction: 'GET /endpoint-error/api',
    });
  });

  test('captures API route error', async ({ request }) => {
    const errorEventPromise = waitForError('astro-5-cf-workers', errorEvent => {
      return !!errorEvent?.exception?.values?.some(value =>
        value.value?.includes('This is a test error from an API route'),
      );
    });

    request.get('/api/test-error').catch(() => {
      // Expected to fail
    });

    const errorEvent = await errorEventPromise;

    expect(errorEvent).toMatchObject({
      exception: {
        values: [
          {
            mechanism: expect.objectContaining({
              handled: false,
            }),
            stacktrace: expect.any(Object),
            type: 'Error',
            value: 'This is a test error from an API route',
          },
        ],
      },
      request: {
        method: 'GET',
        url: expect.stringContaining('/api/test-error'),
      },
    });
  });
});
