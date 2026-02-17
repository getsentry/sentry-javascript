import type { Page, Route } from '@playwright/test';
import { expect } from '@playwright/test';
import type { Event as SentryEvent, EventEnvelope, SpanEnvelope } from '@sentry/core';
import { sentryTest } from '../../../../utils/fixtures';
import {
  envelopeRequestParser,
  getFirstSentryEnvelopeRequest,
  getMultipleSentryEnvelopeRequests,
  properFullEnvelopeRequestParser,
  shouldSkipTracingTest,
  waitForTransactionRequest,
} from '../../../../utils/helpers';

sentryTest.beforeEach(async ({ browserName, page }) => {
  if (shouldSkipTracingTest() || browserName !== 'chromium') {
    sentryTest.skip();
  }

  await page.setViewportSize({ width: 800, height: 1200 });
});

function hidePage(page: Page): Promise<void> {
  return page.evaluate(() => {
    window.dispatchEvent(new Event('pagehide'));
  });
}

sentryTest('captures LCP vital as a standalone span', async ({ getLocalTestUrl, page }) => {
  const spanEnvelopePromise = getMultipleSentryEnvelopeRequests<SpanEnvelope>(
    page,
    1,
    { envelopeType: 'span' },
    properFullEnvelopeRequestParser,
  );

  const pageloadEnvelopePromise = waitForTransactionRequest(page, e => e.contexts?.trace?.op === 'pageload');

  page.route('**', route => route.continue());
  page.route('**/my/image.png', async (route: Route) => {
    return route.fulfill({
      path: `${__dirname}/assets/sentry-logo-600x179.png`,
    });
  });

  const url = await getLocalTestUrl({ testDir: __dirname });
  await page.goto(url);

  // Wait for LCP to be captured
  await page.waitForTimeout(1000);

  await hidePage(page);

  const spanEnvelope = (await spanEnvelopePromise)[0];
  const pageloadTransactionEvent = envelopeRequestParser(await pageloadEnvelopePromise);

  const spanEnvelopeHeaders = spanEnvelope[0];
  const spanEnvelopeItem = spanEnvelope[1][0][1];

  const pageloadTraceId = pageloadTransactionEvent.contexts?.trace?.trace_id;
  expect(pageloadTraceId).toMatch(/[a-f\d]{32}/);

  expect(spanEnvelopeItem).toEqual({
    data: {
      'sentry.exclusive_time': 0,
      'sentry.op': 'ui.webvital.lcp',
      'sentry.origin': 'auto.http.browser.lcp',
      'sentry.report_event': 'pagehide',
      transaction: expect.stringContaining('index.html'),
      'user_agent.original': expect.stringContaining('Chrome'),
      'sentry.pageload.span_id': expect.stringMatching(/[a-f\d]{16}/),
      'lcp.element': 'body > img',
      'lcp.loadTime': expect.any(Number),
      'lcp.renderTime': expect.any(Number),
      'lcp.size': expect.any(Number),
      'lcp.url': 'https://sentry-test-site.example/my/image.png',
    },
    description: expect.stringContaining('body > img'),
    exclusive_time: 0,
    measurements: {
      lcp: {
        unit: 'millisecond',
        value: expect.any(Number),
      },
    },
    op: 'ui.webvital.lcp',
    origin: 'auto.http.browser.lcp',
    parent_span_id: expect.stringMatching(/[a-f\d]{16}/),
    span_id: expect.stringMatching(/[a-f\d]{16}/),
    segment_id: expect.stringMatching(/[a-f\d]{16}/),
    start_timestamp: expect.any(Number),
    timestamp: spanEnvelopeItem.start_timestamp, // LCP is a point-in-time metric
    trace_id: pageloadTraceId,
  });

  // LCP value should be greater than 0
  expect(spanEnvelopeItem.measurements?.lcp?.value).toBeGreaterThan(0);

  expect(spanEnvelopeHeaders).toEqual({
    sent_at: expect.any(String),
    trace: {
      environment: 'production',
      public_key: 'public',
      sample_rate: '1',
      sampled: 'true',
      trace_id: spanEnvelopeItem.trace_id,
      sample_rand: expect.any(String),
    },
  });
});

