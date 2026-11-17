import type { Page, Request } from '@playwright/test';
import { expect, test } from '@playwright/test';
import type { SerializedStreamedSpan } from '@sentry-internal/test-utils';
import { collectStreamedSpansUntilSegment, getSpanOp, waitForStreamedSpan } from '@sentry-internal/test-utils';

const APP_NAME = 'astro-7';

const SERVER_ISLAND_SEGMENT_NAME = (method: 'GET' | 'POST'): string => `${method} /_server-islands/[name]`;

function recordServerIslandRequests(page: Page): Request[] {
  const requests: Request[] = [];
  page.on('request', request => {
    if (request.url().includes('/_server-islands/')) {
      requests.push(request);
    }
  });
  return requests;
}

function waitForServerIslandSegment(method: 'GET' | 'POST'): Promise<SerializedStreamedSpan> {
  return waitForStreamedSpan(
    APP_NAME,
    span => getSpanOp(span) === 'http.server' && span.is_segment && span.name === SERVER_ISLAND_SEGMENT_NAME(method),
  );
}

function findPageloadSegment(spans: SerializedStreamedSpan[], name: string): SerializedStreamedSpan {
  return spans.find(span => getSpanOp(span) === 'pageload' && span.is_segment && span.name === name)!;
}

test.describe('tracing in static routes with server islands', () => {
  test('only sends client pageload span and server island endpoint span', async ({ page }) => {
    // The resource span for the server island request is a child of the pageload segment, so the
    // whole trace is in hand once the segment has arrived.
    const clientSpansPromise = collectStreamedSpansUntilSegment(APP_NAME, '/server-island');

    const serverIslandEndpointSpanPromise = waitForServerIslandSegment('GET');

    await page.goto('/server-island');

    const clientSpans = await clientSpansPromise;
    const clientPageloadSpan = findPageloadSegment(clientSpans, '/server-island');

    const sentryTraceMetaTags = await page.locator('meta[name="sentry-trace"]').count();
    expect(sentryTraceMetaTags).toBe(0);

    const baggageMetaTags = await page.locator('meta[name="baggage"]').count();
    expect(baggageMetaTags).toBe(0);

    expect(clientPageloadSpan.trace_id).toMatch(/[a-f0-9]{32}/);
    expect(clientPageloadSpan.parent_span_id).toBeUndefined();

    expect(clientPageloadSpan.attributes).toMatchObject({
      'sentry.op': { value: 'pageload', type: 'string' },
      'sentry.origin': { value: 'auto.pageload.astro', type: 'string' },
      'sentry.segment.name.source': { value: 'route', type: 'string' },
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

    // unfortunately, the server island trace id is not the same as the client pageload trace id
    // this is because the server island endpoint request is made as a resource link request,
    // meaning our fetch instrumentation can't attach headers to the request :(
    expect(serverIslandEndpointSpan.trace_id).not.toBe(clientPageloadSpan.trace_id);

    await page.waitForTimeout(1000); // wait another sec to ensure no server span is sent
  });

  test('requests a GET server island once', async ({ page }) => {
    const serverIslandRequests = recordServerIslandRequests(page);
    const clientSpansPromise = collectStreamedSpansUntilSegment(APP_NAME, '/server-island');

    await page.goto('/server-island');
    await page.getByAltText('User avatar').waitFor();
    const clientSpans = await clientSpansPromise;

    expect(serverIslandRequests.map(request => request.method())).toEqual(['GET']);

    const islandRequestHeaders = await serverIslandRequests[0]!.allHeaders();
    expect(islandRequestHeaders['sentry-trace']).toBeUndefined();
    expect(islandRequestHeaders['baggage']).toBeUndefined();

    // The island script's `fetch()` is instrumented and gets trace headers, but the browser answers it with the
    // preload response, which left before the SDK ran. So the island render never sees the pageload's trace.
    const islandFetchSpan = clientSpans.find(
      span =>
        getSpanOp(span) === 'http.client' && String(span.attributes['url.full']?.value).includes('/_server-islands/'),
    );
    expect(islandFetchSpan).toBeDefined();
  });

  test('connects a POST server island to the pageload trace', async ({ page }) => {
    const serverIslandRequests = recordServerIslandRequests(page);
    const clientSpansPromise = collectStreamedSpansUntilSegment(APP_NAME, '/server-island-post');
    const serverIslandSegmentPromise = waitForServerIslandSegment('POST');

    await page.goto('/server-island-post');
    await page.getByAltText('User avatar').waitFor();

    const clientSpans = await clientSpansPromise;
    const clientPageloadSpan = findPageloadSegment(clientSpans, '/server-island-post');
    const serverIslandSegment = await serverIslandSegmentPromise;

    expect(serverIslandRequests.map(request => request.method())).toEqual(['POST']);
    expect(await page.locator('link[rel="preload"][href*="/_server-islands/"]').count()).toBe(0);

    const islandFetchSpan = clientSpans.find(
      span =>
        getSpanOp(span) === 'http.client' && String(span.attributes['url.full']?.value).includes('/_server-islands/'),
    )!;
    expect(islandFetchSpan).toBeDefined();
    expect(islandFetchSpan.trace_id).toBe(clientPageloadSpan.trace_id);

    expect(serverIslandSegment.trace_id).toBe(clientPageloadSpan.trace_id);
    expect(serverIslandSegment.parent_span_id).toBe(islandFetchSpan.span_id);
  });
});

test.describe('tracing in SSR routes with server islands', () => {
  test('connects the page render, the pageload and the GET server island', async ({ page }) => {
    const serverIslandRequests = recordServerIslandRequests(page);
    const pageRenderSegmentPromise = waitForStreamedSpan(
      APP_NAME,
      span => getSpanOp(span) === 'http.server' && span.is_segment && span.name === 'GET /server-island-ssr',
    );
    const clientSpansPromise = collectStreamedSpansUntilSegment(APP_NAME, '/server-island-ssr');
    const serverIslandSegmentPromise = waitForServerIslandSegment('GET');

    await page.goto('/server-island-ssr');
    await page.getByAltText('User avatar').waitFor();

    const pageRenderSegment = await pageRenderSegmentPromise;
    const clientSpans = await clientSpansPromise;
    const clientPageloadSpan = findPageloadSegment(clientSpans, '/server-island-ssr');
    const serverIslandSegment = await serverIslandSegmentPromise;

    expect(clientPageloadSpan.trace_id).toBe(pageRenderSegment.trace_id);
    expect(clientPageloadSpan.parent_span_id).toBe(pageRenderSegment.span_id);

    expect(serverIslandRequests.map(request => request.method())).toEqual(['GET']);

    // The preload request leaves before the SDK runs, so the island starts its own trace.
    expect(serverIslandSegment.trace_id).not.toBe(clientPageloadSpan.trace_id);
  });
});
