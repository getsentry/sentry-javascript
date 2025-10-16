import { expect, test } from '@playwright/test';
import { waitForTransaction } from '@sentry-internal/test-utils';

test('sends a pageload transaction with a parameterized URL', async ({ page }) => {
  const transactionPromise = waitForTransaction('solid-tanstack-router', async transactionEvent => {
    return !!transactionEvent?.transaction && transactionEvent.contexts?.trace?.op === 'pageload';
  });

  await page.goto(`/posts/456`);

  const rootSpan = await transactionPromise;

  expect(rootSpan).toMatchObject({
    contexts: {
      trace: {
        data: {
          'sentry.source': 'route',
          'sentry.origin': 'auto.pageload.solid.tanstack_router',
          'sentry.op': 'pageload',
          'url.path.parameter.postId': '456',
        },
        op: 'pageload',
        origin: 'auto.pageload.solid.tanstack_router',
      },
    },
    transaction: '/posts/$postId',
    transaction_info: {
      source: 'route',
    },
  });
});

test('sends a navigation transaction with a parameterized URL', async ({ page }) => {
  const pageloadTxnPromise = waitForTransaction('solid-tanstack-router', async transactionEvent => {
    return !!transactionEvent?.transaction && transactionEvent.contexts?.trace?.op === 'pageload';
  });

  const navigationTxnPromise = waitForTransaction('solid-tanstack-router', async transactionEvent => {
    return (
      !!transactionEvent?.transaction &&
      transactionEvent.transaction === '/posts/$postId' &&
      transactionEvent.contexts?.trace?.op === 'navigation'
    );
  });

  await page.goto(`/`);
  await pageloadTxnPromise;

  await page.waitForTimeout(5000);
  await page.locator('#nav-link').click();

  const navigationTxn = await navigationTxnPromise;

  expect(navigationTxn).toMatchObject({
    contexts: {
      trace: {
        data: {
          'sentry.source': 'route',
          'sentry.origin': 'auto.navigation.solid.tanstack_router',
          'sentry.op': 'navigation',
          'url.path.parameter.postId': '2',
        },
        op: 'navigation',
        origin: 'auto.navigation.solid.tanstack_router',
      },
    },
    transaction: '/posts/$postId',
    transaction_info: {
      source: 'route',
    },
  });
});
