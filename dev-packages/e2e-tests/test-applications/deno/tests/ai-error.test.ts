import { expect, test } from '@playwright/test';
import { waitForError, waitForStreamedSpan } from '@sentry-internal/test-utils';

test('should link AI errors to the correct trace', async ({ baseURL }) => {
  const aiSpanPromise = waitForStreamedSpan('deno', span => span.name === 'ai-error-test');

  const errorEventPromise = waitForError('deno', event => {
    return event.exception?.values?.[0]?.value?.includes('Tool call failed') ?? false;
  });

  await fetch(`${baseURL}/test-ai-error`);

  const aiSpan = await aiSpanPromise;
  const errorEvent = await errorEventPromise;

  // The parent span wrapping the AI call should exist
  expect(aiSpan).toEqual(
    expect.objectContaining({
      name: 'ai-error-test',
      attributes: expect.objectContaining({
        'sentry.op': { type: 'string', value: 'function' },
      }),
    }),
  );

  expect(errorEvent).toBeDefined();

  // Verify error is linked to the same trace as the span
  expect(errorEvent?.contexts?.trace?.trace_id).toBe(aiSpan.trace_id);
});
