import { expect, test } from '@playwright/test';
import { waitForError, waitForTransaction } from '@sentry-internal/test-utils';

test.describe('server-side errors', () => {
  test('captures SSR error', async ({ page }) => {
    const errorEventPromise = waitForError('astro-4', errorEvent => {
      return errorEvent?.exception?.values?.[0]?.value === "Cannot read properties of undefined (reading 'x')";
    });

    const transactionEventPromise = waitForTransaction('astro-4', transactionEvent => {
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
      spans: [],
    });

    const traceId = transactionEvent.contexts?.trace?.trace_id;
    const spanId = transactionEvent.contexts?.trace?.span_id;

    expect(traceId).toMatch(/[a-f0-9]{32}/);
    expect(spanId).toMatch(/[a-f0-9]{16}/);
    expect(transactionEvent.contexts?.trace?.parent_span_id).toBeUndefined();

    expect(errorEvent).toMatchObject({
      contexts: {
        app: expect.any(Object),
        cloud_resource: expect.any(Object),
        culture: expect.any(Object),
        device: expect.any(Object),
        os: expect.any(Object),
        runtime: expect.any(Object),
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
            mechanism: {
              handled: false,
              type: 'auto.middleware.astro',
            },
            stacktrace: expect.any(Object),
            type: 'TypeError',
            value: "Cannot read properties of undefined (reading 'x')",
          },
        ],
      },
      platform: 'node',
      request: {
        cookies: {},
        headers: expect.objectContaining({
          // demonstrates that requestData integration is getting data
          host: 'localhost:3030',
          'user-agent': expect.any(String),
        }),
        method: 'GET',
        url: expect.stringContaining('/ssr-error'),
      },
      sdk: {
        integrations: expect.any(Array),
        name: 'sentry.javascript.astro',
        packages: expect.any(Array),
        version: expect.any(String),
      },
      server_name: expect.any(String),
      timestamp: expect.any(Number),
      transaction: 'GET /ssr-error',
    });
  });

  test('captures endpoint error', async ({ page }) => {
    const errorEventPromise = waitForError('astro-4', errorEvent => {
      return errorEvent?.exception?.values?.[0]?.value === 'Endpoint Error';
    });
    const transactionEventApiPromise = waitForTransaction('astro-4', transactionEvent => {
      return transactionEvent.transaction === 'GET /endpoint-error/api';
    });
    const transactionEventEndpointPromise = waitForTransaction('astro-4', transactionEvent => {
      return transactionEvent.transaction === 'GET /endpoint-error';
    });

    await page.goto('/endpoint-error');
    await page.getByText('Get Data').click();

    const errorEvent = await errorEventPromise;
    const transactionEventApi = await transactionEventApiPromise;
    const transactionEventEndpoint = await transactionEventEndpointPromise;

    expect(transactionEventEndpoint).toMatchObject({
      transaction: 'GET /endpoint-error',
      spans: [],
    });

    const traceId = transactionEventEndpoint.contexts?.trace?.trace_id;
    const endpointSpanId = transactionEventApi.contexts?.trace?.span_id;

    expect(traceId).toMatch(/[a-f0-9]{32}/);
    expect(endpointSpanId).toMatch(/[a-f0-9]{16}/);

    expect(transactionEventApi).toMatchObject({
      transaction: 'GET /endpoint-error/api',
      spans: [],
    });

    const spanId = transactionEventApi.contexts?.trace?.span_id;
    const parentSpanId = transactionEventApi.contexts?.trace?.parent_span_id;

    expect(spanId).toMatch(/[a-f0-9]{16}/);
    // TODO: This is incorrect, for whatever reason, it should be the endpointSpanId ideally
    expect(parentSpanId).toMatch(/[a-f0-9]{16}/);
    expect(parentSpanId).not.toEqual(endpointSpanId);

    expect(errorEvent).toMatchObject({
      contexts: {
        trace: {
          parent_span_id: parentSpanId,
          span_id: spanId,
          trace_id: traceId,
        },
      },
      exception: {
        values: [
          {
            mechanism: {
              handled: false,
              type: 'auto.middleware.astro',
            },
            stacktrace: expect.any(Object),
            type: 'Error',
            value: 'Endpoint Error',
          },
        ],
      },
      platform: 'node',
      request: {
        cookies: {},
        headers: expect.objectContaining({
          accept: expect.any(String),
        }),
        method: 'GET',
        query_string: 'error=1',
        url: expect.stringContaining('endpoint-error/api?error=1'),
      },
      transaction: 'GET /endpoint-error/api',
    });
  });
});
