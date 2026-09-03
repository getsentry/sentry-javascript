import { expect, test } from '@playwright/test';
import { getSpanOp, waitForStreamedSpan } from '@sentry-internal/test-utils';

test('sends a server root span on pageload', async ({ page }) => {
  const serverSpanPromise = waitForStreamedSpan('nuxt-3', span => {
    return span.is_segment && span.name.includes('GET /test-param/');
  });

  await page.goto('/test-param/1234');

  const serverSpan = await serverSpanPromise;

  expect(getSpanOp(serverSpan)).toBe('http.server');
  expect(serverSpan.attributes['sentry.origin']?.value).toBe('auto.http.http_server');
});

test('does not send spans for build asset folder "_nuxt"', async ({ page }) => {
  let buildAssetFolderOccurred = false;

  waitForStreamedSpan('nuxt-3', span => {
    if (span.is_segment && /^GET \/_nuxt\//.test(span.name)) {
      buildAssetFolderOccurred = true;
    }
    return false; // expects to return a boolean (but not relevant here)
  });

  const serverSpanPromise = waitForStreamedSpan('nuxt-3', span => {
    return span.is_segment && span.name.includes('GET /test-param/');
  });

  await page.goto('/test-param/1234');

  const serverSpan = await serverSpanPromise;

  expect(buildAssetFolderOccurred).toBe(false);

  expect(serverSpan.name).toBe('GET /test-param/:param()');
  expect(serverSpan.attributes['sentry.segment.name.source']?.value).toBe('route');
});

test('extracts HTTP request headers as span attributes', async ({ baseURL }) => {
  const serverSpanPromise = waitForStreamedSpan('nuxt-3', span => {
    return span.is_segment && span.name.includes('GET /api/test-param/');
  });

  await fetch(`${baseURL}/api/test-param/headers-test`, {
    headers: {
      'User-Agent': 'Custom-Nuxt-Agent/3.0',
      'Content-Type': 'application/json',
      'X-Nuxt-Test': 'nuxt-header-value',
      Accept: 'application/json, text/html',
      'X-Framework': 'Nuxt',
      'X-Request-ID': 'nuxt-456',
    },
  });

  const serverSpan = await serverSpanPromise;

  expect(serverSpan.attributes).toMatchObject({
    'http.request.header.user_agent': { type: 'string', value: 'Custom-Nuxt-Agent/3.0' },
    'http.request.header.content_type': { type: 'string', value: 'application/json' },
    'http.request.header.x_nuxt_test': { type: 'string', value: 'nuxt-header-value' },
    'http.request.header.accept': { type: 'string', value: 'application/json, text/html' },
    'http.request.header.x_framework': { type: 'string', value: 'Nuxt' },
    'http.request.header.x_request_id': { type: 'string', value: 'nuxt-456' },
  });
});
