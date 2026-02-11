import { afterAll, describe, expect, test } from 'vitest';
import { cleanupChildProcesses, createRunner } from '../../../../utils/runner';

const EXPECTED_TRANSCATION = {
  transaction: 'Test Transaction',
  spans: expect.arrayContaining([
    expect.objectContaining({
      description: 'S3.PutObject',
      op: 'rpc',
      origin: 'auto.otel.aws',
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
  ]),
};

describe('awsIntegration', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  test('should auto-instrument aws-sdk v2 package.', async () => {
    await createRunner(__dirname, 'scenario.js')
      .ignore('event')
      .expect({ transaction: EXPECTED_TRANSCATION })
      .start()
      .completed();
  });
});
