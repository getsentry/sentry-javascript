import { expect, test } from '@playwright/test';
import { collectStreamedSpans, getSpanOp, waitForStreamedSpan } from '@sentry-internal/test-utils';

test('server pageload request span has nested request span for sub request', async ({ page }) => {
  const serverTraceSpansPromise = collectStreamedSpans('sveltekit-2', spansOfTrace =>
    spansOfTrace.some(span => span.name === 'GET /server-load-fetch' && span.is_segment),
  );

  await page.goto('/server-load-fetch');

  const serverTraceSpans = await serverTraceSpansPromise;
  const serverSpan = serverTraceSpans.find(span => span.name === 'GET /server-load-fetch' && span.is_segment)!;

  expect(serverSpan.attributes).toMatchObject({
    'sentry.op': { value: 'http.server', type: 'string' },
    'sentry.origin': { value: 'auto.http.sveltekit', type: 'string' },
    'sentry.segment.name.source': { value: 'route', type: 'string' },
  });

  expect(serverTraceSpans).toEqual(
    expect.arrayContaining([
      // load span where the server load function initiates the sub request:
      expect.objectContaining({
        name: '/server-load-fetch',
        is_segment: false,
        attributes: expect.objectContaining({ 'sentry.op': { value: 'function', type: 'string' } }),
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

test('extracts HTTP request headers as span attributes', async ({ baseURL }) => {
  const serverSpanPromise = waitForStreamedSpan('sveltekit-2', span => {
    return span.name === 'GET /api/users' && getSpanOp(span) === 'http.server' && span.is_segment;
  });

  await fetch(`${baseURL}/api/users`, {
    headers: {
      'User-Agent': 'Custom-SvelteKit-Agent/1.0',
      'Content-Type': 'application/json',
      'X-Test-Header': 'sveltekit-test-value',
      Accept: 'application/json',
      'X-Framework': 'SvelteKit',
      'X-Request-ID': 'sveltekit-123',
    },
  });

  const serverSpan = await serverSpanPromise;

  expect(serverSpan.attributes).toMatchObject({
    'http.request.header.user_agent': { value: 'Custom-SvelteKit-Agent/1.0', type: 'string' },
    'http.request.header.content_type': { value: 'application/json', type: 'string' },
    'http.request.header.x_test_header': { value: 'sveltekit-test-value', type: 'string' },
    'http.request.header.accept': { value: 'application/json', type: 'string' },
    'http.request.header.x_framework': { value: 'SvelteKit', type: 'string' },
    'http.request.header.x_request_id': { value: 'sveltekit-123', type: 'string' },
  });
});
