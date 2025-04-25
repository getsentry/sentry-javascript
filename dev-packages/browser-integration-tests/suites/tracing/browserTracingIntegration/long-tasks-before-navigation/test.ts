import { expect } from '@playwright/test';
import type { Event } from '@sentry/core';
import { sentryTest } from '../../../../utils/fixtures';
import { getFirstSentryEnvelopeRequest, shouldSkipTracingTest } from '../../../../utils/helpers';

sentryTest(
  "doesn't capture long task spans starting before a navigation in the navigation transaction",
  async ({ browserName, getLocalTestUrl, page }) => {
    // Long tasks only work on chrome
    if (shouldSkipTracingTest() || browserName !== 'chromium') {
      sentryTest.skip();
    }
    const url = await getLocalTestUrl({ testDir: __dirname });

    await page.route('**/path/to/script.js', route => route.fulfill({ path: `${__dirname}/assets/script.js` }));

    await page.goto(url);

    const navigationTransactionEventPromise = getFirstSentryEnvelopeRequest<Event>(page);

    await page.locator('#myButton').click();

    const navigationTransactionEvent = await navigationTransactionEventPromise;

    expect(navigationTransactionEvent.contexts?.trace?.op).toBe('navigation');

    const longTaskSpans = navigationTransactionEvent?.spans?.filter(span => span.op === 'ui.long-task');
    expect(longTaskSpans).toHaveLength(0);
  },
);
