import { describe, expect, it, vi } from 'vitest';
import {
  captureSpan,
  getActiveSpan,
  SEMANTIC_ATTRIBUTE_SENTRY_ENVIRONMENT,
  SEMANTIC_ATTRIBUTE_SENTRY_OP,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  SEMANTIC_ATTRIBUTE_SENTRY_RELEASE,
  SEMANTIC_ATTRIBUTE_SENTRY_SAMPLE_RATE,
  SEMANTIC_ATTRIBUTE_SENTRY_SDK_NAME,
  SEMANTIC_ATTRIBUTE_SENTRY_SDK_VERSION,
  SEMANTIC_ATTRIBUTE_SENTRY_SEGMENT_ID,
  SEMANTIC_ATTRIBUTE_SENTRY_SEGMENT_NAME,
  SEMANTIC_ATTRIBUTE_SENTRY_SPAN_SOURCE,
  SEMANTIC_ATTRIBUTE_USER_EMAIL,
  SEMANTIC_ATTRIBUTE_USER_ID,
  SEMANTIC_ATTRIBUTE_USER_IP_ADDRESS,
  SEMANTIC_ATTRIBUTE_USER_USERNAME,
  startInactiveSpan,
  startSpan,
  withScope,
  withStreamedSpan,
} from '../../../../src';
import { _setSpanForScope } from '../../../../src/utils/spanOnScope';
import { getDefaultTestClientOptions, TestClient } from '../../../mocks/client';

