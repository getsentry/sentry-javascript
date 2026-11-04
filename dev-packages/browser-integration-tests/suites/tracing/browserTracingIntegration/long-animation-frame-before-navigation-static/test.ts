import { NAVIGATION } from '@sentry/conventions/op';
import { expect } from '@playwright/test';
import type { Event } from '@sentry/core';
import { sentryTest } from '../../../../utils/fixtures';
import { envelopeRequestParser, shouldSkipTracingTest, waitForTransactionRequest } from '../../../../utils/helpers';

sentryTest(
  "doesn't capture long animation frame that starts before a navigation.",
  async ({ browserName, getLocalTestUrl, page }) => {
    // Long animation frames only work on chrome
    if (shouldSkipTracingTest() || browserName !== 'chromium') {
      sentryTest.skip();
    }

    const url = await getLocalTestUrl({ testDir: __dirname });

    await page.goto(url);

    const navigationTransactionEventPromise = waitForTransactionRequest(
      page,
      event => event.contexts?.trace?.op === NAVIGATION,
    );

    await page.locator('#clickme').click();

    const navigationTransactionEvent = envelopeRequestParser<Event>(await navigationTransactionEventPromise);

    expect(navigationTransactionEvent.contexts?.trace?.op).toBe(NAVIGATION);

    const loafSpans = navigationTransactionEvent.spans?.filter(s => s.op?.startsWith('ui.long_animation_frame'));

    expect(loafSpans?.length).toEqual(0);
  },
);
