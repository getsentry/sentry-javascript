import { cleanupChildProcesses, createRunner } from '../../../../utils/runner';

const EXPECTED_TRANSCATION = {
  transaction: 'Test Transaction',
  spans: expect.arrayContaining([
    expect.objectContaining({
      description: 'S3.PutObject',
      op: 'rpc',
      origin: 'auto.otel.aws',
      data: {
        'sentry.origin': 'auto.otel.aws',
        'sentry.op': 'rpc',
        'rpc.system': 'aws-api',
        'rpc.method': 'PutObject',
        'rpc.service': 'S3',
        'aws.region': 'us-east-1',
        'otel.kind': 'CLIENT',
      },
    }),
  ]),
};

describe('awsIntegration', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  test('should auto-instrument aws-sdk v2 package.', done => {
    createRunner(__dirname, 'scenario.js').ignore('event').expect({ transaction: EXPECTED_TRANSCATION }).start(done);
  });
});
