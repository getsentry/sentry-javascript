import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';
import type { Event as SentryEvent, EventEnvelope, SpanEnvelope } from '@sentry/core';
import { sentryTest } from '../../../../utils/fixtures';
import {
  getFirstSentryEnvelopeRequest,
  getMultipleSentryEnvelopeRequests,
  properFullEnvelopeRequestParser,
  shouldSkipTracingTest,
} from '../../../../utils/helpers';

sentryTest.beforeEach(async ({ browserName, page }) => {
  if (shouldSkipTracingTest() || browserName !== 'chromium') {
    sentryTest.skip();
  }

  await page.setViewportSize({ width: 800, height: 1200 });
});

function waitForLayoutShift(page: Page): Promise<void> {
  return page.evaluate(() => {
    return new Promise(resolve => {
      window.addEventListener('cls-done', () => resolve());
    });
  });
}

function triggerAndWaitForLayoutShift(page: Page): Promise<void> {
  return page.evaluate(() => {
    window.dispatchEvent(new CustomEvent('trigger-cls'));
    return new Promise(resolve => {
      window.addEventListener('cls-done', () => resolve());
    });
  });
}

function hidePage(page: Page): Promise<void> {
  return page.evaluate(() => {
    window.dispatchEvent(new Event('pagehide'));
  });
}

sentryTest('captures a "GOOD" CLS vital with its source as a standalone span', async ({ getLocalTestUrl, page }) => {
  const spanEnvelopePromise = getMultipleSentryEnvelopeRequests<SpanEnvelope>(
    page,
    1,
    { envelopeType: 'span' },
    properFullEnvelopeRequestParser,
  );

  const url = await getLocalTestUrl({ testDir: __dirname });
  await page.goto(`${url}#0.05`);

  await waitForLayoutShift(page);

  await hidePage(page);

  const spanEnvelope = (await spanEnvelopePromise)[0];

  const spanEnvelopeHeaders = spanEnvelope[0];
  const spanEnvelopeItem = spanEnvelope[1][0][1];

  expect(spanEnvelopeItem).toEqual({
    data: {
      'sentry.exclusive_time': 0,
      'sentry.op': 'ui.webvital.cls',
      'sentry.origin': 'auto.http.browser.cls',
      'sentry.report_event': 'pagehide',
      transaction: expect.stringContaining('index.html'),
      'user_agent.original': expect.stringContaining('Chrome'),
      'sentry.pageload.span_id': expect.stringMatching(/[a-f\d]{16}/),
      'cls.source.1': expect.stringContaining('body > div#content > p'),
    },
    description: expect.stringContaining('body > div#content > p'),
    exclusive_time: 0,
    measurements: {
      cls: {
        unit: '',
        value: expect.any(Number), // better check below,
      },
    },
    op: 'ui.webvital.cls',
    origin: 'auto.http.browser.cls',
    parent_span_id: expect.stringMatching(/[a-f\d]{16}/),
    span_id: expect.stringMatching(/[a-f\d]{16}/),
    segment_id: expect.stringMatching(/[a-f\d]{16}/),
    start_timestamp: expect.any(Number),
    timestamp: spanEnvelopeItem.start_timestamp,
    trace_id: expect.stringMatching(/[a-f\d]{32}/),
  });

  // Flakey value dependent on timings -> we check for a range
  expect(spanEnvelopeItem.measurements?.cls?.value).toBeGreaterThan(0.03);
  expect(spanEnvelopeItem.measurements?.cls?.value).toBeLessThan(0.07);

  expect(spanEnvelopeHeaders).toEqual({
    sent_at: expect.any(String),
    trace: {
      environment: 'production',
      public_key: 'public',
      sample_rate: '1',
      sampled: 'true',
      trace_id: spanEnvelopeItem.trace_id,
      sample_rand: expect.any(String),
      // no transaction, because span source is URL
    },
  });
});

