import type { TransactionEvent } from '@sentry/core';
import { afterAll, describe, expect } from 'vitest';
import { cleanupChildProcesses, createEsmAndCjsTests } from '../../../utils/runner';

// The aws-sdk instrumentation creates spans by patching the underlying smithy middleware stack. The
// patch target differs between aws-sdk versions, so we run the exact same assertions against both:
// - the current aws-sdk (default, resolved from the workspace) which routes through `@smithy/core` >= 3.24.0
// - aws-sdk 3.1041.0 pinned together with the pre-`@smithy/core` stack (`@smithy/middleware-stack`)
const LEGACY_AWS_SDK_DEPENDENCIES = {
  '@aws-sdk/client-dynamodb': '3.1041.0',
  '@aws-sdk/client-kinesis': '3.1041.0',
  '@aws-sdk/client-lambda': '3.1041.0',
  '@aws-sdk/client-s3': '3.1041.0',
  '@aws-sdk/client-secrets-manager': '3.1041.0',
  '@aws-sdk/client-sfn': '3.1041.0',
  '@aws-sdk/client-sns': '3.1041.0',
  '@aws-sdk/client-sqs': '3.1041.0',
  // Pin the smithy layer to the pre-`@smithy/core` versions, otherwise the 3.1041.0 clients still
  // resolve `@smithy/smithy-client` >= 4.13 (which routes through `@smithy/core` >= 3.24.0).
  '@smithy/smithy-client': '4.12.13',
  '@smithy/core': '3.23.17',
  '@smithy/middleware-stack': '4.2.14',
  '@smithy/node-http-handler': '4.7.8',
};

/**
 * Asserts the transaction contains one span per instrumented aws-sdk service. Each service is checked
 * with its own `expect` so a failure points at the specific service rather than the whole transaction.
 */
