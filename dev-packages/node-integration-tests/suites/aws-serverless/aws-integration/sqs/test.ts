import { afterAll, describe, expect, test } from 'vitest';
import { cleanupChildProcesses, createRunner } from '../../../../utils/runner';

describe('awsIntegration - SQS', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  test('auto-instruments SQS send and receive, setting messaging attributes', async () => {
    await createRunner(__dirname, 'scenario.js')
      .ignore('event')
      .expect({
        transaction: {
          transaction: 'Test Transaction',
          spans: expect.arrayContaining([
            expect.objectContaining({
              description: 'my-queue send',
              op: 'rpc',
              origin: 'auto.otel.aws',
              data: expect.objectContaining({
                'sentry.origin': 'auto.otel.aws',
                'rpc.system': 'aws-api',
                'rpc.method': 'SendMessage',
                'rpc.service': 'SQS',
                'messaging.system': 'aws_sqs',
                'messaging.destination.name': 'my-queue',
                'url.full': 'https://sqs.us-east-1.amazonaws.com/123456789012/my-queue',
                'messaging.message.id': 'message-id-1',
                'otel.kind': 'PRODUCER',
              }),
            }),
            expect.objectContaining({
              description: 'my-queue receive',
              op: 'rpc',
              origin: 'auto.otel.aws',
              data: expect.objectContaining({
                'rpc.method': 'ReceiveMessage',
                'rpc.service': 'SQS',
                'messaging.system': 'aws_sqs',
                'messaging.destination.name': 'my-queue',
                'messaging.operation.type': 'receive',
                'messaging.batch.message_count': 1,
                'otel.kind': 'CONSUMER',
              }),
            }),
          ]),
        },
      })
      .start()
      .completed();
  });
});
