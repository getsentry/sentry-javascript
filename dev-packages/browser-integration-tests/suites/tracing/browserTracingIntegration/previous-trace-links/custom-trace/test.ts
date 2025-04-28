import { expect } from '@playwright/test';
import { SEMANTIC_LINK_ATTRIBUTE_LINK_TYPE } from '@sentry/core';
import { sentryTest } from '../../../../../utils/fixtures';
import { envelopeRequestParser, shouldSkipTracingTest, waitForTransactionRequest } from '../../../../../utils/helpers';

sentryTest('manually started custom traces are linked correctly in the chain', async ({ getLocalTestUrl, page }) => {
  if (shouldSkipTracingTest()) {
    sentryTest.skip();
  }

  const url = await getLocalTestUrl({ testDir: __dirname });

  const pageloadTraceContext = await sentryTest.step('Initial pageload', async () => {
    const pageloadRequestPromise = waitForTransactionRequest(page, evt => evt.contexts?.trace?.op === 'pageload');
    await page.goto(url);
    const pageloadRequest = envelopeRequestParser(await pageloadRequestPromise);
    return pageloadRequest.contexts?.trace;
  });

  const customTrace1Context = await sentryTest.step('Custom trace', async () => {
    const customTrace1RequestPromise = waitForTransactionRequest(page, evt => evt.contexts?.trace?.op === 'custom');
    await page.locator('#btn1').click();
    const customTrace1Event = envelopeRequestParser(await customTrace1RequestPromise);

    const customTraceCtx = customTrace1Event.contexts?.trace;

    expect(customTraceCtx?.trace_id).not.toEqual(pageloadTraceContext?.trace_id);
    expect(customTraceCtx?.links).toEqual([
      {
        trace_id: pageloadTraceContext?.trace_id,
        span_id: pageloadTraceContext?.span_id,
        sampled: true,
        attributes: {
          [SEMANTIC_LINK_ATTRIBUTE_LINK_TYPE]: 'previous_trace',
        },
      },
    ]);

    return customTraceCtx;
  });

  await sentryTest.step('Navigation', async () => {
    const navigation1RequestPromise = waitForTransactionRequest(page, evt => evt.contexts?.trace?.op === 'navigation');
    await page.goto(`${url}#foo`);
    const navigationEvent = envelopeRequestParser(await navigation1RequestPromise);
    const navTraceContext = navigationEvent.contexts?.trace;

    expect(navTraceContext?.trace_id).not.toEqual(customTrace1Context?.trace_id);
    expect(navTraceContext?.trace_id).not.toEqual(pageloadTraceContext?.trace_id);

    expect(navTraceContext?.links).toEqual([
      {
        trace_id: customTrace1Context?.trace_id,
        span_id: customTrace1Context?.span_id,
        sampled: true,
        attributes: {
          [SEMANTIC_LINK_ATTRIBUTE_LINK_TYPE]: 'previous_trace',
        },
      },
    ]);
  });
});
