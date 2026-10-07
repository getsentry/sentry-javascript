import {
  BROWSER_WEB_VITAL_INP_VALUE,
  SENTRY_IS_LOCALHOST,
  SENTRY_ORIGIN,
  SENTRY_OP,
  UI_COMPONENT_NAME,
  BROWSER_WEB_VITAL_INP_TARGET,
  SENTRY_EXCLUSIVE_TIME,
  BROWSER_WEB_VITAL_INP_INTERACTION_TYPE,
  BROWSER_NAVIGATION_TYPE,
  SENTRY_TRANSACTION,
  SENTRY_SEGMENT_NAME,
  USER_AGENT_ORIGINAL,
  SENTRY_PAGELOAD_SPAN_ID,
  SENTRY_TRACE_LIFECYCLE,
  SENTRY_SEGMENT_ID,
  SENTRY_SDK_NAME,
  SENTRY_SDK_VERSION,
  SENTRY_ENVIRONMENT,
} from '@sentry/conventions/attributes';
import { expect } from '@playwright/test';
import { SDK_VERSION } from '@sentry/core';
import { sentryTest } from '../../../../utils/fixtures';
import { hidePage, shouldSkipTracingTest } from '../../../../utils/helpers';
import { getSpanOp, getSpansFromEnvelope, waitForStreamedSpanEnvelope } from '../../../../utils/spanUtils';

const supportedBrowsers = ['chromium'];

sentryTest(
  'captures INP with correct target name when navigation keeps DOM element',
  async ({ browserName, getLocalTestUrl, page }) => {
    if (shouldSkipTracingTest() || !supportedBrowsers.includes(browserName)) {
      sentryTest.skip();
    }

    const url = await getLocalTestUrl({ testDir: __dirname });

    const spanEnvelopePromise = waitForStreamedSpanEnvelope(
      page,
      env => !!getSpansFromEnvelope(env).find(s => getSpanOp(s) === 'ui.interaction.click'),
    );

    await page.goto(url);

    // Simulating route change (keeping <nav> in DOM)
    await page.locator('[data-test-id=nav-link-keepDOM]').click();
    await page.locator('.navigated').isVisible();

    await page.waitForTimeout(500);

    // Page hide to trigger INP
    await hidePage(page);

    const spanEnvelope = await spanEnvelopePromise;
    const envelopeHeader = spanEnvelope[0];
    const itemHeader = spanEnvelope[1][0][0];
    const inpSpan = getSpansFromEnvelope(spanEnvelope).find(s => getSpanOp(s) === 'ui.interaction.click')!;

    const traceId = envelopeHeader.trace!.trace_id;
    expect(traceId).toMatch(/^[\da-f]{32}$/);

    expect(envelopeHeader).toEqual({
      sdk: { name: 'sentry.javascript.browser', version: SDK_VERSION },
      sent_at: expect.any(String),
      trace: {
        environment: 'production',
        public_key: 'public',
        sample_rand: expect.any(String),
        sample_rate: '1',
        sampled: 'true',
        trace_id: traceId,
      },
    });

    expect(itemHeader).toEqual({
      type: 'span',
      item_count: getSpansFromEnvelope(spanEnvelope).length,
      content_type: 'application/vnd.sentry.items.span.v2+json',
    });

    const inpValue = inpSpan.attributes[BROWSER_WEB_VITAL_INP_VALUE]?.value as number;
    expect(inpValue).toBeGreaterThan(0);

    const pageloadSpanId = inpSpan.parent_span_id;

    expect(inpSpan).toEqual({
      name: 'NavigationLink',
      span_id: expect.stringMatching(/^[\da-f]{16}$/),
      trace_id: traceId,
      parent_span_id: expect.stringMatching(/^[\da-f]{16}$/),
      start_timestamp: expect.any(Number),
      end_timestamp: expect.any(Number),
      is_segment: false,
      status: 'ok',
      attributes: {
        [SENTRY_IS_LOCALHOST]: { value: false, type: 'boolean' },
        [SENTRY_ORIGIN]: { value: 'auto.http.browser.inp', type: 'string' },
        [SENTRY_OP]: { value: 'ui.interaction.click', type: 'string' },
        [UI_COMPONENT_NAME]: { value: 'NavigationLink', type: 'string' },
        [BROWSER_WEB_VITAL_INP_TARGET]: { value: 'body > nav#navigation > NavigationLink', type: 'string' },
        [SENTRY_EXCLUSIVE_TIME]: { value: inpValue, type: expect.stringMatching(/^(integer)|(double)$/) },
        [BROWSER_WEB_VITAL_INP_VALUE]: { value: inpValue, type: expect.stringMatching(/^(integer)|(double)$/) },
        [BROWSER_WEB_VITAL_INP_INTERACTION_TYPE]: { value: 'click', type: 'string' },
        [BROWSER_NAVIGATION_TYPE]: { value: 'navigate', type: 'string' },
        [SENTRY_TRANSACTION]: { value: 'test-url', type: 'string' },
        [SENTRY_SEGMENT_NAME]: { value: 'test-url', type: 'string' },
        [USER_AGENT_ORIGINAL]: { value: expect.stringContaining('Chrome'), type: 'string' },
        [SENTRY_PAGELOAD_SPAN_ID]: { value: pageloadSpanId, type: 'string' },
        [SENTRY_TRACE_LIFECYCLE]: { value: 'stream', type: 'string' },
        [SENTRY_SEGMENT_ID]: { value: pageloadSpanId, type: 'string' },
        [SENTRY_SDK_NAME]: { value: 'sentry.javascript.browser', type: 'string' },
        [SENTRY_SDK_VERSION]: { value: SDK_VERSION, type: 'string' },
        [SENTRY_ENVIRONMENT]: { value: 'production', type: 'string' },
      },
    });
  },
);

