import { expect, test } from '@playwright/test';
import { waitForTransaction } from '@sentry-internal/event-proxy-server';

test('Creates a pageload transaction for app router routes', async ({ page }) => {
  const randomRoute = String(Math.random());

  const clientPageloadTransactionPromise = waitForTransaction('nextjs-13-app-dir', transactionEvent => {
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

  const clientPageloadTransactionPromise = waitForTransaction('nextjs-13-app-dir', transactionEvent => {
    return (
      transactionEvent?.transaction === `/server-component/parameter/${randomRoute}` &&
      transactionEvent.contexts?.trace?.op === 'pageload'
    );
  });

  await page.goto(`/server-component/parameter/${randomRoute}`);
  await clientPageloadTransactionPromise;
  await page.getByText('Page (/server-component/parameter/[parameter])').isVisible();

  const clientNavigationTransactionPromise = waitForTransaction('nextjs-13-app-dir', transactionEvent => {
    return (
      transactionEvent?.transaction === '/server-component/parameter/foo/bar/baz' &&
      transactionEvent.contexts?.trace?.op === 'navigation'
    );
  });

  const serverComponentTransactionPromise = waitForTransaction('nextjs-13-app-dir', async transactionEvent => {
    return (
      transactionEvent?.transaction === 'Page Server Component (/server-component/parameter/[...parameters])' &&
      (await clientNavigationTransactionPromise).contexts?.trace?.trace_id ===
        transactionEvent.contexts?.trace?.trace_id
    );
  });

  await page.getByText('/server-component/parameter/foo/bar/baz').click();

  expect(await clientNavigationTransactionPromise).toBeDefined();
  expect(await serverComponentTransactionPromise).toBeDefined();
});
