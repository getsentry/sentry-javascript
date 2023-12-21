import { expect } from '@playwright/test';
import type { Event } from '@sentry/types';

import { sentryTest } from '../../../../utils/fixtures';
import { getMultipleSentryEnvelopeRequests, shouldSkipTracingTest } from '../../../../utils/helpers';

sentryTest(
  'should capture a promise rejection within an async startSpan callback',
  async ({ getLocalTestPath, page }) => {
    if (shouldSkipTracingTest()) {
      sentryTest.skip();
    }

    const url = await getLocalTestPath({ testDir: __dirname });
    const envelopePromise = getMultipleSentryEnvelopeRequests<Event>(page, 2);

    await page.goto(url);

    const clickPromise = page.getByText('Button 1').click();

    const [, events] = await Promise.all([clickPromise, envelopePromise]);
    const [txn, err] = events[0]?.type === 'transaction' ? [events[0], events[1]] : [events[1], events[0]];

    expect(txn).toMatchObject({ transaction: 'parent_span' });

    expect(err?.exception?.values?.[0]?.value).toBe(
      'Non-Error promise rejection captured with value: Async Promise Rejection',
    );
  },
);
