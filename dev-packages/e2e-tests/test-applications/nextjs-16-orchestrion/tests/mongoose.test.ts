import { expect, test } from '@playwright/test';
import { waitForTransaction } from '@sentry-internal/test-utils';

test('Instruments mongoose automatically via orchestrion', async ({ baseURL }) => {
  const transactionEventPromise = waitForTransaction('nextjs-16-orchestrion', transactionEvent => {
    return (
      transactionEvent.contexts?.trace?.op === 'http.server' && transactionEvent.transaction === 'GET /api/db-mongoose'
    );
  });

  await fetch(`${baseURL}/api/db-mongoose`);

  const transactionEvent = await transactionEventPromise;

  const spans = transactionEvent.spans || [];

  expect(spans).toContainEqual(
    expect.objectContaining({
      op: 'db',
      origin: 'auto.db.orchestrion.mongoose',
      description: 'mongoose.BlogPost.save',
      status: 'ok',
      data: expect.objectContaining({
        'db.system': 'mongoose',
        'db.name': 'test',
        'db.mongodb.collection': 'blogposts',
        'db.operation': 'save',
      }),
    }),
  );
  expect(spans).toContainEqual(
    expect.objectContaining({
      op: 'db',
      origin: 'auto.db.orchestrion.mongoose',
      description: 'mongoose.BlogPost.findOne',
      status: 'ok',
      data: expect.objectContaining({
        'db.system': 'mongoose',
        'db.operation': 'findOne',
      }),
    }),
  );
});
