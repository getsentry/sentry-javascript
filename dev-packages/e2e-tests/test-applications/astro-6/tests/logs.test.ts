import { expect, test } from '@playwright/test';
import { waitForEnvelopeItem, waitForStreamedSpan } from '@sentry-internal/test-utils';
import type { SerializedLogContainer } from '@sentry/core';
import { APP_NAME } from './constants';

test('sends a log of a page in the trace of the request', async ({ request }) => {
  const segmentSpanPromise = waitForStreamedSpan(APP_NAME, span => span.is_segment && span.name === 'GET /log');

  const response = await request.get('/log');
  expect(response.ok()).toBe(true);

  const segmentSpan = await segmentSpanPromise;
  // The log can arrive before the segment, so the search starts at the first envelope of the proxy.
  const logEnvelopeItem = await waitForEnvelopeItem(
    APP_NAME,
    envelopeItem =>
      envelopeItem[0].type === 'log' &&
      (envelopeItem[1] as SerializedLogContainer).items.some(log => log.trace_id === segmentSpan.trace_id),
    0,
  );
  const logs = (logEnvelopeItem[1] as SerializedLogContainer).items.filter(
    log => log.trace_id === segmentSpan.trace_id,
  );

  expect(logs).toHaveLength(1);
  expect(logs[0]!.body).toBe('astro-6 server log');
  expect(logs[0]!.level).toBe('info');
  expect(logs[0]!.attributes?.['e2e.attr']).toEqual({ value: 'value', type: 'string' });
  expect(logs[0]!.attributes?.['sentry.environment']).toEqual({ value: 'qa', type: 'string' });
  expect(logs[0]!.attributes?.['sentry.sdk.name']).toEqual({
    value: 'sentry.javascript.astro',
    type: 'string',
  });
});
