import { expect, test } from '@playwright/test';
import { waitForError, getSpanOp, collectStreamedSpansUntilSegment } from '@sentry-internal/test-utils';
import { APP_NAME } from './constants';

const SCENARIOS = [
  {
    name: 'root app middleware',
    prefix: '/test-middleware',
  },
  {
    name: 'sub-app middleware (route group)',
    prefix: '/test-subapp-middleware',
  },
] as const;

for (const { name, prefix } of SCENARIOS) {
  test.describe(name, () => {
    test('creates a span for named middleware', async ({ baseURL }) => {
      const segmentPromise = collectStreamedSpansUntilSegment(
        APP_NAME,
        segment => getSpanOp(segment) === 'http.server' && !!segment.name?.includes(`${prefix}/named`),
      );

      const response = await fetch(`${baseURL}${prefix}/named`);
      expect(response.status).toBe(200);

      const segmentSpans = await segmentPromise;
      const segment = segmentSpans.find(
        segment =>
          segment.is_segment && getSpanOp(segment) === 'http.server' && !!segment.name?.includes(`${prefix}/named`),
      )!;
      expect(segment.name).toBe(`GET ${prefix}/named`);

      const spans = segmentSpans.filter(
        span => !span.is_segment && span.attributes['sentry.segment.id']?.value === segment.span_id,
      );

      const middlewareSpan = spans.find(span => getSpanOp(span) === 'middleware' && span.name === 'middlewareA');

      expect(middlewareSpan).toEqual(
        expect.objectContaining({
          name: 'middlewareA',
          attributes: expect.objectContaining({
            'sentry.op': { value: 'middleware', type: 'string' },
            'sentry.origin': { value: 'auto.middleware.hono', type: 'string' },
          }),
        }),
      );
      expect(middlewareSpan?.status).not.toBe('error');

      const durationMs = (middlewareSpan!.end_timestamp - middlewareSpan!.start_timestamp) * 1000;
      expect(durationMs).toBeGreaterThanOrEqual(49);
    });

    test('creates a span for anonymous middleware', async ({ baseURL }) => {
      const segmentPromise = collectStreamedSpansUntilSegment(
        APP_NAME,
        segment => getSpanOp(segment) === 'http.server' && !!segment.name?.includes(`${prefix}/anonymous`),
      );

      const response = await fetch(`${baseURL}${prefix}/anonymous`);
      expect(response.status).toBe(200);

      const segmentSpans = await segmentPromise;
      const segment = segmentSpans.find(
        segment =>
          segment.is_segment && getSpanOp(segment) === 'http.server' && !!segment.name?.includes(`${prefix}/anonymous`),
      )!;
      expect(segment.name).toBe(`GET ${prefix}/anonymous`);

      const spans = segmentSpans.filter(
        span => !span.is_segment && span.attributes['sentry.segment.id']?.value === segment.span_id,
      );

      const anonymousSpan = spans.find(span => getSpanOp(span) === 'middleware' && span.name === '<anonymous>');
      expect(anonymousSpan).toBeDefined();
      expect(anonymousSpan?.attributes['sentry.origin']?.value).toBe('auto.middleware.hono');
      expect(anonymousSpan?.status).not.toBe('error');
    });

    test('multiple middleware are sibling spans under the same parent', async ({ baseURL }) => {
      const segmentPromise = collectStreamedSpansUntilSegment(
        APP_NAME,
        segment => getSpanOp(segment) === 'http.server' && !!segment.name?.includes(`${prefix}/multi`),
      );

      const response = await fetch(`${baseURL}${prefix}/multi`);
      expect(response.status).toBe(200);

      const segmentSpans = await segmentPromise;
      const segment = segmentSpans.find(
        segment =>
          segment.is_segment && getSpanOp(segment) === 'http.server' && !!segment.name?.includes(`${prefix}/multi`),
      )!;
      expect(segment.name).toBe(`GET ${prefix}/multi`);

      const spans = segmentSpans.filter(
        span => !span.is_segment && span.attributes['sentry.segment.id']?.value === segment.span_id,
      );

      const middlewareSpans = spans.sort((a, b) => (a.start_timestamp ?? 0) - (b.start_timestamp ?? 0));

      expect(middlewareSpans).toHaveLength(2);
      expect(middlewareSpans[0].name).toBe('middlewareA');
      expect(middlewareSpans[1].name).toBe('middlewareB');

      expect(middlewareSpans[0]?.parent_span_id).toBe(middlewareSpans[1]?.parent_span_id);

      // middlewareA has a 50ms delay, middlewareB has a 60ms delay
      const aDurationMs = (middlewareSpans[0].end_timestamp - middlewareSpans[0]?.start_timestamp) * 1000;
      const bDurationMs = (middlewareSpans[1].end_timestamp - middlewareSpans[1]?.start_timestamp) * 1000;
      expect(aDurationMs).toBeGreaterThanOrEqual(49);
      expect(bDurationMs).toBeGreaterThanOrEqual(59);
    });

    test('captures error thrown in middleware', async ({ baseURL }) => {
      const errorPromise = waitForError(APP_NAME, event => {
        return event.exception?.values?.[0]?.value === 'Middleware error';
      });

      const response = await fetch(`${baseURL}${prefix}/error`);
      expect(response.status).toBe(500);

      const errorEvent = await errorPromise;
      expect(errorEvent.exception?.values?.[0]?.value).toBe('Middleware error');
      expect(errorEvent.exception?.values?.[0]?.mechanism).toEqual(
        expect.objectContaining({
          handled: false,
          type: 'auto.http.hono.context_error',
        }),
      );

      // The transaction name on the error event determines the culprit shown in Sentry.
      expect(errorEvent.transaction).toBe(`GET ${prefix}/error`);
    });

    test('sets error status on middleware span when middleware throws', async ({ baseURL }) => {
      const segmentPromise = collectStreamedSpansUntilSegment(
        APP_NAME,
        segment => getSpanOp(segment) === 'http.server' && !!segment.name?.includes(`${prefix}/error`),
      );

      await fetch(`${baseURL}${prefix}/error`);

      const segmentSpans = await segmentPromise;
      const segment = segmentSpans.find(
        segment =>
          segment.is_segment && getSpanOp(segment) === 'http.server' && !!segment.name?.includes(`${prefix}/error`),
      )!;
      expect(segment.name).toBe(`GET ${prefix}/error`);

      const spans = segmentSpans.filter(
        span => !span.is_segment && span.attributes['sentry.segment.id']?.value === segment.span_id,
      );

      const failingSpan = spans.find(span => getSpanOp(span) === 'middleware' && span.status === 'error');

      expect(failingSpan).toBeDefined();
      expect(failingSpan?.status).toBe('error');
    });

    test('uses parameterized route in span name', async ({ baseURL }) => {
      const segmentPromise = collectStreamedSpansUntilSegment(
        APP_NAME,
        segment => getSpanOp(segment) === 'http.server' && !!segment.name?.includes(`${prefix}/param/`),
      );

      const response = await fetch(`${baseURL}${prefix}/param/42`);
      expect(response.status).toBe(200);

      const segmentSpans = await segmentPromise;
      const segment = segmentSpans.find(
        segment =>
          segment.is_segment && getSpanOp(segment) === 'http.server' && !!segment.name?.includes(`${prefix}/param/`),
      )!;
      expect(segment.name).toBe(`GET ${prefix}/param/:id`);

      const spans = segmentSpans.filter(
        span => !span.is_segment && span.attributes['sentry.segment.id']?.value === segment.span_id,
      );
      const middlewareSpan = spans.find(span => getSpanOp(span) === 'middleware' && span.name === 'middlewareA');
      expect(middlewareSpan).toBeDefined();
    });

    test('includes request data on error events from middleware', async ({ baseURL }) => {
      const errorPromise = waitForError(APP_NAME, event => {
        return event.exception?.values?.[0]?.value === 'Middleware error' && !!event.request?.url?.includes(prefix);
      });

      await fetch(`${baseURL}${prefix}/error`);

      const errorEvent = await errorPromise;
      expect(errorEvent.request).toEqual(
        expect.objectContaining({
          method: 'GET',
          url: expect.stringContaining(`${prefix}/error`),
        }),
      );
    });
  });
}

