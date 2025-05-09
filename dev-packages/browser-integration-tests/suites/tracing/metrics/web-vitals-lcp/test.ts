import type { Route } from '@playwright/test';
import { expect } from '@playwright/test';
import type { Event } from '@sentry/core';
import { sentryTest } from '../../../../utils/fixtures';
import { getFirstSentryEnvelopeRequest, shouldSkipTracingTest } from '../../../../utils/helpers';

sentryTest('captures LCP vitals with element details', async ({ browserName, getLocalTestUrl, page }) => {
  if (shouldSkipTracingTest() || browserName !== 'chromium') {
    sentryTest.skip();
  }

  page.route('**', route => route.continue());
  page.route('**/my/image.png', async (route: Route) => {
    return route.fulfill({
      path: `${__dirname}/assets/sentry-logo-600x179.png`,
    });
  });

  const url = await getLocalTestUrl({ testDir: __dirname });
  const [eventData] = await Promise.all([getFirstSentryEnvelopeRequest<Event>(page), page.goto(url)]);

  expect(eventData.measurements).toBeDefined();
  expect(eventData.measurements?.lcp?.value).toBeDefined();

  expect(eventData.contexts?.trace?.data?.['lcp.element'].startsWith('body >')).toBe(true);
  expect(eventData.contexts?.trace?.data?.['lcp.size']).toBeGreaterThan(0);
  expect(eventData.contexts?.trace?.data?.['lcp.loadTime']).toBeGreaterThan(0);
  expect(eventData.contexts?.trace?.data?.['lcp.renderTime']).toBeGreaterThan(0);

  // The LCP value should be the renderTime because the renderTime is set
  expect(eventData.measurements?.lcp?.value).toBeCloseTo(eventData.contexts?.trace?.data?.['lcp.renderTime']);
});
