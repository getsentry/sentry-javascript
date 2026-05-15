import { describe, expect, it, vi } from 'vitest';
import type { Contexts, StreamedSpanJSON } from '../../../../src';
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
import { scopeContextsToSpanAttributes } from '../../../../src/tracing/spans/scopeContextAttributes';
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
});
