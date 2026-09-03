import { expect, test } from '@playwright/test';
import { getSpanOp, waitForStreamedSpan } from '@sentry-internal/test-utils';

test('App router spans should be attached to the pageload request span', async ({ page }) => {
  const serverSpanPromise = waitForStreamedSpan('nextjs-15', span => {
    return span.name === 'GET /pageload-tracing' && span.is_segment;
  });

  const pageloadSpanPromise = waitForStreamedSpan('nextjs-15', span => {
    return span.name === '/pageload-tracing' && getSpanOp(span) === 'pageload' && span.is_segment;
  });

  await page.goto(`/pageload-tracing`);

  const [serverSpan, pageloadSpan] = await Promise.all([serverSpanPromise, pageloadSpanPromise]);

  expect(pageloadSpan.trace_id).toBeTruthy();
  expect(serverSpan.trace_id).toBe(pageloadSpan.trace_id);
});

test('extracts HTTP request headers as span attributes', async ({ baseURL }) => {
  const serverSpanPromise = waitForStreamedSpan('nextjs-15', span => {
    return (
      span.name === 'GET /pageload-tracing' &&
      span.is_segment &&
      span.attributes['http.request.header.x_request_id']?.value === 'nextjs-789'
    );
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

  const serverSpan = await serverSpanPromise;

  expect(serverSpan.attributes).toMatchObject({
    'http.request.header.user_agent': { value: 'Custom-NextJS-Agent/15.0', type: 'string' },
    'http.request.header.content_type': { value: 'text/html', type: 'string' },
    'http.request.header.x_nextjs_test': { value: 'nextjs-header-value', type: 'string' },
    'http.request.header.accept': { value: 'text/html, application/xhtml+xml', type: 'string' },
    'http.request.header.x_framework': { value: 'Next.js', type: 'string' },
    'http.request.header.x_request_id': { value: 'nextjs-789', type: 'string' },
  });
});
