import { expect, test } from '@playwright/test';
import { waitForTransaction } from '@sentry-internal/test-utils';

test('Sends an HTTP transaction', async ({ baseURL }) => {
  const txPromise = waitForTransaction('nestjs-websockets', tx => {
    return tx?.contexts?.trace?.op === 'http.server' && tx?.transaction === 'GET /test-transaction';
  });

  await fetch(`${baseURL}/test-transaction`);

  const tx = await txPromise;

  expect(tx.contexts?.trace).toEqual(
    expect.objectContaining({
      op: 'http.server',
    }),
  );
});
