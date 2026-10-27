import { expect, test } from '@playwright/test';
import { collectStreamedSpansUntilSegment, getSpanOp, waitForError } from '@sentry-internal/test-utils';
import type { SerializedStreamedSpan } from '@sentry-internal/test-utils';
import { IMPORT_SURFACES } from './importSurfaces';

// Nitro runs every file in `server/middleware/` on every request, so each surface tells its spans apart by
// middleware name. `nuxt/server` has no object syntax (`middleware`) and no `eventHandler` alias, so only the
// simple middleware has a copy.
const MIDDLEWARE = {
  nitro: {
    names: ['01.first', '02.second', '03.auth', '04.hooks', '05.array-hooks'],
    simpleNames: ['01.first', '02.second', '03.auth'],
    // 3 simple + 2 hooks (middleware+handler) + 3 array hooks (2 middleware + 1 handler)
    spanCount: 8,
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
  const spans = await collectStreamedSpansUntilSegment('nuxt-5', span => span.attributes['url.path']?.value === path);
  const rootSpan = spans.find(span => span.is_segment && span.attributes['url.path']?.value === path);

  return spans.filter(span => span.trace_id === rootSpan?.trace_id);
}

function findMiddlewareSpan(spans: SerializedStreamedSpan[], name: string, hook?: string, index?: number) {
  return spans.find(
    span =>
      getSpanOp(span) === 'middleware' &&
      span.attributes['nuxt.middleware.name']?.value === name &&
      (hook === undefined || span.attributes['nuxt.middleware.hook.name']?.value === hook) &&
      (index === undefined || span.attributes['nuxt.middleware.hook.index']?.value === index),
  );
}

IMPORT_SURFACES.forEach(({ name, apiPrefix }) => {
  const middleware = MIDDLEWARE[name];
  const path = `${apiPrefix}/middleware-test`;
  const getSurfaceMiddlewareSpans = (spans: SerializedStreamedSpan[]) =>
    spans.filter(
      span =>
        getSpanOp(span) === 'middleware' &&
        (middleware.names as readonly unknown[]).includes(span.attributes['nuxt.middleware.name']?.value),
    );

  test.describe(`Server Middleware Instrumentation (${name})`, () => {
    test('creates one span per server middleware', async ({ request }) => {
      const spansPromise = collectRequestSpans(path);

      const response = await request.get(path);
      expect(response.status()).toBe(200);
      expect((await response.json()).message).toBe('Server middleware test endpoint');

      const middlewareSpans = getSurfaceMiddlewareSpans(await spansPromise);

      expect(middlewareSpans).toHaveLength(middleware.spanCount);
      expect(new Set(middlewareSpans.map(span => span.span_id)).size).toBe(middleware.spanCount);
      expect(new Set(middlewareSpans.map(span => span.attributes['nuxt.middleware.name']?.value))).toEqual(
        new Set(middleware.names),
      );

      middleware.simpleNames.forEach(middlewareName => {
        const span = findMiddlewareSpan(middlewareSpans, middlewareName);

        expect(span?.name).toBe(middlewareName);
        expect(span?.is_segment).toBe(false);
        expect(span?.attributes['sentry.op']).toEqual({ type: 'string', value: 'middleware' });
        expect(span?.attributes['sentry.origin']).toEqual({ type: 'string', value: 'auto.middleware.nuxt' });
        expect(span?.attributes['http.request.method']).toEqual({ type: 'string', value: 'GET' });
        expect(span?.attributes['http.route']).toEqual({ type: 'string', value: path });
      });
    });

    test('parents middleware spans to the request segment', async ({ request }) => {
      const spansPromise = collectRequestSpans(path);

      await request.get(path);
      const spans = await spansPromise;

      const segmentSpan = spans.find(span => span.is_segment && span.attributes['url.path']?.value === path);
      const middlewareSpans = getSurfaceMiddlewareSpans(spans);

      expect(segmentSpan).toBeDefined();
      expect(middlewareSpans).toHaveLength(middleware.spanCount);
      middlewareSpans.forEach(span => {
        expect(span.parent_span_id).toBe(segmentSpan?.span_id);
      });
    });

    test('captures a middleware error and marks its span as errored', async ({ request }) => {
      const spansPromise = collectRequestSpans(path);
      const errorEventPromise = waitForError('nuxt-5', errorEvent => {
        return errorEvent?.exception?.values?.[0]?.value === middleware.authErrorMessage;
      });

      const response = await request.get(`${path}?${middleware.authErrorQuery}`);
      expect(response.status()).toBe(500);

      const [spans, errorEvent] = await Promise.all([spansPromise, errorEventPromise]);

      expect(findMiddlewareSpan(spans, middleware.authName)?.status).toBe('error');
      expect(errorEvent.transaction).toBe(`GET ${path}`);
      expect(errorEvent.exception?.values).toHaveLength(1);
      expect(errorEvent.exception?.values?.[0]?.type).toBe('Error');
      expect(errorEvent.exception?.values?.[0]?.value).toBe(middleware.authErrorMessage);
      expect(errorEvent.exception?.values?.[0]?.mechanism).toEqual({ handled: false, type: 'auto.middleware.nuxt' });
    });
  });
});

// `nuxt/server` has no object syntax for middleware hooks, so these only run on the classic surface.
test.describe('Server Middleware Instrumentation (nitro hooks)', () => {
  test('creates spans for the middleware and handler hooks', async ({ request }) => {
    const spansPromise = collectRequestSpans();

    const response = await request.get('/api/middleware-test');
    expect(response.status()).toBe(200);

    const spans = await spansPromise;
    const middlewareSpan = findMiddlewareSpan(spans, '04.hooks', 'middleware');
    const handlerSpan = findMiddlewareSpan(spans, '04.hooks', 'handler');

    // h3 v2 has no `onBeforeResponse`, so a hooks object gives only `middleware` and `handler` spans.
    expect(spans.filter(span => span.attributes['nuxt.middleware.name']?.value === '04.hooks')).toHaveLength(2);

    expect(middlewareSpan?.name).toBe('04.hooks.middleware');
    // h3 v2 always stores `middleware` as an array, so even a single hook has an index.
    expect(middlewareSpan?.attributes['nuxt.middleware.hook.index']?.value).toBe(0);

    expect(handlerSpan?.name).toBe('04.hooks');
    expect(handlerSpan?.attributes['nuxt.middleware.hook.index']).toBeUndefined();
  });

  test('sets index attributes on array middleware spans', async ({ request }) => {
    const spansPromise = collectRequestSpans();

    const response = await request.get('/api/middleware-test');
    expect(response.status()).toBe(200);

    const spans = await spansPromise;
    const arrayHooksSpans = spans.filter(span => span.attributes['nuxt.middleware.name']?.value === '05.array-hooks');
    const middleware0Span = findMiddlewareSpan(spans, '05.array-hooks', 'middleware', 0);
    const middleware1Span = findMiddlewareSpan(spans, '05.array-hooks', 'middleware', 1);
    const handlerSpan = findMiddlewareSpan(spans, '05.array-hooks', 'handler');

    expect(arrayHooksSpans).toHaveLength(3);
    expect(middleware0Span?.name).toBe('05.array-hooks.middleware');
    expect(middleware1Span?.name).toBe('05.array-hooks.middleware');
    expect(handlerSpan?.name).toBe('05.array-hooks');
    expect(handlerSpan?.attributes['nuxt.middleware.hook.index']).toBeUndefined();
  });

  test('marks a failing middleware hook span as errored', async ({ request }) => {
    const spansPromise = collectRequestSpans();
    const errorEventPromise = waitForError('nuxt-5', errorEvent => {
      return errorEvent?.exception?.values?.[0]?.value === 'OnRequest hook error';
    });

    const response = await request.get('/api/middleware-test?throwOnRequestError=true');
    expect(response.status()).toBe(500);

    const [spans, errorEvent] = await Promise.all([spansPromise, errorEventPromise]);

    expect(findMiddlewareSpan(spans, '04.hooks', 'middleware')?.status).toBe('error');
    expect(errorEvent.exception?.values?.[0]?.value).toBe('OnRequest hook error');
  });

  test('marks only the failing array middleware span as errored', async ({ request }) => {
    const spansPromise = collectRequestSpans();
    const errorEventPromise = waitForError('nuxt-5', errorEvent => {
      return errorEvent?.exception?.values?.[0]?.value === 'OnRequest[1] hook error';
    });

    const response = await request.get('/api/middleware-test?throwOnRequest1Error=true');
    expect(response.status()).toBe(500);

    const [spans, errorEvent] = await Promise.all([spansPromise, errorEventPromise]);

    expect(findMiddlewareSpan(spans, '05.array-hooks', 'middleware', 0)?.status).toBe('ok');
    expect(findMiddlewareSpan(spans, '05.array-hooks', 'middleware', 1)?.status).toBe('error');
    expect(errorEvent.exception?.values?.[0]?.value).toBe('OnRequest[1] hook error');
  });
});
