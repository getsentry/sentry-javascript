import { expect, test } from '@playwright/test';
import type { SerializedStreamedSpan } from '@sentry-internal/test-utils';
import { getSpanOp, waitForStreamedSpans } from '@sentry-internal/test-utils';

test('does not instrument the internal `$fetch` of a server-rendered page as its own request', async ({ request }) => {
  // One listener, so it gets every span that the proxy received before the barrier span.
  const spans: SerializedStreamedSpan[] = [];
  const barrierPromise = waitForStreamedSpans('nuxt-5', batch => {
    spans.push(...batch);
    return batch.some(span => span.is_segment && span.attributes['url.path']?.value === '/api/test-param/barrier');
  });

  const response = await request.get('/internal-fetch');
  expect(await response.text()).toContain('Param: internal!');
  await request.get('/api/test-param/barrier');
  await barrierPromise;

  const serverSpanPaths = spans
    .filter(span => getSpanOp(span) === 'http.server')
    .map(span => span.attributes['url.path']?.value);
  expect(serverSpanPaths).toContain('/internal-fetch');
  expect(serverSpanPaths).not.toContain('/api/test-param/internal');

  const rootSpan = spans.find(span => span.is_segment && span.attributes['url.path']?.value === '/internal-fetch');
  expect(rootSpan?.attributes['sentry.sdk.name']).toEqual({ type: 'string', value: 'sentry.javascript.nuxt' });
});
