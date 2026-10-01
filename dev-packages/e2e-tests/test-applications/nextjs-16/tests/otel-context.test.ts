import { expect, test } from '@playwright/test';
import { collectStreamedSpansUntilSegment } from '@sentry-internal/test-utils';

test('Keeps OpenTelemetry context values and parents', async ({ request }) => {
  const spansPromise = collectStreamedSpansUntilSegment('nextjs-16', 'GET /api/otel-context');

  const response = await request.get('/api/otel-context');
  expect(await response.json()).toStrictEqual({ ok: true });

  const spans = await spansPromise;
  const segmentSpan = spans.find(span => span.is_segment)!;
  const outerSpan = spans.find(span => span.name === 'otel-context-outer')!;
  const innerSpan = spans.find(span => span.name === 'otel-context-inner')!;

  expect(spans.some(span => span.span_id === outerSpan.parent_span_id)).toBe(true);
  expect(innerSpan.parent_span_id).toBe(outerSpan.span_id);
  expect(innerSpan.trace_id).toBe(segmentSpan.trace_id);
  expect(innerSpan.attributes['e2e.context.value']?.value).toBe('e2e-value');
});
