import { afterAll, describe, expect, test } from 'vitest';
import { cleanupChildProcesses, createRunner } from '../../../../utils/runner';

describe('awsIntegration - StepFunctions', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  test('auto-instruments StepFunctions operations, setting the state machine ARN', async () => {
    await createRunner(__dirname, 'scenario.js')
      .ignore('event')
      .expect({
        transaction: {
          transaction: 'Test Transaction',
          spans: expect.arrayContaining([
            expect.objectContaining({
              description: 'SFN.StartExecution',
              op: 'rpc',
              origin: 'auto.otel.aws',
              data: expect.objectContaining({
                'sentry.origin': 'auto.otel.aws',
                'rpc.system': 'aws-api',
                'rpc.method': 'StartExecution',
                'rpc.service': 'SFN',
                'aws.step_functions.state_machine.arn':
                  'arn:aws:states:us-east-1:123456789012:stateMachine:my-state-machine',
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
