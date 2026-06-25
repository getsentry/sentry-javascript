import { expect, test } from '@playwright/test';
import { waitForTransaction } from '@sentry-internal/test-utils';

test('Instruments ioredis automatically', async ({ baseURL }) => {
  const transactionEventPromise = waitForTransaction('nuxt-4-orchestrion', transactionEvent => {
    return transactionEvent.contexts?.trace?.op === 'http.server' && transactionEvent.transaction === 'GET /api/db-ioredis';
  });

  await fetch(`${baseURL}/api/db-ioredis`);

  const transactionEvent = await transactionEventPromise;

  expect(transactionEvent.contexts?.trace?.op).toEqual('http.server');
  expect(transactionEvent.transaction).toEqual('GET /api/db-ioredis');

  const spans = transactionEvent.spans || [];

  expect(spans).toContainEqual(
    expect.objectContaining({
      op: 'db',
      origin: 'auto.db.otel.redis',
      description: 'set test-key [1 other arguments]',
      data: expect.objectContaining({
        'db.system': 'redis',
        'db.statement': 'set test-key [1 other arguments]',
      }),
    }),
  );
  expect(spans).toContainEqual(
    expect.objectContaining({
      op: 'db',
      origin: 'auto.db.otel.redis',
      description: 'get test-key',
      data: expect.objectContaining({
        'db.system': 'redis',
        'db.statement': 'get test-key',
      }),
    }),
  );
});

test('Instruments mysql automatically', async ({ baseURL }) => {
  const transactionEventPromise = waitForTransaction('nuxt-4-orchestrion', transactionEvent => {
    return (
      transactionEvent.contexts?.trace?.op === 'http.server' && transactionEvent.transaction === 'GET /api/db-mysql'
    );
  });

  await fetch(`${baseURL}/api/db-mysql`);

  const transactionEvent = await transactionEventPromise;

  // TODO: currently only logging transaction

  // eslint-disable-next-line no-console
  console.log('db-mysql transaction:', JSON.stringify(transactionEvent, null, 2));
});

