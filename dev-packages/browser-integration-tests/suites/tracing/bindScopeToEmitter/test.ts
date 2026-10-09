import { expect } from '@playwright/test';
import { sentryTest } from '../../../utils/fixtures';
import { shouldSkipCdnBundleTest, shouldSkipTracingTest } from '../../../utils/helpers';
import { waitForStreamedSpan } from '../../../utils/spanUtils';

sentryTest('bindScopeToEmitter runs listeners with the bound scope active', async ({ getLocalTestUrl, page }) => {
  // `bindScopeToEmitter` is not exported from the CDN bundles, only from npm.
  if (shouldSkipTracingTest() || shouldSkipCdnBundleTest()) {
    sentryTest.skip();
  }

  const rootSpanPromise = waitForStreamedSpan(page, span => span.name === 'parent');
  const childSpanPromise = waitForStreamedSpan(page, span => span.name === 'child-bound');

  const url = await getLocalTestUrl({ testDir: __dirname });
  await page.goto(url);

  const [parentEvent, childBound] = await Promise.all([rootSpanPromise, childSpanPromise]);
  const parentSpanId = parentEvent.span_id;
  const parentTraceId = parentEvent.trace_id;
  expect(parentSpanId).toMatch(/[a-f\d]{16}/);

  // The listener fired while no span was active, yet `child-bound` is nested under `parent`
  // because the parent scope was bound to the emitter.
  expect(childBound).toBeDefined();
  expect(childBound?.parent_span_id).toBe(parentSpanId);
  expect(childBound?.trace_id).toBe(parentTraceId);
});
