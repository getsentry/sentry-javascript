import type { Page, Route } from '@playwright/test';
import { expect } from '@playwright/test';
import { sentryTest } from '../../../../utils/fixtures';
import { shouldSkipTracingTest, testingCdnBundle } from '../../../../utils/helpers';
import { getSpanOp, waitForStreamedSpan } from '../../../../utils/spanUtils';

sentryTest.beforeEach(async ({ browserName, page }) => {
  if (shouldSkipTracingTest() || testingCdnBundle() || browserName !== 'chromium') {
    sentryTest.skip();
  }

  await page.setViewportSize({ width: 800, height: 1200 });
});

function hidePage(page: Page): Promise<void> {
  return page.evaluate(() => {
    window.dispatchEvent(new Event('pagehide'));
  });
}

sentryTest('captures LCP as a streamed span with element attributes', async ({ getLocalTestUrl, page }) => {
  page.route('**', route => route.continue());
  page.route('**/my/image.png', async (route: Route) => {
    return route.fulfill({
      path: `${__dirname}/assets/sentry-logo-600x179.png`,
    });
  });

  const url = await getLocalTestUrl({ testDir: __dirname });

  const lcpSpanPromise = waitForStreamedSpan(page, span => getSpanOp(span) === 'ui.webvital.lcp');

  await page.goto(url);

  // Wait for LCP to be captured
  await page.waitForTimeout(1000);

  await hidePage(page);

  const lcpSpan = await lcpSpanPromise;

  expect(lcpSpan.attributes?.['sentry.op']).toEqual({ type: 'string', value: 'ui.webvital.lcp' });
  expect(lcpSpan.attributes?.['sentry.origin']).toEqual({ type: 'string', value: 'auto.http.browser.lcp' });
  expect(lcpSpan.attributes?.['sentry.exclusive_time']).toEqual({ type: 'integer', value: 0 });
  expect(lcpSpan.attributes?.['user_agent.original']?.value).toEqual(expect.stringContaining('Chrome'));

  // Check browser.web_vital.lcp.* attributes
  expect(lcpSpan.attributes?.['browser.web_vital.lcp.element']?.value).toEqual(expect.stringContaining('body > img'));
  expect(lcpSpan.attributes?.['browser.web_vital.lcp.url']?.value).toBe(
    'https://sentry-test-site.example/my/image.png',
  );
  expect(lcpSpan.attributes?.['browser.web_vital.lcp.size']?.value).toEqual(expect.any(Number));

  // Check web vital value attribute
  expect(lcpSpan.attributes?.['browser.web_vital.lcp.value']?.type).toBe('double');
  expect(lcpSpan.attributes?.['browser.web_vital.lcp.value']?.value).toBeGreaterThan(0);

  // Check pageload span id is present
  expect(lcpSpan.attributes?.['sentry.pageload.span_id']?.value).toMatch(/[\da-f]{16}/);

  // Span should have meaningful duration (navigation start -> LCP event)
  expect(lcpSpan.end_timestamp).toBeGreaterThan(lcpSpan.start_timestamp);

  expect(lcpSpan.span_id).toMatch(/^[\da-f]{16}$/);
  expect(lcpSpan.trace_id).toMatch(/^[\da-f]{32}$/);
});
