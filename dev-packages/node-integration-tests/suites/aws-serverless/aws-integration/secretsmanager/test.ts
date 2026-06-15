import { afterAll, describe, expect, test } from 'vitest';
import { cleanupChildProcesses, createRunner } from '../../../../utils/runner';

describe('awsIntegration - SecretsManager', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  test('auto-instruments SecretsManager operations, setting the secret ARN', async () => {
    await createRunner(__dirname, 'scenario.js')
      .ignore('event')
      .expect({
        transaction: {
          transaction: 'Test Transaction',
          spans: expect.arrayContaining([
            expect.objectContaining({
              description: 'SecretsManager.GetSecretValue',
              op: 'rpc',
              origin: 'auto.otel.aws',
              data: expect.objectContaining({
                'sentry.origin': 'auto.otel.aws',
                'rpc.system': 'aws-api',
                'rpc.method': 'GetSecretValue',
                'rpc.service': 'SecretsManager',
                'aws.secretsmanager.secret.arn': 'arn:aws:secretsmanager:us-east-1:123456789012:secret:my-secret-abc',
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
