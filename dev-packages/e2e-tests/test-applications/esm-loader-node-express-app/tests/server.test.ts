import { expect, test } from '@playwright/test';
import { waitForError, waitForTransaction } from '@sentry-internal/event-proxy-server';

test('Should record exceptions captured inside handlers', async ({ request }) => {
  const errorEventPromise = waitForError('esm-loader-node-express-app', errorEvent => {
    return !!errorEvent?.exception?.values?.[0]?.value?.includes('This is an error');
  });

  await request.get('/test-error');

  await expect(errorEventPromise).resolves.toBeDefined();
});

test('Should record a transaction for a parameterless route', async ({ request }) => {
  const transactionEventPromise = waitForTransaction('esm-loader-node-express-app', transactionEvent => {
    console.log('txn', transactionEvent.transaction);
    return transactionEvent?.transaction === 'GET /test-success';
  });

  await request.get('/test-success');

  await expect(transactionEventPromise).resolves.toBeDefined();
});

test('Should record a transaction for route with aparameters', async ({ request }) => {
  const transactionEventPromise = waitForTransaction('esm-loader-node-express-app', transactionEvent => {
    return transactionEvent?.transaction === 'GET /test-transaction/:param';
  });

  await request.get('/test-transaction/1');

  await expect(transactionEventPromise).resolves.toBeDefined();
});
