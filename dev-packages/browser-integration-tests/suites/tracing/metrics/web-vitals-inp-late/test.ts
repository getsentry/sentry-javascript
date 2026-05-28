import { expect } from '@playwright/test';
import type { Event as SentryEvent } from '@sentry/core';
import { sentryTest } from '../../../../utils/fixtures';
import { getFirstSentryEnvelopeRequest, hidePage, shouldSkipTracingTest } from '../../../../utils/helpers';
import { getSpanOp, waitForStreamedSpan } from '../../../../utils/spanUtils';

sentryTest('should capture an INP click event span after pageload', async ({ browserName, getLocalTestUrl, page }) => {
  if (shouldSkipTracingTest() || browserName !== 'chromium') {
    sentryTest.skip();
  }

  const url = await getLocalTestUrl({ testDir: __dirname });

  await page.goto(url);
  await getFirstSentryEnvelopeRequest<SentryEvent>(page);

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
