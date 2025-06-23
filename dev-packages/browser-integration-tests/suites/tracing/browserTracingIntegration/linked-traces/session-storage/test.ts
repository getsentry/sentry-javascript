import { expect } from '@playwright/test';
import { SEMANTIC_LINK_ATTRIBUTE_LINK_TYPE } from '@sentry/core';
import { sentryTest } from '../../../../../utils/fixtures';
import { envelopeRequestParser, shouldSkipTracingTest, waitForTransactionRequest } from '../../../../../utils/helpers';

sentryTest('adds link between hard page reloads when opting into sessionStorage', async ({ getLocalTestUrl, page }) => {
  if (shouldSkipTracingTest()) {
    sentryTest.skip();
  }

  const url = await getLocalTestUrl({ testDir: __dirname });

  const pageload1TraceContext = await sentryTest.step('First pageload', async () => {
    const pageloadRequestPromise = waitForTransactionRequest(page, evt => evt.contexts?.trace?.op === 'pageload');
    await page.goto(url);
    const pageload1Event = envelopeRequestParser(await pageloadRequestPromise);
    const pageload1TraceContext = pageload1Event.contexts?.trace;
    expect(pageload1TraceContext).toBeDefined();
    expect(pageload1TraceContext?.links).toBeUndefined();
    return pageload1TraceContext;
  });

  const pageload2Event = await sentryTest.step('Hard page reload', async () => {
    const pageload2RequestPromise = waitForTransactionRequest(page, evt => evt.contexts?.trace?.op === 'pageload');
    await page.reload();
    return envelopeRequestParser(await pageload2RequestPromise);
  });

  expect(pageload2Event.contexts?.trace?.links).toEqual([
    {
      trace_id: pageload1TraceContext?.trace_id,
      span_id: pageload1TraceContext?.span_id,
      sampled: true,
      attributes: { [SEMANTIC_LINK_ATTRIBUTE_LINK_TYPE]: 'previous_trace' },
    },
  ]);

  expect(pageload1TraceContext?.trace_id).not.toEqual(pageload2Event.contexts?.trace?.trace_id);
});
