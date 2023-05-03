import { getMultipleSentryEnvelopeRequests, countEnvelopes } from './utils/helpers';
import { test, expect } from '@playwright/test';

test('should create a pageload transaction when the `app` directory is used with a client component.', async ({
  page,
}) => {
  if (process.env.USE_APPDIR !== 'true') {
    return;
  }

  const transactions = await getMultipleSentryEnvelopeRequests(page, 1, {
    url: '/clientcomponent',
    envelopeType: 'transaction',
  });

  console.log(transactions);

  expect(transactions[0]).toMatchObject({
    contexts: {
      trace: {
        op: 'pageload',
      },
    },
    transaction: '/clientcomponent',
  });

  expect(await countEnvelopes(page, { url: '/clientcomponent', envelopeType: 'transaction', timeout: 2000 })).toBe(1);
});
