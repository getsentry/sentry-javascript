import { waitForTransaction } from '@sentry-internal/test-utils';
import { InvokeCommand } from '@aws-sdk/client-lambda';
import { test, expect } from './lambda-fixtures';

test.describe('NPM package', () => {
  test('tracing in CJS works', async ({ lambdaClient }) => {
    const transactionEventPromise = waitForTransaction('aws-serverless-lambda-sam', transactionEvent => {
      return transactionEvent?.transaction === 'NpmTracingCjs';
    });

    await lambdaClient.send(
      new InvokeCommand({
        FunctionName: 'NpmTracingCjs',
        Payload: JSON.stringify({}),
      }),
    );

    const transactionEvent = await transactionEventPromise;

    // shows the SDK sent a transaction
    expect(transactionEvent.transaction).toEqual('NpmTracingCjs'); // name should be the function name
    expect(transactionEvent.contexts?.trace).toEqual({
      data: {
        'sentry.sample_rate': 1,
        'sentry.source': 'custom',
        'sentry.origin': 'auto.otel.aws_lambda',
        'sentry.op': 'function.aws.lambda',
        'cloud.account.id': '012345678912',
        'faas.execution': expect.any(String),
        'faas.id': 'arn:aws:lambda:us-east-1:012345678912:function:NpmTracingCjs',
        'faas.coldstart': true,
        'otel.kind': 'SERVER',
      },
      op: 'function.aws.lambda',
      origin: 'auto.otel.aws_lambda',
      span_id: expect.stringMatching(/[a-f0-9]{16}/),
      status: 'ok',
      trace_id: expect.stringMatching(/[a-f0-9]{32}/),
    });

    expect(transactionEvent.spans).toHaveLength(2);

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

    // shows that the SDK source is correctly detected
    expect(transactionEvent.sdk?.packages).toContainEqual(
      expect.objectContaining({ name: 'npm:@sentry/aws-serverless' }),
    );
  });

  test('tracing in ESM works', async ({ lambdaClient }) => {
    const transactionEventPromise = waitForTransaction('aws-serverless-lambda-sam', transactionEvent => {
      return transactionEvent?.transaction === 'NpmTracingEsm';
    });

    await lambdaClient.send(
      new InvokeCommand({
        FunctionName: 'NpmTracingEsm',
        Payload: JSON.stringify({}),
      }),
    );

    const transactionEvent = await transactionEventPromise;

    // shows the SDK sent a transaction
    expect(transactionEvent.transaction).toEqual('NpmTracingEsm'); // name should be the function name
    expect(transactionEvent.contexts?.trace).toEqual({
      data: {
        'sentry.sample_rate': 1,
        'sentry.source': 'custom',
        'sentry.origin': 'auto.otel.aws_lambda',
        'sentry.op': 'function.aws.lambda',
        'cloud.account.id': '012345678912',
        'faas.execution': expect.any(String),
        'faas.id': 'arn:aws:lambda:us-east-1:012345678912:function:NpmTracingEsm',
        'faas.coldstart': true,
        'otel.kind': 'SERVER',
      },
      op: 'function.aws.lambda',
      origin: 'auto.otel.aws_lambda',
      span_id: expect.stringMatching(/[a-f0-9]{16}/),
      status: 'ok',
      trace_id: expect.stringMatching(/[a-f0-9]{32}/),
    });

    expect(transactionEvent.spans).toHaveLength(2);

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

    // shows that the SDK source is correctly detected
    expect(transactionEvent.sdk?.packages).toContainEqual(
      expect.objectContaining({ name: 'npm:@sentry/aws-serverless' }),
    );
  });
});
