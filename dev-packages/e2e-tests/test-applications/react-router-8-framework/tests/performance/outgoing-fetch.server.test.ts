import { expect, test } from '@playwright/test';
import type { SerializedStreamedSpan } from '@sentry-internal/test-utils';
import { getSpanOp, waitForStreamedSpans } from '@sentry-internal/test-utils';
import { APP_NAME } from '../constants';

test('propagates the trace to an outgoing fetch', async ({ request }) => {
  const streamedSpans: SerializedStreamedSpan[] = [];
  void waitForStreamedSpans(APP_NAME, spans => {
    streamedSpans.push(...spans);
    return false;
  });

  const response = await request.get('/performance/outgoing-fetch');
  const headers = (await response.json()) as { 'sentry-trace': string | null; baggage: string | null };

  expect(headers['sentry-trace']).toMatch(/^[a-f0-9]{32}-[a-f0-9]{16}-1$/);
  const [traceId, fetchSpanId] = headers['sentry-trace']!.split('-');
  expect(headers.baggage).toContain(`sentry-trace_id=${traceId}`);

  // The header names the span of the outgoing fetch, which belongs to the trace of the incoming request.
  await expect.poll(() => streamedSpans.find(span => span.span_id === fetchSpanId)).toBeDefined();
  const fetchSpan = streamedSpans.find(span => span.span_id === fetchSpanId)!;
  expect(getSpanOp(fetchSpan)).toBe('http.client');
  expect(fetchSpan.trace_id).toBe(traceId);

  await expect
    .poll(() => streamedSpans.find(span => span.is_segment && span.trace_id === traceId && !span.parent_span_id))
    .toBeDefined();
  const serverSpan = streamedSpans.find(span => span.is_segment && span.trace_id === traceId && !span.parent_span_id)!;
  expect(getSpanOp(serverSpan)).toBe('http.server');
});
