import { expect, test } from '@playwright/test';
import { collectStreamedSpansUntilSegment, waitForEnvelopeItem } from '@sentry-internal/test-utils';
import type { SerializedLogContainer } from '@sentry/core';

test('Sends logs with the trace of the request', async ({ baseURL }) => {
  const logEnvelopePromise = waitForEnvelopeItem('fastify-5', envelope => {
    return envelope[0].type === 'log' && (envelope[1] as SerializedLogContainer).items[0]?.level === 'debug';
  });
  const spansPromise = collectStreamedSpansUntilSegment('fastify-5', 'GET /test-log');

  await fetch(`${baseURL}/test-log`);

  const logEnvelope = await logEnvelopePromise;
  const log = (logEnvelope[1] as SerializedLogContainer).items[0];
  expect(log?.level).toBe('debug');
  expect(log?.body).toBe('Accessed /test-log route');

  const segmentSpan = (await spansPromise).find(span => span.is_segment)!;
  expect(log?.trace_id).toBe(segmentSpan.trace_id);
});
