import { expect } from '@playwright/test';
import { SEMANTIC_LINK_ATTRIBUTE_LINK_TYPE } from '@sentry/core';
import { sentryTest } from '../../../../../utils/fixtures';
import { shouldSkipTracingTest } from '../../../../../utils/helpers';
import { getSpanOp, waitForStreamedSpan } from '../../../../../utils/spanUtils';

sentryTest(
  "links back to previous trace's local root span if continued from meta tags",
  async ({ getLocalTestUrl, page }) => {
    if (shouldSkipTracingTest()) {
      sentryTest.skip();
    }

    const url = await getLocalTestUrl({ testDir: __dirname });

    const metaTagTraceId = '12345678901234567890123456789012';

    const pageloadSpan = await sentryTest.step('Initial pageload', async () => {
      const pageloadSpanPromise = waitForStreamedSpan(page, span => getSpanOp(span) === 'pageload');
      await page.goto(url);
      const span = await pageloadSpanPromise;

      // sanity check
      expect(span.trace_id).toBe(metaTagTraceId);
      expect(span.links).toBeUndefined();

      return span;
    });

    const navigationSpan = await sentryTest.step('Navigation', async () => {
      const navigationSpanPromise = waitForStreamedSpan(page, span => getSpanOp(span) === 'navigation');
      await page.goto(`${url}#foo`);
      return navigationSpanPromise;
    });

    expect(navigationSpan.links).toEqual([
      {
        trace_id: metaTagTraceId,
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

    expect(navigationSpan.trace_id).not.toEqual(metaTagTraceId);
  },
);
