import type { Span, SpanOptions } from '@opentelemetry/api';
import { trace } from '@opentelemetry/api';
import type { BasicTracerProvider } from '@opentelemetry/sdk-trace-base';
import {
  SEMANTIC_ATTRIBUTE_SENTRY_OP,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  SEMANTIC_ATTRIBUTE_SENTRY_SAMPLE_RATE,
  spanToJSON,
} from '@sentry/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { setupOtel } from '../helpers/initOtel';
import { cleanupOtel } from '../helpers/mockSdkInit';
import { getDefaultTestClientOptions, TestClient } from '../helpers/TestClient';

describe('spanToJSON', () => {
  describe('OpenTelemetry Span', () => {
    let provider: BasicTracerProvider | undefined;

    beforeEach(() => {
      const client = new TestClient(getDefaultTestClientOptions({ tracesSampleRate: 1 }));
      [provider] = setupOtel(client);
    });

    afterEach(() => {
      cleanupOtel(provider);
    });

    function createSpan(name: string, params?: SpanOptions): Span {
      return trace.getTracer('test').startSpan(name, params);
    }

    it('works with a simple span', () => {
      const span = createSpan('test span', { startTime: [123, 0] });

      expect(spanToJSON(span)).toEqual({
        span_id: span.spanContext().spanId,
        trace_id: span.spanContext().traceId,
        start_timestamp: 123,
        description: 'test span',
        data: {
          [SEMANTIC_ATTRIBUTE_SENTRY_SAMPLE_RATE]: 1,
        },
      });
    });

    it('works with a full span', () => {
      const span = createSpan('test span', { startTime: [123, 0] });

      span.setAttributes({
        attr1: 'value1',
        attr2: 2,
        [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'test op',
        [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto',
      });

      span.setStatus({ code: 2, message: 'unknown_error' });
      span.end([456, 0]);

      expect(spanToJSON(span)).toEqual({
        span_id: span.spanContext().spanId,
        trace_id: span.spanContext().traceId,
        start_timestamp: 123,
        timestamp: 456,
        description: 'test span',
        op: 'test op',
        origin: 'auto',
        data: {
          attr1: 'value1',
          attr2: 2,
          [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'test op',
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto',
          [SEMANTIC_ATTRIBUTE_SENTRY_SAMPLE_RATE]: 1,
        },
        status: 'unknown_error',
      });
    });
  });
});
