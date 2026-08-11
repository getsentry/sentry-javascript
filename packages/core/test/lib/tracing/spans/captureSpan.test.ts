import { describe, expect, it, vi } from 'vitest';
import type { Contexts, Span, StreamedSpanJSON } from '../../../../src';
import {
  captureSpan,
  debug,
  SEMANTIC_ATTRIBUTE_SENTRY_ENVIRONMENT,
  SEMANTIC_ATTRIBUTE_SENTRY_OP,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  SEMANTIC_ATTRIBUTE_SENTRY_RELEASE,
  SEMANTIC_ATTRIBUTE_SENTRY_SAMPLE_RATE,
  SEMANTIC_ATTRIBUTE_SENTRY_SDK_INTEGRATIONS,
  SEMANTIC_ATTRIBUTE_SENTRY_SOURCE,
  SEMANTIC_ATTRIBUTE_USER_EMAIL,
  SEMANTIC_ATTRIBUTE_USER_ID,
  SEMANTIC_ATTRIBUTE_USER_IP_ADDRESS,
  SEMANTIC_ATTRIBUTE_USER_USERNAME,
  spanStreamingIntegration,
  startInactiveSpan,
  startSpan,
  withStaticSpan,
  withScope,
} from '../../../../src';
import {
  captureStandaloneSpanWithStaticCallback,
  safeSetSpanJSONAttributes,
} from '../../../../src/tracing/spans/captureSpan';
import { scopeContextsToSpanAttributes } from '../../../../src/tracing/spans/scopeContextAttributes';
import type { TestClientOptions } from '../../../mocks/client';
import { getDefaultTestClientOptions, TestClient } from '../../../mocks/client';
import {
  SENTRY_SEGMENT_ID,
  SENTRY_SEGMENT_NAME,
  SENTRY_SDK_NAME,
  SENTRY_SDK_VERSION,
  SENTRY_TRACE_LIFECYCLE,
} from '@sentry/conventions/attributes';

