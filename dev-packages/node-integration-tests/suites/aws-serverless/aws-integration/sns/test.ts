import { afterAll, describe, expect, test } from 'vitest';
import { cleanupChildProcesses, createRunner } from '../../../../utils/runner';

describe('awsIntegration - SNS', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  test('auto-instruments SNS publish, setting messaging attributes', async () => {
    await createRunner(__dirname, 'scenario.js')
      .ignore('event')
      .expect({
        transaction: {
          transaction: 'Test Transaction',
          spans: expect.arrayContaining([
            expect.objectContaining({
              description: 'my-topic send',
              op: 'rpc',
              origin: 'auto.otel.aws',
              data: expect.objectContaining({
                'sentry.origin': 'auto.otel.aws',
                'rpc.system': 'aws-api',
                'rpc.method': 'Publish',
                'rpc.service': 'SNS',
                'messaging.system': 'aws.sns',
                'messaging.destination': 'my-topic',
                'messaging.destination.name': 'arn:aws:sns:us-east-1:123456789012:my-topic',
                'aws.sns.topic.arn': 'arn:aws:sns:us-east-1:123456789012:my-topic',
                'otel.kind': 'PRODUCER',
              }),
            }),
          ]),
        },
      })
      .start()
      .completed();
  });
});
