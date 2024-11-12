import { expect } from '@playwright/test';
import type { Event as SentryEvent, SpanEnvelope, SpanJSON } from '@sentry/types';

import { sentryTest } from '../../../../utils/fixtures';
import {
  getFirstSentryEnvelopeRequest,
  getMultipleSentryEnvelopeRequests,
  properFullEnvelopeRequestParser,
  shouldSkipTracingTest,
} from '../../../../utils/helpers';

sentryTest(
  'should capture an INP click event span during pageload',
  async ({ browserName, getLocalTestPath, page }) => {
    const supportedBrowsers = ['chromium'];

    if (shouldSkipTracingTest() || !supportedBrowsers.includes(browserName)) {
      sentryTest.skip();
    }

    const url = await getLocalTestPath({ testDir: __dirname });

    await page.goto(url);

    const spanEnvelopePromise = getMultipleSentryEnvelopeRequests<SpanEnvelope>(
      page,
      1,
      { envelopeType: 'span' },
      properFullEnvelopeRequestParser,
    );

    await page.locator('[data-test-id=normal-button]').click();
    await page.locator('.clicked[data-test-id=normal-button]').isVisible();

    await page.waitForTimeout(500);

    // Page hide to trigger INP
    await page.evaluate(() => {
      window.dispatchEvent(new Event('pagehide'));
    });

    // Get the INP span envelope
    const spanEnvelope = (await spanEnvelopePromise)[0];

    const spanEnvelopeHeaders = spanEnvelope[0];
    const spanEnvelopeItem = spanEnvelope[1][0][1];

    const traceId = spanEnvelopeHeaders.trace!.trace_id;
    expect(traceId).toMatch(/[a-f0-9]{32}/);

    expect(spanEnvelopeHeaders).toEqual({
      sent_at: expect.any(String),
      trace: {
        environment: 'production',
        public_key: 'public',
        sample_rate: '1',
        sampled: 'true',
        trace_id: traceId,
        // no transaction, because span source is URL
      },
    });

    const inpValue = spanEnvelopeItem.measurements?.inp.value;
    expect(inpValue).toBeGreaterThan(0);

    expect(spanEnvelopeItem).toEqual({
      data: {
        'sentry.exclusive_time': inpValue,
        'sentry.op': 'ui.interaction.click',
        'sentry.origin': 'auto.http.browser.inp',
        transaction: 'test-url',
        'user_agent.original': expect.stringContaining('Chrome'),
      },
      measurements: {
        inp: {
          unit: 'millisecond',
          value: inpValue,
        },
      },
      description: 'body > NormalButton',
      exclusive_time: inpValue,
      op: 'ui.interaction.click',
      origin: 'auto.http.browser.inp',
      segment_id: expect.not.stringMatching(spanEnvelopeItem.span_id!),
      // Parent is the pageload span
      parent_span_id: expect.stringMatching(/[a-f0-9]{16}/),
      span_id: expect.stringMatching(/[a-f0-9]{16}/),
      start_timestamp: expect.any(Number),
      timestamp: expect.any(Number),
      trace_id: traceId,
    });
  },
);

sentryTest(
  'should choose the slowest interaction click event when INP is triggered.',
  async ({ browserName, getLocalTestPath, page }) => {
    const supportedBrowsers = ['chromium'];

    if (shouldSkipTracingTest() || !supportedBrowsers.includes(browserName)) {
      sentryTest.skip();
    }

    const url = await getLocalTestPath({ testDir: __dirname });

    await page.goto(url);
    await getFirstSentryEnvelopeRequest<SentryEvent>(page);

    await page.locator('[data-test-id=normal-button]').click();
    await page.locator('.clicked[data-test-id=normal-button]').isVisible();

    await page.waitForTimeout(500);

    await page.locator('[data-test-id=slow-button]').click();
    await page.locator('.clicked[data-test-id=slow-button]').isVisible();

    await page.waitForTimeout(500);

    const spanPromise = getMultipleSentryEnvelopeRequests<SpanJSON>(page, 1, {
      envelopeType: 'span',
    });

    // Page hide to trigger INP
    await page.evaluate(() => {
      window.dispatchEvent(new Event('pagehide'));
    });

    // Get the INP span envelope
    const span = (await spanPromise)[0];

    expect(span.op).toBe('ui.interaction.click');
    expect(span.description).toBe('body > SlowButton');
    expect(span.exclusive_time).toBeGreaterThan(400);
    expect(span.measurements?.inp.value).toBeGreaterThan(400);
    expect(span.measurements?.inp.unit).toBe('millisecond');
  },
);
