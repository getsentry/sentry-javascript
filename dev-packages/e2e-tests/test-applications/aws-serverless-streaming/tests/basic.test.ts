import * as child_process from 'child_process';
import { expect, test } from '@playwright/test';
import { waitForTransaction } from '@sentry-internal/test-utils';

test('AWS Serverless SDK sends events from streaming handler', async ({ request }) => {
  const transactionEventPromise = waitForTransaction('aws-serverless-streaming', transactionEvent => {
    return transactionEvent?.transaction === 'my-streaming-lambda';
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

  expect(transactionEvent.transaction).toEqual('my-streaming-lambda');
  expect(transactionEvent.contexts?.trace).toEqual({
    data: {
      'sentry.sample_rate': 1,
      'sentry.source': 'custom',
      'sentry.origin': 'auto.otel.aws-lambda',
      'sentry.op': 'function.aws.lambda',
      'cloud.account.id': '123453789012',
      'faas.id': 'arn:aws:lambda:us-east-1:123453789012:function:my-streaming-lambda',
      'faas.coldstart': true,
      'otel.kind': 'SERVER',
    },
    op: 'function.aws.lambda',
    origin: 'auto.otel.aws-lambda',
    span_id: expect.stringMatching(/[a-f0-9]{16}/),
    status: 'ok',
    trace_id: expect.stringMatching(/[a-f0-9]{32}/),
  });

  expect(transactionEvent.spans).toHaveLength(1);

  const streamingSpan = transactionEvent.spans?.[0];
  expect(streamingSpan).toMatchObject({
    description: 'streaming-span',
    op: 'stream',
    status: 'ok',
    origin: 'manual',
  });
});
