import { expect, test } from '@playwright/test';
import { collectStreamedSpansUntilSegment, getSpanOp } from '@sentry-internal/test-utils';
import { HTTP_SERVER } from '@sentry/conventions/op';

test.skip(process.env.E2E_TEST_OTEL_SETUP !== 'true', 'Only runs in the tracer provider variant');

test('Captures spans started via @opentelemetry/api as children of the request span', async ({ baseURL }) => {
  const spansPromise = collectStreamedSpansUntilSegment(
    'node-express',
    segment => getSpanOp(segment) === HTTP_SERVER && segment.name === 'GET /test-otel-api-span',
  );

  await fetch(`${baseURL}/test-otel-api-span`);

  const spans = await spansPromise;
  const segmentSpan = spans.find(span => span.is_segment && span.name === 'GET /test-otel-api-span')!;
  const otelSpan = spans.find(span => span.name === 'otel-api-span');
  const otelChildSpan = spans.find(span => span.name === 'otel-api-child-span');

  expect(otelSpan).toEqual(
    expect.objectContaining({
      trace_id: segmentSpan.trace_id,
      is_segment: false,
      attributes: expect.objectContaining({
        'sentry.segment.id': { value: segmentSpan.span_id, type: 'string' },
      }),
    }),
  );
  expect(otelChildSpan).toEqual(
    expect.objectContaining({
      trace_id: segmentSpan.trace_id,
      parent_span_id: otelSpan!.span_id,
      is_segment: false,
    }),
  );
});
