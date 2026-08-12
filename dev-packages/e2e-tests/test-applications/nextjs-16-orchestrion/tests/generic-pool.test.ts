import { expect, test } from '@playwright/test';
import { waitForTransaction } from '@sentry-internal/test-utils';

test('Instruments generic-pool automatically via orchestrion', async ({ baseURL }) => {
  const transactionEventPromise = waitForTransaction('nextjs-16-orchestrion', transactionEvent => {
    return (
      transactionEvent.contexts?.trace?.op === 'http.server' && transactionEvent.transaction === 'GET /api/generic-pool'
    );
  });

  await fetch(`${baseURL}/api/generic-pool`);

  const transactionEvent = await transactionEventPromise;

  const spans = transactionEvent.spans || [];

  expect(spans).toContainEqual(
    expect.objectContaining({
      description: 'generic-pool.acquire',
      op: 'db',
      origin: 'auto.db.generic_pool',
      status: 'ok',
      data: expect.objectContaining({
        'sentry.origin': 'auto.db.generic_pool',
      }),
    }),
  );
});
