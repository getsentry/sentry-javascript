import { expect, test } from '@playwright/test';
import type { SerializedStreamedSpan } from '@sentry-internal/test-utils';
import { collectStreamedSpans, getSpanOp, waitForStreamedSpan } from '@sentry-internal/test-utils';

const APP_NAME = 'astro-5';

test.describe('tracing in static routes with server islands', () => {
  test('only sends client pageload span and server island endpoint span', async ({ page }) => {
    // The resource span for the server island request is a child of the pageload segment, and
    // streamed children arrive in later envelopes than the segment they hang off.
    const clientSpansPromise = collectStreamedSpans(
      APP_NAME,
      spans =>
        spans.some(span => getSpanOp(span) === 'pageload' && span.is_segment && span.name === '/server-island') &&
        spans.some(
          span =>
            getSpanOp(span) === 'resource.link' &&
            /\/_server-islands\/Avatar.*$/.test(String(span.attributes['url.full']?.value)),
        ),
    );

    const serverIslandEndpointSpanPromise = waitForStreamedSpan(APP_NAME, span => {
      return getSpanOp(span) === 'http.server' && span.is_segment && span.name === 'GET /_server-islands/[name]';
    });

    await page.goto('/server-island');

    const clientSpans = await clientSpansPromise;
    const clientPageloadSpan = clientSpans.find(
      span => getSpanOp(span) === 'pageload' && span.is_segment && span.name === '/server-island',
    )!;

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
    )!;
    expect(resourceLinkSpan.attributes['sentry.origin']?.value).toBe('auto.resource.browser.metrics');

    const serverIslandEndpointSpan = await serverIslandEndpointSpanPromise;

    expect(serverIslandEndpointSpan.attributes).toMatchObject({
      'sentry.op': { value: 'http.server', type: 'string' },
      'sentry.origin': { value: 'auto.http.astro', type: 'string' },
      'sentry.segment.name.source': { value: 'route', type: 'string' },
      'http.request.header.accept': { value: expect.any(String), type: 'string' },
      'http.request.header.accept_encoding': { value: 'gzip, deflate, br, zstd', type: 'string' },
      'http.request.header.accept_language': { value: 'en-US', type: 'string' },
      'http.request.header.sec_fetch_mode': { value: 'cors', type: 'string' },
      'http.request.header.user_agent': { value: expect.any(String), type: 'string' },
    });

    // unfortunately, the server island trace id is not the same as the client pageload trace id
    // this is because the server island endpoint request is made as a resource link request,
    // meaning our fetch instrumentation can't attach headers to the request :(
    expect(serverIslandEndpointSpan.trace_id).not.toBe(clientPageloadSpan.trace_id);

    await page.waitForTimeout(1000); // wait another sec to ensure no server span is sent
  });
});
