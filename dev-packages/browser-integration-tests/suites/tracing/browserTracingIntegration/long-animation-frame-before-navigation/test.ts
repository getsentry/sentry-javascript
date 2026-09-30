import { expect } from '@playwright/test';
import { sentryTest } from '../../../../utils/fixtures';
import { shouldSkipTracingTest } from '../../../../utils/helpers';
import { collectStreamedSpans, getSpanOp, waitForStreamedSpan } from '../../../../utils/spanUtils';

sentryTest(
  "doesn't capture long animation frame that starts before a navigation.",
  async ({ browserName, getLocalTestUrl, page }) => {
    // Long animation frames only work on chrome
    sentryTest.skip(shouldSkipTracingTest() || browserName !== 'chromium');

    const url = await getLocalTestUrl({ testDir: __dirname });

    const allSpans = collectStreamedSpans(page);
    const navigationSpanPromise = waitForStreamedSpan(page, span => getSpanOp(span) === 'navigation');

    await page.goto(url);

    await page.locator('#clickme').click();

    const navigationRoot = await navigationSpanPromise;
    await page.evaluate(() => (window as any).Sentry.flush());
    expect(getSpanOp(navigationRoot)).toBe('navigation');
    const spans = allSpans.filter(span => span.attributes['sentry.segment.id']?.value === navigationRoot.span_id);

    const loafSpans = spans.filter(s => getSpanOp(s)?.startsWith('ui.long_animation_frame'));
    expect(loafSpans).toHaveLength(0);
  },
);
