import { expect, test } from '@playwright/test';
import { waitForError, waitForTransaction } from '../event-proxy-server';

test('Should record exceptions for faulty edge server components', async ({ page }) => {
  const errorEventPromise = waitForError('nextjs-13-app-dir', errorEvent => {
    return errorEvent?.exception?.values?.[0]?.value === 'Edge Server Component Error';
  });

  await page.goto('/edge-server-components/error');

  expect(await errorEventPromise).toBeDefined();
});

test('Should record transaction for edge server components', async ({ page }) => {
  const serverComponentTransactionPromise = waitForTransaction('nextjs-13-app-dir', async transactionEvent => {
    return transactionEvent?.transaction === 'Page Server Component (/edge-server-components)';
  });

  await page.goto('/edge-server-components');

  const serverComponentTransaction = await serverComponentTransactionPromise;

  expect(serverComponentTransaction).toBeDefined();
  expect(serverComponentTransaction.request?.headers).toBeDefined();
});
