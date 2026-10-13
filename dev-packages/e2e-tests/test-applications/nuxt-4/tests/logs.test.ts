import { expect, test } from '@playwright/test';
import { waitForEnvelopeItem, waitForStreamedSpan } from '@sentry-internal/test-utils';
import type { SerializedLogContainer } from '@sentry/core';
import { RUNTIME } from './constants';

test('sends a log of a server route in the trace of the request', async ({ request }) => {
  const segmentSpanPromise = waitForStreamedSpan(
    'nuxt-4',
    span => span.is_segment && span.attributes['url.path']?.value === '/api/log',
  );

  const response = await request.get('/api/log');
  expect(response.ok()).toBe(true);

  const segmentSpan = await segmentSpanPromise;
  // The log can arrive before the segment, so the search starts at the first envelope of the proxy.
  const logEnvelopeItem = await waitForEnvelopeItem(
    'nuxt-4',
    envelopeItem =>
      envelopeItem[0].type === 'log' &&
      (envelopeItem[1] as SerializedLogContainer).items.some(log => log.trace_id === segmentSpan.trace_id),
    0,
  );
  const logs = (logEnvelopeItem[1] as SerializedLogContainer).items.filter(
    log => log.trace_id === segmentSpan.trace_id,
  );

  expect(logs).toHaveLength(1);
  expect(logs[0]!.body).toBe('nuxt-4 server log');
  expect(logs[0]!.level).toBe('info');
  expect(logs[0]!.attributes?.['e2e.attr']).toEqual({ value: 'value', type: 'string' });
  expect(logs[0]!.attributes?.['sentry.sdk.name']).toEqual({
    value: RUNTIME === 'cloudflare' ? 'sentry.javascript.cloudflare' : 'sentry.javascript.nuxt',
    type: 'string',
  });
});
