import { expect, test } from '@playwright/test';
import { waitForTransaction } from '@sentry-internal/test-utils';

test('Instruments ioredis automatically via orchestrion', async ({ baseURL }) => {
  const transactionEventPromise = waitForTransaction('nextjs-16-orchestrion', transactionEvent => {
    return (
      transactionEvent.contexts?.trace?.op === 'http.server' && transactionEvent.transaction === 'GET /api/db-redis'
    );
  });

  await fetch(`${baseURL}/api/db-redis`);

  const transactionEvent = await transactionEventPromise;

  expect(transactionEvent.contexts?.trace?.op).toEqual('http.server');
  expect(transactionEvent.transaction).toEqual('GET /api/db-redis');

  const spans = transactionEvent.spans || [];

  expect(spans).toContainEqual(
    expect.objectContaining({
      op: 'db',
      origin: 'auto.db.orchestrion.redis',
      description: 'set test-key [1 other arguments]',
      status: 'ok',
      data: expect.objectContaining({
        'db.system': 'redis',
        'db.statement': 'set test-key [1 other arguments]',
      }),
    }),
  );
  expect(spans).toContainEqual(
    expect.objectContaining({
      op: 'db',
      origin: 'auto.db.orchestrion.redis',
      description: 'get test-key',
      status: 'ok',
      data: expect.objectContaining({
        'db.system': 'redis',
        'db.statement': 'get test-key',
      }),
    }),
  );
});

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
      origin: 'auto.db.orchestrion.postgres',
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
      origin: 'auto.db.orchestrion.postgres',
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

test('Instruments DB calls made during server-side rendering of a page', async ({ page }) => {
  const transactionEventPromise = waitForTransaction('nextjs-16-orchestrion', transactionEvent => {
    return transactionEvent.contexts?.trace?.op === 'http.server' && transactionEvent.transaction === 'GET /db-page';
  });

  await page.goto('/db-page');
  await expect(page.locator('#answer')).toHaveText('answer: 42');
  await expect(page.locator('#cached')).toHaveText('cached: 42');

  const transactionEvent = await transactionEventPromise;

  const spans = transactionEvent.spans || [];

  // One page render produces spans from both injection paths: pg (externalized → runtime module
  // hook) and ioredis (bundle-safe allowlisted → build-time loader).
  expect(spans).toContainEqual(
    expect.objectContaining({
      op: 'db',
      origin: 'auto.db.orchestrion.postgres',
      description: 'SELECT 40 + 2 AS answer',
      status: 'ok',
      data: expect.objectContaining({
        'db.system': 'postgresql',
        'db.statement': 'SELECT 40 + 2 AS answer',
      }),
    }),
  );
  expect(spans).toContainEqual(
    expect.objectContaining({
      op: 'db',
      origin: 'auto.db.orchestrion.redis',
      description: 'set page-key [1 other arguments]',
      status: 'ok',
      data: expect.objectContaining({
        'db.system': 'redis',
        'db.statement': 'set page-key [1 other arguments]',
      }),
    }),
  );
  expect(spans).toContainEqual(
    expect.objectContaining({
      op: 'db',
      origin: 'auto.db.orchestrion.redis',
      description: 'get page-key',
      status: 'ok',
    }),
  );
});

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
      origin: 'auto.db.orchestrion.mysql',
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
      origin: 'auto.db.orchestrion.mysql',
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
