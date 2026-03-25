import { expect, test } from '@playwright/test';
import { waitForTransaction } from '@sentry-internal/test-utils';

/**
 * This must be the only test in here.
 *
 * Both the Worker and the Durable Object initialize their own AsyncLocalStorage
 * context. Wrangler dev is currently single-threaded locally, so when a previous
 * test (e.g. a websocket test) already sets up ALS, that context carries over
 * and masks bugs in our instrumentation - causing this test to pass when it
 * should fail.
 */
test('Worker and Durable Object both send transactions when worker calls DO', async ({ baseURL }) => {
  const workerTransactionPromise = waitForTransaction('cloudflare-local-workers', event => {
    return event.transaction === 'GET /pass-to-object/storage/get' && event.contexts?.trace?.op === 'http.server';
  });

  const doTransactionPromise = waitForTransaction('cloudflare-local-workers', event => {
    return event.transaction === 'GET /storage/get' && event.contexts?.trace?.op === 'http.server';
  });

  const response = await fetch(`${baseURL}/pass-to-object/storage/get`);
  expect(response.status).toBe(200);

  const [workerTransaction, doTransaction] = await Promise.all([workerTransactionPromise, doTransactionPromise]);

  expect(workerTransaction.transaction).toBe('GET /pass-to-object/storage/get');
  expect(workerTransaction.contexts?.trace?.op).toBe('http.server');

  expect(doTransaction.transaction).toBe('GET /storage/get');
  expect(doTransaction.contexts?.trace?.op).toBe('http.server');
  expect(doTransaction.spans?.some(span => span.op === 'db')).toBe(true);
});
