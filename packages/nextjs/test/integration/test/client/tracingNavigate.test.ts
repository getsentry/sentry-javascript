import { expect, test } from '@playwright/test';
import { Transaction } from '@sentry/types';
import { countEnvelopes, getMultipleSentryEnvelopeRequests } from './utils/helpers';

test('should report navigation transactions', async ({ page }) => {
  const transaction = await getMultipleSentryEnvelopeRequests<Transaction>(page, 1, {
    url: '/42/withInitialProps',
    envelopeType: 'transaction',
  });

  expect(transaction[0]).toMatchObject({
    transaction: '/[id]/withInitialProps',
    type: 'transaction',
    contexts: {
      trace: {
        op: 'pageload',
      },
    },
  });

  await page.waitForTimeout(250);

  const [, transactions] = await Promise.all([
    page.click('a#server-side-props-page'),
    getMultipleSentryEnvelopeRequests<Transaction>(page, 1, { envelopeType: 'transaction' }),
  ]);

  expect(transactions[0]).toMatchObject({
    transaction: '/[id]/withServerSideProps',
    type: 'transaction',
    contexts: {
      trace: {
        op: 'navigation',
        data: {},
      },
    },
  });

  await page.waitForTimeout(250);

  const [, transactions_2] = await Promise.all([
    page.click('a#initial-props-page'),
    getMultipleSentryEnvelopeRequests<Transaction>(page, 1, { envelopeType: 'transaction' }),
  ]);

  expect(transactions_2[0]).toMatchObject({
    transaction: '/[id]/withInitialProps',
    type: 'transaction',
    contexts: {
      trace: {
        op: 'navigation',
        data: {},
      },
    },
  });

  expect(await countEnvelopes(page, { url: '/42/withInitialProps', envelopeType: 'transaction', timeout: 4000 })).toBe(
    1,
  );
});
