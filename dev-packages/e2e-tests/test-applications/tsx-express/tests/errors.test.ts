import { expect, test } from '@playwright/test';
import { waitForError, waitForTransaction } from '@sentry-internal/test-utils';

test('Sends correct error event', async ({ baseURL }) => {
  const errorEventPromise = waitForError('tsx-express', event => {
    return !event.type && event.exception?.values?.[0]?.value === 'This is an exception with id 123';
  });

  const transactionEventPromise = waitForTransaction('tsx-express', event => {
    return event.transaction === 'GET /test-exception/:id';
  });

  await fetch(`${baseURL}/test-exception/123`);

  const errorEvent = await errorEventPromise;
  const transactionEvent = await transactionEventPromise;

  expect(errorEvent.exception?.values).toHaveLength(1);
  expect(errorEvent.exception?.values?.[0]?.value).toBe('This is an exception with id 123');

  expect(errorEvent.request).toEqual({
    method: 'GET',
    cookies: {},
    headers: expect.any(Object),
    url: 'http://localhost:3030/test-exception/123',
  });

  expect(errorEvent.transaction).toEqual('GET /test-exception/:id');

  expect(errorEvent.contexts?.trace).toEqual({
    trace_id: expect.stringMatching(/[a-f0-9]{32}/),
    span_id: expect.stringMatching(/[a-f0-9]{16}/),
  });

  // The error is attached to the same trace as the request transaction, and to a
  // span that belongs to that transaction (its root span or one of its children).
  const transactionTrace = transactionEvent.contexts?.trace;
  expect(errorEvent.contexts?.trace?.trace_id).toBe(transactionTrace?.trace_id);

  const transactionSpanIds = [transactionTrace?.span_id, ...(transactionEvent.spans ?? []).map(span => span.span_id)];
  expect(transactionSpanIds).toContain(errorEvent.contexts?.trace?.span_id);
});
