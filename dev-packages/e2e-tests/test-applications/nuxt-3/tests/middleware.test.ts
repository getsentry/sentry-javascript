import { expect, test } from '@playwright/test';
import { collectStreamedSpans, getSpanOp, waitForError } from '@sentry-internal/test-utils';

// Streamed spans are flushed across multiple envelopes as they end, so the middleware child spans can
// arrive in a different envelope than the `is_segment` root span. Accumulate until the root span is seen.
function collectRequestSpans() {
  return collectStreamedSpans('nuxt-3', spans =>
    spans.some(span => span.name === 'GET /api/middleware-test' && span.is_segment),
  );
}

test.describe('Server Middleware Instrumentation', () => {
  test('should create separate spans for each server middleware', async ({ request }) => {
    const spansPromise = collectRequestSpans();

    // Make request to the API endpoint that will trigger all server middleware
    const response = await request.get('/api/middleware-test');
    expect(response.status()).toBe(200);

    const responseData = await response.json();
    expect(responseData.message).toBe('Server middleware test endpoint');

    const spans = await spansPromise;

    // Verify that we have spans for each middleware
    const middlewareSpans = spans.filter(span => getSpanOp(span) === 'middleware');

    // 3 simple + 3 hooks (onRequest+handler+onBeforeResponse) + 5 array hooks (2 onRequest + 1 handler + 2 onBeforeResponse)
    expect(middlewareSpans).toHaveLength(11);

    // Check for specific middleware spans
    const findByName = (name: string) =>
      middlewareSpans.find(span => span.attributes['nuxt.middleware.name']?.value === name);

    const firstMiddlewareSpan = findByName('01.first');
    const secondMiddlewareSpan = findByName('02.second');
    const authMiddlewareSpan = findByName('03.auth');
    const hooksOnRequestSpan = findByName('04.hooks');
    const arrayHooksHandlerSpan = findByName('05.array-hooks');

    expect(firstMiddlewareSpan).toBeDefined();
    expect(secondMiddlewareSpan).toBeDefined();
    expect(authMiddlewareSpan).toBeDefined();
    expect(hooksOnRequestSpan).toBeDefined();
    expect(arrayHooksHandlerSpan).toBeDefined();

    // Verify each span has the correct attributes
    [firstMiddlewareSpan, secondMiddlewareSpan, authMiddlewareSpan].forEach(span => {
      expect(span).toEqual(
        expect.objectContaining({
          is_segment: false,
          attributes: expect.objectContaining({
            'sentry.op': { type: 'string', value: 'middleware' },
            'sentry.origin': { type: 'string', value: 'auto.middleware.nuxt' },
            'http.request.method': { type: 'string', value: 'GET' },
            'http.route': { type: 'string', value: '/api/middleware-test' },
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
    const spansPromise = collectRequestSpans();

    await request.get('/api/middleware-test');
    const spans = await spansPromise;

    const rootSpan = spans.find(span => span.name === 'GET /api/middleware-test' && span.is_segment);
    const middlewareSpans = spans.filter(span => getSpanOp(span) === 'middleware');

    // All middleware spans should be children of the request's root span
    middlewareSpans.forEach(span => {
      expect(span.parent_span_id).toBe(rootSpan?.span_id);
    });
  });

  test('should capture errors thrown in middleware and associate them with the span', async ({ request }) => {
    const spansPromise = collectRequestSpans();

    const errorEventPromise = waitForError('nuxt-3', errorEvent => {
      return errorEvent?.exception?.values?.[0]?.value === 'Auth middleware error';
    });

    // Make request with query param to trigger error in auth middleware
    const response = await request.get('/api/middleware-test?throwError=true');

    // The request should fail due to the middleware error
    expect(response.status()).toBe(500);

    const [spans, errorEvent] = await Promise.all([spansPromise, errorEventPromise]);

    // Find the auth middleware span
    const authMiddlewareSpan = spans.find(
      span => getSpanOp(span) === 'middleware' && span.attributes['nuxt.middleware.name']?.value === '03.auth',
    );

    expect(authMiddlewareSpan).toBeDefined();

    // Verify the span has error status
    expect(authMiddlewareSpan?.status).toBe('error');

    // Verify the error event is associated with the correct request
    expect(errorEvent.transaction).toContain('GET /api/middleware-test');

    const exception = errorEvent.exception?.values?.[0];
    expect(exception).toEqual(
      expect.objectContaining({
        value: 'Auth middleware error',
        type: 'Error',
      }),
    );

    // Type and handled change depending on whether Nitro wraps the error before Sentry sees it.
    expect(exception?.mechanism?.type).toMatch(/^(auto\.middleware\.nuxt|chained)$/);
    if (exception?.mechanism?.type === 'chained') {
      expect(exception?.mechanism?.handled).toBe(true);
    } else {
      expect(exception?.mechanism?.handled).toBe(false);
    }
  });

  test('should create spans for onRequest and onBeforeResponse hooks', async ({ request }) => {
    const spansPromise = collectRequestSpans();

    // Make request to trigger middleware with hooks
    const response = await request.get('/api/middleware-test');
    expect(response.status()).toBe(200);

    const spans = await spansPromise;
    const middlewareSpans = spans.filter(span => getSpanOp(span) === 'middleware');

    // Find spans for the hooks middleware
    const hooksSpans = middlewareSpans.filter(span => span.attributes['nuxt.middleware.name']?.value === '04.hooks');

    // Should have spans for onRequest, handler, and onBeforeResponse
    expect(hooksSpans).toHaveLength(3);

    // Find specific hook spans
    const findByHook = (hook: string) =>
      hooksSpans.find(span => span.attributes['nuxt.middleware.hook.name']?.value === hook);

    const onRequestSpan = findByHook('onRequest');
    const handlerSpan = findByHook('handler');
    const onBeforeResponseSpan = findByHook('onBeforeResponse');

    expect(onRequestSpan).toBeDefined();
    expect(handlerSpan).toBeDefined();
    expect(onBeforeResponseSpan).toBeDefined();

    // Verify span names include hook types
    expect(onRequestSpan?.name).toBe('04.hooks.onRequest');
    expect(handlerSpan?.name).toBe('04.hooks');
    expect(onBeforeResponseSpan?.name).toBe('04.hooks.onBeforeResponse');

    // Verify all spans have correct middleware name (without hook suffix)
    [onRequestSpan, handlerSpan, onBeforeResponseSpan].forEach(span => {
      expect(span?.attributes['nuxt.middleware.name']?.value).toBe('04.hooks');
    });

    // Verify no index attributes for single hooks
    expect(onRequestSpan?.attributes['nuxt.middleware.hook.index']).toBeUndefined();
    expect(handlerSpan?.attributes['nuxt.middleware.hook.index']).toBeUndefined();
    expect(onBeforeResponseSpan?.attributes['nuxt.middleware.hook.index']).toBeUndefined();
  });

  test('should create spans with index attributes for array hooks', async ({ request }) => {
    const spansPromise = collectRequestSpans();

    // Make request to trigger middleware with array hooks
    const response = await request.get('/api/middleware-test');
    expect(response.status()).toBe(200);

    const spans = await spansPromise;
    const middlewareSpans = spans.filter(span => getSpanOp(span) === 'middleware');

    // Find spans for the array hooks middleware
    const arrayHooksSpans = middlewareSpans.filter(
      span => span.attributes['nuxt.middleware.name']?.value === '05.array-hooks',
    );

    // Should have spans for 2 onRequest + 1 handler + 2 onBeforeResponse = 5 spans
    expect(arrayHooksSpans).toHaveLength(5);

    // Find onRequest array spans
    const onRequestSpans = arrayHooksSpans.filter(
      span => span.attributes['nuxt.middleware.hook.name']?.value === 'onRequest',
    );
    expect(onRequestSpans).toHaveLength(2);

    // Find onBeforeResponse array spans
    const onBeforeResponseSpans = arrayHooksSpans.filter(
      span => span.attributes['nuxt.middleware.hook.name']?.value === 'onBeforeResponse',
    );
    expect(onBeforeResponseSpans).toHaveLength(2);

    // Find handler span
    const handlerSpan = arrayHooksSpans.find(span => span.attributes['nuxt.middleware.hook.name']?.value === 'handler');
    expect(handlerSpan).toBeDefined();

    // Verify index attributes for onRequest array
    const onRequest0Span = onRequestSpans.find(span => span.attributes['nuxt.middleware.hook.index']?.value === 0);
    const onRequest1Span = onRequestSpans.find(span => span.attributes['nuxt.middleware.hook.index']?.value === 1);

    expect(onRequest0Span).toBeDefined();
    expect(onRequest1Span).toBeDefined();

    // Verify index attributes for onBeforeResponse array
    const onBeforeResponse0Span = onBeforeResponseSpans.find(
      span => span.attributes['nuxt.middleware.hook.index']?.value === 0,
    );
    const onBeforeResponse1Span = onBeforeResponseSpans.find(
      span => span.attributes['nuxt.middleware.hook.index']?.value === 1,
    );

    expect(onBeforeResponse0Span).toBeDefined();
    expect(onBeforeResponse1Span).toBeDefined();

    // Verify span names for array handlers
    expect(onRequest0Span?.name).toBe('05.array-hooks.onRequest');
    expect(onRequest1Span?.name).toBe('05.array-hooks.onRequest');
    expect(onBeforeResponse0Span?.name).toBe('05.array-hooks.onBeforeResponse');
    expect(onBeforeResponse1Span?.name).toBe('05.array-hooks.onBeforeResponse');

    // Verify handler has no index
    expect(handlerSpan?.attributes['nuxt.middleware.hook.index']).toBeUndefined();
  });

  test('should handle errors in onRequest hooks', async ({ request }) => {
    const spansPromise = collectRequestSpans();

    const errorEventPromise = waitForError('nuxt-3', errorEvent => {
      return errorEvent?.exception?.values?.[0]?.value === 'OnRequest hook error';
    });

    // Make request with query param to trigger error in onRequest
    const response = await request.get('/api/middleware-test?throwOnRequestError=true');
    expect(response.status()).toBe(500);

    const [spans, errorEvent] = await Promise.all([spansPromise, errorEventPromise]);

    // Find the onRequest span that should have error status
    const onRequestSpan = spans.find(
      span =>
        getSpanOp(span) === 'middleware' &&
        span.attributes['nuxt.middleware.name']?.value === '04.hooks' &&
        span.attributes['nuxt.middleware.hook.name']?.value === 'onRequest',
    );

    expect(onRequestSpan).toBeDefined();
    expect(onRequestSpan?.status).toBe('error');
    expect(errorEvent.exception?.values?.[0]?.value).toBe('OnRequest hook error');
  });

  test('should handle errors in onBeforeResponse hooks', async ({ request }) => {
    const spansPromise = collectRequestSpans();

    const errorEventPromise = waitForError('nuxt-3', errorEvent => {
      return errorEvent?.exception?.values?.[0]?.value === 'OnBeforeResponse hook error';
    });

    // Make request with query param to trigger error in onBeforeResponse
    const response = await request.get('/api/middleware-test?throwOnBeforeResponseError=true');
    expect(response.status()).toBe(500);

    const [spans, errorEvent] = await Promise.all([spansPromise, errorEventPromise]);

    // Find the onBeforeResponse span that should have error status
    const onBeforeResponseSpan = spans.find(
      span =>
        getSpanOp(span) === 'middleware' &&
        span.attributes['nuxt.middleware.name']?.value === '04.hooks' &&
        span.attributes['nuxt.middleware.hook.name']?.value === 'onBeforeResponse',
    );

    expect(onBeforeResponseSpan).toBeDefined();
    expect(onBeforeResponseSpan?.status).toBe('error');
    expect(errorEvent.exception?.values?.[0]?.value).toBe('OnBeforeResponse hook error');
  });

  test('should handle errors in array hooks with proper index attribution', async ({ request }) => {
    const spansPromise = collectRequestSpans();

    const errorEventPromise = waitForError('nuxt-3', errorEvent => {
      return errorEvent?.exception?.values?.[0]?.value === 'OnRequest[1] hook error';
    });

    // Make request with query param to trigger error in second onRequest handler
    const response = await request.get('/api/middleware-test?throwOnRequest1Error=true');
    expect(response.status()).toBe(500);

    const [spans, errorEvent] = await Promise.all([spansPromise, errorEventPromise]);

    const findArrayHookSpan = (index: number) =>
      spans.find(
        span =>
          getSpanOp(span) === 'middleware' &&
          span.attributes['nuxt.middleware.name']?.value === '05.array-hooks' &&
          span.attributes['nuxt.middleware.hook.name']?.value === 'onRequest' &&
          span.attributes['nuxt.middleware.hook.index']?.value === index,
      );

    // Find the second onRequest span that should have error status
    const onRequest1Span = findArrayHookSpan(1);

    expect(onRequest1Span).toBeDefined();
    expect(onRequest1Span?.status).toBe('error');
    expect(errorEvent.exception?.values?.[0]?.value).toBe('OnRequest[1] hook error');

    // Verify the first onRequest handler still executed successfully
    const onRequest0Span = findArrayHookSpan(0);

    expect(onRequest0Span).toBeDefined();
    expect(onRequest0Span?.status).toBe('ok');
  });
});
