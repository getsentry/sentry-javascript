import {
  BROWSER_WEB_VITAL_TTFB_VALUE,
  BROWSER_WEB_VITAL_LCP_VALUE,
  BROWSER_WEB_VITAL_FCP_VALUE,
  BROWSER_WEB_VITAL_FP_VALUE,
  BROWSER_PERFORMANCE_TIME_ORIGIN,
  BROWSER_PERFORMANCE_NAVIGATION_ACTIVATION_START,
} from '@sentry/conventions/attributes';
import type { Route } from '@playwright/test';
import { expect } from '@playwright/test';
import { sentryTest } from '../../../../utils/fixtures';
import { shouldSkipTracingTest, waitForLcpCandidate } from '../../../../utils/helpers';
import { getSpanOp, waitForStreamedSpan } from '../../../../utils/spanUtils';

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
  const pageloadPromise = waitForStreamedSpan(page, span => span.is_segment && getSpanOp(span) === 'pageload');
  const lcpPromise = waitForStreamedSpan(page, span => getSpanOp(span) === 'ui.webvital.lcp');
  await page.goto(url);
  await waitForLcpCandidate(page, 'img');
  await page.locator('button').click();
  const [eventData, lcpSpan] = await Promise.all([pageloadPromise, lcpPromise]);

  const ttfbValue = eventData.attributes[BROWSER_WEB_VITAL_TTFB_VALUE]?.value as number | undefined;

  if (!ttfbValue) {
    // TTFB is unfortunately quite flaky. Sometimes, the web-vitals library doesn't report TTFB because
    // responseStart is 0. This seems to happen somewhat randomly, so we just ignore this in that case.
    // @see packages/browser-utils/src/metrics/web-vitals/onTTFB

    // logging the skip reason so that we at least can check for that in CI logs
    // eslint-disable-next-line no-console
    console.log('SKIPPING: TTFB is not reported');
    sentryTest.skip();
  }

  const lcpValue = lcpSpan.attributes[BROWSER_WEB_VITAL_LCP_VALUE]?.value;
  const fcpValue = eventData.attributes[BROWSER_WEB_VITAL_FCP_VALUE]?.value;
  const fpValue = eventData.attributes[BROWSER_WEB_VITAL_FP_VALUE]?.value;

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
    const [eventData] = await Promise.all([
      waitForStreamedSpan(page, span => span.is_segment && getSpanOp(span) === 'pageload'),
      page.goto(url),
    ]);

    const timeOriginAttribute = eventData.attributes[BROWSER_PERFORMANCE_TIME_ORIGIN]?.value as number;
    const activationStart = eventData.attributes[BROWSER_PERFORMANCE_NAVIGATION_ACTIVATION_START]?.value;

    const spanStartTimestamp = eventData.start_timestamp;

    expect(timeOriginAttribute).toBeDefined();
    expect(spanStartTimestamp).toBeDefined();

    const delta = Math.abs(spanStartTimestamp! - timeOriginAttribute);

    // The delta should be less than 1ms if this flakes, we should increase the threshold
    expect(delta).toBeLessThanOrEqual(1);

    expect(activationStart).toBeGreaterThanOrEqual(0);
  },
);
