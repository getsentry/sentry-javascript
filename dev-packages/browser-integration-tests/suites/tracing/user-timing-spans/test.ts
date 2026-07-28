import { expect } from '@playwright/test';
import { sentryTest } from '../../../utils/fixtures';
import { shouldSkipTracingTest } from '../../../utils/helpers';
import { getSpanOp, waitForStreamedSpans } from '../../../utils/spanUtils';

sentryTest('captures non-ignored mark and measure spans', async ({ getLocalTestUrl, page }) => {
  sentryTest.skip(shouldSkipTracingTest());

  const url = await getLocalTestUrl({ testDir: __dirname });
  const spansPromise = waitForStreamedSpans(page, spans => spans.some(span => getSpanOp(span) === 'pageload'));

  await page.goto(url);

  const spans = await spansPromise;
  const userTimingSpans = spans
    .filter(span => ['mark', 'measure'].includes(getSpanOp(span) ?? ''))
    .map(span => ({ name: span.name, op: getSpanOp(span) }))
    .sort((a, b) => a.name.localeCompare(b.name));

  expect(userTimingSpans).toEqual([
    { name: 'mark-pass', op: 'mark' },
    { name: 'measure-pass', op: 'measure' },
  ]);
});
