import { SENTRY_LINK_TYPE } from '@sentry/conventions/attributes';
import { expect } from '@playwright/test';
import { sentryTest } from '../../../utils/fixtures';
import { shouldSkipTracingTest } from '../../../utils/helpers';
import { collectStreamedSpans, waitForStreamedSpan } from '../../../utils/spanUtils';

sentryTest('should link spans with addLinks() in trace context', async ({ getLocalTestUrl, page }) => {
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

  expect(rootSpan1.name).toBe('rootSpan1');
  expect(allSpans.filter(span => span.parent_span_id === rootSpan1.span_id)).toEqual([]);

  const rootSpan2_traceId = rootSpan2.trace_id as string;
  const rootSpan2_spanId = rootSpan2.span_id as string;

  expect(rootSpan2.name).toBe('rootSpan2');
  expect(allSpans.filter(span => span.parent_span_id === rootSpan2.span_id)).toEqual([]);

  expect(rootSpan3.name).toBe('rootSpan3');
  expect(allSpans.filter(span => span.parent_span_id === rootSpan3.span_id)).toEqual([]);
  expect(rootSpan3.links?.length).toBe(2);
  expect(rootSpan3.links).toEqual([
    {
      attributes: {},
      sampled: true,
      span_id: rootSpan1_spanId,
      trace_id: rootSpan1_traceId,
    },
    {
      attributes: { [SENTRY_LINK_TYPE]: { type: 'string', value: 'previous_trace' } },
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

  const rootSpan2Promise = waitForStreamedSpan(page, event => event.name === 'rootSpan2');
  const rootSpan4Promise = waitForStreamedSpan(page, event => event.name === 'rootSpan4');

  const allSpans = collectStreamedSpans(page);
  const url = await getLocalTestUrl({ testDir: __dirname });
  await page.goto(url);

  const rootSpan2 = await rootSpan2Promise;
  const rootSpan4 = await rootSpan4Promise;

  const rootSpan2_traceId = rootSpan2.trace_id as string;
  const rootSpan2_spanId = rootSpan2.span_id as string;

  const childSpan_4_1 = allSpans.find(span => span.name === 'childSpan4.1')!;
  const childSpan_4_2 = allSpans.find(span => span.name === 'childSpan4.2')!;
  const rootSpan4_traceId = rootSpan4.trace_id as string;
  const rootSpan4_spanId = rootSpan4.span_id as string;

  expect(rootSpan4.name).toBe('rootSpan4');

  expect(childSpan_4_1.name).toBe('childSpan4.1');
  expect(childSpan_4_1.links).toBe(undefined);

  expect(childSpan_4_2.name).toBe('childSpan4.2');
  expect(childSpan_4_2.links?.length).toBe(2);
  expect(childSpan_4_2.links).toEqual([
    {
      attributes: {},
      sampled: true,
      span_id: rootSpan4_spanId,
      trace_id: rootSpan4_traceId,
    },
    {
      attributes: { [SENTRY_LINK_TYPE]: { type: 'string', value: 'previous_trace' } },
      sampled: true,
      span_id: rootSpan2_spanId,
      trace_id: rootSpan2_traceId,
    },
  ]);
});
