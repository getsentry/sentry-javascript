import { describe, expect, it, test, vi } from 'vitest';
import { getCurrentScope } from '../../../src/currentScopes';
import { setCurrentClient } from '../../../src/sdk';
import { SEMANTIC_ATTRIBUTE_SENTRY_SOURCE } from '../../../src/semanticAttributes';
import { SentrySpan } from '../../../src/tracing/sentrySpan';
import { SPAN_STATUS_ERROR } from '../../../src/tracing/spanstatus';
import type { SpanJSON } from '../../../src/types-hoist/span';
import { spanToJSON, TRACE_FLAG_NONE, TRACE_FLAG_SAMPLED } from '../../../src/utils/spanUtils';
import { timestampInSeconds } from '../../../src/utils/time';
import { getDefaultTestClientOptions, TestClient } from '../../mocks/client';

describe('SentrySpan', () => {
  describe('name', () => {
    it('works with name', () => {
      const span = new SentrySpan({ name: 'span name' });
      expect(spanToJSON(span).description).toEqual('span name');
    });

    it('allows to update the name via updateName', () => {
      const span = new SentrySpan({ name: 'span name' });
      expect(spanToJSON(span).description).toEqual('span name');

      span.updateName('new name');

      expect(spanToJSON(span).description).toEqual('new name');
    });

    it('sets the source to custom when calling updateName', () => {
      const span = new SentrySpan({
        name: 'original name',
        attributes: { [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'url' },
      });

      span.updateName('new name');

      const spanJson = spanToJSON(span);
      expect(spanJson.description).toEqual('new name');
      expect(spanJson.data[SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]).toEqual('custom');
    });
  });

  describe('setters', () => {
    test('setName', () => {
      const span = new SentrySpan({});
      expect(spanToJSON(span).description).toBeUndefined();
      span.updateName('foo');
      expect(spanToJSON(span).description).toBe('foo');
    });
  });

  describe('status', () => {
    test('setStatus', () => {
      const span = new SentrySpan({});
      span.setStatus({ code: SPAN_STATUS_ERROR, message: 'permission_denied' });
      expect(spanToJSON(span).status).toBe('permission_denied');
    });
  });

  describe('toJSON', () => {
    test('simple', () => {
      const span = spanToJSON(
        new SentrySpan({ traceId: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', spanId: 'bbbbbbbbbbbbbbbb' }),
      );
      expect(span).toHaveProperty('span_id', 'bbbbbbbbbbbbbbbb');
      expect(span).toHaveProperty('trace_id', 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
    });

    test('with parent', () => {
      const spanA = new SentrySpan({ traceId: 'a', spanId: 'b' });
      const spanB = new SentrySpan({
        traceId: 'c',
        spanId: 'd',
        sampled: false,
        parentSpanId: spanA.spanContext().spanId,
      });
      const serialized = spanToJSON(spanB);
      expect(serialized).toHaveProperty('parent_span_id', 'b');
      expect(serialized).toHaveProperty('span_id', 'd');
      expect(serialized).toHaveProperty('trace_id', 'c');
    });
  });

  describe('end', () => {
    test('simple', () => {
      const span = new SentrySpan({});
      expect(spanToJSON(span).timestamp).toBeUndefined();
      span.end();
      expect(spanToJSON(span).timestamp).toBeGreaterThan(1);
    });

    test('with endTime in seconds', () => {
      const span = new SentrySpan({});
      expect(spanToJSON(span).timestamp).toBeUndefined();
      const endTime = Date.now() / 1000;
      span.end(endTime);
      expect(spanToJSON(span).timestamp).toBe(endTime);
    });

    test('with endTime in milliseconds', () => {
      const span = new SentrySpan({});
      expect(spanToJSON(span).timestamp).toBeUndefined();
      const endTime = Date.now();
      span.end(endTime);
      expect(spanToJSON(span).timestamp).toBe(endTime / 1000);
    });

    test('uses sampled config for standalone span', () => {
      const client = new TestClient(
        getDefaultTestClientOptions({
          dsn: 'https://username@domain/123',
          enableSend: true,
        }),
      );
      setCurrentClient(client);

      // @ts-expect-error Accessing private transport API
      const mockSend = vi.spyOn(client._transport, 'send');

      const notSampledSpan = new SentrySpan({
        name: 'not-sampled',
        isStandalone: true,
        startTimestamp: 1,
        endTimestamp: 2,
        sampled: false,
      });
      notSampledSpan.end();
      expect(mockSend).not.toHaveBeenCalled();

      const sampledSpan = new SentrySpan({
        name: 'is-sampled',
        isStandalone: true,
        startTimestamp: 1,
        endTimestamp: 2,
        sampled: true,
      });
      sampledSpan.end();
      expect(mockSend).toHaveBeenCalledTimes(1);
    });

    test('sends the span if `beforeSendSpan` does not modify the span', () => {
      const beforeSendSpan = vi.fn(span => span);
      const client = new TestClient(
        getDefaultTestClientOptions({
          dsn: 'https://username@domain/123',
          enableSend: true,
          beforeSendSpan,
        }),
      );
      setCurrentClient(client);

      // @ts-expect-error Accessing private transport API
      const mockSend = vi.spyOn(client._transport, 'send');
      const span = new SentrySpan({
        name: 'test',
        isStandalone: true,
        startTimestamp: 1,
        endTimestamp: 2,
        sampled: true,
      });
      span.end();
      expect(mockSend).toHaveBeenCalled();
    });

    test('does not drop the span if `beforeSendSpan` returns null', () => {
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

      const beforeSendSpan = vi.fn(() => null as unknown as SpanJSON);
      const client = new TestClient(
        getDefaultTestClientOptions({
          dsn: 'https://username@domain/123',
          enableSend: true,
          beforeSendSpan,
        }),
      );
      setCurrentClient(client);

      const recordDroppedEventSpy = vi.spyOn(client, 'recordDroppedEvent');
      // @ts-expect-error Accessing private transport API
      const mockSend = vi.spyOn(client._transport, 'send');
      const span = new SentrySpan({
        name: 'test',
        isStandalone: true,
        startTimestamp: 1,
        endTimestamp: 2,
        sampled: true,
      });
      span.end();

      expect(mockSend).toHaveBeenCalled();
      expect(recordDroppedEventSpy).not.toHaveBeenCalled();

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        '[Sentry] Returning null from `beforeSendSpan` is disallowed. To drop certain spans, configure the respective integrations directly or use `ignoreSpans`.',
      );
      consoleWarnSpy.mockRestore();
    });

    test('build TransactionEvent for basic root span', () => {
      const client = new TestClient(
        getDefaultTestClientOptions({
          dsn: 'https://username@domain/123',
        }),
      );
      setCurrentClient(client);

      const scope = getCurrentScope();
      const captureEventSpy = vi.spyOn(scope, 'captureEvent').mockImplementation(() => 'testId');

      const span = new SentrySpan({
        name: 'test',
        startTimestamp: 1,
        sampled: true,
      });
      span.end(2);

      expect(captureEventSpy).toHaveBeenCalledTimes(1);
      expect(captureEventSpy).toHaveBeenCalledWith({
        contexts: {
          trace: {
            data: {
              'sentry.origin': 'manual',
            },
            origin: 'manual',
            span_id: expect.stringMatching(/^[a-f0-9]{16}$/),
            trace_id: expect.stringMatching(/^[a-f0-9]{32}$/),
          },
        },
        sdkProcessingMetadata: {
          capturedSpanIsolationScope: undefined,
          capturedSpanScope: undefined,
          dynamicSamplingContext: {
            environment: 'production',
            public_key: 'username',
            trace_id: expect.stringMatching(/^[a-f0-9]{32}$/),
            transaction: 'test',
          },
        },
        spans: [],
        start_timestamp: 1,
        timestamp: 2,
        transaction: 'test',
        type: 'transaction',
      });
    });
  });

  describe('setAttribute', () => {
    it('allows to set attributes', () => {
      const span = new SentrySpan();

      span.setAttribute('str', 'bar');
      span.setAttribute('num', 1);
      span.setAttribute('zero', 0);
      span.setAttribute('bool', true);
      span.setAttribute('false', false);
      span.setAttribute('undefined', undefined);
      span.setAttribute('numArray', [1, 2]);
      span.setAttribute('strArray', ['aa', 'bb']);
      span.setAttribute('boolArray', [true, false]);
      span.setAttribute('arrayWithUndefined', [1, undefined, 2]);

      expect(span['_attributes']).toEqual({
        str: 'bar',
        num: 1,
        zero: 0,
        bool: true,
        false: false,
        numArray: [1, 2],
        strArray: ['aa', 'bb'],
        boolArray: [true, false],
        arrayWithUndefined: [1, undefined, 2],
        // origin is set by default to 'manual' in the SentrySpan constructor
        'sentry.origin': 'manual',
      });
    });

    it('deletes attributes when setting to `undefined`', () => {
      const span = new SentrySpan();

      span.setAttribute('str', 'bar');

      // length 2 because `sentry.origin` is always set by default
      expect(Object.keys(span['_attributes']).length).toEqual(2);

      span.setAttribute('str', undefined);

      expect(Object.keys(span['_attributes']).length).toEqual(1);
    });

    it('disallows invalid attribute types', () => {
      const span = new SentrySpan();

      /** @ts-expect-error this is invalid */
      span.setAttribute('str', {});

      /** @ts-expect-error this is invalid */
      span.setAttribute('str', null);

      /** @ts-expect-error this is invalid */
      span.setAttribute('str', [1, 'a']);
    });
  });

  describe('setAttributes', () => {
    it('allows to set attributes', () => {
      const span = new SentrySpan();

      const initialAttributes = span['_attributes'];

      expect(initialAttributes).toEqual({
        // origin is set by default to 'manual' in the SentrySpan constructor
        'sentry.origin': 'manual',
      });

      const newAttributes = {
        str: 'bar',
        num: 1,
        zero: 0,
        bool: true,
        false: false,
        undefined: undefined,
        numArray: [1, 2],
        strArray: ['aa', 'bb'],
        boolArray: [true, false],
        arrayWithUndefined: [1, undefined, 2],
      };
      span.setAttributes(newAttributes);

      expect(span['_attributes']).toEqual({
        str: 'bar',
        num: 1,
        zero: 0,
        bool: true,
        false: false,
        numArray: [1, 2],
        strArray: ['aa', 'bb'],
        boolArray: [true, false],
        arrayWithUndefined: [1, undefined, 2],
        'sentry.origin': 'manual',
      });

      expect(span['_attributes']).not.toBe(newAttributes);

      span.setAttributes({
        num: 2,
        numArray: [3, 4],
      });

      expect(span['_attributes']).toEqual({
        str: 'bar',
        num: 2,
        zero: 0,
        bool: true,
        false: false,
        numArray: [3, 4],
        strArray: ['aa', 'bb'],
        boolArray: [true, false],
        arrayWithUndefined: [1, undefined, 2],
        'sentry.origin': 'manual',
      });
    });

    it('deletes attributes when setting to `undefined`', () => {
      const span = new SentrySpan();

      span.setAttribute('str', 'bar');

      // length 2 because `sentry.origin` is always set by default
      expect(Object.keys(span['_attributes']).length).toEqual(2);

      span.setAttributes({ str: undefined });

      expect(Object.keys(span['_attributes']).length).toEqual(1);
    });
  });

  describe('end', () => {
    it('works without endTimestamp', () => {
      const span = new SentrySpan();
      const now = timestampInSeconds();
      span.end();

      expect(spanToJSON(span).timestamp).toBeGreaterThanOrEqual(now);
    });

    it('works with endTimestamp in seconds', () => {
      const span = new SentrySpan();
      const timestamp = timestampInSeconds() - 1;
      span.end(timestamp);

      expect(spanToJSON(span).timestamp).toEqual(timestamp);
    });

    it('works with endTimestamp in milliseconds', () => {
      const span = new SentrySpan();
      const timestamp = Date.now() - 1000;
      span.end(timestamp);

      expect(spanToJSON(span).timestamp).toEqual(timestamp / 1000);
    });

    it('works with endTimestamp in array form', () => {
      const span = new SentrySpan();
      const seconds = Math.floor(timestampInSeconds() - 1);
      span.end([seconds, 0]);

      expect(spanToJSON(span).timestamp).toEqual(seconds);
    });

    it('skips if span is already ended', () => {
      const startTimestamp = timestampInSeconds() - 5;
      const endTimestamp = timestampInSeconds() - 1;
      const span = new SentrySpan({ startTimestamp, endTimestamp });

      span.end();

      expect(spanToJSON(span).timestamp).toBe(endTimestamp);
    });
  });

  describe('isRecording', () => {
    it('returns true for sampled span', () => {
      const span = new SentrySpan({ sampled: true });
      expect(span.isRecording()).toEqual(true);
    });

    it('returns false for sampled, finished span', () => {
      const span = new SentrySpan({ sampled: true, endTimestamp: Date.now() });
      expect(span.isRecording()).toEqual(false);
    });

    it('returns false for unsampled span', () => {
      const span = new SentrySpan({ sampled: false });
      expect(span.isRecording()).toEqual(false);
    });
  });

  describe('spanContext', () => {
    it('works with default span', () => {
      const span = new SentrySpan();
      expect(span.spanContext()).toEqual({
        spanId: span['_spanId'],
        traceId: span['_traceId'],
        traceFlags: TRACE_FLAG_NONE,
      });
    });

    it('works sampled span', () => {
      const span = new SentrySpan({ sampled: true });
      expect(span.spanContext()).toEqual({
        spanId: span['_spanId'],
        traceId: span['_traceId'],
        traceFlags: TRACE_FLAG_SAMPLED,
      });
    });

    it('works unsampled span', () => {
      const span = new SentrySpan({ sampled: false });
      expect(span.spanContext()).toEqual({
        spanId: span['_spanId'],
        traceId: span['_traceId'],
        traceFlags: TRACE_FLAG_NONE,
      });
    });
  });
});
