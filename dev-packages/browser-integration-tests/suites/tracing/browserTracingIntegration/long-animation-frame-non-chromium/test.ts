import type { Route } from '@playwright/test';
import { expect } from '@playwright/test';
import { sentryTest } from '../../../../utils/fixtures';
import { shouldSkipTracingTest } from '../../../../utils/helpers';
import { collectStreamedSpans, getSpanOp, waitForStreamedSpanAndTraceHeaderOnUrl } from '../../../../utils/spanUtils';

sentryTest(
  'should not capture long animation frame or long task when browser is non-chromium',
  async ({ browserName, getLocalTestUrl, page }) => {
    // Only test non-chromium browsers
    if (shouldSkipTracingTest() || browserName === 'chromium') {
      sentryTest.skip();
    }

    await page.route('**/path/to/script.js', (route: Route) =>
      route.fulfill({ path: `${__dirname}/assets/script.js` }),
    );

    const url = await getLocalTestUrl({ testDir: __dirname });

    const spans = collectStreamedSpans(page);
    await waitForStreamedSpanAndTraceHeaderOnUrl(page, url, span => getSpanOp(span) === 'pageload');
    await page.evaluate(() => (window as any).Sentry.flush());
    const uiSpans = spans?.filter(span => getSpanOp(span)?.startsWith('ui'));

    expect(uiSpans?.length).toBe(0);
  },
);
