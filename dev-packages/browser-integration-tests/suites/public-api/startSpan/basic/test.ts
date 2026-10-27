import {
  SENTRY_IS_LOCALHOST,
  CULTURE_CALENDAR,
  CULTURE_LOCALE,
  CULTURE_TIMEZONE,
  URL_FULL,
  SENTRY_SEGMENT_NAME_SOURCE,
  SENTRY_SEGMENT_ID,
  SENTRY_SEGMENT_NAME,
  SENTRY_SDK_NAME,
  SENTRY_SDK_VERSION,
  SENTRY_TRACE_LIFECYCLE,
  USER_AGENT_ORIGINAL,
  SENTRY_ENVIRONMENT,
  SENTRY_SDK_INTEGRATIONS,
  SENTRY_STATUS_MESSAGE,
  SENTRY_OP,
  SENTRY_ORIGIN,
} from '@sentry/conventions/attributes';
import { expect } from '@playwright/test';
import { SDK_VERSION, SEMANTIC_ATTRIBUTE_SENTRY_SAMPLE_RATE } from '@sentry/core';
import { sentryTest } from '../../../../utils/fixtures';
import { shouldSkipTracingTest } from '../../../../utils/helpers';
import { waitForStreamedSpanEnvelope } from '../../../../utils/spanUtils';

sentryTest('sends a streamed span envelope by default', async ({ getLocalTestUrl, page }) => {
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
        version: 2,
        ingest_settings: { infer_ip: 'auto', infer_user_agent: 'auto' },
        items: expect.any(Array),
      },
    ],
  ]);

  const segmentSpanId = spans.find(s => !!s.is_segment)?.span_id;
  expect(segmentSpanId).toBeDefined();

  expect(spans).toEqual([
    {
      attributes: {
        [SENTRY_IS_LOCALHOST]: { value: false, type: 'boolean' },
        [SENTRY_OP]: {
          type: 'string',
          value: 'test-child',
        },
        [SENTRY_ORIGIN]: {
          type: 'string',
          value: 'manual',
        },
        [SENTRY_SDK_NAME]: {
          type: 'string',
          value: 'sentry.javascript.browser',
        },
        [SENTRY_SDK_VERSION]: {
          type: 'string',
          value: SDK_VERSION,
        },
        [SENTRY_SEGMENT_ID]: {
          type: 'string',
          value: segmentSpanId,
        },
        [SENTRY_SEGMENT_NAME]: {
          type: 'string',
          value: 'test-span',
        },
        [SENTRY_ENVIRONMENT]: {
          type: 'string',
          value: 'production',
        },
        [SENTRY_TRACE_LIFECYCLE]: {
          type: 'string',
          value: 'stream',
        },
        [USER_AGENT_ORIGINAL]: {
          type: 'string',
          value: expect.any(String),
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
        [SENTRY_IS_LOCALHOST]: { value: false, type: 'boolean' },
        [SENTRY_ORIGIN]: {
          type: 'string',
          value: 'manual',
        },
        [SENTRY_SDK_NAME]: {
          type: 'string',
          value: 'sentry.javascript.browser',
        },
        [SENTRY_SDK_VERSION]: {
          type: 'string',
          value: SDK_VERSION,
        },
        [SENTRY_SEGMENT_ID]: {
          type: 'string',
          value: segmentSpanId,
        },
        [SENTRY_SEGMENT_NAME]: {
          type: 'string',
          value: 'test-span',
        },
        [SENTRY_ENVIRONMENT]: {
          type: 'string',
          value: 'production',
        },
        [SENTRY_TRACE_LIFECYCLE]: {
          type: 'string',
          value: 'stream',
        },
        [USER_AGENT_ORIGINAL]: {
          type: 'string',
          value: expect.any(String),
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
        [SENTRY_IS_LOCALHOST]: { value: false, type: 'boolean' },
        [SENTRY_ORIGIN]: {
          type: 'string',
          value: 'manual',
        },
        [SENTRY_SDK_NAME]: {
          type: 'string',
          value: 'sentry.javascript.browser',
        },
        [SENTRY_SDK_VERSION]: {
          type: 'string',
          value: SDK_VERSION,
        },
        [SENTRY_SEGMENT_ID]: {
          type: 'string',
          value: segmentSpanId,
        },
        [SENTRY_SEGMENT_NAME]: {
          type: 'string',
          value: 'test-span',
        },
        [SENTRY_ENVIRONMENT]: {
          type: 'string',
          value: 'production',
        },
        [SENTRY_STATUS_MESSAGE]: {
          type: 'string',
          value: 'Connection Refused',
        },
        [SENTRY_TRACE_LIFECYCLE]: {
          type: 'string',
          value: 'stream',
        },
        [USER_AGENT_ORIGINAL]: {
          type: 'string',
          value: expect.any(String),
        },
      },
      end_timestamp: expect.any(Number),
      is_segment: false,
      name: 'test-manual-span',
      parent_span_id: segmentSpanId,
      span_id: expect.stringMatching(/^[\da-f]{16}$/),
      start_timestamp: expect.any(Number),
      status: 'error',
      trace_id: traceId,
    },
    {
      attributes: {
        [SENTRY_IS_LOCALHOST]: { value: false, type: 'boolean' },
        [CULTURE_CALENDAR]: {
          type: 'string',
          value: expect.any(String),
        },
        [CULTURE_LOCALE]: {
          type: 'string',
          value: expect.any(String),
        },
        [CULTURE_TIMEZONE]: {
          type: 'string',
          value: expect.any(String),
        },
        [USER_AGENT_ORIGINAL]: {
          type: 'string',
          value: expect.any(String),
        },
        [URL_FULL]: {
          type: 'string',
          value: expect.any(String),
        },
        [SENTRY_OP]: {
          type: 'string',
          value: 'test',
        },
        [SENTRY_ORIGIN]: {
          type: 'string',
          value: 'manual',
        },
        [SEMANTIC_ATTRIBUTE_SENTRY_SAMPLE_RATE]: {
          type: 'integer',
          value: 1,
        },
        [SENTRY_SDK_NAME]: {
          type: 'string',
          value: 'sentry.javascript.browser',
        },
        [SENTRY_SDK_VERSION]: {
          type: 'string',
          value: SDK_VERSION,
        },
        [SENTRY_SDK_INTEGRATIONS]: {
          type: 'array',
          value: expect.arrayContaining(['SpanStreaming']),
        },
        [SENTRY_SEGMENT_ID]: {
          type: 'string',
          value: segmentSpanId,
        },
        [SENTRY_SEGMENT_NAME]: {
          type: 'string',
          value: 'test-span',
        },
        [SENTRY_SEGMENT_NAME_SOURCE]: {
          type: 'string',
          value: 'custom',
        },
        [SENTRY_ENVIRONMENT]: {
          type: 'string',
          value: 'production',
        },
        [SENTRY_TRACE_LIFECYCLE]: {
          type: 'string',
          value: 'stream',
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
});
