import { expect } from '@playwright/test';
import type { Envelope, EventEnvelope, SpanEnvelope, TransactionEvent } from '@sentry/core';
import { sentryTest } from '../../../../utils/fixtures';
import {
  getMultipleSentryEnvelopeRequests,
  properFullEnvelopeRequestParser,
  shouldSkipTracingTest,
} from '../../../../utils/helpers';

sentryTest(
  'sends a transaction and a span envelope if a standalone span is created as a child of an ongoing span tree',
  async ({ getLocalTestUrl, page }) => {
    if (shouldSkipTracingTest()) {
      sentryTest.skip();
    }

    const url = await getLocalTestUrl({ testDir: __dirname });
    const envelopes = await getMultipleSentryEnvelopeRequests<Envelope>(
      page,
      2,
      { url, envelopeType: ['transaction', 'span'] },
      properFullEnvelopeRequestParser,
    );

    const spanEnvelope = envelopes.find(envelope => envelope[1][0][0].type === 'span') as SpanEnvelope;
    const transactionEnvelope = envelopes.find(envelope => envelope[1][0][0].type === 'transaction') as EventEnvelope;

    const spanEnvelopeHeader = spanEnvelope[0];
    const spanEnvelopeItem = spanEnvelope[1][0][1];

    const transactionEnvelopeHeader = transactionEnvelope[0];
    const transactionEnvelopeItem = transactionEnvelope[1][0][1] as TransactionEvent;

    const traceId = transactionEnvelopeHeader.trace!.trace_id!;
    const parentSpanId = transactionEnvelopeItem.contexts?.trace?.span_id;

    expect(traceId).toMatch(/[a-f\d]{32}/);
    expect(parentSpanId).toMatch(/[a-f\d]{16}/);

    expect(spanEnvelopeHeader).toEqual({
      sent_at: expect.any(String),
      trace: {
        environment: 'production',
        public_key: 'public',
        sample_rate: '1',
        sampled: 'true',
        trace_id: traceId,
        transaction: 'outer',
        sample_rand: expect.any(String),
      },
    });

    expect(transactionEnvelopeHeader).toEqual({
      event_id: expect.any(String),
      sdk: {
        name: 'sentry.javascript.browser',
        version: expect.any(String),
      },
      sent_at: expect.any(String),
      trace: {
        environment: 'production',
        public_key: 'public',
        sample_rate: '1',
        sampled: 'true',
        trace_id: traceId,
        transaction: 'outer',
        sample_rand: expect.any(String),
      },
    });

    expect(spanEnvelopeItem).toEqual({
      data: {
        'sentry.origin': 'manual',
      },
      description: 'standalone',
      segment_id: transactionEnvelopeItem.contexts?.trace?.span_id,
      parent_span_id: parentSpanId,
      origin: 'manual',
      span_id: expect.stringMatching(/[a-f\d]{16}/),
      start_timestamp: expect.any(Number),
      timestamp: expect.any(Number),
      trace_id: traceId,
    });

    expect(transactionEnvelopeItem).toEqual({
      contexts: {
        trace: {
          data: {
            'sentry.origin': 'manual',
            'sentry.sample_rate': 1,
            'sentry.source': 'custom',
          },
          origin: 'manual',
          span_id: parentSpanId,
          trace_id: traceId,
        },
      },
      environment: 'production',
      event_id: expect.any(String),
      platform: 'javascript',
      request: {
        headers: expect.any(Object),
        url: expect.any(String),
      },
      sdk: expect.any(Object),
      spans: [
        {
          data: {
            'sentry.origin': 'manual',
          },
          description: 'inner',
          origin: 'manual',
          parent_span_id: parentSpanId,
          span_id: expect.stringMatching(/[a-f\d]{16}/),
          start_timestamp: expect.any(Number),
          timestamp: expect.any(Number),
          trace_id: traceId,
        },
      ],
      start_timestamp: expect.any(Number),
      timestamp: expect.any(Number),
      transaction: 'outer',
      transaction_info: {
        source: 'custom',
      },
      type: 'transaction',
    });
  },
);
