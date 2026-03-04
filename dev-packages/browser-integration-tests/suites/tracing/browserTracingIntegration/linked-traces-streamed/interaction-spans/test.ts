import { expect } from '@playwright/test';
import { SEMANTIC_LINK_ATTRIBUTE_LINK_TYPE } from '@sentry/core';
import { sentryTest } from '../../../../../utils/fixtures';
import { shouldSkipTracingTest } from '../../../../../utils/helpers';
import { getSpanOp, waitForStreamedSpan } from '../../../../../utils/spanUtils';

/*
  This is quite peculiar behavior but it's a result of the route-based trace lifetime.
  Once we shortened trace lifetime, this whole scenario will change as the interaction
  spans will be their own trace. So most likely, we can replace this test with a new one
  that covers the new default behavior.
*/
sentryTest(
  'only the first root spans in the trace link back to the previous trace',
  async ({ getLocalTestUrl, page }) => {
    if (shouldSkipTracingTest()) {
      sentryTest.skip();
    }

    const url = await getLocalTestUrl({ testDir: __dirname });

    const pageloadSpan = await sentryTest.step('Initial pageload', async () => {
      const pageloadSpanPromise = waitForStreamedSpan(page, span => getSpanOp(span) === 'pageload');
      await page.goto(url);
      const span = await pageloadSpanPromise;

      expect(span).toBeDefined();
      expect(span.links).toBeUndefined();

      return span;
    });

    await sentryTest.step('Click Before navigation', async () => {
      const interactionSpanPromise = waitForStreamedSpan(page, span => getSpanOp(span) === 'ui.action.click');
      await page.click('#btn');
      const interactionSpan = await interactionSpanPromise;

      // sanity check: route-based trace lifetime means the trace_id should be the same
      expect(interactionSpan.trace_id).toBe(pageloadSpan.trace_id);

      // no links yet as previous root span belonged to same trace
      expect(interactionSpan.links).toBeUndefined();
    });

    const navigationSpan = await sentryTest.step('Navigation', async () => {
      const navigationSpanPromise = waitForStreamedSpan(page, span => getSpanOp(span) === 'navigation');
      await page.goto(`${url}#foo`);
      const span = await navigationSpanPromise;

      expect(getSpanOp(span)).toBe('navigation');
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

      expect(span.trace_id).not.toEqual(span.links![0].trace_id);
      return span;
    });

    await sentryTest.step('Click After navigation', async () => {
      const interactionSpanPromise = waitForStreamedSpan(page, span => getSpanOp(span) === 'ui.action.click');
      await page.click('#btn');
      const interactionSpan = await interactionSpanPromise;

      // sanity check: route-based trace lifetime means the trace_id should be the same
      expect(interactionSpan.trace_id).toBe(navigationSpan.trace_id);

      // since this is the second root span in the trace, it doesn't link back to the previous trace
      expect(interactionSpan.links).toBeUndefined();
    });
  },
);
