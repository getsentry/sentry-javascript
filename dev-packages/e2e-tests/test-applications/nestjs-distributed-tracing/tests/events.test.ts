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

test('Event handler breadcrumbs do not leak into subsequent HTTP requests', async () => {
  // The app emits 'test-isolation.breadcrumb' every 2s via setInterval (outside HTTP context).
  // The handler adds a breadcrumb. Without isolation scope forking, this breadcrumb leaks
  // into the default isolation scope and gets cloned into subsequent HTTP requests.

  // Wait for at least one setInterval tick to fire and add the breadcrumb
  await new Promise(resolve => setTimeout(resolve, 3000));

  const transactionPromise = waitForTransaction('nestjs-distributed-tracing', transactionEvent => {
    return transactionEvent.transaction === 'GET /events/test-isolation';
  });

  await fetch('http://localhost:3050/events/test-isolation');

  const transaction = await transactionPromise;

  const leakedBreadcrumb = (transaction.breadcrumbs || []).find(
    (b: any) => b.message === 'leaked-breadcrumb-from-event-handler',
  );
  expect(leakedBreadcrumb).toBeUndefined();
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
  // With isolation scope forking, tags set in event handlers should NOT leak onto the root HTTP transaction
  expect(rootTx.tags?.['test-first']).toBeUndefined();
  expect(rootTx.tags?.['test-second']).toBeUndefined();
});
