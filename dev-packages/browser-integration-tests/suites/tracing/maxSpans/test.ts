import { expect } from '@playwright/test';
import { sentryTest } from '../../../utils/fixtures';
import { shouldSkipTracingTest } from '../../../utils/helpers';
import { collectStreamedSpans, waitForStreamedSpan } from '../../../utils/spanUtils';

sentryTest('streams all children without the static 1000-span limit', async ({ getLocalTestUrl, page }) => {
  sentryTest.skip(shouldSkipTracingTest());
  const spans = collectStreamedSpans(page);
  const rootPromise = waitForStreamedSpan(page, span => span.name === 'parent');
  const url = await getLocalTestUrl({ testDir: __dirname });
  await page.goto(url);
  const root = await rootPromise;
  await page.evaluate(() => (window as any).Sentry.flush());

  const children = spans.filter(span => span.parent_span_id === root.span_id);
  expect(children).toHaveLength(5000);
  expect(children).toContainEqual(expect.objectContaining({ name: 'child 0' }));
  expect(children).toContainEqual(expect.objectContaining({ name: 'child 999' }));
  expect(children).toContainEqual(expect.objectContaining({ name: 'child 4999' }));
});
