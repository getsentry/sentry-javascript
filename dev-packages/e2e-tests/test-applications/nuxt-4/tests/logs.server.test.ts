import { expect, test } from '@playwright/test';
import { waitForEnvelopeItem, waitForStreamedSpan } from '@sentry-internal/test-utils';
import { isViteServer, NITRO_ONLY } from './isViteServer';

test.skip(isViteServer, NITRO_ONLY);

interface LogContainer {
  items: { trace_id?: string; body: string; level: string; attributes?: Record<string, unknown> }[];
}

test('sends a log of a server route in the trace of the request', async ({ request }) => {
  const segmentPromise = waitForStreamedSpan(
    'nuxt-4',
    span => span.is_segment && span.attributes['url.path']?.value === '/api/log',
  );

  await request.get('/api/log');

  const segment = await segmentPromise;
  // The log can arrive before the segment, so the search starts at the first envelope of the proxy.
  const logItem = await waitForEnvelopeItem(
    'nuxt-4',
    item => item[0].type === 'log' && (item[1] as LogContainer).items.some(log => log.trace_id === segment.trace_id),
    0,
  );
  const log = (logItem[1] as LogContainer).items.find(log => log.trace_id === segment.trace_id)!;

  expect(log.body).toBe('nuxt-4 server log');
  expect(log.level).toBe('info');
  expect(log.attributes?.['e2e.attr']).toEqual({ value: 'value', type: 'string' });
});
