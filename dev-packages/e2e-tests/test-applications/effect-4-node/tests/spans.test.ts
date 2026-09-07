import { expect, test } from '@playwright/test';
import { collectStreamedSpans, getSpanOp, waitForStreamedSpan } from '@sentry-internal/test-utils';

['test-success', 'test-error'].forEach(route => {
  test(`Sends an HTTP segment for ${route}`, async ({ baseURL }) => {
    const spanPromise = waitForStreamedSpan(
      'effect-4-node',
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
    'effect-4-node',
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
    'effect-4-node',
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
