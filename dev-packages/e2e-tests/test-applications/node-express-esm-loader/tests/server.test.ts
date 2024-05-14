import { expect, test } from '@playwright/test';
import { waitForError, waitForTransaction } from '@sentry-internal/event-proxy-server';

test('Should record exceptions captured inside handlers', async ({ request }) => {
  const errorEventPromise = waitForError('node-express-esm-loader', errorEvent => {
    return !!errorEvent?.exception?.values?.[0]?.value?.includes('This is an error');
  });

  await request.get('/test-error');

  await expect(errorEventPromise).resolves.toBeDefined();
});

test('Should record a transaction for a parameterless route', async ({ request }) => {
  const transactionEventPromise = waitForTransaction('node-express-esm-loader', transactionEvent => {
    return transactionEvent?.transaction === 'GET /test-success';
  });

  await request.get('/test-success');

  await expect(transactionEventPromise).resolves.toBeDefined();
});

test('Should record a transaction for route with parameters', async ({ request }) => {
  const transactionEventPromise = waitForTransaction('node-express-esm-loader', transactionEvent => {
    return transactionEvent?.transaction === 'GET /test-transaction/1';
  });

  await request.get('/test-transaction/1');

  await expect(transactionEventPromise).resolves.toBeDefined();
});
