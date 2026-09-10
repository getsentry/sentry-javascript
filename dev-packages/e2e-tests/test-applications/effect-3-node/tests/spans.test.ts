import { expect, test } from '@playwright/test';
import { collectStreamedSpans, getSpanOp, waitForStreamedSpan } from '@sentry-internal/test-utils';

['test-success', 'test-error'].forEach(route => {
  test(`Sends an HTTP segment for ${route}`, async ({ baseURL }) => {
    const spanPromise = waitForStreamedSpan(
      'effect-3-node',
      span =>
        span.is_segment && getSpanOp(span) === 'http.server' && span.attributes['url.path']?.value === `/${route}`,
    );

    await fetch(`${baseURL}/${route}`);

    const span = await spanPromise;
    expect(span.name).toBe('http.server GET');
    expect(span.attributes['sentry.origin']?.value).toBe('auto.http.effect');
  });
});

test('Sends a manual Effect span', async ({ baseURL }) => {
  const spansPromise = collectStreamedSpans(
    'effect-3-node',
    spans =>
      spans.some(span => span.is_segment && getSpanOp(span) === 'http.server') &&
      spans.some(span => span.name === 'test-span'),
  );

  await fetch(`${baseURL}/test-transaction`);

  const spans = await spansPromise;
  const segment = spans.find(span => span.is_segment)!;
  const children = spans.filter(span => !span.is_segment);
  expect(segment.name).toBe('http.server GET');
  expect(children).toHaveLength(1);
  expect(children[0]).toMatchObject({ name: 'test-span', parent_span_id: segment.span_id });
});

test('Sends Effect spans with correct parent-child structure', async ({ baseURL }) => {
  const spansPromise = collectStreamedSpans(
    'effect-3-node',
    spans =>
      spans.some(span => span.is_segment && getSpanOp(span) === 'http.server') &&
      spans.some(span => span.name === 'custom-effect-span') &&
      spans.some(span => span.name === 'nested-span'),
  );

  await fetch(`${baseURL}/test-effect-span`);

  const spans = await spansPromise;
  const segment = spans.find(span => span.is_segment)!;
  const children = spans.filter(span => !span.is_segment);
  expect(segment.name).toBe('http.server GET');
  expect(segment.attributes['sentry.origin']?.value).toBe('auto.http.effect');
  expect(segment.attributes['sentry.sdk.name']?.value).toBe('sentry.javascript.effect');
  expect(children).toHaveLength(2);
  const parent = children.find(span => span.name === 'custom-effect-span')!;
  const nested = children.find(span => span.name === 'nested-span')!;
  expect(parent.parent_span_id).toBe(segment.span_id);
  expect(nested.parent_span_id).toBe(parent.span_id);
  for (const child of children) {
    expect(getSpanOp(child)).toBe('function');
    expect(child.attributes['sentry.origin']?.value).toBe('auto.function.effect');
    expect(child.trace_id).toBe(segment.trace_id);
  }
});

test('Sends a root: true span as its own segment in a new trace', async ({ baseURL }) => {
  const requestSpansPromise = collectStreamedSpans(
    'effect-3-node',
    spans =>
      spans.some(
        span =>
          span.is_segment &&
          getSpanOp(span) === 'http.server' &&
          span.attributes['url.path']?.value === '/test-root-span',
      ) && spans.some(span => span.name === 'root-span-request-marker'),
  );
  const detachedSpanPromise = waitForStreamedSpan('effect-3-node', span => span.name === 'detached-root-span');

  await fetch(`${baseURL}/test-root-span`);

  const [requestSpans, detachedSpan] = await Promise.all([requestSpansPromise, detachedSpanPromise]);
  const segment = requestSpans.find(span => span.is_segment && getSpanOp(span) === 'http.server')!;
  expect(segment.name).toBe('http.server GET');
  expect(requestSpans.filter(span => !span.is_segment).map(span => span.name)).toEqual(['root-span-request-marker']);

  expect(detachedSpan.is_segment).toBe(true);
  expect(detachedSpan.parent_span_id).toBeUndefined();
  expect(detachedSpan.trace_id).not.toBe(segment.trace_id);
});

test('Continues the trace of a Tracer.externalSpan parent with the external span layer', async ({ baseURL }) => {
  const spanPromise = waitForStreamedSpan('effect-3-node', span => span.name === 'continued-span');

  await fetch(`${baseURL}/test-external-parent`);

  const span = await spanPromise;
  expect(span).toMatchObject({
    is_segment: true,
    trace_id: 'fedcba0987654321fedcba0987654321',
    parent_span_id: '0987654321fedcba',
  });
});

test('Ignores an incoming traceparent header without the external span layer', async ({ baseURL }) => {
  const traceId = '1234567890abcdef1234567890abcdef';
  const parentSpanId = 'abcdef1234567890';

  const spanPromise = waitForStreamedSpan(
    'effect-3-node',
    span =>
      span.is_segment && getSpanOp(span) === 'http.server' && span.attributes['url.path']?.value === '/test-success',
  );

  await fetch(`${baseURL}/test-success`, { headers: { traceparent: `00-${traceId}-${parentSpanId}-01` } });

  const span = await spanPromise;
  expect(span.name).toBe('http.server GET');
  expect(span.trace_id).not.toBe(traceId);
  expect(span.parent_span_id).toBeUndefined();
});
