import { expect, test } from '@playwright/test';
import { collectStreamedSpans, getSpanOp, SerializedStreamedSpan } from '@sentry-internal/test-utils';

const APP = 'node-mastra';

// In `mastra dev`, Mastra inlines its Hono-based server into the dev bundle, so the `--import`
// orchestrion hook cannot transform Hono and the request span is not route-enriched: its name is the
// bare method and it carries no `http.route`/route name source. In prod (`mastra build`/`start`) Hono
// is external and fully instrumented, so the span is named after the matched route.
const IS_DEV = process.env.TEST_ENV === 'development';

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
  const serverSpan = spans.find(isManualRouteServerSpan)!;

  expect(serverSpan).toBeDefined();
  expect(getSpanOp(serverSpan)).toBe('http.server');
  expect(attrValue(serverSpan, 'http.request.method')).toBe('GET');
  expect(attrValue(serverSpan, 'http.response.status_code')).toBe(200);
  expect(String(attrValue(serverSpan, 'url.full') ?? '')).toContain('/manual-route');
  expect(serverSpan.name).toBe(IS_DEV ? 'GET' : 'GET /manual-route');

  if (!IS_DEV) {
    expect(attrValue(serverSpan, 'sentry.segment.name.source')).toBe('route');
    expect(attrValue(serverSpan, 'http.route')).toBe('/manual-route');
  }
});
