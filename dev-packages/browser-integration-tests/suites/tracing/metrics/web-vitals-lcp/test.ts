import type { Route } from '@playwright/test';
import { expect } from '@playwright/test';
import type { Event } from '@sentry/types';

import { sentryTest } from '../../../../utils/fixtures';
import { getFirstSentryEnvelopeRequest, shouldSkipTracingTest } from '../../../../utils/helpers';

sentryTest('should capture a LCP vital with element details.', async ({ browserName, getLocalTestUrl, page }) => {
  if (shouldSkipTracingTest() || browserName !== 'chromium') {
    sentryTest.skip();
  }

  page.route('**', route => route.continue());
  page.route('**/my/image.png', async (route: Route) => {
    return route.fulfill({ path: `${__dirname}/assets/sentry-logo-600x179.png` });
  });

  const url = await getLocalTestUrl({ testDir: __dirname });
  const [eventData] = await Promise.all([
    getFirstSentryEnvelopeRequest<Event>(page),
    page.goto(url),
    page.locator('button').click(),
  ]);

  expect(eventData.measurements).toBeDefined();
  expect(eventData.measurements?.lcp?.value).toBeDefined();

  // XXX: This should be body > img, but it can be flakey as sometimes it will report
  // the button as LCP.
  expect(eventData.contexts?.trace?.data?.['lcp.element'].startsWith('body >')).toBe(true);
  expect(eventData.contexts?.trace?.data?.['lcp.size']).toBeGreaterThan(0);
  expect(eventData.contexts?.trace?.data?.['lcp.loadTime']).toBeGreaterThan(0);

  // renderTime is not set because we do not return the `Timing-Allow-Origin` header
  // and the image is loaded from a 3rd party origin
  expect(eventData.contexts?.trace?.data?.['lcp.renderTime']).toBeUndefined();
});

sentryTest(
  'captures LCP renderTime when returning Timing-Allow-Origin header.',
  async ({ browserName, getLocalTestPath, page }) => {
    if (shouldSkipTracingTest() || browserName !== 'chromium') {
      sentryTest.skip();
    }

    page.route('**', route => route.continue());
    page.route('**/my/image.png', async (route: Route) => {
      return route.fulfill({
        path: `${__dirname}/assets/sentry-logo-600x179.png`,
        headers: { 'Timing-Allow-Origin': '*' },
      });
    });

    const url = await getLocalTestPath({ testDir: __dirname });
    const [eventData] = await Promise.all([
      getFirstSentryEnvelopeRequest<Event>(page),
      page.goto(url),
      page.locator('button').click(),
    ]);

    expect(eventData.measurements).toBeDefined();
    expect(eventData.measurements?.lcp?.value).toBeDefined();

    // XXX: This should be body > img, but it can be flakey as sometimes it will report
    // the button as LCP.
    expect(eventData.contexts?.trace?.data?.['lcp.element'].startsWith('body >')).toBe(true);
    expect(eventData.contexts?.trace?.data?.['lcp.size']).toBeGreaterThan(0);
    expect(eventData.contexts?.trace?.data?.['lcp.loadTime']).toBeGreaterThan(0);

    // renderTime is not set because we do not return the `Timing-Allow-Origin` header
    // and the image is loaded from a 3rd party origin
    expect(eventData.contexts?.trace?.data?.['lcp.renderTime']).toBeGreaterThan(0);
  },
);
