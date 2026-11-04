import type { Route } from '@playwright/test';
import { expect } from '@playwright/test';
import { sentryTest } from '../../../../utils/fixtures';
import { shouldSkipTracingTest } from '../../../../utils/helpers';
import { collectStreamedSpans, getSpanOp, waitForStreamedSpanAndTraceHeaderOnUrl } from '../../../../utils/spanUtils';

sentryTest('should allow specific types of resource spans to be ignored.', async ({ getLocalTestUrl, page }) => {
  if (shouldSkipTracingTest()) {
    sentryTest.skip();
  }

  await page.route('**/path/to/script.js', (route: Route) => route.fulfill({ path: `${__dirname}/assets/script.js` }));

  const url = await getLocalTestUrl({ testDir: __dirname });

  const spans = collectStreamedSpans(page);
  await waitForStreamedSpanAndTraceHeaderOnUrl(page, url, span => getSpanOp(span) === 'pageload');
  await page.evaluate(() => (window as any).Sentry.flush());
  const allSpans = spans?.filter(span => getSpanOp(span)?.startsWith('resource.script'));

  expect(allSpans?.length).toBe(0);
});
