import { expect } from '@playwright/test';
import { sentryTest } from '../../../../utils/fixtures';
import { shouldSkipTracingTest } from '../../../../utils/helpers';
import { collectStreamedSpans, getSpanOp, waitForStreamedSpan } from '../../../../utils/spanUtils';

sentryTest('captures non-ignored mark and measure spans', async ({ getLocalTestUrl, page }) => {
  sentryTest.skip(shouldSkipTracingTest());

  const url = await getLocalTestUrl({ testDir: __dirname });
  const spans = collectStreamedSpans(page);
  const pageloadPromise = waitForStreamedSpan(page, span => span.is_segment && getSpanOp(span) === 'pageload');

  await page.goto(url);

  await pageloadPromise;
  await page.evaluate(() => (window as any).Sentry.flush());
  const userTimingSpans = spans
    .filter(span => ['mark', 'measure'].includes(getSpanOp(span) ?? ''))
    .map(span => ({
      name: span.name,
      op: getSpanOp(span),
      origin: span.attributes['sentry.origin']?.value,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  expect(userTimingSpans).toEqual([
    { name: 'mark-pass', op: 'mark', origin: 'auto.browser.user_timing.mark' },
    { name: 'measure-pass', op: 'measure', origin: 'auto.browser.user_timing.measure' },
  ]);
});