sentryTest(
  'captures INP with unknown target name when navigation removes element from DOM',
  async ({ browserName, getLocalTestUrl, page }) => {
    if (shouldSkipTracingTest() || !supportedBrowsers.includes(browserName)) {
      sentryTest.skip();
    }

    const url = await getLocalTestUrl({ testDir: __dirname });

    const spanEnvelopePromise = waitForStreamedSpanEnvelope(
      page,
      env => !!getSpansFromEnvelope(env).find(s => getSpanOp(s) === 'ui.interaction.click'),
    );

    await page.goto(url);

    // Simulating route change (also changing <nav> in DOM)
    await page.locator('[data-test-id=nav-link-changeDOM]').click();
    await page.locator('.navigated').isVisible();

    await page.waitForTimeout(500);

    // Page hide to trigger INP
    await hidePage(page);

    const spanEnvelope = await spanEnvelopePromise;
    const envelopeHeader = spanEnvelope[0];
    const itemHeader = spanEnvelope[1][0][0];
    const inpSpan = getSpansFromEnvelope(spanEnvelope).find(s => getSpanOp(s) === 'ui.interaction.click')!;

    const traceId = envelopeHeader.trace!.trace_id;
    expect(traceId).toMatch(/^[\da-f]{32}$/);

    expect(envelopeHeader).toEqual({
      sdk: { name: 'sentry.javascript.browser', version: SDK_VERSION },
      sent_at: expect.any(String),
      trace: {
        environment: 'production',
        public_key: 'public',
        sample_rand: expect.any(String),
        sample_rate: '1',
        sampled: 'true',
        trace_id: traceId,
      },
    });

    expect(itemHeader).toEqual({
      type: 'span',
      item_count: getSpansFromEnvelope(spanEnvelope).length,
      content_type: 'application/vnd.sentry.items.span.v2+json',
    });

    const inpValue = inpSpan.attributes[BROWSER_WEB_VITAL_INP_VALUE]?.value as number;
    expect(inpValue).toBeGreaterThan(0);

    const pageloadSpanId = inpSpan.parent_span_id;

    expect(inpSpan).toEqual({
      name: 'Click',
      span_id: expect.stringMatching(/^[\da-f]{16}$/),
      trace_id: expect.stringMatching(/^[\da-f]{32}$/),
      parent_span_id: expect.stringMatching(/^[\da-f]{16}$/),
      start_timestamp: expect.any(Number),
      end_timestamp: expect.any(Number),
      is_segment: false,
      status: 'ok',
      attributes: {
        [SENTRY_IS_LOCALHOST]: { value: false, type: 'boolean' },
        [SENTRY_ORIGIN]: { value: 'auto.http.browser.inp', type: 'string' },
        [SENTRY_OP]: { value: 'ui.interaction.click', type: 'string' },
        [BROWSER_WEB_VITAL_INP_TARGET]: { value: 'body > nav#navigation > NavigationLink', type: 'string' },
        [SENTRY_EXCLUSIVE_TIME]: { value: inpValue, type: expect.stringMatching(/^(integer)|(double)$/) },
        [BROWSER_WEB_VITAL_INP_VALUE]: { value: inpValue, type: expect.stringMatching(/^(integer)|(double)$/) },
        [BROWSER_WEB_VITAL_INP_INTERACTION_TYPE]: { value: 'click', type: 'string' },
        [BROWSER_NAVIGATION_TYPE]: { value: 'navigate', type: 'string' },
        [SENTRY_TRANSACTION]: { value: 'test-url', type: 'string' },
        [SENTRY_SEGMENT_NAME]: { value: 'test-url', type: 'string' },
        [USER_AGENT_ORIGINAL]: { value: expect.stringContaining('Chrome'), type: 'string' },
        [SENTRY_PAGELOAD_SPAN_ID]: { value: pageloadSpanId, type: 'string' },
        [SENTRY_TRACE_LIFECYCLE]: { value: 'stream', type: 'string' },
        [SENTRY_SEGMENT_ID]: { value: pageloadSpanId, type: 'string' },
        [SENTRY_SDK_NAME]: { value: 'sentry.javascript.browser', type: 'string' },
        [SENTRY_SDK_VERSION]: { value: SDK_VERSION, type: 'string' },
        [SENTRY_ENVIRONMENT]: { value: 'production', type: 'string' },
      },
    });
  },
);
