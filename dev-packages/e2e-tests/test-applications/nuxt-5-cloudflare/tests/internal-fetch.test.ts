import { expect, test } from '@playwright/test';
import type { SerializedStreamedSpan } from '@sentry-internal/test-utils';
import { getSpanOp, waitForStreamedSpans } from '@sentry-internal/test-utils';

function getUrlPath(span: SerializedStreamedSpan): string | undefined {
  const attribute = span.attributes['url.path'];

  return attribute?.type === 'string' ? attribute.value : undefined;
}

test('does not instrument the internal `$fetch` of a server-rendered page as its own request', async ({ request }) => {
  // One listener, so it gets every span that the proxy received before the barrier span.
  const spans: SerializedStreamedSpan[] = [];
  const barrierPromise = waitForStreamedSpans('nuxt-5-cloudflare', batch => {
    spans.push(...batch);
    return batch.some(span => span.is_segment && getUrlPath(span) === '/api/anchor');
  });

  await request.get('/');
  await request.get('/api/anchor');
  await barrierPromise;

  const serverSpanPaths = spans.filter(span => getSpanOp(span) === 'http.server').map(getUrlPath);
  expect(serverSpanPaths).toContain('/');
  expect(serverSpanPaths).not.toContain('/api/internal');
});