sentryTest('captures a "MEH" CLS vital with its source as a standalone span', async ({ getLocalTestUrl, page }) => {
  const spanEnvelopePromise = getMultipleSentryEnvelopeRequests<SpanEnvelope>(
    page,
    1,
    { envelopeType: 'span' },
    properFullEnvelopeRequestParser,
  );

  const url = await getLocalTestUrl({ testDir: __dirname });
  await page.goto(`${url}#0.21`);

  await waitForLayoutShift(page);

  // Page hide to trigger CLS emission
  await page.evaluate(() => {
    window.dispatchEvent(new Event('pagehide'));
  });

  const spanEnvelope = (await spanEnvelopePromise)[0];

  const spanEnvelopeHeaders = spanEnvelope[0];
  const spanEnvelopeItem = spanEnvelope[1][0][1];

  expect(spanEnvelopeItem).toEqual({
    data: {
      'sentry.exclusive_time': 0,
      'sentry.op': 'ui.webvital.cls',
      'sentry.origin': 'auto.http.browser.cls',
      'sentry.report_event': 'pagehide',
      transaction: expect.stringContaining('index.html'),
      'user_agent.original': expect.stringContaining('Chrome'),
      'sentry.pageload.span_id': expect.stringMatching(/[a-f\d]{16}/),
      'cls.source.1': expect.stringContaining('body > div#content > p'),
    },
    description: expect.stringContaining('body > div#content > p'),
    exclusive_time: 0,
    measurements: {
      cls: {
        unit: '',
        value: expect.any(Number), // better check below,
      },
    },
    op: 'ui.webvital.cls',
    origin: 'auto.http.browser.cls',
    parent_span_id: expect.stringMatching(/[a-f\d]{16}/),
    span_id: expect.stringMatching(/[a-f\d]{16}/),
    segment_id: expect.stringMatching(/[a-f\d]{16}/),
    start_timestamp: expect.any(Number),
    timestamp: spanEnvelopeItem.start_timestamp,
    trace_id: expect.stringMatching(/[a-f\d]{32}/),
  });

  // Flakey value dependent on timings -> we check for a range
  expect(spanEnvelopeItem.measurements?.cls?.value).toBeGreaterThan(0.18);
  expect(spanEnvelopeItem.measurements?.cls?.value).toBeLessThan(0.23);

  expect(spanEnvelopeHeaders).toEqual({
    sent_at: expect.any(String),
    trace: {
      environment: 'production',
      public_key: 'public',
      sample_rate: '1',
      sampled: 'true',
      trace_id: spanEnvelopeItem.trace_id,
      sample_rand: expect.any(String),
      // no transaction, because span source is URL
    },
  });
});

sentryTest('captures a "POOR" CLS vital with its source as a standalone span.', async ({ getLocalTestUrl, page }) => {
  const spanEnvelopePromise = getMultipleSentryEnvelopeRequests<SpanEnvelope>(
    page,
    1,
    { envelopeType: 'span' },
    properFullEnvelopeRequestParser,
  );

  const url = await getLocalTestUrl({ testDir: __dirname });
  await page.goto(`${url}#0.35`);

  await waitForLayoutShift(page);

  // Page hide to trigger CLS emission
  await hidePage(page);

  const spanEnvelope = (await spanEnvelopePromise)[0];

  const spanEnvelopeHeaders = spanEnvelope[0];
  const spanEnvelopeItem = spanEnvelope[1][0][1];

  expect(spanEnvelopeItem).toEqual({
    data: {
      'sentry.exclusive_time': 0,
      'sentry.op': 'ui.webvital.cls',
      'sentry.origin': 'auto.http.browser.cls',
      'sentry.report_event': 'pagehide',
      transaction: expect.stringContaining('index.html'),
      'user_agent.original': expect.stringContaining('Chrome'),
      'sentry.pageload.span_id': expect.stringMatching(/[a-f\d]{16}/),
      'cls.source.1': expect.stringContaining('body > div#content > p'),
    },
    description: expect.stringContaining('body > div#content > p'),
    exclusive_time: 0,
    measurements: {
      cls: {
        unit: '',
        value: expect.any(Number), // better check below,
      },
    },
    op: 'ui.webvital.cls',
    origin: 'auto.http.browser.cls',
    parent_span_id: expect.stringMatching(/[a-f\d]{16}/),
    span_id: expect.stringMatching(/[a-f\d]{16}/),
    segment_id: expect.stringMatching(/[a-f\d]{16}/),
    start_timestamp: expect.any(Number),
    timestamp: spanEnvelopeItem.start_timestamp,
    trace_id: expect.stringMatching(/[a-f\d]{32}/),
  });

  // Flakey value dependent on timings -> we check for a range
  expect(spanEnvelopeItem.measurements?.cls?.value).toBeGreaterThan(0.33);
  expect(spanEnvelopeItem.measurements?.cls?.value).toBeLessThan(0.38);

  expect(spanEnvelopeHeaders).toEqual({
    sent_at: expect.any(String),
    trace: {
      environment: 'production',
      public_key: 'public',
      sample_rate: '1',
      sampled: 'true',
      trace_id: spanEnvelopeItem.trace_id,
      sample_rand: expect.any(String),
      // no transaction, because span source is URL
    },
  });
});