sentryTest('LCP span is linked to pageload transaction', async ({ getLocalTestUrl, page }) => {
  page.route('**', route => route.continue());
  page.route('**/my/image.png', async (route: Route) => {
    return route.fulfill({
      path: `${__dirname}/assets/sentry-logo-600x179.png`,
    });
  });

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

  // Wait for LCP to be captured
  await page.waitForTimeout(1000);

  await hidePage(page);

  const spanEnvelope = (await spanEnvelopePromise)[0];
  const spanEnvelopeItem = spanEnvelope[1][0][1];

  // Ensure the LCP span is connected to the pageload span and trace
  expect(spanEnvelopeItem.data?.['sentry.pageload.span_id']).toBe(pageloadSpanId);
  expect(spanEnvelopeItem.trace_id).toEqual(pageloadTraceId);
  expect(spanEnvelopeItem.measurements?.lcp?.value).toBeGreaterThan(0);
});

sentryTest('sends LCP of the initial page when soft-navigating to a new page', async ({ getLocalTestUrl, page }) => {
  page.route('**', route => route.continue());
  page.route('**/my/image.png', async (route: Route) => {
    return route.fulfill({
      path: `${__dirname}/assets/sentry-logo-600x179.png`,
    });
  });

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

  // Wait for LCP to be captured
  await page.waitForTimeout(1000);

  await page.goto(`${url}#soft-navigation`);

  const spanEnvelope = (await spanEnvelopePromise)[0];
  const spanEnvelopeItem = spanEnvelope[1][0][1];

  expect(spanEnvelopeItem.measurements?.lcp?.value).toBeGreaterThan(0);
  expect(spanEnvelopeItem.data?.['sentry.pageload.span_id']).toBe(pageloadEventData.contexts?.trace?.span_id);
  expect(spanEnvelopeItem.data?.['sentry.report_event']).toBe('navigation');
  expect(spanEnvelopeItem.trace_id).toBe(pageloadEventData.contexts?.trace?.trace_id);
});

sentryTest("doesn't send further LCP after the first navigation", async ({ getLocalTestUrl, page }) => {
  page.route('**', route => route.continue());
  page.route('**/my/image.png', async (route: Route) => {
    return route.fulfill({
      path: `${__dirname}/assets/sentry-logo-600x179.png`,
    });
  });

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

  // Wait for LCP to be captured
  await page.waitForTimeout(1000);

  await page.goto(`${url}#soft-navigation`);

  const spanEnvelope = (await spanEnvelopePromise)[0];
  const spanEnvelopeItem = spanEnvelope[1][0][1];
  expect(spanEnvelopeItem.measurements?.lcp?.value).toBeGreaterThan(0);
  expect(spanEnvelopeItem.data?.['sentry.report_event']).toBe('navigation');
  expect(spanEnvelopeItem.trace_id).toBe(pageloadEventData.contexts?.trace?.trace_id);

  getMultipleSentryEnvelopeRequests<SpanEnvelope>(page, 1, { envelopeType: 'span' }, () => {
    throw new Error('Unexpected span - This should not happen!');
  });

  const navigationTxnPromise = getMultipleSentryEnvelopeRequests<EventEnvelope>(
    page,
    1,
    { envelopeType: 'transaction' },
    properFullEnvelopeRequestParser,
  );

  // activate both LCP emission triggers:
  await page.goto(`${url}#soft-navigation-2`);
  await hidePage(page);

  // assumption: If we would send another LCP span on the 2nd navigation, it would be sent before the navigation
  // transaction ends. This isn't 100% safe to ensure we don't send something but otherwise we'd need to wait for
  // a timeout or something similar.
  await navigationTxnPromise;
});