test.describe('.all() handler in sub-app', () => {
  test('does not create middleware span for .all() route handler', async ({ baseURL }) => {
    const segmentPromise = collectStreamedSpansUntilSegment(
      APP_NAME,
      segment =>
        getSpanOp(segment) === 'http.server' && !!segment.name?.includes('/test-subapp-middleware/all-handler'),
    );

    const response = await fetch(`${baseURL}/test-subapp-middleware/all-handler`);
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body).toEqual({ handler: 'all' });

    const segmentSpans = await segmentPromise;
    const segment = segmentSpans.find(
      segment =>
        segment.is_segment &&
        getSpanOp(segment) === 'http.server' &&
        !!segment.name?.includes('/test-subapp-middleware/all-handler'),
    )!;
    expect(segment.name).toBe('GET /test-subapp-middleware/all-handler');

    const spans = segmentSpans.filter(
      span => !span.is_segment && span.attributes['sentry.segment.id']?.value === segment.span_id,
    );

    // No middleware is called for this route, so there should be no spans.
    expect(spans).toEqual([]);
  });
});

const INLINE_PREFIX = '/test-inline-middleware';

const REGISTRATION_STYLES = [
  { name: 'direct method (.get())', path: '/direct' },
  { name: '.all()', path: '/all' },
  { name: '.on()', path: '/on' },
] as const;

