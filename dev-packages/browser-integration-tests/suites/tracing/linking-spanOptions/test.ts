import { expect } from '@playwright/test';
import { sentryTest } from '../../../utils/fixtures';
import { shouldSkipTracingTest } from '../../../utils/helpers';
import { collectStreamedSpans, waitForStreamedSpan } from '../../../utils/spanUtils';

sentryTest('should link spans by adding "links" to span options', async ({ getLocalTestUrl, page }) => {
  if (shouldSkipTracingTest()) {
    sentryTest.skip();
  }

  const rootSpan1Promise = waitForStreamedSpan(page, event => event.name === 'rootSpan1');
  const rootSpan2Promise = waitForStreamedSpan(page, event => event.name === 'rootSpan2');
  const rootSpan3Promise = waitForStreamedSpan(page, event => event.name === 'rootSpan3');

  const allSpans = collectStreamedSpans(page);
  const url = await getLocalTestUrl({ testDir: __dirname });
  await page.goto(url);

  const rootSpan1 = await rootSpan1Promise;
  const rootSpan2 = await rootSpan2Promise;
  const rootSpan3 = await rootSpan3Promise;

  const rootSpan1_traceId = rootSpan1.trace_id as string;
  const rootSpan1_spanId = rootSpan1.span_id as string;
  const rootSpan2_traceId = rootSpan2.trace_id as string;
  const rootSpan2_spanId = rootSpan2.span_id as string;

  expect(rootSpan1.name).toBe('rootSpan1');
  expect(allSpans.filter(span => span.parent_span_id === rootSpan1.span_id)).toEqual([]);

  expect(rootSpan3.name).toBe('rootSpan3');
  expect(allSpans.filter(span => span.parent_span_id === rootSpan3.span_id)?.length).toBe(1);
  expect(allSpans.find(span => span.name === 'childSpan3.1')?.name).toBe('childSpan3.1');

  expect(rootSpan3.links?.length).toBe(2);
  expect(rootSpan3.links).toEqual([
    {
      attributes: {},
      sampled: true,
      span_id: rootSpan1_spanId,
      trace_id: rootSpan1_traceId,
    },
    {
      attributes: { 'sentry.link.type': { type: 'string', value: 'previous_trace' } },
      sampled: true,
      span_id: rootSpan2_spanId,
      trace_id: rootSpan2_traceId,
    },
  ]);
});
