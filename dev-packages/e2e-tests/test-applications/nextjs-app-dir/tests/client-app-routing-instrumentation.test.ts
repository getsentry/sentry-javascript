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
      transactionEvent.contexts?.trace?.data?.['http.target'].startsWith('/server-component/parameter/foo/bar/baz')
    );
  });

  await page.getByText('/server-component/parameter/foo/bar/baz').click();

  expect(await clientNavigationTransactionPromise).toBeDefined();
  expect(await serverComponentTransactionPromise).toBeDefined();

  expect((await serverComponentTransactionPromise).contexts?.trace?.trace_id).toBe(
    (await clientNavigationTransactionPromise).contexts?.trace?.trace_id,
  );
});

test('Creates a navigation transaction for `router.push()`', async ({ page }) => {
  const navigationTransactionPromise = waitForTransaction('nextjs-app-dir', transactionEvent => {
    return (
      transactionEvent?.transaction === `/navigation/42/router-push` &&
      transactionEvent.contexts?.trace?.op === 'navigation' &&
      transactionEvent.contexts.trace.data?.['navigation.type'] === 'router.push'
    );
  });

  await page.goto('/navigation');
  await page.waitForTimeout(3000);
  await page.getByText('router.push()').click();

  expect(await navigationTransactionPromise).toBeDefined();
});

test('Creates a navigation transaction for `router.replace()`', async ({ page }) => {
  const navigationTransactionPromise = waitForTransaction('nextjs-app-dir', transactionEvent => {
    return (
      transactionEvent?.transaction === `/navigation/42/router-replace` &&
      transactionEvent.contexts?.trace?.op === 'navigation' &&
      transactionEvent.contexts.trace.data?.['navigation.type'] === 'router.replace'
    );
  });

  await page.goto('/navigation');
  await page.waitForTimeout(3000);
  await page.getByText('router.replace()').click();

  expect(await navigationTransactionPromise).toBeDefined();
});

test('Creates a navigation transaction for `router.back()`', async ({ page }) => {
  const navigationTransactionPromise = waitForTransaction('nextjs-app-dir', transactionEvent => {
    return (
      transactionEvent?.transaction === `/navigation/1337/router-back` &&
      transactionEvent.contexts?.trace?.op === 'navigation'
    );
  });

  await page.goto('/navigation/1337/router-back');
  await page.waitForTimeout(3000);
  await page.getByText('Go back home').click();
  await page.waitForTimeout(3000);
  await page.getByText('router.back()').click();

  expect(await navigationTransactionPromise).toMatchObject({
    contexts: {
      trace: {
        data: {
          'navigation.type': 'router.back',
        },
      },
    },
  });
});

test('Creates a navigation transaction for `router.forward()`', async ({ page }) => {
  const navigationTransactionPromise = waitForTransaction('nextjs-app-dir', transactionEvent => {
    return (
      transactionEvent?.transaction === `/navigation/42/router-push` &&
      transactionEvent.contexts?.trace?.op === 'navigation' &&
      transactionEvent.contexts.trace.data?.['navigation.type'] === 'router.forward'
    );
  });

  await page.goto('/navigation');
  await page.waitForTimeout(3000);
  await page.getByText('router.push()').click();
  await page.waitForTimeout(3000);
  await page.goBack();
  await page.waitForTimeout(3000);
  await page.getByText('router.forward()').click();

  expect(await navigationTransactionPromise).toBeDefined();
});

test('Creates a navigation transaction for `<Link />`', async ({ page }) => {
  const navigationTransactionPromise = waitForTransaction('nextjs-app-dir', transactionEvent => {
    return (
      transactionEvent?.transaction === `/navigation/42/link` &&
      transactionEvent.contexts?.trace?.op === 'navigation' &&
      transactionEvent.contexts.trace.data?.['navigation.type'] === 'router.push'
    );
  });

  await page.goto('/navigation');
  await page.getByText('Normal Link').click();

  expect(await navigationTransactionPromise).toBeDefined();
});

test('Creates a navigation transaction for `<Link replace />`', async ({ page }) => {
  const navigationTransactionPromise = waitForTransaction('nextjs-app-dir', transactionEvent => {
    return (
      transactionEvent?.transaction === `/navigation/42/link-replace` &&
      transactionEvent.contexts?.trace?.op === 'navigation' &&
      transactionEvent.contexts.trace.data?.['navigation.type'] === 'router.replace'
    );
  });

  await page.goto('/navigation');
  await page.waitForTimeout(3000);
  await page.getByText('Link Replace').click();

  expect(await navigationTransactionPromise).toBeDefined();
});

test('Creates a navigation transaction for browser-back', async ({ page }) => {
  const navigationTransactionPromise = waitForTransaction('nextjs-app-dir', transactionEvent => {
    return (
      transactionEvent?.transaction === `/navigation/42/browser-back` &&
      transactionEvent.contexts?.trace?.op === 'navigation' &&
      transactionEvent.contexts.trace.data?.['navigation.type'] === 'browser.popstate'
    );
  });

  await page.goto('/navigation/42/browser-back');
  await page.waitForTimeout(3000);
  await page.getByText('Go back home').click();
  await page.waitForTimeout(3000);
  await page.goBack();

  expect(await navigationTransactionPromise).toBeDefined();
});

test('Creates a navigation transaction for browser-forward', async ({ page }) => {
  const navigationTransactionPromise = waitForTransaction('nextjs-app-dir', transactionEvent => {
    return (
      transactionEvent?.transaction === `/navigation/42/router-push` &&
      transactionEvent.contexts?.trace?.op === 'navigation' &&
      transactionEvent.contexts.trace.data?.['navigation.type'] === 'browser.popstate'
    );
  });

  await page.goto('/navigation');
  await page.getByText('router.push()').click();
  await page.waitForTimeout(3000);
  await page.goBack();
  await page.waitForTimeout(3000);
  await page.goForward();

  expect(await navigationTransactionPromise).toBeDefined();
});
