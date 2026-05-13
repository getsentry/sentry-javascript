import type { Envelope, SerializedStreamedSpanContainer } from '@sentry/core';
import {
  SDK_VERSION,
  SEMANTIC_ATTRIBUTE_SENTRY_OP,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  SEMANTIC_ATTRIBUTE_SENTRY_RELEASE,
  SEMANTIC_ATTRIBUTE_SENTRY_SAMPLE_RATE,
  SEMANTIC_ATTRIBUTE_SENTRY_SDK_INTEGRATIONS,
  SEMANTIC_ATTRIBUTE_SENTRY_SDK_NAME,
  SEMANTIC_ATTRIBUTE_SENTRY_SDK_VERSION,
  SEMANTIC_ATTRIBUTE_SENTRY_SEGMENT_ID,
  SEMANTIC_ATTRIBUTE_SENTRY_SEGMENT_NAME,
  SEMANTIC_ATTRIBUTE_SENTRY_SOURCE,
} from '@sentry/core';
import { expect, it } from 'vitest';
import { createRunner } from '../../../runner';

const CLOUDFLARE_SDK = 'sentry.javascript.cloudflare';

function getSpanContainer(envelope: Envelope): SerializedStreamedSpanContainer {
  const spanItem = envelope[1].find(item => item[0].type === 'span');
  expect(spanItem).toBeDefined();
  return spanItem![1] as SerializedStreamedSpanContainer;
}

it('sends a streamed span envelope with correct envelope header', async ({ signal }) => {
  const runner = createRunner(__dirname)
    .expect(envelope => {
      expect(getSpanContainer(envelope).items.length).toBeGreaterThan(0);

      expect(envelope[0]).toEqual(
        expect.objectContaining({
          sent_at: expect.any(String),
          sdk: {
            name: CLOUDFLARE_SDK,
            version: SDK_VERSION,
          },
          trace: expect.objectContaining({
            public_key: 'public',
            sample_rate: '1',
            sampled: 'true',
            trace_id: expect.stringMatching(/^[\da-f]{32}$/),
          }),
        }),
      );
    })
    .start(signal);

  await runner.makeRequest('get', '/');
  await runner.completed();
});

