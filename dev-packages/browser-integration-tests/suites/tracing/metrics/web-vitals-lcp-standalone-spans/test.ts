import type { Page, Route } from '@playwright/test';
import { expect } from '@playwright/test';
import type { Event as SentryEvent, EventEnvelope, SpanEnvelope } from '@sentry/core';
import { sentryTest } from '../../../../utils/fixtures';
import {
  getFirstSentryEnvelopeRequest,
  getMultipleSentryEnvelopeRequests,
  properFullEnvelopeRequestParser,
  shouldSkipTracingTest,
} from '../../../../utils/helpers';
import { waitForSpanV2Envelope, waitForV2Span } from '../../../../utils/spanFirstUtils';

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
  const pageloadSpanPromise = waitForV2Span(page, span => span.attributes?.['sentry.op']?.value === 'pageload');
  const lcpSpanEnvelopePromise = waitForSpanV2Envelope(
    page,
    spanEnvelope =>
      !!spanEnvelope[1]?.[0]?.[1]?.items?.find(i => i.attributes?.['sentry.op']?.value === 'ui.webvital.lcp'),
  );

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

  const spanEnvelope = await lcpSpanEnvelopePromise;
  const spanEnvelopeItem = spanEnvelope[1][0][1];
  const lcpSpanEnvelopeHeaders = spanEnvelope[0];
  const lcpSpan = spanEnvelopeItem.items.find(i => i.attributes?.['sentry.op']?.value === 'ui.webvital.lcp');

  const pageloadSpan = await pageloadSpanPromise;
  const pageloadTraceId = pageloadSpan.trace_id;
  expect(pageloadTraceId).toMatch(/[a-f\d]{32}/);

  expect(lcpSpan).toEqual({
    attributes: {
      'sentry.op': {
        value: 'ui.webvital.lcp',
        type: 'string',
      },
      'sentry.origin': {
        value: 'auto.http.browser.lcp',
        type: 'string',
      },
      'sentry.report_event': {
        value: 'pagehide',
        type: 'string',
      },
      'sentry.exclusive_time': {
        type: 'integer',
        value: 0,
      },
      transaction: {
        value: expect.stringContaining('index.html'),
        type: 'string',
      },
      'user_agent.original': {
        value: expect.stringContaining('Chrome'),
        type: 'string',
      },
      'sentry.pageload.span_id': {
        value: expect.stringMatching(/[a-f\d]{16}/),
        type: 'string',
      },
      lcp: {
        value: expect.any(Number),
        type: expect.stringMatching(/double|integer/),
      },
      'browser.web_vital.lcp.url': {
        value: 'https://sentry-test-site.example/my/image.png',
        type: 'string',
      },
      'browser.web_vital.lcp.element': {
        value: 'body > img',
        type: 'string',
      },
      'browser.web_vital.lcp.load_time': {
        value: expect.any(Number),
        type: expect.stringMatching(/double|integer/),
      },
      'browser.web_vital.lcp.render_time': {
        value: expect.any(Number),
        type: expect.stringMatching(/double|integer/),
      },
      'browser.web_vital.lcp.size': {
        value: expect.any(Number),
        type: expect.stringMatching(/double|integer/),
      },
      'browser.web_vital.lcp.value': {
        value: expect.any(Number),
        type: 'integer',
      },
      'browser.web_vital.lcp.id': {
        type: 'string',
        value: '',
      },
      'sentry.sdk.name': {
        type: 'string',
        value: 'sentry.javascript.browser',
      },
      'sentry.sdk.version': {
        type: 'string',
        value: expect.any(String),
      },
      'sentry.segment.id': {
        type: 'string',
        value: expect.any(String),
      },
      'sentry.segment.name': {
        type: 'string',
        value: expect.stringContaining('body > img'),
      },
      'sentry.source': {
        type: 'string',
        value: 'custom',
      },
      'sentry.span.source': {
        type: 'string',
        value: 'custom',
      },
      'http.request.header.user_agent': {
        type: 'string',
        value: expect.stringContaining('Chrome'),
      },
      'url.full': {
        type: 'string',
        value: 'http://sentry-test.io/index.html',
      },
    },
    name: expect.stringContaining('body > img'),
    span_id: expect.stringMatching(/[a-f\d]{16}/),
    start_timestamp: expect.any(Number),
    end_timestamp: lcpSpan?.start_timestamp, // LCP is a point-in-time metric
    trace_id: pageloadTraceId,
    status: 'ok',
    is_segment: true,
  });

  // LCP value should be greater than 0
  const lcpValue = lcpSpan?.attributes?.['browser.web_vital.lcp.value']?.value;
  expect(lcpValue).toBeGreaterThan(0);

  expect(lcpSpanEnvelopeHeaders).toEqual({
    sdk: {
      name: 'sentry.javascript.browser',
      packages: [
        {
          name: expect.stringMatching(/(npm|cdn):@sentry\/browser/),
          version: expect.any(String),
        },
      ],
      settings: {
        infer_ip: 'never',
      },
      version: expect.any(String),
    },
    sent_at: expect.any(String),
    trace: {
      environment: 'production',
      public_key: 'public',
      sample_rate: '1',
      sampled: 'true',
      trace_id: pageloadTraceId,
      sample_rand: expect.any(String),
    },
  });
});

sentryTest.skip('LCP span is linked to pageload transaction', async ({ getLocalTestUrl, page }) => {
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

sentryTest.skip(
  'sends LCP of the initial page when soft-navigating to a new page',
  async ({ getLocalTestUrl, page }) => {
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
  },
);

sentryTest.skip("doesn't send further LCP after the first navigation", async ({ getLocalTestUrl, page }) => {
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

sentryTest.skip("doesn't send further LCP after the first page hide", async ({ getLocalTestUrl, page }) => {
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

sentryTest.skip('LCP span timestamps are set correctly', async ({ getLocalTestUrl, page }) => {
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

sentryTest.skip(
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
