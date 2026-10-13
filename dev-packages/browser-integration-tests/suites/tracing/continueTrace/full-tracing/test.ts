import { expect } from '@playwright/test';
import { sentryTest } from '../../../../utils/fixtures';
import {
  eventAndTraceHeaderRequestParser,
  shouldSkipTracingTest,
  waitForErrorRequest,
} from '../../../../utils/helpers';
import {
  collectStreamedSpans,
  waitForStreamedSpanAndTraceHeader,
  waitForStreamedSpanAndTraceHeaderOnUrl,
} from '../../../../utils/spanUtils';

const SAMPLED_TRACE_ID = '12345678901234567890123456789012';
const SAMPLED_SPAN_ID = '1234567890123456';
const UNSAMPLED_TRACE_ID = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const DEFERRED_TRACE_ID = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';

sentryTest(
  'continueTrace continues a sampled incoming trace into span and outgoing request',
  async ({ getLocalTestUrl, page }) => {
    if (shouldSkipTracingTest()) {
      sentryTest.skip();
    }

    const url = await getLocalTestUrl({ testDir: __dirname });

    const outgoingRequestPromise = page.waitForRequest('http://sentry-test-site.example/**');
    await page.route('http://sentry-test-site.example/**', route => {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({}) });
    });

    await waitForStreamedSpanAndTraceHeaderOnUrl(page, url);

    const spanPromise = waitForStreamedSpanAndTraceHeader(
      page,
      span => span.is_segment && span.name === 'continued-sampled',
    );

    await page.locator('#sampled').click();

    const span = await spanPromise;
    const traceContext = span[0];

    expect(traceContext.trace_id).toBe(SAMPLED_TRACE_ID);
    expect(traceContext.parent_span_id).toBe(SAMPLED_SPAN_ID);
    expect(span[0].name).toBe('continued-sampled');

    // The incoming positive sampling decision is honored regardless of local config.
    expect(span[1]?.sampled).toBe('true');

    // Outgoing request carries the continued trace.
    const outgoingRequest = await outgoingRequestPromise;
    const headers = await outgoingRequest.allHeaders();
    expect(headers['sentry-trace']).toMatch(new RegExp(`^${SAMPLED_TRACE_ID}-[a-f0-9]{16}-1$`));
    expect(headers['baggage']).toContain(`sentry-trace_id=${SAMPLED_TRACE_ID}`);
  },
);

sentryTest(
  'continueTrace continues an unsampled incoming trace without emitting a span',
  async ({ getLocalTestUrl, page }) => {
    if (shouldSkipTracingTest()) {
      sentryTest.skip();
    }

    const url = await getLocalTestUrl({ testDir: __dirname });

    const outgoingRequestPromise = page.waitForRequest('http://sentry-test-site.example/**');
    await page.route('http://sentry-test-site.example/**', route => {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({}) });
    });

    await waitForStreamedSpanAndTraceHeaderOnUrl(page, url);

    const errorPromise = waitForErrorRequest(page);

    const spans = collectStreamedSpans(page);
    await page.locator('#unsampled').click();

    const [errorEvent] = eventAndTraceHeaderRequestParser(await errorPromise);
    expect(errorEvent.contexts?.trace?.trace_id).toBe(UNSAMPLED_TRACE_ID);

    // Outgoing request carries the continued trace with the negative sampling decision.
    const outgoingRequest = await outgoingRequestPromise;
    const headers = await outgoingRequest.allHeaders();
    expect(headers['sentry-trace']).toMatch(new RegExp(`^${UNSAMPLED_TRACE_ID}-[a-f0-9]{16}-0$`));
    await page.evaluate(() => (window as any).Sentry.flush());
    expect(spans.some(span => span.trace_id === UNSAMPLED_TRACE_ID)).toBe(false);
  },
);

sentryTest(
  'continueTrace continues a deferred-sampling incoming trace and applies the local sample rate',
  async ({ getLocalTestUrl, page }) => {
    if (shouldSkipTracingTest()) {
      sentryTest.skip();
    }

    const url = await getLocalTestUrl({ testDir: __dirname });

    await page.route('http://sentry-test-site.example/**', route => {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({}) });
    });

    await waitForStreamedSpanAndTraceHeaderOnUrl(page, url);

    const spanPromise = waitForStreamedSpanAndTraceHeader(
      page,
      span => span.is_segment && span.name === 'continued-deferred',
    );

    await page.locator('#deferred').click();

    const span = await spanPromise;
    expect(span[0].trace_id).toBe(DEFERRED_TRACE_ID);
    expect(span[0].name).toBe('continued-deferred');
  },
);

sentryTest('continueTrace with no incoming trace starts a fresh trace', async ({ getLocalTestUrl, page }) => {
  if (shouldSkipTracingTest()) {
    sentryTest.skip();
  }

  const url = await getLocalTestUrl({ testDir: __dirname });

  await page.route('http://sentry-test-site.example/**', route => {
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({}) });
  });

  const [pageloadEvent] = await waitForStreamedSpanAndTraceHeaderOnUrl(page, url);
  const pageloadTraceId = pageloadEvent.trace_id;

  const spanPromise = waitForStreamedSpanAndTraceHeader(
    page,
    span => span.is_segment && span.name === 'continued-noTrace',
  );

  await page.locator('#noTrace').click();

  const span = await spanPromise;
  const traceId = span[0].trace_id;

  expect(traceId).toMatch(/^[a-f0-9]{32}$/);
  expect(traceId).not.toBe(pageloadTraceId);
  expect(span[0]).not.toHaveProperty('parent_span_id');
});
