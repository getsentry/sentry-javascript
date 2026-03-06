import { expect } from '@playwright/test';
import { sentryTest } from '../../../../utils/fixtures';
import { shouldSkipTracingTest, testingCdnBundle } from '../../../../utils/helpers';
import { waitForStreamedSpans } from '../../../../utils/spanUtils';

sentryTest(
  'nested calls to setActiveSpanInBrowser still parent to root span by default',
  async ({ getLocalTestUrl, page }) => {
    sentryTest.skip(shouldSkipTracingTest() || testingCdnBundle());

    const checkoutSpansPromise = waitForStreamedSpans(page, spans =>
      spans.some(s => s.name === 'checkout-flow' && s.is_segment),
    );
    const postCheckoutSpansPromise = waitForStreamedSpans(page, spans =>
      spans.some(s => s.name === 'post-checkout' && s.is_segment),
    );

    const url = await getLocalTestUrl({ testDir: __dirname });
    await page.goto(url);

    const checkoutSpans = await checkoutSpansPromise;
    const postCheckoutSpans = await postCheckoutSpansPromise;

    const checkoutSpan = checkoutSpans.find(s => s.name === 'checkout-flow');
    const postCheckoutSpan = postCheckoutSpans.find(s => s.name === 'post-checkout');

    const checkoutSpanId = checkoutSpan?.span_id;
    const postCheckoutSpanId = postCheckoutSpan?.span_id;

    expect(checkoutSpanId).toMatch(/[a-f\d]{16}/);
    expect(postCheckoutSpanId).toMatch(/[a-f\d]{16}/);

    expect(checkoutSpans.filter(s => !s.is_segment)).toHaveLength(4);
    expect(postCheckoutSpans.filter(s => !s.is_segment)).toHaveLength(1);

    const checkoutStep1 = checkoutSpans.find(s => s.name === 'checkout-step-1');
    const checkoutStep2 = checkoutSpans.find(s => s.name === 'checkout-step-2');
    const checkoutStep21 = checkoutSpans.find(s => s.name === 'checkout-step-2-1');
    const checkoutStep3 = checkoutSpans.find(s => s.name === 'checkout-step-3');

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

    const postCheckoutStep1 = postCheckoutSpans.find(s => s.name === 'post-checkout-1');
    expect(postCheckoutStep1).toBeDefined();
    expect(postCheckoutStep1?.parent_span_id).toBe(postCheckoutSpanId);
  },
);
