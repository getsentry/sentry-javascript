import { expect, test } from '@playwright/test';
import { waitForError, waitForTransaction } from '@sentry-internal/test-utils';

test('captures an exception and puts it on the Sentry trace', async ({ baseURL }) => {
  const errorEventPromise = waitForError('node-otel-sdk-node', errorEvent => {
    return errorEvent.exception?.values?.[0]?.value === 'This is an exception with id 456';
  });

  const transactionEventPromise = waitForTransaction('node-otel-sdk-node', transactionEvent => {
    return transactionEvent.transaction === 'GET /test-exception/:id';
  });

  await fetch(`${baseURL}/test-exception/456`);

  const errorEvent = await errorEventPromise;
  const transactionEvent = await transactionEventPromise;

  expect(errorEvent.exception?.values).toHaveLength(1);
  expect(errorEvent.transaction).toBe('GET /test-exception/:id');
  expect(errorEvent.contexts?.trace?.trace_id).toBe(transactionEvent.contexts?.trace?.trace_id);
});
