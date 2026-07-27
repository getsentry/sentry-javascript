import { expect } from '@playwright/test';
import { sentryTest } from '../../../utils/fixtures';
import { shouldSkipTracingTest } from '../../../utils/helpers';
import { getSpanOp, waitForStreamedSpans } from '../../../utils/spanUtils';

sentryTest('captures each mark and measure once with span streaming', async ({ getLocalTestUrl, page }) => {
  sentryTest.skip(shouldSkipTracingTest());

  const url = await getLocalTestUrl({ testDir: __dirname });
  const spansPromise = waitForStreamedSpans(page, spans => spans.some(span => getSpanOp(span) === 'pageload'));

  await page.goto(url);

  const spans = await spansPromise;
  const userTimingSpans = spans.filter(span => ['mark', 'measure'].includes(getSpanOp(span) ?? ''));
  expect(userTimingSpans).toHaveLength(3);
  expect(userTimingSpans.map(span => span.name).sort()).toEqual([
    'app-initialization',
    'app-ready',
    'sentry-tracing-init',
  ]);
});
