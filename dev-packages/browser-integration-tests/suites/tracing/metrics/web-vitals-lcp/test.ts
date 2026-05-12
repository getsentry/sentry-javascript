import type { Route } from '@playwright/test';
import { expect } from '@playwright/test';
import type { Event } from '@sentry/core';
import { sentryTest } from '../../../../utils/fixtures';
import { getFirstSentryEnvelopeRequest, shouldSkipTracingTest } from '../../../../utils/helpers';

// TODO(v11): re-enable once span streaming is the default — LCP fires at pagehide,
// after the pageload transaction has already converted, so the LCP signal isn't
// captured in static mode. The `web-vitals-lcp-streamed-spans` suite covers the
// supported (streamed) flow.
sentryTest.skip('captures LCP vitals with element details', async ({ browserName, getLocalTestUrl, page }) => {
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

  const lcpSpan = eventData.spans?.find(({ op }) => op === 'ui.webvital.lcp');
  expect(lcpSpan).toBeDefined();

  const lcpAttrs = lcpSpan?.data ?? {};
  expect(lcpAttrs['browser.web_vital.lcp.value']).toBeGreaterThan(0);
  expect(String(lcpAttrs['browser.web_vital.lcp.element']).startsWith('body >')).toBe(true);
  expect(lcpAttrs['browser.web_vital.lcp.size']).toBeGreaterThan(0);
  expect(lcpAttrs['browser.web_vital.lcp.load_time']).toBeGreaterThan(0);
  expect(lcpAttrs['browser.web_vital.lcp.render_time']).toBeGreaterThan(0);

  // The LCP value should be the renderTime because the renderTime is set
  expect(lcpAttrs['browser.web_vital.lcp.value']).toBeCloseTo(lcpAttrs['browser.web_vital.lcp.render_time'] as number);
});
