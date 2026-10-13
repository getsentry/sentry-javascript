import { expect, test } from '@playwright/test';
import { collectStreamedSpansUntilSegment, getSpanOp, waitForError } from '@sentry-internal/test-utils';
import { IMPORT_SURFACES } from './importSurfaces';

// Nitro runs every file in `server/middleware/` on every request, so each surface tells its spans apart by
// middleware name. `nuxt/server` has no object syntax (`onRequest`, `onBeforeResponse`) and no `eventHandler`
// alias, so only the simple middleware has a copy.
const MIDDLEWARE = {
  '#imports': {
    names: ['01.first', '02.second', '03.auth', '04.hooks', '05.array-hooks'],
    simpleNames: ['01.first', '02.second', '03.auth'],
    // 3 simple + 3 hooks (onRequest+handler+onBeforeResponse) + 5 array hooks (2 onRequest + 1 handler + 2 onBeforeResponse)
    spanCount: 11,
    authName: '03.auth',
    authErrorQuery: 'throwError=true',
    authErrorMessage: 'Auth middleware error',
  },
  'nuxt/server': {
    names: ['06.nuxt-server-first', '07.nuxt-server-auth'],
    simpleNames: ['06.nuxt-server-first', '07.nuxt-server-auth'],
    spanCount: 2,
    authName: '07.nuxt-server-auth',
    authErrorQuery: 'throwNuxtServerError=true',
    authErrorMessage: 'nuxt/server auth middleware error',
  },
} as const;

async function collectRequestSpans(path = '/api/middleware-test') {
  const spans = await collectStreamedSpansUntilSegment('nuxt-4', span => span.attributes['url.path']?.value === path);
  const rootSpan = spans.find(span => span.is_segment && span.attributes['url.path']?.value === path);

  return spans.filter(span => span.trace_id === rootSpan?.trace_id);
}

IMPORT_SURFACES.forEach(({ name, apiPrefix }) => {
  const middleware = MIDDLEWARE[name];
  const path = `${apiPrefix}/middleware-test`;
  const isSurfaceMiddlewareSpan = (span: { attributes: Record<string, { value?: unknown } | undefined> }) =>
    (middleware.names as readonly unknown[]).includes(span.attributes['nuxt.middleware.name']?.value);

  test.describe(`Server Middleware Instrumentation (${name})`, () => {
    test('should create separate spans for each server middleware', async ({ request }) => {
      const spansPromise = collectRequestSpans(path);

      const response = await request.get(path);
      expect(response.status()).toBe(200);

      const responseData = await response.json();
      expect(responseData.message).toBe('Server middleware test endpoint');

      const spans = await spansPromise;

      const middlewareSpans = spans.filter(span => getSpanOp(span) === 'middleware' && isSurfaceMiddlewareSpan(span));

      expect(middlewareSpans).toHaveLength(middleware.spanCount);

      const findSpanByName = (middlewareName: string) =>
        middlewareSpans.find(span => span.attributes['nuxt.middleware.name']?.value === middlewareName);

      middleware.names.forEach(middlewareName => {
        expect(findSpanByName(middlewareName)).toBeDefined();
      });

      middleware.simpleNames.forEach(middlewareName => {
        expect(findSpanByName(middlewareName)).toEqual(
          expect.objectContaining({
            is_segment: false,
            attributes: expect.objectContaining({
              'sentry.op': { type: 'string', value: 'middleware' },
              'sentry.origin': { type: 'string', value: 'auto.middleware.nuxt' },
              'http.request.method': { type: 'string', value: 'GET' },
              'http.route': { type: 'string', value: path },
            }),
            parent_span_id: expect.stringMatching(/[a-f0-9]{16}/),
            span_id: expect.stringMatching(/[a-f0-9]{16}/),
            trace_id: expect.stringMatching(/[a-f0-9]{32}/),
          }),
        );
      });

      // Verify spans have different span IDs (each middleware gets its own span)
      const uniqueSpanIds = new Set(middlewareSpans.map(span => span.span_id));
      expect(uniqueSpanIds.size).toBe(middleware.spanCount);

      const uniqueTraceIds = new Set(middlewareSpans.map(span => span.trace_id));
      expect(uniqueTraceIds.size).toBe(1);
    });

    test('middleware spans should have proper parent-child relationship', async ({ request }) => {
      const spansPromise = collectRequestSpans(path);

      await request.get(path);
      const spans = await spansPromise;

      const segmentSpan = spans.find(span => span.is_segment && span.attributes['url.path']?.value === path);
      const middlewareSpans = spans.filter(span => getSpanOp(span) === 'middleware' && isSurfaceMiddlewareSpan(span));

      expect(middlewareSpans).toHaveLength(middleware.spanCount);
      middlewareSpans.forEach(span => {
        expect(span.parent_span_id).toBe(segmentSpan?.span_id);
      });
    });

    test('should capture errors thrown in middleware and associate them with the span', async ({ request }) => {
      const spansPromise = collectRequestSpans(path);

      const errorEventPromise = waitForError('nuxt-4', errorEvent => {
        return errorEvent?.exception?.values?.[0]?.value === middleware.authErrorMessage;
      });

      const response = await request.get(`${path}?${middleware.authErrorQuery}`);

      expect(response.status()).toBe(500);

      const [spans, errorEvent] = await Promise.all([spansPromise, errorEventPromise]);

      const authMiddlewareSpan = spans.find(
        span =>
          getSpanOp(span) === 'middleware' && span.attributes['nuxt.middleware.name']?.value === middleware.authName,
      );

      expect(authMiddlewareSpan).toBeDefined();
      expect(authMiddlewareSpan?.status).toBe('error');

      expect(errorEvent.transaction).toContain(`GET ${path}`);

      expect(errorEvent.exception?.values?.[0]).toEqual(
        expect.objectContaining({
          value: middleware.authErrorMessage,
          type: 'Error',
          mechanism: expect.objectContaining({
            handled: false,
            type: 'auto.middleware.nuxt',
          }),
        }),
      );
    });
  });
});

// `nuxt/server` has no object syntax for middleware hooks, so these only run on the classic surface.
test.describe('Server Middleware Instrumentation (#imports hooks)', () => {
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
    const findSpanByHook = (hook: string) =>
      hooksSpans.find(span => span.attributes['nuxt.middleware.hook.name']?.value === hook);

    const onRequestSpan = findSpanByHook('onRequest');
    const handlerSpan = findSpanByHook('handler');
    const onBeforeResponseSpan = findSpanByHook('onBeforeResponse');

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

    // Verify hook-specific attributes
    expect(onRequestSpan?.attributes['nuxt.middleware.hook.name']?.value).toBe('onRequest');
    expect(handlerSpan?.attributes['nuxt.middleware.hook.name']?.value).toBe('handler');
    expect(onBeforeResponseSpan?.attributes['nuxt.middleware.hook.name']?.value).toBe('onBeforeResponse');

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

    const errorEventPromise = waitForError('nuxt-4', errorEvent => {
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

    const errorEventPromise = waitForError('nuxt-4', errorEvent => {
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

    const errorEventPromise = waitForError('nuxt-4', errorEvent => {
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
