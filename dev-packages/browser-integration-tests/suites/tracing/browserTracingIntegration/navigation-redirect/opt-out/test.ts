import { expect } from '@playwright/test';
import { sentryTest } from '../../../../../utils/fixtures';
import { shouldSkipTracingTest } from '../../../../../utils/helpers';
import { collectStreamedSpans, getSpanOp, waitForStreamedSpan } from '../../../../../utils/spanUtils';

sentryTest(
  "doesn't create a navigation.redirect span if `detectRedirects` is set to false",
  async ({ getLocalTestUrl, page }) => {
    if (shouldSkipTracingTest()) {
      sentryTest.skip();
    }

    const allSpans = collectStreamedSpans(page);
    const url = await getLocalTestUrl({ testDir: __dirname });

    const pageloadSpanPromise = waitForStreamedSpan(page, span => getSpanOp(span) === 'pageload');
    const navigationSpanPromise = waitForStreamedSpan(page, span => getSpanOp(span) === 'navigation');

    await page.goto(url);

    const pageloadSpan = await pageloadSpanPromise;
    await page.evaluate(() => (window as any).Sentry.flush());
    // Ensure a navigation span is sent, too
    await navigationSpanPromise;

    const spans = allSpans.filter(span => span.attributes['sentry.segment.id']?.value === pageloadSpan.span_id);

    expect(spans).not.toContainEqual(
      expect.objectContaining({
        attributes: expect.objectContaining({ 'sentry.op': { type: 'string', value: 'navigation.redirect' } }),
      }),
    );
  },
);
