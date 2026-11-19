import { expect, test } from '@playwright/test';
import type { SerializedStreamedSpan } from '@sentry-internal/test-utils';
import { collectStreamedSpansUntilSegment, getSpanOp, waitForStreamedSpan } from '@sentry-internal/test-utils';

const APP_NAME = 'astro-7';

// Each test loads a different page, and the island request's referer is that page, so the segment can't come
// from another test.
function waitForServerIslandSegment(method: 'GET' | 'POST', pagePath: string): Promise<SerializedStreamedSpan> {
  return waitForStreamedSpan(
    APP_NAME,
    span =>
      getSpanOp(span) === 'http.server' &&
      span.is_segment &&
      span.name === `${method} /_server-islands/[name]` &&
      String(span.attributes['http.request.header.referer']?.value?.[0]).endsWith(pagePath),
  );
}

function findPageloadSegment(spans: SerializedStreamedSpan[], name: string): SerializedStreamedSpan {
  const pageloadSegment = spans.find(span => getSpanOp(span) === 'pageload' && span.is_segment && span.name === name);
  expect(pageloadSegment).toBeDefined();
  return pageloadSegment!;
}

function findServerIslandFetchSpan(spans: SerializedStreamedSpan[]): SerializedStreamedSpan {
  const fetchSpan = spans.find(
    span =>
      getSpanOp(span) === 'http.client' && String(span.attributes['url.full']?.value).includes('/_server-islands/'),
  );
  expect(fetchSpan).toBeDefined();
  return fetchSpan!;
}

test.describe('tracing in static routes with server islands', () => {
  test('only sends client pageload span and server island endpoint span', async ({ page }) => {
    // The resource span for the server island request is a child of the pageload segment, so the
    // whole trace is in hand once the segment has arrived.
    const clientSpansPromise = collectStreamedSpansUntilSegment(APP_NAME, '/server-island');

    const serverIslandEndpointSpanPromise = waitForServerIslandSegment('GET', '/server-island');

    await page.goto('/server-island');

    const clientSpans = await clientSpansPromise;
    const clientPageloadSpan = findPageloadSegment(clientSpans, '/server-island');

    const sentryTraceMetaTags = await page.locator('meta[name="sentry-trace"]').count();
    expect(sentryTraceMetaTags).toBe(0);

    const baggageMetaTags = await page.locator('meta[name="baggage"]').count();
    expect(baggageMetaTags).toBe(0);

    expect(clientPageloadSpan.trace_id).toMatch(/[a-f0-9]{32}/);
    expect(clientPageloadSpan.parent_span_id).toBeUndefined();

    // The islands render in their own requests, so the document itself is static.
    expect(clientPageloadSpan.attributes).toMatchObject({
      'sentry.op': { value: 'pageload', type: 'string' },
      'sentry.origin': { value: 'auto.pageload.astro', type: 'string' },
      'sentry.segment.name.source': { value: 'route', type: 'string' },
      'page.server_rendering.type': { value: 'static', type: 'string' },
    });

    // the pageload trace contains a resource link span for the preloaded server island request.
    // With span streaming the resource span is named after the domain, so the URL lives in `url.full`.
    const resourceLinkSpan = clientSpans.find(
      span =>
        getSpanOp(span) === 'resource.link' &&
        /\/_server-islands\/Avatar.*$/.test(String(span.attributes['url.full']?.value)),
    );
    expect(resourceLinkSpan).toBeDefined();
    expect(resourceLinkSpan!.attributes['sentry.origin']?.value).toBe('auto.resource.browser.metrics');

    const serverIslandEndpointSpan = await serverIslandEndpointSpanPromise;

    expect(serverIslandEndpointSpan.attributes).toMatchObject({
      'sentry.op': { value: 'http.server', type: 'string' },
      'sentry.origin': { value: 'auto.http.astro', type: 'string' },
      'sentry.segment.name.source': { value: 'route', type: 'string' },
      'http.request.header.accept': { value: [expect.any(String)], type: 'array' },
      'http.request.header.accept-encoding': { value: ['gzip, deflate, br, zstd'], type: 'array' },
      'http.request.header.accept-language': { value: ['en-US'], type: 'array' },
      'http.request.header.sec-fetch-mode': { value: ['cors'], type: 'array' },
      'http.request.header.user-agent': { value: [expect.any(String)], type: 'array' },
    });

    // The island script's `fetch()` gets trace headers, but the browser answers it with the preload response, which
    // left before the SDK ran. So the island starts its own trace.
    expect(serverIslandEndpointSpan.trace_id).not.toBe(clientPageloadSpan.trace_id);

    await page.waitForTimeout(1000); // wait another sec to ensure no server span is sent
  });

  test('connects a POST server island to the pageload trace', async ({ page }) => {
    const clientSpansPromise = collectStreamedSpansUntilSegment(APP_NAME, '/server-island-post');
    const serverIslandSegmentPromise = waitForServerIslandSegment('POST', '/server-island-post');

    await page.goto('/server-island-post');
    await page.getByAltText('User avatar').waitFor();

    const clientSpans = await clientSpansPromise;
    const clientPageloadSpan = findPageloadSegment(clientSpans, '/server-island-post');
    const serverIslandSegment = await serverIslandSegmentPromise;

    expect(await page.locator('link[rel="preload"][href*="/_server-islands/"]').count()).toBe(0);

    const islandFetchSpan = findServerIslandFetchSpan(clientSpans);
    expect(islandFetchSpan.trace_id).toBe(clientPageloadSpan.trace_id);

    expect(serverIslandSegment.trace_id).toBe(clientPageloadSpan.trace_id);
    expect(serverIslandSegment.parent_span_id).toBe(islandFetchSpan.span_id);
  });
});

test.describe('tracing in SSR routes with server islands', () => {
  test('connects the page render, the pageload and the GET server island', async ({ page }) => {
    const pageRenderSegmentPromise = waitForStreamedSpan(
      APP_NAME,
      span => getSpanOp(span) === 'http.server' && span.is_segment && span.name === 'GET /server-island-ssr',
    );
    const clientSpansPromise = collectStreamedSpansUntilSegment(APP_NAME, '/server-island-ssr');
    const serverIslandSegmentPromise = waitForServerIslandSegment('GET', '/server-island-ssr');

    await page.goto('/server-island-ssr');
    await page.getByAltText('User avatar').waitFor();

    const pageRenderSegment = await pageRenderSegmentPromise;
    const clientSpans = await clientSpansPromise;
    const clientPageloadSpan = findPageloadSegment(clientSpans, '/server-island-ssr');
    const serverIslandSegment = await serverIslandSegmentPromise;

    expect(clientPageloadSpan.trace_id).toBe(pageRenderSegment.trace_id);
    expect(clientPageloadSpan.parent_span_id).toBe(pageRenderSegment.span_id);
    expect(await page.locator('meta[name="sentry-cache-origin"]').count()).toBe(0);
    expect(clientPageloadSpan.attributes['page.server_rendering.type']).toBeUndefined();

    // The island script's `fetch()` gets trace headers, but the browser answers it with the preload response, which
    // left before the SDK ran. So the island starts its own trace.
    expect(findServerIslandFetchSpan(clientSpans).trace_id).toBe(clientPageloadSpan.trace_id);
    expect(serverIslandSegment.trace_id).not.toBe(clientPageloadSpan.trace_id);
  });
});
