import { expect, test } from '@playwright/test';
import { getSpanOp, waitForStreamedSpan } from '@sentry-internal/test-utils';

test('Sends an HTTP segment span', async ({ baseURL }) => {
  const spanPromise = waitForStreamedSpan('nestjs-websockets', span => {
    return span.is_segment && span.name === 'GET /test-transaction';
  });

  await fetch(`${baseURL}/test-transaction`);

  const span = await spanPromise;

  expect(getSpanOp(span)).toBe('http.server');
  expect(span.status).toBe('ok');
});
