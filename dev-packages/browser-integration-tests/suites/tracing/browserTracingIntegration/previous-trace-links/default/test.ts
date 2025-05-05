import { expect } from '@playwright/test';
import { SEMANTIC_LINK_ATTRIBUTE_LINK_TYPE } from '@sentry/core';
import { sentryTest } from '../../../../../utils/fixtures';
import { envelopeRequestParser, shouldSkipTracingTest, waitForTransactionRequest } from '../../../../../utils/helpers';

sentryTest("navigation spans link back to previous trace's root span", async ({ getLocalTestUrl, page }) => {
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

  const navigation1TraceContext = await sentryTest.step('First navigation', async () => {
    const navigation1RequestPromise = waitForTransactionRequest(page, evt => evt.contexts?.trace?.op === 'navigation');
    await page.goto(`${url}#foo`);
    const navigation1Request = envelopeRequestParser(await navigation1RequestPromise);
    return navigation1Request.contexts?.trace;
  });

  const navigation2TraceContext = await sentryTest.step('Second navigation', async () => {
    const navigation2RequestPromise = waitForTransactionRequest(page, evt => evt.contexts?.trace?.op === 'navigation');
    await page.goto(`${url}#bar`);
    const navigation2Request = envelopeRequestParser(await navigation2RequestPromise);
    return navigation2Request.contexts?.trace;
  });

  const pageloadTraceId = pageloadTraceContext?.trace_id;
  const navigation1TraceId = navigation1TraceContext?.trace_id;
  const navigation2TraceId = navigation2TraceContext?.trace_id;

  expect(pageloadTraceContext?.links).toBeUndefined();

  expect(navigation1TraceContext?.links).toEqual([
    {
      trace_id: pageloadTraceId,
      span_id: pageloadTraceContext?.span_id,
      sampled: true,
      attributes: {
        [SEMANTIC_LINK_ATTRIBUTE_LINK_TYPE]: 'previous_trace',
      },
    },
  ]);

  expect(navigation1TraceContext?.data).toMatchObject({
    'sentry.previous_trace': `${pageloadTraceId}-${pageloadTraceContext?.span_id}-1`,
  });

  expect(navigation2TraceContext?.links).toEqual([
    {
      trace_id: navigation1TraceId,
      span_id: navigation1TraceContext?.span_id,
      sampled: true,
      attributes: {
        [SEMANTIC_LINK_ATTRIBUTE_LINK_TYPE]: 'previous_trace',
      },
    },
  ]);

  expect(navigation2TraceContext?.data).toMatchObject({
    'sentry.previous_trace': `${navigation1TraceId}-${navigation1TraceContext?.span_id}-1`,
  });

  expect(pageloadTraceId).not.toEqual(navigation1TraceId);
  expect(navigation1TraceId).not.toEqual(navigation2TraceId);
  expect(pageloadTraceId).not.toEqual(navigation2TraceId);
});

sentryTest("doesn't link between hard page reloads by default", async ({ getLocalTestUrl, page }) => {
  if (shouldSkipTracingTest()) {
    sentryTest.skip();
  }

  const url = await getLocalTestUrl({ testDir: __dirname });

  await sentryTest.step('First pageload', async () => {
    const pageloadRequestPromise = waitForTransactionRequest(page, evt => evt.contexts?.trace?.op === 'pageload');
    await page.goto(url);
    const pageload1Event = envelopeRequestParser(await pageloadRequestPromise);

    expect(pageload1Event.contexts?.trace).toBeDefined();
    expect(pageload1Event.contexts?.trace?.links).toBeUndefined();
  });

  await sentryTest.step('Second pageload', async () => {
    const pageload2RequestPromise = waitForTransactionRequest(page, evt => evt.contexts?.trace?.op === 'pageload');
    await page.reload();
    const pageload2Event = envelopeRequestParser(await pageload2RequestPromise);

    expect(pageload2Event.contexts?.trace).toBeDefined();
    expect(pageload2Event.contexts?.trace?.links).toBeUndefined();
  });
});
