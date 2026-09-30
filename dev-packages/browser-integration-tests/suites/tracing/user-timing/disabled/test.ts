import { expect } from '@playwright/test';
import { sentryTest } from '../../../../utils/fixtures';
import { shouldSkipTracingTest } from '../../../../utils/helpers';
import { collectStreamedSpans, getSpanOp, waitForStreamedSpan } from '../../../../utils/spanUtils';

sentryTest('does not capture mark and measure spans by default', async ({ getLocalTestUrl, page }) => {
  sentryTest.skip(shouldSkipTracingTest());

  const url = await getLocalTestUrl({ testDir: __dirname });
  const spans = collectStreamedSpans(page);
  const pageloadPromise = waitForStreamedSpan(page, span => span.is_segment && getSpanOp(span) === 'pageload');

  await page.goto(url);

  await pageloadPromise;
  await page.evaluate(() => (window as any).Sentry.flush());
  const userTimingSpans = spans.filter(span => ['mark', 'measure'].includes(getSpanOp(span) ?? ''));

  expect(userTimingSpans).toHaveLength(0);
});
