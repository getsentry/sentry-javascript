import { expect, test } from '@playwright/test';
import { waitForTransaction } from '@sentry-internal/test-utils';

const BASE = process.env.E2E_TEST_BASEPATH || '';

test('sends a pageload transaction with a parameterized URL', async ({ page }) => {
  const transactionPromise = waitForTransaction('tanstack-router', async transactionEvent => {
    return !!transactionEvent?.transaction && transactionEvent.contexts?.trace?.op === 'pageload';
  });

  await page.goto(`${BASE}/posts/456`);

  const rootSpan = await transactionPromise;

  expect(rootSpan).toMatchObject({
    contexts: {
      trace: {
        data: {
          'sentry.source': 'route',
          'sentry.origin': 'auto.pageload.react.tanstack_router',
          'sentry.op': 'pageload',
          'url.path.params.postId': '456',
          'url.template': '/posts/$postId',
          'url.path': '/posts/456',
          'url.full': expect.stringMatching(/^https?:\/\/localhost:\d+\/posts\/456$/),
        },
        op: 'pageload',
        origin: 'auto.pageload.react.tanstack_router',
      },
    },
    transaction: '/posts/$postId',
    transaction_info: {
      source: 'route',
    },
    spans: expect.arrayContaining([
      expect.objectContaining({
        description: 'loading-post-456',
      }),
    ]),
  });
});

