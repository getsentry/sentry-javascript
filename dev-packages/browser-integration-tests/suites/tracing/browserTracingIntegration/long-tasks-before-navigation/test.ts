import { expect } from '@playwright/test';
import type { Event } from '@sentry/types';

import { sentryTest } from '../../../../utils/fixtures';
import { getFirstSentryEnvelopeRequest, shouldSkipTracingTest } from '../../../../utils/helpers';

sentryTest(
  "doesn't capture long task spans starting before a navigation in the navigation transaction",
  async ({ browserName, getLocalTestPath, page }) => {
    // Long tasks only work on chrome
    if (shouldSkipTracingTest() || browserName !== 'chromium') {
      sentryTest.skip();
    }
    const url = await getLocalTestPath({ testDir: __dirname });

    await page.goto(url);

    await page.locator('#myButton').click();

    const navigationTransactionEvent = await getFirstSentryEnvelopeRequest<Event>(page, url);

    expect(navigationTransactionEvent.contexts?.trace?.op).toBe('navigation');

    const longTaskSpans = navigationTransactionEvent?.spans?.filter(span => span.op === 'ui.long-task');
    expect(longTaskSpans).toHaveLength(0);
  },
);
