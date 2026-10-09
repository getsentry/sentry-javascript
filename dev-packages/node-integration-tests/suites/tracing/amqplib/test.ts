import {
  MESSAGING_DESTINATION_NAME,
  MESSAGING_OPERATION_NAME,
  MESSAGING_OPERATION_TYPE,
  MESSAGING_RABBITMQ_DESTINATION_ROUTING_KEY,
  MESSAGING_SYSTEM,
  NETWORK_PROTOCOL_NAME,
  NETWORK_PROTOCOL_VERSION,
  SENTRY_KIND,
  SENTRY_OP,
  SENTRY_ORIGIN,
  SERVER_ADDRESS,
  SERVER_PORT,
  URL_FULL,
} from '@sentry/conventions/attributes';
import { QUEUE_PROCESS, QUEUE_PUBLISH } from '@sentry/conventions/op';
import { afterAll, describe, expect } from 'vitest';
import { cleanupChildProcesses, createEsmAndCjsTests, describeWithDockerCompose } from '../../../utils/runner';

// Each scenario uses its own queue name to keep them isolated on the shared broker, so the
// expected producer span is parameterized by the routing key (queue name) it publishes to.
// The scenarios all publish via `sendToQueue`, which delegates to `publish('', queue, ...)` — i.e. the
// default (empty) exchange with the queue name as the routing key.
const expectedProducerSpan = (routingKey: string) =>
  expect.objectContaining({
    attributes: expect.objectContaining({
      [MESSAGING_SYSTEM]: { type: 'string', value: 'rabbitmq' },
      [MESSAGING_OPERATION_NAME]: { type: 'string', value: 'send' },
      [MESSAGING_OPERATION_TYPE]: { type: 'string', value: 'send' },
      [MESSAGING_DESTINATION_NAME]: { type: 'string', value: routingKey },
      [MESSAGING_RABBITMQ_DESTINATION_ROUTING_KEY]: { type: 'string', value: routingKey },
      [NETWORK_PROTOCOL_NAME]: { type: 'string', value: 'AMQP' },
      [NETWORK_PROTOCOL_VERSION]: { type: 'string', value: '0.9.1' },
      [SERVER_ADDRESS]: { type: 'string', value: 'localhost' },
      [SERVER_PORT]: { type: 'integer', value: 5672 },
      [URL_FULL]: { type: 'string', value: 'amqp://sentry:***@localhost:5672/' },
      [SENTRY_KIND]: { type: 'string', value: 'producer' },
      [SENTRY_OP]: { type: 'string', value: QUEUE_PUBLISH },
      [SENTRY_ORIGIN]: { type: 'string', value: 'auto.amqplib.publisher' },
    }),
    status: 'ok',
  });

const EXPECTED_MESSAGE_SPAN_CONSUMER = expect.objectContaining({
  attributes: expect.objectContaining({
    [MESSAGING_SYSTEM]: { type: 'string', value: 'rabbitmq' },
    // The delivery carries the default exchange (''), so the routing key is the destination.
    [MESSAGING_DESTINATION_NAME]: { type: 'string', value: 'queue1' },
    [MESSAGING_RABBITMQ_DESTINATION_ROUTING_KEY]: { type: 'string', value: 'queue1' },
    [MESSAGING_OPERATION_NAME]: { type: 'string', value: 'process' },
    [MESSAGING_OPERATION_TYPE]: { type: 'string', value: 'process' },
    [SENTRY_KIND]: { type: 'string', value: 'consumer' },
    [SENTRY_OP]: { type: 'string', value: QUEUE_PROCESS },
    [SENTRY_ORIGIN]: { type: 'string', value: 'auto.amqplib.consumer' },
  }),
  status: 'ok',
});

