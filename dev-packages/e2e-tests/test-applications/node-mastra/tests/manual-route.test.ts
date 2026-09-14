import { expect, test } from '@playwright/test';
import { collectStreamedSpans, getSpanOp, SerializedStreamedSpan } from '@sentry-internal/test-utils';

const APP = 'node-mastra';

const attrValue = (span: SerializedStreamedSpan, key: string): unknown => span.attributes?.[key]?.value;

// Custom routes registered on the Mastra (Hono) server — see `src/mastra/index.ts`. These verify the
// Mastra integration's zero-config route naming: incoming requests get an `http.server` span named
// from the matched route *pattern* (name source `route`, `http.route` set), for both static and
// parametrized routes, with no app-level middleware. Runs in both the prod (`mastra start`) and dev
// (`mastra dev`) variants.
const serverSpanForUrl =
  (urlIncludes: string) =>
  (span: SerializedStreamedSpan): boolean =>
    getSpanOp(span) === 'http.server' && String(attrValue(span, 'url.full') ?? '').includes(urlIncludes);

test('names a static custom route from its route pattern', async ({ baseURL }) => {
  const spansPromise = collectStreamedSpans(APP, spansOfTrace => spansOfTrace.some(serverSpanForUrl('/manual-route')));

  const res = await fetch(`${baseURL}/manual-route`, { method: 'GET' });
  expect(res.status).toBe(200);
  await res.json();

  const serverSpan = (await spansPromise).find(serverSpanForUrl('/manual-route'));

  expect(serverSpan).toBeDefined();
  expect(getSpanOp(serverSpan!)).toBe('http.server');
  expect(attrValue(serverSpan!, 'http.request.method')).toBe('GET');
  expect(attrValue(serverSpan!, 'http.response.status_code')).toBe(200);

  // The Mastra integration upgrades the span from the raw URL to the route pattern: for a static
  // route these are identical, but the name source is `route` and `http.route` is set.
  expect(serverSpan!.name).toBe('GET /manual-route');
  expect(attrValue(serverSpan!, 'http.route')).toBe('/manual-route');
  expect(attrValue(serverSpan!, 'sentry.segment.name.source')).toBe('route');
});

test('names a parametrized custom route from its route pattern (low cardinality)', async ({ baseURL }) => {
  // Two different ids must collapse to the same `/echo/:id` transaction.
  for (const id of ['42', '99']) {
    const spansPromise = collectStreamedSpans(APP, spansOfTrace =>
      spansOfTrace.some(span => serverSpanForUrl(`/echo/${id}`)(span)),
    );

    const res = await fetch(`${baseURL}/echo/${id}`, { method: 'GET' });
    expect(res.status).toBe(200);
    await res.json();

    const serverSpan = (await spansPromise).find(serverSpanForUrl(`/echo/${id}`));

    expect(serverSpan).toBeDefined();
    // Name and route are the pattern, not the concrete URL (`/echo/42`).
    expect(serverSpan!.name).toBe('GET /echo/:id');
    expect(attrValue(serverSpan!, 'http.route')).toBe('/echo/:id');
    expect(attrValue(serverSpan!, 'sentry.segment.name.source')).toBe('route');
  }
});
