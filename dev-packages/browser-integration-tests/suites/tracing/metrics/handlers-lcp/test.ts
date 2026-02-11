import type { Route } from '@playwright/test';
import { expect } from '@playwright/test';
import type { Event } from '@sentry/core';
import { sentryTest } from '../../../../utils/fixtures';
import { getFirstSentryEnvelopeRequest, shouldSkipTracingTest } from '../../../../utils/helpers';

const bundle = process.env.PW_BUNDLE || '';

sentryTest(
  'should capture metrics for LCP instrumentation handlers',
  async ({ browserName, getLocalTestUrl, page }) => {
    // This uses a utility that is not exported in CDN bundles
    if (shouldSkipTracingTest() || browserName !== 'chromium' || bundle.startsWith('bundle')) {
      sentryTest.skip();
    }

    await page.route('**/path/to/image.png', (route: Route) =>
      route.fulfill({ path: `${__dirname}/assets/sentry-logo-600x179.png` }),
    );

    const url = await getLocalTestUrl({ testDir: __dirname });

    const [eventData] = await Promise.all([
      getFirstSentryEnvelopeRequest<Event>(page),
      page.goto(url),
      page.locator('button').click(),
    ]);

    expect(eventData.measurements).toBeDefined();
    expect(eventData.measurements?.lcp?.value).toBeDefined();

    // This should be body > img, but it can be flakey as sometimes it will report
    // the button as LCP.
    expect(eventData.contexts?.trace?.data?.['lcp.element'].startsWith('body >')).toBe(true);

    // Working around flakiness
    // Only testing this when the LCP element is an image, not a button
    if (eventData.contexts?.trace?.data?.['lcp.element'] === 'body > img') {
      expect(eventData.contexts?.trace?.data?.['lcp.size']).toBe(107400);

      const lcp = await (await page.waitForFunction('window._LCP')).jsonValue();
      const lcp2 = await (await page.waitForFunction('window._LCP2')).jsonValue();
      const lcp3 = await page.evaluate('window._LCP3');

      expect(lcp).toEqual(107400);
      expect(lcp2).toEqual(107400);
      // this has not been triggered yet
      expect(lcp3).toEqual(undefined);

      // Adding a handler after LCP is completed still triggers the handler
      await page.evaluate('window.ADD_HANDLER()');
      const lcp3_2 = await (await page.waitForFunction('window._LCP3')).jsonValue();

      expect(lcp3_2).toEqual(107400);
    }
  },
);