describeWithDockerCompose('amqplib auto-instrumentation', { workingDirectory: [__dirname] }, () => {
  afterAll(async () => {
    cleanupChildProcesses();
  });

  describe.each([
    ['v0', {}],
    ['v1', { amqplib: '^1.0.0' }],
    ['v2', { amqplib: '^2.0.0' }],
  ])('%s', (_version, additionalDependencies) => {
    createEsmAndCjsTests(
      __dirname,
      'scenario.mjs',
      'instrument.mjs',
      (createTestRunner, test) => {
        test('should be able to send and receive messages', { timeout: 60_000 }, async () => {
          await createTestRunner()
            .expect({
              span: container => {
                const producer = container.items.find(span => span.is_segment && span.name === 'root span');
                const consumer = container.items.find(
                  t => t.attributes[SENTRY_ORIGIN]?.value === 'auto.amqplib.consumer',
                );

                expect(producer).toBeDefined();
                expect(consumer).toBeDefined();

                expect(producer!.name).toBe('root span');
                expect(consumer!.name).toBe('process queue1');

                const producerSpan = container.items.find(
                  s => s.attributes[SENTRY_ORIGIN]?.value === 'auto.amqplib.publisher',
                );
                expect(producerSpan?.name).toBe('send queue1');
                expect(producerSpan).toMatchObject(expectedProducerSpan('queue1'));

                expect(consumer!).toMatchObject(EXPECTED_MESSAGE_SPAN_CONSUMER);
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
          await createTestRunner()
            .expect({
              span: container => {
                const consumer = container.items.find(
                  t => t.attributes[SENTRY_ORIGIN]?.value === 'auto.amqplib.consumer',
                );

                expect(consumer).toBeDefined();
                expect(consumer!.name).toBe('process queue-error');
                expect(consumer!).toMatchObject(
                  expect.objectContaining({
                    status: 'error',
                    attributes: expect.objectContaining({
                      [MESSAGING_SYSTEM]: { type: 'string', value: 'rabbitmq' },
                      [SENTRY_KIND]: { type: 'string', value: 'consumer' },
                      [SENTRY_OP]: { type: 'string', value: QUEUE_PROCESS },
                      [SENTRY_ORIGIN]: { type: 'string', value: 'auto.amqplib.consumer' },
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
                span: container => {
                  expect(container.items.find(span => span.is_segment)?.name).toBe('root span');

                  const producerSpans = container.items.filter(
                    s => s.attributes[SENTRY_ORIGIN]?.value === 'auto.amqplib.publisher',
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

    createEsmAndCjsTests(
      __dirname,
      'scenario-topic-noack.mjs',
      'instrument.mjs',
      (createTestRunner, test) => {
        test('names a noAck consumer span after its queue and ends it as ok', { timeout: 60_000 }, async () => {
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
                  t => t.contexts?.trace?.data?.['sentry.origin'] === 'auto.amqplib.consumer',
                );

                expect(consumer).toBeDefined();
                expect(consumer!.transaction).toBe('orders-worker process');
                expect(consumer!.contexts?.trace?.status).toBe('ok');
                expect(consumer!.contexts?.trace?.data?.['messaging.destination.name']).toBe('orders');
                expect(consumer!.contexts?.trace?.data?.['messaging.rabbitmq.destination.routing_key']).toBe(
                  'order.created.12345',
                );
              },
            })
            .start()
            .completed();
        });
      },
      { additionalDependencies },
    );
  });

  createEsmAndCjsTests(
    __dirname,
    'scenario-topic-noack.mjs',
    'instrument-span-streaming.mjs',
    (createTestRunner, test) => {
      test('ends a streamed noAck consumer span as ok', { timeout: 60_000 }, async () => {
        await createTestRunner()
          .ignore('event')
          .expect({
            span: container => {
              const consumerSpan = container.items.find(
                span => span.attributes['sentry.origin']?.value === 'auto.amqplib.consumer',
              );
              expect(consumerSpan).toBeDefined();
              expect(consumerSpan!.status).toBe('ok');
              expect(consumerSpan!.name).toBe('process orders');
              expect(consumerSpan!.attributes['messaging.destination.name']?.value).toBe('orders');
            },
          })
          .start()
          .completed();
      });
    },
  );

  createEsmAndCjsTests(__dirname, 'scenario.mjs', 'instrument-span-streaming.mjs', (createTestRunner, test) => {
    test('names streamed spans after the messaging conventions', { timeout: 60_000 }, async () => {
      await createTestRunner()
        .ignore('event')
        .expect({
          span: container => {
            // `sendToQueue` publishes to the default exchange, which has no name. Its routing key is the
            // queue name, so it is the destination rather than per-message data.
            for (const origin of ['auto.amqplib.publisher', 'auto.amqplib.consumer']) {
              const span = container.items.find(item => item.attributes['sentry.origin']?.value === origin);
              expect(span).toBeDefined();
              expect(span!.attributes['messaging.destination.name']?.value).toBe('queue1');
              expect(span!.attributes['messaging.rabbitmq.destination.routing_key']?.value).toBe('queue1');
            }

            const producerSpan = container.items.find(
              span => span.attributes['sentry.origin']?.value === 'auto.amqplib.publisher',
            );
            expect(producerSpan!.name).toBe('send queue1');

            const consumerSpan = container.items.find(
              span => span.attributes['sentry.origin']?.value === 'auto.amqplib.consumer',
            );
            expect(consumerSpan!.name).toBe('process queue1');
          },
        })
        .start()
        .completed();
    });
  });

  createEsmAndCjsTests(
    __dirname,
    'scenario-callback-api.mjs',
    'instrument-span-streaming.mjs',
    (createTestRunner, test) => {
      test('instruments publish and noAck consume on the callback API', { timeout: 60_000 }, async () => {
        await createTestRunner()
          .ignore('event')
          .expect({
            span: container => {
              const producerSpan = container.items.find(
                span => span.attributes['sentry.origin']?.value === 'auto.amqplib.publisher',
              );
              expect(producerSpan?.name).toBe('send callback-queue');

              const consumerSpan = container.items.find(
                span => span.attributes['sentry.origin']?.value === 'auto.amqplib.consumer',
              );
              expect(consumerSpan?.name).toBe('process callback-queue');
              expect(consumerSpan?.status).toBe('ok');
            },
          })
          .start()
          .completed();
      });
    },
  );
});
