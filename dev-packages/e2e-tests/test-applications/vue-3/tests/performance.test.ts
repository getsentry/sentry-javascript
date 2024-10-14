import { expect, test } from '@playwright/test';
import { waitForTransaction } from '@sentry-internal/test-utils';

test('sends a pageload transaction with a parameterized URL', async ({ page }) => {
  const transactionPromise = waitForTransaction('vue-3', async transactionEvent => {
    return !!transactionEvent?.transaction && transactionEvent.contexts?.trace?.op === 'pageload';
  });

  await page.goto(`/users/456`);

  const rootSpan = await transactionPromise;

  expect(rootSpan).toMatchObject({
    contexts: {
      trace: {
        data: {
          'sentry.source': 'route',
          'sentry.origin': 'auto.pageload.vue',
          'sentry.op': 'pageload',
          'params.id': '456',
        },
        op: 'pageload',
        origin: 'auto.pageload.vue',
      },
    },
    transaction: '/users/:id',
    transaction_info: {
      source: 'route',
    },
  });
});

test('sends a navigation transaction with a parameterized URL', async ({ page }) => {
  const pageloadTxnPromise = waitForTransaction('vue-3', async transactionEvent => {
    return !!transactionEvent?.transaction && transactionEvent.contexts?.trace?.op === 'pageload';
  });

  const navigationTxnPromise = waitForTransaction('vue-3', async transactionEvent => {
    return !!transactionEvent?.transaction && transactionEvent.contexts?.trace?.op === 'navigation';
  });

  await page.goto(`/`);
  await pageloadTxnPromise;

  await page.waitForTimeout(5000);

  const [_, navigationTxn] = await Promise.all([page.locator('#navLink').click(), navigationTxnPromise]);

  expect(navigationTxn).toMatchObject({
    contexts: {
      trace: {
        data: {
          'sentry.source': 'route',
          'sentry.origin': 'auto.navigation.vue',
          'sentry.op': 'navigation',
          'params.id': '123',
        },
        op: 'navigation',
        origin: 'auto.navigation.vue',
      },
    },
    transaction: '/users/:id',
    transaction_info: {
      source: 'route',
    },
  });
});

test('sends a pageload transaction with a nested route URL', async ({ page }) => {
  const transactionPromise = waitForTransaction('vue-3', async transactionEvent => {
    return !!transactionEvent?.transaction && transactionEvent.contexts?.trace?.op === 'pageload';
  });

  await page.goto(`/categories/123`);

  const rootSpan = await transactionPromise;

  expect(rootSpan).toMatchObject({
    contexts: {
      trace: {
        data: {
          'sentry.source': 'route',
          'sentry.origin': 'auto.pageload.vue',
          'sentry.op': 'pageload',
          'params.id': '123',
        },
        op: 'pageload',
        origin: 'auto.pageload.vue',
      },
    },
    transaction: '/categories/:id',
    transaction_info: {
      source: 'route',
    },
  });
});

test('sends a pageload transaction with a route name as transaction name if available', async ({ page }) => {
  const transactionPromise = waitForTransaction('vue-3', async transactionEvent => {
    return !!transactionEvent?.transaction && transactionEvent.contexts?.trace?.op === 'pageload';
  });

  await page.goto(`/about`);

  const rootSpan = await transactionPromise;

  expect(rootSpan).toMatchObject({
    contexts: {
      trace: {
        data: {
          'sentry.source': 'custom',
          'sentry.origin': 'auto.pageload.vue',
          'sentry.op': 'pageload',
        },
        op: 'pageload',
        origin: 'auto.pageload.vue',
      },
    },
    transaction: 'AboutView',
    transaction_info: {
      source: 'custom',
    },
  });
});

test('sends a lifecycle span for each tracked components', async ({ page }) => {
  const transactionPromise = waitForTransaction('vue-3', async transactionEvent => {
    return !!transactionEvent?.transaction && transactionEvent.contexts?.trace?.op === 'pageload';
  });

  await page.goto(`/components`);

  const rootSpan = await transactionPromise;

  expect(rootSpan).toMatchObject({
    contexts: {
      trace: {
        data: {
          'sentry.source': 'route',
          'sentry.origin': 'auto.pageload.vue',
          'sentry.op': 'pageload',
        },
        op: 'pageload',
        origin: 'auto.pageload.vue',
      },
    },
    spans: expect.arrayContaining([
      // enabled by default
      expect.objectContaining({
        data: {
          'sentry.op': 'ui.vue.render',
          'sentry.origin': 'auto.ui.vue',
        },
        description: 'Application Render',
        op: 'ui.vue.render',
        origin: 'auto.ui.vue',
      }),
      // enabled by default
      expect.objectContaining({
        data: {
          'sentry.op': 'ui.vue.mount',
          'sentry.origin': 'auto.ui.vue',
        },
        description: 'Vue <Root>',
        op: 'ui.vue.mount',
        origin: 'auto.ui.vue',
      }),

      // without `<>`
      expect.objectContaining({
        data: {
          'sentry.op': 'ui.vue.mount',
          'sentry.origin': 'auto.ui.vue',
        },
        description: 'Vue <ComponentMainView>',
        op: 'ui.vue.mount',
        origin: 'auto.ui.vue',
      }),

      // with `<>`
      expect.objectContaining({
        data: {
          'sentry.op': 'ui.vue.mount',
          'sentry.origin': 'auto.ui.vue',
        },
        description: 'Vue <ComponentOneView>',
        op: 'ui.vue.mount',
        origin: 'auto.ui.vue',
      }),

      // not tracked
      expect.not.objectContaining({
        data: {
          'sentry.op': 'ui.vue.mount',
          'sentry.origin': 'auto.ui.vue',
        },
        description: 'Vue <ComponentTwoView>',
        op: 'ui.vue.mount',
        origin: 'auto.ui.vue',
      }),
    ]),
    transaction: '/components',
    transaction_info: {
      source: 'route',
    },
  });
});
