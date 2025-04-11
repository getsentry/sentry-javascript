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
        mechanism: expect.any(Object),
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
