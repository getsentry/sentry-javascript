import { expect, test } from '@playwright/test';
import { collectStreamedSpansUntilSegment, getSpanOp, waitForStreamedSpan } from '@sentry-internal/test-utils';

test('sends a server root span on pageload', async ({ page }) => {
  const serverSpanPromise = waitForStreamedSpan('nuxt-5', span => {
    return span.is_segment && span.name.includes('GET /test-param/');
  });

  await page.goto('/test-param/1234');

  const serverSpan = await serverSpanPromise;

  expect(getSpanOp(serverSpan)).toBe('http.server');
  expect(serverSpan.attributes['sentry.origin']?.value).toBe('auto.http.http_server');
});

test('does not send spans for build asset folder "_nuxt"', async ({ page }) => {
  let buildAssetFolderOccurred = false;

  waitForStreamedSpan('nuxt-5', span => {
    if (span.is_segment && /^GET \/_nuxt\//.test(span.name)) {
      buildAssetFolderOccurred = true;
    }
    return false; // expects to return a boolean (but not relevant here)
  });

  const serverSpanPromise = waitForStreamedSpan('nuxt-5', span => {
    return span.is_segment && span.name.includes('GET /test-param/');
  });

  await page.goto('/test-param/1234');

  const serverSpan = await serverSpanPromise;

  expect(buildAssetFolderOccurred).toBe(false);

  expect(serverSpan.name).toBe('GET /test-param/:param()');
  expect(serverSpan.attributes['sentry.segment.name.source']?.value).toBe('route');
});

// TODO: Make test work with Nuxt 5
test.skip('captures server API calls made with Nitro $fetch', async ({ page }) => {
  const spansPromise = collectStreamedSpansUntilSegment(
    'nuxt-5',
    span => span.attributes['url.path']?.value === '/api/nitro-fetch',
  );

  await page.goto(`/fetch-server-routes`);
  await page.getByText('Fetch Nitro $fetch', { exact: true }).click();

  const spans = await spansPromise;

  const httpServerSpan = spans.find(
    span => span.is_segment && span.attributes['url.path']?.value === '/api/nitro-fetch',
  );
  const httpClientSpan = spans.find(
    span => span.trace_id === httpServerSpan?.trace_id && span.attributes['url.full']?.value === 'https://example.com/',
  );

  expect(getSpanOp(httpServerSpan!)).toEqual('http.server');

  expect(httpClientSpan?.parent_span_id).toEqual(httpServerSpan?.span_id);
  expect(getSpanOp(httpClientSpan!)).toEqual('http.client');
});
