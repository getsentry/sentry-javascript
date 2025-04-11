import * as child_process from 'child_process';
import { expect, test } from '@playwright/test';
import { waitForTransaction } from '@sentry-internal/test-utils';

test('AWS Serverless SDK sends events in ESM mode', async ({ request }) => {
  const transactionEventPromise = waitForTransaction('aws-serverless-esm', transactionEvent => {
    return transactionEvent?.transaction === 'my-lambda';
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
    stdio: 'inherit',
  });

  const transactionEvent = await transactionEventPromise;

  // shows the SDK sent a transaction
  expect(transactionEvent.transaction).toEqual('my-lambda'); // name should be the function name
  expect(transactionEvent.contexts?.trace).toEqual({
    data: {
      'sentry.sample_rate': 1,
      'sentry.source': 'custom',
      'sentry.origin': 'auto.otel.aws-lambda',
      'sentry.op': 'function.aws.lambda',
      'cloud.account.id': '123453789012',
      'faas.id': 'arn:aws:lambda:us-east-1:123453789012:function:my-lambda',
      'faas.coldstart': true,
      'otel.kind': 'SERVER',
    },
    op: 'function.aws.lambda',
    origin: 'auto.otel.aws-lambda',
    span_id: expect.stringMatching(/[a-f0-9]{16}/),
    status: 'ok',
    trace_id: expect.stringMatching(/[a-f0-9]{32}/),
  });

  expect(transactionEvent.spans).toHaveLength(3);

  // shows that the Otel Http instrumentation is working
  expect(transactionEvent.spans).toContainEqual(
    expect.objectContaining({
      data: expect.objectContaining({
        'sentry.op': 'http.client',
        'sentry.origin': 'auto.http.otel.http',
        url: 'http://example.com/',
      }),
      description: 'GET http://example.com/',
      op: 'http.client',
    }),
  );

  expect(transactionEvent.spans).toContainEqual(
    expect.objectContaining({
      data: {
        'sentry.op': 'function.aws.lambda',
        'sentry.origin': 'auto.function.serverless',
        'sentry.source': 'component',
      },
      description: 'my-lambda',
      op: 'function.aws.lambda',
      origin: 'auto.function.serverless',
    }),
  );

  // shows that the manual span creation is working
  expect(transactionEvent.spans).toContainEqual(
    expect.objectContaining({
      data: expect.objectContaining({
        'sentry.op': 'manual',
        'sentry.origin': 'manual',
      }),
      description: 'manual-span',
      op: 'manual',
    }),
  );
});
