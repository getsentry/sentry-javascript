import { expect } from '@playwright/test';
import { SEMANTIC_LINK_ATTRIBUTE_LINK_TYPE } from '@sentry/core';
import { sentryTest } from '../../../../../utils/fixtures';
import { envelopeRequestParser, shouldSkipTracingTest, waitForTransactionRequest } from '../../../../../utils/helpers';

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

    const pageloadTraceContext = await sentryTest.step('Initial pageload', async () => {
      const pageloadRequestPromise = waitForTransactionRequest(page, evt => evt.contexts?.trace?.op === 'pageload');
      await page.goto(url);

      const pageloadEvent = envelopeRequestParser(await pageloadRequestPromise);
      const traceContext = pageloadEvent.contexts?.trace;

      expect(traceContext).toBeDefined();
      expect(traceContext?.links).toBeUndefined();

      return traceContext;
    });

    await sentryTest.step('Click Before navigation', async () => {
      const interactionRequestPromise = waitForTransactionRequest(page, evt => {
        return evt.contexts?.trace?.op === 'ui.action.click';
      });
      await page.click('#btn');

      const interactionEvent = envelopeRequestParser(await interactionRequestPromise);
      const interactionTraceContext = interactionEvent.contexts?.trace;

      // sanity check: route-based trace lifetime means the trace_id should be the same
      expect(interactionTraceContext?.trace_id).toBe(pageloadTraceContext?.trace_id);

      // no links yet as previous root span belonged to same trace
      expect(interactionTraceContext?.links).toBeUndefined();
    });

    const navigationTraceContext = await sentryTest.step('Navigation', async () => {
      const navigationRequestPromise = waitForTransactionRequest(page, evt => evt.contexts?.trace?.op === 'navigation');
      await page.goto(`${url}#foo`);
      const navigationEvent = envelopeRequestParser(await navigationRequestPromise);

      const traceContext = navigationEvent.contexts?.trace;

      expect(traceContext?.op).toBe('navigation');
      expect(traceContext?.links).toEqual([
        {
          trace_id: pageloadTraceContext?.trace_id,
          span_id: pageloadTraceContext?.span_id,
          sampled: true,
          attributes: {
            [SEMANTIC_LINK_ATTRIBUTE_LINK_TYPE]: 'previous_trace',
          },
        },
      ]);

      expect(traceContext?.trace_id).not.toEqual(traceContext?.links![0].trace_id);
      return traceContext;
    });

    await sentryTest.step('Click After navigation', async () => {
      const interactionRequestPromise = waitForTransactionRequest(page, evt => {
        return evt.contexts?.trace?.op === 'ui.action.click';
      });
      await page.click('#btn');
      const interactionEvent = envelopeRequestParser(await interactionRequestPromise);

      const interactionTraceContext = interactionEvent.contexts?.trace;

      // sanity check: route-based trace lifetime means the trace_id should be the same
      expect(interactionTraceContext?.trace_id).toBe(navigationTraceContext?.trace_id);

      // since this is the second root span in the trace, it doesn't link back to the previous trace
      expect(interactionTraceContext?.links).toBeUndefined();
    });
  },
);
