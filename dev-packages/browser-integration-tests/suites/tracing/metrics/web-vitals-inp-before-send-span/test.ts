import { expect } from '@playwright/test';
import { sentryTest } from '../../../../utils/fixtures';
import { hidePage, shouldSkipTracingTest } from '../../../../utils/helpers';
import { getSpanOp, getSpansFromEnvelope, waitForStreamedSpanEnvelope } from '../../../../utils/spanUtils';

// This app does not enable span streaming (`traceLifecycle: 'static'`) and defines a plain, non-streamed
// `beforeSendSpan` callback (operating on the v1 `SpanJSON`). INP is still emitted as a v2 span, so this
// verifies the static callback runs for INP and its modifications are carried into the v2 span.

sentryTest('runs a non-streamed `beforeSendSpan` for the INP span', async ({ browserName, getLocalTestUrl, page }) => {
  const supportedBrowsers = ['chromium'];

  if (shouldSkipTracingTest() || !supportedBrowsers.includes(browserName)) {
    sentryTest.skip();
  }

  const url = await getLocalTestUrl({ testDir: __dirname });

  const spanEnvelopePromise = waitForStreamedSpanEnvelope(
    page,
    env => !!getSpansFromEnvelope(env).find(s => getSpanOp(s) === 'ui.interaction.click'),
  );

  await page.goto(url);

  await page.locator('[data-test-id=normal-button]').click();
  await page.locator('.clicked[data-test-id=normal-button]').isVisible();

  await page.waitForTimeout(500);

  // Page hide to trigger INP
  await hidePage(page);

  const spanEnvelope = await spanEnvelopePromise;
  const inpSpan = getSpansFromEnvelope(spanEnvelope).find(s => getSpanOp(s) === 'ui.interaction.click')!;

  // The callback rewrote the name and added a custom attribute.
  expect(inpSpan.name).toBe('scrubbed');
  expect(inpSpan.attributes['custom.attribute']).toEqual({ value: 'from-before-send-span', type: 'string' });

  // The span is still a valid v2 INP span carrying its web vital value.
  const inpValue = inpSpan.attributes['browser.web_vital.inp.value']?.value as number;
  expect(inpValue).toBeGreaterThan(0);
});
