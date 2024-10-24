import { expect, test } from '@playwright/test';
import { waitForError, waitForTransaction } from '@sentry-internal/test-utils';

test('Will capture error for SSR rendering error with a connected trace (Class Component)', async ({ page }) => {
  const errorEventPromise = waitForError('nextjs-app-dir', errorEvent => {
    return errorEvent?.exception?.values?.[0]?.value === 'Pages SSR Error Class';
  });

  const serverComponentTransaction = waitForTransaction('nextjs-app-dir', async transactionEvent => {
    return (
      transactionEvent?.transaction === 'GET /pages-router/ssr-error-class' &&
      (await errorEventPromise).contexts?.trace?.trace_id === transactionEvent.contexts?.trace?.trace_id
    );
  });

  await page.goto('/pages-router/ssr-error-class');

  expect(await errorEventPromise).toBeDefined();
  expect(await serverComponentTransaction).toBeDefined();
});

test('Will capture error for SSR rendering error with a connected trace (Functional Component)', async ({ page }) => {
  const errorEventPromise = waitForError('nextjs-app-dir', errorEvent => {
    return errorEvent?.exception?.values?.[0]?.value === 'Pages SSR Error FC';
  });

  const ssrTransactionPromise = waitForTransaction('nextjs-app-dir', async transactionEvent => {
    return (
      transactionEvent?.transaction === 'GET /pages-router/ssr-error-fc' &&
      (await errorEventPromise).contexts?.trace?.trace_id === transactionEvent.contexts?.trace?.trace_id
    );
  });

  await page.goto('/pages-router/ssr-error-fc');

  const errorEvent = await errorEventPromise;
  const ssrTransaction = await ssrTransactionPromise;

  // Assert that isolation scope works properly
  expect(errorEvent.tags?.['my-isolated-tag']).toBe(true);
  expect(errorEvent.tags?.['my-global-scope-isolated-tag']).not.toBeDefined();

  // TODO(lforst): Reuse SSR request span isolation scope to fix the following two assertions
  // expect(ssrTransaction.tags?.['my-isolated-tag']).toBe(true);
  // expect(ssrTransaction.tags?.['my-global-scope-isolated-tag']).not.toBeDefined();
});
