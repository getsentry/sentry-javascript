import type { SerializedStreamedSpanContainer } from '@sentry/core';
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
function assertAwsServiceSpans(spanCcontainer: SerializedStreamedSpanContainer): void {
  const spans = spanCcontainer.items;

  const expectSpan = (
    label: string,
    expected: Record<string, unknown>,
    find?: (item: SerializedStreamedSpanContainer['items'][number]) => boolean,
  ): void => {
    const matches = spans.filter(item => item.name === expected.name);
    const span = find ? matches.find(find) : matches[0];
    expect(span, label).toMatchObject(expected);
  };

  const segmentSpan = spans.find(item => item.is_segment);

  expect(segmentSpan?.name).toBe('Test Service Span');

  // S3 - PutObject (success)
  expectSpan('S3.PutObject', {
    name: 'S3.PutObject',
    status: 'ok',
    attributes: expect.objectContaining({
      'sentry.origin': { value: 'auto.otel.aws', type: 'string' },
      'sentry.op': { value: 'rpc', type: 'string' },
      'rpc.system': { value: 'aws-api', type: 'string' },
      'rpc.method': { value: 'PutObject', type: 'string' },
      'rpc.service': { value: 'S3', type: 'string' },
      'cloud.region': { value: 'us-east-1', type: 'string' },
      'aws.s3.bucket': { value: 'ot-demo-test', type: 'string' },
      'otel.kind': { value: 'CLIENT', type: 'string' },
    }),
  });

  // S3 - GetObject (success)
  expectSpan(
    'S3.GetObject (success)',
    {
      name: 'S3.GetObject',
      status: 'ok',
      attributes: expect.objectContaining({
        'rpc.method': { value: 'GetObject', type: 'string' },
        'rpc.service': { value: 'S3', type: 'string' },
        'aws.s3.bucket': { value: 'ot-demo-test', type: 'string' },
      }),
    },
    // Two spans share the name `S3.GetObject`; disambiguate by HTTP status code.
    item => item.attributes?.['http.status_code']?.value === 200,
  );

  // S3 - GetObject (errored, missing key)
  expectSpan(
    'S3.GetObject (error)',
    {
      name: 'S3.GetObject',
      status: 'error',
      attributes: expect.objectContaining({
        'rpc.method': { value: 'GetObject', type: 'string' },
        'rpc.service': { value: 'S3', type: 'string' },
      }),
    },
    item => item.attributes?.['http.status_code']?.value === 404,
  );

  // DynamoDB - PutItem
  expectSpan('DynamoDB.PutItem', {
    name: 'DynamoDB.PutItem',
    attributes: expect.objectContaining({
      'rpc.method': { value: 'PutItem', type: 'string' },
      'rpc.service': { value: 'DynamoDB', type: 'string' },
      'db.system': { value: 'dynamodb', type: 'string' },
      'db.name': { value: 'my-table', type: 'string' },
      'db.operation': { value: 'PutItem', type: 'string' },
      'aws.dynamodb.table_names': { value: ['my-table'], type: 'array' },
    }),
  });

  // DynamoDB - Query
  expectSpan('DynamoDB.Query', {
    name: 'DynamoDB.Query',
    attributes: expect.objectContaining({
      'rpc.method': { value: 'Query', type: 'string' },
      'db.operation': { value: 'Query', type: 'string' },
      'aws.dynamodb.count': { value: 1, type: 'integer' },
      'aws.dynamodb.scanned_count': { value: 1, type: 'integer' },
    }),
  });

  // SQS - SendMessage (producer)
  expectSpan('SQS SendMessage', {
    name: 'my-queue send',
    attributes: expect.objectContaining({
      'rpc.method': { value: 'SendMessage', type: 'string' },
      'rpc.service': { value: 'SQS', type: 'string' },
      'messaging.system': { value: 'aws_sqs', type: 'string' },
      'messaging.destination.name': { value: 'my-queue', type: 'string' },
      'url.full': { value: 'https://sqs.us-east-1.amazonaws.com/123456789012/my-queue', type: 'string' },
      'messaging.message.id': { value: 'message-id-1', type: 'string' },
      'otel.kind': { value: 'PRODUCER', type: 'string' },
    }),
  });

  // SQS - ReceiveMessage (consumer)
  expectSpan('SQS ReceiveMessage', {
    name: 'my-queue receive',
    attributes: expect.objectContaining({
      'rpc.method': { value: 'ReceiveMessage', type: 'string' },
      'messaging.system': { value: 'aws_sqs', type: 'string' },
      'messaging.operation.type': { value: 'receive', type: 'string' },
      'messaging.batch.message_count': { value: 1, type: 'integer' },
      'otel.kind': { value: 'CONSUMER', type: 'string' },
    }),
  });

  // SNS - Publish (producer)
  expectSpan('SNS Publish', {
    name: 'my-topic send',
    attributes: expect.objectContaining({
      'rpc.method': { value: 'Publish', type: 'string' },
      'rpc.service': { value: 'SNS', type: 'string' },
      'messaging.system': { value: 'aws.sns', type: 'string' },
      'messaging.destination': { value: 'my-topic', type: 'string' },
      'aws.sns.topic.arn': { value: 'arn:aws:sns:us-east-1:123456789012:my-topic', type: 'string' },
      'otel.kind': { value: 'PRODUCER', type: 'string' },
    }),
  });

  // Lambda - Invoke
  expectSpan('Lambda Invoke', {
    name: 'my-function Invoke',
    attributes: expect.objectContaining({
      'rpc.method': { value: 'Invoke', type: 'string' },
      'rpc.service': { value: 'Lambda', type: 'string' },
      'faas.invoked_name': { value: 'my-function', type: 'string' },
      'faas.invoked_provider': { value: 'aws', type: 'string' },
      'faas.execution': { value: 'request-id-1', type: 'string' },
    }),
  });

  // Kinesis - PutRecord
  expectSpan('Kinesis.PutRecord', {
    name: 'Kinesis.PutRecord',
    status: 'ok',
    attributes: expect.objectContaining({
      'rpc.method': { value: 'PutRecord', type: 'string' },
      'rpc.service': { value: 'Kinesis', type: 'string' },
      'aws.kinesis.stream.name': { value: 'my-stream', type: 'string' },
    }),
  });

  // SecretsManager - GetSecretValue
  expectSpan('SecretsManager.GetSecretValue', {
    name: 'SecretsManager.GetSecretValue',
    attributes: expect.objectContaining({
      'rpc.method': { value: 'GetSecretValue', type: 'string' },
      'rpc.service': { value: 'SecretsManager', type: 'string' },
      'aws.secretsmanager.secret.arn': {
        value: 'arn:aws:secretsmanager:us-east-1:123456789012:secret:my-secret-abc',
        type: 'string',
      },
    }),
  });

  // StepFunctions - StartExecution
  expectSpan('StepFunctions.StartExecution', {
    name: 'SFN.StartExecution',
    attributes: expect.objectContaining({
      'rpc.method': { value: 'StartExecution', type: 'string' },
      'rpc.service': { value: 'SFN', type: 'string' },
      'aws.step_functions.state_machine.arn': {
        value: 'arn:aws:states:us-east-1:123456789012:stateMachine:my-state-machine',
        type: 'string',
      },
    }),
  });
}

describe('awsIntegration (streamed)', () => {
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
          await createTestRunner().ignore('event').expect({ span: assertAwsServiceSpans }).start().completed();
        });
      },
      { additionalDependencies },
    );
  });
});