describe('captureSpan', () => {
  // User attributes are gated with dataCollection.userInfo, but could me manually set on the scope (and we send it)
  it('always applies scope user attributes to spans', () => {
    const client = new TestClient(
      getDefaultTestClientOptions({
        dsn: 'https://dsn@ingest.f00.f00/1',
        tracesSampleRate: 1,
        release: '1.0.0',
        environment: 'staging',
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
        [SENTRY_TRACE_LIFECYCLE]: {
          type: 'string',
          value: 'stream',
        },
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
        [SENTRY_SEGMENT_NAME]: {
          value: 'my-span',
          type: 'string',
        },
        [SENTRY_SEGMENT_ID]: {
          value: span.spanContext().spanId,
          type: 'string',
        },
        ['sentry.segment.name.source']: {
          value: 'custom',
          type: 'string',
        },
        [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: {
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
        [SENTRY_SEGMENT_NAME]: {
          value: 'my-span',
          type: 'string',
        },
        [SENTRY_SEGMENT_ID]: {
          value: span.spanContext().spanId,
          type: 'string',
        },
        ['sentry.segment.name.source']: {
          value: 'custom',
          type: 'string',
        },
        [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: {
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
        [SENTRY_TRACE_LIFECYCLE]: {
          value: 'stream',
          type: 'string',
        },
        [SENTRY_SDK_NAME]: {
          value: 'sentry.javascript.node',
          type: 'string',
        },
        [SENTRY_SDK_VERSION]: {
          value: '1.0.0',
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

  it('falls back to "production" environment if not provided', () => {
    const client = new TestClient(
      getDefaultTestClientOptions({
        dsn: 'https://dsn@ingest.f00.f00/1',
        tracesSampleRate: 1,
        release: '1.0.0',
        // environment: undefined,
      }),
    );
    client.init();

    const span = withScope(scope => {
      scope.setClient(client);

      const span = startInactiveSpan({ name: 'my-span', attributes: { 'sentry.op': 'http.client' } });
      span.end();

      return span;
    });

    expect(captureSpan(span, client)).toStrictEqual({
      span_id: expect.stringMatching(/^[\da-f]{16}$/),
      parent_span_id: undefined,
      trace_id: expect.stringMatching(/^[\da-f]{32}$/),
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
        [SENTRY_SEGMENT_NAME]: {
          value: 'my-span',
          type: 'string',
        },
        [SENTRY_SEGMENT_ID]: {
          value: span.spanContext().spanId,
          type: 'string',
        },
        ['sentry.segment.name.source']: {
          value: 'custom',
          type: 'string',
        },
        [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: {
          value: 'custom',
          type: 'string',
        },
        [SEMANTIC_ATTRIBUTE_SENTRY_RELEASE]: {
          value: '1.0.0',
          type: 'string',
        },
        [SEMANTIC_ATTRIBUTE_SENTRY_ENVIRONMENT]: {
          value: 'production',
          type: 'string',
        },
        [SENTRY_TRACE_LIFECYCLE]: {
          value: 'stream',
          type: 'string',
        },
      },
      _segmentSpan: span,
    });
  });

  it('adds sentry.sdk.integrations to segment spans as an array attribute', () => {
    const client = new TestClient(
      getDefaultTestClientOptions({
        dsn: 'https://dsn@ingest.f00.f00/1',
        tracesSampleRate: 1,
        release: '1.0.0',
        environment: 'staging',
        integrations: [
          { name: 'EventFilters', setupOnce: () => {} },
          { name: 'BrowserTracing', setupOnce: () => {} },
        ],
        _metadata: {
          sdk: {
            name: 'sentry.javascript.browser',
            version: '9.0.0',
          },
        },
      }),
    );
    client.init();

    const span = withScope(scope => {
      scope.setClient(client);
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
        [SENTRY_TRACE_LIFECYCLE]: { type: 'string', value: 'stream' },
        [SEMANTIC_ATTRIBUTE_SENTRY_OP]: { type: 'string', value: 'http.client' },
        [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: { type: 'string', value: 'manual' },
        [SEMANTIC_ATTRIBUTE_SENTRY_SAMPLE_RATE]: { type: 'integer', value: 1 },
        [SENTRY_SEGMENT_NAME]: { value: 'my-span', type: 'string' },
        [SENTRY_SEGMENT_ID]: { value: span.spanContext().spanId, type: 'string' },
        ['sentry.segment.name.source']: { value: 'custom', type: 'string' },
        [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: { value: 'custom', type: 'string' },
        [SEMANTIC_ATTRIBUTE_SENTRY_RELEASE]: { value: '1.0.0', type: 'string' },
        [SEMANTIC_ATTRIBUTE_SENTRY_ENVIRONMENT]: { value: 'staging', type: 'string' },
        [SENTRY_SDK_NAME]: { value: 'sentry.javascript.browser', type: 'string' },
        [SENTRY_SDK_VERSION]: { value: '9.0.0', type: 'string' },
        [SEMANTIC_ATTRIBUTE_SENTRY_SDK_INTEGRATIONS]: {
          type: 'array',
          value: ['EventFilters', 'BrowserTracing'],
        },
      },
      _segmentSpan: span,
    });
  });

  it('does not add sentry.sdk.integrations to non-segment child spans', () => {
    const client = new TestClient(
      getDefaultTestClientOptions({
        dsn: 'https://dsn@ingest.f00.f00/1',
        tracesSampleRate: 1,
        integrations: [{ name: 'EventFilters', setupOnce: () => {} }],
      }),
    );
    client.init();

    const serializedChild = withScope(scope => {
      scope.setClient(client);
      return startSpan({ name: 'segment' }, () => {
        const childSpan = startInactiveSpan({ name: 'child' });
        childSpan.end();
        return captureSpan(childSpan, client);
      });
    });

    expect(serializedChild.is_segment).toBe(false);
    expect(serializedChild.attributes[SEMANTIC_ATTRIBUTE_SENTRY_SDK_INTEGRATIONS]).toBeUndefined();
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

      const preprocessSpanFn = vi.fn();
      const processSpanFn = vi.fn();
      const processSegmentSpanFn = vi.fn();
      client.on('preprocessSpan', preprocessSpanFn);
      client.on('processSpan', processSpanFn);
      client.on('processSegmentSpan', processSegmentSpanFn);

      const span = withScope(scope => {
        scope.setClient(client);
        return startInactiveSpan({ name: 'my-span', attributes: { 'sentry.op': 'http.client' } });
      });

      captureSpan(span, client);

      expect(preprocessSpanFn).toHaveBeenCalledWith(expect.objectContaining({ span_id: span.spanContext().spanId }));
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
        }),
      );

      const preprocessSpanFn = vi.fn();
      const processSpanFn = vi.fn();
      const processSegmentSpanFn = vi.fn();
      client.on('preprocessSpan', preprocessSpanFn);
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

      expect(preprocessSpanFn).toHaveBeenCalledWith(expect.objectContaining({ span_id: serializedChildSpan?.span_id }));
      expect(processSpanFn).toHaveBeenCalledWith(expect.objectContaining({ span_id: serializedChildSpan?.span_id }));
      expect(processSegmentSpanFn).not.toHaveBeenCalled();
    });
  });

  describe('beforeSendSpan', () => {
    it('applies a default beforeSendSpan callback', () => {
      const beforeSendSpan = vi.fn(span => span);

      const client = new TestClient(
        getDefaultTestClientOptions({
          dsn: 'https://dsn@ingest.f00.f00/1',
          tracesSampleRate: 1,
          release: '1.0.0',
          environment: 'staging',
          traceLifecycle: 'stream',
          beforeSendSpan,
        }),
      );

      const span = startInactiveSpan({ name: 'my-span', attributes: { 'sentry.op': 'http.client' } });
      span.end();

      captureSpan(span, client);

      expect(beforeSendSpan).toHaveBeenCalledWith(expect.objectContaining({ span_id: span.spanContext().spanId }));
    });

    it("doesn't apply beforeSendSpan if it is marked as static", () => {
      const beforeSendSpan = withStaticSpan(vi.fn(span => span));

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
      const beforeSendSpan = vi.fn(() => null as unknown as StreamedSpanJSON);

      const client = new TestClient(
        getDefaultTestClientOptions({
          dsn: 'https://dsn@ingest.f00.f00/1',
          tracesSampleRate: 1,
          release: '1.0.0',
          environment: 'staging',
          traceLifecycle: 'stream',
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

    it('keeps the span and logs an error if the beforeSendSpan callback throws', () => {
      const debugErrorSpy = vi.spyOn(debug, 'error').mockImplementation(() => undefined);
      const error = new Error('beforeSendSpan is broken');
      // A v10 callback that was not migrated to the streamed format throws like this, because
      // `data` doesn't exist on a `StreamedSpanJSON`.
      const beforeSendSpan = vi.fn(() => {
        throw error;
      });

      const client = new TestClient(
        getDefaultTestClientOptions({
          dsn: 'https://dsn@ingest.f00.f00/1',
          tracesSampleRate: 1,
          traceLifecycle: 'stream',
          beforeSendSpan: beforeSendSpan as unknown as TestClientOptions['beforeSendSpan'],
        }),
      );

      const span = withScope(scope => {
        scope.setClient(client);
        const span = startInactiveSpan({ name: 'my-span', attributes: { 'sentry.op': 'http.client' } });
        span.end();
        return span;
      });

      const serialized = captureSpan(span, client);

      expect(serialized.name).toBe('my-span');
      expect(serialized.attributes['sentry.op']).toEqual({ type: 'string', value: 'http.client' });
      expect(debugErrorSpy).toHaveBeenCalledWith(
        'The `beforeSendSpan` callback threw an error, sending the span unmodified:',
        error,
      );

      debugErrorSpy.mockRestore();
    });

    it("doesn't let a throwing beforeSendSpan callback propagate out of span.end()", () => {
      const debugErrorSpy = vi.spyOn(debug, 'error').mockImplementation(() => undefined);
      const client = new TestClient(
        getDefaultTestClientOptions({
          dsn: 'https://dsn@ingest.f00.f00/1',
          tracesSampleRate: 1,
          traceLifecycle: 'stream',
          integrations: [spanStreamingIntegration()],
          beforeSendSpan: (() => {
            throw new Error('beforeSendSpan is broken');
          }) as unknown as TestClientOptions['beforeSendSpan'],
        }),
      );

      // Spans are captured synchronously from the `afterSpanEnd` hook, so a throwing callback
      // would otherwise surface in user code that ended the span.
      expect(() =>
        withScope(scope => {
          scope.setClient(client);
          client.init();
          startSpan({ name: 'my-span' }, () => undefined);
        }),
      ).not.toThrow();

      debugErrorSpy.mockRestore();
    });
  });
});

describe('captureStandaloneSpanWithStaticCallback', () => {
  it('applies a static beforeSendSpan callback', () => {
    const beforeSendSpan = withStaticSpan(vi.fn(span => span));

    const client = new TestClient(
      getDefaultTestClientOptions({
        dsn: 'https://dsn@ingest.f00.f00/1',
        tracesSampleRate: 1,
        release: '1.0.0',
        environment: 'staging',
        traceLifecycle: 'static',
        beforeSendSpan,
      }),
    );

    const span = withScope(scope => {
      scope.setClient(client);
      const span = startInactiveSpan({ name: 'my-span', attributes: { 'sentry.op': 'http.client' } });
      span.end();
      return span;
    });

    // @ts-expect-error - this is fine because withStaticSpan intentionally lies about its return type
    const serialized = captureStandaloneSpanWithStaticCallback(span, client, beforeSendSpan);

    expect(beforeSendSpan).toHaveBeenCalledWith(expect.objectContaining({ span_id: span.spanContext().spanId }));

    expect(serialized.name).toBe('my-span');
    expect(serialized.attributes['sentry.op']).toEqual({ type: 'string', value: 'http.client' });
  });

  it("doesn't throw if the beforeSendSpan callback throws", () => {
    const debugErrorSpy = vi.spyOn(debug, 'error').mockImplementation(() => undefined);

    const error = new Error('beforeSendSpan is broken');
    const beforeSendSpan = vi.fn(() => {
      throw error;
    });

    const client = new TestClient(
      getDefaultTestClientOptions({
        dsn: 'https://dsn@ingest.f00.f00/1',
      }),
    );

    const span = withScope(scope => {
      let span: Span | undefined;

      expect(() => {
        scope.setClient(client);
        span = startInactiveSpan({ name: 'my-span', attributes: { 'sentry.op': 'http.client' } });
        span.end();
      }).not.toThrow();

      return span;
    });

    expect(() => captureStandaloneSpanWithStaticCallback(span!, client, beforeSendSpan)).not.toThrow();
    expect(debugErrorSpy).toHaveBeenCalledWith(
      'The `beforeSendSpan` callback threw an error, sending the span unmodified:',
      error,
    );

    debugErrorSpy.mockRestore();
  });
});

describe('safeSetSpanJSONAttributes', () => {
  it('sets attributes that do not exist', () => {
    const spanJSON = { attributes: { a: 1, b: 2 } };

    // @ts-expect-error - only passing a partial object for this test
    safeSetSpanJSONAttributes(spanJSON, { c: 3 });

    expect(spanJSON.attributes).toEqual({ a: 1, b: 2, c: 3 });
  });

  it("doesn't set attributes that already exist", () => {
    const spanJSON = { attributes: { a: 1, b: 2 } };
    // @ts-expect-error - only passing a partial object for this test
    safeSetSpanJSONAttributes(spanJSON, { a: 3 });

    expect(spanJSON.attributes).toEqual({ a: 1, b: 2 });
  });

  it.each([null, undefined])("doesn't overwrite attributes previously set to %s", val => {
    const spanJSON = { attributes: { a: val, b: 2 } };

    // @ts-expect-error - only passing a partial object for this test
    safeSetSpanJSONAttributes(spanJSON, { a: 1 });

    expect(spanJSON.attributes).toEqual({ a: val, b: 2 });
  });

  it("doesn't overwrite falsy attribute values (%s)", () => {
    const spanJSON = { attributes: { a: false, b: '', c: 0 } };

    // @ts-expect-error - only passing a partial object for this test
    safeSetSpanJSONAttributes(spanJSON, { a: 1, b: 'test', c: 1 });

    expect(spanJSON.attributes).toEqual({ a: false, b: '', c: 0 });
  });

  it('handles an undefined attributes property', () => {
    const spanJSON: Partial<StreamedSpanJSON> = {};

    // @ts-expect-error - only passing a partial object for this test
    safeSetSpanJSONAttributes(spanJSON, { a: 1 });

    expect(spanJSON.attributes).toEqual({ a: 1 });
  });

  it("doesn't apply undefined or null values to attributes", () => {
    const spanJSON = { attributes: {} };

    // @ts-expect-error - only passing a partial object for this test
    safeSetSpanJSONAttributes(spanJSON, { a: undefined, b: null });

    expect(spanJSON.attributes).toEqual({});
  });
});

describe('scopeContextsToSpanAttributes', () => {
  it('returns empty object for empty contexts', () => {
    expect(scopeContextsToSpanAttributes({})).toEqual({});
  });

  it('ignores unknown context names', () => {
    const contexts: Contexts = { my_custom_context: { foo: 'bar' } };
    expect(scopeContextsToSpanAttributes(contexts)).toEqual({});
  });

  describe('response context', () => {
    it('maps status_code and body_size', () => {
      const contexts: Contexts = { response: { status_code: 200, body_size: 1024 } };
      expect(scopeContextsToSpanAttributes(contexts)).toEqual({
        'http.response.status_code': 200,
        'http.response.body.size': 1024,
      });
    });

    it('omits missing fields', () => {
      const contexts: Contexts = { response: { status_code: 404 } };
      expect(scopeContextsToSpanAttributes(contexts)).toEqual({
        'http.response.status_code': 404,
      });
    });
  });

  describe('profile context', () => {
    it('maps profile_id to sentry.profile_id', () => {
      const contexts: Contexts = { profile: { profile_id: 'abc123' } };
      expect(scopeContextsToSpanAttributes(contexts)).toEqual({
        'sentry.profile_id': 'abc123',
      });
    });

    it('maps profiler_id to sentry.profiler_id', () => {
      const contexts: Contexts = { profile: { profile_id: '', profiler_id: 'prof-1' } };
      expect(scopeContextsToSpanAttributes(contexts)).toEqual({
        'sentry.profiler_id': 'prof-1',
      });
    });

    it('produces no attributes for empty profile context', () => {
      const contexts: Contexts = { profile: { profile_id: '' } };
      expect(scopeContextsToSpanAttributes(contexts)).toEqual({});
    });
  });

  describe('cloud_resource context', () => {
    it('passes through dot-notation keys', () => {
      const contexts: Contexts = {
        cloud_resource: { 'cloud.provider': 'cloudflare', 'cloud.region': 'us-east-1' },
      };
      expect(scopeContextsToSpanAttributes(contexts)).toEqual({
        'cloud.provider': 'cloudflare',
        'cloud.region': 'us-east-1',
      });
    });

    it('filters out null values', () => {
      const contexts: Contexts = {
        cloud_resource: { 'cloud.provider': 'aws', 'cloud.region': undefined },
      };
      expect(scopeContextsToSpanAttributes(contexts)).toEqual({
        'cloud.provider': 'aws',
      });
    });
  });

  describe('culture context', () => {
    it('maps locale and timezone', () => {
      const contexts: Contexts = { culture: { locale: 'en-US', timezone: 'America/New_York' } };
      expect(scopeContextsToSpanAttributes(contexts)).toEqual({
        'culture.locale': 'en-US',
        'culture.timezone': 'America/New_York',
      });
    });

    it('omits missing fields', () => {
      const contexts: Contexts = { culture: { timezone: 'UTC' } };
      expect(scopeContextsToSpanAttributes(contexts)).toEqual({
        'culture.timezone': 'UTC',
      });
    });
  });

  describe('state context', () => {
    it('maps state.type only', () => {
      const contexts: Contexts = {
        state: { state: { type: 'redux', value: { counter: 42, user: { name: 'test' } } } },
      };
      expect(scopeContextsToSpanAttributes(contexts)).toEqual({
        'state.type': 'redux',
      });
    });

    it('does not map state.value', () => {
      const contexts: Contexts = {
        state: { state: { type: 'pinia', value: { items: [1, 2, 3] } } },
      };
      const attrs = scopeContextsToSpanAttributes(contexts);
      expect(attrs).not.toHaveProperty('state.value');
      expect(attrs).not.toHaveProperty('state.state.value');
    });

    it('handles missing state.state gracefully', () => {
      const contexts: Contexts = { state: {} as any };
      expect(scopeContextsToSpanAttributes(contexts)).toEqual({});
    });
  });

  describe('framework version contexts', () => {
    it('maps angular.version', () => {
      const contexts: Contexts = { angular: { version: 17 } };
      expect(scopeContextsToSpanAttributes(contexts)).toEqual({
        'angular.version': 17,
      });
    });

    it('maps react.version', () => {
      const contexts: Contexts = { react: { version: '18.2.0' } };
      expect(scopeContextsToSpanAttributes(contexts)).toEqual({
        'react.version': '18.2.0',
      });
    });
  });

  it('maps multiple contexts at once', () => {
    const contexts: Contexts = {
      response: { status_code: 200 },
      culture: { timezone: 'UTC' },
      react: { version: '18.2.0' },
    };
    expect(scopeContextsToSpanAttributes(contexts)).toEqual({
      'http.response.status_code': 200,
      'culture.timezone': 'UTC',
      'react.version': '18.2.0',
    });
  });
});

describe('applyScopeToSegmentSpan integration', () => {
  it('applies scope contexts to segment span attributes', () => {
    const client = new TestClient(
      getDefaultTestClientOptions({
        dsn: 'https://dsn@ingest.f00.f00/1',
        tracesSampleRate: 1,
        release: '1.0.0',
        environment: 'production',
      }),
    );

    const span = withScope(scope => {
      scope.setClient(client);
      scope.setContext('response', { status_code: 201 });
      scope.setContext('culture', { timezone: 'Europe/Berlin' });

      const span = startInactiveSpan({ name: 'test-span' });
      span.end();
      return span;
    });

    const serialized = captureSpan(span, client);

    expect(serialized.attributes).toEqual(
      expect.objectContaining({
        'http.response.status_code': { type: 'integer', value: 201 },
        'culture.timezone': { type: 'string', value: 'Europe/Berlin' },
      }),
    );
  });

  it('does not apply scope contexts to child spans', () => {
    const client = new TestClient(
      getDefaultTestClientOptions({
        dsn: 'https://dsn@ingest.f00.f00/1',
        tracesSampleRate: 1,
        release: '1.0.0',
        environment: 'production',
      }),
    );

    const serializedChild = withScope(scope => {
      scope.setClient(client);
      scope.setContext('response', { status_code: 200 });

      return startSpan({ name: 'segment' }, () => {
        const childSpan = startInactiveSpan({ name: 'child' });
        childSpan.end();
        return captureSpan(childSpan, client);
      });
    });

    expect(serializedChild?.is_segment).toBe(false);
    expect(serializedChild?.attributes).not.toHaveProperty('http.response.status_code');
  });

  // `dataCollection` only gates automatically collected data. URL attributes the SDK collects are
  // filtered at their write sites (see `filterCollectedUrl`), so anything reaching a span here is
  // either already filtered or was set by the user and must be left alone.
  describe('dataCollection.urlQueryParams', () => {
    function captureUserSetUrl(attributeValue: unknown, dataCollection?: object): unknown {
      const client = new TestClient(
        getDefaultTestClientOptions({
          dsn: 'https://dsn@ingest.f00.f00/1',
          tracesSampleRate: 1,
          ...(dataCollection ? { dataCollection } : {}),
        }),
      );

      const span = withScope(scope => {
        scope.setClient(client);
        const span = startInactiveSpan({ name: 'my-span' });
        span.setAttribute('url.full', attributeValue as string);
        span.end();
        return span;
      });

      const attributes = captureSpan(span, client).attributes as Record<string, { value: unknown }> | undefined;
      return attributes?.['url.full']?.value;
    }

    it('does not filter a `url.full` the user set themselves', () => {
      expect(captureUserSetUrl('https://example.com/api?token=abc123&page=5')).toBe(
        'https://example.com/api?token=abc123&page=5',
      );
    });

    it('does not strip a user-set query even when collection is off', () => {
      expect(captureUserSetUrl('https://example.com/api?token=abc123', { urlQueryParams: false })).toBe(
        'https://example.com/api?token=abc123',
      );
    });
  });
});
