import { afterAll, describe, expect, test } from 'vitest';
import { cleanupChildProcesses, createRunner } from '../../../../utils/runner';

describe('awsIntegration - S3', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  test('auto-instruments S3 operations and captures errors', async () => {
    await createRunner(__dirname, 'scenario.js')
      .ignore('event')
      .expect({
        transaction: {
          transaction: 'Test Transaction',
          spans: expect.arrayContaining([
            // Successful PutObject
            expect.objectContaining({
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
            }),
            // Successful GetObject
            expect.objectContaining({
              description: 'S3.GetObject',
              op: 'rpc',
              origin: 'auto.otel.aws',
              status: 'ok',
              data: expect.objectContaining({
                'rpc.method': 'GetObject',
                'rpc.service': 'S3',
                'aws.s3.bucket': 'ot-demo-test',
              }),
            }),
            // Failing GetObject (missing key) - span is marked as errored
            expect.objectContaining({
              description: 'S3.GetObject',
              op: 'rpc',
              origin: 'auto.otel.aws',
              status: 'internal_error',
              data: expect.objectContaining({
                'rpc.method': 'GetObject',
                'rpc.service': 'S3',
                'aws.s3.bucket': 'ot-demo-test',
              }),
            }),
          ]),
        },
      })
      .start()
      .completed();
  });
});