function assertAwsServiceSpans(transaction: TransactionEvent): void {
  const spans = transaction.spans ?? [];

  const expectSpan = (label: string, expected: Record<string, unknown>): void => {
    expect(spans, `expected an aws-sdk span for "${label}"`).toContainEqual(expect.objectContaining(expected));
  };

  expect(transaction.transaction).toBe('Test Transaction');

  // S3 - PutObject (success)
  expectSpan('S3.PutObject', {
    description: 'S3.PutObject',
    op: 'rpc',
    origin: 'auto.otel.aws',
    status: 'ok',
    data: expect.objectContaining({
      'sentry.origin': 'auto.otel.aws',
      'sentry.op': 'rpc',
      'rpc.system': 'aws-api',
      'rpc.method': 'PutObject',
      'rpc.service': 'S3',
      'cloud.region': 'us-east-1',
      'aws.s3.bucket': 'ot-demo-test',
      'otel.kind': 'CLIENT',
    }),
  });

  // S3 - GetObject (success)
  expectSpan('S3.GetObject (success)', {
    description: 'S3.GetObject',
    op: 'rpc',
    origin: 'auto.otel.aws',
    status: 'ok',
    data: expect.objectContaining({ 'rpc.method': 'GetObject', 'rpc.service': 'S3', 'aws.s3.bucket': 'ot-demo-test' }),
  });

  // S3 - GetObject (errored, missing key)
  expectSpan('S3.GetObject (error)', {
    description: 'S3.GetObject',
    op: 'rpc',
    origin: 'auto.otel.aws',
    status: 'internal_error',
    data: expect.objectContaining({ 'rpc.method': 'GetObject', 'rpc.service': 'S3' }),
  });

  // DynamoDB - PutItem
  expectSpan('DynamoDB.PutItem', {
    description: 'DynamoDB.PutItem',
    op: 'db',
    origin: 'auto.otel.aws',
    data: expect.objectContaining({
      'sentry.op': 'db',
      'rpc.method': 'PutItem',
      'rpc.service': 'DynamoDB',
      'db.system': 'dynamodb',
      'db.name': 'my-table',
      'db.operation': 'PutItem',
      'aws.dynamodb.table_names': ['my-table'],
    }),
  });

  // DynamoDB - Query
  expectSpan('DynamoDB.Query', {
    description: 'DynamoDB.Query',
    op: 'db',
    origin: 'auto.otel.aws',
    data: expect.objectContaining({
      'rpc.method': 'Query',
      'db.operation': 'Query',
      'aws.dynamodb.count': 1,
      'aws.dynamodb.scanned_count': 1,
    }),
  });

  // SQS - SendMessage (producer)
  expectSpan('SQS SendMessage', {
    description: 'my-queue send',
    op: 'rpc',
    origin: 'auto.otel.aws',
    data: expect.objectContaining({
      'rpc.method': 'SendMessage',
      'rpc.service': 'SQS',
      'messaging.system': 'aws_sqs',
      'messaging.destination.name': 'my-queue',
      'url.full': 'https://sqs.us-east-1.amazonaws.com/123456789012/my-queue',
      'messaging.message.id': 'message-id-1',
      'otel.kind': 'PRODUCER',
    }),
  });

  // SQS - ReceiveMessage (consumer)
  expectSpan('SQS ReceiveMessage', {
    description: 'my-queue receive',
    op: 'rpc',
    origin: 'auto.otel.aws',
    data: expect.objectContaining({
      'rpc.method': 'ReceiveMessage',
      'messaging.system': 'aws_sqs',
      'messaging.operation.type': 'receive',
      'messaging.batch.message_count': 1,
      'otel.kind': 'CONSUMER',
    }),
  });

  // SNS - Publish (producer)
  expectSpan('SNS Publish', {
    description: 'my-topic send',
    op: 'rpc',
    origin: 'auto.otel.aws',
    data: expect.objectContaining({
      'rpc.method': 'Publish',
      'rpc.service': 'SNS',
      'messaging.system': 'aws.sns',
      'messaging.destination': 'my-topic',
      'aws.sns.topic.arn': 'arn:aws:sns:us-east-1:123456789012:my-topic',
      'otel.kind': 'PRODUCER',
    }),
  });

  // Lambda - Invoke
  expectSpan('Lambda Invoke', {
    description: 'my-function Invoke',
    op: 'rpc',
    origin: 'auto.otel.aws',
    data: expect.objectContaining({
      'rpc.method': 'Invoke',
      'rpc.service': 'Lambda',
      'faas.invoked_name': 'my-function',
      'faas.invoked_provider': 'aws',
      'faas.execution': 'request-id-1',
    }),
  });

  // Kinesis - PutRecord
  expectSpan('Kinesis.PutRecord', {
    description: 'Kinesis.PutRecord',
    op: 'rpc',
    origin: 'auto.otel.aws',
    status: 'ok',
    data: expect.objectContaining({
      'rpc.method': 'PutRecord',
      'rpc.service': 'Kinesis',
      'aws.kinesis.stream.name': 'my-stream',
    }),
  });

  // SecretsManager - GetSecretValue
  expectSpan('SecretsManager.GetSecretValue', {
    description: 'SecretsManager.GetSecretValue',
    op: 'rpc',
    origin: 'auto.otel.aws',
    data: expect.objectContaining({
      'rpc.method': 'GetSecretValue',
      'rpc.service': 'SecretsManager',
      'aws.secretsmanager.secret.arn': 'arn:aws:secretsmanager:us-east-1:123456789012:secret:my-secret-abc',
    }),
  });

  // StepFunctions - StartExecution
  expectSpan('StepFunctions.StartExecution', {
    description: 'SFN.StartExecution',
    op: 'rpc',
    origin: 'auto.otel.aws',
    data: expect.objectContaining({
      'rpc.method': 'StartExecution',
      'rpc.service': 'SFN',
      'aws.step_functions.state_machine.arn': 'arn:aws:states:us-east-1:123456789012:stateMachine:my-state-machine',
    }),
  });
}

describe('awsIntegration', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  describe.each([
    { label: 'latest', additionalDependencies: undefined },
    { label: 'v3.1041.0 (@smithy/middleware-stack)', additionalDependencies: LEGACY_AWS_SDK_DEPENDENCIES },
  ])('aws-sdk $label', ({ additionalDependencies }) => {
    createEsmAndCjsTests(
      __dirname,
      'scenario.mjs',
      'instrument.mjs',
      (createTestRunner, test) => {
        test('auto-instruments aws-sdk service operations', { timeout: 90_000 }, async () => {
          await createTestRunner().ignore('event').expect({ transaction: assertAwsServiceSpans }).start().completed();
        });
      },
      { additionalDependencies },
    );
  });
});
