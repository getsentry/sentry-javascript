import { expect, test } from '@playwright/test';
import { collectStreamedSpansUntilSegment } from '@sentry-internal/test-utils';

const APP_NAME = 'nestjs-webpack';

test('Sends streamed spans for an API route', async ({ baseURL }) => {
  const spansPromise = collectStreamedSpansUntilSegment(APP_NAME, 'GET /test-transaction');

  await fetch(`${baseURL}/test-transaction`);

  const spans = await spansPromise;
  const segmentSpan = spans.find(span => span.is_segment)!;

  expect(segmentSpan).toMatchObject({
    name: 'GET /test-transaction',
    is_segment: true,
    status: 'ok',
    attributes: expect.objectContaining({
      'sentry.op': { type: 'string', value: 'http.server' },
      'http.route': { type: 'string', value: '/test-transaction' },
      'http.response.status_code': { type: 'integer', value: 200 },
    }),
  });

  expect(spans.find(span => span.name === 'test-span')).toMatchObject({ is_segment: false });
  expect(spans.find(span => span.name === 'child-span')).toMatchObject({ is_segment: false });
});
