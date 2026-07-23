import { expect } from '@playwright/test';
import { sentryTest } from '../../../../utils/fixtures';
import { hidePage, shouldSkipTracingTest } from '../../../../utils/helpers';
import { getSpanOp, waitForStreamedSpan } from '../../../../utils/spanUtils';

// This app does not enable span streaming (no `traceLifecycle: 'stream'`). INP is still emitted as a
// streamed span, because INP overrides the static trace lifecycle for itself (it would otherwise be
// dropped as a late child of the already-ended pageload span).

sentryTest(
  'captures an INP click as a streamed span during pageload',
  async ({ browserName, getLocalTestUrl, page }) => {
    const supportedBrowsers = ['chromium'];

    if (shouldSkipTracingTest() || !supportedBrowsers.includes(browserName)) {
      sentryTest.skip();
    }

    const url = await getLocalTestUrl({ testDir: __dirname });

    const inpSpanPromise = waitForStreamedSpan(page, span => getSpanOp(span) === 'ui.interaction.click');

    await page.goto(url);

    await page.locator('[data-test-id=normal-button]').click();
    await page.locator('.clicked[data-test-id=normal-button]').isVisible();

    await page.waitForTimeout(500);

    // Page hide to trigger INP
    await hidePage(page);

    const inpSpan = await inpSpanPromise;

    expect(inpSpan.attributes['sentry.op']).toEqual({ type: 'string', value: 'ui.interaction.click' });
    expect(inpSpan.attributes['sentry.origin']).toEqual({ type: 'string', value: 'auto.http.browser.inp' });
    expect(inpSpan.attributes['sentry.segment.name']).toEqual({ type: 'string', value: 'test-url' });
    expect(inpSpan.attributes['user_agent.original']?.value).toEqual(expect.stringContaining('Chrome'));
    expect(inpSpan.name).toBe('body > NormalButton');

    const inpValue = inpSpan.attributes['browser.web_vital.inp.value']?.value as number;
    expect(inpValue).toBeGreaterThan(0);

    expect(inpSpan.span_id).toMatch(/^[\da-f]{16}$/);
    expect(inpSpan.trace_id).toMatch(/^[\da-f]{32}$/);
  },
);

sentryTest(
  'chooses the slowest interaction click event when INP is triggered',
  async ({ browserName, getLocalTestUrl, page }) => {
    const supportedBrowsers = ['chromium'];

    if (shouldSkipTracingTest() || !supportedBrowsers.includes(browserName)) {
      sentryTest.skip();
    }

    const url = await getLocalTestUrl({ testDir: __dirname });

    await page.goto(url);

    await page.locator('[data-test-id=normal-button]').click();
    await page.locator('.clicked[data-test-id=normal-button]').isVisible();

    await page.waitForTimeout(500);

    const inpSpanPromise = waitForStreamedSpan(page, span => getSpanOp(span) === 'ui.interaction.click');

    await page.locator('[data-test-id=slow-button]').click();
    await page.locator('.clicked[data-test-id=slow-button]').isVisible();

    await page.waitForTimeout(500);

    // Important: Purposefully not using hidePage() here to test the hidden state
    // via the `pagehide` event. This is necessary because iOS Safari 14.4
    // still doesn't fully emit the `visibilitychange` events but it's the lower
    // bound for Safari on iOS that we support.
    await page.evaluate(() => {
      window.dispatchEvent(new Event('pagehide'));
    });

    const inpSpan = await inpSpanPromise;

    expect(inpSpan.name).toBe('body > SlowButton');
    expect(inpSpan.attributes['sentry.exclusive_time']?.value).toBeGreaterThan(400);
    expect(inpSpan.attributes['browser.web_vital.inp.value']?.value).toBeGreaterThan(400);
  },
);
