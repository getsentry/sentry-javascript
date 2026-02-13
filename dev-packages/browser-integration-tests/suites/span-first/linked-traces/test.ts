import { expect } from '@playwright/test';
import { SEMANTIC_LINK_ATTRIBUTE_LINK_TYPE } from '@sentry/core';
import { sentryTest } from '../../../utils/fixtures';
import { shouldSkipTracingTest, testingCdnBundle } from '../../../utils/helpers';
import { getSpanOp, waitForV2Spans } from '../../../utils/spanFirstUtils';

sentryTest("navigation spans link back to previous trace's root span", async ({ getLocalTestUrl, page }) => {
  // for now, spanStreamingIntegration is only exported in the NPM package, so we skip the test for bundles.
  if (shouldSkipTracingTest() || testingCdnBundle()) {
    sentryTest.skip();
  }

  const url = await getLocalTestUrl({ testDir: __dirname });

  const pageloadSpan = await sentryTest.step('Initial pageload', async () => {
    const pageloadSpanPromise = waitForV2Spans(page, spans => !!spans.find(span => getSpanOp(span) === 'pageload'));
    await page.goto(url);
    return (await pageloadSpanPromise).find(span => getSpanOp(span) === 'pageload');
  });

  const navigation1Span = await sentryTest.step('First navigation', async () => {
    const navigation1SpanPromise = waitForV2Spans(
      page,
      spans => !!spans.find(span => getSpanOp(span) === 'navigation'),
    );
    await page.goto(`${url}#foo`);
    return (await navigation1SpanPromise).find(span => getSpanOp(span) === 'navigation');
  });

  const navigation2Span = await sentryTest.step('Second navigation', async () => {
    const navigation2SpanPromise = waitForV2Spans(
      page,
      spans => !!spans.find(span => getSpanOp(span) === 'navigation'),
    );
    await page.goto(`${url}#bar`);
    return (await navigation2SpanPromise).find(span => getSpanOp(span) === 'navigation');
  });

  const pageloadTraceId = pageloadSpan?.trace_id;
  const navigation1TraceId = navigation1Span?.trace_id;
  const navigation2TraceId = navigation2Span?.trace_id;

  expect(pageloadSpan?.links).toBeUndefined();

  expect(navigation1Span?.links).toEqual([
    {
      trace_id: pageloadTraceId,
      span_id: pageloadSpan?.span_id,
      sampled: true,
      attributes: {
        [SEMANTIC_LINK_ATTRIBUTE_LINK_TYPE]: { value: 'previous_trace', type: 'string' },
      },
    },
  ]);

  expect(navigation1Span?.attributes).toMatchObject({
    'sentry.previous_trace': { type: 'string', value: `${pageloadTraceId}-${pageloadSpan?.span_id}-1` },
  });

  expect(navigation2Span?.links).toEqual([
    {
      trace_id: navigation1TraceId,
      span_id: navigation1Span?.span_id,
      sampled: true,
      attributes: {
        [SEMANTIC_LINK_ATTRIBUTE_LINK_TYPE]: { value: 'previous_trace', type: 'string' },
      },
    },
  ]);

  expect(navigation2Span?.attributes).toMatchObject({
    'sentry.previous_trace': { type: 'string', value: `${navigation1TraceId}-${navigation1Span?.span_id}-1` },
  });

  expect(pageloadTraceId).not.toEqual(navigation1TraceId);
  expect(navigation1TraceId).not.toEqual(navigation2TraceId);
  expect(pageloadTraceId).not.toEqual(navigation2TraceId);
});

sentryTest("doesn't link between hard page reloads by default", async ({ getLocalTestUrl, page }) => {
  // for now, spanStreamingIntegration is only exported in the NPM package, so we skip the test for bundles.
  if (shouldSkipTracingTest() || testingCdnBundle()) {
    sentryTest.skip();
  }

  const url = await getLocalTestUrl({ testDir: __dirname });

  await sentryTest.step('First pageload', async () => {
    const pageloadRequestPromise = waitForV2Spans(page, spans => !!spans.find(span => getSpanOp(span) === 'pageload'));
    await page.goto(url);
    return (await pageloadRequestPromise).find(span => getSpanOp(span) === 'pageload');
  });

  await sentryTest.step('Second pageload', async () => {
    const pageload2RequestPromise = waitForV2Spans(page, spans => !!spans.find(span => getSpanOp(span) === 'pageload'));
    await page.reload();
    const pageload2Span = (await pageload2RequestPromise).find(span => getSpanOp(span) === 'pageload');

    expect(pageload2Span?.trace_id).toBeDefined();
    expect(pageload2Span?.links).toBeUndefined();
  });
});