const MIDDLEWARE_STYLES = [
  { name: 'inline', path: '' },
  { name: 'separately registered', path: '/separately' },
] as const;

test.describe('inline middleware spans (sub-app)', () => {
  for (const { name: regName, path: regPath } of REGISTRATION_STYLES) {
    for (const { name: mwName, path: mwPath } of MIDDLEWARE_STYLES) {
      test(`creates middleware span for ${mwName} middleware via ${regName}`, async ({ baseURL }) => {
        const fullPath = `${INLINE_PREFIX}${regPath}${mwPath}`;

        const segmentPromise = collectStreamedSpansUntilSegment(
          APP_NAME,
          segment => getSpanOp(segment) === 'http.server' && !!segment.name?.includes(fullPath),
        );

        const response = await fetch(`${baseURL}${fullPath}`);
        expect(response.status).toBe(200);

        const segmentSpans = await segmentPromise;
        const segment = segmentSpans.find(
          segment => segment.is_segment && getSpanOp(segment) === 'http.server' && !!segment.name?.includes(fullPath),
        )!;
        expect(segment.name).toBe(`GET ${fullPath}`);

        const EXPECTED_DESCRIPTIONS: Record<string, Record<string, string>> = {
          '/direct': { '': 'inlineMiddleware', '/separately': 'inlineSeparateMiddleware' },
          '/all': { '': 'inlineMiddlewareAll', '/separately': 'inlineSeparateMiddlewareAll' },
          '/on': { '': 'inlineMiddlewareOn', '/separately': 'inlineSeparateMiddlewareOn' },
        };
        const expectedDescription = EXPECTED_DESCRIPTIONS[regPath]![mwPath]!;

        const inlineSpan = segmentSpans
          .filter(span => !span.is_segment && span.attributes['sentry.segment.id']?.value === segment.span_id)
          .find(s => s.name === expectedDescription);
        expect(inlineSpan).toBeDefined();
        expect(getSpanOp(inlineSpan!)).toBe('middleware');
        expect(inlineSpan?.attributes['sentry.origin']?.value).toBe('auto.middleware.hono');
        expect(inlineSpan?.status).not.toBe('error');
      });
    }
  }
});

const MAIN_INLINE_PREFIX = '/test-main-inline';

const MAIN_INLINE_CASES = [
  { name: '.get()', path: '/get', method: 'GET', expectedMiddlewareName: 'mainInlineGet' },
  { name: '.post()', path: '/post', method: 'POST', expectedMiddlewareName: 'mainInlinePost' },
  { name: '.all()', path: '/all', method: 'GET', expectedMiddlewareName: 'mainInlineAll' },
] as const;

