import { expect } from '@playwright/test';
import type { Event } from '@sentry/core';
import { sentryTest } from '../../../utils/fixtures';
import { getMultipleSentryEnvelopeRequests, shouldSkipTracingTest } from '../../../utils/helpers';

sentryTest('should link spans by adding "links" to span options', async ({ getLocalTestUrl, page }) => {
  if (shouldSkipTracingTest()) {
    sentryTest.skip();
  }

  const url = await getLocalTestUrl({ testDir: __dirname });
  const [rootSpan1, rootSpan2, rootSpan3] = await getMultipleSentryEnvelopeRequests<Event>(page, 3, { url });

  const rootSpan1_traceId = rootSpan1.contexts?.trace?.trace_id as string;
  const rootSpan1_spanId = rootSpan1.contexts?.trace?.span_id as string;
  const rootSpan2_traceId = rootSpan2.contexts?.trace?.trace_id as string;
  const rootSpan2_spanId = rootSpan2.contexts?.trace?.span_id as string;

  expect(rootSpan1.transaction).toBe('rootSpan1');
  expect(rootSpan1.spans).toEqual([]);

  expect(rootSpan3.transaction).toBe('rootSpan3');
  expect(rootSpan3.spans?.length).toBe(1);
  expect(rootSpan3.spans?.[0].description).toBe('childSpan3.1');

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
