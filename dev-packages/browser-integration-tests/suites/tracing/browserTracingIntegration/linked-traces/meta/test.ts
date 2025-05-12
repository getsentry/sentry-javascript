import { expect } from '@playwright/test';
import { SEMANTIC_LINK_ATTRIBUTE_LINK_TYPE } from '@sentry/core';
import { sentryTest } from '../../../../../utils/fixtures';
import { envelopeRequestParser, shouldSkipTracingTest, waitForTransactionRequest } from '../../../../../utils/helpers';

sentryTest(
  "links back to previous trace's local root span if continued from meta tags",
  async ({ getLocalTestUrl, page }) => {
    if (shouldSkipTracingTest()) {
      sentryTest.skip();
    }

    const url = await getLocalTestUrl({ testDir: __dirname });

    const metaTagTraceId = '12345678901234567890123456789012';

    const pageloadTraceContext = await sentryTest.step('Initial pageload', async () => {
      const pageloadRequestPromise = waitForTransactionRequest(page, evt => evt.contexts?.trace?.op === 'pageload');
      await page.goto(url);
      const pageloadRequest = envelopeRequestParser(await pageloadRequestPromise);

      const traceContext = pageloadRequest.contexts?.trace;

      // sanity check
      expect(traceContext?.trace_id).toBe(metaTagTraceId);

      expect(traceContext?.links).toBeUndefined();

      return traceContext;
    });

    const navigationTraceContext = await sentryTest.step('Navigation', async () => {
      const navigationRequestPromise = waitForTransactionRequest(page, evt => evt.contexts?.trace?.op === 'navigation');
      await page.goto(`${url}#foo`);
      const navigationRequest = envelopeRequestParser(await navigationRequestPromise);
      return navigationRequest.contexts?.trace;
    });

    const navigationTraceId = navigationTraceContext?.trace_id;

    expect(navigationTraceContext?.links).toEqual([
      {
        trace_id: metaTagTraceId,
        span_id: pageloadTraceContext?.span_id,
        sampled: true,
        attributes: {
          [SEMANTIC_LINK_ATTRIBUTE_LINK_TYPE]: 'previous_trace',
        },
      },
    ]);

    expect(navigationTraceId).not.toEqual(metaTagTraceId);
  },
);
