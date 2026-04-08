import type { Page, Route } from '@playwright/test';
import { expect } from '@playwright/test';
import type { SerializedMetric } from '@sentry/core';
import { sentryTest } from '../../../../utils/fixtures';
import { shouldSkipMetricsTest, shouldSkipTracingTest, waitForMetrics } from '../../../../utils/helpers';

function getIdentifier(m: SerializedMetric): unknown {
  return m.attributes?.['ui.element.identifier']?.value;
}

function getPaintType(m: SerializedMetric): unknown {
  return m.attributes?.['ui.element.paint_type']?.value;
}

sentryTest(
  'emits element timing metrics for elements rendered during pageload',
  async ({ getLocalTestUrl, page, browserName }) => {
    if (shouldSkipTracingTest() || shouldSkipMetricsTest() || browserName === 'webkit') {
      sentryTest.skip();
    }

    serveAssets(page);

    const url = await getLocalTestUrl({ testDir: __dirname });

    const expectedIdentifiers = ['image-fast', 'text1', 'button1', 'image-slow', 'lazy-image', 'lazy-text'];

    // Wait for all expected element identifiers to arrive as metrics
    const [allMetrics] = await Promise.all([
      waitForMetrics(page, metrics => {
        const seen = new Set(metrics.filter(m => m.name === 'ui.element.render_time').map(getIdentifier));
        return expectedIdentifiers.every(id => seen.has(id));
      }),
      page.goto(url),
    ]);

    const renderTimeMetrics = allMetrics.filter(m => m.name === 'ui.element.render_time');
    const loadTimeMetrics = allMetrics.filter(m => m.name === 'ui.element.load_time');

    const renderIdentifiers = renderTimeMetrics.map(getIdentifier);
    const loadIdentifiers = loadTimeMetrics.map(getIdentifier);

    // All text and image elements should have render_time
    expect(renderIdentifiers).toContain('image-fast');
    expect(renderIdentifiers).toContain('text1');
    expect(renderIdentifiers).toContain('button1');
    expect(renderIdentifiers).toContain('image-slow');
    expect(renderIdentifiers).toContain('lazy-image');
    expect(renderIdentifiers).toContain('lazy-text');

    // Image elements should also have load_time
    expect(loadIdentifiers).toContain('image-fast');
    expect(loadIdentifiers).toContain('image-slow');
    expect(loadIdentifiers).toContain('lazy-image');

    // Text elements should NOT have load_time (loadTime is 0 for text-paint)
    expect(loadIdentifiers).not.toContain('text1');
    expect(loadIdentifiers).not.toContain('button1');
    expect(loadIdentifiers).not.toContain('lazy-text');

    // Validate metric structure for image-fast
    const imageFastRender = renderTimeMetrics.find(m => getIdentifier(m) === 'image-fast');
    expect(imageFastRender).toMatchObject({
      name: 'ui.element.render_time',
      type: 'distribution',
      unit: 'millisecond',
      value: expect.any(Number),
    });
    expect(getPaintType(imageFastRender!)).toBe('image-paint');

    // Validate text-paint metric
    const text1Render = renderTimeMetrics.find(m => getIdentifier(m) === 'text1');
    expect(getPaintType(text1Render!)).toBe('text-paint');
  },
);

sentryTest('emits element timing metrics after navigation', async ({ getLocalTestUrl, page, browserName }) => {
  if (shouldSkipTracingTest() || shouldSkipMetricsTest() || browserName === 'webkit') {
    sentryTest.skip();
  }

  serveAssets(page);

  const url = await getLocalTestUrl({ testDir: __dirname });

  // Start listening before navigation to avoid missing metrics
  const pageloadMetricsPromise = waitForMetrics(page, metrics =>
    metrics.some(m => m.name === 'ui.element.render_time' && getIdentifier(m) === 'image-fast'),
  );

  await page.goto(url);

  // Wait for pageload element timing metrics to arrive before navigating
  await pageloadMetricsPromise;

  // Start listening before click to avoid missing metrics
  const navigationMetricsPromise = waitForMetrics(page, metrics => {
    const seen = new Set(metrics.filter(m => m.name === 'ui.element.render_time').map(getIdentifier));
    return seen.has('navigation-image') && seen.has('navigation-text');
  });

  // Trigger navigation
  await page.locator('#button1').click();

  // Wait for navigation element timing metrics
  const navigationMetrics = await navigationMetricsPromise;

  const renderTimeMetrics = navigationMetrics.filter(m => m.name === 'ui.element.render_time');
  const renderIdentifiers = renderTimeMetrics.map(getIdentifier);

  expect(renderIdentifiers).toContain('navigation-image');
  expect(renderIdentifiers).toContain('navigation-text');
});

function serveAssets(page: Page) {
  page.route(/image-(fast|lazy|navigation|click)\.png/, async (route: Route) => {
    await new Promise(resolve => setTimeout(resolve, 100));
    return route.fulfill({
      path: `${__dirname}/assets/sentry-logo-600x179.png`,
    });
  });

  page.route('**/image-slow.png', async (route: Route) => {
    await new Promise(resolve => setTimeout(resolve, 1500));
    return route.fulfill({
      path: `${__dirname}/assets/sentry-logo-600x179.png`,
    });
  });
}
