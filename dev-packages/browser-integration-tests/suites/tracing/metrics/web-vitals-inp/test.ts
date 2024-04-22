import { expect } from '@playwright/test';
import type { Event as SentryEvent, SpanJSON } from '@sentry/types';

import { sentryTest } from '../../../../utils/fixtures';
import {
  getFirstSentryEnvelopeRequest,
  getMultipleSentryEnvelopeRequests,
  shouldSkipTracingTest,
} from '../../../../utils/helpers';

sentryTest('should capture an INP click event span.', async ({ browserName, getLocalTestPath, page }) => {
  const supportedBrowsers = ['chromium'];

  if (shouldSkipTracingTest() || !supportedBrowsers.includes(browserName)) {
    sentryTest.skip();
  }

  await page.route('https://dsn.ingest.sentry.io/**/*', route => {
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ id: 'test-id' }),
    });
  });

  const url = await getLocalTestPath({ testDir: __dirname });

  await page.goto(url);
  await getFirstSentryEnvelopeRequest<SentryEvent>(page); // wait for page load

  const spanEnvelopesPromise = getMultipleSentryEnvelopeRequests<SpanJSON>(page, 1, {
    envelopeType: 'span',
  });

  await page.locator('[data-test-id=normal-button]').click();
  await page.locator('.clicked[data-test-id=normal-button]').isVisible();

  await page.waitForTimeout(500);

  // Page hide to trigger INP
  await page.evaluate(() => {
    window.dispatchEvent(new Event('pagehide'));
  });

  // Get the INP span envelope
  const spanEnvelopes = await spanEnvelopesPromise;

  expect(spanEnvelopes).toHaveLength(1);
  expect(spanEnvelopes[0].op).toBe('ui.interaction.click');
  expect(spanEnvelopes[0].description).toBe('body > NormalButton');
  expect(spanEnvelopes[0].exclusive_time).toBeGreaterThan(0);
  expect(spanEnvelopes[0].measurements?.inp.value).toBeGreaterThan(0);
  expect(spanEnvelopes[0].measurements?.inp.unit).toBe('millisecond');
});

sentryTest(
  'should choose the slowest interaction click event when INP is triggered.',
  async ({ browserName, getLocalTestPath, page }) => {
    const supportedBrowsers = ['chromium'];

    if (shouldSkipTracingTest() || !supportedBrowsers.includes(browserName)) {
      sentryTest.skip();
    }

    await page.route('https://dsn.ingest.sentry.io/**/*', route => {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ id: 'test-id' }),
      });
    });

    const url = await getLocalTestPath({ testDir: __dirname });

    await page.goto(url);
    await getFirstSentryEnvelopeRequest<SentryEvent>(page);

    await page.locator('[data-test-id=normal-button]').click();
    await page.locator('.clicked[data-test-id=normal-button]').isVisible();

    await page.waitForTimeout(500);

    await page.locator('[data-test-id=slow-button]').click();
    await page.locator('.clicked[data-test-id=slow-button]').isVisible();

    await page.waitForTimeout(500);

    const spanEnvelopesPromise = getMultipleSentryEnvelopeRequests<SpanJSON>(page, 1, {
      envelopeType: 'span',
    });

    // Page hide to trigger INP
    await page.evaluate(() => {
      window.dispatchEvent(new Event('pagehide'));
    });

    // Get the INP span envelope
    const spanEnvelopes = await spanEnvelopesPromise;

    expect(spanEnvelopes).toHaveLength(1);
    expect(spanEnvelopes[0].op).toBe('ui.interaction.click');
    expect(spanEnvelopes[0].description).toBe('body > SlowButton');
    expect(spanEnvelopes[0].exclusive_time).toBeGreaterThan(400);
    expect(spanEnvelopes[0].measurements?.inp.value).toBeGreaterThan(400);
    expect(spanEnvelopes[0].measurements?.inp.unit).toBe('millisecond');
  },
);
