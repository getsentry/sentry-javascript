import { expect, test } from '@playwright/test';
import {
  collectStreamedSpansUntilSegment,
  getSpanOp,
  waitForStreamedSpan,
  waitForStreamedSpans,
} from '@sentry-internal/test-utils';

test('sends a pageload root span with a parameterized URL', async ({ page }) => {
  const pageloadSpanPromise = waitForStreamedSpan('nuxt-3', span => {
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

test('sends component tracking spans when `trackComponents` is enabled', async ({ page }) => {
  const spansPromise = collectStreamedSpansUntilSegment(
    'nuxt-3',
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

// Nuxt fetches its build manifest after hydration. A span for it would prolong the pageload.
test('does not send a span for the build manifest request', async ({ page }) => {
  const httpClientUrls: string[] = [];
  const dataRequestSpanPromise = waitForStreamedSpans('nuxt-3', spans => {
    httpClientUrls.push(
      ...spans.filter(span => getSpanOp(span) === 'http.client').map(span => `${span.attributes['url.full']?.value}`),
    );
    return httpClientUrls.some(url => url.includes('/api/test-param/build-manifest'));
  });
  const manifestResponsePromise = page.waitForResponse(response => response.url().includes('/_nuxt/builds/meta/'));

  await page.goto('/test-param/build-manifest');
  await manifestResponsePromise;
  // A manifest span would arrive before the span of this later request.
  await page.getByText('Fetch Server Data').click();
  await dataRequestSpanPromise;

  expect(httpClientUrls).not.toContainEqual(expect.stringContaining('/_nuxt/builds/'));
});
