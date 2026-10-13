import { expect, test } from '@playwright/test';
import { getSpanOp, waitForStreamedSpan } from '@sentry-internal/test-utils';

test('App router spans should be attached to the pageload request span', async ({ page }) => {
  const serverSpanPromise = waitForStreamedSpan('nextjs-16', span => {
    return span.name === 'GET /pageload-tracing' && span.is_segment;
  });

  const pageloadSpanPromise = waitForStreamedSpan('nextjs-16', span => {
    return span.name === '/pageload-tracing' && getSpanOp(span) === 'pageload' && span.is_segment;
  });

  await page.goto(`/pageload-tracing`);

  const [serverSpan, pageloadSpan] = await Promise.all([serverSpanPromise, pageloadSpanPromise]);

  expect(pageloadSpan.trace_id).toBeTruthy();
  expect(serverSpan.trace_id).toBe(pageloadSpan.trace_id);
});

test('extracts HTTP request headers as span attributes', async ({ baseURL }) => {
  const serverSpanPromise = waitForStreamedSpan('nextjs-16', span => {
    const requestId = span.attributes['http.request.header.x-request-id'];
    return (
      span.name === 'GET /pageload-tracing' &&
      span.is_segment &&
      requestId?.type === 'array' &&
      requestId.value[0] === 'nextjs-789'
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
    'http.request.header.user-agent': { value: ['Custom-NextJS-Agent/15.0'], type: 'array' },
    'http.request.header.content-type': { value: ['text/html'], type: 'array' },
    'http.request.header.x-nextjs-test': { value: ['nextjs-header-value'], type: 'array' },
    'http.request.header.accept': { value: ['text/html, application/xhtml+xml'], type: 'array' },
    'http.request.header.x-framework': { value: ['Next.js'], type: 'array' },
    'http.request.header.x-request-id': { value: ['nextjs-789'], type: 'array' },
  });
});
