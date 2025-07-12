import { afterAll, describe, expect } from 'vitest';
import { cleanupChildProcesses, createEsmAndCjsTests } from '../../../utils/runner';

describe('kafkajs', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  createEsmAndCjsTests(__dirname, 'scenario.mjs', 'instrument.mjs', (createRunner, test) => {
    test('traces producers and consumers', { timeout: 60_000 }, async () => {
      await createRunner()
        .withDockerCompose({
          workingDirectory: [__dirname],
          readyMatches: ['9092'],
        })
        .expect({
          transaction: {
            transaction: 'send test-topic',
            contexts: {
              trace: expect.objectContaining({
                op: 'message',
                status: 'ok',
                data: expect.objectContaining({
                  'messaging.system': 'kafka',
                  'messaging.destination.name': 'test-topic',
                  'otel.kind': 'PRODUCER',
                  'sentry.op': 'message',
                  'sentry.origin': 'auto.kafkajs.otel.producer',
                }),
              }),
            },
          },
        })
        .expect({
          transaction: {
            transaction: 'process test-topic',
            contexts: {
              trace: expect.objectContaining({
                op: 'message',
                status: 'ok',
                data: expect.objectContaining({
                  'messaging.system': 'kafka',
                  'messaging.destination.name': 'test-topic',
                  'otel.kind': 'CONSUMER',
                  'sentry.op': 'message',
                  'sentry.origin': 'auto.kafkajs.otel.consumer',
                }),
              }),
            },
          },
        })
        .start()
        .completed();
    });
  });
});
