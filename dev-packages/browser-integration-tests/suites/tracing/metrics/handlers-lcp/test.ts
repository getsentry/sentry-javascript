import type { Route } from '@playwright/test';
import { expect } from '@playwright/test';
import type { Event } from '@sentry/types';

import { sentryTest } from '../../../../utils/fixtures';
import { getFirstSentryEnvelopeRequest, shouldSkipTracingTest } from '../../../../utils/helpers';

sentryTest(
  'should capture metrics for LCP instrumentation handlers',
  async ({ browserName, getLocalTestPath, page }) => {
    if (shouldSkipTracingTest() || browserName !== 'chromium') {
      sentryTest.skip();
    }

    await page.route('**/path/to/image.png', (route: Route) =>
      route.fulfill({ path: `${__dirname}/assets/sentry-logo-600x179.png` }),
    );

    const url = await getLocalTestPath({ testDir: __dirname });
    const [eventData] = await Promise.all([
      getFirstSentryEnvelopeRequest<Event>(page),
      page.goto(url),
      page.click('button'),
    ]);

    expect(eventData.measurements).toBeDefined();
    expect(eventData.measurements?.lcp?.value).toBeDefined();

    expect(eventData.tags?.['lcp.element']).toBe('body > img');
    expect(eventData.tags?.['lcp.size']).toBe(107400);
    expect(eventData.tags?.['lcp.url']).toBe('https://example.com/path/to/image.png');

    const lcp = await page.evaluate('window._LCP');
    const lcp2 = await page.evaluate('window._LCP2');
    const lcp3 = await page.evaluate('window._LCP3');

    expect(lcp).toEqual(107400);
    expect(lcp2).toEqual(107400);
    // this has not been triggered yet
    expect(lcp3).toEqual(undefined);

    // Adding a handler after LCP is completed still triggers the handler
    await page.evaluate('window.ADD_HANDLER()');

    const lcp3_2 = await page.evaluate('window._LCP3');
    expect(lcp3_2).toEqual(107400);
  },
);
