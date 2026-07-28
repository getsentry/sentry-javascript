import { expect } from '@playwright/test';
import { sentryTest } from '../../../utils/fixtures';
import { shouldSkipTracingTest } from '../../../utils/helpers';
import { getSpanOp, waitForStreamedSpans } from '../../../utils/spanUtils';

sentryTest('does not capture mark and measure spans by default', async ({ getLocalTestUrl, page }) => {
  sentryTest.skip(shouldSkipTracingTest());

  const url = await getLocalTestUrl({ testDir: __dirname });
  const spansPromise = waitForStreamedSpans(page, spans => spans.some(span => getSpanOp(span) === 'pageload'));

  await page.goto(url);

  const spans = await spansPromise;
  const userTimingSpans = spans.filter(span => ['mark', 'measure'].includes(getSpanOp(span) ?? ''));

  expect(userTimingSpans).toHaveLength(0);
});
