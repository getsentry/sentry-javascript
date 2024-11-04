import type { TransactionEvent } from '@sentry/types';
import { cleanupChildProcesses, createRunner } from '../../../utils/runner';

// When running docker compose, we need a larger timeout, as this takes some time.
jest.setTimeout(90_000);

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

  test('should be able to send and receive messages', done => {
    createRunner(__dirname, 'scenario-message.ts')
      .withDockerCompose({
        workingDirectory: [__dirname],
        readyMatches: ['Time to start RabbitMQ'],
      })
      .expect({
        transaction: (transaction: TransactionEvent) => {
          expect(transaction.transaction).toEqual('root span');
          expect(transaction.spans?.length).toEqual(1);
          expect(transaction.spans![0]).toMatchObject(EXPECTED_MESSAGE_SPAN_PRODUCER);
        },
      })
      .expect({
        transaction: (transaction: TransactionEvent) => {
          expect(transaction.transaction).toEqual('queue1 process');
          expect(transaction.contexts?.trace).toMatchObject(EXPECTED_MESSAGE_SPAN_CONSUMER);
        },
      })
      .start(done);
  });
});
