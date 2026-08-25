import { expect, test } from '@playwright/test';
import { waitForTransaction } from '@sentry-internal/test-utils';

// Set by the `assert-command` of the `vue-3 (no Options API)` variant
const OPTIONS_API_DISABLED = process.env.VUE_OPTIONS_API === 'false';

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
          'url.template': '/users/:id',
          'url.path': '/users/456',
          'url.full': expect.stringMatching(/^https?:\/\/localhost:\d+\/users\/456$/),
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
          'url.template': '/users/:id',
          'url.path': '/users/123',
          'url.full': expect.stringMatching(/^https?:\/\/localhost:\d+\/users\/123$/),
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
          'url.template': '/categories/:id',
          'url.path': '/categories/123',
          'url.full': expect.stringMatching(/^https?:\/\/localhost:\d+\/categories\/123$/),
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
          'navigation.route.id': 'AboutView',
          'url.path': '/about',
          'url.full': expect.stringMatching(/^https?:\/\/localhost:\d+\/about$/),
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

test('sends a lifecycle span for the root and for each tracked component only', async ({ page }) => {
  // Vue compiles `app.mixin()` down to a no-op when the Options API is disabled, so the SDK creates no UI spans at all.
  test.fail(OPTIONS_API_DISABLED, 'Vue tracing is registered through app.mixin(), which needs the Options API');

  const transactionPromise = waitForTransaction('vue-3', async transactionEvent => {
    return !!transactionEvent?.transaction && transactionEvent.contexts?.trace?.op === 'pageload';
  });

  await page.goto(`/components`);

  const rootSpan = await transactionPromise;

  const uiSpans = (rootSpan.spans || []).filter(span => span.origin === 'auto.ui.vue');
  const uiSpanDescriptions = uiSpans.map(span => span.description).sort();

  expect(uiSpanDescriptions).toEqual([
    'Application Render',
    'Vue <ComponentMainView>',
    'Vue <ComponentOneView>',
    'Vue <Root>',
  ]);

  // enabled by default
  const applicationRenderSpan = uiSpans.find(span => span.description === 'Application Render');
  expect(applicationRenderSpan).toMatchObject({
    data: {
      'sentry.op': 'ui.render',
      'sentry.origin': 'auto.ui.vue',
    },
    op: 'ui.render',
    origin: 'auto.ui.vue',
  });

  // enabled by default
  const rootComponentSpan = uiSpans.find(span => span.description === 'Vue <Root>');
  expect(rootComponentSpan).toMatchObject({
    data: {
      'sentry.op': 'ui.mount',
      'sentry.origin': 'auto.ui.vue',
    },
    op: 'ui.mount',
    origin: 'auto.ui.vue',
  });

  // without `<>`
  const componentMainViewSpan = uiSpans.find(span => span.description === 'Vue <ComponentMainView>');
  expect(componentMainViewSpan).toMatchObject({
    data: {
      'sentry.op': 'ui.mount',
      'sentry.origin': 'auto.ui.vue',
    },
    op: 'ui.mount',
    origin: 'auto.ui.vue',
  });

  // with `<>`
  const componentOneViewSpan = uiSpans.find(span => span.description === 'Vue <ComponentOneView>');
  expect(componentOneViewSpan).toMatchObject({
    data: {
      'sentry.op': 'ui.mount',
      'sentry.origin': 'auto.ui.vue',
    },
    op: 'ui.mount',
    origin: 'auto.ui.vue',
  });

  // `ComponentTwoView` renders on this route but is absent from `trackComponents`
  // not tracked
  expect(uiSpanDescriptions).not.toContain('Vue <ComponentTwoView>');
});
