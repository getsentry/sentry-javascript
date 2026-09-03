import { expect, test } from '@playwright/test';
import { collectStreamedSpans, getSpanOp, waitForStreamedSpan } from '@sentry-internal/test-utils';

test('sends a pageload root span with a parameterized URL', async ({ page }) => {
  const pageloadSpanPromise = waitForStreamedSpan('nuxt-5', span => {
    return getSpanOp(span) === 'pageload' && span.is_segment;
  });

  await page.goto(`/test-param/1234`);

  const pageloadSpan = await pageloadSpanPromise;

  expect(pageloadSpan.name).toBe('/test-param/:param()');
  expect(pageloadSpan.status).toBe('ok');
  expect(pageloadSpan.attributes).toMatchObject({
    'sentry.segment.name.source': { type: 'string', value: 'route' },
    'sentry.origin': { type: 'string', value: 'auto.pageload.vue' },
    'sentry.op': { type: 'string', value: 'pageload' },
    'params.param': { type: 'string', value: '1234' },
    'url.template': { type: 'string', value: '/test-param/:param()' },
    'url.path': { type: 'string', value: '/test-param/1234' },
    'url.full': { type: 'string', value: expect.stringMatching(/^https?:\/\/localhost:\d+\/test-param\/1234$/) },
  });
});

test('sends a navigation root span with a parameterized URL', async ({ page }) => {
  const navigationSpanPromise = waitForStreamedSpan('nuxt-5', span => {
    return getSpanOp(span) === 'navigation' && span.is_segment && span.name === '/test-param/:param()';
  });

  await page.goto(`/`);
  await page.getByText('Fetch Param').click();

  const navigationSpan = await navigationSpanPromise;

  expect(navigationSpan.name).toBe('/test-param/:param()');
  expect(navigationSpan.attributes).toMatchObject({
    'sentry.segment.name.source': { type: 'string', value: 'route' },
    'sentry.origin': { type: 'string', value: 'auto.navigation.vue' },
    'sentry.op': { type: 'string', value: 'navigation' },
    'params.param': { type: 'string', value: '1234' },
    'url.template': { type: 'string', value: '/test-param/:param()' },
    'url.path': { type: 'string', value: '/test-param/1234' },
    'url.full': { type: 'string', value: expect.stringMatching(/^https?:\/\/localhost:\d+\/test-param\/1234$/) },
  });
});

test('sends component tracking spans when `trackComponents` is enabled', async ({ page }) => {
  // Nuxt 5 disables the Options API by default (nuxt/nuxt#35791), which turns `app.mixin()` into a
  // no-op, and that mixin is where the SDK creates every UI span. Flips to passing once component
  // tracking works without it.
  test.fail(true, 'Vue tracing is registered through app.mixin(), which needs the Options API');

  const spansPromise = collectStreamedSpans('nuxt-5', spans =>
    spans.some(span => span.name === '/client-error' && span.is_segment && getSpanOp(span) === 'pageload'),
  );

  await page.goto(`/client-error`);

  const spans = await spansPromise;
  const errorButtonSpan = spans.find(span => span.name === 'Vue <ErrorButton>');

  expect(errorButtonSpan).toMatchObject({
    name: 'Vue <ErrorButton>',
    is_segment: false,
    parent_span_id: expect.stringMatching(/[a-f0-9]{16}/),
    span_id: expect.stringMatching(/[a-f0-9]{16}/),
    trace_id: expect.stringMatching(/[a-f0-9]{32}/),
    start_timestamp: expect.any(Number),
    end_timestamp: expect.any(Number),
    attributes: expect.objectContaining({
      'sentry.op': { type: 'string', value: 'ui.mount' },
      'sentry.origin': { type: 'string', value: 'auto.ui.vue' },
    }),
  });
});

test('sends an application render span and a root component span on pageload', async ({ page }) => {
  // Same root cause as above: no Options API, no `app.mixin()`, no UI spans. Flips to passing once
  // the root spans stop depending on the mixin.
  test.fail(true, 'Vue tracing is registered through app.mixin(), which needs the Options API');

  const spansPromise = collectStreamedSpans('nuxt-5', spans =>
    spans.some(span => span.name === '/client-error' && span.is_segment && getSpanOp(span) === 'pageload'),
  );

  await page.goto(`/client-error`);

  const spans = await spansPromise;
  const uiSpans = spans.filter(span => span.attributes['sentry.origin']?.value === 'auto.ui.vue');

  const applicationRenderSpans = uiSpans.filter(span => span.name === 'Application Render');
  expect(applicationRenderSpans).toHaveLength(1);
  expect(applicationRenderSpans[0]).toMatchObject({
    name: 'Application Render',
    is_segment: false,
    parent_span_id: expect.stringMatching(/[a-f0-9]{16}/),
    span_id: expect.stringMatching(/[a-f0-9]{16}/),
    trace_id: expect.stringMatching(/[a-f0-9]{32}/),
    start_timestamp: expect.any(Number),
    end_timestamp: expect.any(Number),
    attributes: expect.objectContaining({
      'sentry.op': { type: 'string', value: 'ui.render' },
      'sentry.origin': { type: 'string', value: 'auto.ui.vue' },
    }),
  });

  const rootComponentSpans = uiSpans.filter(span => span.name === 'Vue <Root>');
  expect(rootComponentSpans).toHaveLength(1);
  expect(rootComponentSpans[0]).toMatchObject({
    name: 'Vue <Root>',
    is_segment: false,
    parent_span_id: expect.stringMatching(/[a-f0-9]{16}/),
    span_id: expect.stringMatching(/[a-f0-9]{16}/),
    trace_id: expect.stringMatching(/[a-f0-9]{32}/),
    start_timestamp: expect.any(Number),
    end_timestamp: expect.any(Number),
    attributes: expect.objectContaining({
      'sentry.op': { type: 'string', value: 'ui.mount' },
      'sentry.origin': { type: 'string', value: 'auto.ui.vue' },
    }),
  });
});
