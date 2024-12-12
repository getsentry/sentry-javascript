import { expect, test } from '@playwright/test';
import { waitForError, waitForTransaction } from '@sentry-internal/test-utils';

const packageJson = require('../package.json');

test('Should record exceptions for faulty edge server components', async ({ page }) => {
  const errorEventPromise = waitForError('nextjs-app-dir', errorEvent => {
    return errorEvent?.exception?.values?.[0]?.value === 'Edge Server Component Error';
  });

  await page.goto('/edge-server-components/error');

  const errorEvent = await errorEventPromise;

  expect(errorEvent).toBeDefined();

  // Assert that isolation scope works properly
  expect(errorEvent.tags?.['my-isolated-tag']).toBe(true);
  expect(errorEvent.tags?.['my-global-scope-isolated-tag']).not.toBeDefined();

  expect(errorEvent.transaction).toBe(`Page Server Component (/edge-server-components/error)`);
});

test('Should record transaction for edge server components', async ({ page }) => {
  const nextjsVersion = packageJson.dependencies.next;
  const nextjsMajor = Number(nextjsVersion.split('.')[0]);

  const serverComponentTransactionPromise = waitForTransaction('nextjs-app-dir', async transactionEvent => {
    return (
      transactionEvent?.transaction === 'GET /edge-server-components' &&
      transactionEvent.contexts?.runtime?.name === 'vercel-edge'
    );
  });

  await page.goto('/edge-server-components');

  const serverComponentTransaction = await serverComponentTransactionPromise;

  expect(serverComponentTransaction).toBeDefined();
  expect(serverComponentTransaction.contexts?.trace?.op).toBe('http.server');

  // For some reason headers aren't picked up on Next.js 13 - also causing scope isolation to be broken
  if (nextjsMajor >= 14) {
    expect(serverComponentTransaction.request?.headers).toBeDefined();

    // Assert that isolation scope works properly
    expect(serverComponentTransaction.tags?.['my-isolated-tag']).toBe(true);
    expect(serverComponentTransaction.tags?.['my-global-scope-isolated-tag']).not.toBeDefined();
  }
});
