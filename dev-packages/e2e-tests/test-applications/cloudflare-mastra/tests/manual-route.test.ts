import { expect, test } from '@playwright/test';
import { collectStreamedSpans, getSpanOp, SerializedStreamedSpan } from '@sentry-internal/test-utils';

const APP = 'cloudflare-mastra';

const attrValue = (span: SerializedStreamedSpan, key: string): unknown => span.attributes?.[key]?.value;

// A plain route on the worker (see the `/manual-route` handler in src/index.ts). This
// verifies that ordinary HTTP requests are wrapped in an `http.server` span with the
// expected attributes, independent of the agent / AI instrumentation — and, unlike the
// agent tests, it needs no model call so it is a reliable signal on its own.
const isManualRouteServerSpan = (span: SerializedStreamedSpan): boolean =>
  getSpanOp(span) === 'http.server' && String(attrValue(span, 'url.full') ?? '').includes('/manual-route');

test('wraps a worker route in an http.server span with correct attributes', async ({ baseURL }) => {
  const spansPromise = collectStreamedSpans(APP, spansOfTrace => spansOfTrace.some(isManualRouteServerSpan));

  const res = await fetch(`${baseURL}/manual-route`, { method: 'GET' });
  expect(res.status).toBe(200);
  await res.json();

  const spans = await spansPromise;
  const serverSpan = spans.find(isManualRouteServerSpan);

  expect(serverSpan).toBeDefined();
  expect(getSpanOp(serverSpan!)).toBe('http.server');
  expect(serverSpan!.name).toBe('GET');
  expect(attrValue(serverSpan!, 'sentry.origin')).toBe('auto.http.cloudflare');
  expect(attrValue(serverSpan!, 'http.request.method')).toBe('GET');
  expect(attrValue(serverSpan!, 'http.response.status_code')).toBe(200);
  expect(String(attrValue(serverSpan!, 'url.full') ?? '')).toContain('/manual-route');

  // Codifies current behavior: the worker serves routes through its own `fetch`, which
  // Sentry does not route-instrument, so there is no `http.route` and the transaction
  // name is derived from the URL path (`url`), not a route pattern.
  expect(attrValue(serverSpan!, 'sentry.segment.name.source')).toBe('url');
  expect(attrValue(serverSpan!, 'http.route')).toBeUndefined();
});
