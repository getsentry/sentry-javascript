import { expect, test } from '@playwright/test';
import { collectStreamedSpans, getSpanOp, waitForStreamedSpan } from '@sentry-internal/test-utils';

// Set by the `assert-command` of the `vue-3 (no Options API)` variant
const OPTIONS_API_DISABLED = process.env.VUE_OPTIONS_API === 'false';

test('sends a pageload span with a parameterized URL', async ({ page }) => {
  const pageloadSpanPromise = waitForStreamedSpan('vue-3', span => {
    return span.is_segment && getSpanOp(span) === 'pageload';
  });

  await page.goto(`/users/456`);

  const pageloadSpan = await pageloadSpanPromise;

  expect(pageloadSpan).toMatchObject({
    name: '/users/:id',
    is_segment: true,
    attributes: {
      'sentry.segment.name.source': { type: 'string', value: 'route' },
      'sentry.origin': { type: 'string', value: 'auto.pageload.vue' },
      'sentry.op': { type: 'string', value: 'pageload' },
      'params.id': { type: 'string', value: '456' },
      'url.template': { type: 'string', value: '/users/:id' },
      'url.path': { type: 'string', value: '/users/456' },
      'url.full': { type: 'string', value: expect.stringMatching(/^https?:\/\/localhost:\d+\/users\/456$/) },
    },
  });
});

test('sends a navigation span with a parameterized URL', async ({ page }) => {
  const pageloadSpanPromise = waitForStreamedSpan('vue-3', span => {
    return span.is_segment && getSpanOp(span) === 'pageload';
  });

  const navigationSpanPromise = waitForStreamedSpan('vue-3', span => {
    return span.is_segment && getSpanOp(span) === 'navigation';
  });

  await page.goto(`/`);
  await pageloadSpanPromise;

  await page.waitForTimeout(5000);

  const [_, navigationSpan] = await Promise.all([page.locator('#navLink').click(), navigationSpanPromise]);

  expect(navigationSpan).toMatchObject({
    name: '/users/:id',
    is_segment: true,
    attributes: {
      'sentry.segment.name.source': { type: 'string', value: 'route' },
      'sentry.origin': { type: 'string', value: 'auto.navigation.vue' },
      'sentry.op': { type: 'string', value: 'navigation' },
      'params.id': { type: 'string', value: '123' },
      'url.template': { type: 'string', value: '/users/:id' },
      'url.path': { type: 'string', value: '/users/123' },
      'url.full': { type: 'string', value: expect.stringMatching(/^https?:\/\/localhost:\d+\/users\/123$/) },
    },
  });
});

test('sends a pageload span with a nested route URL', async ({ page }) => {
  const pageloadSpanPromise = waitForStreamedSpan('vue-3', span => {
    return span.is_segment && getSpanOp(span) === 'pageload';
  });

  await page.goto(`/categories/123`);

  const pageloadSpan = await pageloadSpanPromise;

  expect(pageloadSpan).toMatchObject({
    name: '/categories/:id',
    is_segment: true,
    attributes: {
      'sentry.segment.name.source': { type: 'string', value: 'route' },
      'sentry.origin': { type: 'string', value: 'auto.pageload.vue' },
      'sentry.op': { type: 'string', value: 'pageload' },
      'params.id': { type: 'string', value: '123' },
      'url.template': { type: 'string', value: '/categories/:id' },
      'url.path': { type: 'string', value: '/categories/123' },
      'url.full': { type: 'string', value: expect.stringMatching(/^https?:\/\/localhost:\d+\/categories\/123$/) },
    },
  });
});

test('sends a pageload span with a route name as span name if available', async ({ page }) => {
  const pageloadSpanPromise = waitForStreamedSpan('vue-3', span => {
    return span.is_segment && getSpanOp(span) === 'pageload';
  });

  await page.goto(`/about`);

  const pageloadSpan = await pageloadSpanPromise;

  expect(pageloadSpan).toMatchObject({
    name: 'AboutView',
    is_segment: true,
    attributes: {
      'sentry.segment.name.source': { type: 'string', value: 'custom' },
      'sentry.origin': { type: 'string', value: 'auto.pageload.vue' },
      'sentry.op': { type: 'string', value: 'pageload' },
      'navigation.route.id': { type: 'string', value: 'AboutView' },
      'url.path': { type: 'string', value: '/about' },
      'url.full': { type: 'string', value: expect.stringMatching(/^https?:\/\/localhost:\d+\/about$/) },
    },
  });
});

