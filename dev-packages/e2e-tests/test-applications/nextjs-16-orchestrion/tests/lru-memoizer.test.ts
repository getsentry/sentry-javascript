import { expect, test } from '@playwright/test';
import { waitForTransaction } from '@sentry-internal/test-utils';

// lru-memoizer's channel integration creates no spans — its only job is to restore the caller's async
// context onto the memoized callback. The route wraps the check in a `lru-memoizer-check` span and
// records whether the callback ran in that span's context, so we assert the attribute on that span.
test('Preserves async context through lru-memoizer via orchestrion', async ({ baseURL }) => {
  const transactionEventPromise = waitForTransaction('nextjs-16-orchestrion', transactionEvent => {
    return (
      transactionEvent.contexts?.trace?.op === 'http.server' && transactionEvent.transaction === 'GET /api/lru-memoizer'
    );
  });

  await fetch(`${baseURL}/api/lru-memoizer`);

  const transactionEvent = await transactionEventPromise;

  const spans = transactionEvent.spans || [];

  expect(spans).toContainEqual(
    expect.objectContaining({
      description: 'lru-memoizer-check',
      data: expect.objectContaining({
        'memoized.context_preserved': true,
      }),
    }),
  );
});
