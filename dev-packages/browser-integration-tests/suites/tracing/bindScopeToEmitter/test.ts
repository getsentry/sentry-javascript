import { expect } from '@playwright/test';
import { sentryTest } from '../../../utils/fixtures';
import {
  envelopeRequestParser,
  shouldSkipCdnBundleTest,
  shouldSkipTracingTest,
  waitForTransactionRequest,
} from '../../../utils/helpers';

sentryTest('bindScopeToEmitter runs listeners with the bound scope active', async ({ getLocalTestUrl, page }) => {
  // `bindScopeToEmitter` is not exported from the CDN bundles, only from npm.
  if (shouldSkipTracingTest() || shouldSkipCdnBundleTest()) {
    sentryTest.skip();
  }

  const req = waitForTransactionRequest(page, e => e.transaction === 'parent');

  const url = await getLocalTestUrl({ testDir: __dirname });
  await page.goto(url);

  const parentEvent = envelopeRequestParser(await req);
  const parentSpanId = parentEvent.contexts?.trace?.span_id;
  const parentTraceId = parentEvent.contexts?.trace?.trace_id;
  expect(parentSpanId).toMatch(/[a-f\d]{16}/);

  // The listener fired while no span was active, yet `child-bound` is nested under `parent`
  // because the parent scope was bound to the emitter.
  const childBound = parentEvent.spans?.find(s => s.description === 'child-bound');
  expect(childBound).toBeDefined();
  expect(childBound?.parent_span_id).toBe(parentSpanId);
  expect(childBound?.trace_id).toBe(parentTraceId);
});
