import { expect, test } from '@playwright/test';
import { waitForError, waitForTransaction } from '@sentry-internal/test-utils';

test('should capture error with trpc context', async ({ page }) => {
  const errorEventPromise = waitForError('nextjs-t3', errorEvent => {
    return errorEvent?.exception?.values?.[0]?.value === 'Error thrown in trpc router';
  });

  await page.goto('/');
  await page.click('#error-button');

  const trpcError = await errorEventPromise;

  expect(trpcError).toBeDefined();
  expect(trpcError.contexts?.trpc).toBeDefined();
  expect(trpcError.contexts?.trpc?.procedure_type).toEqual('mutation');
  expect(trpcError.contexts?.trpc?.procedure_path).toBe('post.throwError');
  expect(trpcError.contexts?.trpc?.input).toEqual({ name: 'I love dogs' });
});

test('should create transaction with trpc input for error', async ({ page }) => {
  const trpcTransactionPromise = waitForTransaction('nextjs-t3', async transactionEvent => {
    return transactionEvent?.transaction === 'POST /api/trpc/[trpc]';
  });

  await page.goto('/');
  await page.click('#error-button');

  const trpcTransaction = await trpcTransactionPromise;
  expect(trpcTransaction).toBeDefined();
});
