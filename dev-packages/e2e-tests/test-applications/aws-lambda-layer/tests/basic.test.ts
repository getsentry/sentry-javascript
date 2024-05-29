import * as child_process from 'child_process';
import { expect, test } from '@playwright/test';
import { waitForTransaction } from '@sentry-internal/event-proxy-server';

test('Lambda layer SDK bundle sends events', async ({ request }) => {
  const transactionEventPromise = waitForTransaction('aws-serverless-lambda-layer', transactionEvent => {
    return transactionEvent?.transaction === 'aws-lambda-layer-test-txn';
  });

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
