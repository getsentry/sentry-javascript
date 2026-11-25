import { URL_FULL } from '@sentry/conventions/attributes';
import { expect, test } from '@playwright/test';
import {
  collectStreamedSpansUntilSegment,
  getSpanOp,
  waitForStreamedSpan,
  waitForStreamedSpans,
} from '@sentry-internal/test-utils';
import { isViteServer } from './isViteServer';

test('sends a pageload root span with a parameterized URL', async ({ page }) => {
  const pageloadSpanPromise = waitForStreamedSpan('nuxt-4', span => {
    return (
      getSpanOp(span) === 'pageload' && span.is_segment && span.attributes['url.path']?.value === '/test-param/1234'
    );
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
  const navigationSpanPromise = waitForStreamedSpan('nuxt-4', span => {
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

test('sends an application render span and a root component span on pageload', async ({ page }) => {
  const spansPromise = collectStreamedSpansUntilSegment(
    'nuxt-4',
    span => span.name === '/client-error' && getSpanOp(span) === 'pageload',
  );

  await page.goto(`/client-error`);

  const spans = await spansPromise;
  const uiSpans = spans.filter(span => span.attributes['sentry.origin']?.value === 'auto.ui.vue');

  const applicationRenderSpans = uiSpans.filter(
    span => span.name === 'Root' && span.attributes['sentry.op']?.value === 'ui.render',
  );
  expect(applicationRenderSpans).toHaveLength(1);
  expect(applicationRenderSpans[0]).toMatchObject({
    name: 'Root',
    is_segment: false,
    parent_span_id: expect.stringMatching(/[a-f0-9]{16}/),
    span_id: expect.stringMatching(/[a-f0-9]{16}/),
    trace_id: expect.stringMatching(/[a-f0-9]{32}/),
    start_timestamp: expect.any(Number),
    end_timestamp: expect.any(Number),
    attributes: expect.objectContaining({
      'sentry.op': { type: 'string', value: 'ui.render' },
      'sentry.origin': { type: 'string', value: 'auto.ui.vue' },
      'ui.component_name': { type: 'string', value: 'Root' },
      'sentry.description': { type: 'string', value: 'Application Render' },
    }),
  });

  const rootComponentSpans = uiSpans.filter(
    span => span.name === 'Root' && span.attributes['sentry.op']?.value === 'ui.mount',
  );
  expect(rootComponentSpans).toHaveLength(1);
  expect(rootComponentSpans[0]).toMatchObject({
    name: 'Root',
    is_segment: false,
    parent_span_id: expect.stringMatching(/[a-f0-9]{16}/),
    span_id: expect.stringMatching(/[a-f0-9]{16}/),
    trace_id: expect.stringMatching(/[a-f0-9]{32}/),
    start_timestamp: expect.any(Number),
    end_timestamp: expect.any(Number),
    attributes: expect.objectContaining({
      'sentry.op': { type: 'string', value: 'ui.mount' },
      'sentry.origin': { type: 'string', value: 'auto.ui.vue' },
      'ui.component_name': { type: 'string', value: 'Root' },
      'sentry.description': { type: 'string', value: 'Vue <Root>' },
    }),
  });
});

test('sends component tracking spans when `trackComponents` is enabled', async ({ page }) => {
  const spansPromise = collectStreamedSpansUntilSegment(
    'nuxt-4',
    span => span.name === '/client-error' && getSpanOp(span) === 'pageload',
  );

  await page.goto(`/client-error`);

  const spans = await spansPromise;
  const errorButtonSpan = spans.find(span => span.name === 'ErrorButton');

  expect(errorButtonSpan).toMatchObject({
    name: 'ErrorButton',
    is_segment: false,
    parent_span_id: expect.stringMatching(/[a-f0-9]{16}/),
    span_id: expect.stringMatching(/[a-f0-9]{16}/),
    trace_id: expect.stringMatching(/[a-f0-9]{32}/),
    start_timestamp: expect.any(Number),
    end_timestamp: expect.any(Number),
    attributes: expect.objectContaining({
      'sentry.op': { type: 'string', value: 'ui.mount' },
      'sentry.origin': { type: 'string', value: 'auto.ui.vue' },
      'ui.component_name': { type: 'string', value: 'ErrorButton' },
      'sentry.description': { type: 'string', value: 'Vue <ErrorButton>' },
    }),
  });
});

// Nuxt fetches its build manifest in the browser, for example to find prerendered pages. A span for it can prolong the pageload.
test('does not send a span for the build manifest request', async ({ page }) => {
  test.skip(isViteServer, 'The Vite server builds no app manifest when it prerenders no routes');

  const httpClientUrls: string[] = [];
  const dataRequestSpanPromise = waitForStreamedSpans('nuxt-4', spans => {
    httpClientUrls.push(
      ...spans.filter(span => getSpanOp(span) === 'http.client').map(span => `${span.attributes[URL_FULL]?.value}`),
    );
    return httpClientUrls.some(url => url.includes('/api/test-param/build-manifest'));
  });
  const manifestResponsePromise = page.waitForResponse(response => response.url().includes('/_nuxt/builds/meta/'));

  await page.goto('/test-param/build-manifest');
  // Only fetches the manifest if Nuxt has not fetched it already.
  await page.getByText('Fetch App Manifest').click();
  await manifestResponsePromise;
  // A manifest span would arrive before the span of this later request.
  await page.getByText('Fetch Server Data').click();
  await dataRequestSpanPromise;

  expect(httpClientUrls).not.toContainEqual(expect.stringContaining('/_nuxt/builds/'));
});
