import { expect, test } from '@playwright/test';
import { waitForTransaction, waitForError } from '@sentry-internal/test-utils';

// TODO: Skipped for Nuxt 5 as the SDK is not yet updated for that
test.describe('Server Middleware Instrumentation', () => {
  test('should create separate spans for each server middleware', async ({ request }) => {
    const serverTxnEventPromise = waitForTransaction('nuxt-5', txnEvent => {
      return txnEvent.transaction?.includes('GET /api/middleware-test') ?? false;
    });

    // Make request to the API endpoint that will trigger all server middleware
    const response = await request.get('/api/middleware-test');
    expect(response.status()).toBe(200);

    const responseData = await response.json();
    expect(responseData.message).toBe('Server middleware test endpoint');

    const serverTxnEvent = await serverTxnEventPromise;

    // Verify that we have spans for each middleware
    const middlewareSpans = serverTxnEvent.spans?.filter(span => span.op === 'middleware.nuxt') || [];

    // 3 simple + 2 hooks (middleware+handler) + 3 array hooks (2 middleware + 1 handler)
    expect(middlewareSpans).toHaveLength(8);

    // Check for specific middleware spans
    const firstMiddlewareSpan = middlewareSpans.find(span => span.data?.['nuxt.middleware.name'] === '01.first');
    const secondMiddlewareSpan = middlewareSpans.find(span => span.data?.['nuxt.middleware.name'] === '02.second');
    const authMiddlewareSpan = middlewareSpans.find(span => span.data?.['nuxt.middleware.name'] === '03.auth');
    const hooksOnRequestSpan = middlewareSpans.find(span => span.data?.['nuxt.middleware.name'] === '04.hooks');
    const arrayHooksHandlerSpan = middlewareSpans.find(
      span => span.data?.['nuxt.middleware.name'] === '05.array-hooks',
    );

    expect(firstMiddlewareSpan).toBeDefined();
    expect(secondMiddlewareSpan).toBeDefined();
    expect(authMiddlewareSpan).toBeDefined();
    expect(hooksOnRequestSpan).toBeDefined();
    expect(arrayHooksHandlerSpan).toBeDefined();

    // Verify each span has the correct attributes
    [firstMiddlewareSpan, secondMiddlewareSpan, authMiddlewareSpan].forEach(span => {
      expect(span).toEqual(
        expect.objectContaining({
          op: 'middleware.nuxt',
          data: expect.objectContaining({
            'sentry.op': 'middleware.nuxt',
            'sentry.origin': 'auto.middleware.nuxt',
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
    // 3 simple + 2 hooks (middleware+handler) + 3 array hooks (2 middleware + 1 handler)
    expect(uniqueSpanIds.size).toBe(8);

    // Verify spans share the same trace ID
    const traceIds = middlewareSpans.map(span => span.trace_id);
    const uniqueTraceIds = new Set(traceIds);
    expect(uniqueTraceIds.size).toBe(1);
  });

  test('middleware spans should have proper parent-child relationship', async ({ request }) => {
    const serverTxnEventPromise = waitForTransaction('nuxt-5', txnEvent => {
      return txnEvent.transaction?.includes('GET /api/middleware-test') ?? false;
    });

    await request.get('/api/middleware-test');
    const serverTxnEvent = await serverTxnEventPromise;

    const middlewareSpans = serverTxnEvent.spans?.filter(span => span.op === 'middleware.nuxt') || [];

    // All middleware spans should be children of the main transaction
    middlewareSpans.forEach(span => {
      expect(span.parent_span_id).toBe(serverTxnEvent.contexts?.trace?.span_id);
    });
  });

  test('should capture errors thrown in middleware and associate them with the span', async ({ request }) => {
    const serverTxnEventPromise = waitForTransaction('nuxt-5', txnEvent => {
      return txnEvent.transaction?.includes('GET /api/middleware-test') ?? false;
    });

    const errorEventPromise = waitForError('nuxt-5', errorEvent => {
      return errorEvent?.exception?.values?.[0]?.value === 'Auth middleware error';
    });

    // Make request with query param to trigger error in auth middleware
    const response = await request.get('/api/middleware-test?throwError=true');

    // The request should fail due to the middleware error
    expect(response.status()).toBe(500);

    const [serverTxnEvent, errorEvent] = await Promise.all([serverTxnEventPromise, errorEventPromise]);

    // Find the auth middleware span
    const authMiddlewareSpan = serverTxnEvent.spans?.find(
      span => span.op === 'middleware.nuxt' && span.data?.['nuxt.middleware.name'] === '03.auth',
    );

    expect(authMiddlewareSpan).toBeDefined();

    // Verify the span has error status
    expect(authMiddlewareSpan?.status).toBe('internal_error');

    // Verify the error event is associated with the correct transaction
    expect(errorEvent.transaction).toContain('GET /api/middleware-test');

    // Verify the error has the correct mechanism
    expect(errorEvent.exception?.values?.[0]).toEqual(
      expect.objectContaining({
        value: 'Auth middleware error',
        type: 'Error',
        mechanism: expect.objectContaining({
          handled: false,
          type: 'auto.middleware.nuxt',
        }),
      }),
    );
  });

  test('should create spans for middleware and handler hooks', async ({ request }) => {
    const serverTxnEventPromise = waitForTransaction('nuxt-5', txnEvent => {
      return txnEvent.transaction?.includes('GET /api/middleware-test') ?? false;
    });

    // Make request to trigger middleware with hooks
    const response = await request.get('/api/middleware-test');
    expect(response.status()).toBe(200);

    const serverTxnEvent = await serverTxnEventPromise;
    const middlewareSpans = serverTxnEvent.spans?.filter(span => span.op === 'middleware.nuxt') || [];

    // Find spans for the hooks middleware
    const hooksSpans = middlewareSpans.filter(span => span.data?.['nuxt.middleware.name'] === '04.hooks');

    // Should have spans for middleware and handler (h3 v2 no longer has onBeforeResponse)
    expect(hooksSpans).toHaveLength(2);

    // Find specific hook spans
    const middlewareSpan = hooksSpans.find(span => span.data?.['nuxt.middleware.hook.name'] === 'middleware');
    const handlerSpan = hooksSpans.find(span => span.data?.['nuxt.middleware.hook.name'] === 'handler');

    expect(middlewareSpan).toBeDefined();
    expect(handlerSpan).toBeDefined();

    // Verify span names include hook types
    expect(middlewareSpan?.description).toBe('04.hooks.middleware');
    expect(handlerSpan?.description).toBe('04.hooks');

    // Verify all spans have correct middleware name (without hook suffix)
    [middlewareSpan, handlerSpan].forEach(span => {
      expect(span?.data?.['nuxt.middleware.name']).toBe('04.hooks');
    });

    // Verify hook-specific attributes
    expect(middlewareSpan?.data?.['nuxt.middleware.hook.name']).toBe('middleware');
    expect(handlerSpan?.data?.['nuxt.middleware.hook.name']).toBe('handler');

    // Verify middleware has index (middleware is always an array in h3 v2)
    expect(middlewareSpan?.data?.['nuxt.middleware.hook.index']).toBe(0);
    expect(handlerSpan?.data).not.toHaveProperty('nuxt.middleware.hook.index');
  });

  test('should create spans with index attributes for array middleware', async ({ request }) => {
    const serverTxnEventPromise = waitForTransaction('nuxt-5', txnEvent => {
      return txnEvent.transaction?.includes('GET /api/middleware-test') ?? false;
    });

    // Make request to trigger middleware with array hooks
    const response = await request.get('/api/middleware-test');
    expect(response.status()).toBe(200);

    const serverTxnEvent = await serverTxnEventPromise;
    const middlewareSpans = serverTxnEvent.spans?.filter(span => span.op === 'middleware.nuxt') || [];

    // Find spans for the array hooks middleware
    const arrayHooksSpans = middlewareSpans.filter(span => span.data?.['nuxt.middleware.name'] === '05.array-hooks');

    // Should have spans for 2 middleware + 1 handler = 3 spans (h3 v2 no longer has onBeforeResponse)
    expect(arrayHooksSpans).toHaveLength(3);

    // Find middleware array spans
    const middlewareArraySpans = arrayHooksSpans.filter(
      span => span.data?.['nuxt.middleware.hook.name'] === 'middleware',
    );
    expect(middlewareArraySpans).toHaveLength(2);

    // Find handler span
    const handlerSpan = arrayHooksSpans.find(span => span.data?.['nuxt.middleware.hook.name'] === 'handler');
    expect(handlerSpan).toBeDefined();

    // Verify index attributes for middleware array
    const middleware0Span = middlewareArraySpans.find(span => span.data?.['nuxt.middleware.hook.index'] === 0);
    const middleware1Span = middlewareArraySpans.find(span => span.data?.['nuxt.middleware.hook.index'] === 1);

    expect(middleware0Span).toBeDefined();
    expect(middleware1Span).toBeDefined();

    // Verify span names for array middleware handlers
    expect(middleware0Span?.description).toBe('05.array-hooks.middleware');
    expect(middleware1Span?.description).toBe('05.array-hooks.middleware');

    // Verify handler has no index
    expect(handlerSpan?.data).not.toHaveProperty('nuxt.middleware.hook.index');
  });

  test('should handle errors in middleware hooks', async ({ request }) => {
    const serverTxnEventPromise = waitForTransaction('nuxt-5', txnEvent => {
      return txnEvent.transaction?.includes('GET /api/middleware-test') ?? false;
    });

    const errorEventPromise = waitForError('nuxt-5', errorEvent => {
      return errorEvent?.exception?.values?.[0]?.value === 'OnRequest hook error';
    });

    // Make request with query param to trigger error in middleware
    const response = await request.get('/api/middleware-test?throwOnRequestError=true');
    expect(response.status()).toBe(500);

    const [serverTxnEvent, errorEvent] = await Promise.all([serverTxnEventPromise, errorEventPromise]);

    // Find the middleware span that should have error status
    const middlewareSpan = serverTxnEvent.spans?.find(
      span =>
        span.op === 'middleware.nuxt' &&
        span.data?.['nuxt.middleware.name'] === '04.hooks' &&
        span.data?.['nuxt.middleware.hook.name'] === 'middleware',
    );

    expect(middlewareSpan).toBeDefined();
    expect(middlewareSpan?.status).toBe('internal_error');
    expect(errorEvent.exception?.values?.[0]?.value).toBe('OnRequest hook error');
  });

  test('should handle errors in array middleware with proper index attribution', async ({ request }) => {
    const serverTxnEventPromise = waitForTransaction('nuxt-5', txnEvent => {
      return txnEvent.transaction?.includes('GET /api/middleware-test') ?? false;
    });

    const errorEventPromise = waitForError('nuxt-5', errorEvent => {
      return errorEvent?.exception?.values?.[0]?.value === 'OnRequest[1] hook error';
    });

    // Make request with query param to trigger error in second middleware handler
    const response = await request.get('/api/middleware-test?throwOnRequest1Error=true');
    expect(response.status()).toBe(500);

    const [serverTxnEvent, errorEvent] = await Promise.all([serverTxnEventPromise, errorEventPromise]);

    // Find the second middleware span that should have error status
    const middleware1Span = serverTxnEvent.spans?.find(
      span =>
        span.op === 'middleware.nuxt' &&
        span.data?.['nuxt.middleware.name'] === '05.array-hooks' &&
        span.data?.['nuxt.middleware.hook.name'] === 'middleware' &&
        span.data?.['nuxt.middleware.hook.index'] === 1,
    );

    expect(middleware1Span).toBeDefined();
    expect(middleware1Span?.status).toBe('internal_error');
    expect(errorEvent.exception?.values?.[0]?.value).toBe('OnRequest[1] hook error');

    // Verify the first middleware handler still executed successfully
    const middleware0Span = serverTxnEvent.spans?.find(
      span =>
        span.op === 'middleware.nuxt' &&
        span.data?.['nuxt.middleware.name'] === '05.array-hooks' &&
        span.data?.['nuxt.middleware.hook.name'] === 'middleware' &&
        span.data?.['nuxt.middleware.hook.index'] === 0,
    );

    expect(middleware0Span).toBeDefined();
    expect(middleware0Span?.status).not.toBe('internal_error');
  });
});
