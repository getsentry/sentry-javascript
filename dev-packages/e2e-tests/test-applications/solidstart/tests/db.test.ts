import { expect, test } from '@playwright/test';
import { waitForTransaction } from '@sentry-internal/test-utils';

test('Instruments ioredis automatically via build-time orchestrion', async ({ baseURL }) => {
  const transactionEventPromise = waitForTransaction('solidstart', transactionEvent => {
    return (
      transactionEvent.contexts?.trace?.op === 'http.server' && !!transactionEvent.transaction?.includes('db-ioredis')
    );
  });

  await fetch(`${baseURL}/api/db-ioredis`);

  const transactionEvent = await transactionEventPromise;
  const spans = transactionEvent.spans || [];

  expect(spans).toContainEqual(
    expect.objectContaining({
      op: 'db',
      origin: 'auto.db.redis',
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
      origin: 'auto.db.redis',
      description: 'get test-key',
      status: 'ok',
      data: expect.objectContaining({
        'db.system': 'redis',
        'db.statement': 'get test-key',
      }),
    }),
  );
});

test('Instruments mysql automatically via build-time orchestrion', async ({ baseURL }) => {
  const transactionEventPromise = waitForTransaction('solidstart', transactionEvent => {
    return (
      transactionEvent.contexts?.trace?.op === 'http.server' && !!transactionEvent.transaction?.includes('db-mysql')
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
