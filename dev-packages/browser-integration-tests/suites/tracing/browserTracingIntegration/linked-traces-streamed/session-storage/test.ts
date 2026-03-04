import { expect } from '@playwright/test';
import { SEMANTIC_LINK_ATTRIBUTE_LINK_TYPE } from '@sentry/core';
import { sentryTest } from '../../../../../utils/fixtures';
import { shouldSkipTracingTest } from '../../../../../utils/helpers';
import { getSpanOp, waitForStreamedSpan } from '../../../../../utils/spanUtils';

sentryTest('adds link between hard page reloads when opting into sessionStorage', async ({ getLocalTestUrl, page }) => {
  if (shouldSkipTracingTest()) {
    sentryTest.skip();
  }

  const url = await getLocalTestUrl({ testDir: __dirname });

  const pageload1Span = await sentryTest.step('First pageload', async () => {
    const pageloadSpanPromise = waitForStreamedSpan(page, span => getSpanOp(span) === 'pageload');
    await page.goto(url);
    const span = await pageloadSpanPromise;
    expect(span).toBeDefined();
    expect(span.links).toBeUndefined();
    return span;
  });

  const pageload2Span = await sentryTest.step('Hard page reload', async () => {
    const pageloadSpanPromise = waitForStreamedSpan(page, span => getSpanOp(span) === 'pageload');
    await page.reload();
    return pageloadSpanPromise;
  });

  expect(pageload2Span.links).toEqual([
    {
      trace_id: pageload1Span.trace_id,
      span_id: pageload1Span.span_id,
      sampled: true,
      attributes: {
        [SEMANTIC_LINK_ATTRIBUTE_LINK_TYPE]: {
          type: 'string',
          value: 'previous_trace',
        },
      },
    },
  ]);

  expect(pageload1Span.trace_id).not.toEqual(pageload2Span.trace_id);
});
