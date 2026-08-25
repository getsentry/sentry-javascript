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

  const navigationTransaction = await navigationTransactionPromise;
  expect(navigationTransaction).toBeDefined();

  const attributes = navigationTransaction.contexts?.trace?.data;
  expect(attributes).toMatchObject({
    'sentry.op': 'navigation',
    'sentry.origin': 'auto.navigation.nextjs.app_router_instrumentation',
    'sentry.segment.name.source': 'route',
    'url.full': expect.stringMatching(/^https?:\/\/localhost:\d+\/my-app\/navigation\/42\/router-push$/),
    'url.path': '/my-app/navigation/42/router-push',
    'url.template': '/my-app/navigation/:param/router-push',
  });
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
