import { expect } from '@playwright/test';
import { SEMANTIC_LINK_ATTRIBUTE_LINK_TYPE } from '@sentry/core';
import { sentryTest } from '../../../../../utils/fixtures';
import { shouldSkipTracingTest, testingCdnBundle } from '../../../../../utils/helpers';
import { getSpanOp, waitForStreamedSpan } from '../../../../../utils/spanUtils';

sentryTest('manually started custom traces are linked correctly in the chain', async ({ getLocalTestUrl, page }) => {
  sentryTest.skip(shouldSkipTracingTest() || testingCdnBundle());

  const url = await getLocalTestUrl({ testDir: __dirname });

  const pageloadSpan = await sentryTest.step('Initial pageload', async () => {
    const pageloadSpanPromise = waitForStreamedSpan(page, span => getSpanOp(span) === 'pageload');
    await page.goto(url);
    return pageloadSpanPromise;
  });

  const customTraceSpan = await sentryTest.step('Custom trace', async () => {
    const customSpanPromise = waitForStreamedSpan(page, span => getSpanOp(span) === 'custom');
    await page.locator('#btn1').click();
    const span = await customSpanPromise;

    expect(span.trace_id).not.toEqual(pageloadSpan.trace_id);
    expect(span.links).toEqual([
      {
        trace_id: pageloadSpan.trace_id,
        span_id: pageloadSpan.span_id,
        sampled: true,
        attributes: {
          [SEMANTIC_LINK_ATTRIBUTE_LINK_TYPE]: {
            type: 'string',
            value: 'previous_trace',
          },
        },
      },
    ]);

    return span;
  });

  await sentryTest.step('Navigation', async () => {
    const navigationSpanPromise = waitForStreamedSpan(page, span => getSpanOp(span) === 'navigation');
    await page.goto(`${url}#foo`);
    const navSpan = await navigationSpanPromise;

    expect(navSpan.trace_id).not.toEqual(customTraceSpan.trace_id);
    expect(navSpan.trace_id).not.toEqual(pageloadSpan.trace_id);

    expect(navSpan.links).toEqual([
      {
        trace_id: customTraceSpan.trace_id,
        span_id: customTraceSpan.span_id,
        sampled: true,
        attributes: {
          [SEMANTIC_LINK_ATTRIBUTE_LINK_TYPE]: {
            type: 'string',
            value: 'previous_trace',
          },
        },
      },
    ]);
  });
});
