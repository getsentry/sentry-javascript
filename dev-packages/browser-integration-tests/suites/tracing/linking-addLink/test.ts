import { expect } from '@playwright/test';
import type { Event, SpanJSON } from '@sentry/core';
import { sentryTest } from '../../../utils/fixtures';
import { getMultipleSentryEnvelopeRequests, shouldSkipTracingTest } from '../../../utils/helpers';

sentryTest('should link spans with addLink() in trace context', async ({ getLocalTestUrl, page }) => {
  if (shouldSkipTracingTest()) {
    sentryTest.skip();
  }

  const url = await getLocalTestUrl({ testDir: __dirname });
  const [rootSpan1, rootSpan2] = await getMultipleSentryEnvelopeRequests<Event>(page, 3, { url });

  const rootSpan1_traceId = rootSpan1.contexts?.trace?.trace_id as string;
  const rootSpan1_spanId = rootSpan1.contexts?.trace?.span_id as string;

  expect(rootSpan1.transaction).toBe('rootSpan1');
  expect(rootSpan1.spans).toEqual([]);

  expect(rootSpan2.transaction).toBe('rootSpan2');
  expect(rootSpan2.spans).toEqual([]);

  expect(rootSpan2.contexts?.trace?.links?.length).toBe(1);
  expect(rootSpan2.contexts?.trace?.links?.[0]).toMatchObject({
    attributes: { 'sentry.link.type': 'previous_trace' },
    sampled: true,
    span_id: rootSpan1_spanId,
    trace_id: rootSpan1_traceId,
  });
});

sentryTest('should link spans with addLink() in nested startSpan() calls', async ({ getLocalTestUrl, page }) => {
  if (shouldSkipTracingTest()) {
    sentryTest.skip();
  }

  const url = await getLocalTestUrl({ testDir: __dirname });
  const events = await getMultipleSentryEnvelopeRequests<Event>(page, 3, { url });
  const [rootSpan1, /* rootSpan2 */ , rootSpan3] = events;

  const rootSpan1_traceId = rootSpan1.contexts?.trace?.trace_id as string;
  const rootSpan1_spanId = rootSpan1.contexts?.trace?.span_id as string;

  const [childSpan_3_1, childSpan_3_2] = rootSpan3.spans as [SpanJSON, SpanJSON];
  const rootSpan3_traceId = rootSpan3.contexts?.trace?.trace_id as string;
  const rootSpan3_spanId = rootSpan3.contexts?.trace?.span_id as string;

  expect(rootSpan3.transaction).toBe('rootSpan3');

  expect(childSpan_3_1.description).toBe('childSpan3.1');
  expect(childSpan_3_1.links?.length).toBe(1);
  expect(childSpan_3_1.links?.[0]).toMatchObject({
    attributes: { 'sentry.link.type': 'previous_trace' },
    sampled: true,
    span_id: rootSpan1_spanId,
    trace_id: rootSpan1_traceId,
  });

  expect(childSpan_3_2.description).toBe('childSpan3.2');
  expect(childSpan_3_2.links?.[0]).toMatchObject({
    sampled: true,
    span_id: rootSpan3_spanId,
    trace_id: rootSpan3_traceId,
  });
});
