import { expect, test } from '@playwright/test';
import { getFirstSentryEnvelopeRequest, getMultipleSentryEnvelopeRequests } from './utils/helpers';

const useV2 = process.env.REMIX_VERSION === '2';

test('should continue the trace from the server side on pageload', async ({ page }) => {
  const clientSideEnvelope = await getFirstSentryEnvelopeRequest<Event>(page, '/trace-propagation/0');

  // Read text from the page inside element id #trace-id
  const traceId = await (await page.waitForSelector('#trace-id')).innerText();

  const clientSideTraceId = clientSideEnvelope?.contexts?.trace?.trace_id;

  // Check if the trace id from the server side is the same as the client side
  expect(traceId).toBe(clientSideTraceId);
});

// This test is only for v2 because v1 doesn't support Sentry's ErrorBoundary instrumentation
useV2 &&
  test('should continue the trace from the server side when ErrorBoundary is triggered', async ({ page }) => {
    const [transaction, error] = await getMultipleSentryEnvelopeRequests<Event>(page, 2, {
      url: '/trace-propagation/-1',
    });

    // Read text from the ErrorBoundary with element id #message
    // We're using the message to get the trace id from the server side for this tests
    const traceId = await (await page.waitForSelector('#message')).innerText();

    // Check if the trace id from the server side is the same as the client side
    expect(transaction.contexts?.trace?.trace_id).toBe(traceId);
    expect(error.contexts?.trace?.trace_id).toBe(traceId);
  });
