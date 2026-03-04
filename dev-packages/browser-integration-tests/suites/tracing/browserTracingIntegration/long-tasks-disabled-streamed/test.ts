import type { Route } from '@playwright/test';
import { expect } from '@playwright/test';
import { sentryTest } from '../../../../utils/fixtures';
import { shouldSkipTracingTest, testingCdnBundle } from '../../../../utils/helpers';
import { getSpanOp, waitForStreamedSpans } from '../../../../utils/spanUtils';

sentryTest("doesn't capture long task spans when flag is disabled.", async ({ browserName, getLocalTestUrl, page }) => {
  // Long tasks only work on chrome
  sentryTest.skip(shouldSkipTracingTest() || browserName !== 'chromium' || testingCdnBundle());

  await page.route('**/path/to/script.js', (route: Route) => route.fulfill({ path: `${__dirname}/assets/script.js` }));

  const url = await getLocalTestUrl({ testDir: __dirname });

  const spansPromise = waitForStreamedSpans(page, spans => spans.some(s => getSpanOp(s) === 'pageload'));

  await page.goto(url);

  const spans = await spansPromise;
  const uiSpans = spans.filter(s => getSpanOp(s)?.startsWith('ui'));

  expect(uiSpans.length).toBe(0);
});