it('sends a streamed span envelope with correct spans for a manually started span with children', async ({
  signal,
}) => {
  const runner = createRunner(__dirname)
    .expect(envelope => {
      const container = getSpanContainer(envelope);
      const spans = container.items;

      // Cloudflare `withSentry` wraps fetch in an http.server span (segment) around the scenario.
      expect(spans.length).toBe(5);

      const segmentSpan = spans.find(s => !!s.is_segment);
      expect(segmentSpan).toBeDefined();

      const segmentSpanId = segmentSpan!.span_id;
      const traceId = segmentSpan!.trace_id;
      const segmentName = segmentSpan!.name;

      const parentTestSpan = spans.find(s => s.name === 'test-span');
      expect(parentTestSpan).toBeDefined();
      expect(parentTestSpan!.parent_span_id).toBe(segmentSpanId);

      const childSpan = spans.find(s => s.name === 'test-child-span');
      expect(childSpan).toBeDefined();
      expect(childSpan).toEqual({
        attributes: {
          [SEMANTIC_ATTRIBUTE_SENTRY_OP]: {
            type: 'string',
            value: 'test-child',
          },
          [SEMANTIC_ATTRIBUTE_SENTRY_SDK_NAME]: { type: 'string', value: CLOUDFLARE_SDK },
          [SEMANTIC_ATTRIBUTE_SENTRY_SDK_VERSION]: { type: 'string', value: SDK_VERSION },
          [SEMANTIC_ATTRIBUTE_SENTRY_SEGMENT_ID]: { type: 'string', value: segmentSpanId },
          [SEMANTIC_ATTRIBUTE_SENTRY_SEGMENT_NAME]: { type: 'string', value: segmentName },
          [SEMANTIC_ATTRIBUTE_SENTRY_RELEASE]: { type: 'string', value: '1.0.0' },
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: { type: 'string', value: 'manual' },
        },
        name: 'test-child-span',
        is_segment: false,
        parent_span_id: parentTestSpan!.span_id,
        trace_id: traceId,
        span_id: expect.stringMatching(/^[\da-f]{16}$/),
        start_timestamp: expect.any(Number),
        end_timestamp: expect.any(Number),
        status: 'ok',
      });

      const inactiveSpan = spans.find(s => s.name === 'test-inactive-span');
      expect(inactiveSpan).toBeDefined();
      expect(inactiveSpan).toEqual({
        attributes: {
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: { type: 'string', value: 'manual' },
          [SEMANTIC_ATTRIBUTE_SENTRY_SDK_NAME]: { type: 'string', value: CLOUDFLARE_SDK },
          [SEMANTIC_ATTRIBUTE_SENTRY_SDK_VERSION]: { type: 'string', value: SDK_VERSION },
          [SEMANTIC_ATTRIBUTE_SENTRY_SEGMENT_ID]: { type: 'string', value: segmentSpanId },
          [SEMANTIC_ATTRIBUTE_SENTRY_SEGMENT_NAME]: { type: 'string', value: segmentName },
          [SEMANTIC_ATTRIBUTE_SENTRY_RELEASE]: { type: 'string', value: '1.0.0' },
        },
        links: [
          {
            attributes: {
              'sentry.link.type': {
                type: 'string',
                value: 'some_relation',
              },
            },
            sampled: true,
            span_id: parentTestSpan!.span_id,
            trace_id: traceId,
          },
        ],
        name: 'test-inactive-span',
        is_segment: false,
        parent_span_id: parentTestSpan!.span_id,
        trace_id: traceId,
        span_id: expect.stringMatching(/^[\da-f]{16}$/),
        start_timestamp: expect.any(Number),
        end_timestamp: expect.any(Number),
        status: 'ok',
      });

      const manualSpan = spans.find(s => s.name === 'test-manual-span');
      expect(manualSpan).toBeDefined();
      expect(manualSpan).toEqual({
        attributes: {
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: { type: 'string', value: 'manual' },
          [SEMANTIC_ATTRIBUTE_SENTRY_SDK_NAME]: { type: 'string', value: CLOUDFLARE_SDK },
          [SEMANTIC_ATTRIBUTE_SENTRY_SDK_VERSION]: { type: 'string', value: SDK_VERSION },
          [SEMANTIC_ATTRIBUTE_SENTRY_SEGMENT_ID]: { type: 'string', value: segmentSpanId },
          [SEMANTIC_ATTRIBUTE_SENTRY_SEGMENT_NAME]: { type: 'string', value: segmentName },
          [SEMANTIC_ATTRIBUTE_SENTRY_RELEASE]: { type: 'string', value: '1.0.0' },
        },
        name: 'test-manual-span',
        is_segment: false,
        parent_span_id: parentTestSpan!.span_id,
        trace_id: traceId,
        span_id: expect.stringMatching(/^[\da-f]{16}$/),
        start_timestamp: expect.any(Number),
        end_timestamp: expect.any(Number),
        status: 'ok',
      });

      expect(parentTestSpan).toEqual({
        attributes: {
          [SEMANTIC_ATTRIBUTE_SENTRY_OP]: { type: 'string', value: 'test' },
          [SEMANTIC_ATTRIBUTE_SENTRY_SDK_NAME]: { type: 'string', value: CLOUDFLARE_SDK },
          [SEMANTIC_ATTRIBUTE_SENTRY_SDK_VERSION]: { type: 'string', value: SDK_VERSION },
          [SEMANTIC_ATTRIBUTE_SENTRY_SEGMENT_ID]: { type: 'string', value: segmentSpanId },
          [SEMANTIC_ATTRIBUTE_SENTRY_SEGMENT_NAME]: { type: 'string', value: segmentName },
          [SEMANTIC_ATTRIBUTE_SENTRY_RELEASE]: { type: 'string', value: '1.0.0' },
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: { type: 'string', value: 'manual' },
        },
        name: 'test-span',
        is_segment: false,
        parent_span_id: segmentSpanId,
        trace_id: traceId,
        span_id: parentTestSpan!.span_id,
        start_timestamp: expect.any(Number),
        end_timestamp: expect.any(Number),
        status: 'ok',
      });

      expect(segmentSpan).toEqual({
        attributes: {
          [SEMANTIC_ATTRIBUTE_SENTRY_SDK_NAME]: { type: 'string', value: CLOUDFLARE_SDK },
          [SEMANTIC_ATTRIBUTE_SENTRY_SDK_VERSION]: { type: 'string', value: SDK_VERSION },
          [SEMANTIC_ATTRIBUTE_SENTRY_SDK_INTEGRATIONS]: {
            type: 'array',
            value: expect.arrayContaining(['SpanStreaming']),
          },
          [SEMANTIC_ATTRIBUTE_SENTRY_RELEASE]: { type: 'string', value: '1.0.0' },
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: { type: 'string', value: 'auto.http.cloudflare' },
          [SEMANTIC_ATTRIBUTE_SENTRY_SEGMENT_ID]: { type: 'string', value: segmentSpanId },
          [SEMANTIC_ATTRIBUTE_SENTRY_SEGMENT_NAME]: { type: 'string', value: segmentName },
          [SEMANTIC_ATTRIBUTE_SENTRY_OP]: { type: 'string', value: 'http.server' },
          [SEMANTIC_ATTRIBUTE_SENTRY_SAMPLE_RATE]: { type: 'integer', value: 1 },
          [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: { type: 'string', value: 'route' },
          'sentry.span.source': { type: 'string', value: 'route' },
          'server.address': {
            type: 'string',
            value: 'localhost',
          },
          'url.full': {
            type: 'string',
            value: expect.stringMatching(/^http:\/\/localhost:.+$/),
          },
          'url.path': {
            type: 'string',
            value: '/',
          },
          'url.port': {
            type: 'string',
            value: expect.stringMatching(/^\d{4,5}$/),
          },
          'url.scheme': {
            type: 'string',
            value: 'http:',
          },
          'user_agent.original': {
            type: 'string',
            value: 'node',
          },
          'http.request.header.accept': {
            type: 'string',
            value: '*/*',
          },
          'http.request.header.accept_encoding': {
            type: 'string',
            value: 'br, gzip',
          },
          'http.request.header.accept_language': {
            type: 'string',
            value: '*',
          },
          'http.request.header.cf_connecting_ip': {
            type: 'string',
            value: expect.stringMatching(/^(::1|127\.0\.0\.1)$/),
          },
          'http.request.header.host': {
            type: 'string',
            value: expect.stringMatching(/^localhost:.+$/),
          },
          'http.request.header.sec_fetch_mode': {
            type: 'string',
            value: 'cors',
          },
          'http.request.header.user_agent': {
            type: 'string',
            value: 'node',
          },
          'http.request.method': {
            type: 'string',
            value: 'GET',
          },
          'http.response.status_code': {
            type: 'integer',
            value: 200,
          },
          'network.protocol.name': {
            type: 'string',
            value: 'HTTP/1.1',
          },
        },
        is_segment: true,
        trace_id: traceId,
        span_id: segmentSpanId,
        start_timestamp: expect.any(Number),
        end_timestamp: expect.any(Number),
        status: 'ok',
        name: 'GET /',
      });
    })
    .start(signal);

  await runner.makeRequest('get', '/');
  await runner.completed();
});
