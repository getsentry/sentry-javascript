import { expect } from '@playwright/test';
import type { SpanEnvelope } from '@sentry/core';
import { sentryTest } from '../../../../utils/fixtures';
import {
  getFirstSentryEnvelopeRequest,
  properFullEnvelopeRequestParser,
  shouldSkipTracingTest,
} from '../../../../utils/helpers';

sentryTest('sends a segment span envelope', async ({ getLocalTestUrl, page }) => {
  if (shouldSkipTracingTest()) {
    sentryTest.skip();
  }

  const url = await getLocalTestUrl({ testDir: __dirname });
  const spanEnvelope = await getFirstSentryEnvelopeRequest<SpanEnvelope>(page, url, properFullEnvelopeRequestParser);

  const headers = spanEnvelope[0];
  const item = spanEnvelope[1][0];

  const itemHeader = item[0];
  const spanJson = item[1];

  const traceId = spanJson.trace_id;

  expect(headers).toEqual({
    sent_at: expect.any(String),
    trace: {
      environment: 'production',
      public_key: 'public',
      sample_rate: '1',
      sampled: 'true',
      trace_id: traceId,
      transaction: 'standalone_segment_span',
      sample_rand: expect.any(String),
    },
  });

  expect(itemHeader).toEqual({
    type: 'span',
  });

  expect(spanJson).toEqual({
    data: {
      'sentry.origin': 'manual',
      'sentry.sample_rate': 1,
      'sentry.source': 'custom',
    },
    description: 'standalone_segment_span',
    origin: 'manual',
    span_id: expect.stringMatching(/^[\da-f]{16}$/),
    start_timestamp: expect.any(Number),
    timestamp: expect.any(Number),
    trace_id: expect.stringMatching(/^[\da-f]{32}$/),
    is_segment: true,
    segment_id: spanJson.span_id,
  });
});
