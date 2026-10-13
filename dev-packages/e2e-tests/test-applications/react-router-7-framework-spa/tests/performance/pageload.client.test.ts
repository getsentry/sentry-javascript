import { expect, test } from '@playwright/test';
import { getSpanOp, waitForStreamedSpan } from '@sentry-internal/test-utils';
import { APP_NAME } from '../constants';

test.describe('client - pageload performance', () => {
  test('should send pageload span', async ({ page }) => {
    const spanPromise = waitForStreamedSpan(APP_NAME, span => {
      return span.name === '/performance' && getSpanOp(span) === 'pageload' && span.is_segment;
    });

    await page.goto(`/performance`);
    await page.getByRole('heading', { name: 'Performance Page' }).waitFor();

    const span = await spanPromise;

    expect(span).toMatchObject({
      span_id: expect.any(String),
      trace_id: expect.any(String),
      start_timestamp: expect.any(Number),
      end_timestamp: expect.any(Number),
      is_segment: true,
      status: 'ok',
    });

    expect(span.attributes).toMatchObject({
      'sentry.origin': { value: 'auto.pageload.react_router', type: 'string' },
      'sentry.op': { value: 'pageload', type: 'string' },
      'sentry.segment.name.source': { value: 'route', type: 'string' },
      'sentry.environment': { value: 'qa', type: 'string' },
      'sentry.sdk.name': { value: 'sentry.javascript.react-router', type: 'string' },
      'sentry.sdk.version': { value: expect.any(String), type: 'string' },
      'sentry.sdk.integrations': { value: expect.arrayContaining([expect.any(String)]), type: 'array' },
      'url.template': { value: '/performance', type: 'string' },
      'url.path': { value: '/performance', type: 'string' },
      'url.full': { value: expect.stringMatching(/^https?:\/\/localhost:\d+\/performance$/), type: 'string' },
    });
  });

  test('should update pageload span for dynamic routes', async ({ page }) => {
    const spanPromise = waitForStreamedSpan(APP_NAME, span => {
      return span.name === '/performance/with/:param' && getSpanOp(span) === 'pageload' && span.is_segment;
    });

    await page.goto(`/performance/with/sentry`);
    await page.getByRole('heading', { name: 'Dynamic Parameter Page' }).waitFor();

    const span = await spanPromise;

    expect(span.attributes).toMatchObject({
      'sentry.origin': { value: 'auto.pageload.react_router', type: 'string' },
      'sentry.op': { value: 'pageload', type: 'string' },
      'sentry.segment.name.source': { value: 'route', type: 'string' },
      'sentry.environment': { value: 'qa', type: 'string' },
      'sentry.sdk.name': { value: 'sentry.javascript.react-router', type: 'string' },
      'url.template': { value: '/performance/with/:param', type: 'string' },
      'url.path': { value: '/performance/with/sentry', type: 'string' },
      'url.full': {
        value: expect.stringMatching(/^https?:\/\/localhost:\d+\/performance\/with\/sentry$/),
        type: 'string',
      },
    });
  });
});
