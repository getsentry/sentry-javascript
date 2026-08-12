import { expect, test } from '@playwright/test';
import { waitForTransaction } from '@sentry-internal/test-utils';

const usesManagedTunnelRoute =
  (process.env.E2E_TEST_TUNNEL_ROUTE_MODE ?? 'off') !== 'off' || process.env.E2E_TEST_CUSTOM_TUNNEL_ROUTE === '1';

test.skip(usesManagedTunnelRoute, 'Default e2e suites run only in the proxy variant');

// `sentryTanstackStart()` auto-wires the orchestrion build-time transform, which injects
// `diagnostics_channel` publishers into these drivers as Vite bundles the server. That only
// happens in the production build, which is what the e2e app runs.
test('Instruments ioredis automatically', async ({ baseURL }) => {
  const transactionEventPromise = waitForTransaction('tanstackstart-react', transactionEvent => {
    return (
      transactionEvent.contexts?.trace?.op === 'http.server' && transactionEvent.transaction === 'GET /api/db-ioredis'
    );
  });

  await fetch(`${baseURL}/api/db-ioredis`);

  const transactionEvent = await transactionEventPromise;

  const spans = transactionEvent.spans || [];

  expect(spans).toContainEqual(
    expect.objectContaining({
      op: 'db.query',
      origin: 'auto.db.redis',
      description: 'set test-key [1 other arguments]',
      status: 'ok',
      data: expect.objectContaining({
        'db.system.name': 'redis',
        'db.operation.name': 'set',
        'db.query.text': 'set test-key [1 other arguments]',
      }),
    }),
  );
  expect(spans).toContainEqual(
    expect.objectContaining({
      op: 'db.query',
      origin: 'auto.db.redis',
      description: 'get test-key',
      status: 'ok',
      data: expect.objectContaining({
        'db.system.name': 'redis',
        'db.operation.name': 'get',
        'db.query.text': 'get test-key',
      }),
    }),
  );
});

test('Instruments mysql automatically', async ({ baseURL }) => {
  const transactionEventPromise = waitForTransaction('tanstackstart-react', transactionEvent => {
    return (
      transactionEvent.contexts?.trace?.op === 'http.server' && transactionEvent.transaction === 'GET /api/db-mysql'
    );
  });

  await fetch(`${baseURL}/api/db-mysql`);

  const transactionEvent = await transactionEventPromise;

  const spans = transactionEvent.spans || [];

  expect(spans).toContainEqual(
    expect.objectContaining({
      op: 'db',
      origin: 'auto.db.mysql',
      description: 'SELECT 1 + 1 AS solution',
      status: 'ok',
      data: expect.objectContaining({
        'db.system': 'mysql',
        'db.statement': 'SELECT 1 + 1 AS solution',
        'db.user': 'root',
        'db.connection_string': expect.any(String),
        'net.peer.name': expect.any(String),
        'net.peer.port': 3306,
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
        'db.system': 'mysql',
        'db.statement': 'SELECT NOW()',
        'db.user': 'root',
        'db.connection_string': expect.any(String),
        'net.peer.name': expect.any(String),
        'net.peer.port': 3306,
      }),
    }),
  );
});
