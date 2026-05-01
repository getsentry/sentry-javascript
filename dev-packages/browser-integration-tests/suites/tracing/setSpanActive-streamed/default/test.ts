import { expect } from '@playwright/test';
import { sentryTest } from '../../../../utils/fixtures';
import { shouldSkipTracingTest } from '../../../../utils/helpers';
import { waitForStreamedSpans } from '../../../../utils/spanUtils';

sentryTest('sets an inactive span active and adds child spans to it', async ({ getLocalTestUrl, page }) => {
  sentryTest.skip(shouldSkipTracingTest());

  const spansPromise = waitForStreamedSpans(page, spans => spans.some(s => s.name === 'checkout-flow' && s.is_segment));

  const url = await getLocalTestUrl({ testDir: __dirname });
  await page.goto(url);

  const spans = await spansPromise;
  const checkoutSpan = spans.find(s => s.name === 'checkout-flow');
  const checkoutSpanId = checkoutSpan?.span_id;
  expect(checkoutSpanId).toMatch(/[a-f\d]{16}/);

  expect(spans.filter(s => !s.is_segment)).toHaveLength(3);

  const checkoutStep1 = spans.find(s => s.name === 'checkout-step-1');
  const checkoutStep11 = spans.find(s => s.name === 'checkout-step-1-1');
  const checkoutStep2 = spans.find(s => s.name === 'checkout-step-2');

  expect(checkoutStep1).toBeDefined();
  expect(checkoutStep11).toBeDefined();
  expect(checkoutStep2).toBeDefined();

  expect(checkoutStep1?.parent_span_id).toBe(checkoutSpanId);
  expect(checkoutStep2?.parent_span_id).toBe(checkoutSpanId);

  // despite 1-1 being called within 1, it's still parented to the root span
  // due to this being default behaviour in browser environments
  expect(checkoutStep11?.parent_span_id).toBe(checkoutSpanId);
});
