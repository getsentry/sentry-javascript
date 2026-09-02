import { expect, test } from '@playwright/test';
import { collectStreamedSpans, getSpanOp, waitForStreamedSpan } from '@sentry-internal/test-utils';

test('Propagates trace for outgoing fetch requests', async ({ baseURL, request }) => {
  // Inbound span, outbound span and the http.client span in between all share one trace, and
  // `collectStreamedSpans` evaluates a single trace at a time, so requiring all three together
  // keeps them paired.
  const spansPromise = collectStreamedSpans('nextjs-16-bun', spans => {
    return (
      spans.some(span => span.name === 'GET /propagation/test-outgoing-fetch' && span.is_segment) &&
      spans.some(span => span.name === 'GET /propagation/test-outgoing-fetch/check' && span.is_segment) &&
      spans.some(
        span => getSpanOp(span) === 'http.client' && span.attributes['sentry.origin']?.value === 'auto.http.fetch',
      )
    );
  });

  const { headers } = await (await request.get(`${baseURL}/propagation/test-outgoing-fetch`)).json();

  const spans = await spansPromise;
  const outboundSpan = spans.find(span => span.name === 'GET /propagation/test-outgoing-fetch' && span.is_segment)!;
  const inboundSpan = spans.find(
    span => span.name === 'GET /propagation/test-outgoing-fetch/check' && span.is_segment,
  )!;
  const httpClientSpan = spans.find(
    span => getSpanOp(span) === 'http.client' && span.attributes['sentry.origin']?.value === 'auto.http.fetch',
  );

  expect(inboundSpan.trace_id).toStrictEqual(expect.any(String));
  expect(inboundSpan.trace_id).toBe(outboundSpan.trace_id);

  expect(httpClientSpan).toBeDefined();
  expect(httpClientSpan?.span_id).toStrictEqual(expect.any(String));
  expect(inboundSpan.parent_span_id).toBe(httpClientSpan?.span_id);

  expect(headers).toMatchObject({
    baggage: expect.any(String),
    'sentry-trace': `${outboundSpan.trace_id}-${httpClientSpan?.span_id}-1`,
  });
});

test('Does not propagate outgoing fetch requests not covered by tracePropagationTargets', async ({
  baseURL,
  request,
}) => {
  // These two spans are deliberately in different traces, so they are matched by their unique names.
  const inboundSpanPromise = waitForStreamedSpan('nextjs-16-bun', span => {
    return span.name === 'GET /propagation/test-outgoing-fetch-external-disallowed/check' && span.is_segment;
  });

  const outboundSpanPromise = waitForStreamedSpan('nextjs-16-bun', span => {
    return span.name === 'GET /propagation/test-outgoing-fetch-external-disallowed' && span.is_segment;
  });

  const { headers } = await (
    await request.get(`${baseURL}/propagation/test-outgoing-fetch-external-disallowed`)
  ).json();

  expect(headers.baggage).toBeUndefined();
  expect(headers['sentry-trace']).toBeUndefined();

  const inboundSpan = await inboundSpanPromise;
  const outboundSpan = await outboundSpanPromise;

  expect(typeof outboundSpan.trace_id).toBe('string');
  expect(inboundSpan.trace_id).not.toBe(outboundSpan.trace_id);
});
