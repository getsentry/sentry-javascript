import { expect } from '@playwright/test';
import { sentryTest } from '../../../../utils/fixtures';
import { shouldSkipTracingTest } from '../../../../utils/helpers';
import { collectStreamedSpans, getSpanOp, waitForStreamedSpan } from '../../../../utils/spanUtils';

sentryTest(
  "doesn't capture long task spans starting before a navigation in the navigation span",
  async ({ browserName, getLocalTestUrl, page }) => {
    // Long tasks only work on chrome
    sentryTest.skip(shouldSkipTracingTest() || browserName !== 'chromium');
    const url = await getLocalTestUrl({ testDir: __dirname });

    await page.route('**/path/to/script.js', route => route.fulfill({ path: `${__dirname}/assets/script.js` }));

    const allSpans = collectStreamedSpans(page);
    const navigationSpanPromise = waitForStreamedSpan(page, span => getSpanOp(span) === 'navigation');

    await page.goto(url);

    await page.locator('#myButton').click();

    const navigationRoot = await navigationSpanPromise;
    await page.evaluate(() => (window as any).Sentry.flush());
    const spans = allSpans.filter(span => span.attributes['sentry.segment.id']?.value === navigationRoot.span_id);

    const navigationSpan = spans.find(s => getSpanOp(s) === 'navigation');
    expect(navigationSpan).toBeDefined();

    const longTaskSpans = spans.filter(s => getSpanOp(s) === 'ui.long_task');
    expect(longTaskSpans).toHaveLength(0);
  },
);
