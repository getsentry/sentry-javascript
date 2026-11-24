import { expect, test } from '@playwright/test';
import type { SerializedStreamedSpan } from '@sentry-internal/test-utils';
import { getSpanOp, waitForStreamedSpans } from '@sentry-internal/test-utils';
import { HTTP_SERVER } from '@sentry/conventions/op';

const APP_NAME = 'node-nitro-3';

// In dev, the dev server takes each request and passes it on to the worker that runs Nitro.
test('sends one http.server span for a request', async ({ request }) => {
  const traceId = crypto.randomUUID().replace(/-/g, '');
  const laterTraceId = crypto.randomUUID().replace(/-/g, '');
  const httpServerSpans: SerializedStreamedSpan[] = [];
  const spansPromise = waitForStreamedSpans(APP_NAME, spans => {
    httpServerSpans.push(...spans.filter(span => getSpanOp(span) === HTTP_SERVER && span.trace_id === traceId));
    return spans.some(span => span.is_segment && span.trace_id === laterTraceId);
  });

  await request.get('/api/test-static', { headers: { 'sentry-trace': `${traceId}-1234567890123456-1` } });
  // The dev server would send its span after the worker's, so a later request gives it time to arrive.
  await request.get('/api/test-param/123', { headers: { 'sentry-trace': `${laterTraceId}-1234567890123456-1` } });
  await spansPromise;

  expect(httpServerSpans).toEqual([
    expect.objectContaining({ is_segment: true, name: 'GET /api/test-static', trace_id: traceId }),
  ]);
});
