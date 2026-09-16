import { expect, test } from '@playwright/test';
import { waitForTransaction } from '@sentry-internal/test-utils';

test('Outbound fetch inside Sentry span creates transaction', async ({ baseURL }) => {
  const transactionPromise = waitForTransaction('deno', event => {
    return event?.spans?.some(span => span.description === 'test-outgoing-fetch') ?? false;
  });

  await fetch(`${baseURL}/test-outgoing-fetch`);

  const transaction = await transactionPromise;

  expect(transaction.spans).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        description: 'test-outgoing-fetch',
        origin: 'manual',
      }),
    ]),
  );
});
