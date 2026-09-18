import { expect } from '@playwright/test';
import { sentryTest } from '../../../../utils/fixtures';
import type { EventAndTraceHeader } from '../../../../utils/helpers';
import {
  eventAndTraceHeaderRequestParser,
  getFirstSentryEnvelopeRequest,
  shouldSkipTracingTest,
  waitForErrorRequest,
  waitForTransactionRequest,
} from '../../../../utils/helpers';

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

    // Discard the initial pageload transaction.
    await getFirstSentryEnvelopeRequest<EventAndTraceHeader>(page, url, eventAndTraceHeaderRequestParser);

    const transactionPromise = waitForTransactionRequest(
      page,
      event => event.contexts?.trace?.trace_id === SAMPLED_TRACE_ID,
    );

    await page.locator('#sampled').click();

    const req = await transactionPromise;
    const transaction = eventAndTraceHeaderRequestParser(req);
    const traceContext = transaction[0].contexts?.trace;

    expect(traceContext?.trace_id).toBe(SAMPLED_TRACE_ID);
    expect(traceContext?.parent_span_id).toBe(SAMPLED_SPAN_ID);
    expect(transaction[0].transaction).toBe('continued-sampled');

    // The incoming positive sampling decision is honored regardless of local config.
    expect(transaction[1]?.sampled).toBe('true');

    // Outgoing request carries the continued trace.
    const outgoingRequest = await outgoingRequestPromise;
    const headers = await outgoingRequest.allHeaders();
    expect(headers['sentry-trace']).toMatch(new RegExp(`^${SAMPLED_TRACE_ID}-[a-f0-9]{16}-1$`));
    expect(headers['baggage']).toContain(`sentry-trace_id=${SAMPLED_TRACE_ID}`);
  },
);

sentryTest(
  'continueTrace continues an unsampled incoming trace without emitting a transaction',
  async ({ getLocalTestUrl, page }) => {
    if (shouldSkipTracingTest()) {
      sentryTest.skip();
    }

    const url = await getLocalTestUrl({ testDir: __dirname });

    const outgoingRequestPromise = page.waitForRequest('http://sentry-test-site.example/**');
    await page.route('http://sentry-test-site.example/**', route => {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({}) });
    });

    await getFirstSentryEnvelopeRequest<EventAndTraceHeader>(page, url, eventAndTraceHeaderRequestParser);

    // The captured error carries the continued (unsampled) trace even though no transaction is sent.
    const errorPromise = waitForErrorRequest(page);

    await page.locator('#unsampled').click();

    const [errorEvent] = eventAndTraceHeaderRequestParser(await errorPromise);
    expect(errorEvent.contexts?.trace?.trace_id).toBe(UNSAMPLED_TRACE_ID);

    // Outgoing request carries the continued trace with the negative sampling decision.
    const outgoingRequest = await outgoingRequestPromise;
    const headers = await outgoingRequest.allHeaders();
    expect(headers['sentry-trace']).toMatch(new RegExp(`^${UNSAMPLED_TRACE_ID}-[a-f0-9]{16}-0$`));
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

    await getFirstSentryEnvelopeRequest<EventAndTraceHeader>(page, url, eventAndTraceHeaderRequestParser);

    // With tracesSampleRate=1 the deferred decision resolves to sampled, so a transaction is emitted
    // on the continued trace id.
    const transactionPromise = waitForTransactionRequest(
      page,
      event => event.contexts?.trace?.trace_id === DEFERRED_TRACE_ID,
    );

    await page.locator('#deferred').click();

    const transaction = eventAndTraceHeaderRequestParser(await transactionPromise);
    expect(transaction[0].contexts?.trace?.trace_id).toBe(DEFERRED_TRACE_ID);
    expect(transaction[0].transaction).toBe('continued-deferred');
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

  const [pageloadEvent] = await getFirstSentryEnvelopeRequest<EventAndTraceHeader>(
    page,
    url,
    eventAndTraceHeaderRequestParser,
  );
  const pageloadTraceId = pageloadEvent.contexts?.trace?.trace_id;

  const transactionPromise = waitForTransactionRequest(page, event => event.transaction === 'continued-noTrace');

  await page.locator('#noTrace').click();

  const transaction = eventAndTraceHeaderRequestParser(await transactionPromise);
  const traceId = transaction[0].contexts?.trace?.trace_id;

  expect(traceId).toMatch(/^[a-f0-9]{32}$/);
  expect(traceId).not.toBe(pageloadTraceId);
  expect(transaction[0].contexts?.trace).not.toHaveProperty('parent_span_id');
});
