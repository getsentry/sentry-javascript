import { expect, test } from '@playwright/test';
import { waitForTransaction } from '@sentry-internal/test-utils';

// Set by the `assert-command` of the `vue-3 (no Options API)` variant
const OPTIONS_API_DISABLED = process.env.VUE_OPTIONS_API === 'false';

// Must stay in sync with `ASYNC_CHILD_DELAY_MS` in `src/views/DelayedView.vue`.
const ASYNC_CHILD_DELAY_S = 0.3;

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
          'sentry.segment.name.source': 'route',
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
          'sentry.segment.name.source': 'route',
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
          'sentry.segment.name.source': 'route',
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
          'sentry.segment.name.source': 'custom',
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

// The root component is always tracked, and the `app.mount()` wrap records the root spans when
// the Options API is disabled, so both variants expect them. The tracked component spans on
// `/components` still need the Options API, so the disabled variant expects the root spans only.
[
  {
    route: '/',
    routeDescription: 'a route with a synchronously mounted component',
    // `HomeView` is missing from `trackComponents`, so the root spans are the only UI spans.
    expectedUiSpanDescriptions: ['Application Render', 'Vue <Root>'].sort(),
  },
  {
    route: '/components',
    routeDescription: 'a route with an async component',
    expectedUiSpanDescriptions: OPTIONS_API_DISABLED
      ? ['Application Render', 'Vue <Root>'].sort()
      : ['Application Render', 'Vue <ComponentMainView>', 'Vue <ComponentOneView>', 'Vue <Root>'].sort(),
  },
].forEach(({ route, routeDescription, expectedUiSpanDescriptions }) => {
  test(`sends an application render span and a root component span on ${routeDescription}`, async ({ page }) => {
    const transactionPromise = waitForTransaction('vue-3', async transactionEvent => {
      return (
        transactionEvent.contexts?.trace?.op === 'pageload' &&
        transactionEvent.contexts?.trace?.data?.['url.path'] === route
      );
    });

    await page.goto(route);

    const rootSpan = await transactionPromise;
    const uiSpans = (rootSpan.spans || []).filter(span => span.origin === 'auto.ui.vue');

    expect(uiSpans.map(span => span.description).sort()).toEqual(expectedUiSpanDescriptions);

    const applicationRenderSpan = uiSpans.find(span => span.description === 'Application Render');
    expect(applicationRenderSpan).toMatchObject({
      data: {
        'sentry.op': 'ui.render',
        'sentry.origin': 'auto.ui.vue',
      },
      op: 'ui.render',
      origin: 'auto.ui.vue',
    });

    const rootComponentSpan = uiSpans.find(span => span.description === 'Vue <Root>');
    expect(rootComponentSpan).toMatchObject({
      data: {
        'sentry.op': 'ui.mount',
        'sentry.origin': 'auto.ui.vue',
      },
      op: 'ui.mount',
      origin: 'auto.ui.vue',
    });
  });
});

// True on both variants: the mixin arms one debounce timer per component (`tracing.ts`), so a
// late child never clears the root's earlier timer and the span ends at the root's mount. The
// `app.mount()` wrap only observes the root, so it matches.
test('ends the application render span before a delayed async component mounts', async ({ page }) => {
  const transactionPromise = waitForTransaction('vue-3', async transactionEvent => {
    return (
      transactionEvent.contexts?.trace?.op === 'pageload' &&
      transactionEvent.contexts?.trace?.data?.['url.path'] === '/delayed'
    );
  });

  await page.goto('/delayed');
  // Proves the child really mounted after its delay; the duration assertion relies on it.
  await expect(page.locator('#delayed-child')).toBeVisible();

  const rootSpan = await transactionPromise;
  const uiSpans = (rootSpan.spans || []).filter(span => span.origin === 'auto.ui.vue');

  // Neither `DelayedView` nor its child is in `trackComponents`, so both variants expect the same set.
  expect(uiSpans.map(span => span.description).sort()).toEqual(['Application Render', 'Vue <Root>']);

  const applicationRenderSpan = uiSpans.find(span => span.description === 'Application Render');
  expect(applicationRenderSpan?.start_timestamp).toEqual(expect.any(Number));
  expect(applicationRenderSpan?.timestamp).toEqual(expect.any(Number));

  const duration = (applicationRenderSpan?.timestamp ?? 0) - (applicationRenderSpan?.start_timestamp ?? 0);
  expect(duration).toBeLessThan(ASYNC_CHILD_DELAY_S);
});

test('sends a lifecycle span for the root and for each tracked component only', async ({ page }) => {
  // The root spans survive through the `app.mount()` wrap, but the tracked component spans asserted
  // below still come from `app.mixin()`, which is a no-op when the Options API is disabled.
  test.fail(OPTIONS_API_DISABLED, 'Component tracking (`trackComponents`) needs the Options API');

  const transactionPromise = waitForTransaction('vue-3', async transactionEvent => {
    return !!transactionEvent?.transaction && transactionEvent.contexts?.trace?.op === 'pageload';
  });

  await page.goto(`/components`);

  const rootSpan = await transactionPromise;

  expect(rootSpan).toMatchObject({
    contexts: {
      trace: {
        data: {
          'sentry.segment.name.source': 'route',
          'sentry.origin': 'auto.pageload.vue',
          'sentry.op': 'pageload',
          'url.template': '/components',
          'url.path': '/components',
          'url.full': expect.stringMatching(/^https?:\/\/localhost:\d+\/components$/),
        },
        op: 'pageload',
        origin: 'auto.pageload.vue',
      },
    },
    transaction: '/components',
    transaction_info: {
      source: 'route',
    },
  });

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
