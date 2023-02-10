import { countEnvelopes, getMultipleSentryEnvelopeRequests } from './utils/helpers';
import { test, expect } from '@playwright/test';
import { Transaction } from '@sentry/types';

test('should correctly instrument dynamic routes for tracing', async ({ page }) => {
  const transaction = await getMultipleSentryEnvelopeRequests<Transaction>(page, 1, {
    url: '/users/102',
    envelopeType: 'transaction',
  });

  expect(transaction[0]).toMatchObject({
    transaction: '/users/[id]',
    type: 'transaction',
    contexts: {
      trace: {
        op: 'pageload',
      },
    },
  });

  expect(await countEnvelopes(page, { url: '/users/102', envelopeType: 'transaction', timeout: 2500 })).toBe(1);
});
