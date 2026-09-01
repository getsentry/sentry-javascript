import { expect, test } from '@playwright/test';
import type { SerializedStreamedSpan } from '@sentry-internal/test-utils';
import {
  collectStreamedSpans,
  getSpanOp,
  waitForStreamedSpan,
  waitForStreamedSpans,
} from '@sentry-internal/test-utils';
import { APP_NAME } from '../constants';

function collectUntilSegment(segmentName: string, childFunctionName?: string): Promise<SerializedStreamedSpan[]> {
  return collectStreamedSpans(APP_NAME, spans => {
    return (
      spans.some(span => span.name === segmentName && span.is_segment) &&
      (!childFunctionName || spans.some(span => span.attributes['code.function.name']?.value === childFunctionName))
    );
  });
}

test.describe('server - instrumentation API performance', () => {
  test('should send server span on pageload with instrumentation API origin', async ({ page }) => {
    const spanPromise = waitForStreamedSpan(APP_NAME, span => {
      return span.name === 'GET /performance' && span.is_segment;
    });

    await page.goto(`/performance`);

    const span = await spanPromise;

    expect(span).toMatchObject({
      span_id: expect.any(String),
      trace_id: expect.any(String),
      start_timestamp: expect.any(Number),
      end_timestamp: expect.any(Number),
      is_segment: true,
    });

    expect(span.attributes).toMatchObject({
      'sentry.op': { value: 'http.server', type: 'string' },
      'sentry.origin': { value: 'auto.http.react_router.instrumentation_api', type: 'string' },
      'sentry.segment.name.source': { value: 'route', type: 'string' },
      'sentry.environment': { value: 'qa', type: 'string' },
      'sentry.sdk.name': { value: 'sentry.javascript.react-router', type: 'string' },
      'sentry.sdk.version': { value: expect.any(String), type: 'string' },
      'sentry.sdk.integrations': { value: expect.arrayContaining([expect.any(String)]), type: 'array' },
      'url.full': { value: expect.stringContaining('/performance'), type: 'string' },
    });
  });

  test('should send server span on parameterized route with instrumentation API origin', async ({ page }) => {
    const spanPromise = waitForStreamedSpan(APP_NAME, span => {
      return span.name === 'GET /performance/with/:param' && span.is_segment;
    });

    await page.goto(`/performance/with/some-param`);

    const span = await spanPromise;

    expect(span).toMatchObject({
      span_id: expect.any(String),
      trace_id: expect.any(String),
      start_timestamp: expect.any(Number),
      end_timestamp: expect.any(Number),
      is_segment: true,
    });

    expect(span.attributes).toMatchObject({
      'sentry.op': { value: 'http.server', type: 'string' },
      'sentry.origin': { value: 'auto.http.react_router.instrumentation_api', type: 'string' },
      'sentry.segment.name.source': { value: 'route', type: 'string' },
      'sentry.environment': { value: 'qa', type: 'string' },
      'url.full': { value: expect.stringContaining('/performance/with/some-param'), type: 'string' },
    });
  });

  test('should instrument server loader with instrumentation API origin', async ({ page }) => {
    const spansPromise = collectUntilSegment('GET /performance/server-loader', 'loader');

    await page.goto(`/performance/server-loader`);

    const spans = await spansPromise;

    const loaderSpan = spans.find(span => span.attributes['code.function.name']?.value === 'loader')!;

    expect(loaderSpan).toMatchObject({
      span_id: expect.any(String),
      trace_id: expect.any(String),
      name: '/performance/server-loader',
      parent_span_id: expect.any(String),
      start_timestamp: expect.any(Number),
      end_timestamp: expect.any(Number),
      status: 'ok',
    });

    expect(loaderSpan.attributes).toMatchObject({
      'sentry.origin': { value: 'auto.function.react_router.instrumentation_api', type: 'string' },
      'sentry.op': { value: 'function', type: 'string' },
      'code.function.name': { value: 'loader', type: 'string' },
    });
  });

  test('should instrument server action with instrumentation API origin', async ({ page }) => {
    const spansPromise = collectUntilSegment('POST /performance/server-action', 'action');

    await page.goto(`/performance/server-action`);
    await page.getByRole('button', { name: 'Submit' }).click();

    const spans = await spansPromise;

    const actionSpan = spans.find(span => span.attributes['code.function.name']?.value === 'action')!;

    expect(actionSpan).toMatchObject({
      span_id: expect.any(String),
      trace_id: expect.any(String),
      name: '/performance/server-action',
      parent_span_id: expect.any(String),
      start_timestamp: expect.any(Number),
      end_timestamp: expect.any(Number),
      status: 'ok',
    });

    expect(actionSpan.attributes).toMatchObject({
      'sentry.origin': { value: 'auto.function.react_router.instrumentation_api', type: 'string' },
      'sentry.op': { value: 'function', type: 'string' },
      'code.function.name': { value: 'action', type: 'string' },
    });
  });

  // Prod-only: the dev server (Vite) serves source modules (`/@vite/client`, `/app/*`) as separate
  // requests, each producing its own http.server segment, so "exactly one" only holds in prod.
  test('sends exactly one http.server segment per request (no double-instrumentation)', async ({ page }) => {
    test.skip(
      process.env.TEST_ENV === 'development',
      'Dev server emits extra http.server segments for module requests',
    );

    const httpServerSpanNames: string[] = [];
    void waitForStreamedSpans(APP_NAME, spans => {
      for (const span of spans) {
        if (getSpanOp(span) === 'http.server' && span.is_segment) {
          httpServerSpanNames.push(span.name);
        }
      }
      return false;
    });

    await page.goto(`/performance`);
    // Give any (erroneous) duplicate span time to arrive before asserting.
    await page.waitForTimeout(3000);

    expect(httpServerSpanNames).toEqual(['GET /performance']);
  });

  test('resolves a real http.route on routes without a loader/action', async ({ page }) => {
    // Regression guard for the server OTel removal: routes without a loader/action must still get a
    // proper `http.route` (not the catch-all `*` placeholder) from the underlying HTTP instrumentation.
    const spanPromise = waitForStreamedSpan(APP_NAME, span => {
      return span.name === 'GET /performance/ssr' && span.is_segment;
    });

    await page.goto(`/performance/ssr`);

    const span = await spanPromise;

    expect(getSpanOp(span)).toBe('http.server');
    expect(span.attributes['http.route']?.value).toBe('/performance/ssr');
  });
});
