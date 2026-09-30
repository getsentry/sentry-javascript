import { expect } from '@playwright/test';
import { sentryTest } from '../../../../utils/fixtures';
import { shouldSkipTracingTest } from '../../../../utils/helpers';
import { collectStreamedSpans, getSpanOp, waitForStreamedSpanAndTraceHeaderOnUrl } from '../../../../utils/spanUtils';

sentryTest('should create a pageload span when initialized delayed', async ({ getLocalTestUrl, page }) => {
  if (shouldSkipTracingTest()) {
    sentryTest.skip();
  }

  const url = await getLocalTestUrl({ testDir: __dirname });

  const spans = collectStreamedSpans(page);
  const [pageloadSpan] = await waitForStreamedSpanAndTraceHeaderOnUrl(
    page,
    url,
    span => getSpanOp(span) === 'pageload',
  );
  await page.evaluate(() => (window as any).Sentry.flush());
  const timeOrigin = await page.evaluate<number>('window._testBaseTimestamp');
  const timeoutTimestamp = await page.evaluate<number>('window._testTimeoutTimestamp');

  const { start_timestamp: startTimestamp } = pageloadSpan;

  expect(startTimestamp).toBeCloseTo(timeOrigin, 1);
  expect(startTimestamp).toBeLessThan(timeoutTimestamp);

  expect(getSpanOp(pageloadSpan)).toBe('pageload');
  expect(spans.filter(span => !span.is_segment).length).toBeGreaterThan(0);
  expect(pageloadSpan.attributes['sentry.segment.name.source']?.value).toEqual('url');
});
