import { SENTRY_OP } from '@sentry/conventions/attributes';
import type { TransactionEvent } from '@sentry/core';
import { afterAll, expect } from 'vitest';
import { isOrchestrionEnabled } from '../../../utils';
import { cleanupChildProcesses, createEsmAndCjsTests, describeWithDockerCompose } from '../../../utils/runner';

const producerOrigin = isOrchestrionEnabled() ? 'auto.kafkajs.orchestrion.producer' : 'auto.kafkajs.otel.producer';
const consumerOrigin = isOrchestrionEnabled() ? 'auto.kafkajs.orchestrion.consumer' : 'auto.kafkajs.otel.consumer';

describeWithDockerCompose('kafkajs', { workingDirectory: [__dirname] }, () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  createEsmAndCjsTests(__dirname, 'scenario.mjs', 'instrument.mjs', (createRunner, test) => {
    test('traces producers and consumers', { timeout: 90_000 }, async () => {
      // The producer and consumer transactions can arrive in any order,
      // so we collect them and assert after both have been received.
      const receivedTransactions: TransactionEvent[] = [];

      await createRunner()
        .expect({
          transaction: (transaction: TransactionEvent) => {
            receivedTransactions.push(transaction);
          },
        })
        .expect({
          transaction: (transaction: TransactionEvent) => {
            receivedTransactions.push(transaction);

            const producer = receivedTransactions.find(
              t => t.contexts?.trace?.data?.['sentry.origin'] === producerOrigin,
            );
            const consumer = receivedTransactions.find(
              t => t.contexts?.trace?.data?.['sentry.origin'] === consumerOrigin,
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
                  [SENTRY_OP]: 'message',
                  'sentry.origin': producerOrigin,
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
                  [SENTRY_OP]: 'message',
                  'sentry.origin': consumerOrigin,
                }),
              }),
            );
          },
        })
        .start()
        .completed();
    });
  });

  createEsmAndCjsTests(__dirname, 'scenario-error.mjs', 'instrument.mjs', (createRunner, test) => {
    test('marks the producer span as errored when a send fails', { timeout: 90_000 }, async () => {
      await createRunner()
        .expect({
          transaction: (transaction: TransactionEvent) => {
            expect(transaction.transaction).toBe('send invalid topic name');
            expect(transaction.contexts?.trace).toMatchObject(
              expect.objectContaining({
                op: 'message',
                status: 'internal_error',
                data: expect.objectContaining({
                  'messaging.system': 'kafka',
                  'messaging.destination.name': 'invalid topic name',
                  'otel.kind': 'PRODUCER',
                  [SENTRY_OP]: 'message',
                  'sentry.origin': producerOrigin,
                  'error.type': 'KafkaJSNonRetriableError',
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
