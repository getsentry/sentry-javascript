import { expect } from '@playwright/test';
import { SEMANTIC_LINK_ATTRIBUTE_LINK_TYPE } from '@sentry/core';
import { sentryTest } from '../../../../../utils/fixtures';
import { shouldSkipTracingTest, testingCdnBundle } from '../../../../../utils/helpers';
import { getSpanOp, waitForStreamedSpan } from '../../../../../utils/spanUtils';

sentryTest("navigation spans link back to previous trace's root span", async ({ getLocalTestUrl, page }) => {
  sentryTest.skip(shouldSkipTracingTest() || testingCdnBundle());

  const url = await getLocalTestUrl({ testDir: __dirname });

  const pageloadSpanPromise = waitForStreamedSpan(page, span => getSpanOp(span) === 'pageload');
  await page.goto(url);
  const pageloadSpan = await pageloadSpanPromise;

  const navigation1SpanPromise = waitForStreamedSpan(page, span => getSpanOp(span) === 'navigation');
  await page.goto(`${url}#foo`);
  const navigation1Span = await navigation1SpanPromise;

  const navigation2SpanPromise = waitForStreamedSpan(page, span => getSpanOp(span) === 'navigation');
  await page.goto(`${url}#bar`);
  const navigation2Span = await navigation2SpanPromise;

  const pageloadTraceId = pageloadSpan.trace_id;
  const navigation1TraceId = navigation1Span.trace_id;
  const navigation2TraceId = navigation2Span.trace_id;

  expect(pageloadSpan.links).toBeUndefined();

  expect(navigation1Span.links).toEqual([
    {
      trace_id: pageloadTraceId,
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

  expect(navigation1Span.attributes?.['sentry.previous_trace']).toEqual({
    type: 'string',
    value: `${pageloadTraceId}-${pageloadSpan.span_id}-1`,
  });

  expect(navigation2Span.links).toEqual([
    {
      trace_id: navigation1TraceId,
      span_id: navigation1Span.span_id,
      sampled: true,
      attributes: {
        [SEMANTIC_LINK_ATTRIBUTE_LINK_TYPE]: {
          type: 'string',
          value: 'previous_trace',
        },
      },
    },
  ]);

  expect(navigation2Span.attributes?.['sentry.previous_trace']).toEqual({
    type: 'string',
    value: `${navigation1TraceId}-${navigation1Span.span_id}-1`,
  });

  expect(pageloadTraceId).not.toEqual(navigation1TraceId);
  expect(navigation1TraceId).not.toEqual(navigation2TraceId);
  expect(pageloadTraceId).not.toEqual(navigation2TraceId);
});

sentryTest("doesn't link between hard page reloads by default", async ({ getLocalTestUrl, page }) => {
  sentryTest.skip(shouldSkipTracingTest() || testingCdnBundle());

  const url = await getLocalTestUrl({ testDir: __dirname });

  await sentryTest.step('First pageload', async () => {
    const pageloadSpanPromise = waitForStreamedSpan(page, span => getSpanOp(span) === 'pageload');
    await page.goto(url);
    const pageload1Span = await pageloadSpanPromise;

    expect(pageload1Span).toBeDefined();
    expect(pageload1Span.links).toBeUndefined();
  });

  await sentryTest.step('Second pageload', async () => {
    const pageloadSpanPromise = waitForStreamedSpan(page, span => getSpanOp(span) === 'pageload');
    await page.reload();
    const pageload2Span = await pageloadSpanPromise;

    expect(pageload2Span).toBeDefined();
    expect(pageload2Span.links).toBeUndefined();
  });
});