sentryTest("doesn't send further LCP after the first page hide", async ({ getLocalTestUrl, page }) => {
  page.route('**', route => route.continue());
  page.route('**/my/image.png', async (route: Route) => {
    return route.fulfill({
      path: `${__dirname}/assets/sentry-logo-600x179.png`,
    });
  });

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

  // Wait for LCP to be captured
  await page.waitForTimeout(1000);

  await hidePage(page);

  const spanEnvelope = (await spanEnvelopePromise)[0];
  const spanEnvelopeItem = spanEnvelope[1][0][1];
  expect(spanEnvelopeItem.measurements?.lcp?.value).toBeGreaterThan(0);
  expect(spanEnvelopeItem.data?.['sentry.report_event']).toBe('pagehide');
  expect(spanEnvelopeItem.trace_id).toBe(pageloadEventData.contexts?.trace?.trace_id);

  getMultipleSentryEnvelopeRequests<SpanEnvelope>(page, 1, { envelopeType: 'span' }, () => {
    throw new Error('Unexpected span - This should not happen!');
  });

  const navigationTxnPromise = getMultipleSentryEnvelopeRequests<EventEnvelope>(
    page,
    1,
    { envelopeType: 'transaction' },
    properFullEnvelopeRequestParser,
  );

  // activate both LCP emission triggers:
  await page.goto(`${url}#soft-navigation-2`);
  await hidePage(page);

  // assumption: If we would send another LCP span on the 2nd navigation, it would be sent before the navigation
  // transaction ends. This isn't 100% safe to ensure we don't send something but otherwise we'd need to wait for
  // a timeout or something similar.
  await navigationTxnPromise;
});

sentryTest('LCP span timestamps are set correctly', async ({ getLocalTestUrl, page }) => {
  page.route('**', route => route.continue());
  page.route('**/my/image.png', async (route: Route) => {
    return route.fulfill({
      path: `${__dirname}/assets/sentry-logo-600x179.png`,
    });
  });

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

  // Wait for LCP to be captured
  await page.waitForTimeout(1000);

  await hidePage(page);

  const spanEnvelope = (await spanEnvelopePromise)[0];
  const spanEnvelopeItem = spanEnvelope[1][0][1];

  expect(spanEnvelopeItem.start_timestamp).toBeDefined();
  expect(spanEnvelopeItem.timestamp).toBeDefined();

  const lcpSpanStartTimestamp = spanEnvelopeItem.start_timestamp!;
  const lcpSpanEndTimestamp = spanEnvelopeItem.timestamp!;

  // LCP is a point-in-time metric ==> start and end timestamp should be the same
  expect(lcpSpanStartTimestamp).toEqual(lcpSpanEndTimestamp);

  // We don't really care that they are very close together but rather about the order of magnitude
  // Previously, we had a bug where the timestamps would be significantly off (by multiple hours)
  // so we only ensure that this bug is fixed. 60 seconds should be more than enough.
  expect(lcpSpanStartTimestamp - pageloadEndTimestamp).toBeLessThan(60);
});

sentryTest(
  'pageload transaction does not contain LCP measurement when standalone spans are enabled',
  async ({ getLocalTestUrl, page }) => {
    page.route('**', route => route.continue());
    page.route('**/my/image.png', async (route: Route) => {
      return route.fulfill({
        path: `${__dirname}/assets/sentry-logo-600x179.png`,
      });
    });

    const url = await getLocalTestUrl({ testDir: __dirname });
    const eventData = await getFirstSentryEnvelopeRequest<SentryEvent>(page, url);

    expect(eventData.type).toBe('transaction');
    expect(eventData.contexts?.trace?.op).toBe('pageload');

    // LCP measurement should NOT be present on the pageload transaction when standalone spans are enabled
    expect(eventData.measurements?.lcp).toBeUndefined();

    // LCP attributes should also NOT be present on the pageload transaction when standalone spans are enabled
    // because the LCP data is sent as a standalone span instead
    expect(eventData.contexts?.trace?.data?.['lcp.element']).toBeUndefined();
    expect(eventData.contexts?.trace?.data?.['lcp.size']).toBeUndefined();
  },
);
