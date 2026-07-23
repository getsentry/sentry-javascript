import { expect, test } from '@playwright/test';
import { waitForTransaction } from '@sentry-internal/test-utils';

test('Instruments knex automatically via orchestrion', async ({ baseURL }) => {
  const transactionEventPromise = waitForTransaction('nextjs-16-orchestrion', transactionEvent => {
    return transactionEvent.contexts?.trace?.op === 'http.server' && transactionEvent.transaction === 'GET /api/knex';
  });

  await fetch(`${baseURL}/api/knex`);

  const transactionEvent = await transactionEventPromise;

  const spans = transactionEvent.spans || [];

  expect(spans).toContainEqual(
    expect.objectContaining({
      op: 'db',
      origin: 'auto.db.orchestrion.knex',
      status: 'ok',
      description: 'insert into "knex_users" ("name") values (?)',
      data: expect.objectContaining({
        'db.system': 'postgresql',
        'db.name': 'postgres',
        'sentry.origin': 'auto.db.orchestrion.knex',
        'sentry.op': 'db',
        'net.peer.name': 'localhost',
        'net.peer.port': 5432,
      }),
    }),
  );
  expect(spans).toContainEqual(
    expect.objectContaining({
      op: 'db',
      origin: 'auto.db.orchestrion.knex',
      status: 'ok',
      description: 'select * from "knex_users"',
      data: expect.objectContaining({
        'db.system': 'postgresql',
        'db.operation': 'select',
        'db.sql.table': 'knex_users',
        'db.statement': 'select * from "knex_users"',
        'sentry.origin': 'auto.db.orchestrion.knex',
        'sentry.op': 'db',
      }),
    }),
  );
});
