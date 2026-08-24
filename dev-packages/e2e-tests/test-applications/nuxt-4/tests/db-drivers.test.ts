import { expect, test } from '@playwright/test';
import { waitForTransaction } from '@sentry-internal/test-utils';

// The Nuxt module auto-wires the orchestrion build-time transform, which injects
// `diagnostics_channel` publishers into these drivers as Nitro bundles them. That
// only happens in the production build, so these tests are excluded from the
// `test:dev` pass (which filters to `environment`).
test('Instruments ioredis automatically', async ({ baseURL }) => {
  const transactionEventPromise = waitForTransaction('nuxt-4', transactionEvent => {
    return (
      transactionEvent.contexts?.trace?.op === 'http.server' && transactionEvent.transaction === 'GET /api/db-ioredis'
    );
  });

  const response = await fetch(`${baseURL}/api/db-ioredis`);
  expect(response.status).toBe(200);
  expect(await response.text()).toBe('test-value');

  const transactionEvent = await transactionEventPromise;

  expect(transactionEvent.contexts?.trace?.op).toEqual('http.server');
  expect(transactionEvent.transaction).toEqual('GET /api/db-ioredis');

  const spans = transactionEvent.spans || [];

  expect(spans).toContainEqual(
    expect.objectContaining({
      op: 'db',
      origin: 'auto.db.redis',
      description: 'set test-key [1 other arguments]',
      status: 'ok',
      data: expect.objectContaining({
        'db.system.name': 'redis',
        'db.query.text': 'set test-key [1 other arguments]',
      }),
    }),
  );
  expect(spans).toContainEqual(
    expect.objectContaining({
      op: 'db',
      origin: 'auto.db.redis',
      description: 'get test-key',
      status: 'ok',
      data: expect.objectContaining({
        'db.system.name': 'redis',
        'db.query.text': 'get test-key',
      }),
    }),
  );
});

test('Instruments mysql automatically', async ({ baseURL }) => {
  const transactionEventPromise = waitForTransaction('nuxt-4', transactionEvent => {
    return (
      transactionEvent.contexts?.trace?.op === 'http.server' && transactionEvent.transaction === 'GET /api/db-mysql'
    );
  });

  const response = await fetch(`${baseURL}/api/db-mysql`);
  expect(response.status).toBe(200);
  await expect(response.json()).resolves.toEqual({ status: 'ok' });

  const transactionEvent = await transactionEventPromise;

  const spans = transactionEvent.spans || [];

  expect(spans).toContainEqual(
    expect.objectContaining({
      op: 'db',
      origin: 'auto.db.mysql',
      description: 'SELECT 1 + 1 AS solution',
      status: 'ok',
      data: expect.objectContaining({
        'db.system.name': 'mysql',
        'db.query.text': 'SELECT 1 + 1 AS solution',
        'db.user': 'root',
        'db.connection_string': expect.any(String),
        'server.address': expect.any(String),
        'server.port': 3306,
      }),
    }),
  );
  expect(spans).toContainEqual(
    expect.objectContaining({
      op: 'db',
      origin: 'auto.db.mysql',
      description: 'SELECT NOW()',
      status: 'ok',
      data: expect.objectContaining({
        'db.system.name': 'mysql',
        'db.query.text': 'SELECT NOW()',
        'db.user': 'root',
        'db.connection_string': expect.any(String),
        'server.address': expect.any(String),
        'server.port': 3306,
      }),
    }),
  );
});
