import type { Page, Route } from '@playwright/test';
import { expect } from '@playwright/test';
import type { Envelope, EnvelopeItem } from '@sentry/core';
import { sentryTest } from '../../../../utils/fixtures';
import {
  properFullEnvelopeRequestParser,
  shouldSkipMetricsTest,
  shouldSkipTracingTest,
} from '../../../../utils/helpers';

sentryTest(
  'emits element timing metrics for elements rendered during pageload',
  async ({ getLocalTestUrl, page, browserName }) => {
    if (shouldSkipTracingTest() || shouldSkipMetricsTest() || browserName === 'webkit') {
      sentryTest.skip();
    }

    serveAssets(page);

    const url = await getLocalTestUrl({ testDir: __dirname });

    const metricItems: EnvelopeItem[] = [];

    // Collect all metric envelope items
    page.on('request', request => {
      if (!request.url().includes('/api/1337/envelope/')) return;
      try {
        const envelope = properFullEnvelopeRequestParser<Envelope>(request);
        const items = envelope[1];
        for (const item of items) {
          const [header] = item;
          if (header.type === 'trace_metric') {
            metricItems.push(item);
          }
        }
      } catch {
        // ignore parse errors
      }
    });

    await page.goto(url);

    // Wait for slow image (1500ms) + lazy content (1000ms) + some buffer
    await page.waitForTimeout(3000);

    // Flatten all metric items into individual metrics
    const allMetrics = metricItems.flatMap(item => {
      const payload = item[1] as { items?: Array<Record<string, unknown>> };
      return payload.items || [];
    });

    const elementTimingMetrics = allMetrics.filter(
      m =>
        (m.name as string)?.startsWith('element_timing.'),
    );

    // We expect render_time for all elements and load_time for images
    const renderTimeMetrics = elementTimingMetrics.filter(m => m.name === 'element_timing.render_time');
    const loadTimeMetrics = elementTimingMetrics.filter(m => m.name === 'element_timing.load_time');

    // Check that we have render_time for known identifiers
    const renderIdentifiers = renderTimeMetrics.map(
      m => (m.attributes as Record<string, { value: string }>)['element.identifier']?.value,
    );

    expect(renderIdentifiers).toContain('image-fast');
    expect(renderIdentifiers).toContain('text1');
    expect(renderIdentifiers).toContain('button1');
    expect(renderIdentifiers).toContain('image-slow');
    expect(renderIdentifiers).toContain('lazy-image');
    expect(renderIdentifiers).toContain('lazy-text');

    // Check that image elements also have load_time
    const loadIdentifiers = loadTimeMetrics.map(
      m => (m.attributes as Record<string, { value: string }>)['element.identifier']?.value,
    );

    expect(loadIdentifiers).toContain('image-fast');
    expect(loadIdentifiers).toContain('image-slow');
    expect(loadIdentifiers).toContain('lazy-image');

    // Text elements should NOT have load_time (loadTime is 0 for text-paint)
    expect(loadIdentifiers).not.toContain('text1');
    expect(loadIdentifiers).not.toContain('button1');
    expect(loadIdentifiers).not.toContain('lazy-text');

    // Validate metric structure for image-fast
    const imageFastRender = renderTimeMetrics.find(
      m => (m.attributes as Record<string, { value: string }>)['element.identifier']?.value === 'image-fast',
    );
    expect(imageFastRender).toMatchObject({
      name: 'element_timing.render_time',
      type: 'distribution',
      unit: 'millisecond',
      value: expect.any(Number),
    });
    expect(
      (imageFastRender!.attributes as Record<string, { value: string }>)['element.paint_type']?.value,
    ).toBe('image-paint');

    // Validate text-paint metric
    const text1Render = renderTimeMetrics.find(
      m => (m.attributes as Record<string, { value: string }>)['element.identifier']?.value === 'text1',
    );
    expect(
      (text1Render!.attributes as Record<string, { value: string }>)['element.paint_type']?.value,
    ).toBe('text-paint');
  },
);

sentryTest(
  'emits element timing metrics after navigation',
  async ({ getLocalTestUrl, page, browserName }) => {
    if (shouldSkipTracingTest() || shouldSkipMetricsTest() || browserName === 'webkit') {
      sentryTest.skip();
    }

    serveAssets(page);

    const url = await getLocalTestUrl({ testDir: __dirname });

    const metricItems: EnvelopeItem[] = [];

    page.on('request', request => {
      if (!request.url().includes('/api/1337/envelope/')) return;
      try {
        const envelope = properFullEnvelopeRequestParser<Envelope>(request);
        const items = envelope[1];
        for (const item of items) {
          const [header] = item;
          if (header.type === 'trace_metric') {
            metricItems.push(item);
          }
        }
      } catch {
        // ignore parse errors
      }
    });

    await page.goto(url);

    // Wait for pageload to complete
    await page.waitForTimeout(2500);

    // Clear collected metrics from pageload
    metricItems.length = 0;

    // Trigger navigation
    await page.locator('#button1').click();

    // Wait for navigation elements to render
    await page.waitForTimeout(1500);

    const allMetrics = metricItems.flatMap(item => {
      const payload = item[1] as { items?: Array<Record<string, unknown>> };
      return payload.items || [];
    });

    const renderTimeMetrics = allMetrics.filter(m => m.name === 'element_timing.render_time');

    const renderIdentifiers = renderTimeMetrics.map(
      m => (m.attributes as Record<string, { value: string }>)['element.identifier']?.value,
    );

    expect(renderIdentifiers).toContain('navigation-image');
    expect(renderIdentifiers).toContain('navigation-text');
  },
);

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
