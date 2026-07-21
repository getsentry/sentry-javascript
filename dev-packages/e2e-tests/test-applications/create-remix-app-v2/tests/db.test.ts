import { expect, test } from '@playwright/test';
import { waitForTransaction } from '@sentry-internal/test-utils';

// These assertions only hold in the orchestrion variant (INJECT_ORCHESTRION=true), which
// force-bundles + transforms mysql/ioredis and boots the databases via docker-compose.
test.describe('orchestrion DB instrumentation', () => {
  test.skip(process.env.INJECT_ORCHESTRION !== 'true', 'Only runs in the orchestrion variant');

  test('Instruments ioredis automatically via orchestrion', async ({ baseURL }) => {
    const transactionEventPromise = waitForTransaction('create-remix-app-v2', transactionEvent => {
      return (
        transactionEvent.contexts?.trace?.op === 'http.server' && !!transactionEvent.transaction?.includes('db-ioredis')
      );
    });

    await fetch(`${baseURL}/db-ioredis`);

    const transactionEvent = await transactionEventPromise;

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

  test('Instruments mysql automatically via orchestrion', async ({ baseURL }) => {
    const transactionEventPromise = waitForTransaction('create-remix-app-v2', transactionEvent => {
      return (
        transactionEvent.contexts?.trace?.op === 'http.server' && !!transactionEvent.transaction?.includes('db-mysql')
      );
    });

    await fetch(`${baseURL}/db-mysql`);

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
});
