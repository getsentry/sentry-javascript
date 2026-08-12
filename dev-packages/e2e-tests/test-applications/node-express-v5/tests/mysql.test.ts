import { expect, test } from '@playwright/test';
import { waitForTransaction } from '@sentry-internal/test-utils';

test('Instruments MySQL via Orchestrion', async ({ baseURL }) => {
  const transactionEventPromise = waitForTransaction('node-express-v5', transactionEvent => {
    return transactionEvent.contexts?.trace?.op === 'http.server' && transactionEvent.transaction === 'GET /test-mysql';
  });

  await fetch(`${baseURL}/test-mysql`);

  const transactionEvent = await transactionEventPromise;

  expect(transactionEvent.contexts?.trace?.op).toEqual('http.server');
  expect(transactionEvent.transaction).toEqual('GET /test-mysql');
  expect(transactionEvent.contexts?.trace?.status).toEqual('ok');
  expect(transactionEvent.contexts?.trace?.data?.['http.status_code']).toEqual(200);

  const spans = transactionEvent.spans || [];
  expect(spans).toContainEqual(
    expect.objectContaining({
      op: 'db',
      origin: 'auto.db.mysql',
      description: 'SELECT 1 + 1 AS solution',
    }),
  );
  expect(spans).toContainEqual(
    expect.objectContaining({
      op: 'db',
      origin: 'auto.db.mysql',
      description: 'SELECT NOW()',
    }),
  );
});
