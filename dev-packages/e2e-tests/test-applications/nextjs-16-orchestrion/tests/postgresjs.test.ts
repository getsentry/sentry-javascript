import { expect, test } from '@playwright/test';
import { waitForTransaction } from '@sentry-internal/test-utils';

// postgres.js uses the STABLE semconv attribute keys (`db.system.name`, `server.*`, `db.query.text`),
// unlike the other drivers here which use the legacy keys.
test('Instruments postgres.js automatically via orchestrion', async ({ baseURL }) => {
  const transactionEventPromise = waitForTransaction('nextjs-16-orchestrion', transactionEvent => {
    return (
      transactionEvent.contexts?.trace?.op === 'http.server' &&
      transactionEvent.transaction === 'GET /api/db-postgresjs'
    );
  });

  await fetch(`${baseURL}/api/db-postgresjs`);

  const transactionEvent = await transactionEventPromise;

  const spans = transactionEvent.spans || [];

  // postgres.js sanitizes inline literals to `?` (unlike `pg`, which preserves them here).
  expect(spans).toContainEqual(
    expect.objectContaining({
      op: 'db',
      origin: 'auto.db.postgresjs',
      description: 'SELECT ? + ? AS solution',
      status: 'ok',
      data: expect.objectContaining({
        'db.system.name': 'postgres',
        'db.query.text': 'SELECT ? + ? AS solution',
        'db.operation.name': 'SELECT',
        'db.namespace': 'postgres',
        'server.address': 'localhost',
        'server.port': 5432,
      }),
    }),
  );
  expect(spans).toContainEqual(
    expect.objectContaining({
      op: 'db',
      origin: 'auto.db.postgresjs',
      description: 'SELECT * from generate_series(?, ?) as x',
      status: 'ok',
      data: expect.objectContaining({
        'db.system.name': 'postgres',
        'db.operation.name': 'SELECT',
      }),
    }),
  );
});
