import { expect, test } from '@playwright/test';
import { waitForTransaction } from '@sentry-internal/test-utils';

test('Instruments mysql2 automatically via orchestrion', async ({ baseURL }) => {
  const transactionEventPromise = waitForTransaction('nextjs-16-orchestrion', transactionEvent => {
    return (
      transactionEvent.contexts?.trace?.op === 'http.server' && transactionEvent.transaction === 'GET /api/db-mysql2'
    );
  });

  await fetch(`${baseURL}/api/db-mysql2`);

  const transactionEvent = await transactionEventPromise;

  const spans = transactionEvent.spans || [];

  expect(spans).toContainEqual(
    expect.objectContaining({
      op: 'db',
      origin: 'auto.db.mysql2',
      description: 'SELECT 1 + 1 AS solution',
      status: 'ok',
      data: expect.objectContaining({
        'db.system': 'mysql',
        'db.statement': 'SELECT 1 + 1 AS solution',
        'db.user': 'root',
        'server.address': expect.any(String),
        'network.peer.port': 3306,
      }),
    }),
  );
  // `execute` is instrumented identically to `query`.
  expect(spans).toContainEqual(
    expect.objectContaining({
      op: 'db',
      origin: 'auto.db.mysql2',
      description: 'SELECT 42 AS answer',
      status: 'ok',
      data: expect.objectContaining({
        'db.system': 'mysql',
        'db.statement': 'SELECT 42 AS answer',
      }),
    }),
  );
});
