import { expect } from '@playwright/test';
import { sentryTest } from '../../../../utils/fixtures';
import { hidePage, shouldSkipTracingTest } from '../../../../utils/helpers';
import { getSpanOp, waitForStreamedSpan } from '../../../../utils/spanUtils';

sentryTest('should capture an INP click event span during pageload', async ({ browserName, getLocalTestUrl, page }) => {
  if (shouldSkipTracingTest() || browserName !== 'chromium') {
    sentryTest.skip();
  }

  const url = await getLocalTestUrl({ testDir: __dirname });

  await page.goto(url);

  const inpSpanPromise = waitForStreamedSpan(page, span => getSpanOp(span) === 'ui.interaction.click');

  await page.locator('[data-test-id=normal-button]').click();
  await page.locator('.clicked[data-test-id=normal-button]').isVisible();

  await page.waitForTimeout(500);
  await hidePage(page);

  const inpSpan = await inpSpanPromise;

  expect(inpSpan.name).toBe('body > NormalButton');
  expect(inpSpan.attributes?.['sentry.op']).toEqual({ type: 'string', value: 'ui.interaction.click' });
  expect(inpSpan.attributes?.['sentry.origin']).toEqual({ type: 'string', value: 'auto.http.browser.inp' });
  expect(inpSpan.attributes?.['sentry.transaction']?.value).toBe('test-url');
  expect(inpSpan.attributes?.['user_agent.original']?.value).toEqual(expect.stringContaining('Chrome'));

  const inpValue = inpSpan.attributes?.['browser.web_vital.inp.value']?.value as number;
  expect(inpValue).toBeGreaterThan(0);
  expect(inpSpan.attributes?.['sentry.exclusive_time']?.value).toBeGreaterThan(0);
});

sentryTest(
  'should choose the slowest interaction click event when INP is triggered.',
  async ({ browserName, getLocalTestUrl, page }) => {
    if (shouldSkipTracingTest() || browserName !== 'chromium') {
      sentryTest.skip();
    }

    const url = await getLocalTestUrl({ testDir: __dirname });

    await page.goto(url);

    await page.locator('[data-test-id=normal-button]').click();
    await page.locator('.clicked[data-test-id=normal-button]').isVisible();

    await page.waitForTimeout(500);

    const inpSpanPromise = waitForStreamedSpan(page, span => {
      return getSpanOp(span) === 'ui.interaction.click' && span.name === 'body > SlowButton';
    });

    await page.locator('[data-test-id=slow-button]').click();
    await page.locator('.clicked[data-test-id=slow-button]').isVisible();

    await page.waitForTimeout(500);

    // Important: Purposefully not using hidePage() here to test the hidden state
    // via the `pagehide` event. This is necessary because iOS Safari 14.4
    // still doesn't fully emit the `visibilitychange` events but it's the lower
    // bound for Safari on iOS that we support.
    // If this test times out or fails, it's likely because we tried updating
    // the web-vitals library which officially already dropped support for
    // this iOS version
    await page.evaluate(() => {
      window.dispatchEvent(new Event('pagehide'));
    });

    const inpSpan = await inpSpanPromise;

    expect(inpSpan.name).toBe('body > SlowButton');
    expect(inpSpan.attributes?.['sentry.exclusive_time']?.value).toBeGreaterThan(400);
    expect(inpSpan.attributes?.['browser.web_vital.inp.value']?.value).toBeGreaterThan(400);
  },
);
