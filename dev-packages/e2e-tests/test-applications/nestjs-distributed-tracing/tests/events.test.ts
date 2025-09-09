import { expect, test } from '@playwright/test';
import { waitForError, waitForTransaction } from '@sentry-internal/test-utils';

test('Event emitter', async () => {
  const eventErrorPromise = waitForError('nestjs-distributed-tracing', errorEvent => {
    return errorEvent.exception.values[0].value === 'Test error from event handler';
  });
  const successEventTransactionPromise = waitForTransaction('nestjs-distributed-tracing', transactionEvent => {
    return transactionEvent.transaction === 'event myEvent.pass';
  });

  const eventsUrl = `http://localhost:3050/events/emit`;
  await fetch(eventsUrl);

  const eventError = await eventErrorPromise;
  const successEventTransaction = await successEventTransactionPromise;

  expect(eventError.exception).toEqual({
    values: [
      {
        type: 'Error',
        value: 'Test error from event handler',
        stacktrace: expect.any(Object),
        mechanism: {
          handled: false,
          type: 'auto.event.nestjs',
        },
      },
    ],
  });

  expect(successEventTransaction.contexts.trace).toEqual({
    parent_span_id: expect.stringMatching(/[a-f0-9]{16}/),
    span_id: expect.stringMatching(/[a-f0-9]{16}/),
    trace_id: expect.stringMatching(/[a-f0-9]{32}/),
    data: {
      'sentry.source': 'custom',
      'sentry.op': 'event.nestjs',
      'sentry.origin': 'auto.event.nestjs',
    },
    origin: 'auto.event.nestjs',
    op: 'event.nestjs',
    status: 'ok',
  });
});

test('Multiple OnEvent decorators', async () => {
  const firstTxPromise = waitForTransaction('nestjs-distributed-tracing', transactionEvent => {
    return transactionEvent.transaction === 'event multiple.first|multiple.second';
  });
  const secondTxPromise = waitForTransaction('nestjs-distributed-tracing', transactionEvent => {
    return transactionEvent.transaction === 'event multiple.first|multiple.second';
  });
  const rootPromise = waitForTransaction('nestjs-distributed-tracing', transactionEvent => {
    return transactionEvent.transaction === 'GET /events/emit-multiple';
  });

  const eventsUrl = `http://localhost:3050/events/emit-multiple`;
  await fetch(eventsUrl);

  const firstTx = await firstTxPromise;
  const secondTx = await secondTxPromise;
  const rootTx = await rootPromise;

  expect(firstTx).toBeDefined();
  expect(secondTx).toBeDefined();
  // assert that the correct payloads were added
  expect(rootTx.tags).toMatchObject({ 'test-first': true, 'test-second': true });
});
