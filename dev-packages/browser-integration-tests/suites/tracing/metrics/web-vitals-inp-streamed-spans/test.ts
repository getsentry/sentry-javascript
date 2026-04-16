import { expect } from '@playwright/test';
import { sentryTest } from '../../../../utils/fixtures';
import { hidePage, shouldSkipTracingTest, testingCdnBundle } from '../../../../utils/helpers';
import { getSpanOp, waitForStreamedSpan } from '../../../../utils/spanUtils';

sentryTest.beforeEach(async ({ browserName }) => {
  if (shouldSkipTracingTest() || testingCdnBundle() || browserName !== 'chromium') {
    sentryTest.skip();
  }
});

sentryTest('captures INP click as a streamed span', async ({ getLocalTestUrl, page }) => {
  const url = await getLocalTestUrl({ testDir: __dirname });

  const pageloadSpanPromise = waitForStreamedSpan(page, span => getSpanOp(span) === 'pageload');
  const inpSpanPromise = waitForStreamedSpan(page, span => getSpanOp(span) === 'ui.interaction.click');

  await page.goto(url);

  await page.locator('[data-test-id=normal-button]').click();
  await page.locator('.clicked[data-test-id=normal-button]').isVisible();

  await page.waitForTimeout(500);

  await hidePage(page);

  const inpSpan = await inpSpanPromise;
  const pageloadSpan = await pageloadSpanPromise;

  expect(inpSpan.attributes?.['sentry.op']).toEqual({ type: 'string', value: 'ui.interaction.click' });
  expect(inpSpan.attributes?.['sentry.origin']).toEqual({ type: 'string', value: 'auto.http.browser.inp' });
  expect(inpSpan.attributes?.['user_agent.original']?.value).toEqual(expect.stringContaining('Chrome'));

  const inpValue = inpSpan.attributes?.['browser.web_vital.inp.value']?.value as number;
  expect(inpValue).toBeGreaterThan(0);

  expect(inpSpan.attributes?.['sentry.exclusive_time']?.value).toBeGreaterThan(0);

  expect(inpSpan.name).toBe('body > NormalButton');

  expect(inpSpan.end_timestamp).toBeGreaterThan(inpSpan.start_timestamp);

  expect(inpSpan.span_id).toMatch(/^[\da-f]{16}$/);
  expect(inpSpan.trace_id).toMatch(/^[\da-f]{32}$/);

  expect(inpSpan.parent_span_id).toBe(pageloadSpan.span_id);
  expect(inpSpan.trace_id).toBe(pageloadSpan.trace_id);
});

sentryTest('captures the slowest interaction as streamed INP span', async ({ getLocalTestUrl, page }) => {
  const url = await getLocalTestUrl({ testDir: __dirname });

  await page.goto(url);

  await page.locator('[data-test-id=normal-button]').click();
  await page.locator('.clicked[data-test-id=normal-button]').isVisible();

  await page.waitForTimeout(500);

  const inpSpanPromise = waitForStreamedSpan(page, span => {
    const op = getSpanOp(span);
    return op === 'ui.interaction.click';
  });

  await page.locator('[data-test-id=slow-button]').click();
  await page.locator('.clicked[data-test-id=slow-button]').isVisible();

  await page.waitForTimeout(500);

  await hidePage(page);

  const inpSpan = await inpSpanPromise;

  expect(inpSpan.name).toBe('body > SlowButton');
  expect(inpSpan.attributes?.['sentry.exclusive_time']?.value).toBeGreaterThan(400);

  const inpValue = inpSpan.attributes?.['browser.web_vital.inp.value']?.value as number;
  expect(inpValue).toBeGreaterThan(400);
});
