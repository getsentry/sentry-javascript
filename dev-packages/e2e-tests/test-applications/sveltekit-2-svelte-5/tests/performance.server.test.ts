import { expect, test } from '@playwright/test';
import { collectStreamedSpansUntilSegment } from '@sentry-internal/test-utils';

test('server pageload request span has nested request span for sub request', async ({ page }) => {
  const serverTraceSpansPromise = collectStreamedSpansUntilSegment('sveltekit-2-svelte-5', 'GET /server-load-fetch');

  await page.goto('/server-load-fetch');

  const serverTraceSpans = await serverTraceSpansPromise;
  const serverSpan = serverTraceSpans.find(span => span.name === 'GET /server-load-fetch' && span.is_segment)!;

  expect(serverSpan.attributes).toMatchObject({
    'sentry.op': { value: 'http.server', type: 'string' },
    'sentry.origin': { value: 'auto.http.sveltekit', type: 'string' },
    'sentry.segment.name.source': { value: 'route', type: 'string' },
    'http.request.method': { value: 'GET', type: 'string' },
    'url.path': { value: '/server-load-fetch', type: 'string' },
    'http.request.header.accept': { value: expect.any(String), type: 'string' },
    'http.request.header.user-agent': { value: expect.any(String), type: 'string' },
  });

  expect(serverTraceSpans).toEqual(
    expect.arrayContaining([
      // load span where the server load function initiates the sub request:
      expect.objectContaining({
        name: 'load',
        is_segment: false,
        attributes: expect.objectContaining({
          'sentry.op': { value: 'function', type: 'string' },
          'code.function.name': { value: 'load', type: 'string' },
          'http.route': { value: '/server-load-fetch', type: 'string' },
          'sentry.description': { value: '/server-load-fetch', type: 'string' },
        }),
      }),
      // sub request span:
      expect.objectContaining({
        name: 'GET /api/users',
        is_segment: false,
        attributes: expect.objectContaining({ 'sentry.op': { value: 'http.server', type: 'string' } }),
      }),
    ]),
  );
});
