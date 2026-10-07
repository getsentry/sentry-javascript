import {
  SENTRY_OP,
  SENTRY_ORIGIN,
  SENTRY_EXCLUSIVE_TIME,
  USER_AGENT_ORIGINAL,
  SENTRY_SEGMENT_NAME,
  BROWSER_WEB_VITAL_LCP_ELEMENT,
  BROWSER_WEB_VITAL_LCP_URL,
  BROWSER_WEB_VITAL_LCP_SIZE,
  BROWSER_WEB_VITAL_LCP_VALUE,
  BROWSER_WEB_VITAL_LCP_RENDER_TIME,
  BROWSER_WEB_VITAL_LCP_LOAD_TIME,
  SENTRY_PAGELOAD_SPAN_ID,
} from '@sentry/conventions/attributes';
import type { Route } from '@playwright/test';
import { expect } from '@playwright/test';
import { sentryTest } from '../../../../utils/fixtures';
import { shouldSkipTracingTest, waitForLcpCandidate } from '../../../../utils/helpers';
import { getSpanOp, waitForStreamedSpan } from '../../../../utils/spanUtils';

sentryTest.beforeEach(async ({ browserName, page }) => {
  if (shouldSkipTracingTest() || browserName !== 'chromium') {
    sentryTest.skip();
  }

  await page.setViewportSize({ width: 800, height: 1200 });
});

sentryTest('captures LCP as a streamed span with element attributes', async ({ getLocalTestUrl, page }) => {
  page.route('**', route => route.continue());
  page.route('**/my/image.png', async (route: Route) => {
    return route.fulfill({
      path: `${__dirname}/assets/sentry-logo-600x179.png`,
    });
  });

  const url = await getLocalTestUrl({ testDir: __dirname });

  const lcpSpanPromise = waitForStreamedSpan(page, span => getSpanOp(span) === 'ui.webvital.lcp');
  const pageloadSpanPromise = waitForStreamedSpan(page, span => getSpanOp(span) === 'pageload');

  await page.goto(url);

  await waitForLcpCandidate(page, 'img');

  // LCP finalizes on the first trusted input or visibility change, and web-vitals checks
  // `isTrusted`, so a synthetically dispatched `visibilitychange` does not finalize it. Click to
  // finalize the way a real user would.
  await page.click('body');

  const lcpSpan = await lcpSpanPromise;
  const pageloadSpan = await pageloadSpanPromise;

  expect(lcpSpan.attributes[SENTRY_OP]).toEqual({ type: 'string', value: 'ui.webvital.lcp' });
  expect(lcpSpan.attributes[SENTRY_ORIGIN]).toEqual({ type: 'string', value: 'auto.http.browser.lcp' });
  expect(lcpSpan.attributes[SENTRY_EXCLUSIVE_TIME]).toEqual({ type: 'integer', value: 0 });
  expect(lcpSpan.attributes[USER_AGENT_ORIGINAL]?.value).toEqual(expect.stringContaining('Chrome'));

  // Check the LCP span carries the segment name it belongs to
  expect(lcpSpan.attributes[SENTRY_SEGMENT_NAME]).toEqual({ type: 'string', value: 'Pageload' });

  // Check browser.web_vital.lcp.* attributes
  expect(lcpSpan.attributes[BROWSER_WEB_VITAL_LCP_ELEMENT]?.value).toEqual(expect.stringContaining('body > img'));
  expect(lcpSpan.attributes[BROWSER_WEB_VITAL_LCP_URL]?.value).toBe('https://sentry-test-site.example/my/image.png');
  expect(lcpSpan.attributes[BROWSER_WEB_VITAL_LCP_SIZE]?.value).toEqual(expect.any(Number));

  // Check web vital value attribute
  expect(lcpSpan.attributes[BROWSER_WEB_VITAL_LCP_VALUE]?.type).toMatch(/^(double)|(integer)$/);
  expect(lcpSpan.attributes[BROWSER_WEB_VITAL_LCP_VALUE]?.value).toBeGreaterThan(0);

  const renderTime = lcpSpan.attributes[BROWSER_WEB_VITAL_LCP_RENDER_TIME]?.value as number;
  expect(renderTime).toBeGreaterThan(0);
  expect(lcpSpan.attributes[BROWSER_WEB_VITAL_LCP_LOAD_TIME]?.value).toBeGreaterThan(0);
  expect(lcpSpan.attributes[BROWSER_WEB_VITAL_LCP_VALUE]?.value).toBeCloseTo(renderTime);

  // Check pageload span id is present
  expect(lcpSpan.attributes[SENTRY_PAGELOAD_SPAN_ID]?.value).toBe(pageloadSpan.span_id);

  // Span should have meaningful duration (navigation start -> LCP event)
  expect(lcpSpan.end_timestamp).toBeGreaterThan(lcpSpan.start_timestamp);

  expect(lcpSpan.span_id).toMatch(/^[\da-f]{16}$/);
  expect(lcpSpan.trace_id).toMatch(/^[\da-f]{32}$/);

  expect(lcpSpan.parent_span_id).toBe(pageloadSpan.span_id);
  expect(lcpSpan.trace_id).toBe(pageloadSpan.trace_id);
});
