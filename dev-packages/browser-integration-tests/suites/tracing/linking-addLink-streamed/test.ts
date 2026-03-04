import { expect } from '@playwright/test';
import { sentryTest } from '../../../utils/fixtures';
import { shouldSkipTracingTest } from '../../../utils/helpers';
import { waitForStreamedSpan, waitForStreamedSpans } from '../../../utils/spanUtils';

sentryTest('should link spans with addLink() in trace context', async ({ getLocalTestUrl, page }) => {
  if (shouldSkipTracingTest()) {
    sentryTest.skip();
  }

  const rootSpan1Promise = waitForStreamedSpan(page, s => s.name === 'rootSpan1' && !!s.is_segment);
  const rootSpan2Promise = waitForStreamedSpan(page, s => s.name === 'rootSpan2' && !!s.is_segment);

  const url = await getLocalTestUrl({ testDir: __dirname });
  await page.goto(url);

  const rootSpan1 = await rootSpan1Promise;
  const rootSpan2 = await rootSpan2Promise;

  expect(rootSpan1.name).toBe('rootSpan1');
  expect(rootSpan1.links).toBeUndefined();

  expect(rootSpan2.name).toBe('rootSpan2');
  expect(rootSpan2.links).toHaveLength(1);
  expect(rootSpan2.links?.[0]).toMatchObject({
    attributes: { 'sentry.link.type': { type: 'string', value: 'previous_trace' } },
    sampled: true,
    span_id: rootSpan1.span_id,
    trace_id: rootSpan1.trace_id,
  });
});

sentryTest('should link spans with addLink() in nested startSpan() calls', async ({ getLocalTestUrl, page }) => {
  if (shouldSkipTracingTest()) {
    sentryTest.skip();
  }

  const rootSpan1Promise = waitForStreamedSpan(page, s => s.name === 'rootSpan1' && !!s.is_segment);
  const rootSpan3SpansPromise = waitForStreamedSpans(page, spans =>
    spans.some(s => s.name === 'rootSpan3' && s.is_segment),
  );

  const url = await getLocalTestUrl({ testDir: __dirname });
  await page.goto(url);

  const rootSpan1 = await rootSpan1Promise;
  const rootSpan3Spans = await rootSpan3SpansPromise;

  const rootSpan3 = rootSpan3Spans.find(s => s.name === 'rootSpan3')!;
  const childSpan1 = rootSpan3Spans.find(s => s.name === 'childSpan3.1')!;
  const childSpan2 = rootSpan3Spans.find(s => s.name === 'childSpan3.2')!;

  expect(rootSpan3.name).toBe('rootSpan3');

  expect(childSpan1.name).toBe('childSpan3.1');
  expect(childSpan1.links).toHaveLength(1);
  expect(childSpan1.links?.[0]).toMatchObject({
    attributes: { 'sentry.link.type': { type: 'string', value: 'previous_trace' } },
    sampled: true,
    span_id: rootSpan1.span_id,
    trace_id: rootSpan1.trace_id,
  });

  expect(childSpan2.name).toBe('childSpan3.2');
  expect(childSpan2.links?.[0]).toMatchObject({
    sampled: true,
    span_id: rootSpan3.span_id,
    trace_id: rootSpan3.trace_id,
  });
});
