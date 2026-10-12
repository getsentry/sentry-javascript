import type { Route } from '@playwright/test';
import { expect } from '@playwright/test';
import { sentryTest } from '../../../../utils/fixtures';
import { shouldSkipTracingTest } from '../../../../utils/helpers';
import { collectStreamedSpans, getSpanOp, waitForStreamedSpan } from '../../../../utils/spanUtils';

sentryTest("doesn't capture long task spans when flag is disabled.", async ({ browserName, getLocalTestUrl, page }) => {
  // Long tasks only work on chrome
  sentryTest.skip(shouldSkipTracingTest() || browserName !== 'chromium');

  await page.route('**/path/to/script.js', (route: Route) => route.fulfill({ path: `${__dirname}/assets/script.js` }));

  const url = await getLocalTestUrl({ testDir: __dirname });

  const spans = collectStreamedSpans(page);
  const pageloadSpanPromise = waitForStreamedSpan(page, span => getSpanOp(span) === 'pageload');

  await page.goto(url);

  await pageloadSpanPromise;
  await page.evaluate(() => (window as any).Sentry.flush());
  const uiSpans = spans.filter(s => getSpanOp(s)?.startsWith('ui'));

  expect(uiSpans.length).toBe(0);
});
