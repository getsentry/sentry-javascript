import { afterAll, describe, expect, test } from 'vitest';
import { cleanupChildProcesses, createRunner } from '../../../utils/runner';

describe('kafkajs', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  test('traces producers and consumers', { timeout: 60_000 }, async () => {
    await createRunner(__dirname, 'scenario.js')
      .withDockerCompose({
        workingDirectory: [__dirname],
        readyMatches: ['9092'],
      })
      .expect({
        transaction: {
          transaction: 'test-topic',
          contexts: {
            trace: expect.objectContaining({
              op: 'message',
              status: 'ok',
              data: expect.objectContaining({
                'messaging.system': 'kafka',
                'messaging.destination': 'test-topic',
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
          transaction: 'test-topic',
          contexts: {
            trace: expect.objectContaining({
              op: 'message',
              status: 'ok',
              data: expect.objectContaining({
                'messaging.system': 'kafka',
                'messaging.destination': 'test-topic',
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
