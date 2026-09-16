import { expect, test } from '@playwright/test';
import { collectStreamedSpans, getSpanOp, waitForStreamedSpan } from '@sentry-internal/test-utils';

test('sends a server root span on pageload', async ({ page }) => {
  const serverSpanPromise = waitForStreamedSpan('nuxt-4', span => {
    return span.is_segment && span.name.includes('GET /test-param/');
  });

  await page.goto('/test-param/1234');

  const serverSpan = await serverSpanPromise;

  expect(getSpanOp(serverSpan)).toBe('http.server');
  expect(serverSpan.attributes['sentry.origin']?.value).toBe('auto.http.http_server');
});

test('does not send spans for build asset folder "_nuxt"', async ({ page }) => {
  let buildAssetFolderOccurred = false;

  waitForStreamedSpan('nuxt-4', span => {
    if (span.is_segment && /^GET \/_nuxt\//.test(span.name)) {
      buildAssetFolderOccurred = true;
    }
    return false; // expects to return a boolean (but not relevant here)
  });

  const serverSpanPromise = waitForStreamedSpan('nuxt-4', span => {
    return span.is_segment && span.name.includes('GET /test-param/');
  });

  await page.goto('/test-param/1234');

  const serverSpan = await serverSpanPromise;

  expect(buildAssetFolderOccurred).toBe(false);

  expect(serverSpan.name).toBe('GET /test-param/:param()');
  expect(serverSpan.attributes['sentry.segment.name.source']?.value).toBe('route');
});

test('captures server API calls made with Nitro $fetch', async ({ page }) => {
  // The server-side http.client span can flush before its segment. Accumulate until both arrived.
  const spansPromise = collectStreamedSpans('nuxt-4', spans => {
    return (
      spans.some(span => span.is_segment && span.attributes['url.path']?.value === '/api/nitro-fetch') &&
      spans.some(
        span => getSpanOp(span) === 'http.client' && `${span.attributes['url.full']?.value}`.includes('example.com'),
      )
    );
  });

  await page.goto(`/fetch-server-routes`);
  await page.getByText('Fetch Nitro $fetch', { exact: true }).click();

  const spans = await spansPromise;

  const serverSegmentSpan = spans.find(
    span => span.is_segment && span.attributes['url.path']?.value === '/api/nitro-fetch',
  );
  const httpClientSpan = spans.find(
    span => getSpanOp(span) === 'http.client' && `${span.attributes['url.full']?.value}`.includes('example.com'),
  );

  expect(serverSegmentSpan).toBeDefined();
  expect(getSpanOp(serverSegmentSpan!)).toBe('http.server');

  expect(httpClientSpan).toBeDefined();
  expect(httpClientSpan?.name).toBe('GET example.com');
  expect(httpClientSpan?.trace_id).toBe(serverSegmentSpan?.trace_id);
  expect(httpClientSpan?.parent_span_id).toBe(serverSegmentSpan?.span_id);
});
