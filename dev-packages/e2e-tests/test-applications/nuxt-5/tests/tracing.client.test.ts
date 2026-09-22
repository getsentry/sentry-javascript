import { expect, test } from '@playwright/test';
import { waitForTransaction } from '@sentry-internal/test-utils';
import type { Span } from '@sentry/nuxt';

test('sends a pageload root span with a parameterized URL', async ({ page }) => {
  const transactionPromise = waitForTransaction('nuxt-5', async transactionEvent => {
    return transactionEvent.transaction === '/test-param/:param()';
  });

  await page.goto(`/test-param/1234`);

  const rootSpan = await transactionPromise;

  expect(rootSpan).toMatchObject({
    contexts: {
      trace: {
        data: {
          'sentry.source': 'route',
          'sentry.origin': 'auto.pageload.vue',
          'sentry.op': 'pageload',
          'params.param': '1234',
          'url.template': '/test-param/:param()',
          'url.path': '/test-param/1234',
          'url.full': expect.stringMatching(/^https?:\/\/localhost:\d+\/test-param\/1234$/),
        },
        op: 'pageload',
        origin: 'auto.pageload.vue',
      },
    },
    transaction: '/test-param/:param()',
    transaction_info: {
      source: 'route',
    },
  });
});

test('sends a navigation root span with a parameterized URL', async ({ page }) => {
  const transactionPromise = waitForTransaction('nuxt-5', async transactionEvent => {
    return (
      transactionEvent.contexts?.trace?.op === 'navigation' && transactionEvent.transaction === '/test-param/:param()'
    );
  });

  await page.goto(`/`);
  await page.getByText('Fetch Param').click();

  const rootSpan = await transactionPromise;

  expect(rootSpan).toMatchObject({
    contexts: {
      trace: {
        data: {
          'sentry.source': 'route',
          'sentry.origin': 'auto.navigation.vue',
          'sentry.op': 'navigation',
          'params.param': '1234',
          'url.template': '/test-param/:param()',
          'url.path': '/test-param/1234',
          'url.full': expect.stringMatching(/^https?:\/\/localhost:\d+\/test-param\/1234$/),
        },
        op: 'navigation',
        origin: 'auto.navigation.vue',
      },
    },
    transaction: '/test-param/:param()',
    transaction_info: {
      source: 'route',
    },
  });
});

test('sends component tracking spans when `trackComponents` is enabled', async ({ page }) => {
  // Nuxt 5 disables the Options API by default (nuxt/nuxt#35791), and component spans only exist
  // through `app.mixin()`, which that flag turns into a no-op. `vue: { optionsApi: true }` re-enables it.
  test.fail(true, 'Component tracking (`trackComponents`) needs the Options API');

  const transactionPromise = waitForTransaction('nuxt-5', async transactionEvent => {
    return transactionEvent.transaction === '/client-error';
  });

  await page.goto(`/client-error`);

  const rootSpan = await transactionPromise;
  const errorButtonSpan = rootSpan.spans.find((span: Span) => span.description === 'Vue <ErrorButton>');

  const expected = {
    data: { 'sentry.origin': 'auto.ui.vue', 'sentry.op': 'ui.vue.mount' },
    description: 'Vue <ErrorButton>',
    op: 'ui.vue.mount',
    parent_span_id: expect.stringMatching(/[a-f0-9]{16}/),
    span_id: expect.stringMatching(/[a-f0-9]{16}/),
    start_timestamp: expect.any(Number),
    timestamp: expect.any(Number),
    trace_id: expect.stringMatching(/[a-f0-9]{32}/),
    origin: 'auto.ui.vue',
  };

  expect(errorButtonSpan).toMatchObject(expected);
});

test('sends an application render span and a root component span on pageload', async ({ page }) => {
  const transactionPromise = waitForTransaction('nuxt-5', async transactionEvent => {
    return transactionEvent.transaction === '/client-error';
  });

  await page.goto(`/client-error`);

  const rootSpan = await transactionPromise;
  const uiSpans = (rootSpan.spans ?? []).filter((span: Span) => span.origin === 'auto.ui.vue');

  const applicationRenderSpans = uiSpans.filter((span: Span) => span.description === 'Application Render');
  expect(applicationRenderSpans).toHaveLength(1);
  expect(applicationRenderSpans[0]).toMatchObject({
    data: { 'sentry.origin': 'auto.ui.vue', 'sentry.op': 'ui.vue.render' },
    description: 'Application Render',
    op: 'ui.vue.render',
    origin: 'auto.ui.vue',
    parent_span_id: expect.stringMatching(/[a-f0-9]{16}/),
    span_id: expect.stringMatching(/[a-f0-9]{16}/),
    trace_id: expect.stringMatching(/[a-f0-9]{32}/),
    start_timestamp: expect.any(Number),
    timestamp: expect.any(Number),
  });

  const rootComponentSpans = uiSpans.filter((span: Span) => span.description === 'Vue <Root>');
  expect(rootComponentSpans).toHaveLength(1);
  expect(rootComponentSpans[0]).toMatchObject({
    data: { 'sentry.origin': 'auto.ui.vue', 'sentry.op': 'ui.vue.mount' },
    description: 'Vue <Root>',
    op: 'ui.vue.mount',
    origin: 'auto.ui.vue',
    parent_span_id: expect.stringMatching(/[a-f0-9]{16}/),
    span_id: expect.stringMatching(/[a-f0-9]{16}/),
    trace_id: expect.stringMatching(/[a-f0-9]{32}/),
    start_timestamp: expect.any(Number),
    timestamp: expect.any(Number),
  });
});
