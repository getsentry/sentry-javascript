import { expect, test } from '@playwright/test';
import { collectStreamedSpans, getSpanOp } from '@sentry-internal/test-utils';

test('a waiting <Loading> boundary and the server function it awaited are spans under the request', async ({
  page,
}) => {
  const spansPromise = collectStreamedSpans(
    'solid-2',
    spans =>
      spans.some(
        span =>
          span.is_segment && getSpanOp(span) === 'http.server' && span.attributes['url.path']?.value === '/users/6',
      ) &&
      spans.some(span => getSpanOp(span) === 'solid.boundary') &&
      spans.some(span => getSpanOp(span) === 'function.solid.direct'),
  );

  await page.goto('/users/6');
  await expect(page.locator('#user')).toContainText('Kagoshima');

  const spans = await spansPromise;
  const request = spans.find(
    span => span.is_segment && getSpanOp(span) === 'http.server' && span.attributes['url.path']?.value === '/users/6',
  )!;
  const boundary = spans.find(span => getSpanOp(span) === 'solid.boundary')!;
  const invocation = spans.find(span => getSpanOp(span) === 'function.solid.direct')!;

  // Both parent on the request: the records are delivered inside its async context.
  expect(boundary.parent_span_id).toBe(request.span_id);
  expect(invocation.parent_span_id).toBe(request.span_id);
  expect(boundary.attributes).toMatchObject({
    'sentry.origin': { value: 'auto.function.solid.server', type: 'string' },
    'solid.boundary.outcome': { value: 'settled', type: 'string' },
  });
  expect(boundary.name).toContain('<UserPage>');
  expect(invocation.attributes).toMatchObject({
    'solid.server_function.direct': { value: true, type: 'boolean' },
    'solid.server_function.outcome': { value: 'ok', type: 'string' },
  });
  // Backdated from the record's clock, inside the request's window.
  expect(boundary.start_timestamp).toBeGreaterThanOrEqual(request.start_timestamp - 0.001);
  expect(boundary.end_timestamp).toBeLessThanOrEqual(request.end_timestamp + 0.001);
});
