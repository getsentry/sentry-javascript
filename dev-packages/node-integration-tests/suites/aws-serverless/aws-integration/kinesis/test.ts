import { afterAll, describe, expect, test } from 'vitest';
import { cleanupChildProcesses, createRunner } from '../../../../utils/runner';

describe('awsIntegration - Kinesis', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  test('auto-instruments Kinesis operations, setting the stream name', async () => {
    await createRunner(__dirname, 'scenario.js')
      .ignore('event')
      .expect({
        transaction: {
          transaction: 'Test Transaction',
          spans: expect.arrayContaining([
            expect.objectContaining({
              description: 'Kinesis.PutRecord',
              op: 'rpc',
              origin: 'auto.otel.aws',
              status: 'ok',
              data: expect.objectContaining({
                'sentry.origin': 'auto.otel.aws',
                'rpc.system': 'aws-api',
                'rpc.method': 'PutRecord',
                'rpc.service': 'Kinesis',
                'aws.kinesis.stream.name': 'my-stream',
                'otel.kind': 'CLIENT',
              }),
            }),
          ]),
        },
      })
      .start()
      .completed();
  });
});