test.describe('inline middleware spans (main app)', () => {
  test('creates middleware span for inline middleware via .query()', async ({ baseURL }) => {
    const fullPath = `${MAIN_INLINE_PREFIX}/query`;
    const segmentPromise = collectStreamedSpansUntilSegment(
      APP_NAME,
      segment => getSpanOp(segment) === 'http.server' && segment.name === `QUERY ${fullPath}`,
    );

    const response = await fetch(`${baseURL}${fullPath}`, {
      method: 'QUERY',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value: 'query-body' }),
    });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ method: 'QUERY', value: 'query-body' });

    const segmentSpans = await segmentPromise;
    const segment = segmentSpans.find(
      segment => segment.is_segment && getSpanOp(segment) === 'http.server' && segment.name === `QUERY ${fullPath}`,
    )!;
    expect(segment.name).toBe(`QUERY ${fullPath}`);
    expect(getSpanOp(segment)).toBe('http.server');
    expect(segment.attributes['sentry.segment.name.source']?.value).toBe('route');
    expect(segment.attributes['http.request.method']?.value).toBe('QUERY');

    const middlewareSpans = segmentSpans
      .filter(span => !span.is_segment && span.attributes['sentry.segment.id']?.value === segment.span_id)
      .filter(span => getSpanOp(span) === 'middleware');
    expect(middlewareSpans).toHaveLength(1);
    expect(middlewareSpans[0]).toEqual(
      expect.objectContaining({
        name: 'mainInlineQuery',
        attributes: expect.objectContaining({
          'sentry.op': { value: 'middleware', type: 'string' },
          'sentry.origin': { value: 'auto.middleware.hono', type: 'string' },
        }),
      }),
    );
  });

  MAIN_INLINE_CASES.forEach(({ name, path, method, expectedMiddlewareName }) => {
    test(`creates middleware span for inline middleware via ${name}`, async ({ baseURL }) => {
      const fullPath = `${MAIN_INLINE_PREFIX}${path}`;

      const segmentPromise = collectStreamedSpansUntilSegment(
        APP_NAME,
        segment => getSpanOp(segment) === 'http.server' && segment.name === `${method} ${fullPath}`,
      );

      const response = await fetch(`${baseURL}${fullPath}`, { method });
      expect(response.status).toBe(200);

      const segmentSpans = await segmentPromise;
      const segment = segmentSpans.find(
        segment =>
          segment.is_segment && getSpanOp(segment) === 'http.server' && segment.name === `${method} ${fullPath}`,
      )!;
      expect(segment.name).toBe(`${method} ${fullPath}`);

      const spans = segmentSpans.filter(
        span => !span.is_segment && span.attributes['sentry.segment.id']?.value === segment.span_id,
      );
      const inlineSpan = spans.find(s => s.name === expectedMiddlewareName);

      expect(inlineSpan).toBeDefined();
      expect(getSpanOp(inlineSpan!)).toBe('middleware');
      expect(inlineSpan?.attributes['sentry.origin']?.value).toBe('auto.middleware.hono');
      expect(inlineSpan?.status).not.toBe('error');

      const middlewareSpans = spans.filter(s => getSpanOp(s) === 'middleware');
      expect(middlewareSpans).toHaveLength(1);
    });
  });

  test('creates spans for both .use() middleware and inline middleware via .get()', async ({ baseURL }) => {
    const fullPath = `${MAIN_INLINE_PREFIX}/combined/resource`;

    const segmentPromise = collectStreamedSpansUntilSegment(
      APP_NAME,
      segment => getSpanOp(segment) === 'http.server' && segment.name === `GET ${fullPath}`,
    );

    const response = await fetch(`${baseURL}${fullPath}`);
    expect(response.status).toBe(200);

    const segmentSpans = await segmentPromise;
    const segment = segmentSpans.find(
      segment => segment.is_segment && getSpanOp(segment) === 'http.server' && segment.name === `GET ${fullPath}`,
    )!;
    expect(segment.name).toBe(`GET ${fullPath}`);

    const spans = segmentSpans.filter(
      span => !span.is_segment && span.attributes['sentry.segment.id']?.value === segment.span_id,
    );
    const middlewareSpans = spans.filter(s => getSpanOp(s) === 'middleware');

    expect(middlewareSpans).toHaveLength(2);

    const [spanA, spanB] = middlewareSpans.sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''));
    expect(spanA.name).toBe('combinedInlineMw');
    expect(getSpanOp(spanA!)).toBe('middleware');
    expect(spanA.attributes['sentry.origin']?.value).toBe('auto.middleware.hono');
    expect(spanA?.status).not.toBe('error');

    expect(spanB.name).toBe('middlewareA');
    expect(getSpanOp(spanB!)).toBe('middleware');
    expect(spanB.attributes['sentry.origin']?.value).toBe('auto.middleware.hono');
    expect(spanB?.status).not.toBe('error');
  });
});
