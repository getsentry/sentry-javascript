import { expect } from '@playwright/test';
import { sentryTest } from '../../../../utils/fixtures';
import { envelopeRequestParser, shouldSkipTracingTest, waitForTransactionRequest } from '../../../../utils/helpers';

sentryTest('sets an inactive span active and adds child spans to it', async ({ getLocalTestUrl, page }) => {
  if (shouldSkipTracingTest()) {
    sentryTest.skip();
  }

  const req = waitForTransactionRequest(page, e => e.transaction === 'checkout-flow');

  const url = await getLocalTestUrl({ testDir: __dirname });
  await page.goto(url);

  const checkoutEvent = envelopeRequestParser(await req);
  const checkoutSpanId = checkoutEvent.contexts?.trace?.span_id;
  expect(checkoutSpanId).toMatch(/[a-f\d]{16}/);

  expect(checkoutEvent.spans).toHaveLength(3);

  const checkoutStep1 = checkoutEvent.spans?.find(s => s.description === 'checkout-step-1');
  const checkoutStep11 = checkoutEvent.spans?.find(s => s.description === 'checkout-step-1-1');
  const checkoutStep2 = checkoutEvent.spans?.find(s => s.description === 'checkout-step-2');

  expect(checkoutStep1).toBeDefined();
  expect(checkoutStep11).toBeDefined();
  expect(checkoutStep2).toBeDefined();

  expect(checkoutStep1?.parent_span_id).toBe(checkoutSpanId);
  expect(checkoutStep2?.parent_span_id).toBe(checkoutSpanId);

  // despite 1-1 being called within 1, it's still parented to the root span
  // due to this being default behaviour in browser environments
  expect(checkoutStep11?.parent_span_id).toBe(checkoutSpanId);
});
