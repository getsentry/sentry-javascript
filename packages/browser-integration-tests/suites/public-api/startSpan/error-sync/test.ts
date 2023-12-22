import { expect } from '@playwright/test';
import type { Event } from '@sentry/types';

import { sentryTest } from '../../../../utils/fixtures';
import { getMultipleSentryEnvelopeRequests, shouldSkipTracingTest } from '../../../../utils/helpers';

sentryTest('should capture an error within a sync startSpan callback', async ({ getLocalTestPath, page }) => {
  if (shouldSkipTracingTest()) {
    sentryTest.skip();
  }

  const url = await getLocalTestPath({ testDir: __dirname });
  const gotoPromise = page.goto(url);
  const envelopePromise = getMultipleSentryEnvelopeRequests<Event>(page, 2);

  const [_, events] = await Promise.all([gotoPromise, envelopePromise]);
  const txn = events.find(event => event.type === 'transaction');
  const err = events.find(event => !event.type);

  expect(txn).toMatchObject({ transaction: 'parent_span' });
  expect(err?.exception?.values?.[0]?.value).toBe('Sync Error');
});
