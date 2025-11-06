import { expect } from '@playwright/test';
import type { Event } from '@sentry/browser';
import { sentryTest } from '../../../../utils/fixtures';
import { getMultipleSentryEnvelopeRequests, shouldSkipTracingTest } from '../../../../utils/helpers';

sentryTest('errors in TwP mode have same trace ID & span IDs', async ({ getLocalTestUrl, page }) => {
  if (shouldSkipTracingTest()) {
    sentryTest.skip();
  }

  const traceId = '12312012123120121231201212312012';
  const spanId = '1121201211212012';

  const url = await getLocalTestUrl({ testDir: __dirname });
  const [event1, event2] = await getMultipleSentryEnvelopeRequests<Event>(page, 2, { url });

  // Ensure these are the actual errors we care about
  expect(event1.exception?.values?.[0].value).toContain('test error');
  expect(event2.exception?.values?.[0].value).toContain('test error');

  const contexts1 = event1.contexts;
  const { trace_id: traceId1, span_id: spanId1 } = contexts1?.trace || {};
  expect(traceId1).toEqual(traceId);

  // Span ID is a virtual span, not the propagated one
  expect(spanId1).not.toEqual(spanId);
  expect(spanId1).toMatch(/^[a-f\d]{16}$/);

  const contexts2 = event2.contexts;
  const { trace_id: traceId2, span_id: spanId2 } = contexts2?.trace || {};
  expect(traceId2).toEqual(traceId);
  expect(spanId2).toMatch(/^[a-f\d]{16}$/);

  expect(spanId2).toEqual(spanId1);
});