sentryTest(
  'captures a 0 CLS vital as a standalone span if no layout shift occurred',
  async ({ getLocalTestUrl, page }) => {
    const spanEnvelopePromise = getMultipleSentryEnvelopeRequests<SpanEnvelope>(
      page,
      1,
      { envelopeType: 'span' },
      properFullEnvelopeRequestParser,
    );

    const url = await getLocalTestUrl({ testDir: __dirname });
    await page.goto(url);

    await page.waitForTimeout(1000);

    await hidePage(page);

    const spanEnvelope = (await spanEnvelopePromise)[0];

    const spanEnvelopeHeaders = spanEnvelope[0];
    const spanEnvelopeItem = spanEnvelope[1][0][1];

    expect(spanEnvelopeItem).toEqual({
      data: {
        'sentry.exclusive_time': 0,
        'sentry.op': 'ui.webvital.cls',
        'sentry.origin': 'auto.http.browser.cls',
        'sentry.report_event': 'pagehide',
        transaction: expect.stringContaining('index.html'),
        'user_agent.original': expect.stringContaining('Chrome'),
        'sentry.pageload.span_id': expect.stringMatching(/[a-f\d]{16}/),
      },
      description: 'Layout shift',
      exclusive_time: 0,
      measurements: {
        cls: {
          unit: '',
          value: 0,
        },
      },
      op: 'ui.webvital.cls',
      origin: 'auto.http.browser.cls',
      parent_span_id: expect.stringMatching(/[a-f\d]{16}/),
      span_id: expect.stringMatching(/[a-f\d]{16}/),
      segment_id: expect.stringMatching(/[a-f\d]{16}/),
      start_timestamp: expect.any(Number),
      timestamp: spanEnvelopeItem.start_timestamp,
      trace_id: expect.stringMatching(/[a-f\d]{32}/),
    });

    expect(spanEnvelopeHeaders).toEqual({
      sent_at: expect.any(String),
      trace: {
        environment: 'production',
        public_key: 'public',
        sample_rate: '1',
        sampled: 'true',
        trace_id: spanEnvelopeItem.trace_id,
        sample_rand: expect.any(String),
        // no transaction, because span source is URL
      },
    });
  },
);

