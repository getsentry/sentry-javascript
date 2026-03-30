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

function hidePage(page: Page): Promise<void> {
  return page.evaluate(() => {
    window.dispatchEvent(new Event('pagehide'));
  });
}

sentryTest('captures INP as a streamed span with interaction attributes', async ({ getLocalTestUrl, page }) => {
  const url = await getLocalTestUrl({ testDir: __dirname });

  const inpSpanPromise = waitForStreamedSpan(page, span => {
    const op = getSpanOp(span);
    return op === 'ui.interaction.click';
  });

  await page.goto(url);

  await page.locator('[data-test-id=inp-button]').click();
  await page.locator('.clicked[data-test-id=inp-button]').isVisible();

  await page.waitForTimeout(500);

  await hidePage(page);

  const inpSpan = await inpSpanPromise;

  expect(inpSpan.attributes?.['sentry.op']).toEqual({ type: 'string', value: 'ui.interaction.click' });
  expect(inpSpan.attributes?.['sentry.origin']).toEqual({ type: 'string', value: 'auto.http.browser.inp' });
  expect(inpSpan.attributes?.['user_agent.original']?.value).toEqual(expect.stringContaining('Chrome'));

  // Check INP value attribute
  expect(inpSpan.attributes?.['browser.web_vital.inp.value']?.type).toBe('double');
  expect(inpSpan.attributes?.['browser.web_vital.inp.value']?.value).toBeGreaterThan(0);

  // Check exclusive time matches the interaction duration
  expect(inpSpan.attributes?.['sentry.exclusive_time']?.type).toBe('double');
  expect(inpSpan.attributes?.['sentry.exclusive_time']?.value).toBeGreaterThan(0);

  // INP span should have meaningful duration (interaction start -> end)
  expect(inpSpan.end_timestamp).toBeGreaterThan(inpSpan.start_timestamp);

  expect(inpSpan.span_id).toMatch(/^[\da-f]{16}$/);
  expect(inpSpan.trace_id).toMatch(/^[\da-f]{32}$/);

  // Check that the span name contains the element
  expect(inpSpan.name).toContain('InpButton');
});
