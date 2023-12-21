import { expect } from '@playwright/test';
import type { Event } from '@sentry/types';

import { sentryTest } from '../../../../utils/fixtures';
import { getMultipleSentryEnvelopeRequests, shouldSkipTracingTest } from '../../../../utils/helpers';

sentryTest('should capture a thrown error within an async startSpan callback', async ({ getLocalTestPath, page }) => {
  if (shouldSkipTracingTest()) {
    sentryTest.skip();
  }

  page.on('pageerror', err => console.log('pageerror', err));
  page.on('console', msg => console.log('console', msg.text()));

  const url = await getLocalTestPath({ testDir: __dirname });
  const envelopePromise = getMultipleSentryEnvelopeRequests<Event>(page, 2);

  const gotoPromise = page.goto(url);
  const clickPromise = page.getByText('Button 1').click();

  console.log('before wait');

  const [_, events] = await Promise.all([gotoPromise, envelopePromise, clickPromise]);

  console.log('after wait');

  const [txn, err] = events[0]?.type === 'transaction' ? [events[0], events[1]] : [events[1], events[0]];

  expect(txn).toMatchObject({ transaction: 'parent_span' });

  expect(err?.exception?.values?.[0]?.value).toBe('[object Promise]');
});
