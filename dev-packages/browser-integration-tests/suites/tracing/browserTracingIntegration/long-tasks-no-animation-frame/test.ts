import { SENTRY_OP } from '@sentry/conventions/attributes';
import type { Route } from '@playwright/test';
import { expect } from '@playwright/test';
import { sentryTest } from '../../../../utils/fixtures';
import { shouldSkipTracingTest } from '../../../../utils/helpers';
import { collectStreamedSpans, getSpanOp, waitForStreamedSpanAndTraceHeaderOnUrl } from '../../../../utils/spanUtils';

sentryTest('should capture long task.', async ({ browserName, getLocalTestUrl, page }) => {
  // Long tasks only work on chrome
  if (shouldSkipTracingTest() || browserName !== 'chromium') {
    sentryTest.skip();
  }

  await page.route('**/path/to/script.js', (route: Route) => route.fulfill({ path: `${__dirname}/assets/script.js` }));

  const url = await getLocalTestUrl({ testDir: __dirname });

  const spans = collectStreamedSpans(page);
  const [pageloadSpan] = await waitForStreamedSpanAndTraceHeaderOnUrl(
    page,
    url,
    span => getSpanOp(span) === 'pageload',
  );
  await page.evaluate(() => (window as any).Sentry.flush());
  const uiSpans = spans.filter(span => getSpanOp(span)?.startsWith('ui'));

  expect(uiSpans.length).toBeGreaterThan(0);

  const getDuration = (span: { start_timestamp?: number; end_timestamp?: number }): number =>
    (span.end_timestamp ?? 0) - (span.start_timestamp ?? 0);
  // Other long tasks (e.g. SDK evaluation) can happen during pageload, so look at the longest one, which is the blocking script
  const [longTaskSpan] = [...uiSpans].sort((a, b) => getDuration(b) - getDuration(a));
  expect(longTaskSpan).toEqual(
    expect.objectContaining({
      attributes: expect.objectContaining({ [SENTRY_OP]: { type: 'string', value: 'ui.long_task' } }),
      name: 'Main UI thread blocked',
      parent_span_id: pageloadSpan.span_id,
    }),
  );
  const duration = getDuration(longTaskSpan);

  expect(duration).toBeGreaterThanOrEqual(0.1);
  expect(duration).toBeLessThan(1);
});
