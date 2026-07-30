import { expect, test } from '@playwright/test';
import { waitForTransaction } from '@sentry-internal/test-utils';

test('Instruments pg automatically via orchestrion', async ({ baseURL }) => {
  const transactionEventPromise = waitForTransaction('nextjs-16-orchestrion', transactionEvent => {
    return transactionEvent.contexts?.trace?.op === 'http.server' && transactionEvent.transaction === 'GET /api/db-pg';
  });

  await fetch(`${baseURL}/api/db-pg`);

  const transactionEvent = await transactionEventPromise;

  const spans = transactionEvent.spans || [];

  expect(spans).toContainEqual(
    expect.objectContaining({
      op: 'db',
      origin: 'auto.db.postgres',
      description: 'SELECT 1 + 1 AS solution',
      status: 'ok',
      data: expect.objectContaining({
        'db.system': 'postgresql',
        'db.statement': 'SELECT 1 + 1 AS solution',
        'db.user': 'postgres',
        'db.name': 'postgres',
        'db.connection_string': expect.any(String),
        'net.peer.name': expect.any(String),
        'net.peer.port': 5432,
      }),
    }),
  );
  expect(spans).toContainEqual(
    expect.objectContaining({
      op: 'db',
      origin: 'auto.db.postgres',
      description: 'SELECT NOW()',
      status: 'ok',
      data: expect.objectContaining({
        'db.system': 'postgresql',
        'db.statement': 'SELECT NOW()',
        'db.user': 'postgres',
        'db.name': 'postgres',
        'db.connection_string': expect.any(String),
        'net.peer.name': expect.any(String),
        'net.peer.port': 5432,
      }),
    }),
  );
});
