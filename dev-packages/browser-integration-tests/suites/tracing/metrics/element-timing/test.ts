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

function isElementTimingMetricRequest(req: Request): boolean {
  if (!req.url().includes('/api/1337/envelope/')) return false;
  const metrics = extractMetricsFromRequest(req);
  return metrics.some(m => m.name.startsWith('element_timing.'));
}

function waitForElementTimingMetrics(page: Page): Promise<Request> {
  return page.waitForRequest(req => isElementTimingMetricRequest(req), { timeout: 15_000 });
}

sentryTest(
  'emits element timing metrics for elements rendered during pageload',
  async ({ getLocalTestUrl, page, browserName }) => {
    if (shouldSkipTracingTest() || shouldSkipMetricsTest() || browserName === 'webkit') {
      sentryTest.skip();
    }

    serveAssets(page);

    const url = await getLocalTestUrl({ testDir: __dirname });

    // Collect all metric requests
    const allMetricRequests: Request[] = [];
    page.on('request', req => {
      if (req.url().includes('/api/1337/envelope/')) {
        const metrics = extractMetricsFromRequest(req);
        if (metrics.some(m => m.name.startsWith('element_timing.'))) {
          allMetricRequests.push(req);
        }
      }
    });

    await page.goto(url);

    // Wait for at least one element timing metric envelope to arrive
    await waitForElementTimingMetrics(page);

    // Wait a bit more for slow images and lazy content + flush interval
    await page.waitForTimeout(8000);

    // Extract all element timing metrics from all collected requests
    const allMetrics = allMetricRequests.flatMap(req => extractMetricsFromRequest(req));
    const elementTimingMetrics = allMetrics.filter(m => m.name.startsWith('element_timing.'));

    const renderTimeMetrics = elementTimingMetrics.filter(m => m.name === 'element_timing.render_time');
    const loadTimeMetrics = elementTimingMetrics.filter(m => m.name === 'element_timing.load_time');

    const renderIdentifiers = renderTimeMetrics.map(m => m.attributes['element.identifier']?.value);
    const loadIdentifiers = loadTimeMetrics.map(m => m.attributes['element.identifier']?.value);

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
    const imageFastRender = renderTimeMetrics.find(m => m.attributes['element.identifier']?.value === 'image-fast');
    expect(imageFastRender).toMatchObject({
      name: 'element_timing.render_time',
      type: 'distribution',
      unit: 'millisecond',
      value: expect.any(Number),
    });
    expect(imageFastRender!.attributes['element.paint_type']?.value).toBe('image-paint');

    // Validate text-paint metric
    const text1Render = renderTimeMetrics.find(m => m.attributes['element.identifier']?.value === 'text1');
    expect(text1Render!.attributes['element.paint_type']?.value).toBe('text-paint');
  },
);

sentryTest('emits element timing metrics after navigation', async ({ getLocalTestUrl, page, browserName }) => {
  if (shouldSkipTracingTest() || shouldSkipMetricsTest() || browserName === 'webkit') {
    sentryTest.skip();
  }

  serveAssets(page);

  const url = await getLocalTestUrl({ testDir: __dirname });

  await page.goto(url);

  // Wait for pageload content to settle and flush
  await page.waitForTimeout(8000);

  // Now collect only post-navigation metrics
  const postNavMetricRequests: Request[] = [];
  page.on('request', req => {
    if (req.url().includes('/api/1337/envelope/')) {
      const metrics = extractMetricsFromRequest(req);
      if (metrics.some(m => m.name.startsWith('element_timing.'))) {
        postNavMetricRequests.push(req);
      }
    }
  });

  // Trigger navigation
  await page.locator('#button1').click();

  // Wait for navigation elements to render + flush interval
  await page.waitForTimeout(8000);

  const allMetrics = postNavMetricRequests.flatMap(req => extractMetricsFromRequest(req));
  const renderTimeMetrics = allMetrics.filter(m => m.name === 'element_timing.render_time');
  const renderIdentifiers = renderTimeMetrics.map(m => m.attributes['element.identifier']?.value);

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
