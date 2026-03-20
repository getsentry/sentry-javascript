import type { Page, Request, Route } from '@playwright/test';
import { expect } from '@playwright/test';
import type { Envelope } from '@sentry/core';
import { sentryTest } from '../../../../utils/fixtures';
import {
  properFullEnvelopeRequestParser,
  shouldSkipMetricsTest,
  shouldSkipTracingTest,
} from '../../../../utils/helpers';

type MetricItem = Record<string, unknown> & {
  name: string;
  type: string;
  value: number;
  unit?: string;
  attributes: Record<string, { value: string | number; type: string }>;
};

function extractMetricsFromRequest(req: Request): MetricItem[] {
  try {
    const envelope = properFullEnvelopeRequestParser<Envelope>(req);
    const items = envelope[1];
    const metrics: MetricItem[] = [];
    for (const item of items) {
      const [header] = item;
      if (header.type === 'trace_metric') {
        const payload = item[1] as { items?: MetricItem[] };
        if (payload.items) {
          metrics.push(...payload.items);
        }
      }
    }
    return metrics;
  } catch {
    return [];
  }
}

/**
 * Collects element timing metrics from envelope requests on the page.
 * Returns a function to get all collected metrics so far and a function
 * that waits until all expected identifiers have been seen in render_time metrics.
 */
function createMetricCollector(page: Page) {
  const collectedRequests: Request[] = [];

  page.on('request', req => {
    if (!req.url().includes('/api/1337/envelope/')) return;
    const metrics = extractMetricsFromRequest(req);
    if (metrics.some(m => m.name.startsWith('element_timing.'))) {
      collectedRequests.push(req);
    }
  });

  function getAll(): MetricItem[] {
    return collectedRequests.flatMap(req => extractMetricsFromRequest(req));
  }

  async function waitForIdentifiers(identifiers: string[], timeout = 30_000): Promise<void> {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      const all = getAll().filter(m => m.name === 'element_timing.render_time');
      const seen = new Set(all.map(m => m.attributes['ui.element.identifier']?.value));
      if (identifiers.every(id => seen.has(id))) {
        return;
      }
      await page.waitForTimeout(500);
    }
    // Final check with assertion for clear error message
    const all = getAll().filter(m => m.name === 'element_timing.render_time');
    const seen = all.map(m => m.attributes['ui.element.identifier']?.value);
    for (const id of identifiers) {
      expect(seen).toContain(id);
    }
  }

  function reset(): void {
    collectedRequests.length = 0;
  }

  return { getAll, waitForIdentifiers, reset };
}

sentryTest(
  'emits element timing metrics for elements rendered during pageload',
  async ({ getLocalTestUrl, page, browserName }) => {
    if (shouldSkipTracingTest() || shouldSkipMetricsTest() || browserName === 'webkit') {
      sentryTest.skip();
    }

    serveAssets(page);

    const url = await getLocalTestUrl({ testDir: __dirname });
    const collector = createMetricCollector(page);

    await page.goto(url);

    // Wait until all expected element identifiers have been flushed as metrics
    await collector.waitForIdentifiers(['image-fast', 'text1', 'button1', 'image-slow', 'lazy-image', 'lazy-text']);

    const allMetrics = collector.getAll().filter(m => m.name.startsWith('element_timing.'));
    const renderTimeMetrics = allMetrics.filter(m => m.name === 'element_timing.render_time');
    const loadTimeMetrics = allMetrics.filter(m => m.name === 'element_timing.load_time');

    const renderIdentifiers = renderTimeMetrics.map(m => m.attributes['ui.element.identifier']?.value);
    const loadIdentifiers = loadTimeMetrics.map(m => m.attributes['ui.element.identifier']?.value);

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
    const imageFastRender = renderTimeMetrics.find(m => m.attributes['ui.element.identifier']?.value === 'image-fast');
    expect(imageFastRender).toMatchObject({
      name: 'element_timing.render_time',
      type: 'distribution',
      unit: 'millisecond',
      value: expect.any(Number),
    });
    expect(imageFastRender!.attributes['ui.element.paint_type']?.value).toBe('image-paint');

    // Validate text-paint metric
    const text1Render = renderTimeMetrics.find(m => m.attributes['ui.element.identifier']?.value === 'text1');
    expect(text1Render!.attributes['ui.element.paint_type']?.value).toBe('text-paint');
  },
);

sentryTest('emits element timing metrics after navigation', async ({ getLocalTestUrl, page, browserName }) => {
  if (shouldSkipTracingTest() || shouldSkipMetricsTest() || browserName === 'webkit') {
    sentryTest.skip();
  }

  serveAssets(page);

  const url = await getLocalTestUrl({ testDir: __dirname });
  const collector = createMetricCollector(page);

  await page.goto(url);

  // Wait for pageload element timing metrics to arrive before navigating
  await collector.waitForIdentifiers(['image-fast', 'text1']);

  // Reset so we only capture post-navigation metrics
  collector.reset();

  // Trigger navigation
  await page.locator('#button1').click();

  // Wait for navigation element timing metrics
  await collector.waitForIdentifiers(['navigation-image', 'navigation-text']);

  const allMetrics = collector.getAll();
  const renderTimeMetrics = allMetrics.filter(m => m.name === 'element_timing.render_time');
  const renderIdentifiers = renderTimeMetrics.map(m => m.attributes['ui.element.identifier']?.value);

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
