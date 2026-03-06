import { expect } from '@playwright/test';
import {
  SDK_VERSION,
  SEMANTIC_ATTRIBUTE_SENTRY_IDLE_SPAN_FINISH_REASON,
  SEMANTIC_ATTRIBUTE_SENTRY_OP,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  SEMANTIC_ATTRIBUTE_SENTRY_SDK_NAME,
  SEMANTIC_ATTRIBUTE_SENTRY_SDK_VERSION,
  SEMANTIC_ATTRIBUTE_SENTRY_SEGMENT_ID,
  SEMANTIC_ATTRIBUTE_SENTRY_SEGMENT_NAME,
  SEMANTIC_ATTRIBUTE_SENTRY_SOURCE,
} from '@sentry/core';
import { sentryTest } from '../../../../utils/fixtures';
import { shouldSkipTracingTest, testingCdnBundle } from '../../../../utils/helpers';
import { getSpanOp, waitForStreamedSpan, waitForStreamedSpans } from '../../../../utils/spanUtils';

sentryTest('captures streamed interaction span tree. @firefox', async ({ browserName, getLocalTestUrl, page }) => {
  const supportedBrowsers = ['chromium', 'firefox'];

  sentryTest.skip(shouldSkipTracingTest() || !supportedBrowsers.includes(browserName) || testingCdnBundle());
  const url = await getLocalTestUrl({ testDir: __dirname });

  const interactionSpansPromise = waitForStreamedSpans(page, spans =>
    spans.some(span => getSpanOp(span) === 'ui.action.click'),
  );

  const pageloadSpanPromise = waitForStreamedSpan(page, span => getSpanOp(span) === 'pageload');

  await page.goto(url);

  // wait for pageload span to finish before clicking the interaction button
  const pageloadSpan = await pageloadSpanPromise;

  await page.locator('[data-test-id=interaction-button]').click();
  await page.locator('.clicked[data-test-id=interaction-button]').isVisible();

  const interactionSpanTree = await interactionSpansPromise;

  const interactionSegmentSpan = interactionSpanTree.find(span => !!span.is_segment);

  expect(interactionSegmentSpan).toEqual({
    attributes: {
      [SEMANTIC_ATTRIBUTE_SENTRY_IDLE_SPAN_FINISH_REASON]: {
        type: 'string',
        value: 'idleTimeout',
      },
      [SEMANTIC_ATTRIBUTE_SENTRY_OP]: {
        type: 'string',
        value: 'ui.action.click',
      },
      [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: {
        type: 'string',
        value: 'manual', // TODO: This is incorrect but not from span streaming.
      },
      [SEMANTIC_ATTRIBUTE_SENTRY_SDK_NAME]: {
        type: 'string',
        value: 'sentry.javascript.browser',
      },
      [SEMANTIC_ATTRIBUTE_SENTRY_SDK_VERSION]: {
        type: 'string',
        value: SDK_VERSION,
      },
      [SEMANTIC_ATTRIBUTE_SENTRY_SEGMENT_ID]: {
        type: 'string',
        value: interactionSegmentSpan!.span_id,
      },
      [SEMANTIC_ATTRIBUTE_SENTRY_SEGMENT_NAME]: {
        type: 'string',
        value: '/index.html',
      },
      [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: {
        type: 'string',
        value: 'url',
      },
      'sentry.span.source': {
        type: 'string',
        value: 'url',
      },
    },
    end_timestamp: expect.any(Number),
    is_segment: true,
    name: '/index.html',
    span_id: interactionSegmentSpan!.span_id,
    start_timestamp: expect.any(Number),
    status: 'ok',
    trace_id: pageloadSpan.trace_id, // same trace id as pageload
  });

  const loAFSpans = interactionSpanTree.filter(span => getSpanOp(span)?.startsWith('ui.long-animation-frame'));
  expect(loAFSpans).toHaveLength(1);

  const interactionSpan = interactionSpanTree.find(span => getSpanOp(span) === 'ui.interaction.click');
  expect(interactionSpan).toEqual({
    attributes: {
      [SEMANTIC_ATTRIBUTE_SENTRY_OP]: {
        type: 'string',
        value: 'ui.interaction.click',
      },
      [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: {
        type: 'string',
        value: 'auto.ui.browser.metrics',
      },
      [SEMANTIC_ATTRIBUTE_SENTRY_SDK_NAME]: {
        type: 'string',
        value: 'sentry.javascript.browser',
      },
      [SEMANTIC_ATTRIBUTE_SENTRY_SDK_VERSION]: {
        type: 'string',
        value: SDK_VERSION,
      },
      [SEMANTIC_ATTRIBUTE_SENTRY_SEGMENT_ID]: {
        type: 'string',
        value: interactionSegmentSpan!.span_id,
      },
      [SEMANTIC_ATTRIBUTE_SENTRY_SEGMENT_NAME]: {
        type: 'string',
        value: '/index.html',
      },
    },
    end_timestamp: expect.any(Number),
    is_segment: false,
    name: 'body > button.clicked',
    parent_span_id: interactionSegmentSpan!.span_id,
    span_id: expect.stringMatching(/^[\da-f]{16}$/),
    start_timestamp: expect.any(Number),
    status: 'ok',
    trace_id: pageloadSpan.trace_id, // same trace id as pageload
  });

  const interactionSpanDuration = (interactionSpan!.end_timestamp - interactionSpan!.start_timestamp) * 1000;
  expect(interactionSpanDuration).toBeGreaterThan(65);
  expect(interactionSpanDuration).toBeLessThan(200);
  expect(interactionSpan?.status).toBe('ok');
});
