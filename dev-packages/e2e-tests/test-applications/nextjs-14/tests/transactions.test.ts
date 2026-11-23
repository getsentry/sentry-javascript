import { expect, test } from '@playwright/test';
import { collectStreamedSpansUntilSegment, getSpanOp, waitForStreamedSpan } from '@sentry-internal/test-utils';
import { isDevMode } from './isDevMode';

test('Sends a pageload span', async ({ page }) => {
  const pageloadSpanPromise = waitForStreamedSpan('nextjs-14', span => {
    return getSpanOp(span) === 'pageload' && span.name === '/' && span.is_segment;
  });

  await page.goto('/');

  const span = await pageloadSpanPromise;

  // The server sends the trace in a `Server-Timing` header, except with a document a shared cache may store. In
  // production the requested page is static, so only dev mode, which renders it per request, connects the pageload.
  if (isDevMode) {
    expect(span.parent_span_id).toEqual(expect.any(String));
  } else {
    expect(span.parent_span_id).toBeUndefined();
  }

  expect(span.span_id).toEqual(expect.stringMatching(/[a-f0-9]{16}/));
  expect(span.trace_id).toEqual(expect.stringMatching(/[a-f0-9]{32}/));
  expect(span.status).toBe('ok');
  expect(span.attributes).toMatchObject({
    'sentry.op': { value: 'pageload', type: 'string' },
    'sentry.origin': { value: 'auto.pageload.nextjs.app_router_instrumentation', type: 'string' },
    'sentry.segment.name.source': { value: 'route', type: 'string' },
    'url.path': { value: '/', type: 'string' },
    'url.template': { value: '/', type: 'string' },
    'react.version': { value: expect.any(String), type: 'string' },
    'user_agent.original': { value: expect.any(String), type: 'string' },
  });
  expect(String(span.attributes['url.full']?.value)).toMatch(/^https?:\/\/localhost:\d+\/$/);
});

test('Will not include spans with faulty timestamps for slow loading pages', async ({ page }) => {
  test.slow();

  const spansPromise = collectStreamedSpansUntilSegment(
    'nextjs-14',
    span => span.name === '/very-slow-component' && getSpanOp(span) === 'pageload',
  );

  await page.goto('/very-slow-component', { timeout: 11000 });

  const spans = await spansPromise;

  expect(spans.filter(span => span.end_timestamp < span.start_timestamp)).toHaveLength(0);
});
