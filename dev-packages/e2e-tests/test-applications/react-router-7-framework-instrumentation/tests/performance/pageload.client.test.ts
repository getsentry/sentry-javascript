import { expect, test } from '@playwright/test';
import { getSpanOp, waitForStreamedSpan } from '@sentry-internal/test-utils';
import { APP_NAME } from '../constants';

test.describe('client - instrumentation API pageload', () => {
  test('should send pageload span', async ({ page }) => {
    const spanPromise = waitForStreamedSpan(APP_NAME, span => {
      return span.name === '/performance' && getSpanOp(span) === 'pageload' && span.is_segment;
    });

    await page.goto(`/performance`);

    const span = await spanPromise;

    expect(span.span_id).toEqual(expect.any(String));
    expect(span.trace_id).toEqual(expect.any(String));
    expect(span.attributes).toMatchObject({
      'url.template': { value: '/performance', type: 'string' },
      // react-router-serve 301-redirects the bare index route to a trailing slash in prod, while
      // the dev server serves it without - accept both.
      'url.path': { value: expect.stringMatching(/^\/performance\/?$/), type: 'string' },
      'url.full': { value: expect.stringMatching(/^https?:\/\/localhost:\d+\/performance\/?$/), type: 'string' },
    });
  });

  test('parameterizes the pageload span for dynamic routes', async ({ page }) => {
    const spanPromise = waitForStreamedSpan(APP_NAME, span => {
      return span.name === '/performance/with/:param' && getSpanOp(span) === 'pageload' && span.is_segment;
    });

    await page.goto(`/performance/with/some-param`);

    const span = await spanPromise;

    expect(span.attributes).toMatchObject({
      'sentry.segment.name.source': { value: 'route', type: 'string' },
      'url.template': { value: '/performance/with/:param', type: 'string' },
      'url.path': { value: '/performance/with/some-param', type: 'string' },
      'url.full': {
        value: expect.stringMatching(/^https?:\/\/localhost:\d+\/performance\/with\/some-param$/),
        type: 'string',
      },
    });
  });

  test('should link server and client spans with same trace_id', async ({ page }) => {
    const serverSpanPromise = waitForStreamedSpan(APP_NAME, span => {
      return span.name === 'GET /performance' && getSpanOp(span) === 'http.server' && span.is_segment;
    });

    const clientSpanPromise = waitForStreamedSpan(APP_NAME, span => {
      return span.name === '/performance' && getSpanOp(span) === 'pageload' && span.is_segment;
    });

    await page.goto(`/performance`);

    const [serverSpan, clientSpan] = await Promise.all([serverSpanPromise, clientSpanPromise]);

    // Both segments should share the same trace_id
    expect(serverSpan.trace_id).toBeDefined();
    expect(clientSpan.trace_id).toBeDefined();
    expect(serverSpan.trace_id).toBe(clientSpan.trace_id);

    // But have different span_ids
    expect(serverSpan.span_id).not.toBe(clientSpan.span_id);
  });
});
