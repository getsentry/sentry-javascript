import { expect } from '@playwright/test';
import { sentryTest } from '../../../../utils/fixtures';
import { shouldSkipTracingTest } from '../../../../utils/helpers';
import { getSpanOp, waitForStreamedSpans } from '../../../../utils/spanUtils';

sentryTest(
  "doesn't capture long task spans starting before a navigation in the navigation transaction",
  async ({ browserName, getLocalTestUrl, page }) => {
    // Long tasks only work on chrome
    if (shouldSkipTracingTest() || browserName !== 'chromium') {
      sentryTest.skip();
    }
    const url = await getLocalTestUrl({ testDir: __dirname });

    await page.route('**/path/to/script.js', route => route.fulfill({ path: `${__dirname}/assets/script.js` }));

    const navigationSpansPromise = waitForStreamedSpans(page, spans => spans.some(s => getSpanOp(s) === 'navigation'));

    await page.goto(url);

    await page.locator('#myButton').click();

    const spans = await navigationSpansPromise;

    const navigationSpan = spans.find(s => getSpanOp(s) === 'navigation');
    expect(navigationSpan).toBeDefined();

    const longTaskSpans = spans.filter(s => getSpanOp(s) === 'ui.long-task');
    expect(longTaskSpans).toHaveLength(0);
  },
);
