import { expect, test } from '@playwright/test';
import { waitForRootSpan } from '@sentry-internal/test-utils';

test('App router transactions should be attached to the pageload request span', async ({ page }) => {
  const serverRootSpanPromise = waitForRootSpan('nextjs-16', async rootSpan => {
    return rootSpan.name === 'GET /pageload-tracing';
  });

  const pageloadRootSpanPromise = waitForRootSpan('nextjs-16', async rootSpan => {
    return rootSpan.name === '/pageload-tracing';
  });

  await page.goto(`/pageload-tracing`);

  const [serverRootSpan, pageloadRootSpan] = await Promise.all([serverRootSpanPromise, pageloadRootSpanPromise]);

  expect(pageloadRootSpan.traceId).toBeTruthy();
  expect(serverRootSpan.traceId).toBe(pageloadRootSpan.traceId);
});

test('extracts HTTP request headers as span attributes', async ({ baseURL }) => {
  const serverRootSpanPromise = waitForRootSpan('nextjs-16', async rootSpan => {
    return rootSpan.name === 'GET /pageload-tracing';
  });

  await fetch(`${baseURL}/pageload-tracing`, {
    headers: {
      'User-Agent': 'Custom-NextJS-Agent/15.0',
      'Content-Type': 'text/html',
      'X-NextJS-Test': 'nextjs-header-value',
      Accept: 'text/html, application/xhtml+xml',
      'X-Framework': 'Next.js',
      'X-Request-ID': 'nextjs-789',
    },
  });

  const serverRootSpan = await serverRootSpanPromise;

  expect(serverRootSpan.attributes).toEqual(
    expect.objectContaining({
      'http.request.header.user_agent': 'Custom-NextJS-Agent/15.0',
      'http.request.header.content_type': 'text/html',
      'http.request.header.x_nextjs_test': 'nextjs-header-value',
      'http.request.header.accept': 'text/html, application/xhtml+xml',
      'http.request.header.x_framework': 'Next.js',
      'http.request.header.x_request_id': 'nextjs-789',
    }),
  );
});
