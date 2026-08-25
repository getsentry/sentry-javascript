import { expect } from '@playwright/test';
import {
  SDK_VERSION,
  SEMANTIC_ATTRIBUTE_SENTRY_ENVIRONMENT,
  SEMANTIC_ATTRIBUTE_SENTRY_IDLE_SPAN_FINISH_REASON,
  SEMANTIC_ATTRIBUTE_SENTRY_OP,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  SEMANTIC_ATTRIBUTE_SENTRY_SDK_INTEGRATIONS,
} from '@sentry/core';
import {
  SENTRY_SEGMENT_ID,
  SENTRY_SEGMENT_NAME,
  SENTRY_SEGMENT_NAME_SOURCE,
  SENTRY_SDK_NAME,
  SENTRY_SDK_VERSION,
  SENTRY_TRACE_LIFECYCLE,
  SENTRY_SOURCE,
} from '@sentry/conventions/attributes';
import { sentryTest } from '../../../../utils/fixtures';
import { shouldSkipTracingTest } from '../../../../utils/helpers';
import { getSpanOp, waitForStreamedSpan, waitForStreamedSpans } from '../../../../utils/spanUtils';

sentryTest('captures streamed interaction span tree. @firefox', async ({ browserName, getLocalTestUrl, page }) => {
  const supportedBrowsers = ['chromium', 'firefox'];

  sentryTest.skip(shouldSkipTracingTest() || !supportedBrowsers.includes(browserName));
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
      [SENTRY_TRACE_LIFECYCLE]: {
        type: 'string',
        value: 'stream',
      },
      'culture.calendar': {
        type: 'string',
        value: expect.any(String),
      },
      'culture.locale': {
        type: 'string',
        value: expect.any(String),
      },
      'culture.timezone': {
        type: 'string',
        value: expect.any(String),
      },
      'http.request.header.user_agent': {
        type: 'string',
        value: expect.any(String),
      },
      'url.full': {
        type: 'string',
        value: expect.any(String),
      },
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
        value: 'auto.browser.interactions',
      },
      [SENTRY_SDK_NAME]: {
        type: 'string',
        value: 'sentry.javascript.browser',
      },
      [SENTRY_SDK_VERSION]: {
        type: 'string',
        value: SDK_VERSION,
      },
      [SEMANTIC_ATTRIBUTE_SENTRY_SDK_INTEGRATIONS]: {
        type: 'array',
        value: expect.arrayContaining(['BrowserTracing', 'SpanStreaming']),
      },
      [SENTRY_SEGMENT_ID]: {
        type: 'string',
        value: interactionSegmentSpan!.span_id,
      },
      [SENTRY_SEGMENT_NAME]: {
        type: 'string',
        value: 'Pageload',
      },
      [SENTRY_SOURCE]: {
        type: 'string',
        value: 'custom',
      },
      [SENTRY_SEGMENT_NAME_SOURCE]: {
        type: 'string',
        value: 'url',
      },
      [SEMANTIC_ATTRIBUTE_SENTRY_ENVIRONMENT]: {
        type: 'string',
        value: 'production',
      },
    },
    end_timestamp: expect.any(Number),
    is_segment: true,
    // Interaction spans are named after the current route, which is the pageload span's name.
    name: 'Pageload',
    span_id: interactionSegmentSpan!.span_id,
    start_timestamp: expect.any(Number),
    status: 'ok',
    trace_id: pageloadSpan.trace_id, // same trace id as pageload
  });

  const loAFSpans = interactionSpanTree.filter(span => getSpanOp(span)?.startsWith('ui.long_animation_frame'));
  expect(loAFSpans).toHaveLength(browserName === 'chromium' ? 1 : 0);

  const interactionSpan = interactionSpanTree.find(span => getSpanOp(span) === 'ui.interaction.click');
  expect(interactionSpan).toEqual({
    attributes: {
      [SENTRY_TRACE_LIFECYCLE]: {
        type: 'string',
        value: 'stream',
      },
      [SEMANTIC_ATTRIBUTE_SENTRY_OP]: {
        type: 'string',
        value: 'ui.interaction.click',
      },
      [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: {
        type: 'string',
        value: 'auto.browser.interactions',
      },
      [SENTRY_SDK_NAME]: {
        type: 'string',
        value: 'sentry.javascript.browser',
      },
      [SENTRY_SDK_VERSION]: {
        type: 'string',
        value: SDK_VERSION,
      },
      [SENTRY_SEGMENT_ID]: {
        type: 'string',
        value: interactionSegmentSpan!.span_id,
      },
      [SENTRY_SEGMENT_NAME]: {
        type: 'string',
        value: 'Pageload',
      },
      [SEMANTIC_ATTRIBUTE_SENTRY_ENVIRONMENT]: {
        type: 'string',
        value: 'production',
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
