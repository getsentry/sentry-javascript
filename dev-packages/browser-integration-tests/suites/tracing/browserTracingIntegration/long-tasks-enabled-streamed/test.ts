import type { Route } from '@playwright/test';
import { expect } from '@playwright/test';
import { sentryTest } from '../../../../utils/fixtures';
import { shouldSkipTracingTest } from '../../../../utils/helpers';
import { getSpanOp, waitForStreamedSpans } from '../../../../utils/spanUtils';

sentryTest('should capture long task.', async ({ browserName, getLocalTestUrl, page }) => {
  // Long tasks only work on chrome
  if (shouldSkipTracingTest() || browserName !== 'chromium') {
    sentryTest.skip();
  }

  await page.route('**/path/to/script.js', (route: Route) => route.fulfill({ path: `${__dirname}/assets/script.js` }));

  const url = await getLocalTestUrl({ testDir: __dirname });

  const spansPromise = waitForStreamedSpans(page, spans => spans.some(s => getSpanOp(s) === 'pageload'));

  await page.goto(url);

  const spans = await spansPromise;
  const pageloadSpan = spans.find(s => getSpanOp(s) === 'pageload')!;

  const uiSpans = spans.filter(s => getSpanOp(s)?.startsWith('ui'));
  expect(uiSpans.length).toBeGreaterThan(0);

  const [firstUISpan] = uiSpans;
  expect(firstUISpan).toEqual(
    expect.objectContaining({
      name: 'Main UI thread blocked',
      parent_span_id: pageloadSpan.span_id,
      attributes: expect.objectContaining({
        'sentry.op': { type: 'string', value: 'ui.long-task' },
      }),
    }),
  );

  const start = firstUISpan.start_timestamp ?? 0;
  const end = firstUISpan.end_timestamp ?? 0;
  const duration = end - start;

  expect(duration).toBeGreaterThanOrEqual(0.1);
  expect(duration).toBeLessThanOrEqual(0.15);
});
