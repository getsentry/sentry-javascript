import { expect } from '@playwright/test';
import { sentryTest } from '../../../../utils/fixtures';
import { shouldSkipMetricsTest } from '../../../../utils/helpers';

sentryTest(
  'should emit afterCaptureMetric event with processed metric from beforeSendMetric',
  async ({ getLocalTestUrl, page }) => {
    // Only run this for npm package exports and CDN bundles with metrics
    if (shouldSkipMetricsTest()) {
      sentryTest.skip();
    }

    const url = await getLocalTestUrl({ testDir: __dirname });
    await page.goto(url);

    await page.waitForFunction(() => {
      return (window as any).capturedMetrics.length >= 2;
    });

    const capturedMetrics = await page.evaluate(() => {
      return (window as any).capturedMetrics;
    });

    expect(capturedMetrics).toHaveLength(2);

    // Verify the counter metric was modified by beforeSendMetric
    expect(capturedMetrics[0]).toMatchObject({
      name: 'test.counter',
      type: 'counter',
      value: 1,
      attributes: {
        endpoint: '/api/test',
        modified: 'by-beforeSendMetric',
        'sentry.release': '1.0.0',
        'sentry.environment': 'test',
        'sentry.sdk.name': 'sentry.javascript.browser',
      },
    });

    // Verify the 'original' attribute was removed by beforeSendMetric
    expect(capturedMetrics[0].attributes.original).toBeUndefined();

    // Verify the gauge metric was not modified (no beforeSendMetric processing)
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

    expect(capturedMetrics[0].attributes['sentry.sdk.version']).toBeDefined();
    expect(capturedMetrics[1].attributes['sentry.sdk.version']).toBeDefined();
  },
);
