import { expect } from '@playwright/test';
import type { Event as SentryEvent, SpanEnvelope } from '@sentry/core';
import { sentryTest } from '../../../../utils/fixtures';
import {
  getFirstSentryEnvelopeRequest,
  getMultipleSentryEnvelopeRequests,
  hidePage,
  properFullEnvelopeRequestParser,
  shouldSkipTracingTest,
} from '../../../../utils/helpers';

const supportedBrowsers = ['chromium'];

sentryTest(
  'should capture INP with correct target name when navigation keeps DOM element',
  async ({ browserName, getLocalTestUrl, page }) => {
    if (shouldSkipTracingTest() || !supportedBrowsers.includes(browserName)) {
      sentryTest.skip();
    }

    const url = await getLocalTestUrl({ testDir: __dirname });

    await page.goto(url);
    await getFirstSentryEnvelopeRequest<SentryEvent>(page); // wait for page load

    const spanEnvelopePromise = getMultipleSentryEnvelopeRequests<SpanEnvelope>(
      page,
      1,
      { envelopeType: 'span' },
      properFullEnvelopeRequestParser,
    );

    // Simulating route change (keeping <nav> in DOM)
    await page.locator('[data-test-id=nav-link-keepDOM]').click();
    await page.locator('.navigated').isVisible();

    await page.waitForTimeout(500);

    // Page hide to trigger INP
    await hidePage(page);

    // Get the INP span envelope
    const spanEnvelope = (await spanEnvelopePromise)[0];

    const spanEnvelopeHeaders = spanEnvelope[0];
    const spanEnvelopeItem = spanEnvelope[1][0][1];

    const traceId = spanEnvelopeHeaders.trace!.trace_id;
    expect(traceId).toMatch(/[a-f\d]{32}/);

    expect(spanEnvelopeHeaders).toEqual({
      sent_at: expect.any(String),
      trace: {
        environment: 'production',
        public_key: 'public',
        sample_rate: '1',
        sampled: 'true',
        trace_id: traceId,
        sample_rand: expect.any(String),
      },
    });

    const inpValue = spanEnvelopeItem.measurements?.inp.value;
    expect(inpValue).toBeGreaterThan(0);

    expect(spanEnvelopeItem).toEqual({
      data: {
        'sentry.exclusive_time': inpValue,
        'sentry.op': 'ui.interaction.click',
        'sentry.origin': 'auto.http.browser.inp',
        'sentry.source': 'custom',
        transaction: 'test-url',
        'user_agent.original': expect.stringContaining('Chrome'),
      },
      measurements: {
        inp: {
          unit: 'millisecond',
          value: inpValue,
        },
      },
      description: 'body > nav#navigation > NavigationLink',
      exclusive_time: inpValue,
      op: 'ui.interaction.click',
      origin: 'auto.http.browser.inp',
      is_segment: true,
      segment_id: spanEnvelopeItem.span_id,
      span_id: expect.stringMatching(/[a-f\d]{16}/),
      start_timestamp: expect.any(Number),
      timestamp: expect.any(Number),
      trace_id: traceId,
    });
  },
);

sentryTest(
  'should capture INP with unknown target name when navigation removes element from DOM',
  async ({ browserName, getLocalTestUrl, page }) => {
    if (shouldSkipTracingTest() || !supportedBrowsers.includes(browserName)) {
      sentryTest.skip();
    }

    const url = await getLocalTestUrl({ testDir: __dirname });

    await page.goto(url);
    await getFirstSentryEnvelopeRequest<SentryEvent>(page); // wait for page load

    const spanEnvelopePromise = getMultipleSentryEnvelopeRequests<SpanEnvelope>(
      page,
      1,
      { envelopeType: 'span' },
      properFullEnvelopeRequestParser,
    );

    // Simulating route change (also changing <nav> in DOM)
    await page.locator('[data-test-id=nav-link-changeDOM]').click();
    await page.locator('.navigated').isVisible();

    await page.waitForTimeout(500);

    // Page hide to trigger INP
    await hidePage(page);

    // Get the INP span envelope
    const spanEnvelope = (await spanEnvelopePromise)[0];

    const spanEnvelopeHeaders = spanEnvelope[0];
    const spanEnvelopeItem = spanEnvelope[1][0][1];

    const traceId = spanEnvelopeHeaders.trace!.trace_id;
    expect(traceId).toMatch(/[a-f\d]{32}/);

    expect(spanEnvelopeHeaders).toEqual({
      sent_at: expect.any(String),
      trace: {
        environment: 'production',
        public_key: 'public',
        sample_rate: '1',
        sampled: 'true',
        trace_id: traceId,
        sample_rand: expect.any(String),
      },
    });

    const inpValue = spanEnvelopeItem.measurements?.inp.value;
    expect(inpValue).toBeGreaterThan(0);

    expect(spanEnvelopeItem).toEqual({
      data: {
        'sentry.exclusive_time': inpValue,
        'sentry.op': 'ui.interaction.click',
        'sentry.origin': 'auto.http.browser.inp',
        'sentry.source': 'custom',
        transaction: 'test-url',
        'user_agent.original': expect.stringContaining('Chrome'),
      },
      measurements: {
        inp: {
          unit: 'millisecond',
          value: inpValue,
        },
      },
      description: 'body > nav#navigation > NavigationLink',
      exclusive_time: inpValue,
      op: 'ui.interaction.click',
      origin: 'auto.http.browser.inp',
      is_segment: true,
      segment_id: spanEnvelopeItem.span_id,
      span_id: expect.stringMatching(/[a-f\d]{16}/),
      start_timestamp: expect.any(Number),
      timestamp: expect.any(Number),
      trace_id: traceId,
    });
  },
);
