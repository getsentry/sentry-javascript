import { expect, test } from '@playwright/test';
import { waitForEnvelopeItem, waitForStreamedSpan } from '@sentry-internal/test-utils';
import type { SerializedLogContainer } from '@sentry/core';
import { APP_NAME } from './constants';

test('sends a structured log correlated with the request trace', async ({ baseURL }) => {
  const segmentPromise = waitForStreamedSpan(APP_NAME, span => span.is_segment && span.name === 'GET /test-log');
  const logPromise = waitForEnvelopeItem(
    APP_NAME,
    ([header, body]) =>
      header.type === 'log' && (body as SerializedLogContainer).items.some(log => log.body === 'Hono server log'),
  );

  const response = await fetch(`${baseURL}/test-log`);
  expect(response.status).toBe(200);

  const [segment, [, body]] = await Promise.all([segmentPromise, logPromise]);
  const log = (body as SerializedLogContainer).items.find(item => item.body === 'Hono server log');
  expect(log).toMatchObject({
    level: 'info',
    trace_id: segment.trace_id,
    attributes: { route: { type: 'string', value: '/test-log' } },
  });
});
