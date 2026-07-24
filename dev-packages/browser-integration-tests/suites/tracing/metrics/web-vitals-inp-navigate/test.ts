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
      item_count: 1,
      content_type: 'application/vnd.sentry.items.span.v2+json',
    });

    const inpValue = inpSpan.attributes['browser.web_vital.inp.value']?.value as number;
    expect(inpValue).toBeGreaterThan(0);

    const pageloadSpanId = inpSpan.parent_span_id;

    expect(inpSpan).toEqual({
      name: 'body > nav#navigation > NavigationLink',
      span_id: expect.stringMatching(/^[\da-f]{16}$/),
      trace_id: traceId,
      parent_span_id: expect.stringMatching(/^[\da-f]{16}$/),
      start_timestamp: expect.any(Number),
      end_timestamp: expect.any(Number),
      is_segment: false,
      status: 'ok',
      attributes: {
        'sentry.origin': { value: 'auto.http.browser.inp', type: 'string' },
        'sentry.op': { value: 'ui.interaction.click', type: 'string' },
        'sentry.exclusive_time': { value: inpValue, type: expect.stringMatching(/^(integer)|(double)$/) },
        'browser.web_vital.inp.value': { value: inpValue, type: expect.stringMatching(/^(integer)|(double)$/) },
        'sentry.transaction': { value: 'test-url', type: 'string' },
        'sentry.segment.name': { value: 'test-url', type: 'string' },
        'user_agent.original': { value: expect.stringContaining('Chrome'), type: 'string' },
        'sentry.pageload.span_id': { value: pageloadSpanId, type: 'string' },
        'sentry.trace_lifecycle': { value: 'stream', type: 'string' },
        'sentry.segment.id': { value: pageloadSpanId, type: 'string' },
        'sentry.sdk.name': { value: 'sentry.javascript.browser', type: 'string' },
        'sentry.sdk.version': { value: SDK_VERSION, type: 'string' },
        'sentry.environment': { value: 'production', type: 'string' },
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
      item_count: 1,
      content_type: 'application/vnd.sentry.items.span.v2+json',
    });

    const inpValue = inpSpan.attributes['browser.web_vital.inp.value']?.value as number;
    expect(inpValue).toBeGreaterThan(0);

    const pageloadSpanId = inpSpan.parent_span_id;

    expect(inpSpan).toEqual({
      name: 'body > nav#navigation > NavigationLink',
      span_id: expect.stringMatching(/^[\da-f]{16}$/),
      trace_id: expect.stringMatching(/^[\da-f]{32}$/),
      parent_span_id: expect.stringMatching(/^[\da-f]{16}$/),
      start_timestamp: expect.any(Number),
      end_timestamp: expect.any(Number),
      is_segment: false,
      status: 'ok',
      attributes: {
        'sentry.origin': { value: 'auto.http.browser.inp', type: 'string' },
        'sentry.op': { value: 'ui.interaction.click', type: 'string' },
        'sentry.exclusive_time': { value: inpValue, type: expect.stringMatching(/^(integer)|(double)$/) },
        'browser.web_vital.inp.value': { value: inpValue, type: expect.stringMatching(/^(integer)|(double)$/) },
        'sentry.transaction': { value: 'test-url', type: 'string' },
        'sentry.segment.name': { value: 'test-url', type: 'string' },
        'user_agent.original': { value: expect.stringContaining('Chrome'), type: 'string' },
        'sentry.pageload.span_id': { value: pageloadSpanId, type: 'string' },
        'sentry.trace_lifecycle': { value: 'stream', type: 'string' },
        'sentry.segment.id': { value: pageloadSpanId, type: 'string' },
        'sentry.sdk.name': { value: 'sentry.javascript.browser', type: 'string' },
        'sentry.sdk.version': { value: SDK_VERSION, type: 'string' },
        'sentry.environment': { value: 'production', type: 'string' },
      },
    });
  },
);
