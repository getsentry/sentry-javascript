import { expect } from '@playwright/test';
import { sentryTest } from '../../../../utils/fixtures';
import { envelopeRequestParser, shouldSkipTracingTest, waitForTransactionRequest } from '../../../../utils/helpers';

sentryTest(
  'nested calls to setActiveSpanInBrowser with parentSpanIsAlwaysRootSpan=false result in correct parenting',
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

    // with parentSpanIsAlwaysRootSpan=false, 2-1 is parented to 2 because
    // 2 was the active span when 2-1 was started
    expect(checkoutStep21?.parent_span_id).toBe(checkoutStep2?.span_id);

    // since the parent of three is `checkoutSpan`, we correctly reset
    // the active span to `checkoutSpan` after 2 ended
    expect(checkoutStep3?.parent_span_id).toBe(checkoutSpanId);

    // post-checkout trace is started as a new trace because ending checkoutSpan removes the active
    // span on the scope
    const postCheckoutStep1 = postCheckoutEvent.spans?.find(s => s.description === 'post-checkout-1');
    expect(postCheckoutStep1).toBeDefined();
    expect(postCheckoutStep1?.parent_span_id).toBe(postCheckoutSpanId);
  },
);
