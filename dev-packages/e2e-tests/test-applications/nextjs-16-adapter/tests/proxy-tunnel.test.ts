import { expect, test } from '@playwright/test';
import { HTTP_TARGET } from '@sentry/conventions/attributes';
import { waitForStreamedSpan, waitForStreamedSpans } from '@sentry-internal/test-utils';
import { getTunnelPath } from '@sentry/nextjs';

test('drops the `Next.request` root span of tunnel requests through the proxy', async ({ request }) => {
  // The callback never returns true, so this promise is deliberately left unsettled. The assertions read the array.
  const segmentSpans: Awaited<ReturnType<typeof waitForStreamedSpan>>[] = [];
  void waitForStreamedSpans('nextjs-16-adapter', spans => {
    segmentSpans.push(...spans.filter(span => span.is_segment));
    return false;
  });

  const proxyOkSpanPromise = waitForStreamedSpan('nextjs-16-adapter', span => {
    return (
      span.is_segment &&
      span.attributes['next.span_type']?.value === 'Next.request' &&
      span.attributes[HTTP_TARGET]?.value === '/api/proxy-ok'
    );
  });

  // The SDK answers only a POST before the proxy. A GET reaches the proxy, like a tunnel request on Vercel, where the
  // proxy runs outside of the server the SDK hooks into.
  const tunnelPath = getTunnelPath(process.env.E2E_TEST_DSN);
  const tunnelResponse = await request.get(tunnelPath!);
  expect(tunnelResponse.headers()['x-middleware-next']).toBe('1');

  await request.get('/api/proxy-ok');
  await proxyOkSpanPromise;

  expect(segmentSpans.filter(span => String(span.attributes[HTTP_TARGET]?.value).startsWith(tunnelPath!))).toEqual([]);
});
