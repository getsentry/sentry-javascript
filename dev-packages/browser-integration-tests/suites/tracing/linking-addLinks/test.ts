import { expect } from '@playwright/test';
import type { Event, SpanJSON } from '@sentry/core';
import { sentryTest } from '../../../utils/fixtures';
import { getMultipleSentryEnvelopeRequests, shouldSkipTracingTest } from '../../../utils/helpers';

sentryTest('should link spans with addLinks() in trace context', async ({ getLocalTestUrl, page }) => {
  if (shouldSkipTracingTest()) {
    sentryTest.skip();
  }

  const url = await getLocalTestUrl({ testDir: __dirname });
  const [rootSpan1, rootSpan2, rootSpan3] = await getMultipleSentryEnvelopeRequests<Event>(page, 3, { url });

  const rootSpan1_traceId = rootSpan1.contexts?.trace?.trace_id as string;
  const rootSpan1_spanId = rootSpan1.contexts?.trace?.span_id as string;

  expect(rootSpan1.transaction).toBe('rootSpan1');
  expect(rootSpan1.spans).toEqual([]);

  const rootSpan2_traceId = rootSpan2.contexts?.trace?.trace_id as string;
  const rootSpan2_spanId = rootSpan2.contexts?.trace?.span_id as string;

  expect(rootSpan2.transaction).toBe('rootSpan2');
  expect(rootSpan2.spans).toEqual([]);

  expect(rootSpan3.transaction).toBe('rootSpan3');
  expect(rootSpan3.spans).toEqual([]);
  expect(rootSpan3.contexts?.trace?.links?.length).toBe(2);
  expect(rootSpan3.contexts?.trace?.links).toEqual([
    {
      sampled: true,
      span_id: rootSpan1_spanId,
      trace_id: rootSpan1_traceId,
    },
    {
      attributes: { 'sentry.link.type': 'previous_trace' },
      sampled: true,
      span_id: rootSpan2_spanId,
      trace_id: rootSpan2_traceId,
    },
  ]);
});

sentryTest('should link spans with addLinks() in nested startSpan() calls', async ({ getLocalTestUrl, page }) => {
  if (shouldSkipTracingTest()) {
    sentryTest.skip();
  }

  const url = await getLocalTestUrl({ testDir: __dirname });
  const events = await getMultipleSentryEnvelopeRequests<Event>(page, 4, { url });
  const [/* rootSpan1 */ , rootSpan2, /* rootSpan3 */ , rootSpan4] = events;

  const rootSpan2_traceId = rootSpan2.contexts?.trace?.trace_id as string;
  const rootSpan2_spanId = rootSpan2.contexts?.trace?.span_id as string;

  const [childSpan_4_1, childSpan_4_2] = rootSpan4.spans as [SpanJSON, SpanJSON];
  const rootSpan4_traceId = rootSpan4.contexts?.trace?.trace_id as string;
  const rootSpan4_spanId = rootSpan4.contexts?.trace?.span_id as string;

  expect(rootSpan4.transaction).toBe('rootSpan4');

  expect(childSpan_4_1.description).toBe('childSpan4.1');
  expect(childSpan_4_1.links).toBe(undefined);

  expect(childSpan_4_2.description).toBe('childSpan4.2');
  expect(childSpan_4_2.links?.length).toBe(2);
  expect(childSpan_4_2.links).toEqual([
    {
      sampled: true,
      span_id: rootSpan4_spanId,
      trace_id: rootSpan4_traceId,
    },
    {
      attributes: { 'sentry.link.type': 'previous_trace' },
      sampled: true,
      span_id: rootSpan2_spanId,
      trace_id: rootSpan2_traceId,
    },
  ]);
});
