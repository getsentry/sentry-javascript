import { expect, test } from '@playwright/test';
import { waitForTransaction } from '@sentry-internal/test-utils';

test.describe('Server Middleware Instrumentation', () => {
  test('should create separate spans for each server middleware', async ({ request }) => {
    const serverTxnEventPromise = waitForTransaction('nuxt-4', txnEvent => {
      return txnEvent.transaction?.includes('GET /api/middleware-test') ?? false;
    });

    // Make request to the API endpoint that will trigger all server middleware
    const response = await request.get('/api/middleware-test');
    expect(response.status()).toBe(200);

    const responseData = await response.json();
    expect(responseData.message).toBe('Server middleware test endpoint');

    const serverTxnEvent = await serverTxnEventPromise;

    // Verify that we have spans for each middleware
    const middlewareSpans = serverTxnEvent.spans?.filter(span => span.op === 'http.server.middleware') || [];

    expect(middlewareSpans).toHaveLength(3);

    // Check for specific middleware spans
    const firstMiddlewareSpan = middlewareSpans.find(span => span.data?.['nuxt.middleware.name'] === '01.first.ts');
    const secondMiddlewareSpan = middlewareSpans.find(span => span.data?.['nuxt.middleware.name'] === '02.second.ts');
    const authMiddlewareSpan = middlewareSpans.find(span => span.data?.['nuxt.middleware.name'] === '03.auth.ts');

    expect(firstMiddlewareSpan).toBeDefined();
    expect(secondMiddlewareSpan).toBeDefined();
    expect(authMiddlewareSpan).toBeDefined();

    // Verify each span has the correct attributes
    [firstMiddlewareSpan, secondMiddlewareSpan, authMiddlewareSpan].forEach(span => {
      expect(span).toEqual(
        expect.objectContaining({
          op: 'http.server.middleware',
          data: expect.objectContaining({
            'sentry.op': 'http.server.middleware',
            'sentry.origin': 'auto.http.nuxt',
            'sentry.source': 'custom',
            'http.request.method': 'GET',
            'http.route': '/api/middleware-test',
          }),
          parent_span_id: expect.stringMatching(/[a-f0-9]{16}/),
          span_id: expect.stringMatching(/[a-f0-9]{16}/),
          trace_id: expect.stringMatching(/[a-f0-9]{32}/),
        }),
      );
    });

    // Verify spans have different span IDs (each middleware gets its own span)
    const spanIds = middlewareSpans.map(span => span.span_id);
    const uniqueSpanIds = new Set(spanIds);
    expect(uniqueSpanIds.size).toBe(3);

    // Verify spans share the same trace ID
    const traceIds = middlewareSpans.map(span => span.trace_id);
    const uniqueTraceIds = new Set(traceIds);
    expect(uniqueTraceIds.size).toBe(1);
  });

  test('middleware spans should have proper parent-child relationship', async ({ request }) => {
    const serverTxnEventPromise = waitForTransaction('nuxt-4', txnEvent => {
      return txnEvent.transaction?.includes('GET /api/middleware-test') ?? false;
    });

    await request.get('/api/middleware-test');
    const serverTxnEvent = await serverTxnEventPromise;

    const middlewareSpans = serverTxnEvent.spans?.filter(span => span.op === 'http.server.middleware') || [];

    // All middleware spans should be children of the main transaction
    middlewareSpans.forEach(span => {
      expect(span.parent_span_id).toBe(serverTxnEvent.contexts?.trace?.span_id);
    });
  });
});
