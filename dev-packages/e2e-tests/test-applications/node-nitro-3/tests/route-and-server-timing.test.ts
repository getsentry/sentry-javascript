import type { APIResponse } from '@playwright/test';
import { expect, test } from '@playwright/test';
import type { SerializedStreamedSpan } from '@sentry-internal/test-utils';
import { collectStreamedSpansUntilSegment, getSpanOp, waitForStreamedSpan } from '@sentry-internal/test-utils';
import { HTTP_ROUTE, SENTRY_ORIGIN, SENTRY_SEGMENT_NAME_SOURCE, URL_PATH } from '@sentry/conventions/attributes';
import { HANDLER } from '@sentry/conventions/op';

const APP_NAME = 'node-nitro-3';

function getServerTimingEntries(response: APIResponse, name: string): string[] {
  const serverTiming = response
    .headersArray()
    .filter(header => header.name.toLowerCase() === 'server-timing')
    .map(header => header.value)
    .join(', ');

  return [...serverTiming.matchAll(new RegExp(`${name};desc="([^"]*)"`, 'g'))].map(match => match[1]!);
}

test('names the segment span after the parameterized route', async ({ request }) => {
  const segmentSpanPromise = waitForStreamedSpan(APP_NAME, span => {
    return span.is_segment && span.attributes[URL_PATH]?.value === '/api/test-param/123';
  });

  await request.get('/api/test-param/123');

  const segmentSpan = await segmentSpanPromise;
  expect(segmentSpan.name).toBe('GET /api/test-param/:id');
  expect(segmentSpan.attributes[HTTP_ROUTE]?.value).toBe('/api/test-param/:id');
  expect(segmentSpan.attributes[SENTRY_SEGMENT_NAME_SOURCE]?.value).toBe('route');
  expect(segmentSpan.attributes['url.path.parameter.id']?.value).toBe('123');
});

test('does not name the segment span after the `/**` catch-all route', async ({ request }) => {
  const segmentSpanPromise = waitForStreamedSpan(APP_NAME, span => {
    return span.is_segment && span.attributes[URL_PATH]?.value === '/no-such-page';
  });

  const response = await request.get('/no-such-page');
  expect(await response.json()).toEqual({ catchAll: true });

  const segmentSpan = await segmentSpanPromise;
  expect(segmentSpan.attributes[HTTP_ROUTE]).toBeUndefined();
  expect(segmentSpan.attributes[SENTRY_SEGMENT_NAME_SOURCE]?.value).not.toBe('route');
});

test('sets one pair of Server-Timing entries that continue the request trace', async ({ request }) => {
  const segmentSpanPromise = waitForStreamedSpan(APP_NAME, span => {
    return span.is_segment && span.attributes[URL_PATH]?.value === '/api/test-static';
  });

  const response = await request.get('/api/test-static');

  const segmentSpan = await segmentSpanPromise;
  const sentryTraces = getServerTimingEntries(response, 'sentry-trace');
  expect(sentryTraces).toHaveLength(1);
  expect(sentryTraces[0]).toMatch(new RegExp(`^${segmentSpan.trace_id}-[a-f0-9]{16}-1$`));
  expect(getServerTimingEntries(response, 'baggage')).toEqual([
    expect.stringContaining(`sentry-trace_id=${segmentSpan.trace_id}`),
  ]);
});

test('creates one h3 handler span through the tracing channels the plugin turned on', async ({ request }) => {
  const isNitroSegment = (span: SerializedStreamedSpan): boolean =>
    span.attributes[URL_PATH]?.value === '/api/test-param/456';
  const spansPromise = collectStreamedSpansUntilSegment(APP_NAME, isNitroSegment);

  const response = await request.get('/api/test-param/456');

  const spans = await spansPromise;
  const segmentSpan = spans.find(span => span.is_segment && isNitroSegment(span))!;
  const handlerSpans = spans.filter(
    span => span.attributes[SENTRY_ORIGIN]?.value === 'auto.http.nitro.h3' && getSpanOp(span) === HANDLER,
  );
  expect(handlerSpans).toHaveLength(1);
  expect(segmentSpan.name).toBe('GET /api/test-param/:id');
  expect(getServerTimingEntries(response, 'sentry-trace')).toHaveLength(1);
  expect(getServerTimingEntries(response, 'baggage')).toHaveLength(1);
});
