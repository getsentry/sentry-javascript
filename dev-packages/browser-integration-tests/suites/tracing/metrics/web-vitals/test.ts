import type { Route } from '@playwright/test';
import { expect } from '@playwright/test';
import type { Event } from '@sentry/core';
import { sentryTest } from '../../../../utils/fixtures';
import { getFirstSentryEnvelopeRequest, shouldSkipTracingTest } from '../../../../utils/helpers';

/**
 * Bit of an odd test but we previously ran into cases where we would report TTFB > (LCP, FCP, FP)
 * This should never happen and this test serves as a regression test for that.
 *
 * The problem is: We don't always get valid TTFB from the web-vitals library, so we skip the test if that's the case.
 * Note: There is another test that covers that we actually report TTFB if it is valid (@see ../web-vitals-lcp/test.ts).
 */
sentryTest('paint web vitals values are greater than TTFB', async ({ browserName, getLocalTestUrl, page }) => {
  // Only run in chromium to ensure all vitals are present
  if (shouldSkipTracingTest() || browserName !== 'chromium') {
    sentryTest.skip();
  }

  page.route('**', route => route.continue());
  page.route('**/library/image.png', async (route: Route) => {
    return route.fulfill({ path: `${__dirname}/assets/sentry-logo-600x179.png` });
  });

  const url = await getLocalTestUrl({ testDir: __dirname });
  const [eventData] = await Promise.all([
    getFirstSentryEnvelopeRequest<Event>(page),
    page.goto(url),
    page.locator('button').click(),
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

sentryTest(
  'captures time origin and navigation activationStart as span attributes',
  async ({ getLocalTestUrl, page }) => {
    // Only run in chromium to ensure all vitals are present
    if (shouldSkipTracingTest()) {
      sentryTest.skip();
    }

    const url = await getLocalTestUrl({ testDir: __dirname });
    const [eventData] = await Promise.all([getFirstSentryEnvelopeRequest<Event>(page), page.goto(url)]);

    const timeOriginAttribute = eventData.contexts?.trace?.data?.['performance.timeOrigin'];
    const activationStart = eventData.contexts?.trace?.data?.['performance.activationStart'];

    const transactionStartTimestamp = eventData.start_timestamp;

    expect(timeOriginAttribute).toBeDefined();
    expect(transactionStartTimestamp).toBeDefined();

    const delta = Math.abs(transactionStartTimestamp! - timeOriginAttribute);

    // The delta should be less than 1ms if this flakes, we should increase the threshold
    expect(delta).toBeLessThanOrEqual(1);

    expect(activationStart).toBeGreaterThanOrEqual(0);
  },
);
