import { expect, test } from '@playwright/test';
import { getSpanOp, waitForStreamedSpan } from '@sentry-internal/test-utils';

// Parametrization does not work in Nuxt 3.7 yet, so server segments keep a method-only name and
// have to be selected via their `url.path` attribute.

test('sends a server root span on pageload', async ({ page }) => {
  const serverSpanPromise = waitForStreamedSpan('nuxt-3-min', span => {
    return (
      span.is_segment && getSpanOp(span) === 'http.server' && span.attributes['url.path']?.value === '/test-param/1234'
    );
  });

  await page.goto('/test-param/1234');

  const serverSpan = await serverSpanPromise;

  expect(getSpanOp(serverSpan)).toBe('http.server');
  expect(serverSpan.attributes['sentry.origin']?.value).toBe('auto.http.http_server');
});

test('does not send spans for build asset folder "_nuxt"', async ({ page }) => {
  let buildAssetFolderOccurred = false;

  waitForStreamedSpan('nuxt-3-min', span => {
    if (span.is_segment && `${span.attributes['url.path']?.value}`.startsWith('/_nuxt/')) {
      buildAssetFolderOccurred = true;
    }
    return false; // expects to return a boolean (but not relevant here)
  });

  const serverSpanPromise = waitForStreamedSpan('nuxt-3-min', span => {
    return (
      span.is_segment && getSpanOp(span) === 'http.server' && span.attributes['url.path']?.value === '/test-param/1234'
    );
  });

  await page.goto('/test-param/1234');

  const serverSpan = await serverSpanPromise;

  expect(buildAssetFolderOccurred).toBe(false);

  expect(serverSpan.name).toBe('GET'); // method-only because the URL cannot be parametrized in Nuxt 3.7
  expect(serverSpan.attributes['sentry.segment.name.source']?.value).toBe('url');
});
