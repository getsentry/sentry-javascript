import { expect, test } from '@playwright/test';
import { getSpanOp, waitForStreamedSpan } from '@sentry-internal/test-utils';
import { APP_NAME } from '../constants';

test('continues the trace of an incoming request', async ({ request }) => {
  const traceId = '12312012123120121231201212312012';
  const parentSpanId = '1121201211212012';

  const spanPromise = waitForStreamedSpan(APP_NAME, span => span.is_segment && span.trace_id === traceId);

  await request.get('/performance/server-loader', {
    headers: {
      'sentry-trace': `${traceId}-${parentSpanId}-1`,
      baggage: `sentry-trace_id=${traceId},sentry-environment=qa,sentry-public_key=username,sentry-sample_rate=1,sentry-sampled=true`,
    },
  });

  const span = await spanPromise;

  expect(span.name).toBe('GET /performance/server-loader');
  expect(getSpanOp(span)).toBe('http.server');
  expect(span.parent_span_id).toBe(parentSpanId);
});
