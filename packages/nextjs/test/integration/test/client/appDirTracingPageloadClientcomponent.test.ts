import { expect, test } from '@playwright/test';
import { countEnvelopes, getMultipleSentryEnvelopeRequests } from './utils/helpers';

test('should create a pageload transaction when the `app` directory is used with a client component.', async ({
  page,
}) => {
  if (process.env.USE_APPDIR !== 'true') {
    return;
  }

  const [transaction] = await getMultipleSentryEnvelopeRequests(page, 1, {
    url: '/clientcomponent',
    envelopeType: 'transaction',
  });

  expect(transaction).toMatchObject({
    contexts: {
      trace: {
        op: 'pageload',
      },
    },
    transaction: '/clientcomponent',
  });

  expect(await countEnvelopes(page, { url: '/clientcomponent', envelopeType: 'transaction', timeout: 2000 })).toBe(1);
});
