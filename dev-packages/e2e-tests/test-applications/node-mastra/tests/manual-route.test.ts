import { expect, test } from '@playwright/test';
import { collectStreamedSpans, getSpanOp, SerializedStreamedSpan } from '@sentry-internal/test-utils';

const APP = 'node-mastra';

const attrValue = (span: SerializedStreamedSpan, key: string): unknown => span.attributes?.[key]?.value;

// A plain custom route registered on the Mastra (Hono) server — see the
// `/manual-route` handler in src/mastra/index.ts. This verifies that ordinary HTTP
// requests to app-registered routes are wrapped in an `http.server` span with the
// expected attributes, independent of the agent / AI instrumentation. Runs in both
// the prod (`mastra start`) and dev (`mastra dev`) variants.
const isManualRouteServerSpan = (span: SerializedStreamedSpan): boolean =>
  getSpanOp(span) === 'http.server' && String(attrValue(span, 'url.full') ?? '').includes('/manual-route');

test('wraps a custom Mastra route in an http.server span with correct attributes', async ({ baseURL }) => {
  const spansPromise = collectStreamedSpans(APP, spansOfTrace => spansOfTrace.some(isManualRouteServerSpan));

  const res = await fetch(`${baseURL}/manual-route`, { method: 'GET' });
  expect(res.status).toBe(200);
  await res.json();

  const spans = await spansPromise;
  const serverSpan = spans.find(isManualRouteServerSpan);

  expect(serverSpan).toBeDefined();
  expect(getSpanOp(serverSpan!)).toBe('http.server');
  expect(serverSpan!.name).toBe('GET');
  expect(attrValue(serverSpan!, 'http.request.method')).toBe('GET');
  expect(attrValue(serverSpan!, 'http.response.status_code')).toBe(200);
  expect(String(attrValue(serverSpan!, 'url.full') ?? '')).toContain('/manual-route');

  // Codifies current behavior: the transaction name is derived from the URL path,
  // not a route pattern. Mastra serves custom routes through Hono, which Sentry
  // does not route-instrument the way it does Express — so there is no `http.route`
  // attribute and the name source is `url` (an Express route would give `route`).
  expect(attrValue(serverSpan!, 'sentry.segment.name.source')).toBe('url');
  expect(attrValue(serverSpan!, 'http.route')).toBeUndefined();
});
