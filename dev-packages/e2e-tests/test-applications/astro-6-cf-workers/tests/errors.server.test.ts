import { expect, test } from '@playwright/test';
import { getSpanOp, waitForError, waitForStreamedSpan } from '@sentry-internal/test-utils';

test.describe('server-side errors', () => {
  test('captures SSR error', async ({ page }) => {
    const errorEventPromise = waitForError('astro-6-cf-workers', errorEvent => {
      return errorEvent?.exception?.values?.[0]?.value === "Cannot read properties of undefined (reading 'x')";
    });

    const spanPromise = waitForStreamedSpan('astro-6-cf-workers', span => {
      return getSpanOp(span) === 'http.server' && span.is_segment && span.name === 'GET /ssr-error';
    });

    // This page returns an error status code, so we need to catch the navigation error
    await page.goto('/ssr-error').catch(() => {
      // Expected to fail with net::ERR_HTTP_RESPONSE_CODE_FAILURE in newer Chromium versions
    });

    const errorEvent = await errorEventPromise;
    const span = await spanPromise;

    const traceId = span.trace_id;
    const spanId = span.span_id;

    expect(traceId).toMatch(/[a-f0-9]{32}/);
    expect(spanId).toMatch(/[a-f0-9]{16}/);
    expect(span.parent_span_id).toBeUndefined();

    expect(errorEvent).toMatchObject({
      contexts: {
        cloud_resource: expect.any(Object),
        culture: expect.any(Object),
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
      platform: 'javascript',
      request: {
        headers: expect.objectContaining({
          host: 'localhost:3030',
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
    const errorEventPromise = waitForError('astro-6-cf-workers', errorEvent => {
      return errorEvent?.exception?.values?.[0]?.value === 'Endpoint Error';
    });
    const apiSpanPromise = waitForStreamedSpan('astro-6-cf-workers', span => {
      return getSpanOp(span) === 'http.server' && span.name === 'GET /endpoint-error/api';
    });
    const endpointSpanPromise = waitForStreamedSpan('astro-6-cf-workers', span => {
      return getSpanOp(span) === 'http.server' && span.is_segment && span.name === 'GET /endpoint-error';
    });

    await page.goto('/endpoint-error');
    await page.getByText('Get Data').click();

    const errorEvent = await errorEventPromise;
    const apiSpan = await apiSpanPromise;
    const endpointSpan = await endpointSpanPromise;

    const traceId = endpointSpan.trace_id;
    const endpointSpanId = apiSpan.span_id;

    expect(traceId).toMatch(/[a-f0-9]{32}/);
    expect(endpointSpanId).toMatch(/[a-f0-9]{16}/);

    const spanId = apiSpan.span_id;
    const parentSpanId = apiSpan.parent_span_id;

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
      platform: 'javascript',
      request: {
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
