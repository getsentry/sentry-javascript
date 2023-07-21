import { test } from '@playwright/test';
import { waitForTransaction } from '../event-proxy-server';

if (process.env.TEST_ENV === 'production') {
  // TODO: Fix that this is flakey on dev server - might be an SDK bug
  test('Sends connected traces for server components', async ({ page }, testInfo) => {
    await page.goto('/client-component');

    const clientTransactionName = `e2e-next-js-app-dir: ${testInfo.title}`;

    const serverComponentTransaction = waitForTransaction('nextjs-13-app-dir', async transactionEvent => {
      return (
        transactionEvent?.transaction === 'Page Server Component (/server-component)' &&
        (await clientTransactionPromise).contexts?.trace?.trace_id === transactionEvent.contexts?.trace?.trace_id
      );
    });

    const clientTransactionPromise = waitForTransaction('nextjs-13-app-dir', transactionEvent => {
      return transactionEvent?.transaction === clientTransactionName;
    });

    await page.getByPlaceholder('Transaction name').fill(clientTransactionName);
    await page.getByText('Start transaction').click();
    await page.getByRole('link', { name: /^\/server-component$/ }).click();
    await page.getByText('Page (/server-component)').isVisible();
    await page.getByText('Stop transaction').click();

    await serverComponentTransaction;
  });
}
