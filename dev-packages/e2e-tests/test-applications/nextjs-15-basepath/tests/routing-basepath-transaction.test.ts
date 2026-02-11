import { expect, test } from '@playwright/test';
import { waitForTransaction } from '@sentry-internal/test-utils';

test('Creates a pageload transaction for basePath root route with prefix', async ({ page }) => {
  const clientPageloadTransactionPromise = waitForTransaction('nextjs-15-basepath', transactionEvent => {
    return transactionEvent?.transaction === '/my-app' && transactionEvent.contexts?.trace?.op === 'pageload';
  });

  await page.goto('/my-app');

  expect(await clientPageloadTransactionPromise).toBeDefined();
});

test('Creates a dynamic pageload transaction for basePath dynamic route with prefix', async ({ page }) => {
  const randomRoute = String(Math.random());

  const clientPageloadTransactionPromise = waitForTransaction('nextjs-15-basepath', transactionEvent => {
    return (
      transactionEvent?.transaction === '/my-app/dynamic/:parameter' &&
      transactionEvent.contexts?.trace?.op === 'pageload'
    );
  });

  await page.goto(`/my-app/dynamic/${randomRoute}`);

  expect(await clientPageloadTransactionPromise).toBeDefined();
});

test('Creates a dynamic pageload transaction for basePath dynamic catch-all route with prefix', async ({ page }) => {
  const randomRoute = String(Math.random());

  const clientPageloadTransactionPromise = waitForTransaction('nextjs-15-basepath', transactionEvent => {
    return (
      transactionEvent?.transaction === '/my-app/dynamic/:parameters*' &&
      transactionEvent.contexts?.trace?.op === 'pageload'
    );
  });

  await page.goto(`/my-app/dynamic/${randomRoute}/foo/bar/baz`);

  expect(await clientPageloadTransactionPromise).toBeDefined();
});

test('Creates a navigation transaction for basePath router with prefix', async ({ page }) => {
  const navigationTransactionPromise = waitForTransaction('nextjs-15-basepath', transactionEvent => {
    return (
      transactionEvent?.transaction === '/my-app/navigation/:param/router-push' &&
      transactionEvent.contexts?.trace?.op === 'navigation' &&
      transactionEvent.contexts.trace.data?.['navigation.type'] === 'router.push'
    );
  });

  await page.goto('/my-app/navigation');
  await page.waitForTimeout(1000);
  await page.getByText('router.push()').click();

  expect(await navigationTransactionPromise).toBeDefined();
});

test('Creates a navigation transaction for basePath <Link> with prefix', async ({ page }) => {
  const navigationTransactionPromise = waitForTransaction('nextjs-15-basepath', transactionEvent => {
    return (
      transactionEvent?.transaction === '/my-app/navigation/:param/link' &&
      transactionEvent.contexts?.trace?.op === 'navigation' &&
      transactionEvent.contexts.trace.data?.['navigation.type'] === 'router.push'
    );
  });

  await page.goto('/my-app/navigation');
  await page.waitForTimeout(1000);
  await page.getByText('Normal Link').click();

  expect(await navigationTransactionPromise).toBeDefined();
});
