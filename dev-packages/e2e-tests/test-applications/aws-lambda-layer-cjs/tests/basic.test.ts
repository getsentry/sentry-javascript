import * as child_process from 'child_process';
import { expect, test } from '@playwright/test';
import { waitForTransaction } from '@sentry-internal/test-utils';

test('Lambda layer SDK bundle sends events', async ({ request }) => {
  const transactionEventPromise = waitForTransaction('aws-serverless-lambda-layer-cjs', transactionEvent => {
    return transactionEvent?.transaction === 'aws-lambda-layer-test-txn';
  });

  // Waiting for 1s here because attaching the listener for events in `waitForTransaction` is not synchronous
  // Since in this test, we don't start a browser via playwright, we don't have the usual delays (page.goto, etc)
  // which are usually enough for us to never have noticed this race condition before.
  // This is a workaround but probably sufficient as long as we only experience it in this test.
  await new Promise<void>(resolve =>
    setTimeout(() => {
      resolve();
    }, 1000),
  );

  child_process.execSync('pnpm start', {
    stdio: 'ignore',
  });

  const transactionEvent = await transactionEventPromise;

  // shows the SDK sent a transaction
  expect(transactionEvent.transaction).toEqual('aws-lambda-layer-test-txn');

  // shows that the Otel Http instrumentation is working
  expect(transactionEvent.spans).toHaveLength(1);
  expect(transactionEvent.spans![0]).toMatchObject({
    data: expect.objectContaining({
      'sentry.op': 'http.client',
      'sentry.origin': 'auto.http.otel.http',
      url: 'http://example.com/',
    }),
    description: 'GET http://example.com/',
    op: 'http.client',
  });
});
