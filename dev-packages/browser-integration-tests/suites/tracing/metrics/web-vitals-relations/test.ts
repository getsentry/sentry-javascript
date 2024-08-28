import type { Route } from '@playwright/test';
import { expect } from '@playwright/test';
import type { Event } from '@sentry/types';

import { sentryTest } from '../../../../utils/fixtures';
import { getFirstSentryEnvelopeRequest, shouldSkipTracingTest } from '../../../../utils/helpers';

/**
 * Bit of an odd test but we previously ran into cases where we would report TTFB > (LCP, FCP, FP)
 * This should never happen and this test serves as a regression test for that.
 *
 * The problem is: We don't always get valid TTFB from the web-vitals library, so we skip the test if that's the case.
 * Note: There is another test that covers that we actually report TTFB if it is valid (@see ../web-vitals-lcp/test.ts).
 */
sentryTest('paint web vitals values are greater than TTFB', async ({ browserName, getLocalTestPath, page }) => {
  // Only run in chromium to ensure all vitals are present
  if (shouldSkipTracingTest() || browserName !== 'chromium') {
    sentryTest.skip();
  }

  page.route('**', route => route.continue());
  page.route('**/path/to/image.png', async (route: Route) => {
    return route.fulfill({ path: `${__dirname}/assets/sentry-logo-600x179.png` });
  });

  const url = await getLocalTestPath({ testDir: __dirname });
  const [eventData] = await Promise.all([
    getFirstSentryEnvelopeRequest<Event>(page),
    page.goto(url),
    page.locator('button').click(),
    page.waitForTimeout(2000),
    // page.waitForFunction(() => {}),
  ]);

  expect(eventData.measurements).toBeDefined();

  const ttfbValue = eventData.measurements?.ttfb?.value;

  if (!ttfbValue) {
    // TTFB is unfortunately quite flaky. Sometimes, the web-vitals library doesn't report TTFB because
    // responseStart is 0. This seems to happen somewhat randomly, so we just ignore this in that case.
    // @see packages/browser-utils/src/metrics/web-vitals/onTTFB

    // logging the skip reason so that we at least can check for that in CI logs
    // eslint-disable-next-line no-console
    console.log('SKIPPING: TTFB is not reported');
    sentryTest.skip();
  }

  const lcpValue = eventData.measurements?.lcp?.value;
  const fcpValue = eventData.measurements?.fcp?.value;
  const fpValue = eventData.measurements?.fp?.value;

  expect(lcpValue).toBeDefined();
  expect(fcpValue).toBeDefined();
  expect(fpValue).toBeDefined();

  // (LCP, FCP, FP) >= TTFB
  expect(lcpValue).toBeGreaterThanOrEqual(ttfbValue!);
  expect(fcpValue).toBeGreaterThanOrEqual(ttfbValue!);
  expect(fpValue).toBeGreaterThanOrEqual(ttfbValue!);
});

/**
 * Continuing the theme of odd tests, in this one, we check that LCP is greater or equal to FCP and FP.
 *
 * The problem: There are cases where for _some reason_ the browser reports lower LCP than FCP/FP values :(
 * This might have to do with timing inaccuracies in the browser or with some weird bug in the PerformanceObserver
 * or Web vitals library. While this shouldn't happen, checking that they're not _vastly_ off is at least better
 * than not checking at all, so we factor in a margin of error.
 */
sentryTest('LCP >= (FCP, FP)', async ({ browserName, getLocalTestPath, page }) => {
  // Only run in chromium to ensure all vitals are present
  if (shouldSkipTracingTest() || browserName !== 'chromium') {
    sentryTest.skip();
  }

  page.route('**', route => route.continue());
  page.route('**/path/to/image.png', async (route: Route) => {
    return route.fulfill({ path: `${__dirname}/assets/sentry-logo-600x179.png` });
  });

  const url = await getLocalTestPath({ testDir: __dirname });
  const [eventData] = await Promise.all([
    getFirstSentryEnvelopeRequest<Event>(page),
    page.goto(url),
    page.locator('button').click(),
    page.waitForTimeout(2000),
  ]);

  expect(eventData.measurements).toBeDefined();

  const lcpValue = eventData.measurements?.lcp?.value;
  const fcpValue = eventData.measurements?.fcp?.value;
  const fpValue = eventData.measurements?.fp?.value;

  expect(lcpValue).toBeDefined();
  expect(fcpValue).toBeDefined();
  expect(fpValue).toBeDefined();

  // Assumption: The browser can render at 60FPS which equals 1 frame every 16.6ms.
  // Rounded up, 20ms seems like a reasonable margin of error.
  const epsilon = 20;

  // LCP >= (FCP, FP)
  expect(lcpValue).toBeGreaterThanOrEqual(fcpValue! - epsilon);
  expect(lcpValue).toBeGreaterThanOrEqual(fpValue! - epsilon);
});
