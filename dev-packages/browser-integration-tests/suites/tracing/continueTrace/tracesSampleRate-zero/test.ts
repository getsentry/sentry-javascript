import { expect } from '@playwright/test';
import { sentryTest } from '../../../../utils/fixtures';
import {
  eventAndTraceHeaderRequestParser,
  shouldSkipTracingTest,
  waitForErrorRequest,
} from '../../../../utils/helpers';
import { collectStreamedSpans, waitForStreamedSpanAndTraceHeader } from '../../../../utils/spanUtils';

const SAMPLED_TRACE_ID = '12345678901234567890123456789012';
const SAMPLED_SPAN_ID = '1234567890123456';
const UNSAMPLED_TRACE_ID = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const DEFERRED_TRACE_ID = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';

sentryTest(
  'continueTrace honors a positive incoming sampling decision over tracesSampleRate=0',
  async ({ getLocalTestUrl, page }) => {
    if (shouldSkipTracingTest()) {
      sentryTest.skip();
    }

    const url = await getLocalTestUrl({ testDir: __dirname });

    const outgoingRequestPromise = page.waitForRequest('http://sentry-test-site.example/**');
    await page.route('http://sentry-test-site.example/**', route => {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({}) });
    });

    const spanPromise = waitForStreamedSpanAndTraceHeader(
      page,
      span => span.is_segment && span.name === 'continued-sampled',
    );

    await page.goto(url);
    await page.locator('#sampled').click();

    const span = await spanPromise;
    expect(span[0].trace_id).toBe(SAMPLED_TRACE_ID);
    expect(span[0].parent_span_id).toBe(SAMPLED_SPAN_ID);

    const outgoingRequest = await outgoingRequestPromise;
    const headers = await outgoingRequest.allHeaders();
    expect(headers['sentry-trace']).toMatch(new RegExp(`^${SAMPLED_TRACE_ID}-[a-f0-9]{16}-1$`));
  },
);

sentryTest(
  'continueTrace does not emit a span for a deferred decision with tracesSampleRate=0',
  async ({ getLocalTestUrl, page }) => {
    if (shouldSkipTracingTest()) {
      sentryTest.skip();
    }

    const url = await getLocalTestUrl({ testDir: __dirname });

    const outgoingRequestPromise = page.waitForRequest('http://sentry-test-site.example/**');
    await page.route('http://sentry-test-site.example/**', route => {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({}) });
    });

    await page.goto(url);

    const errorPromise = waitForErrorRequest(page);

    const spans = collectStreamedSpans(page);
    await page.locator('#deferred').click();

    const [errorEvent] = eventAndTraceHeaderRequestParser(await errorPromise);
    expect(errorEvent.contexts?.trace?.trace_id).toBe(DEFERRED_TRACE_ID);

    // The deferred decision resolves negatively against the local tracesSampleRate=0.
    const outgoingRequest = await outgoingRequestPromise;
    const headers = await outgoingRequest.allHeaders();
    expect(headers['sentry-trace']).toMatch(new RegExp(`^${DEFERRED_TRACE_ID}-[a-f0-9]{16}-0$`));
    await page.evaluate(() => (window as any).Sentry.flush());
    expect(spans.some(span => span.trace_id === DEFERRED_TRACE_ID)).toBe(false);
  },
);

sentryTest(
  'continueTrace continues an unsampled incoming trace with tracesSampleRate=0',
  async ({ getLocalTestUrl, page }) => {
    if (shouldSkipTracingTest()) {
      sentryTest.skip();
    }

    const url = await getLocalTestUrl({ testDir: __dirname });

    const outgoingRequestPromise = page.waitForRequest('http://sentry-test-site.example/**');
    await page.route('http://sentry-test-site.example/**', route => {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({}) });
    });

    await page.goto(url);

    const errorPromise = waitForErrorRequest(page);

    const spans = collectStreamedSpans(page);
    await page.locator('#unsampled').click();

    const [errorEvent] = eventAndTraceHeaderRequestParser(await errorPromise);
    expect(errorEvent.contexts?.trace?.trace_id).toBe(UNSAMPLED_TRACE_ID);

    const outgoingRequest = await outgoingRequestPromise;
    const headers = await outgoingRequest.allHeaders();
    expect(headers['sentry-trace']).toMatch(new RegExp(`^${UNSAMPLED_TRACE_ID}-[a-f0-9]{16}-0$`));
    await page.evaluate(() => (window as any).Sentry.flush());
    expect(spans.some(span => span.trace_id === UNSAMPLED_TRACE_ID)).toBe(false);
  },
);
