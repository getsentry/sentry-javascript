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
      origin: 'auto.db.orchestrion.generic_pool',
      status: 'ok',
      data: expect.objectContaining({
        'sentry.origin': 'auto.db.orchestrion.generic_pool',
      }),
    }),
  );
});

test('Instruments dataloader automatically via orchestrion', async ({ baseURL }) => {
  const transactionEventPromise = waitForTransaction('nextjs-16-orchestrion', transactionEvent => {
    return (
      transactionEvent.contexts?.trace?.op === 'http.server' && transactionEvent.transaction === 'GET /api/dataloader'
    );
  });

  await fetch(`${baseURL}/api/dataloader`);

  const transactionEvent = await transactionEventPromise;

  const spans = transactionEvent.spans || [];

  const loadSpan = spans.find(span => span.description === 'dataloader.load usersLoader');
  expect(loadSpan).toBeDefined();
  expect(loadSpan?.op).toBe('cache.get');
  expect(loadSpan?.origin).toBe('auto.db.orchestrion.dataloader');
  expect(loadSpan?.status).toBe('ok');
  expect(loadSpan?.data?.['cache.key']).toEqual(['user-1']);

  // The batch span opens on the deferred dispatch tick and links back to the load span.
  const batchSpan = spans.find(span => span.description === 'dataloader.batch usersLoader');
  expect(batchSpan).toBeDefined();
  expect(batchSpan?.op).toBe('cache.get');
  expect(batchSpan?.origin).toBe('auto.db.orchestrion.dataloader');
  expect(batchSpan?.status).toBe('ok');
});

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

// lru-memoizer's channel integration creates no spans — its only job is to restore the caller's async
// context onto the memoized callback. The route wraps the check in a `lru-memoizer-check` span and
// records whether the callback ran in that span's context, so we assert the attribute on that span.
test('Preserves async context through lru-memoizer via orchestrion', async ({ baseURL }) => {
  const transactionEventPromise = waitForTransaction('nextjs-16-orchestrion', transactionEvent => {
    return (
      transactionEvent.contexts?.trace?.op === 'http.server' && transactionEvent.transaction === 'GET /api/lru-memoizer'
    );
  });

  await fetch(`${baseURL}/api/lru-memoizer`);

  const transactionEvent = await transactionEventPromise;

  const spans = transactionEvent.spans || [];

  expect(spans).toContainEqual(
    expect.objectContaining({
      description: 'lru-memoizer-check',
      data: expect.objectContaining({
        'memoized.context_preserved': true,
      }),
    }),
  );
});
