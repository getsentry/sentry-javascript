import { expect, test } from '@playwright/test';
import { getRuntime, waitForEnvelopeItem, waitForStreamedSpan } from '@sentry-internal/test-utils';
import type { SerializedLogContainer } from '@sentry/core';

test('Sends a log of a route handler in the trace of the request', async ({ request }) => {
  // Workers have no hostname, so the client of `@sentry/cloudflare` has no `serverName` and its logs no
  // `server.address`. The other runtimes take `os.hostname()`.
  const serverAddress =
    getRuntime() === 'cloudflare' ? {} : { 'server.address': { value: expect.any(String), type: 'string' } };

  const segmentSpanPromise = waitForStreamedSpan('nextjs-16', span => {
    return span.name === 'GET /api/logs' && span.is_segment;
  });

  // Matched on the trace of the segment, so a log of an earlier request can not satisfy the correlation.
  const logEnvelopeItemPromise = waitForEnvelopeItem('nextjs-16', async envelopeItem => {
    if (envelopeItem[0].type !== 'log') {
      return false;
    }
    const traceId = (await segmentSpanPromise).trace_id;
    return (envelopeItem[1] as SerializedLogContainer).items.some(
      log => log.body === 'e2e server log' && log.trace_id === traceId,
    );
  });

  const response = await request.get('/api/logs');
  expect(await response.json()).toStrictEqual({ ok: true });

  const segmentSpan = await segmentSpanPromise;
  const logEnvelopeItem = await logEnvelopeItemPromise;
  const log = (logEnvelopeItem[1] as SerializedLogContainer).items.find(log => log.body === 'e2e server log');

  expect(log).toMatchObject({
    timestamp: expect.any(Number),
    level: 'info',
    severity_number: 9,
    body: 'e2e server log',
    trace_id: segmentSpan.trace_id,
    attributes: {
      ...serverAddress,
      'e2e.attr': { value: 'value', type: 'string' },
      'sentry.environment': { value: 'qa', type: 'string' },
      'sentry.sdk.name': { value: 'sentry.javascript.nextjs', type: 'string' },
      'sentry.sdk.version': { value: expect.any(String), type: 'string' },
      'sentry.trace.parent_span_id': { value: expect.stringMatching(/^[a-f0-9]{16}$/), type: 'string' },
      'sentry.timestamp.sequence': { value: expect.any(Number), type: 'integer' },
    },
  });
});
