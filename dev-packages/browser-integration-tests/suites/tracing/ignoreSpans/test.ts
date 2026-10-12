import { expect } from '@playwright/test';
import { sentryTest } from '../../../utils/fixtures';
import { shouldSkipTracingTest } from '../../../utils/helpers';
import { collectStreamedSpans, getSpanOp, waitForStreamedSpan } from '../../../utils/spanUtils';

sentryTest(
  'adjusts the end timestamp of the root idle span if child spans are ignored',
  async ({ getLocalTestUrl, page }) => {
    if (shouldSkipTracingTest()) {
      sentryTest.skip();
    }

    const spans = collectStreamedSpans(page);
    const pageloadRequestPromise = waitForStreamedSpan(page, span => span.is_segment && getSpanOp(span) === 'pageload');
    const url = await getLocalTestUrl({ testDir: __dirname });
    await page.goto(url);

    const eventData = await pageloadRequestPromise;

    const { start_timestamp: startTimestamp, end_timestamp: endTimestamp } = eventData;
    const durationSeconds = endTimestamp! - startTimestamp!;

    await page.evaluate(() => (window as any).Sentry.flush());

    expect(durationSeconds).toBeGreaterThan(0);
    expect(durationSeconds).toBeLessThan(1.5);

    expect(spans.some(span => span.name === 'take-me')).toBe(true);
    expect(spans.some(span => span.name?.includes('ignore-me'))).toBe(false);
  },
);
