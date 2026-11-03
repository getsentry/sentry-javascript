import { SENTRY_SEGMENT_ID, SENTRY_OP } from '@sentry/conventions/attributes';
import { expect } from '@playwright/test';
import { sentryTest } from '../../../../../utils/fixtures';
import { shouldSkipTracingTest } from '../../../../../utils/helpers';
import { collectStreamedSpans, getSpanOp, waitForStreamedSpan } from '../../../../../utils/spanUtils';

sentryTest(
  "doesn't create a navigation.redirect span if a keypress happened before navigation",
  async ({ getLocalTestUrl, page }) => {
    if (shouldSkipTracingTest()) {
      sentryTest.skip();
    }

    const allSpans = collectStreamedSpans(page);
    const url = await getLocalTestUrl({ testDir: __dirname });

    const pageloadSpanPromise = waitForStreamedSpan(page, span => getSpanOp(span) === 'pageload');
    const navigationSpanPromise = waitForStreamedSpan(page, span => getSpanOp(span) === 'navigation');

    await page.goto(url);
    await page.focus('#btn1');
    await page.keyboard.press('Enter');

    const pageloadSpan = await pageloadSpanPromise;
    await page.evaluate(() => (window as any).Sentry.flush());
    // Ensure a navigation span is sent, too
    await navigationSpanPromise;

    const spans = allSpans.filter(span => span.attributes[SENTRY_SEGMENT_ID]?.value === pageloadSpan.span_id);

    expect(spans).not.toContainEqual(
      expect.objectContaining({
        attributes: expect.objectContaining({ [SENTRY_OP]: { type: 'string', value: 'navigation.redirect' } }),
      }),
    );
  },
);