test('sends pageload transaction with web vitals measurements', async ({ page }) => {
  const transactionPromise = waitForTransaction('tanstack-router', async transactionEvent => {
    return !!transactionEvent?.transaction && transactionEvent.contexts?.trace?.op === 'pageload';
  });

  await page.goto(`${BASE}/`);

  const transaction = await transactionPromise;

  expect(transaction).toMatchObject({
    contexts: {
      trace: {
        op: 'pageload',
        origin: 'auto.pageload.react.tanstack_router',
        data: {
          'sentry.source': 'route',
          'url.template': '/',
          'url.path': '/',
          'url.full': expect.stringMatching(/^https?:\/\/localhost:\d+\/$/),
        },
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

test('sends a navigation transaction with a parameterized URL', async ({ page }) => {
  const pageloadTxnPromise = waitForTransaction('tanstack-router', async transactionEvent => {
    return !!transactionEvent?.transaction && transactionEvent.contexts?.trace?.op === 'pageload';
  });

  const navigationTxnPromise = waitForTransaction('tanstack-router', async transactionEvent => {
    return !!transactionEvent?.transaction && transactionEvent.contexts?.trace?.op === 'navigation';
  });

  await page.goto(`${BASE}/`);
  await pageloadTxnPromise;

  await page.waitForTimeout(5000);
  await page.locator('#nav-link').click();

  const navigationTxn = await navigationTxnPromise;

  expect(navigationTxn).toMatchObject({
    contexts: {
      trace: {
        data: {
          'sentry.source': 'route',
          'sentry.origin': 'auto.navigation.react.tanstack_router',
          'sentry.op': 'navigation',
          'url.path.params.postId': '2',
          'url.template': '/posts/$postId',
          'url.path': '/posts/2',
          'url.full': expect.stringMatching(/^https?:\/\/localhost:\d+\/posts\/2$/),
        },
        op: 'navigation',
        origin: 'auto.navigation.react.tanstack_router',
      },
    },
    transaction: '/posts/$postId',
    transaction_info: {
      source: 'route',
    },
    spans: expect.arrayContaining([
      expect.objectContaining({
        description: 'loading-post-2',
      }),
    ]),
  });
});

test('sends a pageload transaction with resolved URL attrs after same-route redirect on initial load', async ({
  page,
}) => {
  const pageloadTxnPromise = waitForTransaction('tanstack-router', async transactionEvent => {
    return transactionEvent.contexts?.trace?.op === 'pageload' && transactionEvent.transaction === '/posts/$postId';
  });

  // `/posts/999` matches `/posts/$postId` initially, then `beforeLoad` redirects to `/posts/2`.
  await page.goto(`${BASE}/posts/999`);

  const pageloadTxn = await pageloadTxnPromise;

  expect(pageloadTxn).toMatchObject({
    contexts: {
      trace: {
        data: {
          'sentry.source': 'route',
          'sentry.origin': 'auto.pageload.react.tanstack_router',
          'sentry.op': 'pageload',
          'url.path.params.postId': '2',
          'url.template': '/posts/$postId',
          'url.path': '/posts/2',
          'url.full': expect.stringMatching(/^https?:\/\/localhost:\d+\/posts\/2$/),
        },
        op: 'pageload',
        origin: 'auto.pageload.react.tanstack_router',
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
  const pageloadTxnPromise = waitForTransaction('tanstack-router', async transactionEvent => {
    return transactionEvent.contexts?.trace?.op === 'pageload' && transactionEvent.transaction === '/posts/$postId';
  });

  // Visiting `/redirect` directly throws `redirect({ to: '/posts/$postId', params: { postId: '1' } })`
  // in `beforeLoad` during the initial pageload, so the pageload span must be renamed to the target route.
  await page.goto(`${BASE}/redirect`);

  const pageloadTxn = await pageloadTxnPromise;

  expect(pageloadTxn).toMatchObject({
    contexts: {
      trace: {
        data: {
          'sentry.source': 'route',
          'sentry.origin': 'auto.pageload.react.tanstack_router',
          'sentry.op': 'pageload',
          'url.path.params.postId': '1',
          'url.template': '/posts/$postId',
          'url.path': '/posts/1',
          'url.full': expect.stringMatching(/^https?:\/\/localhost:\d+\/posts\/1$/),
        },
        op: 'pageload',
        origin: 'auto.pageload.react.tanstack_router',
      },
    },
    transaction: '/posts/$postId',
    transaction_info: {
      source: 'route',
    },
  });
});

test('sends a navigation transaction when a redirect is thrown in beforeLoad', async ({ page }) => {
  const pageloadTxnPromise = waitForTransaction('tanstack-router', async transactionEvent => {
    return !!transactionEvent?.transaction && transactionEvent.contexts?.trace?.op === 'pageload';
  });

  const navigationTxnPromise = waitForTransaction('tanstack-router', async transactionEvent => {
    return !!transactionEvent?.transaction && transactionEvent.contexts?.trace?.op === 'navigation';
  });

  await page.goto(`${BASE}/`);
  await pageloadTxnPromise;

  await page.locator('#redirect-link').click();

  const navigationTxn = await navigationTxnPromise;

  // The `/redirect` route throws `redirect({ to: '/posts/$postId', params: { postId: '1' } })` in
  // `beforeLoad`, so the navigation span must be named after the resolved target route, not `/redirect`.
  expect(navigationTxn).toMatchObject({
    contexts: {
      trace: {
        data: {
          'sentry.source': 'route',
          'sentry.origin': 'auto.navigation.react.tanstack_router',
          'sentry.op': 'navigation',
          'url.path.params.postId': '1',
          'url.template': '/posts/$postId',
          'url.path': '/posts/1',
          'url.full': expect.stringMatching(/^https?:\/\/localhost:\d+\/posts\/1$/),
        },
        op: 'navigation',
        origin: 'auto.navigation.react.tanstack_router',
      },
    },
    transaction: '/posts/$postId',
    transaction_info: {
      source: 'route',
    },
  });
});

test('sends a navigation transaction for a normal navigation that happens after a redirect', async ({ page }) => {
  const pageloadTxnPromise = waitForTransaction('tanstack-router', async transactionEvent => {
    return !!transactionEvent?.transaction && transactionEvent.contexts?.trace?.op === 'pageload';
  });

  await page.goto(`${BASE}/`);
  await pageloadTxnPromise;

  // First trigger a redirect-driven navigation. Upstream (TanStack/router#3920) this leaves the
  // router in a state where `onBeforeNavigate` never fires again, which previously killed all
  // subsequent navigation spans.
  const redirectTxnPromise = waitForTransaction('tanstack-router', async transactionEvent => {
    return transactionEvent.contexts?.trace?.op === 'navigation' && transactionEvent.transaction === '/posts/$postId';
  });
  await page.locator('#redirect-link').click();
  await redirectTxnPromise;

  // Now a plain navigation must still produce a navigation span.
  const navigationTxnPromise = waitForTransaction('tanstack-router', async transactionEvent => {
    return (
      transactionEvent.contexts?.trace?.op === 'navigation' &&
      transactionEvent.contexts?.trace?.data?.['url.path.params.postId'] === '2'
    );
  });

  await page.locator('#nav-link').click();

  const navigationTxn = await navigationTxnPromise;

  expect(navigationTxn).toMatchObject({
    contexts: {
      trace: {
        data: {
          'sentry.source': 'route',
          'sentry.origin': 'auto.navigation.react.tanstack_router',
          'sentry.op': 'navigation',
          'url.path.params.postId': '2',
          'url.template': '/posts/$postId',
          'url.path': '/posts/2',
          'url.full': expect.stringMatching(/^https?:\/\/localhost:\d+\/posts\/2$/),
        },
        op: 'navigation',
        origin: 'auto.navigation.react.tanstack_router',
      },
    },
    transaction: '/posts/$postId',
    transaction_info: {
      source: 'route',
    },
  });
});
