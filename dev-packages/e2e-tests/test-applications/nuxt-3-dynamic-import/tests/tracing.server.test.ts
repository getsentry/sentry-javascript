import { expect, test } from '@playwright/test';
import { getSpanOp, waitForStreamedSpan } from '@sentry-internal/test-utils';

test('sends a server root span on pageload', async ({ page }) => {
  const serverSpanPromise = waitForStreamedSpan('nuxt-3-dynamic-import', span => {
    return span.is_segment && span.name.includes('GET /test-param/');
  });

  await page.goto('/test-param/1234');

  const serverSpan = await serverSpanPromise;

  expect(getSpanOp(serverSpan)).toBe('http.server');
  expect(serverSpan.attributes['sentry.origin']?.value).toBe('auto.http.http_server');
});

test('does not send spans for build asset folder "_nuxt"', async ({ page }) => {
  let buildAssetFolderOccurred = false;

  waitForStreamedSpan('nuxt-3-dynamic-import', span => {
    if (span.is_segment && /^GET \/_nuxt\//.test(span.name)) {
      buildAssetFolderOccurred = true;
    }
    return false; // expects to return a boolean (but not relevant here)
  });

  const serverSpanPromise = waitForStreamedSpan('nuxt-3-dynamic-import', span => {
    return span.is_segment && span.name.includes('GET /test-param/');
  });

  await page.goto('/test-param/1234');

  const serverSpan = await serverSpanPromise;

  expect(buildAssetFolderOccurred).toBe(false);

  expect(serverSpan.name).toBe('GET /test-param/:param()');
  expect(serverSpan.attributes['sentry.segment.name.source']?.value).toBe('route');
});
