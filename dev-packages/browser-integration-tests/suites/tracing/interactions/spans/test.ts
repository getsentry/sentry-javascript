import { expect } from '@playwright/test';
import { SDK_VERSION } from '@sentry/core';
import {
  SENTRY_IDLE_SPAN_FINISH_REASON,
  SENTRY_SEGMENT_ID,
  SENTRY_SEGMENT_NAME,
  SENTRY_SEGMENT_NAME_SOURCE,
  SENTRY_SDK_NAME,
  SENTRY_SDK_VERSION,
  SENTRY_TRACE_LIFECYCLE,
  USER_AGENT_ORIGINAL,
  URL_PATH,
  SENTRY_ENVIRONMENT,
  SENTRY_SDK_INTEGRATIONS,
  SENTRY_OP,
  SENTRY_ORIGIN,
} from '@sentry/conventions/attributes';
import { sentryTest } from '../../../../utils/fixtures';
import { shouldSkipTracingTest } from '../../../../utils/helpers';
import { collectStreamedSpans, getSpanOp, waitForStreamedSpan } from '../../../../utils/spanUtils';

sentryTest('captures streamed interaction span tree. @firefox', async ({ browserName, getLocalTestUrl, page }) => {
  const supportedBrowsers = ['chromium', 'firefox'];

  sentryTest.skip(shouldSkipTracingTest() || !supportedBrowsers.includes(browserName));
  const url = await getLocalTestUrl({ testDir: __dirname });

  const spans = collectStreamedSpans(page);
  const interactionPromise = waitForStreamedSpan(
    page,
    span => span.is_segment && getSpanOp(span) === 'ui.action.click',
  );

  const pageloadSpanPromise = waitForStreamedSpan(page, span => getSpanOp(span) === 'pageload');

  await page.goto(url);

  // wait for pageload span to finish before clicking the interaction button
  const pageloadSpan = await pageloadSpanPromise;

  await page.locator('[data-test-id=interaction-button]').click();
  await page.locator('.clicked[data-test-id=interaction-button]').isVisible();

  const interactionSegmentSpan = await interactionPromise;
  await page.evaluate(() => (window as any).Sentry.flush());
  const interactionSpanTree = spans.filter(
    span =>
      span.span_id === interactionSegmentSpan.span_id ||
      span.attributes[SENTRY_SEGMENT_ID]?.value === interactionSegmentSpan.span_id,
  );

  expect(interactionSegmentSpan).toEqual({
    attributes: {
      'sentry.is_localhost': { value: false, type: 'boolean' },
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
      [USER_AGENT_ORIGINAL]: {
        type: 'string',
        value: expect.any(String),
      },
      'url.full': {
        type: 'string',
        value: expect.any(String),
      },
      [URL_PATH]: {
        type: 'string',
        value: '/index.html',
      },
      [SENTRY_IDLE_SPAN_FINISH_REASON]: {
        type: 'string',
        value: 'idleTimeout',
      },
      [SENTRY_OP]: {
        type: 'string',
        value: 'ui.action.click',
      },
      [SENTRY_ORIGIN]: {
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
      [SENTRY_SDK_INTEGRATIONS]: {
        type: 'array',
        value: expect.arrayContaining(['BrowserTracing', 'SpanStreaming']),
      },
      [SENTRY_SEGMENT_ID]: {
        type: 'string',
        value: interactionSegmentSpan!.span_id,
      },
      [SENTRY_SEGMENT_NAME]: {
        type: 'string',
        value: 'Click',
      },
      [SENTRY_SEGMENT_NAME_SOURCE]: {
        type: 'string',
        value: 'custom',
      },
      [SENTRY_ENVIRONMENT]: {
        type: 'string',
        value: 'production',
      },
    },
    end_timestamp: expect.any(Number),
    is_segment: true,
    name: 'Click',
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
      'sentry.is_localhost': { value: false, type: 'boolean' },
      [SENTRY_TRACE_LIFECYCLE]: {
        type: 'string',
        value: 'stream',
      },
      [SENTRY_OP]: {
        type: 'string',
        value: 'ui.interaction.click',
      },
      [USER_AGENT_ORIGINAL]: {
        type: 'string',
        value: expect.any(String),
      },
      [SENTRY_ORIGIN]: {
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
        value: 'Click',
      },
      [SENTRY_ENVIRONMENT]: {
        type: 'string',
        value: 'production',
      },
      'browser.web_vital.inp.target': {
        type: 'string',
        value: 'body > button.clicked',
      },
    },
    end_timestamp: expect.any(Number),
    is_segment: false,
    name: 'Click',
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
