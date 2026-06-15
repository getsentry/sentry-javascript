import { afterAll, describe, expect, test } from 'vitest';
import { cleanupChildProcesses, createRunner } from '../../../../utils/runner';

describe('awsIntegration - Lambda', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  test('auto-instruments Lambda invoke, setting faas attributes', async () => {
    await createRunner(__dirname, 'scenario.js')
      .ignore('event')
      .expect({
        transaction: {
          transaction: 'Test Transaction',
          spans: expect.arrayContaining([
            expect.objectContaining({
              description: 'my-function Invoke',
              op: 'rpc',
              origin: 'auto.otel.aws',
              data: expect.objectContaining({
                'sentry.origin': 'auto.otel.aws',
                'rpc.system': 'aws-api',
                'rpc.method': 'Invoke',
                'rpc.service': 'Lambda',
                'faas.invoked_name': 'my-function',
                'faas.invoked_provider': 'aws',
                'faas.execution': 'request-id-1',
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