describe('captureSpan', () => {
  it('captures user attributes iff sendDefaultPii is true', () => {
    const client = new TestClient(
      getDefaultTestClientOptions({
        dsn: 'https://dsn@ingest.f00.f00/1',
        tracesSampleRate: 1,
        release: '1.0.0',
        environment: 'staging',
        sendDefaultPii: true,
      }),
    );

    const span = withScope(scope => {
      scope.setClient(client);
      scope.setUser({
        id: '123',
        email: 'user@example.com',
        username: 'testuser',
        ip_address: '127.0.0.1',
      });

      const span = startInactiveSpan({ name: 'my-span', attributes: { 'sentry.op': 'http.client' } });
      span.end();

      return span;
    });

    const serializedSpan = captureSpan(span, client);

    expect(serializedSpan).toStrictEqual({
      span_id: expect.stringMatching(/^[\da-f]{16}$/),
      trace_id: expect.stringMatching(/^[\da-f]{32}$/),
      parent_span_id: undefined,
      links: undefined,
      start_timestamp: expect.any(Number),
      name: 'my-span',
      end_timestamp: expect.any(Number),
      status: 'ok',
      is_segment: true,
      attributes: {
        [SEMANTIC_ATTRIBUTE_SENTRY_OP]: {
          type: 'string',
          value: 'http.client',
        },
        [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: {
          type: 'string',
          value: 'manual',
        },
        [SEMANTIC_ATTRIBUTE_SENTRY_SAMPLE_RATE]: {
          type: 'integer',
          value: 1,
        },
        [SEMANTIC_ATTRIBUTE_SENTRY_SEGMENT_NAME]: {
          value: 'my-span',
          type: 'string',
        },
        [SEMANTIC_ATTRIBUTE_SENTRY_SEGMENT_ID]: {
          value: span.spanContext().spanId,
          type: 'string',
        },
        [SEMANTIC_ATTRIBUTE_SENTRY_SPAN_SOURCE]: {
          value: 'custom',
          type: 'string',
        },
        [SEMANTIC_ATTRIBUTE_SENTRY_RELEASE]: {
          value: '1.0.0',
          type: 'string',
        },
        [SEMANTIC_ATTRIBUTE_SENTRY_ENVIRONMENT]: {
          value: 'staging',
          type: 'string',
        },
        [SEMANTIC_ATTRIBUTE_USER_ID]: {
          value: '123',
          type: 'string',
        },
        [SEMANTIC_ATTRIBUTE_USER_EMAIL]: {
          value: 'user@example.com',
          type: 'string',
        },
        [SEMANTIC_ATTRIBUTE_USER_USERNAME]: {
          value: 'testuser',
          type: 'string',
        },
        [SEMANTIC_ATTRIBUTE_USER_IP_ADDRESS]: {
          value: '127.0.0.1',
          type: 'string',
        },
      },
      _segmentSpan: span,
    });
  });

  it.each([false, undefined])("doesn't capture user attributes if sendDefaultPii is %s", sendDefaultPii => {
    const client = new TestClient(
      getDefaultTestClientOptions({
        dsn: 'https://dsn@ingest.f00.f00/1',
        tracesSampleRate: 1,
        release: '1.0.0',
        environment: 'staging',
        sendDefaultPii,
      }),
    );

    const span = withScope(scope => {
      scope.setClient(client);
      scope.setUser({
        id: '123',
        email: 'user@example.com',
        username: 'testuser',
        ip_address: '127.0.0.1',
      });

      const span = startInactiveSpan({ name: 'my-span', attributes: { 'sentry.op': 'http.client' } });
      span.end();

      return span;
    });

    expect(captureSpan(span, client)).toStrictEqual({
      span_id: expect.stringMatching(/^[\da-f]{16}$/),
      trace_id: expect.stringMatching(/^[\da-f]{32}$/),
      parent_span_id: undefined,
      links: undefined,
      start_timestamp: expect.any(Number),
      name: 'my-span',
      end_timestamp: expect.any(Number),
      status: 'ok',
      is_segment: true,
      attributes: {
        [SEMANTIC_ATTRIBUTE_SENTRY_OP]: {
          type: 'string',
          value: 'http.client',
        },
        [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: {
          type: 'string',
          value: 'manual',
        },
        [SEMANTIC_ATTRIBUTE_SENTRY_SAMPLE_RATE]: {
          type: 'integer',
          value: 1,
        },
        [SEMANTIC_ATTRIBUTE_SENTRY_SEGMENT_NAME]: {
          value: 'my-span',
          type: 'string',
        },
        [SEMANTIC_ATTRIBUTE_SENTRY_SEGMENT_ID]: {
          value: span.spanContext().spanId,
          type: 'string',
        },
        [SEMANTIC_ATTRIBUTE_SENTRY_SPAN_SOURCE]: {
          value: 'custom',
          type: 'string',
        },
        [SEMANTIC_ATTRIBUTE_SENTRY_RELEASE]: {
          value: '1.0.0',
          type: 'string',
        },
        [SEMANTIC_ATTRIBUTE_SENTRY_ENVIRONMENT]: {
          value: 'staging',
          type: 'string',
        },
      },
      _segmentSpan: span,
    });
  });

  it('captures sdk name and version if available', () => {
    const client = new TestClient(
      getDefaultTestClientOptions({
        dsn: 'https://dsn@ingest.f00.f00/1',
        tracesSampleRate: 1,
        release: '1.0.0',
        environment: 'staging',
        _metadata: {
          sdk: {
            name: 'sentry.javascript.node',
            version: '1.0.0',
            integrations: ['UnhandledRejection', 'Dedupe'],
          },
        },
      }),
    );

    const span = withScope(scope => {
      scope.setClient(client);
      scope.setUser({
        id: '123',
        email: 'user@example.com',
        username: 'testuser',
        ip_address: '127.0.0.1',
      });

      const span = startInactiveSpan({ name: 'my-span', attributes: { 'sentry.op': 'http.client' } });
      span.end();

      return span;
    });

    expect(captureSpan(span, client)).toStrictEqual({
      span_id: expect.stringMatching(/^[\da-f]{16}$/),
      trace_id: expect.stringMatching(/^[\da-f]{32}$/),
      parent_span_id: undefined,
      links: undefined,
      start_timestamp: expect.any(Number),
      name: 'my-span',
      end_timestamp: expect.any(Number),
      status: 'ok',
      is_segment: true,
      attributes: {
        [SEMANTIC_ATTRIBUTE_SENTRY_OP]: {
          type: 'string',
          value: 'http.client',
        },
        [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: {
          type: 'string',
          value: 'manual',
        },
        [SEMANTIC_ATTRIBUTE_SENTRY_SAMPLE_RATE]: {
          type: 'integer',
          value: 1,
        },
        [SEMANTIC_ATTRIBUTE_SENTRY_SEGMENT_NAME]: {
          value: 'my-span',
          type: 'string',
        },
        [SEMANTIC_ATTRIBUTE_SENTRY_SEGMENT_ID]: {
          value: span.spanContext().spanId,
          type: 'string',
        },
        [SEMANTIC_ATTRIBUTE_SENTRY_SPAN_SOURCE]: {
          value: 'custom',
          type: 'string',
        },
        [SEMANTIC_ATTRIBUTE_SENTRY_RELEASE]: {
          value: '1.0.0',
          type: 'string',
        },
        [SEMANTIC_ATTRIBUTE_SENTRY_ENVIRONMENT]: {
          value: 'staging',
          type: 'string',
        },
        [SEMANTIC_ATTRIBUTE_SENTRY_SDK_NAME]: {
          value: 'sentry.javascript.node',
          type: 'string',
        },
        [SEMANTIC_ATTRIBUTE_SENTRY_SDK_VERSION]: {
          value: '1.0.0',
          type: 'string',
        },
      },
      _segmentSpan: span,
    });
  });

  describe('client hooks', () => {
    it('calls processSpan and processSegmentSpan hooks for a segment span', () => {
      const client = new TestClient(
        getDefaultTestClientOptions({
          dsn: 'https://dsn@ingest.f00.f00/1',
          tracesSampleRate: 1,
          release: '1.0.0',
          environment: 'staging',
        }),
      );

      const processSpanFn = vi.fn();
      const processSegmentSpanFn = vi.fn();
      client.on('processSpan', processSpanFn);
      client.on('processSegmentSpan', processSegmentSpanFn);

      const span = startInactiveSpan({ name: 'my-span', attributes: { 'sentry.op': 'http.client' } });

      captureSpan(span, client);

      expect(processSpanFn).toHaveBeenCalledWith(expect.objectContaining({ span_id: span.spanContext().spanId }));
      expect(processSegmentSpanFn).toHaveBeenCalledWith(
        expect.objectContaining({ span_id: span.spanContext().spanId }),
      );
    });

    it('only calls processSpan hook for a child span', () => {
      const client = new TestClient(
        getDefaultTestClientOptions({
          dsn: 'https://dsn@ingest.f00.f00/1',
          tracesSampleRate: 1,
          release: '1.0.0',
          environment: 'staging',
          sendDefaultPii: true,
        }),
      );

      const processSpanFn = vi.fn();
      const processSegmentSpanFn = vi.fn();
      client.on('processSpan', processSpanFn);
      client.on('processSegmentSpan', processSegmentSpanFn);

      const serializedChildSpan = withScope(scope => {
        scope.setClient(client);
        scope.setUser({
          id: '123',
          email: 'user@example.com',
          username: 'testuser',
          ip_address: '127.0.0.1',
        });

        return startSpan({ name: 'segment' }, () => {
          const childSpan = startInactiveSpan({ name: 'child' });
          childSpan.end();
          return captureSpan(childSpan, client);
        });
      });

      expect(serializedChildSpan?.name).toBe('child');
      expect(serializedChildSpan?.is_segment).toBe(false);

      expect(processSpanFn).toHaveBeenCalledWith(expect.objectContaining({ span_id: serializedChildSpan?.span_id }));
      expect(processSegmentSpanFn).not.toHaveBeenCalled();
    });
  });

  describe('beforeSendSpan', () => {
    it('applies beforeSendSpan if it is a span streaming compatible callback', () => {
      const beforeSendSpan = withStreamedSpan(vi.fn(span => span));

      const client = new TestClient(
        getDefaultTestClientOptions({
          dsn: 'https://dsn@ingest.f00.f00/1',
          tracesSampleRate: 1,
          release: '1.0.0',
          environment: 'staging',
          beforeSendSpan,
        }),
      );

      const span = startInactiveSpan({ name: 'my-span', attributes: { 'sentry.op': 'http.client' } });
      span.end();

      captureSpan(span, client);

      expect(beforeSendSpan).toHaveBeenCalledWith(expect.objectContaining({ span_id: span.spanContext().spanId }));
    });

    it("doesn't apply beforeSendSpan if it is not a span streaming compatible callback", () => {
      const beforeSendSpan = vi.fn(span => span);

      const client = new TestClient(
        getDefaultTestClientOptions({
          dsn: 'https://dsn@ingest.f00.f00/1',
          tracesSampleRate: 1,
          release: '1.0.0',
          environment: 'staging',
          beforeSendSpan,
        }),
      );

      const span = startInactiveSpan({ name: 'my-span', attributes: { 'sentry.op': 'http.client' } });
      span.end();

      captureSpan(span, client);

      expect(beforeSendSpan).not.toHaveBeenCalled();
    });

    it('logs a warning if the beforeSendSpan callback returns null', () => {
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      // @ts-expect-error - the types dissallow returning null but this is javascript, so we need to test it
      const beforeSendSpan = withStreamedSpan(() => null);

      const client = new TestClient(
        getDefaultTestClientOptions({
          dsn: 'https://dsn@ingest.f00.f00/1',
          tracesSampleRate: 1,
          release: '1.0.0',
          environment: 'staging',
          beforeSendSpan,
        }),
      );

      const span = startInactiveSpan({ name: 'my-span', attributes: { 'sentry.op': 'http.client' } });
      span.end();

      captureSpan(span, client);

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        '[Sentry] Returning null from `beforeSendSpan` is disallowed. To drop certain spans, configure the respective integrations directly or use `ignoreSpans`.',
      );

      consoleWarnSpy.mockRestore();
    });
  });
});