sentryTest(
  'captures CLS increases after the pageload span ended, when page is hidden',
  async ({ getLocalTestUrl, page }) => {
    const url = await getLocalTestUrl({ testDir: __dirname });

    const eventData = await getFirstSentryEnvelopeRequest<SentryEvent>(page, url);

    expect(eventData.type).toBe('transaction');
    expect(eventData.contexts?.trace?.op).toBe('pageload');

    const pageloadSpanId = eventData.contexts?.trace?.span_id;
    const pageloadTraceId = eventData.contexts?.trace?.trace_id;

    expect(pageloadSpanId).toMatch(/[a-f\d]{16}/);
    expect(pageloadTraceId).toMatch(/[a-f\d]{32}/);

    const spanEnvelopePromise = getMultipleSentryEnvelopeRequests<SpanEnvelope>(
      page,
      1,
      { envelopeType: 'span' },
      properFullEnvelopeRequestParser,
    );

    await triggerAndWaitForLayoutShift(page);

    await hidePage(page);

    const spanEnvelope = (await spanEnvelopePromise)[0];
    const spanEnvelopeItem = spanEnvelope[1][0][1];
    // Flakey value dependent on timings -> we check for a range
    expect(spanEnvelopeItem.measurements?.cls?.value).toBeGreaterThan(0.05);
    expect(spanEnvelopeItem.measurements?.cls?.value).toBeLessThan(0.15);

    // Ensure the CLS span is connected to the pageload span and trace
    expect(spanEnvelopeItem.data?.['sentry.pageload.span_id']).toBe(pageloadSpanId);
    expect(spanEnvelopeItem.trace_id).toEqual(pageloadTraceId);

    expect(spanEnvelopeItem.data?.['sentry.report_event']).toBe('pagehide');
  },
);

sentryTest('sends CLS of the initial page when soft-navigating to a new page', async ({ getLocalTestUrl, page }) => {
  const url = await getLocalTestUrl({ testDir: __dirname });

  const pageloadEventData = await getFirstSentryEnvelopeRequest<SentryEvent>(page, url);

  expect(pageloadEventData.type).toBe('transaction');
  expect(pageloadEventData.contexts?.trace?.op).toBe('pageload');

  const spanEnvelopePromise = getMultipleSentryEnvelopeRequests<SpanEnvelope>(
    page,
    1,
    { envelopeType: 'span' },
    properFullEnvelopeRequestParser,
  );

  await triggerAndWaitForLayoutShift(page);

  await page.goto(`${url}#soft-navigation`);

  const pageloadTraceId = pageloadEventData.contexts?.trace?.trace_id;
  expect(pageloadTraceId).toMatch(/[a-f\d]{32}/);

  const spanEnvelope = (await spanEnvelopePromise)[0];
  const spanEnvelopeItem = spanEnvelope[1][0][1];
  // Flakey value dependent on timings -> we check for a range
  expect(spanEnvelopeItem.measurements?.cls?.value).toBeGreaterThan(0.05);
  expect(spanEnvelopeItem.measurements?.cls?.value).toBeLessThan(0.15);
  expect(spanEnvelopeItem.data?.['sentry.pageload.span_id']).toBe(pageloadEventData.contexts?.trace?.span_id);
  expect(spanEnvelopeItem.trace_id).toEqual(pageloadTraceId);

  expect(spanEnvelopeItem.data?.['sentry.report_event']).toBe('navigation');
});

sentryTest("doesn't send further CLS after the first navigation", async ({ getLocalTestUrl, page }) => {
  const url = await getLocalTestUrl({ testDir: __dirname });

  const eventData = await getFirstSentryEnvelopeRequest<SentryEvent>(page, url);

  expect(eventData.type).toBe('transaction');
  expect(eventData.contexts?.trace?.op).toBe('pageload');

  const spanEnvelopePromise = getMultipleSentryEnvelopeRequests<SpanEnvelope>(
    page,
    1,
    { envelopeType: 'span' },
    properFullEnvelopeRequestParser,
  );

  await triggerAndWaitForLayoutShift(page);

  await page.goto(`${url}#soft-navigation`);

  const spanEnvelope = (await spanEnvelopePromise)[0];
  const spanEnvelopeItem = spanEnvelope[1][0][1];
  expect(spanEnvelopeItem.measurements?.cls?.value).toBeGreaterThan(0);
  expect(spanEnvelopeItem.data?.['sentry.report_event']).toBe('navigation');

  getMultipleSentryEnvelopeRequests<SpanEnvelope>(page, 1, { envelopeType: 'span' }, () => {
    throw new Error('Unexpected span - This should not happen!');
  });

  const navigationTxnPromise = getMultipleSentryEnvelopeRequests<EventEnvelope>(
    page,
    1,
    { envelopeType: 'transaction' },
    properFullEnvelopeRequestParser,
  );

  // activate both CLS emission triggers:
  await page.goto(`${url}#soft-navigation-2`);
  await hidePage(page);

  // assumption: If we would send another CLS span on the 2nd navigation, it would be sent before the navigation
  // transaction ends. This isn't 100% safe to ensure we don't send something but otherwise we'd need to wait for
  // a timeout or something similar.
  await navigationTxnPromise;
});

