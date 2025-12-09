import { expect, test } from '@playwright/test';
import { waitForTransaction, waitForError } from '@sentry-internal/test-utils';

test.describe('Server Middleware Instrumentation', () => {
  test('should create separate spans for each server middleware', async ({ request }) => {
    const serverTxnEventPromise = waitForTransaction('nuxt-3', txnEvent => {
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

    // 3 simple + 3 hooks (onRequest+handler+onBeforeResponse) + 5 array hooks (2 onRequest + 1 handler + 2 onBeforeResponse)
    expect(middlewareSpans).toHaveLength(11);

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
    // 3 simple + 3 hooks (onRequest+handler+onBeforeResponse) + 5 array hooks (2 onRequest + 1 handler + 2 onBeforeResponse)
    expect(uniqueSpanIds.size).toBe(11);

    // Verify spans share the same trace ID
    const traceIds = middlewareSpans.map(span => span.trace_id);
    const uniqueTraceIds = new Set(traceIds);
    expect(uniqueTraceIds.size).toBe(1);
  });

  test('middleware spans should have proper parent-child relationship', async ({ request }) => {
    const serverTxnEventPromise = waitForTransaction('nuxt-3', txnEvent => {
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
    const serverTxnEventPromise = waitForTransaction('nuxt-3', txnEvent => {
      return txnEvent.transaction?.includes('GET /api/middleware-test') ?? false;
    });

    const errorEventPromise = waitForError('nuxt-3', errorEvent => {
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
          // Type changes depending on whether it is being wrapped by Nitro or not
          // This is a timing problem, sometimes Nitro can capture the error first, and sometimes it can't
          // If nitro captures the error first, the type will be 'chained'
          // If Sentry captures the error first, the type will be 'auto.middleware.nuxt'
          type: expect.stringMatching(/^(auto\.middleware\.nuxt|chained)$/),
        }),
      }),
    );
  });

  test('should create spans for onRequest and onBeforeResponse hooks', async ({ request }) => {
    const serverTxnEventPromise = waitForTransaction('nuxt-3', txnEvent => {
      return txnEvent.transaction?.includes('GET /api/middleware-test') ?? false;
    });

    // Make request to trigger middleware with hooks
    const response = await request.get('/api/middleware-test');
    expect(response.status()).toBe(200);

    const serverTxnEvent = await serverTxnEventPromise;
    const middlewareSpans = serverTxnEvent.spans?.filter(span => span.op === 'middleware.nuxt') || [];

    // Find spans for the hooks middleware
    const hooksSpans = middlewareSpans.filter(span => span.data?.['nuxt.middleware.name'] === '04.hooks');

    // Should have spans for onRequest, handler, and onBeforeResponse
    expect(hooksSpans).toHaveLength(3);

    // Find specific hook spans
    const onRequestSpan = hooksSpans.find(span => span.data?.['nuxt.middleware.hook.name'] === 'onRequest');
    const handlerSpan = hooksSpans.find(span => span.data?.['nuxt.middleware.hook.name'] === 'handler');
    const onBeforeResponseSpan = hooksSpans.find(
      span => span.data?.['nuxt.middleware.hook.name'] === 'onBeforeResponse',
    );

    expect(onRequestSpan).toBeDefined();
    expect(handlerSpan).toBeDefined();
    expect(onBeforeResponseSpan).toBeDefined();

    // Verify span names include hook types
    expect(onRequestSpan?.description).toBe('04.hooks.onRequest');
    expect(handlerSpan?.description).toBe('04.hooks');
    expect(onBeforeResponseSpan?.description).toBe('04.hooks.onBeforeResponse');

    // Verify all spans have correct middleware name (without hook suffix)
    [onRequestSpan, handlerSpan, onBeforeResponseSpan].forEach(span => {
      expect(span?.data?.['nuxt.middleware.name']).toBe('04.hooks');
    });

    // Verify hook-specific attributes
    expect(onRequestSpan?.data?.['nuxt.middleware.hook.name']).toBe('onRequest');
    expect(handlerSpan?.data?.['nuxt.middleware.hook.name']).toBe('handler');
    expect(onBeforeResponseSpan?.data?.['nuxt.middleware.hook.name']).toBe('onBeforeResponse');

    // Verify no index attributes for single hooks
    expect(onRequestSpan?.data).not.toHaveProperty('nuxt.middleware.hook.index');
    expect(handlerSpan?.data).not.toHaveProperty('nuxt.middleware.hook.index');
    expect(onBeforeResponseSpan?.data).not.toHaveProperty('nuxt.middleware.hook.index');
  });

  test('should create spans with index attributes for array hooks', async ({ request }) => {
    const serverTxnEventPromise = waitForTransaction('nuxt-3', txnEvent => {
      return txnEvent.transaction?.includes('GET /api/middleware-test') ?? false;
    });

    // Make request to trigger middleware with array hooks
    const response = await request.get('/api/middleware-test');
    expect(response.status()).toBe(200);

    const serverTxnEvent = await serverTxnEventPromise;
    const middlewareSpans = serverTxnEvent.spans?.filter(span => span.op === 'middleware.nuxt') || [];

    // Find spans for the array hooks middleware
    const arrayHooksSpans = middlewareSpans.filter(span => span.data?.['nuxt.middleware.name'] === '05.array-hooks');

    // Should have spans for 2 onRequest + 1 handler + 2 onBeforeResponse = 5 spans
    expect(arrayHooksSpans).toHaveLength(5);

    // Find onRequest array spans
    const onRequestSpans = arrayHooksSpans.filter(span => span.data?.['nuxt.middleware.hook.name'] === 'onRequest');
    expect(onRequestSpans).toHaveLength(2);

    // Find onBeforeResponse array spans
    const onBeforeResponseSpans = arrayHooksSpans.filter(
      span => span.data?.['nuxt.middleware.hook.name'] === 'onBeforeResponse',
    );
    expect(onBeforeResponseSpans).toHaveLength(2);

    // Find handler span
    const handlerSpan = arrayHooksSpans.find(span => span.data?.['nuxt.middleware.hook.name'] === 'handler');
    expect(handlerSpan).toBeDefined();

    // Verify index attributes for onRequest array
    const onRequest0Span = onRequestSpans.find(span => span.data?.['nuxt.middleware.hook.index'] === 0);
    const onRequest1Span = onRequestSpans.find(span => span.data?.['nuxt.middleware.hook.index'] === 1);

    expect(onRequest0Span).toBeDefined();
    expect(onRequest1Span).toBeDefined();

    // Verify index attributes for onBeforeResponse array
    const onBeforeResponse0Span = onBeforeResponseSpans.find(span => span.data?.['nuxt.middleware.hook.index'] === 0);
    const onBeforeResponse1Span = onBeforeResponseSpans.find(span => span.data?.['nuxt.middleware.hook.index'] === 1);

    expect(onBeforeResponse0Span).toBeDefined();
    expect(onBeforeResponse1Span).toBeDefined();

    // Verify span names for array handlers
    expect(onRequest0Span?.description).toBe('05.array-hooks.onRequest');
    expect(onRequest1Span?.description).toBe('05.array-hooks.onRequest');
    expect(onBeforeResponse0Span?.description).toBe('05.array-hooks.onBeforeResponse');
    expect(onBeforeResponse1Span?.description).toBe('05.array-hooks.onBeforeResponse');

    // Verify handler has no index
    expect(handlerSpan?.data).not.toHaveProperty('nuxt.middleware.hook.index');
  });

  test('should handle errors in onRequest hooks', async ({ request }) => {
    const serverTxnEventPromise = waitForTransaction('nuxt-3', txnEvent => {
      return txnEvent.transaction?.includes('GET /api/middleware-test') ?? false;
    });

    const errorEventPromise = waitForError('nuxt-3', errorEvent => {
      return errorEvent?.exception?.values?.[0]?.value === 'OnRequest hook error';
    });

    // Make request with query param to trigger error in onRequest
    const response = await request.get('/api/middleware-test?throwOnRequestError=true');
    expect(response.status()).toBe(500);

    const [serverTxnEvent, errorEvent] = await Promise.all([serverTxnEventPromise, errorEventPromise]);

    // Find the onRequest span that should have error status
    const onRequestSpan = serverTxnEvent.spans?.find(
      span =>
        span.op === 'middleware.nuxt' &&
        span.data?.['nuxt.middleware.name'] === '04.hooks' &&
        span.data?.['nuxt.middleware.hook.name'] === 'onRequest',
    );

    expect(onRequestSpan).toBeDefined();
    expect(onRequestSpan?.status).toBe('internal_error');
    expect(errorEvent.exception?.values?.[0]?.value).toBe('OnRequest hook error');
  });

  test('should handle errors in onBeforeResponse hooks', async ({ request }) => {
    const serverTxnEventPromise = waitForTransaction('nuxt-3', txnEvent => {
      return txnEvent.transaction?.includes('GET /api/middleware-test') ?? false;
    });

    const errorEventPromise = waitForError('nuxt-3', errorEvent => {
      return errorEvent?.exception?.values?.[0]?.value === 'OnBeforeResponse hook error';
    });

    // Make request with query param to trigger error in onBeforeResponse
    const response = await request.get('/api/middleware-test?throwOnBeforeResponseError=true');
    expect(response.status()).toBe(500);

    const [serverTxnEvent, errorEvent] = await Promise.all([serverTxnEventPromise, errorEventPromise]);

    // Find the onBeforeResponse span that should have error status
    const onBeforeResponseSpan = serverTxnEvent.spans?.find(
      span =>
        span.op === 'middleware.nuxt' &&
        span.data?.['nuxt.middleware.name'] === '04.hooks' &&
        span.data?.['nuxt.middleware.hook.name'] === 'onBeforeResponse',
    );

    expect(onBeforeResponseSpan).toBeDefined();
    expect(onBeforeResponseSpan?.status).toBe('internal_error');
    expect(errorEvent.exception?.values?.[0]?.value).toBe('OnBeforeResponse hook error');
  });

  test('should handle errors in array hooks with proper index attribution', async ({ request }) => {
    const serverTxnEventPromise = waitForTransaction('nuxt-3', txnEvent => {
      return txnEvent.transaction?.includes('GET /api/middleware-test') ?? false;
    });

    const errorEventPromise = waitForError('nuxt-3', errorEvent => {
      return errorEvent?.exception?.values?.[0]?.value === 'OnRequest[1] hook error';
    });

    // Make request with query param to trigger error in second onRequest handler
    const response = await request.get('/api/middleware-test?throwOnRequest1Error=true');
    expect(response.status()).toBe(500);

    const [serverTxnEvent, errorEvent] = await Promise.all([serverTxnEventPromise, errorEventPromise]);

    // Find the second onRequest span that should have error status
    const onRequest1Span = serverTxnEvent.spans?.find(
      span =>
        span.op === 'middleware.nuxt' &&
        span.data?.['nuxt.middleware.name'] === '05.array-hooks' &&
        span.data?.['nuxt.middleware.hook.name'] === 'onRequest' &&
        span.data?.['nuxt.middleware.hook.index'] === 1,
    );

    expect(onRequest1Span).toBeDefined();
    expect(onRequest1Span?.status).toBe('internal_error');
    expect(errorEvent.exception?.values?.[0]?.value).toBe('OnRequest[1] hook error');

    // Verify the first onRequest handler still executed successfully
    const onRequest0Span = serverTxnEvent.spans?.find(
      span =>
        span.op === 'middleware.nuxt' &&
        span.data?.['nuxt.middleware.name'] === '05.array-hooks' &&
        span.data?.['nuxt.middleware.hook.name'] === 'onRequest' &&
        span.data?.['nuxt.middleware.hook.index'] === 0,
    );

    expect(onRequest0Span).toBeDefined();
    expect(onRequest0Span?.status).not.toBe('internal_error');
  });
});
