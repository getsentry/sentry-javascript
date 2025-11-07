import { expect } from '@playwright/test';
import { sentryTest } from '../../../../utils/fixtures';
import { envelopeRequestParser, shouldSkipTracingTest, waitForTransactionRequest } from '../../../../utils/helpers';

sentryTest(
  'nested calls to setActiveSpanInBrowser still parent to root span by default',
  async ({ getLocalTestUrl, page }) => {
    if (shouldSkipTracingTest()) {
      sentryTest.skip();
    }

    const req = waitForTransactionRequest(page, e => e.transaction === 'checkout-flow');
    const postCheckoutReq = waitForTransactionRequest(page, e => e.transaction === 'post-checkout');

    const url = await getLocalTestUrl({ testDir: __dirname });
    await page.goto(url);

    const checkoutEvent = envelopeRequestParser(await req);
    const postCheckoutEvent = envelopeRequestParser(await postCheckoutReq);

    const checkoutSpanId = checkoutEvent.contexts?.trace?.span_id;
    const postCheckoutSpanId = postCheckoutEvent.contexts?.trace?.span_id;

    expect(checkoutSpanId).toMatch(/[a-f\d]{16}/);
    expect(postCheckoutSpanId).toMatch(/[a-f\d]{16}/);

    expect(checkoutEvent.spans).toHaveLength(4);
    expect(postCheckoutEvent.spans).toHaveLength(1);

    const checkoutStep1 = checkoutEvent.spans?.find(s => s.description === 'checkout-step-1');
    const checkoutStep2 = checkoutEvent.spans?.find(s => s.description === 'checkout-step-2');
    const checkoutStep21 = checkoutEvent.spans?.find(s => s.description === 'checkout-step-2-1');
    const checkoutStep3 = checkoutEvent.spans?.find(s => s.description === 'checkout-step-3');

    expect(checkoutStep1).toBeDefined();
    expect(checkoutStep2).toBeDefined();
    expect(checkoutStep21).toBeDefined();
    expect(checkoutStep3).toBeDefined();

    expect(checkoutStep1?.parent_span_id).toBe(checkoutSpanId);
    expect(checkoutStep2?.parent_span_id).toBe(checkoutSpanId);
    expect(checkoutStep3?.parent_span_id).toBe(checkoutSpanId);

    // despite 2-1 being called within 2 AND setting 2 as active span, it's still parented to the
    // root span due to this being default behaviour in browser environments
    expect(checkoutStep21?.parent_span_id).toBe(checkoutSpanId);

    const postCheckoutStep1 = postCheckoutEvent.spans?.find(s => s.description === 'post-checkout-1');
    expect(postCheckoutStep1).toBeDefined();
    expect(postCheckoutStep1?.parent_span_id).toBe(postCheckoutSpanId);
  },
);
