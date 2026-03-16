import type { Page } from '@playwright/test';
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

function waitForLayoutShift(page: Page): Promise<void> {
  return page.evaluate(() => {
    return new Promise(resolve => {
      window.addEventListener('cls-done', () => resolve());
    });
  });
}

function hidePage(page: Page): Promise<void> {
  return page.evaluate(() => {
    window.dispatchEvent(new Event('pagehide'));
  });
}

sentryTest('captures CLS as a streamed span with source attributes', async ({ getLocalTestUrl, page }) => {
  const url = await getLocalTestUrl({ testDir: __dirname });

  const clsSpanPromise = waitForStreamedSpan(page, span => getSpanOp(span) === 'ui.webvital.cls');

  await page.goto(`${url}#0.15`);
  await waitForLayoutShift(page);
  await hidePage(page);

  const clsSpan = await clsSpanPromise;

  expect(clsSpan.attributes?.['sentry.op']).toEqual({ type: 'string', value: 'ui.webvital.cls' });
  expect(clsSpan.attributes?.['sentry.origin']).toEqual({ type: 'string', value: 'auto.http.browser.cls' });
  expect(clsSpan.attributes?.['sentry.exclusive_time']).toEqual({ type: 'integer', value: 0 });
  expect(clsSpan.attributes?.['user_agent.original']?.value).toEqual(expect.stringContaining('Chrome'));

  // Check browser.web_vital.cls.source attributes
  expect(clsSpan.attributes?.['browser.web_vital.cls.source.1']?.value).toEqual(
    expect.stringContaining('body > div#content > p'),
  );

  // Check pageload span id is present
  expect(clsSpan.attributes?.['sentry.pageload.span_id']?.value).toMatch(/[\da-f]{16}/);

  // CLS is a point-in-time metric
  expect(clsSpan.start_timestamp).toEqual(clsSpan.end_timestamp);

  expect(clsSpan.span_id).toMatch(/^[\da-f]{16}$/);
  expect(clsSpan.trace_id).toMatch(/^[\da-f]{32}$/);
});

sentryTest('CLS streamed span has web vital value attribute', async ({ getLocalTestUrl, page }) => {
  const url = await getLocalTestUrl({ testDir: __dirname });

  const clsSpanPromise = waitForStreamedSpan(page, span => getSpanOp(span) === 'ui.webvital.cls');

  await page.goto(`${url}#0.1`);
  await waitForLayoutShift(page);
  await hidePage(page);

  const clsSpan = await clsSpanPromise;

  // The CLS value should be set as a browser.web_vital.cls.value attribute
  expect(clsSpan.attributes?.['browser.web_vital.cls.value']?.type).toBe('double');
  // Flakey value dependent on timings -> we check for a range
  const clsValue = clsSpan.attributes?.['browser.web_vital.cls.value']?.value as number;
  expect(clsValue).toBeGreaterThan(0.05);
  expect(clsValue).toBeLessThan(0.15);
});
