import { expect } from '@playwright/test';
import { sentryTest } from '../../../../utils/fixtures';
import { hidePage, shouldSkipTracingTest } from '../../../../utils/helpers';
import { getSpanOp, waitForStreamedSpan } from '../../../../utils/spanUtils';

sentryTest.beforeEach(async ({ browserName, page }) => {
  if (shouldSkipTracingTest() || browserName !== 'chromium') {
    sentryTest.skip();
  }

  await page.setViewportSize({ width: 800, height: 1200 });
});

// Chromium 80-91 is within our supported range and reports layout shifts, but has no `Array.prototype.at`,
// which web-vitals' CLS code relies on.
sentryTest('does not throw on layout shifts without Array.prototype.at', async ({ getLocalTestUrl, page }) => {
  const pageErrors: string[] = [];
  page.on('pageerror', error => pageErrors.push(error.message));

  await page.addInitScript(() => {
    // @ts-expect-error - emulating Chromium < 92
    delete Array.prototype.at;
  });

  const url = await getLocalTestUrl({ testDir: __dirname });
  const pageloadSpanPromise = waitForStreamedSpan(page, span => getSpanOp(span) === 'pageload');

  await page.goto(url);
  await page.evaluate(() => new Promise(resolve => window.addEventListener('cls-done', resolve)));
  await hidePage(page);
  await pageloadSpanPromise;

  expect(pageErrors).toEqual([]);
});
