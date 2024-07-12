import { expect, test } from '@playwright/test';
import { waitForTransaction } from '@sentry-internal/test-utils';

test('Creates a pageload transaction for app router routes', async ({ page }) => {
  const randomRoute = String(Math.random());

  const clientPageloadTransactionPromise = waitForTransaction('nextjs-app-dir', transactionEvent => {
    return (
      transactionEvent?.transaction === `/server-component/parameter/${randomRoute}` &&
      transactionEvent.contexts?.trace?.op === 'pageload'
    );
  });

  await page.goto(`/server-component/parameter/${randomRoute}`);

  expect(await clientPageloadTransactionPromise).toBeDefined();
});

test('Creates a navigation transaction for app router routes', async ({ page }) => {
  const randomRoute = String(Math.random());

  const clientPageloadTransactionPromise = waitForTransaction('nextjs-app-dir', transactionEvent => {
    return (
      transactionEvent?.transaction === `/server-component/parameter/${randomRoute}` &&
      transactionEvent.contexts?.trace?.op === 'pageload'
    );
  });

  await page.goto(`/server-component/parameter/${randomRoute}`);
  await clientPageloadTransactionPromise;
  await page.getByText('Page (/server-component/[parameter])').isVisible();

  const clientNavigationTransactionPromise = waitForTransaction('nextjs-app-dir', transactionEvent => {
    return (
      transactionEvent?.transaction === '/server-component/parameter/foo/bar/baz' &&
      transactionEvent.contexts?.trace?.op === 'navigation'
    );
  });

  const serverComponentTransactionPromise = waitForTransaction('nextjs-app-dir', async transactionEvent => {
    return (
      // It seems to differ between Next.js versions whether the route is parameterized or not
      (transactionEvent?.transaction === 'GET /server-component/parameter/foo/bar/baz' ||
        transactionEvent?.transaction === 'GET /server-component/parameter/[...parameters]') &&
      transactionEvent.contexts?.trace?.data?.['http.target'].startsWith('/server-component/parameter/foo/bar/baz') &&
      (await clientNavigationTransactionPromise).contexts?.trace?.trace_id ===
        transactionEvent.contexts?.trace?.trace_id
    );
  });

  await page.getByText('/server-component/parameter/foo/bar/baz').click();

  expect(await clientNavigationTransactionPromise).toBeDefined();
  expect(await serverComponentTransactionPromise).toBeDefined();
});
