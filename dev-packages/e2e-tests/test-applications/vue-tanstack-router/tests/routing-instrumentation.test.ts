import { expect, test } from '@playwright/test';
import { waitForTransaction } from '@sentry-internal/test-utils';

test('sends pageload transaction with web vitals measurements', async ({ page }) => {
  const transactionPromise = waitForTransaction('vue-tanstack-router', async transactionEvent => {
    return !!transactionEvent?.transaction && transactionEvent.contexts?.trace?.op === 'pageload';
  });

  await page.goto(`/`);

  const transaction = await transactionPromise;

  expect(transaction).toMatchObject({
    contexts: {
      trace: {
        op: 'pageload',
        origin: 'auto.pageload.vue.tanstack_router',
      },
    },
    transaction: '/',
    transaction_info: {
      source: 'route',
    },
    measurements: expect.objectContaining({
      ttfb: expect.objectContaining({
        value: expect.any(Number),
        unit: 'millisecond',
      }),
      lcp: expect.objectContaining({
        value: expect.any(Number),
        unit: 'millisecond',
      }),
      fp: expect.objectContaining({
        value: expect.any(Number),
        unit: 'millisecond',
      }),
      fcp: expect.objectContaining({
        value: expect.any(Number),
        unit: 'millisecond',
      }),
    }),
  });
});

test('sends a pageload transaction with a parameterized URL', async ({ page }) => {
  const transactionPromise = waitForTransaction('vue-tanstack-router', async transactionEvent => {
    return !!transactionEvent?.transaction && transactionEvent.contexts?.trace?.op === 'pageload';
  });

  await page.goto(`/posts/456`);

  const rootSpan = await transactionPromise;

  expect(rootSpan).toMatchObject({
    contexts: {
      trace: {
        data: {
          'sentry.source': 'route',
          'sentry.origin': 'auto.pageload.vue.tanstack_router',
          'sentry.op': 'pageload',
          'url.path.parameter.postId': '456',
        },
        op: 'pageload',
        origin: 'auto.pageload.vue.tanstack_router',
      },
    },
    transaction: '/posts/$postId',
    transaction_info: {
      source: 'route',
    },
  });
});

test('sends a navigation transaction with a parameterized URL', async ({ page }) => {
  const pageloadTxnPromise = waitForTransaction('vue-tanstack-router', async transactionEvent => {
    return !!transactionEvent?.transaction && transactionEvent.contexts?.trace?.op === 'pageload';
  });

  const navigationTxnPromise = waitForTransaction('vue-tanstack-router', async transactionEvent => {
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
          'sentry.origin': 'auto.navigation.vue.tanstack_router',
          'sentry.op': 'navigation',
          'url.path.parameter.postId': '2',
        },
        op: 'navigation',
        origin: 'auto.navigation.vue.tanstack_router',
      },
    },
    transaction: '/posts/$postId',
    transaction_info: {
      source: 'route',
    },
  });
});

test('sends a pageload transaction named after the resolved route when a redirect is thrown on initial load', async ({
  page,
}) => {
  const pageloadTxnPromise = waitForTransaction('vue-tanstack-router', async transactionEvent => {
    return transactionEvent.contexts?.trace?.op === 'pageload' && transactionEvent.transaction === '/posts/$postId';
  });

  await page.goto(`/redirect`);

  const pageloadTxn = await pageloadTxnPromise;

  expect(pageloadTxn).toMatchObject({
    contexts: {
      trace: {
        data: {
          'sentry.source': 'route',
          'sentry.origin': 'auto.pageload.vue.tanstack_router',
          'sentry.op': 'pageload',
          'url.path.parameter.postId': '1',
        },
        op: 'pageload',
        origin: 'auto.pageload.vue.tanstack_router',
      },
    },
    transaction: '/posts/$postId',
    transaction_info: {
      source: 'route',
    },
  });
});

test('sends a navigation transaction when a redirect is thrown in beforeLoad', async ({ page }) => {
  const pageloadTxnPromise = waitForTransaction('vue-tanstack-router', async transactionEvent => {
    return !!transactionEvent?.transaction && transactionEvent.contexts?.trace?.op === 'pageload';
  });

  const navigationTxnPromise = waitForTransaction('vue-tanstack-router', async transactionEvent => {
    return (
      !!transactionEvent?.transaction &&
      transactionEvent.transaction === '/posts/$postId' &&
      transactionEvent.contexts?.trace?.op === 'navigation'
    );
  });

  await page.goto(`/`);
  await pageloadTxnPromise;

  await page.locator('#redirect-link').click();

  const navigationTxn = await navigationTxnPromise;

  expect(navigationTxn).toMatchObject({
    contexts: {
      trace: {
        data: {
          'sentry.source': 'route',
          'sentry.origin': 'auto.navigation.vue.tanstack_router',
          'sentry.op': 'navigation',
          'url.path.parameter.postId': '1',
        },
        op: 'navigation',
        origin: 'auto.navigation.vue.tanstack_router',
      },
    },
    transaction: '/posts/$postId',
    transaction_info: {
      source: 'route',
    },
  });
});

test('sends a navigation transaction for a normal navigation that happens after a redirect', async ({ page }) => {
  const pageloadTxnPromise = waitForTransaction('vue-tanstack-router', async transactionEvent => {
    return !!transactionEvent?.transaction && transactionEvent.contexts?.trace?.op === 'pageload';
  });

  await page.goto(`/`);
  await pageloadTxnPromise;

  const redirectTxnPromise = waitForTransaction('vue-tanstack-router', async transactionEvent => {
    return transactionEvent.contexts?.trace?.op === 'navigation' && transactionEvent.transaction === '/posts/$postId';
  });
  await page.locator('#redirect-link').click();
  await redirectTxnPromise;

  const navigationTxnPromise = waitForTransaction('vue-tanstack-router', async transactionEvent => {
    return (
      transactionEvent.contexts?.trace?.op === 'navigation' &&
      transactionEvent.contexts?.trace?.data?.['url.path.parameter.postId'] === '2'
    );
  });

  await page.locator('#nav-link').click();

  const navigationTxn = await navigationTxnPromise;

  expect(navigationTxn).toMatchObject({
    contexts: {
      trace: {
        data: {
          'sentry.source': 'route',
          'sentry.origin': 'auto.navigation.vue.tanstack_router',
          'sentry.op': 'navigation',
          'url.path.parameter.postId': '2',
        },
        op: 'navigation',
        origin: 'auto.navigation.vue.tanstack_router',
      },
    },
    transaction: '/posts/$postId',
    transaction_info: {
      source: 'route',
    },
  });
});
