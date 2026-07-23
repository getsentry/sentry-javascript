import { expect, test } from '@playwright/test';
import { waitForTransaction } from '@sentry-internal/test-utils';

test('Instruments mongodb automatically via orchestrion', async ({ baseURL }) => {
  const transactionEventPromise = waitForTransaction('nextjs-16-orchestrion', transactionEvent => {
    return (
      transactionEvent.contexts?.trace?.op === 'http.server' && transactionEvent.transaction === 'GET /api/db-mongodb'
    );
  });

  await fetch(`${baseURL}/api/db-mongodb`);

  const transactionEvent = await transactionEventPromise;

  const spans = transactionEvent.spans || [];

  expect(spans).toContainEqual(
    expect.objectContaining({
      op: 'db',
      origin: 'auto.db.orchestrion.mongo',
      status: 'ok',
      data: expect.objectContaining({
        'db.system': 'mongodb',
        'db.name': 'admin',
        'db.mongodb.collection': 'movies',
        'db.operation': 'insert',
      }),
    }),
  );
  expect(spans).toContainEqual(
    expect.objectContaining({
      op: 'db',
      origin: 'auto.db.orchestrion.mongo',
      status: 'ok',
      data: expect.objectContaining({
        'db.system': 'mongodb',
        'db.name': 'admin',
        'db.mongodb.collection': 'movies',
        'db.operation': 'find',
      }),
    }),
  );
});
