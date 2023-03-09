import { test } from '@playwright/test';
import { waitForTransaction } from '../../../test-utils/event-proxy-server';

if (process.env.TEST_ENV === 'production') {
  // TODO: Fix that this is flakey on dev server - might be an SDK bug
  test('Sends connected traces for server components', async ({ page }, testInfo) => {
    await page.goto('/');

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

test('Sends connected traces for route handlers', async ({ page }, testInfo) => {
  await page.goto('/');

  const clientTransactionName = `e2e-next-js-app-dir: ${testInfo.title}`;

  const getRequestTransaction = waitForTransaction('nextjs-13-app-dir', async transactionEvent => {
    return (
      transactionEvent?.transaction === 'GET /dynamic-route/[parameter]' &&
      (await clientTransactionPromise).contexts?.trace?.trace_id === transactionEvent.contexts?.trace?.trace_id
    );
  });

  const postRequestTransaction = waitForTransaction('nextjs-13-app-dir', async transactionEvent => {
    return (
      transactionEvent?.transaction === 'POST /dynamic-route/[...parameters]' &&
      (await clientTransactionPromise).contexts?.trace?.trace_id === transactionEvent.contexts?.trace?.trace_id
    );
  });

  const clientTransactionPromise = waitForTransaction('nextjs-13-app-dir', transactionEvent => {
    return transactionEvent?.transaction === clientTransactionName;
  });

  await page.getByPlaceholder('Transaction name').fill(clientTransactionName);
  await page.getByText('Start transaction').click();

  await page.getByPlaceholder('GET request target').fill('/dynamic-route/42');
  await page.getByText('Send GET request').click();

  await page.getByPlaceholder('POST request target').fill('/dynamic-route/42/1337');
  await page.getByText('Send POST request').click();

  await page.getByText('Stop transaction').click();

  await getRequestTransaction;
  await postRequestTransaction;
});
