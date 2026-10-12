import { UI_INTERACTION_CLICK } from '@sentry/conventions/op';
import { BROWSER_WEB_VITAL_INP_VALUE } from '@sentry/conventions/attributes';
import { expect } from '@playwright/test';
import { sentryTest } from '../../../../utils/fixtures';
import { hidePage, shouldSkipTracingTest } from '../../../../utils/helpers';
import {
  collectStreamedSpans,
  getSpanOp,
  getSpansFromEnvelope,
  waitForStreamedSpanEnvelope,
} from '../../../../utils/spanUtils';

sentryTest('runs a static `beforeSendSpan` for the INP span', async ({ browserName, getLocalTestUrl, page }) => {
  const supportedBrowsers = ['chromium'];

  if (shouldSkipTracingTest() || !supportedBrowsers.includes(browserName)) {
    sentryTest.skip();
  }

  const spans = collectStreamedSpans(page);
  const url = await getLocalTestUrl({ testDir: __dirname });

  const spanEnvelopePromise = waitForStreamedSpanEnvelope(page, env =>
    getSpansFromEnvelope(env).some(span => getSpanOp(span) === UI_INTERACTION_CLICK),
  );

  await page.goto(url);

  await page.locator('[data-test-id=normal-button]').click();
  await expect(page.locator('.clicked[data-test-id=normal-button]')).toBeVisible();

  // Page hide to trigger INP
  await hidePage(page);

  await spanEnvelopePromise;
  await page.evaluate(() => (window as any).Sentry.flush());
  const inpSpans = spans.filter(span => getSpanOp(span) === UI_INTERACTION_CLICK);
  expect(inpSpans).toHaveLength(1);
  const [inpSpan] = inpSpans;

  // The callback rewrote the name and added a custom attribute.
  expect(inpSpan.name).toBe('scrubbed');
  expect(inpSpan.attributes['custom.attribute']).toEqual({ value: 'from-before-send-span', type: 'string' });

  // The span is still a valid v2 INP span carrying its web vital value.
  const inpValue = inpSpan.attributes[BROWSER_WEB_VITAL_INP_VALUE]?.value as number;
  expect(inpValue).toBeGreaterThan(0);
});
