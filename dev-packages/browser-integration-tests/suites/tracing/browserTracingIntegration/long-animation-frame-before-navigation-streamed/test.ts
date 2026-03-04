import { expect } from '@playwright/test';
import { sentryTest } from '../../../../utils/fixtures';
import { shouldSkipTracingTest } from '../../../../utils/helpers';
import { getSpanOp, waitForStreamedSpans } from '../../../../utils/spanUtils';

sentryTest(
  "doesn't capture long animation frame that starts before a navigation.",
  async ({ browserName, getLocalTestUrl, page }) => {
    // Long animation frames only work on chrome
    sentryTest.skip(shouldSkipTracingTest() || browserName !== 'chromium');

    const url = await getLocalTestUrl({ testDir: __dirname });

    const navigationSpansPromise = waitForStreamedSpans(page, spans => spans.some(s => getSpanOp(s) === 'navigation'));

    await page.goto(url);

    await page.locator('#clickme').click();

    const spans = await navigationSpansPromise;

    const loafSpans = spans.filter(s => getSpanOp(s)?.startsWith('ui.long-animation-frame'));
    expect(loafSpans).toHaveLength(0);
  },
);
