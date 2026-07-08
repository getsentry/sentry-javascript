import type { TransactionEvent } from '@sentry/core';
import { afterAll, describe, expect } from 'vitest';
import { cleanupChildProcesses, createEsmAndCjsTests } from '../../../utils/runner';

// Each scenario uses its own queue name to keep them isolated on the shared broker, so the
// expected producer span is parameterized by the routing key (queue name) it publishes to.
const expectedProducerSpan = (routingKey: string) =>
  expect.objectContaining({
    op: 'message',
    data: expect.objectContaining({
      'messaging.system': 'rabbitmq',
      'messaging.rabbitmq.routing_key': routingKey,
      'otel.kind': 'PRODUCER',
      'sentry.op': 'message',
      'sentry.origin': 'auto.amqplib.otel.publisher',
    }),
    status: 'ok',
  });

const EXPECTED_MESSAGE_SPAN_CONSUMER = expect.objectContaining({
  op: 'message',
  data: expect.objectContaining({
    'messaging.system': 'rabbitmq',
    'messaging.rabbitmq.routing_key': 'queue1',
    'otel.kind': 'CONSUMER',
    'sentry.op': 'message',
    'sentry.origin': 'auto.amqplib.otel.consumer',
  }),
  status: 'ok',
});

describe('amqplib auto-instrumentation', () => {
  afterAll(async () => {
    cleanupChildProcesses();
  });

  describe.each([
    ['v1', { amqplib: '^1.0.0' }],
    ['v2', {}],
  ])('%s', (_version, additionalDependencies) => {
    createEsmAndCjsTests(
      __dirname,
      'scenario.mjs',
      'instrument.mjs',
      (createTestRunner, test) => {
        test('should be able to send and receive messages', { timeout: 60_000 }, async () => {
          // The producer ('root span') and consumer ('queue1 process') transactions can
          // arrive in any order, so we collect them and assert after both are received.
          const receivedTransactions: TransactionEvent[] = [];

          await createTestRunner()
            .withDockerCompose({
              workingDirectory: [__dirname],
            })
            .expect({
              transaction: (transaction: TransactionEvent) => {
                receivedTransactions.push(transaction);
              },
            })
            .expect({
              transaction: (transaction: TransactionEvent) => {
                receivedTransactions.push(transaction);

                // The producer span is a child of the manually-started 'root span' transaction, so we
                // identify it by its origin rather than by transaction name. The consumer span is its
                // own transaction, identified by the origin on its trace context.
                const producer = receivedTransactions.find(t =>
                  t.spans?.some(s => s.data?.['sentry.origin'] === 'auto.amqplib.otel.publisher'),
                );
                const consumer = receivedTransactions.find(
                  t => t.contexts?.trace?.data?.['sentry.origin'] === 'auto.amqplib.otel.consumer',
                );

                expect(producer).toBeDefined();
                expect(consumer).toBeDefined();

                expect(producer!.transaction).toBe('root span');
                expect(consumer!.transaction).toBe('queue1 process');

                const producerSpan = producer!.spans?.find(
                  s => s.data?.['sentry.origin'] === 'auto.amqplib.otel.publisher',
                );
                expect(producerSpan).toMatchObject(expectedProducerSpan('queue1'));

                expect(consumer!.contexts?.trace).toMatchObject(EXPECTED_MESSAGE_SPAN_CONSUMER);
              },
            })
            .start()
            .completed();
        });
      },
      { additionalDependencies },
    );

    createEsmAndCjsTests(
      __dirname,
      'scenario-error.mjs',
      'instrument.mjs',
      (createTestRunner, test) => {
        test('marks the consumer span as errored when the message is rejected', { timeout: 60_000 }, async () => {
          // The error scenario emits the producer ('root span') and the rejected consumer
          // ('queue1 process') transactions in any order, so we collect both and assert on the consumer.
          const receivedTransactions: TransactionEvent[] = [];

          await createTestRunner()
            .withDockerCompose({
              workingDirectory: [__dirname],
            })
            .expect({
              transaction: (transaction: TransactionEvent) => {
                receivedTransactions.push(transaction);
              },
            })
            .expect({
              transaction: (transaction: TransactionEvent) => {
                receivedTransactions.push(transaction);

                const consumer = receivedTransactions.find(
                  t => t.contexts?.trace?.data?.['sentry.origin'] === 'auto.amqplib.otel.consumer',
                );

                expect(consumer).toBeDefined();
                expect(consumer!.transaction).toBe('queue-error process');
                expect(consumer!.contexts?.trace).toMatchObject(
                  expect.objectContaining({
                    op: 'message',
                    status: 'internal_error',
                    data: expect.objectContaining({
                      'messaging.system': 'rabbitmq',
                      'otel.kind': 'CONSUMER',
                      'sentry.op': 'message',
                      'sentry.origin': 'auto.amqplib.otel.consumer',
                    }),
                  }),
                );
              },
            })
            .start()
            .completed();
        });
      },
      { additionalDependencies },
    );

    createEsmAndCjsTests(
      __dirname,
      'scenario-confirm.mjs',
      'instrument.mjs',
      (createTestRunner, test) => {
        test(
          'creates exactly one producer span when publishing on a confirm channel',
          { timeout: 60_000 },
          async () => {
            await createTestRunner()
              .withDockerCompose({
                workingDirectory: [__dirname],
              })
              .expect({
                transaction: (transaction: TransactionEvent) => {
                  expect(transaction.transaction).toBe('root span');

                  const producerSpans = transaction.spans?.filter(
                    s => s.data?.['sentry.origin'] === 'auto.amqplib.otel.publisher',
                  );

                  // The confirm channel internally calls the base publish; the instrumentation must not
                  // double-instrument, so we expect exactly one producer span.
                  expect(producerSpans?.length).toBe(1);
                  expect(producerSpans![0]).toMatchObject(expectedProducerSpan('queue-confirm'));
                },
              })
              .start()
              .completed();
          },
        );
      },
      { additionalDependencies },
    );
  });
});
