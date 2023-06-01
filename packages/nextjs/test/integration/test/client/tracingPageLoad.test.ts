import { countEnvelopes, getMultipleSentryEnvelopeRequests } from './utils/helpers';
import { test, expect } from '@playwright/test';
import { Transaction } from '@sentry/types';

test('should report a `pageload` transaction', async ({ page }) => {
  const transaction = await getMultipleSentryEnvelopeRequests<Transaction>(page, 1, {
    url: '/testy',
    envelopeType: 'transaction',
  });

  expect(transaction[0]).toMatchObject({
    contexts: {
      trace: {
        op: 'pageload',
      },
    },
  });

  expect(await countEnvelopes(page, { url: '/testy', envelopeType: 'transaction', timeout: 4000 })).toBe(1);
});
