import { expect, test } from '@playwright/test';
import { waitForTransaction } from '@sentry-internal/test-utils';

test('Sends an HTTP transaction for the flush endpoint', async ({ baseURL }) => {
  const txPromise = waitForTransaction('nestjs-websockets', tx => {
    return tx?.contexts?.trace?.op === 'http.server' && tx?.transaction === 'GET /flush';
  });

  await fetch(`${baseURL}/flush`);

  const tx = await txPromise;

  expect(tx.contexts?.trace).toEqual(
    expect.objectContaining({
      op: 'http.server',
    }),
  );
});
