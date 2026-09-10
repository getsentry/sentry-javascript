import { expect, test } from '@playwright/test';
import { collectStreamedSpansUntilSegment, getSpanOp } from '@sentry-internal/test-utils';

test('instruments an Express route under Bun', async ({ baseURL }) => {
  const spansPromise = collectStreamedSpansUntilSegment('bun-express', 'GET /test-param/:id');

  const response = await fetch(`${baseURL}/test-param/123`);
  const spans = await spansPromise;

  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ id: '123' });

  const rootSpan = spans.find(span => span.is_segment);
  expect(rootSpan?.name).toBe('GET /test-param/:id');
  expect(rootSpan && getSpanOp(rootSpan)).toBe('http.server');
  expect(rootSpan?.status).toBe('ok');
  expect(rootSpan?.attributes['sentry.segment.name.source']?.value).toBe('route');

  expect(spans).toContainEqual(
    expect.objectContaining({
      name: '/test-param/:id',
      attributes: expect.objectContaining({
        'sentry.origin': { value: 'auto.http.express', type: 'string' },
        'sentry.op': { value: 'handler', type: 'string' },
        'http.route': { value: '/test-param/:id', type: 'string' },
        'express.type': { value: 'request_handler', type: 'string' },
      }),
    }),
  );
});
