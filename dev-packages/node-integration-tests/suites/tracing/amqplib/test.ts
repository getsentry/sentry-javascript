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

// The producer ("root span") and consumer ("queue1 process") transactions finish within a few
// milliseconds of each other, so they can be flushed in either order. Dispatch on the transaction
// name instead of relying on a fixed envelope order to avoid flakiness.
function expectAmqpTransaction(transaction: TransactionEvent): void {
  if (transaction.transaction === 'root span') {
    expect(transaction.spans?.length).toEqual(1);
    expect(transaction.spans![0]).toMatchObject(EXPECTED_MESSAGE_SPAN_PRODUCER);
  } else {
    expect(transaction.transaction).toEqual('queue1 process');
    expect(transaction.contexts?.trace).toMatchObject(EXPECTED_MESSAGE_SPAN_CONSUMER);
  }
}

describe('amqplib auto-instrumentation', () => {
  afterAll(async () => {
    cleanupChildProcesses();
  });

  createEsmAndCjsTests(__dirname, 'scenario.mjs', 'instrument.mjs', (createTestRunner, test) => {
    test('should be able to send and receive messages', { timeout: 60_000 }, async () => {
      await createTestRunner()
        .withDockerCompose({
          workingDirectory: [__dirname],
        })
        .expect({
          transaction: expectAmqpTransaction,
        })
        .expect({
          transaction: expectAmqpTransaction,
        })
        .start()
        .completed();
    });
  });
});
