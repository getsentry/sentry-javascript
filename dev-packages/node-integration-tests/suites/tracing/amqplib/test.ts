import type { TransactionEvent } from '@sentry/core';
import { afterAll, describe, expect } from 'vitest';
import { cleanupChildProcesses, createEsmAndCjsTests } from '../../../utils/runner';

const EXPECTED_MESSAGE_SPAN_PRODUCER = expect.objectContaining({
  op: 'message',
  data: expect.objectContaining({
    'messaging.system': 'rabbitmq',
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

  createEsmAndCjsTests(__dirname, 'scenario.mjs', 'instrument.mjs', (createTestRunner, test) => {
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

            const producer = receivedTransactions.find(t => t.transaction === 'root span');
            const consumer = receivedTransactions.find(t => t.transaction === 'queue1 process');

            expect(producer).toBeDefined();
            expect(consumer).toBeDefined();

            expect(producer!.spans?.length).toEqual(1);
            expect(producer!.spans![0]).toMatchObject(EXPECTED_MESSAGE_SPAN_PRODUCER);

            expect(consumer!.contexts?.trace).toMatchObject(EXPECTED_MESSAGE_SPAN_CONSUMER);
          },
        })
        .start()
        .completed();
    });
  });
});
