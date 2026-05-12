import { expect } from '@playwright/test';
import { sentryTest } from '../../../../utils/fixtures';
import { hidePage, shouldSkipTracingTest } from '../../../../utils/helpers';
import { getSpanOp, waitForStreamedSpan } from '../../../../utils/spanUtils';

sentryTest.beforeEach(async ({ page }) => {
  if (shouldSkipTracingTest()) {
    sentryTest.skip();
  }

  await page.setViewportSize({ width: 800, height: 1200 });
});

sentryTest(
  'captures TTFB and TTFB request time as attributes on the streamed pageload span',
  async ({ getLocalTestUrl, page }) => {
    const url = await getLocalTestUrl({ testDir: __dirname });

    const pageloadSpanPromise = waitForStreamedSpan(page, span => getSpanOp(span) === 'pageload');

    await page.goto(url);
    await hidePage(page);

    const pageloadSpan = await pageloadSpanPromise;

    // If responseStart === 0, TTFB is not reported.
    // This seems to happen somewhat randomly, so we handle it.
    const responseStart = await page.evaluate("performance.getEntriesByType('navigation')[0].responseStart;");
    if (responseStart !== 0) {
      expect(pageloadSpan.attributes?.['browser.web_vital.ttfb.value']?.type).toMatch(/^(double)|(integer)$/);
      expect(pageloadSpan.attributes?.['browser.web_vital.ttfb.value']?.value).toBeGreaterThan(0);
    }

    expect(pageloadSpan.attributes?.['browser.web_vital.ttfb.request_time']?.type).toMatch(/^(double)|(integer)$/);
  },
);
