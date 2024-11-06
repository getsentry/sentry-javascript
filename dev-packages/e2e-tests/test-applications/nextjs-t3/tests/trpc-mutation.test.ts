import { expect, test } from '@playwright/test';
import { waitForTransaction } from '@sentry-internal/test-utils';

test('should create transaction with trpc input for mutation', async ({ page }) => {
  const trpcTransactionPromise = waitForTransaction('nextjs-t3', async transactionEvent => {
    return transactionEvent?.transaction === 'POST /api/trpc/[trpc]';
  });

  await page.goto('/');
  await page.locator('#createInput').fill('I love dogs');
  await page.click('#createButton');

  const trpcTransaction = await trpcTransactionPromise;

  expect(trpcTransaction).toBeDefined();
  expect(trpcTransaction.contexts.trpc).toBeDefined();
  expect(trpcTransaction.contexts.trpc.procedure_type).toEqual('mutation');
  expect(trpcTransaction.contexts.trpc.input).toEqual({ name: 'I love dogs' });
});
