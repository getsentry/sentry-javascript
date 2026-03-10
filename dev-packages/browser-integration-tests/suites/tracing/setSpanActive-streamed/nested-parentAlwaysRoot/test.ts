import { expect } from '@playwright/test';
import { sentryTest } from '../../../../utils/fixtures';
import { shouldSkipTracingTest, testingCdnBundle } from '../../../../utils/helpers';
import { waitForStreamedSpans } from '../../../../utils/spanUtils';

sentryTest(
  'nested calls to setActiveSpanInBrowser with parentSpanIsAlwaysRootSpan=false result in correct parenting',
  async ({ getLocalTestUrl, page }) => {
    sentryTest.skip(shouldSkipTracingTest() || testingCdnBundle());

    const checkoutSpansPromise = waitForStreamedSpans(page, spans =>
      spans.some(s => s.name === 'checkout-flow' && s.is_segment),
    );

    const url = await getLocalTestUrl({ testDir: __dirname });
    await page.goto(url);

    const checkoutSpans = await checkoutSpansPromise;

    const checkoutSpan = checkoutSpans.find(s => s.name === 'checkout-flow');
    const postCheckoutSpan = checkoutSpans.find(s => s.name === 'post-checkout');

    const checkoutSpanId = checkoutSpan?.span_id;
    const postCheckoutSpanId = postCheckoutSpan?.span_id;

    expect(checkoutSpanId).toMatch(/[a-f\d]{16}/);
    expect(postCheckoutSpanId).toMatch(/[a-f\d]{16}/);

    expect(checkoutSpans.filter(s => !s.is_segment)).toHaveLength(5);

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

    // with parentSpanIsAlwaysRootSpan=false, 2-1 is parented to 2 because
    // 2 was the active span when 2-1 was started
    expect(checkoutStep21?.parent_span_id).toBe(checkoutStep2?.span_id);

    // since the parent of three is `checkoutSpan`, we correctly reset
    // the active span to `checkoutSpan` after 2 ended
    expect(checkoutStep3?.parent_span_id).toBe(checkoutSpanId);

    // post-checkout trace is started as a new trace because ending checkoutSpan removes the active
    // span on the scope
    const postCheckoutStep1 = checkoutSpans.find(s => s.name === 'post-checkout-1');
    expect(postCheckoutStep1).toBeDefined();
    expect(postCheckoutStep1?.parent_span_id).toBe(postCheckoutSpanId);
  },
);
