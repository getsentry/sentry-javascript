import { expect, test } from '@playwright/test';
import { getRuntime, getSpanOp, waitForError, waitForStreamedSpan } from '@sentry-internal/test-utils';
import { isTurbopackDevMode } from './isDevMode';
import { isVinext } from './isVinext';

// The SDK wraps server components only in webpack builds. Turbopack and vinext builds report errors through
// `onRequestError`.

test.skip(getRuntime() === 'cloudflare', 'OpenNext runs no edge runtime pages on Workers, they return a 500');

test('Should record exceptions for faulty edge server components', async ({ page }) => {
  test.skip(
    isTurbopackDevMode,
    'With `experimental.sri`, the Next.js Turbopack dev server fails to render edge pages: it cannot find `subresource-integrity-manifest.js`',
  );

  const errorEventPromise = waitForError('nextjs-16', errorEvent => {
    return errorEvent?.exception?.values?.[0]?.value === 'Edge Server Component Error';
  });

  await page.goto('/edge-server-components/error');

  const errorEvent = await errorEventPromise;

  // Assert that isolation scope works properly
  expect(errorEvent.tags?.['my-isolated-tag']).toBe(true);
  expect(errorEvent.tags?.['my-global-scope-isolated-tag']).not.toBeDefined();

  if (errorEvent.tags?.turbopack || isVinext) {
    expect(errorEvent.transaction).toBe('GET /edge-server-components/error');
    expect(errorEvent.exception?.values?.[0]?.mechanism).toEqual({
      handled: false,
      type: 'auto.function.nextjs.on_request_error',
    });
  } else {
    expect(errorEvent.transaction).toBe('Page Server Component (/edge-server-components/error)');
    expect(errorEvent.exception?.values?.[0]?.mechanism).toEqual({
      handled: false,
      type: 'auto.function.nextjs.server_component',
    });
  }
});

test('Should record a span for edge server components', async ({ page }) => {
  const serverComponentSpanPromise = waitForStreamedSpan('nextjs-16', span => {
    return span.name === 'GET /edge-server-components' && span.is_segment;
  });

  await page.goto('/edge-server-components');

  const serverComponentSpan = await serverComponentSpanPromise;

  expect(getSpanOp(serverComponentSpan)).toBe('http.server');

  // Only the server component wrapper of webpack builds attaches the request headers on the edge runtime
  if (!serverComponentSpan.attributes['turbopack']) {
    expect(
      Object.keys(serverComponentSpan.attributes).filter(key => key.startsWith('http.request.header.')).length,
    ).toBeGreaterThan(0);
  }
});
