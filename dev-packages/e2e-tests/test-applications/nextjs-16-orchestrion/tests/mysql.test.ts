import { expect, test } from '@playwright/test';
import { waitForTransaction } from '@sentry-internal/test-utils';

// Unlike ioredis (bundle-safe allowlisted → bundled + transformed by the build-time loader),
// `pg` and `mysql` stay externalized and are instrumented by the orchestrion runtime module hook
// on require — which works because the SDK also externalizes the `@apm-js-collab/*` transformer
// packages. Same spans either way, different injection path. (`mysql` in particular MUST stay
// external: Turbopack cannot bundle it correctly — its wire protocol breaks even untransformed.)
test('Instruments mysql automatically via orchestrion', async ({ baseURL }) => {
  const transactionEventPromise = waitForTransaction('nextjs-16-orchestrion', transactionEvent => {
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
        'db.system': 'mysql',
        'db.statement': 'SELECT NOW()',
        'db.user': 'root',
        'db.connection_string': expect.any(String),
        'server.address': expect.any(String),
        'server.port': 3306,
      }),
    }),
  );
});
