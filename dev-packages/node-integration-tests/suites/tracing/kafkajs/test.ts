import {
  ERROR_TYPE,
  MESSAGING_DESTINATION_NAME,
  MESSAGING_SYSTEM,
  SENTRY_KIND,
  SENTRY_OP,
  SENTRY_ORIGIN,
} from '@sentry/conventions/attributes';
import { QUEUE_PROCESS, QUEUE_PUBLISH } from '@sentry/conventions/op';
import { afterAll, expect } from 'vitest';
import { cleanupChildProcesses, createEsmAndCjsTests, describeWithDockerCompose } from '../../../utils/runner';

const producerOrigin = 'auto.kafkajs.producer';
const consumerOrigin = 'auto.kafkajs.consumer';

describeWithDockerCompose('kafkajs', { workingDirectory: [__dirname] }, () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  createEsmAndCjsTests(__dirname, 'scenario.mjs', 'instrument.mjs', (createRunner, test) => {
    test('traces producers and consumers', { timeout: 90_000 }, async () => {
      await createRunner()
        .expect({
          span: container => {
            const producer = container.items.find(t => t.attributes[SENTRY_ORIGIN]?.value === producerOrigin);
            const consumer = container.items.find(t => t.attributes[SENTRY_ORIGIN]?.value === consumerOrigin);

            expect(producer).toBeDefined();
            expect(consumer).toBeDefined();

            for (const t of [producer, consumer]) {
              // just to assert on the basic shape (for more straight-forward tests, this is usually done by the runner)
              expect(t).toMatchObject({
                span_id: expect.any(String),
                end_timestamp: expect.anything(),
                start_timestamp: expect.anything(),
                is_segment: true,
              });
            }

            expect(producer!.name).toBe('send test-topic');
            expect(consumer!.name).toBe('process test-topic');

            expect(producer!).toMatchObject(
              expect.objectContaining({
                status: 'ok',
                attributes: expect.objectContaining({
                  [MESSAGING_SYSTEM]: { type: 'string', value: 'kafka' },
                  [MESSAGING_DESTINATION_NAME]: { type: 'string', value: 'test-topic' },
                  [SENTRY_KIND]: { type: 'string', value: 'producer' },
                  [SENTRY_OP]: { type: 'string', value: QUEUE_PUBLISH },
                  [SENTRY_ORIGIN]: { type: 'string', value: producerOrigin },
                }),
              }),
            );

            expect(consumer!).toMatchObject(
              expect.objectContaining({
                status: 'ok',
                attributes: expect.objectContaining({
                  [MESSAGING_SYSTEM]: { type: 'string', value: 'kafka' },
                  [MESSAGING_DESTINATION_NAME]: { type: 'string', value: 'test-topic' },
                  [SENTRY_KIND]: { type: 'string', value: 'consumer' },
                  [SENTRY_OP]: { type: 'string', value: QUEUE_PROCESS },
                  [SENTRY_ORIGIN]: { type: 'string', value: consumerOrigin },
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
          span: container => {
            const segment = container.items.find(span => span.is_segment);
            expect(segment?.name).toBe('send invalid topic name');
            expect(segment).toMatchObject(
              expect.objectContaining({
                status: 'error',
                attributes: expect.objectContaining({
                  [MESSAGING_SYSTEM]: { type: 'string', value: 'kafka' },
                  [MESSAGING_DESTINATION_NAME]: { type: 'string', value: 'invalid topic name' },
                  [SENTRY_KIND]: { type: 'string', value: 'producer' },
                  [SENTRY_OP]: { type: 'string', value: QUEUE_PUBLISH },
                  [SENTRY_ORIGIN]: { type: 'string', value: producerOrigin },
                  [ERROR_TYPE]: { type: 'string', value: 'KafkaJSNonRetriableError' },
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
