import { expect } from '@playwright/test';
import {
  SDK_VERSION,
  SEMANTIC_ATTRIBUTE_SENTRY_OP,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  SEMANTIC_ATTRIBUTE_SENTRY_SAMPLE_RATE,
  SEMANTIC_ATTRIBUTE_SENTRY_SDK_NAME,
  SEMANTIC_ATTRIBUTE_SENTRY_SDK_VERSION,
  SEMANTIC_ATTRIBUTE_SENTRY_SEGMENT_ID,
  SEMANTIC_ATTRIBUTE_SENTRY_SEGMENT_NAME,
  SEMANTIC_ATTRIBUTE_SENTRY_SOURCE,
} from '@sentry/core';
import { sentryTest } from '../../../../utils/fixtures';
import { shouldSkipTracingTest } from '../../../../utils/helpers';
import { waitForStreamedSpanEnvelope } from '../../../../utils/spanUtils';

sentryTest(
  'sends a streamed span envelope if spanStreamingIntegration is enabled',
  async ({ getLocalTestUrl, page }) => {
    sentryTest.skip(shouldSkipTracingTest());

    const spanEnvelopePromise = waitForStreamedSpanEnvelope(page);

    const url = await getLocalTestUrl({ testDir: __dirname });
    await page.goto(url);

    const spanEnvelope = await spanEnvelopePromise;

    const envelopeHeader = spanEnvelope[0];
    const envelopeItem = spanEnvelope[1];
    const spans = envelopeItem[0][1].items;

    expect(envelopeHeader).toEqual({
      sdk: {
        name: 'sentry.javascript.browser',
        version: SDK_VERSION,
      },
      sent_at: expect.any(String),
      trace: {
        environment: 'production',
        public_key: 'public',
        sample_rand: expect.any(String),
        sample_rate: '1',
        sampled: 'true',
        trace_id: expect.stringMatching(/^[\da-f]{32}$/),
        transaction: 'test-span',
      },
    });

    const numericSampleRand = parseFloat(envelopeHeader.trace!.sample_rand!);
    const traceId = envelopeHeader.trace!.trace_id;

    expect(Number.isNaN(numericSampleRand)).toBe(false);

    expect(envelopeItem).toEqual([
      [
        { content_type: 'application/vnd.sentry.items.span.v2+json', item_count: 4, type: 'span' },
        {
          items: expect.any(Array),
        },
      ],
    ]);

    const segmentSpanId = spans.find(s => !!s.is_segment)?.span_id;
    expect(segmentSpanId).toBeDefined();

    expect(spans).toEqual([
      {
        attributes: {
          [SEMANTIC_ATTRIBUTE_SENTRY_OP]: {
            type: 'string',
            value: 'test-child',
          },
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: {
            type: 'string',
            value: 'manual',
          },
          [SEMANTIC_ATTRIBUTE_SENTRY_SDK_NAME]: {
            type: 'string',
            value: 'sentry.javascript.browser',
          },
          [SEMANTIC_ATTRIBUTE_SENTRY_SDK_VERSION]: {
            type: 'string',
            value: SDK_VERSION,
          },
          [SEMANTIC_ATTRIBUTE_SENTRY_SEGMENT_ID]: {
            type: 'string',
            value: segmentSpanId,
          },
          [SEMANTIC_ATTRIBUTE_SENTRY_SEGMENT_NAME]: {
            type: 'string',
            value: 'test-span',
          },
        },
        end_timestamp: expect.any(Number),
        is_segment: false,
        name: 'test-child-span',
        parent_span_id: segmentSpanId,
        span_id: expect.stringMatching(/^[\da-f]{16}$/),
        start_timestamp: expect.any(Number),
        status: 'ok',
        trace_id: traceId,
      },
      {
        attributes: {
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: {
            type: 'string',
            value: 'manual',
          },
          [SEMANTIC_ATTRIBUTE_SENTRY_SDK_NAME]: {
            type: 'string',
            value: 'sentry.javascript.browser',
          },
          [SEMANTIC_ATTRIBUTE_SENTRY_SDK_VERSION]: {
            type: 'string',
            value: SDK_VERSION,
          },
          [SEMANTIC_ATTRIBUTE_SENTRY_SEGMENT_ID]: {
            type: 'string',
            value: segmentSpanId,
          },
          [SEMANTIC_ATTRIBUTE_SENTRY_SEGMENT_NAME]: {
            type: 'string',
            value: 'test-span',
          },
        },
        end_timestamp: expect.any(Number),
        is_segment: false,
        name: 'test-inactive-span',
        parent_span_id: segmentSpanId,
        span_id: expect.stringMatching(/^[\da-f]{16}$/),
        start_timestamp: expect.any(Number),
        status: 'ok',
        trace_id: traceId,
      },
      {
        attributes: {
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: {
            type: 'string',
            value: 'manual',
          },
          [SEMANTIC_ATTRIBUTE_SENTRY_SDK_NAME]: {
            type: 'string',
            value: 'sentry.javascript.browser',
          },
          [SEMANTIC_ATTRIBUTE_SENTRY_SDK_VERSION]: {
            type: 'string',
            value: SDK_VERSION,
          },
          [SEMANTIC_ATTRIBUTE_SENTRY_SEGMENT_ID]: {
            type: 'string',
            value: segmentSpanId,
          },
          [SEMANTIC_ATTRIBUTE_SENTRY_SEGMENT_NAME]: {
            type: 'string',
            value: 'test-span',
          },
        },
        end_timestamp: expect.any(Number),
        is_segment: false,
        name: 'test-manual-span',
        parent_span_id: segmentSpanId,
        span_id: expect.stringMatching(/^[\da-f]{16}$/),
        start_timestamp: expect.any(Number),
        status: 'ok',
        trace_id: traceId,
      },
      {
        attributes: {
          [SEMANTIC_ATTRIBUTE_SENTRY_OP]: {
            type: 'string',
            value: 'test',
          },
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: {
            type: 'string',
            value: 'manual',
          },
          [SEMANTIC_ATTRIBUTE_SENTRY_SAMPLE_RATE]: {
            type: 'integer',
            value: 1,
          },
          [SEMANTIC_ATTRIBUTE_SENTRY_SDK_NAME]: {
            type: 'string',
            value: 'sentry.javascript.browser',
          },
          [SEMANTIC_ATTRIBUTE_SENTRY_SDK_VERSION]: {
            type: 'string',
            value: SDK_VERSION,
          },
          [SEMANTIC_ATTRIBUTE_SENTRY_SEGMENT_ID]: {
            type: 'string',
            value: segmentSpanId,
          },
          [SEMANTIC_ATTRIBUTE_SENTRY_SEGMENT_NAME]: {
            type: 'string',
            value: 'test-span',
          },
          [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: {
            type: 'string',
            value: 'custom',
          },
          'sentry.span.source': {
            type: 'string',
            value: 'custom',
          },
        },
        end_timestamp: expect.any(Number),
        is_segment: true,
        name: 'test-span',
        span_id: segmentSpanId,
        start_timestamp: expect.any(Number),
        status: 'ok',
        trace_id: traceId,
      },
    ]);
  },
);
