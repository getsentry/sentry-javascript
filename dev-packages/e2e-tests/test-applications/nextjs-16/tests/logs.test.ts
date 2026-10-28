import { expect, test } from '@playwright/test';
import { getRuntime, waitForEnvelopeItem, waitForStreamedSpan } from '@sentry-internal/test-utils';
import type { SerializedLogContainer } from '@sentry/core';

test('Sends a log of a route handler in the trace of the request', async ({ request }) => {
  // Workers have no hostname, so the client of `@sentry/cloudflare` has no `serverName` and its logs no
  // `server.address`. The other runtimes take `os.hostname()`.
  const serverAddressType = getRuntime() === 'cloudflare' ? undefined : 'string';

  const segmentSpanPromise = waitForStreamedSpan('nextjs-16', span => {
    return span.name === 'GET /api/logs' && span.is_segment;
  });

  const response = await request.get('/api/logs');
  expect(await response.json()).toStrictEqual({ ok: true });

  const segmentSpan = await segmentSpanPromise;
  // The log can arrive before the segment, so the search starts at the first envelope of the proxy.
  const logEnvelopeItem = await waitForEnvelopeItem(
    'nextjs-16',
    envelopeItem =>
      envelopeItem[0].type === 'log' &&
      (envelopeItem[1] as SerializedLogContainer).items.some(log => log.trace_id === segmentSpan.trace_id),
    0,
  );
  const logs = (logEnvelopeItem[1] as SerializedLogContainer).items.filter(
    log => log.trace_id === segmentSpan.trace_id,
  );

  expect(logs).toHaveLength(1);
  expect(logs[0]!.body).toBe('e2e server log');
  expect(logs[0]!.level).toBe('info');
  expect(logs[0]!.severity_number).toBe(9);
  expect(logs[0]!.attributes?.['e2e.attr']).toEqual({ value: 'value', type: 'string' });
  expect(logs[0]!.attributes?.['sentry.environment']).toEqual({ value: 'qa', type: 'string' });
  expect(logs[0]!.attributes?.['sentry.sdk.name']).toEqual({ value: 'sentry.javascript.nextjs', type: 'string' });
  expect(logs[0]!.attributes?.['sentry.trace.parent_span_id']?.value).toMatch(/^[a-f0-9]{16}$/);
  expect(logs[0]!.attributes?.['server.address']?.type).toBe(serverAddressType);
});
