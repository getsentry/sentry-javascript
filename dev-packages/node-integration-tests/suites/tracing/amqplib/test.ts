import { SENTRY_OP } from '@sentry/conventions/attributes';
import type { TransactionEvent } from '@sentry/core';
import { afterAll, describe, expect } from 'vitest';
import { isOrchestrionEnabled } from '../../../utils';
import { cleanupChildProcesses, createEsmAndCjsTests, describeWithDockerCompose } from '../../../utils/runner';

// The span origin depends on which instrumentation is active. These blocks drive the SDK's default
// integrations, so when the generic orchestrion run is enabled (via INJECT_ORCHESTRION) the OTel
// `Amqplib` integration is swapped for the diagnostics-channel one, changing the origin.
const PUBLISHER_ORIGIN = isOrchestrionEnabled() ? 'auto.amqplib.orchestrion.publisher' : 'auto.amqplib.otel.publisher';
const CONSUMER_ORIGIN = isOrchestrionEnabled() ? 'auto.amqplib.orchestrion.consumer' : 'auto.amqplib.otel.consumer';

// Each scenario uses its own queue name to keep them isolated on the shared broker, so the
// expected producer span is parameterized by the routing key (queue name) it publishes to.
// The scenarios all publish via `sendToQueue`, which delegates to `publish('', queue, ...)` — i.e. the
// default (empty) exchange with the queue name as the routing key.
const expectedProducerSpan = (routingKey: string) =>
  expect.objectContaining({
    op: 'message',
    data: expect.objectContaining({
      'messaging.system': 'rabbitmq',
      // Legacy messaging attributes emitted by both the OTel and orchestrion integrations.
      'messaging.destination': '',
      'messaging.destination_kind': 'topic',
      'messaging.rabbitmq.routing_key': routingKey,
      'messaging.url': 'amqp://sentry:***@localhost:5672/',
      'messaging.protocol': 'AMQP',
      'messaging.protocol_version': '0.9.1',
      'net.peer.name': 'localhost',
      'net.peer.port': 5672,
      // Current `@sentry/conventions` attributes are only emitted by the orchestrion integration; the
      // vendored OTel instrumentation never set them.
      ...(isOrchestrionEnabled()
        ? {
            'messaging.operation.type': 'send',
            'messaging.destination.name': '',
            'messaging.rabbitmq.destination.routing_key': routingKey,
            'network.protocol.name': 'AMQP',
            'network.protocol.version': '0.9.1',
            'server.address': 'localhost',
            'server.port': 5672,
            'url.full': 'amqp://sentry:***@localhost:5672/',
          }
        : {}),
      'otel.kind': 'PRODUCER',
      [SENTRY_OP]: 'message',
      'sentry.origin': PUBLISHER_ORIGIN,
    }),
    status: 'ok',
  });

const EXPECTED_MESSAGE_SPAN_CONSUMER = expect.objectContaining({
  op: 'message',
  data: expect.objectContaining({
    'messaging.system': 'rabbitmq',
    // Legacy messaging attributes emitted by both the OTel and orchestrion integrations. The consumer
    // reads the default exchange ('') off the delivered message and the queue name as the routing key.
    'messaging.destination': '',
    'messaging.destination_kind': 'topic',
    'messaging.rabbitmq.routing_key': 'queue1',
    'messaging.operation': 'process',
    // Current `@sentry/conventions` attributes are only emitted by the orchestrion integration.
    ...(isOrchestrionEnabled()
      ? {
          'messaging.destination.name': '',
          'messaging.rabbitmq.destination.routing_key': 'queue1',
          'messaging.operation.type': 'process',
        }
      : {}),
    'otel.kind': 'CONSUMER',
    [SENTRY_OP]: 'message',
    'sentry.origin': CONSUMER_ORIGIN,
  }),
  status: 'ok',
});

describeWithDockerCompose('amqplib auto-instrumentation', { workingDirectory: [__dirname] }, () => {
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
                  t.spans?.some(s => s.data?.['sentry.origin'] === PUBLISHER_ORIGIN),
                );
                const consumer = receivedTransactions.find(
                  t => t.contexts?.trace?.data?.['sentry.origin'] === CONSUMER_ORIGIN,
                );

                expect(producer).toBeDefined();
                expect(consumer).toBeDefined();

                expect(producer!.transaction).toBe('root span');
                expect(consumer!.transaction).toBe('queue1 process');

                const producerSpan = producer!.spans?.find(s => s.data?.['sentry.origin'] === PUBLISHER_ORIGIN);
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
            .expect({
              transaction: (transaction: TransactionEvent) => {
                receivedTransactions.push(transaction);
              },
            })
            .expect({
              transaction: (transaction: TransactionEvent) => {
                receivedTransactions.push(transaction);

                const consumer = receivedTransactions.find(
                  t => t.contexts?.trace?.data?.['sentry.origin'] === CONSUMER_ORIGIN,
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
                      [SENTRY_OP]: 'message',
                      'sentry.origin': CONSUMER_ORIGIN,
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
              .expect({
                transaction: (transaction: TransactionEvent) => {
                  expect(transaction.transaction).toBe('root span');

                  const producerSpans = transaction.spans?.filter(s => s.data?.['sentry.origin'] === PUBLISHER_ORIGIN);

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
