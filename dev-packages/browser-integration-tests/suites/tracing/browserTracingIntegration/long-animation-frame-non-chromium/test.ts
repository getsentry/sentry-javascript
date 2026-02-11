import type { Route } from '@playwright/test';
import { expect } from '@playwright/test';
import type { Event } from '@sentry/core';
import { sentryTest } from '../../../../utils/fixtures';
import { getFirstSentryEnvelopeRequest, shouldSkipTracingTest } from '../../../../utils/helpers';

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

    const eventData = await getFirstSentryEnvelopeRequest<Event>(page, url);
    const uiSpans = eventData.spans?.filter(({ op }) => op?.startsWith('ui'));

    expect(uiSpans?.length).toBe(0);
  },
);
