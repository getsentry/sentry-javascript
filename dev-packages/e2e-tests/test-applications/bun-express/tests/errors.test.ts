import { expect, test } from '@playwright/test';
import { collectStreamedSpansUntilSegment, waitForError } from '@sentry-internal/test-utils';

test('captures an error thrown in an Express route', async ({ baseURL }) => {
  const errorEventPromise = waitForError('bun-express', event => {
    return !event.type && event.exception?.values?.[0]?.value === 'This is an exception with id 123';
  });
  const spansPromise = collectStreamedSpansUntilSegment('bun-express', 'GET /test-exception/:id');

  const response = await fetch(`${baseURL}/test-exception/123`);

  const errorEvent = await errorEventPromise;
  const spans = await spansPromise;

  expect(response.status).toBe(500);
  expect(errorEvent.exception?.values).toEqual([
    expect.objectContaining({
      value: 'This is an exception with id 123',
      mechanism: {
        type: 'auto.http.express',
        handled: false,
      },
    }),
  ]);
  expect(errorEvent.transaction).toBe('GET /test-exception/:id');
  expect(errorEvent.contexts?.runtime?.name).toBe('bun');

  const rootSpan = spans.find(span => span.is_segment);
  expect(rootSpan?.name).toBe('GET /test-exception/:id');
  expect(rootSpan?.status).toBe('error');
  expect(rootSpan?.attributes['http.response.status_code']?.value).toBe(500);
  expect(errorEvent.contexts?.trace?.trace_id).toBe(rootSpan?.trace_id);
});
