import { expect } from '@playwright/test';
import type { Event } from '@sentry/types';

import { sentryTest } from '../../../../utils/fixtures';
import { getFirstSentryEnvelopeRequest, shouldSkipTracingTest } from '../../../../utils/helpers';

sentryTest(
  "doesn't capture long animation frame that starts before a navigation.",
  async ({ browserName, getLocalTestPath, page }) => {
    // Long animation frames only work on chrome
    if (shouldSkipTracingTest() || browserName !== 'chromium') {
      sentryTest.skip();
    }

    const url = await getLocalTestPath({ testDir: __dirname });

    await page.goto(url);

    const navigationTransactionEventPromise = getFirstSentryEnvelopeRequest<Event>(page);

    await page.locator('#clickme').click();

    const navigationTransactionEvent = await navigationTransactionEventPromise;

    expect(navigationTransactionEvent.contexts?.trace?.op).toBe('navigation');

    const loafSpans = navigationTransactionEvent.spans?.filter(s => s.op?.startsWith('ui.long-animation-frame'));

    expect(loafSpans?.length).toEqual(0);
  },
);
