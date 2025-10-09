import { expect } from '@playwright/test';
import type { Event } from '@sentry/browser';
import { sentryTest } from '../../../../utils/fixtures';
import { getMultipleSentryEnvelopeRequests, shouldSkipTracingTest } from '../../../../utils/helpers';

sentryTest('errors in TwP mode have same trace ID & span IDs', async ({ getLocalTestUrl, page }) => {
  if (shouldSkipTracingTest()) {
    sentryTest.skip();
  }

  const META_TRACE_ID = '12312012123120121231201212312012';
  const META_PARENT_SPAN_ID = '1121201211212012';

  const url = await getLocalTestUrl({ testDir: __dirname });
  const [event1, event2] = await getMultipleSentryEnvelopeRequests<Event>(page, 2, { url });

  // Ensure these are the actual errors we care about
  expect(event1.exception?.values?.[0].value).toContain('test error');
  expect(event2.exception?.values?.[0].value).toContain('test error');

  const contexts1 = event1.contexts;
  const { trace_id: traceId1, span_id: spanId1 } = contexts1?.trace || {};
  expect(traceId1).toEqual(META_TRACE_ID);

  // Span ID is a virtual span in TwP mode, not the propagated one
  expect(spanId1).not.toEqual(META_PARENT_SPAN_ID);
  expect(spanId1).toMatch(/^[a-f0-9]{16}$/);

  const contexts2 = event2.contexts;
  const { trace_id: traceId2, span_id: spanId2 } = contexts2?.trace || {};
  expect(traceId2).toEqual(META_TRACE_ID);
  expect(spanId2).toMatch(/^[a-f0-9]{16}$/);

  expect(spanId2).toEqual(spanId1);
});
