import { expect, test } from '@playwright/test';
import { waitForTransaction } from '@sentry-internal/test-utils';

test('should not automatically create transactions for routes that were excluded from auto wrapping (string)', async ({
  request,
}) => {
  const transactionPromise = waitForTransaction('nextjs-13', async transactionEvent => {
    return (
      transactionEvent.transaction === 'GET /api/endpoint-excluded-with-string' &&
      transactionEvent.contexts?.trace?.op === 'http.server'
    );
  });

  await (await request.get(`/api/endpoint-excluded-with-string`)).json();

  let transactionPromiseReceived = false;
  transactionPromise.then(() => {
    transactionPromiseReceived = true;
  });

  await new Promise(resolve => setTimeout(resolve, 5_000));

  expect(transactionPromiseReceived).toBe(false);
});

test('should not automatically create transactions for routes that were excluded from auto wrapping (regex)', async ({
  request,
}) => {
  const transactionPromise = waitForTransaction('nextjs-13', async transactionEvent => {
    return (
      transactionEvent.transaction === 'GET /api/endpoint-excluded-with-regex' &&
      transactionEvent.contexts?.trace?.op === 'http.server'
    );
  });

  await (await request.get(`/api/endpoint-excluded-with-regex`)).json();

  let transactionPromiseReceived = false;
  transactionPromise.then(() => {
    transactionPromiseReceived = true;
  });

  await new Promise(resolve => setTimeout(resolve, 5_000));

  expect(transactionPromiseReceived).toBe(false);
});
