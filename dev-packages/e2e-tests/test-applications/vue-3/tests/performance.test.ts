import { expect, test } from '@playwright/test';
import { collectStreamedSpans, getSpanOp, waitForStreamedSpan } from '@sentry-internal/test-utils';

// Set by the `assert-command` of the `vue-3 (no Options API)` variant
const OPTIONS_API_DISABLED = process.env.VUE_OPTIONS_API === 'false';

// Must stay in sync with `ASYNC_CHILD_DELAY_MS` in `src/views/DelayedView.vue`.
const ASYNC_CHILD_DELAY_S = 0.3;

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
      'router.navigation.route.id': { type: 'string', value: 'AboutView' },
      'url.path': { type: 'string', value: '/about' },
      'url.full': { type: 'string', value: expect.stringMatching(/^https?:\/\/localhost:\d+\/about$/) },
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
    expectedUiSpanNames: ['Root', 'Root'],
  },
  {
    route: '/components',
    routeDescription: 'a route with an async component',
    expectedUiSpanNames: OPTIONS_API_DISABLED
      ? ['Root', 'Root']
      : ['ComponentMainView', 'ComponentOneView', 'Root', 'Root'],
  },
].forEach(({ route, routeDescription, expectedUiSpanNames }) => {
  test(`sends an application render span and a root component span on ${routeDescription}`, async ({ page }) => {
    const spansPromise = collectStreamedSpans('vue-3', spans => {
      return (
        spans.some(
          span => span.is_segment && getSpanOp(span) === 'pageload' && span.attributes['url.path']?.value === route,
        ) &&
        (OPTIONS_API_DISABLED || expectedUiSpanNames.every(name => spans.some(span => span.name === name)))
      );
    });

    await page.goto(route);

    const spans = await spansPromise;
    const uiSpans = spans.filter(span => span.attributes['sentry.origin']?.value === 'auto.ui.vue');

    expect(uiSpans.map(span => span.name).sort()).toEqual(expectedUiSpanNames);

    const applicationRenderSpan = uiSpans.find(
      span => span.name === 'Root' && span.attributes['sentry.op']?.value === 'ui.render',
    );
    expect(applicationRenderSpan).toMatchObject({
      name: 'Root',
      attributes: expect.objectContaining({
        'sentry.op': { type: 'string', value: 'ui.render' },
        'sentry.origin': { type: 'string', value: 'auto.ui.vue' },
        'ui.component_name': { type: 'string', value: 'Root' },
        'sentry.description': { type: 'string', value: 'Application Render' },
      }),
    });

    const rootComponentSpan = uiSpans.find(
      span => span.name === 'Root' && span.attributes['sentry.op']?.value === 'ui.mount',
    );
    expect(rootComponentSpan).toMatchObject({
      name: 'Root',
      attributes: expect.objectContaining({
        'sentry.op': { type: 'string', value: 'ui.mount' },
        'sentry.origin': { type: 'string', value: 'auto.ui.vue' },
        'ui.component_name': { type: 'string', value: 'Root' },
        'sentry.description': { type: 'string', value: 'Vue <Root>' },
      }),
    });
  });
});

// True on both variants: the mixin arms one debounce timer per component (`tracing.ts`), so a
// late child never clears the root's earlier timer and the span ends at the root's mount. The
// `app.mount()` wrap only observes the root, so it matches.
test('ends the application render span before a delayed async component mounts', async ({ page }) => {
  const spansPromise = collectStreamedSpans('vue-3', spans =>
    spans.some(
      span => span.is_segment && getSpanOp(span) === 'pageload' && span.attributes['url.path']?.value === '/delayed',
    ),
  );

  await page.goto('/delayed');
  // Proves the child really mounted after its delay; the duration assertion relies on it.
  await expect(page.locator('#delayed-child')).toBeVisible();

  const spans = await spansPromise;
  const uiSpans = spans.filter(span => span.attributes['sentry.origin']?.value === 'auto.ui.vue');

  // Neither `DelayedView` nor its child is in `trackComponents`, so both variants expect the same set.
  expect(uiSpans.map(span => span.name).sort()).toEqual(['Root', 'Root']);

  const applicationRenderSpan = uiSpans.find(span => span.attributes['sentry.op']?.value === 'ui.render');
  expect(applicationRenderSpan?.start_timestamp).toEqual(expect.any(Number));
  expect(applicationRenderSpan?.end_timestamp).toEqual(expect.any(Number));

  const duration = (applicationRenderSpan?.end_timestamp ?? 0) - (applicationRenderSpan?.start_timestamp ?? 0);
  expect(duration).toBeLessThan(ASYNC_CHILD_DELAY_S);
});

test('sends a lifecycle span for the root and for each tracked component only', async ({ page }) => {
  // The root spans survive through the `app.mount()` wrap, but the tracked component spans asserted
  // below still come from `app.mixin()`, which is a no-op when the Options API is disabled.
  test.fail(OPTIONS_API_DISABLED, 'Component tracking (`trackComponents`) needs the Options API');

  const expectedUiSpanNames = ['ComponentMainView', 'ComponentOneView', 'Root', 'Root'];

  const spansPromise = collectStreamedSpans('vue-3', spans => {
    return (
      spans.some(span => span.is_segment && getSpanOp(span) === 'pageload' && span.name === '/components') &&
      (OPTIONS_API_DISABLED || expectedUiSpanNames.every(name => spans.some(span => span.name === name)))
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

  const applicationRenderSpan = uiSpans.find(
    span => span.name === 'Root' && span.attributes['sentry.op']?.value === 'ui.render',
  );
  expect(applicationRenderSpan).toMatchObject({
    attributes: expect.objectContaining({
      'sentry.op': { type: 'string', value: 'ui.render' },
      'sentry.origin': { type: 'string', value: 'auto.ui.vue' },
      'ui.component_name': { type: 'string', value: 'Root' },
      'sentry.description': { type: 'string', value: 'Application Render' },
    }),
  });

  const rootComponentSpan = uiSpans.find(
    span => span.name === 'Root' && span.attributes['sentry.op']?.value === 'ui.mount',
  );
  expect(rootComponentSpan).toMatchObject({
    attributes: expect.objectContaining({
      'sentry.op': { type: 'string', value: 'ui.mount' },
      'sentry.origin': { type: 'string', value: 'auto.ui.vue' },
      'ui.component_name': { type: 'string', value: 'Root' },
      'sentry.description': { type: 'string', value: 'Vue <Root>' },
    }),
  });

  const componentMainViewSpan = uiSpans.find(span => span.name === 'ComponentMainView');
  expect(componentMainViewSpan).toMatchObject({
    attributes: expect.objectContaining({
      'sentry.op': { type: 'string', value: 'ui.mount' },
      'sentry.origin': { type: 'string', value: 'auto.ui.vue' },
      'ui.component_name': { type: 'string', value: 'ComponentMainView' },
      'sentry.description': { type: 'string', value: 'Vue <ComponentMainView>' },
    }),
  });

  const componentOneViewSpan = uiSpans.find(span => span.name === 'ComponentOneView');
  expect(componentOneViewSpan).toMatchObject({
    attributes: expect.objectContaining({
      'sentry.op': { type: 'string', value: 'ui.mount' },
      'sentry.origin': { type: 'string', value: 'auto.ui.vue' },
      'ui.component_name': { type: 'string', value: 'ComponentOneView' },
      'sentry.description': { type: 'string', value: 'Vue <ComponentOneView>' },
    }),
  });

  expect(uiSpanNames).not.toContain('ComponentTwoView');
});
