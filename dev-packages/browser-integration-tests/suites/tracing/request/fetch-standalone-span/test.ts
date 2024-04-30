import type { SpanEnvelope } from '@sentry/types';
import { sentryTest } from '../../../../utils/fixtures';
import {
  getFirstSentryEnvelopeRequest,
  properFullEnvelopeRequestParser,
  shouldSkipTracingTest,
} from '../../../../utils/helpers';

import { expect } from '@playwright/test';

sentryTest(
  "should create standalone span for fetch requests if there's no active span and should attach tracing headers",
  async ({ getLocalTestUrl, page }) => {
    if (shouldSkipTracingTest()) {
      sentryTest.skip();
    }

    let sentryTraceHeader = '';
    let baggageHeader = '';

    await page.route('http://example.com/**', route => {
      sentryTraceHeader = route.request().headers()['sentry-trace'];
      baggageHeader = route.request().headers()['baggage'];
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({}),
      });
    });

    const url = await getLocalTestUrl({ testDir: __dirname });

    const spanEnvelopePromise = getFirstSentryEnvelopeRequest<SpanEnvelope>(
      page,
      undefined,
      properFullEnvelopeRequestParser,
    );

    await page.goto(url);

    const spanEnvelope = await spanEnvelopePromise;

    const spanEnvelopeHeaders = spanEnvelope[0];
    const spanEnvelopeItem = spanEnvelope[1][0][1];

    const traceId = spanEnvelopeHeaders.trace!.trace_id;
    const spanId = spanEnvelopeItem.span_id;

    expect(traceId).toMatch(/[a-f0-9]{32}/);
    expect(spanId).toMatch(/[a-f0-9]{16}/);

    expect(spanEnvelopeHeaders).toEqual({
      sent_at: expect.any(String),
      trace: {
        environment: 'production',
        public_key: 'public',
        sample_rate: '1',
        sampled: 'true',
        trace_id: traceId,
        transaction: 'GET http://example.com/0',
      },
    });

    expect(spanEnvelopeItem).toEqual({
      data: expect.objectContaining({
        'http.method': 'GET',
        'http.response.status_code': 200,
        'http.response_content_length': expect.any(Number),
        'http.url': 'http://example.com/0',
        'sentry.op': 'http.client',
        'sentry.origin': 'auto.http.browser',
        'sentry.sample_rate': 1,
        'sentry.source': 'custom',
        'server.address': 'example.com',
        type: 'fetch',
        url: 'http://example.com/0',
      }),
      description: 'GET http://example.com/0',
      op: 'http.client',
      origin: 'auto.http.browser',
      status: 'ok',
      trace_id: traceId,
      span_id: spanId,
      segment_id: spanId,
      is_segment: true,
      start_timestamp: expect.any(Number),
      timestamp: expect.any(Number),
    });

    // the standalone span was sampled, so we propagate the positive sampling decision
    expect(sentryTraceHeader).toBe(`${traceId}-${spanId}-1`);
    expect(baggageHeader).toBe(
      `sentry-environment=production,sentry-public_key=public,sentry-trace_id=${traceId},sentry-sample_rate=1,sentry-transaction=GET%20http%3A%2F%2Fexample.com%2F0,sentry-sampled=true`,
    );
  },
);