sentryTest("doesn't send further CLS after the first page hide", async ({ getLocalTestUrl, page }) => {
  const url = await getLocalTestUrl({ testDir: __dirname });

  const eventData = await getFirstSentryEnvelopeRequest<SentryEvent>(page, url);

  expect(eventData.type).toBe('transaction');
  expect(eventData.contexts?.trace?.op).toBe('pageload');

  const spanEnvelopePromise = getMultipleSentryEnvelopeRequests<SpanEnvelope>(
    page,
    1,
    { envelopeType: 'span' },
    properFullEnvelopeRequestParser,
  );

  await triggerAndWaitForLayoutShift(page);

  await hidePage(page);

  const spanEnvelope = (await spanEnvelopePromise)[0];
  const spanEnvelopeItem = spanEnvelope[1][0][1];
  expect(spanEnvelopeItem.measurements?.cls?.value).toBeGreaterThan(0);
  expect(spanEnvelopeItem.data?.['sentry.report_event']).toBe('pagehide');

  getMultipleSentryEnvelopeRequests<SpanEnvelope>(page, 1, { envelopeType: 'span' }, () => {
    throw new Error('Unexpected span - This should not happen!');
  });

  const navigationTxnPromise = getMultipleSentryEnvelopeRequests<EventEnvelope>(
    page,
    1,
    { envelopeType: 'transaction' },
    properFullEnvelopeRequestParser,
  );

  // activate both CLS emission triggers:
  await page.goto(`${url}#soft-navigation-2`);
  await hidePage(page);

  // assumption: If we would send another CLS span on the 2nd navigation, it would be sent before the navigation
  // transaction ends. This isn't 100% safe to ensure we don't send something but otherwise we'd need to wait for
  // a timeout or something similar.
  await navigationTxnPromise;
});

sentryTest('CLS span timestamps are set correctly', async ({ getLocalTestUrl, page }) => {
  const url = await getLocalTestUrl({ testDir: __dirname });

  const eventData = await getFirstSentryEnvelopeRequest<SentryEvent>(page, url);

  expect(eventData.type).toBe('transaction');
  expect(eventData.contexts?.trace?.op).toBe('pageload');
  expect(eventData.timestamp).toBeDefined();

  const pageloadEndTimestamp = eventData.timestamp!;

  const spanEnvelopePromise = getMultipleSentryEnvelopeRequests<SpanEnvelope>(
    page,
    1,
    { envelopeType: 'span' },
    properFullEnvelopeRequestParser,
  );

  await triggerAndWaitForLayoutShift(page);

  await hidePage(page);

  const spanEnvelope = (await spanEnvelopePromise)[0];
  const spanEnvelopeItem = spanEnvelope[1][0][1];

  expect(spanEnvelopeItem.start_timestamp).toBeDefined();
  expect(spanEnvelopeItem.timestamp).toBeDefined();

  const clsSpanStartTimestamp = spanEnvelopeItem.start_timestamp!;
  const clsSpanEndTimestamp = spanEnvelopeItem.timestamp!;

  // CLS performance entries have no duration ==> start and end timestamp should be the same
  expect(clsSpanStartTimestamp).toEqual(clsSpanEndTimestamp);

  // We don't really care that they are very close together but rather about the order of magnitude
  // Previously, we had a bug where the timestamps would be significantly off (by multiple hours)
  // so we only ensure that this bug is fixed. 60 seconds should be more than enough.
  expect(clsSpanStartTimestamp - pageloadEndTimestamp).toBeLessThan(60);
  expect(clsSpanStartTimestamp).toBeGreaterThan(pageloadEndTimestamp);
});
