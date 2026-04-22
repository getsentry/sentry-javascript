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

            const producer = receivedTransactions.find(
              t => t.contexts?.trace?.data?.['sentry.origin'] === 'auto.kafkajs.otel.producer',
            );
            const consumer = receivedTransactions.find(
              t => t.contexts?.trace?.data?.['sentry.origin'] === 'auto.kafkajs.otel.consumer',
            );

            expect(producer).toBeDefined();
            expect(consumer).toBeDefined();

            for (const t of [producer, consumer]) {
              // just to assert on the basic shape (for more straight-forward tests, this is usually done by the runner)
              expect(t).toMatchObject({
                event_id: expect.any(String),
                timestamp: expect.anything(),
                start_timestamp: expect.anything(),
                spans: expect.any(Array),
                type: 'transaction',
              });
            }

            expect(producer!.transaction).toBe('send test-topic');
            expect(consumer!.transaction).toBe('process test-topic');

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