// The root component is always tracked, even when the route's view is missing from `trackComponents`.
// The root itself mounts synchronously on both routes (`app.mount()` does not wait for the router).
// What differs on `/components` is that its view arrives through a dynamic `import()`, so the
// async-loaded components must join the same pageload while `Application Render` is still open.
[
  {
    route: '/',
    routeDescription: 'a route with a synchronously mounted component',
    // `HomeView` is missing from `trackComponents`, so the root spans are the only UI spans.
    expectedUiSpanNames: ['Application Render', 'Vue <Root>'],
  },
  {
    route: '/components',
    routeDescription: 'a route with an async component',
    expectedUiSpanNames: ['Application Render', 'Vue <ComponentMainView>', 'Vue <ComponentOneView>', 'Vue <Root>'],
  },
].forEach(({ route, routeDescription, expectedUiSpanNames }) => {
  test(`sends an application render span and a root component span on ${routeDescription}`, async ({ page }) => {
    // Vue compiles `app.mixin()` down to a no-op when the Options API is disabled, so the SDK creates no UI spans at all.
    test.fail(OPTIONS_API_DISABLED, 'Vue tracing is registered through app.mixin(), which needs the Options API');

    const spansPromise = collectStreamedSpans('vue-3', spans => {
      return (
        spans.some(
          span => span.is_segment && getSpanOp(span) === 'pageload' && span.attributes['url.path']?.value === route,
        ) && expectedUiSpanNames.every(name => spans.some(span => span.name === name))
      );
    });

    await page.goto(route);

    const spans = await spansPromise;
    const uiSpans = spans.filter(span => span.attributes['sentry.origin']?.value === 'auto.ui.vue');

    expect(uiSpans.map(span => span.name).sort()).toEqual(expectedUiSpanNames);

    const applicationRenderSpan = uiSpans.find(span => span.name === 'Application Render');
    expect(applicationRenderSpan).toMatchObject({
      name: 'Application Render',
      attributes: expect.objectContaining({
        'sentry.op': { type: 'string', value: 'ui.render' },
        'sentry.origin': { type: 'string', value: 'auto.ui.vue' },
      }),
    });

    const rootComponentSpan = uiSpans.find(span => span.name === 'Vue <Root>');
    expect(rootComponentSpan).toMatchObject({
      name: 'Vue <Root>',
      attributes: expect.objectContaining({
        'sentry.op': { type: 'string', value: 'ui.mount' },
        'sentry.origin': { type: 'string', value: 'auto.ui.vue' },
      }),
    });
  });
});

test('sends a lifecycle span for the root and for each tracked component only', async ({ page }) => {
  // Vue compiles `app.mixin()` down to a no-op when the Options API is disabled, so the SDK creates no UI spans at all.
  test.fail(OPTIONS_API_DISABLED, 'Vue tracing is registered through app.mixin(), which needs the Options API');

  const expectedUiSpanNames = ['Application Render', 'Vue <ComponentMainView>', 'Vue <ComponentOneView>', 'Vue <Root>'];

  const spansPromise = collectStreamedSpans('vue-3', spans => {
    return (
      spans.some(span => span.is_segment && getSpanOp(span) === 'pageload' && span.name === '/components') &&
      expectedUiSpanNames.every(name => spans.some(span => span.name === name))
    );
  });

  await page.goto(`/components`);

  const spans = await spansPromise;

  const pageloadSpan = spans.find(
    span => span.is_segment && getSpanOp(span) === 'pageload' && span.name === '/components',
  );

  expect(pageloadSpan).toMatchObject({
    name: '/components',
    is_segment: true,
    attributes: {
      'sentry.segment.name.source': { type: 'string', value: 'route' },
      'sentry.origin': { type: 'string', value: 'auto.pageload.vue' },
      'sentry.op': { type: 'string', value: 'pageload' },
      'url.template': { type: 'string', value: '/components' },
      'url.path': { type: 'string', value: '/components' },
      'url.full': { type: 'string', value: expect.stringMatching(/^https?:\/\/localhost:\d+\/components$/) },
    },
  });

  const uiSpans = spans.filter(span => span.attributes['sentry.origin']?.value === 'auto.ui.vue');
  const uiSpanNames = uiSpans.map(span => span.name).sort();

  expect(uiSpanNames).toEqual(expectedUiSpanNames);

  const applicationRenderSpan = uiSpans.find(span => span.name === 'Application Render');
  expect(applicationRenderSpan).toMatchObject({
    attributes: expect.objectContaining({
      'sentry.op': { type: 'string', value: 'ui.render' },
      'sentry.origin': { type: 'string', value: 'auto.ui.vue' },
    }),
  });

  const rootComponentSpan = uiSpans.find(span => span.name === 'Vue <Root>');
  expect(rootComponentSpan).toMatchObject({
    attributes: expect.objectContaining({
      'sentry.op': { type: 'string', value: 'ui.mount' },
      'sentry.origin': { type: 'string', value: 'auto.ui.vue' },
    }),
  });

  const componentMainViewSpan = uiSpans.find(span => span.name === 'Vue <ComponentMainView>');
  expect(componentMainViewSpan).toMatchObject({
    attributes: expect.objectContaining({
      'sentry.op': { type: 'string', value: 'ui.mount' },
      'sentry.origin': { type: 'string', value: 'auto.ui.vue' },
    }),
  });

  const componentOneViewSpan = uiSpans.find(span => span.name === 'Vue <ComponentOneView>');
  expect(componentOneViewSpan).toMatchObject({
    attributes: expect.objectContaining({
      'sentry.op': { type: 'string', value: 'ui.mount' },
      'sentry.origin': { type: 'string', value: 'auto.ui.vue' },
    }),
  });

  expect(uiSpanNames).not.toContain('Vue <ComponentTwoView>');
});
