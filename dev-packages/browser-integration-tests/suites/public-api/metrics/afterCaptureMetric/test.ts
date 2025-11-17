import { expect } from '@playwright/test';
import { sentryTest } from '../../../../utils/fixtures';

sentryTest('should emit afterCaptureMetric event for captured metrics', async ({ getLocalTestUrl, page }) => {
  const bundle = process.env.PW_BUNDLE || '';
  if (bundle.startsWith('bundle') || bundle.startsWith('loader')) {
    sentryTest.skip();
  }

  const url = await getLocalTestUrl({ testDir: __dirname });
  await page.goto(url);

  await page.waitForFunction(() => {
    return (window as any).capturedMetrics.length >= 3;
  });

  const capturedMetrics = await page.evaluate(() => {
    return (window as any).capturedMetrics;
  });

  expect(capturedMetrics).toHaveLength(3);

  expect(capturedMetrics[0]).toMatchObject({
    name: 'test.counter',
    type: 'counter',
    value: 1,
    attributes: {
      endpoint: '/api/test',
      'sentry.release': '1.0.0',
      'sentry.environment': 'test',
      'sentry.sdk.name': 'sentry.javascript.browser',
    },
  });

  expect(capturedMetrics[1]).toMatchObject({
    name: 'test.gauge',
    type: 'gauge',
    unit: 'millisecond',
    value: 42,
    attributes: {
      server: 'test-1',
      'sentry.release': '1.0.0',
      'sentry.environment': 'test',
      'sentry.sdk.name': 'sentry.javascript.browser',
    },
  });

  expect(capturedMetrics[2]).toMatchObject({
    name: 'test.distribution',
    type: 'distribution',
    unit: 'second',
    value: 200,
    attributes: {
      priority: 'high',
      'user.id': 'user-123',
      'user.email': 'test@example.com',
      'user.name': 'testuser',
      'sentry.release': '1.0.0',
      'sentry.environment': 'test',
      'sentry.sdk.name': 'sentry.javascript.browser',
    },
  });

  expect(capturedMetrics[0].attributes['sentry.sdk.version']).toBeDefined();
  expect(capturedMetrics[1].attributes['sentry.sdk.version']).toBeDefined();
  expect(capturedMetrics[2].attributes['sentry.sdk.version']).toBeDefined();
});
