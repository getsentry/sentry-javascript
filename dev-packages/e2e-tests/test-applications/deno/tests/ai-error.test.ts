import { expect, test } from '@playwright/test';
import { waitForTransaction, waitForError } from '@sentry-internal/test-utils';

test('should link AI errors to the correct trace', async ({ baseURL }) => {
  const aiTransactionPromise = waitForTransaction('deno', event => {
    return event?.spans?.some(span => span.description === 'ai-error-test') ?? false;
  });

  const errorEventPromise = waitForError('deno', event => {
    return event.exception?.values?.[0]?.value?.includes('Tool call failed') ?? false;
  });

  await fetch(`${baseURL}/test-ai-error`);

  const aiTransaction = await aiTransactionPromise;
  const errorEvent = await errorEventPromise;

  expect(aiTransaction).toBeDefined();

  const spans = aiTransaction.spans || [];

  // The parent span wrapping the AI call should exist
  expect(spans).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        description: 'ai-error-test',
        op: 'function',
      }),
    ]),
  );

  expect(errorEvent).toBeDefined();

  // Verify error is linked to the same trace as the transaction
  expect(errorEvent?.contexts?.trace?.trace_id).toBe(aiTransaction.contexts?.trace?.trace_id);
});
