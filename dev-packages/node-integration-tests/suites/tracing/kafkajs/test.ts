import type { TransactionEvent } from '@sentry/core';
import { afterAll, describe, expect } from 'vitest';
import { cleanupChildProcesses, createEsmAndCjsTests } from '../../../utils/runner';

describe('kafkajs', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  createEsmAndCjsTests(__dirname, 'scenario.mjs', 'instrument.mjs', (createRunner, test) => {
    test('traces producers and consumers', { timeout: 60_000 }, async () => {
      // The producer and consumer transactions can arrive in any order,
      // so we collect them and assert after both have been received.
      const receivedTransactions: TransactionEvent[] = [];

      await createRunner()
        .withDockerCompose({
          workingDirectory: [__dirname],
          readyMatches: ['9092'],
        })
        .expect({
          transaction: (transaction: TransactionEvent) => {
            receivedTransactions.push(transaction);
          },
        })
        .expect({
          transaction: (transaction: TransactionEvent) => {
            receivedTransactions.push(transaction);

            const producer = receivedTransactions.find(t => t.transaction === 'send test-topic');
            const consumer = receivedTransactions.find(t => t.transaction === 'process test-topic');

            expect(producer).toBeDefined();
            expect(consumer).toBeDefined();

            expect(producer!.contexts?.trace).toMatchObject(
              expect.objectContaining({
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
            );

            expect(consumer!.contexts?.trace).toMatchObject(
              expect.objectContaining({
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
            );
          },
        })
        .start()
        .completed();
    });
  });
});
