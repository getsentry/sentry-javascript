import { expect, test } from '@playwright/test';
import { getSpanOp, waitForStreamedSpan } from '@sentry-internal/test-utils';
import { APP_NAME } from '../constants';

test.describe('server - performance', () => {
  test('should send server span on pageload', async ({ page }) => {
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

    expect(getSpanOp(span)).toBe('http.server');
    expect(span.attributes).toMatchObject({
      'sentry.op': { value: 'http.server', type: 'string' },
      'sentry.origin': { value: 'auto.http.react_router.request_handler', type: 'string' },
      'sentry.segment.name.source': { value: 'route', type: 'string' },
      'sentry.environment': { value: 'qa', type: 'string' },
      'sentry.sdk.name': { value: 'sentry.javascript.react-router', type: 'string' },
      'sentry.sdk.version': { value: expect.any(String), type: 'string' },
      'sentry.sdk.integrations': { value: expect.arrayContaining([expect.any(String)]), type: 'array' },
      'url.full': { value: expect.stringContaining('/performance'), type: 'string' },
    });
  });

  test('should send server span on parameterized route', async ({ page }) => {
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

    expect(getSpanOp(span)).toBe('http.server');
    expect(span.attributes).toMatchObject({
      'sentry.op': { value: 'http.server', type: 'string' },
      'sentry.origin': { value: 'auto.http.react_router.request_handler', type: 'string' },
      'sentry.segment.name.source': { value: 'route', type: 'string' },
      'sentry.environment': { value: 'qa', type: 'string' },
      'sentry.sdk.name': { value: 'sentry.javascript.react-router', type: 'string' },
      'sentry.sdk.version': { value: expect.any(String), type: 'string' },
      'sentry.sdk.integrations': { value: expect.arrayContaining([expect.any(String)]), type: 'array' },
      'url.full': { value: expect.stringContaining('/performance/with/some-param'), type: 'string' },
    });
  });
});
