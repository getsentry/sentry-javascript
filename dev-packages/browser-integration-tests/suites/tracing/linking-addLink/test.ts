import { SENTRY_LINK_TYPE } from '@sentry/conventions/attributes';
sentryTest('links spans with addLink() in trace context', async ({ getLocalTestUrl, page }) => {
  sentryTest.skip(shouldSkipTracingTest());

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
    attributes: { [SENTRY_LINK_TYPE]: { type: 'string', value: 'previous_trace' } },
    sampled: true,
    span_id: rootSpan1.span_id,
    trace_id: rootSpan1.trace_id,
  });
});
import { expect } from '@playwright/test';
import { sentryTest } from '../../../utils/fixtures';
import { shouldSkipTracingTest } from '../../../utils/helpers';
import { waitForStreamedSpan } from '../../../utils/spanUtils';

sentryTest('links spans with addLink() in nested startSpan() calls', async ({ getLocalTestUrl, page }) => {
  sentryTest.skip(shouldSkipTracingTest());

  const rootSpan1Promise = waitForStreamedSpan(page, s => s.name === 'rootSpan1' && !!s.is_segment);
  const rootSpan3Promise = waitForStreamedSpan(page, span => span.name === 'rootSpan3' && span.is_segment);
  const childSpan1Promise = waitForStreamedSpan(page, span => span.name === 'childSpan3.1');
  const childSpan2Promise = waitForStreamedSpan(page, span => span.name === 'childSpan3.2');

  const url = await getLocalTestUrl({ testDir: __dirname });
  await page.goto(url);

  const rootSpan1 = await rootSpan1Promise;
  const [rootSpan3, childSpan1, childSpan2] = await Promise.all([
    rootSpan3Promise,
    childSpan1Promise,
    childSpan2Promise,
  ]);

  expect(rootSpan3.name).toBe('rootSpan3');

  expect(childSpan1.name).toBe('childSpan3.1');
  expect(childSpan1.links).toHaveLength(1);
  expect(childSpan1.links?.[0]).toMatchObject({
    attributes: { [SENTRY_LINK_TYPE]: { type: 'string', value: 'previous_trace' } },
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
