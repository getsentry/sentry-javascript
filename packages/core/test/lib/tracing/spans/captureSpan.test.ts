import { describe, expect, it, vi } from 'vitest';
import type { StreamedSpanJSON } from '../../../../src';
import {
  captureSpan,
  SEMANTIC_ATTRIBUTE_SENTRY_ENVIRONMENT,
  SEMANTIC_ATTRIBUTE_SENTRY_OP,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  SEMANTIC_ATTRIBUTE_SENTRY_RELEASE,
  SEMANTIC_ATTRIBUTE_SENTRY_SAMPLE_RATE,
  SEMANTIC_ATTRIBUTE_SENTRY_SDK_NAME,
  SEMANTIC_ATTRIBUTE_SENTRY_SDK_VERSION,
  SEMANTIC_ATTRIBUTE_SENTRY_SEGMENT_ID,
  SEMANTIC_ATTRIBUTE_SENTRY_SEGMENT_NAME,
  SEMANTIC_ATTRIBUTE_SENTRY_SOURCE,
  SEMANTIC_ATTRIBUTE_USER_EMAIL,
  SEMANTIC_ATTRIBUTE_USER_ID,
  SEMANTIC_ATTRIBUTE_USER_IP_ADDRESS,
  SEMANTIC_ATTRIBUTE_USER_USERNAME,
  startInactiveSpan,
  startSpan,
  withScope,
  withStreamedSpan,
} from '../../../../src';
import { inferSpanDataFromOtelAttributes, safeSetSpanJSONAttributes } from '../../../../src/tracing/spans/captureSpan';
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
        'sentry.span.source': {
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
        'sentry.span.source': {
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
        'sentry.span.source': {
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

describe('inferSpanDataFromOtelAttributes', () => {
  function makeSpanJSON(name: string, attributes: Record<string, unknown>): StreamedSpanJSON {
    return {
      name,
      span_id: 'abc123',
      trace_id: 'def456',
      start_timestamp: 0,
      end_timestamp: 1,
      status: 'ok',
      is_segment: false,
      attributes,
    };
  }

  describe('http spans', () => {
    it('infers http.client op for CLIENT kind', () => {
      const spanJSON = makeSpanJSON('GET', { 'http.request.method': 'GET' });
      inferSpanDataFromOtelAttributes(spanJSON, 2); // SPAN_KIND_CLIENT
      expect(spanJSON.attributes?.['sentry.op']).toBe('http.client');
    });

    it('infers http.server op for SERVER kind', () => {
      const spanJSON = makeSpanJSON('GET', { 'http.request.method': 'GET' });
      inferSpanDataFromOtelAttributes(spanJSON, 1); // SPAN_KIND_SERVER
      expect(spanJSON.attributes?.['sentry.op']).toBe('http.server');
    });

    it('infers http op when kind is unknown', () => {
      const spanJSON = makeSpanJSON('GET', { 'http.request.method': 'GET' });
      inferSpanDataFromOtelAttributes(spanJSON);
      expect(spanJSON.attributes?.['sentry.op']).toBe('http');
    });

    it('appends prefetch to op', () => {
      const spanJSON = makeSpanJSON('GET', { 'http.request.method': 'GET', 'sentry.http.prefetch': true });
      inferSpanDataFromOtelAttributes(spanJSON, 2);
      expect(spanJSON.attributes?.['sentry.op']).toBe('http.client.prefetch');
    });

    it('sets name and source from http.route', () => {
      const spanJSON = makeSpanJSON('GET', { 'http.request.method': 'GET', 'http.route': '/users/:id' });
      inferSpanDataFromOtelAttributes(spanJSON, 1);
      expect(spanJSON.name).toBe('GET /users/:id');
      expect(spanJSON.attributes?.['sentry.source']).toBe('route');
    });

    it('infers name from url.full when no http.route and sets source to url', () => {
      const spanJSON = makeSpanJSON('GET', { 'http.request.method': 'GET', 'url.full': 'http://example.com/api' });
      inferSpanDataFromOtelAttributes(spanJSON, 2);
      expect(spanJSON.name).toBe('GET http://example.com/api');
      expect(spanJSON.attributes?.['sentry.source']).toBe('url');
    });

    it('does not overwrite sentry.op if already set', () => {
      const spanJSON = makeSpanJSON('GET', { 'http.request.method': 'GET', 'sentry.op': 'http.client.custom' });
      inferSpanDataFromOtelAttributes(spanJSON, 2);
      expect(spanJSON.attributes?.['sentry.op']).toBe('http.client.custom');
    });

    it('restores custom span name from sentry.custom_span_name', () => {
      const spanJSON = makeSpanJSON('overwritten-by-otel', {
        'http.request.method': 'GET',
        'sentry.custom_span_name': 'my-custom-name',
        'sentry.source': 'custom',
        'http.route': '/users/:id',
      });
      inferSpanDataFromOtelAttributes(spanJSON, 1);
      expect(spanJSON.name).toBe('my-custom-name');
    });

    it('does not overwrite name when sentry.source is custom', () => {
      const spanJSON = makeSpanJSON('my-name', {
        'http.request.method': 'GET',
        'sentry.source': 'custom',
        'http.route': '/users/:id',
      });
      inferSpanDataFromOtelAttributes(spanJSON, 1);
      expect(spanJSON.name).toBe('my-name');
    });

    it('supports legacy http.method attribute', () => {
      const spanJSON = makeSpanJSON('GET', { 'http.method': 'GET' });
      inferSpanDataFromOtelAttributes(spanJSON, 2);
      expect(spanJSON.attributes?.['sentry.op']).toBe('http.client');
    });
  });

  describe('db spans', () => {
    it('infers db op', () => {
      const spanJSON = makeSpanJSON('redis', { 'db.system': 'redis' });
      inferSpanDataFromOtelAttributes(spanJSON);
      expect(spanJSON.attributes?.['sentry.op']).toBe('db');
    });

    it('sets name from db.statement', () => {
      const spanJSON = makeSpanJSON('mysql', { 'db.system': 'mysql', 'db.statement': 'SELECT * FROM users' });
      inferSpanDataFromOtelAttributes(spanJSON);
      expect(spanJSON.name).toBe('SELECT * FROM users');
      expect(spanJSON.attributes?.['sentry.source']).toBe('task');
    });

    it('skips db inference for cache spans', () => {
      const spanJSON = makeSpanJSON('cache-get', { 'db.system': 'redis', 'sentry.op': 'cache.get_item' });
      inferSpanDataFromOtelAttributes(spanJSON);
      expect(spanJSON.attributes?.['sentry.op']).toBe('cache.get_item');
      expect(spanJSON.name).toBe('cache-get');
    });

    it('restores custom span name from sentry.custom_span_name', () => {
      const spanJSON = makeSpanJSON('overwritten', {
        'db.system': 'mysql',
        'db.statement': 'SELECT 1',
        'sentry.custom_span_name': 'my-db-span',
        'sentry.source': 'custom',
      });
      inferSpanDataFromOtelAttributes(spanJSON);
      expect(spanJSON.name).toBe('my-db-span');
    });
  });

  describe('other span types', () => {
    it('infers rpc op', () => {
      const spanJSON = makeSpanJSON('grpc', { 'rpc.service': 'UserService' });
      inferSpanDataFromOtelAttributes(spanJSON);
      expect(spanJSON.attributes?.['sentry.op']).toBe('rpc');
    });

    it('infers message op', () => {
      const spanJSON = makeSpanJSON('kafka', { 'messaging.system': 'kafka' });
      inferSpanDataFromOtelAttributes(spanJSON);
      expect(spanJSON.attributes?.['sentry.op']).toBe('message');
    });

    it('infers faas op from trigger', () => {
      const spanJSON = makeSpanJSON('lambda', { 'faas.trigger': 'http' });
      inferSpanDataFromOtelAttributes(spanJSON);
      expect(spanJSON.attributes?.['sentry.op']).toBe('http');
    });
  });

  it('does nothing when attributes are missing', () => {
    const spanJSON = makeSpanJSON('test', undefined as unknown as Record<string, unknown>);
    spanJSON.attributes = undefined;
    inferSpanDataFromOtelAttributes(spanJSON, 2);
    expect(spanJSON.attributes).toBeUndefined();
  });

  it('does nothing for spans without recognizable attributes', () => {
    const spanJSON = makeSpanJSON('test', { 'custom.attr': 'value' });
    inferSpanDataFromOtelAttributes(spanJSON);
    expect(spanJSON.attributes?.['sentry.op']).toBeUndefined();
    expect(spanJSON.name).toBe('test');
  });
});
