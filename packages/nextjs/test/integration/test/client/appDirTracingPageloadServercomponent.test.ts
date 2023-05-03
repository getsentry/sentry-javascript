import { getMultipleSentryEnvelopeRequests, countEnvelopes } from './utils/helpers';
import { test, expect } from '@playwright/test';

test('should create a pageload transaction when the `app` directory is used with a server component.', async ({
  page,
}) => {
  if (process.env.USE_APPDIR !== 'true') {
    return;
  }

  const [transaction] = await getMultipleSentryEnvelopeRequests(page, 1, {
    url: '/servercomponent',
    envelopeType: 'transaction',
  });

  expect(transaction).toMatchObject({
    contexts: {
      trace: {
        op: 'pageload',
      },
    },
    transaction: '/servercomponent',
  });

  expect(await countEnvelopes(page, { url: '/servercomponent', envelopeType: 'transaction', timeout: 2000 })).toBe(1);
});
