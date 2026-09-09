import { expect, test } from '@playwright/test';
import { collectStreamedSpansUntilSegment, getSpanOp, waitForError } from '@sentry-internal/test-utils';

function collectRequestSpans() {
  return collectStreamedSpansUntilSegment(
    'nuxt-5',
    span => span.attributes['url.path']?.value === '/api/middleware-test',
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

    // 3 simple + 2 hooks (middleware+handler) + 3 array hooks (2 middleware + 1 handler)
    expect(middlewareSpans).toHaveLength(8);

    // Check for specific middleware spans
    const findSpanByName = (name: string) =>
      middlewareSpans.find(span => span.attributes['nuxt.middleware.name']?.value === name);

    const firstMiddlewareSpan = findSpanByName('01.first');
    const secondMiddlewareSpan = findSpanByName('02.second');
    const authMiddlewareSpan = findSpanByName('03.auth');
    const hooksOnRequestSpan = findSpanByName('04.hooks');
    const arrayHooksHandlerSpan = findSpanByName('05.array-hooks');

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
    // 3 simple + 2 hooks (middleware+handler) + 3 array hooks (2 middleware + 1 handler)
    expect(uniqueSpanIds.size).toBe(8);

    // Verify spans share the same trace ID
    const traceIds = middlewareSpans.map(span => span.trace_id);
    const uniqueTraceIds = new Set(traceIds);
    expect(uniqueTraceIds.size).toBe(1);
  });

  test('middleware spans should have proper parent-child relationship', async ({ request }) => {
    const spansPromise = collectRequestSpans();

    await request.get('/api/middleware-test');
    const spans = await spansPromise;

    const segmentSpan = spans.find(
      span => span.is_segment && span.attributes['url.path']?.value === '/api/middleware-test',
    );
    const middlewareSpans = spans.filter(span => getSpanOp(span) === 'middleware');

    // All middleware spans should be children of the request's segment span
    middlewareSpans.forEach(span => {
      expect(span.parent_span_id).toBe(segmentSpan?.span_id);
    });
  });

  test('should capture errors thrown in middleware and associate them with the span', async ({ request }) => {
    const spansPromise = collectRequestSpans();

    const errorEventPromise = waitForError('nuxt-5', errorEvent => {
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
    const spansPromise = collectRequestSpans();

    // Make request to trigger middleware with hooks
    const response = await request.get('/api/middleware-test');
    expect(response.status()).toBe(200);

    const spans = await spansPromise;
    const middlewareSpans = spans.filter(span => getSpanOp(span) === 'middleware');

    // Find spans for the hooks middleware
    const hooksSpans = middlewareSpans.filter(span => span.attributes['nuxt.middleware.name']?.value === '04.hooks');

    // Should have spans for middleware and handler (h3 v2 no longer has onBeforeResponse)
    expect(hooksSpans).toHaveLength(2);

    // Find specific hook spans
    const findSpanByHook = (hook: string) =>
      hooksSpans.find(span => span.attributes['nuxt.middleware.hook.name']?.value === hook);

    const middlewareSpan = findSpanByHook('middleware');
    const handlerSpan = findSpanByHook('handler');

    expect(middlewareSpan).toBeDefined();
    expect(handlerSpan).toBeDefined();

    // Verify span names include hook types
    expect(middlewareSpan?.name).toBe('04.hooks.middleware');
    expect(handlerSpan?.name).toBe('04.hooks');

    // Verify all spans have correct middleware name (without hook suffix)
    [middlewareSpan, handlerSpan].forEach(span => {
      expect(span?.attributes['nuxt.middleware.name']?.value).toBe('04.hooks');
    });

    // Verify hook-specific attributes
    expect(middlewareSpan?.attributes['nuxt.middleware.hook.name']?.value).toBe('middleware');
    expect(handlerSpan?.attributes['nuxt.middleware.hook.name']?.value).toBe('handler');

    // Verify middleware has index (middleware is always an array in h3 v2)
    expect(middlewareSpan?.attributes['nuxt.middleware.hook.index']?.value).toBe(0);
    expect(handlerSpan?.attributes['nuxt.middleware.hook.index']).toBeUndefined();
  });

  test('should create spans with index attributes for array middleware', async ({ request }) => {
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

    // Should have spans for 2 middleware + 1 handler = 3 spans (h3 v2 no longer has onBeforeResponse)
    expect(arrayHooksSpans).toHaveLength(3);

    // Find middleware array spans
    const middlewareArraySpans = arrayHooksSpans.filter(
      span => span.attributes['nuxt.middleware.hook.name']?.value === 'middleware',
    );
    expect(middlewareArraySpans).toHaveLength(2);

    // Find handler span
    const handlerSpan = arrayHooksSpans.find(span => span.attributes['nuxt.middleware.hook.name']?.value === 'handler');
    expect(handlerSpan).toBeDefined();

    // Verify index attributes for middleware array
    const middleware0Span = middlewareArraySpans.find(
      span => span.attributes['nuxt.middleware.hook.index']?.value === 0,
    );
    const middleware1Span = middlewareArraySpans.find(
      span => span.attributes['nuxt.middleware.hook.index']?.value === 1,
    );

    expect(middleware0Span).toBeDefined();
    expect(middleware1Span).toBeDefined();

    // Verify span names for array middleware handlers
    expect(middleware0Span?.name).toBe('05.array-hooks.middleware');
    expect(middleware1Span?.name).toBe('05.array-hooks.middleware');

    // Verify handler has no index
    expect(handlerSpan?.attributes['nuxt.middleware.hook.index']).toBeUndefined();
  });

  test('should handle errors in middleware hooks', async ({ request }) => {
    const spansPromise = collectRequestSpans();

    const errorEventPromise = waitForError('nuxt-5', errorEvent => {
      return errorEvent?.exception?.values?.[0]?.value === 'OnRequest hook error';
    });

    // Make request with query param to trigger error in middleware
    const response = await request.get('/api/middleware-test?throwOnRequestError=true');
    expect(response.status()).toBe(500);

    const [spans, errorEvent] = await Promise.all([spansPromise, errorEventPromise]);

    // Find the middleware span that should have error status
    const middlewareSpan = spans.find(
      span =>
        getSpanOp(span) === 'middleware' &&
        span.attributes['nuxt.middleware.name']?.value === '04.hooks' &&
        span.attributes['nuxt.middleware.hook.name']?.value === 'middleware',
    );

    expect(middlewareSpan).toBeDefined();
    expect(middlewareSpan?.status).toBe('error');
    expect(errorEvent.exception?.values?.[0]?.value).toBe('OnRequest hook error');
  });

  test('should handle errors in array middleware with proper index attribution', async ({ request }) => {
    const spansPromise = collectRequestSpans();

    const errorEventPromise = waitForError('nuxt-5', errorEvent => {
      return errorEvent?.exception?.values?.[0]?.value === 'OnRequest[1] hook error';
    });

    // Make request with query param to trigger error in second middleware handler
    const response = await request.get('/api/middleware-test?throwOnRequest1Error=true');
    expect(response.status()).toBe(500);

    const [spans, errorEvent] = await Promise.all([spansPromise, errorEventPromise]);

    const findArrayHookSpan = (index: number) =>
      spans.find(
        span =>
          getSpanOp(span) === 'middleware' &&
          span.attributes['nuxt.middleware.name']?.value === '05.array-hooks' &&
          span.attributes['nuxt.middleware.hook.name']?.value === 'middleware' &&
          span.attributes['nuxt.middleware.hook.index']?.value === index,
      );

    // Find the second middleware span that should have error status
    const middleware1Span = findArrayHookSpan(1);

    expect(middleware1Span).toBeDefined();
    expect(middleware1Span?.status).toBe('error');
    expect(errorEvent.exception?.values?.[0]?.value).toBe('OnRequest[1] hook error');

    // Verify the first middleware handler still executed successfully
    const middleware0Span = findArrayHookSpan(0);

    expect(middleware0Span).toBeDefined();
    expect(middleware0Span?.status).not.toBe('error');
  });
});
