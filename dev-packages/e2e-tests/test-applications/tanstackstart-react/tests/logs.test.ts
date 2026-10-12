import { expect, test } from '@playwright/test';
import { waitForEnvelopeItem, waitForStreamedSpan } from '@sentry-internal/test-utils';
import type { SerializedLogContainer } from '@sentry/core';
import { RUNTIME } from './constants';

const usesManagedTunnelRoute =
  (process.env.E2E_TEST_TUNNEL_ROUTE_MODE ?? 'off') !== 'off' || process.env.E2E_TEST_CUSTOM_TUNNEL_ROUTE === '1';

test.skip(usesManagedTunnelRoute, 'Default e2e suites run only in the proxy variant');

const SDK_NAMES = {
  node: 'sentry.javascript.tanstackstart-react',
  bun: 'sentry.javascript.bun',
  deno: 'sentry.javascript.deno',
  cloudflare: 'sentry.javascript.cloudflare',
};

test('sends a log of a server route in the trace of the request', async ({ request }) => {
  const segmentSpanPromise = waitForStreamedSpan(
    'tanstackstart-react',
    span => span.is_segment && span.name === 'GET /api/log',
  );

  const response = await request.get('/api/log');
  expect(response.ok()).toBe(true);

  const segmentSpan = await segmentSpanPromise;
  // The log can arrive before the segment, so the search starts at the first envelope of the proxy.
  const logEnvelopeItem = await waitForEnvelopeItem(
    'tanstackstart-react',
    envelopeItem =>
      envelopeItem[0].type === 'log' &&
      (envelopeItem[1] as SerializedLogContainer).items.some(log => log.trace_id === segmentSpan.trace_id),
    0,
  );
  const logs = (logEnvelopeItem[1] as SerializedLogContainer).items.filter(
    log => log.trace_id === segmentSpan.trace_id,
  );

  expect(logs).toHaveLength(1);
  expect(logs[0]!.body).toBe('tanstackstart-react server log');
  expect(logs[0]!.level).toBe('info');
  expect(logs[0]!.attributes?.['e2e.attr']).toEqual({ value: 'value', type: 'string' });
  expect(logs[0]!.attributes?.['sentry.environment']).toEqual({ value: 'qa', type: 'string' });
  expect(logs[0]!.attributes?.['sentry.sdk.name']).toEqual({ value: SDK_NAMES[RUNTIME], type: 'string' });
});
