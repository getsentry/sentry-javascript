import { expect } from '@playwright/test';
import type { SpanEnvelope } from '@sentry/core';
import { sentryTest } from '../../../../utils/fixtures';
import {
  getMultipleSentryEnvelopeRequests,
  properFullEnvelopeRequestParser,
  shouldSkipTracingTest,
} from '../../../../utils/helpers';

const TRACE_ID = '12345678901234567890123456789012';
const OUTGOING_REQUEST_URL = 'http://sentry-test-external.io';

sentryTest(
  'omits the trace envelope header when a standalone span continues a trace without baggage',
  async ({ getLocalTestUrl, page }) => {
    sentryTest.skip(shouldSkipTracingTest());

    const url = await getLocalTestUrl({ testDir: __dirname });
    await page.route(OUTGOING_REQUEST_URL, route => route.fulfill({ status: 200, body: 'ok' }));
    const outgoingRequestPromise = page.waitForRequest(OUTGOING_REQUEST_URL);

    const [spanEnvelope] = await getMultipleSentryEnvelopeRequests<SpanEnvelope>(
      page,
      1,
      { url, envelopeType: 'span' },
      properFullEnvelopeRequestParser,
    );
    const outgoingRequest = await outgoingRequestPromise;

    expect(spanEnvelope[0]).toEqual({
      sent_at: expect.any(String),
    });

    // To be clear: This is _expected_ behavior, not a bug.
    // SDKs must assume that an incoming `sentry-trace` but no `baggage` meta tag means that the
    // trace was started from an SDK that's not yet compatible with the DSC or baggage propagation.
    // The test demonstrates that the SDK as expected continues the trace but does not send a `trace`
    // header, nor a baggage header.
    expect(spanEnvelope[0].trace).toBeUndefined();

    expect(spanEnvelope[1]).toHaveLength(1);
    expect(spanEnvelope[1][0][1].trace_id).toBe(TRACE_ID);

    const outgoingRequestHeaders = outgoingRequest.headers();
    expect(outgoingRequestHeaders['sentry-trace']).toMatch(new RegExp(`^${TRACE_ID}-[\\da-f]{16}-1$`));
    expect(outgoingRequestHeaders['baggage']).toBeUndefined();
  },
);
