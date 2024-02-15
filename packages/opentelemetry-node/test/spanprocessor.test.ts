import type * as OpenTelemetry from '@opentelemetry/api';
import { SpanKind } from '@opentelemetry/api';
import { Resource } from '@opentelemetry/resources';
import type { Span as OtelSpan } from '@opentelemetry/sdk-trace-base';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { SemanticAttributes, SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';
import type { SpanStatusType } from '@sentry/core';
import { captureException, getCurrentScope, setCurrentClient } from '@sentry/core';
import { Span as SentrySpan, Transaction, addTracingExtensions, createTransport, spanToJSON } from '@sentry/core';
import { NodeClient } from '@sentry/node';
import { resolvedSyncPromise } from '@sentry/utils';

import { SentrySpanProcessor } from '../src/spanprocessor';
import { SPAN_MAP, clearSpan, getSentrySpan } from '../src/utils/spanMap';

const SENTRY_DSN = 'https://0@0.ingest.sentry.io/0';

const DEFAULT_NODE_CLIENT_OPTIONS = {
  dsn: SENTRY_DSN,
  integrations: [],
  transport: () => createTransport({ recordDroppedEvent: () => undefined }, _ => resolvedSyncPromise({})),
  stackParser: () => [],
};

// Integration Test of SentrySpanProcessor

beforeAll(() => {
  addTracingExtensions();
});

describe('SentrySpanProcessor', () => {
  let client: NodeClient;
  let provider: NodeTracerProvider;
  let spanProcessor: SentrySpanProcessor;

  beforeEach(() => {
    // To avoid test leakage, clear before each test
    SPAN_MAP.clear();

    client = new NodeClient(DEFAULT_NODE_CLIENT_OPTIONS);
    setCurrentClient(client);
    client.init();

    spanProcessor = new SentrySpanProcessor();
    provider = new NodeTracerProvider({
      resource: new Resource({
        [SemanticResourceAttributes.SERVICE_NAME]: 'test-service',
      }),
    });
    provider.addSpanProcessor(spanProcessor);
    provider.register();
  });

  afterEach(async () => {
    // Ensure test map is empty!
    // Otherwise, we seem to have a leak somewhere...
    expect(SPAN_MAP.size).toBe(0);

    await provider.forceFlush();
    await provider.shutdown();
  });

  function getSpanForOtelSpan(otelSpan: OtelSpan | OpenTelemetry.Span) {
    return getSentrySpan(otelSpan.spanContext().spanId);
  }

  function getContext(transaction: Transaction) {
    const transactionWithContext = transaction as unknown as Transaction;
    // @ts-expect-error accessing private property
    return transactionWithContext._contexts;
  }

  it('creates a transaction', async () => {
    const startTimestampMs = 1667381672309;
    const endTimestampMs = 1667381672875;
    const startTime = otelNumberToHrtime(startTimestampMs);
    const endTime = otelNumberToHrtime(endTimestampMs);

    const otelSpan = provider.getTracer('default').startSpan('GET /users', { startTime }) as OtelSpan;

    const sentrySpanTransaction = getSpanForOtelSpan(otelSpan) as Transaction | undefined;
    expect(sentrySpanTransaction).toBeInstanceOf(Transaction);

    expect(spanToJSON(sentrySpanTransaction!).description).toBe('GET /users');
    expect(spanToJSON(sentrySpanTransaction!).start_timestamp).toEqual(startTimestampMs / 1000);
    expect(sentrySpanTransaction?.spanContext().traceId).toEqual(otelSpan.spanContext().traceId);
    expect(spanToJSON(sentrySpanTransaction!).parent_span_id).toEqual(otelSpan.parentSpanId);
    // eslint-disable-next-line deprecation/deprecation
    expect(sentrySpanTransaction?.parentSpanId).toEqual(otelSpan.parentSpanId);
    expect(sentrySpanTransaction?.spanContext().spanId).toEqual(otelSpan.spanContext().spanId);

    otelSpan.end(endTime);

    expect(spanToJSON(sentrySpanTransaction!).timestamp).toBe(endTimestampMs / 1000);
  });

  it('creates a child span if there is a running transaction', () => {
    const startTimestampMs = 1667381672309;
    const endTimestampMs = 1667381672875;
    const startTime = otelNumberToHrtime(startTimestampMs);
    const endTime = otelNumberToHrtime(endTimestampMs);

    const tracer = provider.getTracer('default');

    tracer.startActiveSpan('GET /users', parentOtelSpan => {
      tracer.startActiveSpan('SELECT * FROM users;', { startTime }, child => {
        const childOtelSpan = child as OtelSpan;

        const sentrySpanTransaction = getSpanForOtelSpan(parentOtelSpan) as Transaction | undefined;
        expect(sentrySpanTransaction).toBeInstanceOf(Transaction);

        const sentrySpan = getSpanForOtelSpan(childOtelSpan);
        expect(sentrySpan).toBeInstanceOf(SentrySpan);
        expect(sentrySpan ? spanToJSON(sentrySpan).description : undefined).toBe('SELECT * FROM users;');
        expect(spanToJSON(sentrySpan!).start_timestamp).toEqual(startTimestampMs / 1000);
        expect(sentrySpan?.spanContext().spanId).toEqual(childOtelSpan.spanContext().spanId);

        expect(spanToJSON(sentrySpan!).parent_span_id).toEqual(sentrySpanTransaction?.spanContext().spanId);
        // eslint-disable-next-line deprecation/deprecation
        expect(sentrySpan?.parentSpanId).toEqual(sentrySpanTransaction?.spanContext().spanId);

        // eslint-disable-next-line deprecation/deprecation
        expect(getCurrentScope().getSpan()).toBeUndefined();

        child.end(endTime);

        expect(spanToJSON(sentrySpan!).timestamp).toEqual(endTimestampMs / 1000);
      });

      parentOtelSpan.end();
    });
  });

  it('handles a missing parent reference', () => {
    const startTimestampMs = 1667381672309;
    const endTimestampMs = 1667381672875;
    const startTime = otelNumberToHrtime(startTimestampMs);
    const endTime = otelNumberToHrtime(endTimestampMs);

    const tracer = provider.getTracer('default');

    tracer.startActiveSpan('GET /users', parentOtelSpan => {
      // We simulate the parent somehow not existing in our internal map
      // this can happen if a race condition leads to spans being processed out of order
      clearSpan(parentOtelSpan.spanContext().spanId);

      tracer.startActiveSpan('SELECT * FROM users;', { startTime }, child => {
        const childOtelSpan = child as OtelSpan;

        // Parent span does not exist...
        const sentrySpanTransaction = getSpanForOtelSpan(parentOtelSpan);
        expect(sentrySpanTransaction).toBeUndefined();

        // Span itself exists and is created as transaction
        const sentrySpan = getSpanForOtelSpan(childOtelSpan);
        expect(sentrySpan).toBeInstanceOf(SentrySpan);
        expect(sentrySpan).toBeInstanceOf(Transaction);
        expect(spanToJSON(sentrySpan!).description).toBe('SELECT * FROM users;');
        expect(spanToJSON(sentrySpan!).start_timestamp).toEqual(startTimestampMs / 1000);
        expect(sentrySpan?.spanContext().spanId).toEqual(childOtelSpan.spanContext().spanId);

        expect(spanToJSON(sentrySpan!).parent_span_id).toEqual(parentOtelSpan.spanContext().spanId);
        // eslint-disable-next-line deprecation/deprecation
        expect(sentrySpan?.parentSpanId).toEqual(parentOtelSpan.spanContext().spanId);

        // eslint-disable-next-line deprecation/deprecation
        expect(getCurrentScope().getSpan()).toBeUndefined();

        child.end(endTime);

        expect(spanToJSON(sentrySpan!).timestamp).toEqual(endTimestampMs / 1000);
      });

      parentOtelSpan.end();
    });
  });

  it('allows to create multiple child spans on same level', () => {
    const tracer = provider.getTracer('default');

    tracer.startActiveSpan('GET /users', parentOtelSpan => {
      const sentrySpanTransaction = getSpanForOtelSpan(parentOtelSpan) as Transaction | undefined;

      expect(sentrySpanTransaction).toBeInstanceOf(SentrySpan);
      expect(spanToJSON(sentrySpanTransaction!).description).toBe('GET /users');

      // Create some parallel, independent spans
      const span1 = tracer.startSpan('SELECT * FROM users;') as OtelSpan;
      const span2 = tracer.startSpan('SELECT * FROM companies;') as OtelSpan;
      const span3 = tracer.startSpan('SELECT * FROM locations;') as OtelSpan;

      const sentrySpan1 = getSpanForOtelSpan(span1);
      const sentrySpan2 = getSpanForOtelSpan(span2);
      const sentrySpan3 = getSpanForOtelSpan(span3);

      expect(spanToJSON(sentrySpan1!).parent_span_id).toEqual(sentrySpanTransaction?.spanContext().spanId);
      // eslint-disable-next-line deprecation/deprecation
      expect(sentrySpan1?.parentSpanId).toEqual(sentrySpanTransaction?.spanContext().spanId);

      expect(spanToJSON(sentrySpan2!).parent_span_id).toEqual(sentrySpanTransaction?.spanContext().spanId);
      // eslint-disable-next-line deprecation/deprecation
      expect(sentrySpan2?.parentSpanId).toEqual(sentrySpanTransaction?.spanContext().spanId);

      expect(spanToJSON(sentrySpan3!).parent_span_id).toEqual(sentrySpanTransaction?.spanContext().spanId);
      // eslint-disable-next-line deprecation/deprecation
      expect(sentrySpan3?.parentSpanId).toEqual(sentrySpanTransaction?.spanContext().spanId);

      expect(spanToJSON(sentrySpan1!).description).toEqual('SELECT * FROM users;');
      expect(spanToJSON(sentrySpan2!).description).toEqual('SELECT * FROM companies;');
      expect(spanToJSON(sentrySpan3!).description).toEqual('SELECT * FROM locations;');

      span1.end();
      span2.end();
      span3.end();

      parentOtelSpan.end();
    });
  });

  it('handles child spans finished out of order', async () => {
    const tracer = provider.getTracer('default');

    tracer.startActiveSpan('GET /users', parent => {
      tracer.startActiveSpan('SELECT * FROM users;', child => {
        const grandchild = tracer.startSpan('child 1');

        const parentSpan = getSpanForOtelSpan(parent);
        const childSpan = getSpanForOtelSpan(child);
        const grandchildSpan = getSpanForOtelSpan(grandchild);

        parent.end();
        child.end();
        grandchild.end();

        expect(parentSpan).toBeDefined();
        expect(childSpan).toBeDefined();
        expect(grandchildSpan).toBeDefined();

        expect(spanToJSON(parentSpan!).timestamp).toBeDefined();
        expect(spanToJSON(childSpan!).timestamp).toBeDefined();
        expect(spanToJSON(grandchildSpan!).timestamp).toBeDefined();
      });
    });
  });

  it('handles finished parent span before child span starts', async () => {
    const tracer = provider.getTracer('default');

    tracer.startActiveSpan('GET /users', parent => {
      const parentSpan = getSpanForOtelSpan(parent);

      parent.end();

      tracer.startActiveSpan('SELECT * FROM users;', child => {
        const childSpan = getSpanForOtelSpan(child);

        child.end();

        expect(parentSpan).toBeDefined();
        expect(childSpan).toBeDefined();
        expect(parentSpan).toBeInstanceOf(Transaction);
        expect(childSpan).toBeInstanceOf(Transaction);
        expect(spanToJSON(parentSpan!).timestamp).toBeDefined();
        expect(spanToJSON(childSpan!).timestamp).toBeDefined();
        expect(spanToJSON(parentSpan!).parent_span_id).toBeUndefined();

        expect(spanToJSON(parentSpan!).parent_span_id).toBeUndefined();
        // eslint-disable-next-line deprecation/deprecation
        expect(parentSpan?.parentSpanId).toBeUndefined();

        expect(spanToJSON(childSpan!).parent_span_id).toEqual(parentSpan?.spanContext().spanId);
        // eslint-disable-next-line deprecation/deprecation
        expect(childSpan?.parentSpanId).toEqual(parentSpan?.spanContext().spanId);
      });
    });
  });

  it('sets context for transaction', async () => {
    const otelSpan = provider.getTracer('default').startSpan('GET /users');

    const transaction = getSpanForOtelSpan(otelSpan) as Transaction;

    // context is only set after end
    expect(getContext(transaction)).toEqual({});

    otelSpan.end();

    expect(getContext(transaction)).toEqual({
      otel: {
        attributes: {},
        resource: {
          'service.name': 'test-service',
          'telemetry.sdk.language': 'nodejs',
          'telemetry.sdk.name': 'opentelemetry',
          'telemetry.sdk.version': '1.21.0',
        },
      },
    });

    // Start new transaction
    const otelSpan2 = provider.getTracer('default').startSpan('GET /companies');

    const transaction2 = getSpanForOtelSpan(otelSpan2) as Transaction;

    expect(getContext(transaction2)).toEqual({});

    otelSpan2.setAttribute('test-attribute', 'test-value');

    otelSpan2.end();

    expect(getContext(transaction2)).toEqual({
      otel: {
        attributes: {
          'test-attribute': 'test-value',
        },
        resource: {
          'service.name': 'test-service',
          'telemetry.sdk.language': 'nodejs',
          'telemetry.sdk.name': 'opentelemetry',
          'telemetry.sdk.version': '1.21.0',
        },
      },
    });
  });

  it('sets data for span', async () => {
    const tracer = provider.getTracer('default');

    tracer.startActiveSpan('GET /users', parentOtelSpan => {
      tracer.startActiveSpan('SELECT * FROM users;', child => {
        child.setAttribute('test-attribute', 'test-value');
        child.setAttribute('test-attribute-2', [1, 2, 3]);
        child.setAttribute('test-attribute-3', 0);
        child.setAttribute('test-attribute-4', false);

        const sentrySpan = getSpanForOtelSpan(child);

        // origin is set by default to 'manual'
        expect(spanToJSON(sentrySpan!).data).toEqual({ 'sentry.origin': 'manual' });

        child.end();

        expect(spanToJSON(sentrySpan!).data).toEqual({
          'otel.kind': 'INTERNAL',
          'test-attribute': 'test-value',
          'test-attribute-2': [1, 2, 3],
          'test-attribute-3': 0,
          'test-attribute-4': false,
          'sentry.origin': 'manual',
        });
      });

      parentOtelSpan.end();
    });
  });

  it('sets status for transaction', async () => {
    const otelSpan = provider.getTracer('default').startSpan('GET /users');

    const transaction = getSpanForOtelSpan(otelSpan) as Transaction;

    // status is only set after end
    // eslint-disable-next-line deprecation/deprecation
    expect(transaction?.status).toBe(undefined);
    expect(spanToJSON(transaction!).status).toBe(undefined);

    otelSpan.end();

    // eslint-disable-next-line deprecation/deprecation
    expect(transaction?.status).toBe('ok');
    expect(spanToJSON(transaction!).status).toBe('ok');
  });

  it('sets status for span', async () => {
    const tracer = provider.getTracer('default');

    tracer.startActiveSpan('GET /users', parentOtelSpan => {
      tracer.startActiveSpan('SELECT * FROM users;', child => {
        const sentrySpan = getSpanForOtelSpan(child);

        // eslint-disable-next-line deprecation/deprecation
        expect(sentrySpan?.status).toBe(undefined);
        expect(spanToJSON(sentrySpan!).status).toBe(undefined);

        child.end();

        // eslint-disable-next-line deprecation/deprecation
        expect(sentrySpan?.status).toBe('ok');
        expect(spanToJSON(sentrySpan!).status).toBe('ok');

        parentOtelSpan.end();
      });
    });
  });

  const statusTestTable: [number, undefined | number | string, undefined | string, SpanStatusType][] = [
    [-1, undefined, undefined, 'unknown_error'],
    [3, undefined, undefined, 'unknown_error'],
    [0, undefined, undefined, 'ok'],
    [1, undefined, undefined, 'ok'],
    [2, undefined, undefined, 'unknown_error'],

    // http codes
    [2, 400, undefined, 'failed_precondition'],
    [2, 401, undefined, 'unauthenticated'],
    [2, 403, undefined, 'permission_denied'],
    [2, 404, undefined, 'not_found'],
    [2, 409, undefined, 'aborted'],
    [2, 429, undefined, 'resource_exhausted'],
    [2, 499, undefined, 'cancelled'],
    [2, 500, undefined, 'internal_error'],
    [2, 501, undefined, 'unimplemented'],
    [2, 503, undefined, 'unavailable'],
    [2, 504, undefined, 'deadline_exceeded'],
    [2, 999, undefined, 'unknown_error'],

    [2, '400', undefined, 'failed_precondition'],
    [2, '401', undefined, 'unauthenticated'],
    [2, '403', undefined, 'permission_denied'],
    [2, '404', undefined, 'not_found'],
    [2, '409', undefined, 'aborted'],
    [2, '429', undefined, 'resource_exhausted'],
    [2, '499', undefined, 'cancelled'],
    [2, '500', undefined, 'internal_error'],
    [2, '501', undefined, 'unimplemented'],
    [2, '503', undefined, 'unavailable'],
    [2, '504', undefined, 'deadline_exceeded'],
    [2, '999', undefined, 'unknown_error'],

    // grpc codes
    [2, undefined, '1', 'cancelled'],
    [2, undefined, '2', 'unknown_error'],
    [2, undefined, '3', 'invalid_argument'],
    [2, undefined, '4', 'deadline_exceeded'],
    [2, undefined, '5', 'not_found'],
    [2, undefined, '6', 'already_exists'],
    [2, undefined, '7', 'permission_denied'],
    [2, undefined, '8', 'resource_exhausted'],
    [2, undefined, '9', 'failed_precondition'],
    [2, undefined, '10', 'aborted'],
    [2, undefined, '11', 'out_of_range'],
    [2, undefined, '12', 'unimplemented'],
    [2, undefined, '13', 'internal_error'],
    [2, undefined, '14', 'unavailable'],
    [2, undefined, '15', 'data_loss'],
    [2, undefined, '16', 'unauthenticated'],
    [2, undefined, '999', 'unknown_error'],

    // http takes precedence over grpc
    [2, '400', '2', 'failed_precondition'],
  ];

  describe('convert otel span status', () => {
    it.each(statusTestTable)(
      'works with otelStatus=%i, httpCode=%s, grpcCode=%s',
      (otelStatus, httpCode, grpcCode, expected) => {
        const otelSpan = provider.getTracer('default').startSpan('GET /users');
        const transaction = getSpanForOtelSpan(otelSpan) as Transaction;

        otelSpan.setStatus({ code: otelStatus });

        if (httpCode) {
          otelSpan.setAttribute(SemanticAttributes.HTTP_STATUS_CODE, httpCode);
        }

        if (grpcCode) {
          otelSpan.setAttribute(SemanticAttributes.RPC_GRPC_STATUS_CODE, grpcCode);
        }

        otelSpan.end();
        // eslint-disable-next-line deprecation/deprecation
        expect(transaction?.status).toBe(expected);
        expect(spanToJSON(transaction!).status).toBe(expected);
      },
    );
  });

  describe('update op/description', () => {
    it('updates on end', async () => {
      const tracer = provider.getTracer('default');

      tracer.startActiveSpan('GET /users', parentOtelSpan => {
        tracer.startActiveSpan('SELECT * FROM users;', child => {
          const sentrySpan = getSpanForOtelSpan(child);

          child.updateName('new name');

          // eslint-disable-next-line deprecation/deprecation
          expect(sentrySpan?.op).toBe(undefined);
          expect(sentrySpan && spanToJSON(sentrySpan).op).toBe(undefined);
          expect(sentrySpan ? spanToJSON(sentrySpan).description : undefined).toBe('SELECT * FROM users;');

          child.end();

          // eslint-disable-next-line deprecation/deprecation
          expect(sentrySpan?.op).toBe(undefined);
          expect(sentrySpan && spanToJSON(sentrySpan).op).toBe(undefined);
          expect(sentrySpan ? spanToJSON(sentrySpan).description : undefined).toBe('new name');

          parentOtelSpan.end();
        });
      });
    });

    it('updates based on attributes for HTTP_METHOD for client', async () => {
      const tracer = provider.getTracer('default');

      tracer.startActiveSpan('GET /users', parentOtelSpan => {
        tracer.startActiveSpan('/users/all', { kind: SpanKind.CLIENT }, child => {
          const sentrySpan = getSpanForOtelSpan(child);

          child.setAttribute(SemanticAttributes.HTTP_METHOD, 'GET');

          child.end();

          // eslint-disable-next-line deprecation/deprecation
          expect(sentrySpan?.op).toBe('http.client');
          expect(spanToJSON(sentrySpan!).op).toBe('http.client');

          parentOtelSpan.end();
        });
      });
    });

    it('updates based on attributes for HTTP_METHOD for server', async () => {
      const tracer = provider.getTracer('default');

      tracer.startActiveSpan('GET /users', parentOtelSpan => {
        tracer.startActiveSpan('/users/all', { kind: SpanKind.SERVER }, child => {
          const sentrySpan = getSpanForOtelSpan(child);

          child.setAttribute(SemanticAttributes.HTTP_METHOD, 'GET');

          child.end();

          // eslint-disable-next-line deprecation/deprecation
          expect(sentrySpan?.op).toBe('http.server');
          expect(spanToJSON(sentrySpan!).op).toBe('http.server');

          parentOtelSpan.end();
        });
      });
    });

    it('updates op/description based on attributes for HTTP_METHOD without HTTP_ROUTE', async () => {
      const tracer = provider.getTracer('default');

      tracer.startActiveSpan('GET /users', parentOtelSpan => {
        tracer.startActiveSpan('HTTP GET', child => {
          const sentrySpan = getSpanForOtelSpan(child);

          child.setAttribute(SemanticAttributes.HTTP_METHOD, 'GET');

          child.end();

          expect(sentrySpan ? spanToJSON(sentrySpan).description : undefined).toBe('HTTP GET');

          parentOtelSpan.end();
        });
      });
    });

    it('updates based on attributes for HTTP_METHOD with HTTP_ROUTE', async () => {
      const tracer = provider.getTracer('default');

      tracer.startActiveSpan('GET /users', parentOtelSpan => {
        tracer.startActiveSpan('HTTP GET', child => {
          const sentrySpan = getSpanForOtelSpan(child);

          child.setAttribute(SemanticAttributes.HTTP_METHOD, 'GET');
          child.setAttribute(SemanticAttributes.HTTP_ROUTE, '/my/route/{id}');
          child.setAttribute(SemanticAttributes.HTTP_TARGET, '/my/route/123');
          child.setAttribute(SemanticAttributes.HTTP_URL, 'http://example.com/my/route/123');

          child.end();

          const { description, data } = spanToJSON(sentrySpan!);

          expect(description).toBe('GET /my/route/{id}');
          expect(data).toEqual({
            'http.method': 'GET',
            'http.route': '/my/route/{id}',
            'http.target': '/my/route/123',
            'http.url': 'http://example.com/my/route/123',
            'otel.kind': 'INTERNAL',
            url: 'http://example.com/my/route/123',
            'sentry.op': 'http',
            'sentry.origin': 'manual',
          });

          parentOtelSpan.end();
        });
      });
    });

    it('updates based on attributes for HTTP_METHOD with HTTP_TARGET', async () => {
      const tracer = provider.getTracer('default');

      tracer.startActiveSpan('GET /users', parentOtelSpan => {
        tracer.startActiveSpan('HTTP GET', child => {
          const sentrySpan = getSpanForOtelSpan(child);

          child.setAttribute(SemanticAttributes.HTTP_METHOD, 'GET');
          child.setAttribute(SemanticAttributes.HTTP_TARGET, '/my/route/123');
          child.setAttribute(SemanticAttributes.HTTP_URL, 'http://example.com/my/route/123');

          child.end();

          const { description, data, op } = spanToJSON(sentrySpan!);

          expect(description).toBe('GET http://example.com/my/route/123');
          expect(data).toEqual({
            'http.method': 'GET',
            'http.target': '/my/route/123',
            'http.url': 'http://example.com/my/route/123',
            'otel.kind': 'INTERNAL',
            url: 'http://example.com/my/route/123',
            'sentry.op': 'http',
            'sentry.origin': 'manual',
          });
          expect(op).toBe('http');

          parentOtelSpan.end();
        });
      });
    });

    it('Adds query & hash data based on HTTP_URL', async () => {
      const tracer = provider.getTracer('default');

      tracer.startActiveSpan('GET /users', parentOtelSpan => {
        tracer.startActiveSpan('HTTP GET', child => {
          const sentrySpan = getSpanForOtelSpan(child);

          child.setAttribute(SemanticAttributes.HTTP_METHOD, 'GET');
          child.setAttribute(SemanticAttributes.HTTP_TARGET, '/my/route/123');
          child.setAttribute(SemanticAttributes.HTTP_URL, 'http://example.com/my/route/123?what=123#myHash');

          child.end();

          const { description, data, op } = spanToJSON(sentrySpan!);

          expect(description).toBe('GET http://example.com/my/route/123');
          expect(data).toEqual({
            'http.method': 'GET',
            'http.target': '/my/route/123',
            'http.url': 'http://example.com/my/route/123?what=123#myHash',
            'otel.kind': 'INTERNAL',
            url: 'http://example.com/my/route/123',
            'http.query': '?what=123',
            'http.fragment': '#myHash',
            'sentry.op': 'http',
            'sentry.origin': 'manual',
          });
          expect(op).toBe('http');

          parentOtelSpan.end();
        });
      });
    });

    it('adds transaction source `url` for HTTP_TARGET', async () => {
      const tracer = provider.getTracer('default');

      tracer.startActiveSpan('GET /users', otelSpan => {
        const sentrySpan = getSpanForOtelSpan(otelSpan);

        otelSpan.setAttribute(SemanticAttributes.HTTP_METHOD, 'GET');
        otelSpan.setAttribute(SemanticAttributes.HTTP_TARGET, '/my/route/123');

        otelSpan.end();

        // eslint-disable-next-line deprecation/deprecation
        expect(sentrySpan?.transaction?.metadata.source).toBe('url');
      });
    });

    it('adds transaction source `route` for root path HTTP_TARGET', async () => {
      const tracer = provider.getTracer('default');

      tracer.startActiveSpan('GET /', otelSpan => {
        const sentrySpan = getSpanForOtelSpan(otelSpan);

        otelSpan.setAttribute(SemanticAttributes.HTTP_METHOD, 'GET');
        otelSpan.setAttribute(SemanticAttributes.HTTP_TARGET, '/');

        otelSpan.end();

        // eslint-disable-next-line deprecation/deprecation
        expect(sentrySpan?.transaction?.metadata.source).toBe('route');
      });
    });

    it('adds transaction source `url` for HTTP_ROUTE', async () => {
      const tracer = provider.getTracer('default');

      tracer.startActiveSpan('GET /users', otelSpan => {
        const sentrySpan = getSpanForOtelSpan(otelSpan);

        otelSpan.setAttribute(SemanticAttributes.HTTP_METHOD, 'GET');
        otelSpan.setAttribute(SemanticAttributes.HTTP_ROUTE, '/my/route/:id');

        otelSpan.end();

        // eslint-disable-next-line deprecation/deprecation
        expect(sentrySpan?.transaction?.metadata.source).toBe('route');
      });
    });

    it('updates based on attributes for DB_SYSTEM', async () => {
      const tracer = provider.getTracer('default');

      tracer.startActiveSpan('GET /users', parentOtelSpan => {
        tracer.startActiveSpan('fetch users from DB', child => {
          const sentrySpan = getSpanForOtelSpan(child);

          child.setAttribute(SemanticAttributes.DB_SYSTEM, 'MySQL');
          child.setAttribute(SemanticAttributes.DB_STATEMENT, 'SELECT * FROM users');

          child.end();

          const { description, op } = spanToJSON(sentrySpan!);

          // eslint-disable-next-line deprecation/deprecation
          expect(sentrySpan?.op).toBe('db');
          expect(op).toBe('db');
          expect(description).toBe('SELECT * FROM users');

          parentOtelSpan.end();
        });
      });
    });

    it('updates based on attributes for DB_SYSTEM without DB_STATEMENT', async () => {
      const tracer = provider.getTracer('default');

      tracer.startActiveSpan('GET /users', parentOtelSpan => {
        tracer.startActiveSpan('fetch users from DB', child => {
          const sentrySpan = getSpanForOtelSpan(child);

          child.setAttribute(SemanticAttributes.DB_SYSTEM, 'MySQL');

          child.end();

          const { description, op } = spanToJSON(sentrySpan!);

          // eslint-disable-next-line deprecation/deprecation
          expect(sentrySpan?.op).toBe('db');
          expect(op).toBe('db');
          expect(description).toBe('fetch users from DB');

          parentOtelSpan.end();
        });
      });
    });

    it('updates based on attributes for RPC_SERVICE', async () => {
      const tracer = provider.getTracer('default');

      tracer.startActiveSpan('GET /users', parentOtelSpan => {
        tracer.startActiveSpan('test operation', child => {
          const sentrySpan = getSpanForOtelSpan(child);

          child.setAttribute(SemanticAttributes.RPC_SERVICE, 'rpc service');

          child.end();

          const { op, description } = spanToJSON(sentrySpan!);
          // eslint-disable-next-line deprecation/deprecation
          expect(sentrySpan?.op).toBe('rpc');
          expect(op).toBe('rpc');
          expect(description).toBe('test operation');

          parentOtelSpan.end();
        });
      });
    });

    it('updates based on attributes for MESSAGING_SYSTEM', async () => {
      const tracer = provider.getTracer('default');

      tracer.startActiveSpan('GET /users', parentOtelSpan => {
        tracer.startActiveSpan('test operation', child => {
          const sentrySpan = getSpanForOtelSpan(child);

          child.setAttribute(SemanticAttributes.MESSAGING_SYSTEM, 'messaging system');

          child.end();

          const { op, description } = spanToJSON(sentrySpan!);

          // eslint-disable-next-line deprecation/deprecation
          expect(sentrySpan?.op).toBe('message');
          expect(op).toBe('message');
          expect(description).toBe('test operation');

          parentOtelSpan.end();
        });
      });
    });

    it('updates based on attributes for FAAS_TRIGGER', async () => {
      const tracer = provider.getTracer('default');

      tracer.startActiveSpan('GET /users', parentOtelSpan => {
        tracer.startActiveSpan('test operation', child => {
          const sentrySpan = getSpanForOtelSpan(child);

          child.setAttribute(SemanticAttributes.FAAS_TRIGGER, 'test faas trigger');

          child.end();

          const { op, description } = spanToJSON(sentrySpan!);

          // eslint-disable-next-line deprecation/deprecation
          expect(sentrySpan?.op).toBe('test faas trigger');
          expect(op).toBe('test faas trigger');
          expect(description).toBe('test operation');

          parentOtelSpan.end();
        });
      });
    });

    it('updates Sentry transaction', async () => {
      const tracer = provider.getTracer('default');

      tracer.startActiveSpan('test operation', parentOtelSpan => {
        const transaction = getSpanForOtelSpan(parentOtelSpan) as Transaction;

        parentOtelSpan.setAttribute(SemanticAttributes.FAAS_TRIGGER, 'test faas trigger');
        parentOtelSpan.end();

        // eslint-disable-next-line deprecation/deprecation
        expect(transaction.op).toBe('test faas trigger');
        expect(spanToJSON(transaction).op).toBe('test faas trigger');

        expect(spanToJSON(transaction).description).toBe('test operation');
      });
    });
  });

  describe('skip sentry requests', () => {
    it('does not finish transaction for Sentry request', async () => {
      const otelSpan = provider.getTracer('default').startSpan('POST to sentry', {
        attributes: {
          [SemanticAttributes.HTTP_METHOD]: 'POST',
          [SemanticAttributes.HTTP_URL]: `${SENTRY_DSN}/sub/route`,
        },
      }) as OtelSpan;

      const sentrySpanTransaction = getSpanForOtelSpan(otelSpan) as Transaction | undefined;
      expect(sentrySpanTransaction).toBeDefined();

      otelSpan.end();

      expect(spanToJSON(sentrySpanTransaction!).timestamp).toBeUndefined();

      // Ensure it is still removed from map!
      expect(getSpanForOtelSpan(otelSpan)).toBeUndefined();
    });

    it('finishes transaction for non-Sentry request', async () => {
      const otelSpan = provider.getTracer('default').startSpan('POST to sentry', {
        attributes: {
          [SemanticAttributes.HTTP_METHOD]: 'POST',
          [SemanticAttributes.HTTP_URL]: 'https://other.sentry.io/sub/route',
        },
      }) as OtelSpan;

      const sentrySpanTransaction = getSpanForOtelSpan(otelSpan) as Transaction | undefined;
      expect(sentrySpanTransaction).toBeDefined();

      otelSpan.end();

      expect(spanToJSON(sentrySpanTransaction!).timestamp).toBeDefined();
    });

    it('does not finish spans for Sentry request', async () => {
      const tracer = provider.getTracer('default');

      tracer.startActiveSpan('GET /users', parent => {
        tracer.startActiveSpan(
          'SELECT * FROM users;',
          {
            attributes: {
              [SemanticAttributes.HTTP_METHOD]: 'POST',
              [SemanticAttributes.HTTP_URL]: `${SENTRY_DSN}/sub/route`,
            },
          },
          child => {
            const childOtelSpan = child as OtelSpan;

            const sentrySpan = getSpanForOtelSpan(childOtelSpan);
            expect(sentrySpan).toBeDefined();

            childOtelSpan.end();
            parent.end();

            expect(spanToJSON(sentrySpan!).timestamp).toBeUndefined();

            // Ensure it is still removed from map!
            expect(getSpanForOtelSpan(childOtelSpan)).toBeUndefined();
          },
        );
      });
    });

    it('handles child spans of Sentry requests normally', async () => {
      const tracer = provider.getTracer('default');

      tracer.startActiveSpan('GET /users', parent => {
        tracer.startActiveSpan(
          'SELECT * FROM users;',
          {
            attributes: {
              [SemanticAttributes.HTTP_METHOD]: 'POST',
              [SemanticAttributes.HTTP_URL]: `${SENTRY_DSN}/sub/route`,
            },
          },
          child => {
            const grandchild = tracer.startSpan('child 1');

            const sentrySpan = getSpanForOtelSpan(child);
            expect(sentrySpan).toBeDefined();

            const sentryGrandchildSpan = getSpanForOtelSpan(grandchild);
            expect(sentryGrandchildSpan).toBeDefined();

            grandchild.end();
            child.end();
            parent.end();

            expect(spanToJSON(sentryGrandchildSpan!).timestamp).toBeDefined();
            expect(spanToJSON(sentrySpan!).timestamp).toBeUndefined();
          },
        );
      });
    });
  });

  it('associates an error to a transaction', async () => {
    let sentryEvent: any;
    let otelSpan: any;

    // Clear provider & setup a new one
    // As we need a custom client
    await provider.forceFlush();
    await provider.shutdown();

    client = new NodeClient({
      ...DEFAULT_NODE_CLIENT_OPTIONS,
      beforeSend: event => {
        sentryEvent = event;
        return null;
      },
    });
    setCurrentClient(client);
    client.init();

    // Need to register the spanprocessor again
    spanProcessor = new SentrySpanProcessor();
    provider = new NodeTracerProvider({
      resource: new Resource({
        [SemanticResourceAttributes.SERVICE_NAME]: 'test-service',
      }),
    });
    provider.addSpanProcessor(spanProcessor);
    provider.register();

    const tracer = provider.getTracer('default');

    tracer.startActiveSpan('GET /users', parentOtelSpan => {
      tracer.startActiveSpan('SELECT * FROM users;', child => {
        captureException(new Error('oh nooooo!'));
        otelSpan = child as OtelSpan;
        child.end();
      });

      parentOtelSpan.end();
    });

    expect(sentryEvent).toBeDefined();
    expect(sentryEvent.exception).toBeDefined();
    expect(sentryEvent.contexts.trace).toEqual({
      parent_span_id: otelSpan.parentSpanId,
      span_id: otelSpan.spanContext().spanId,
      trace_id: otelSpan.spanContext().traceId,
    });
  });

  it('generates Sentry errors from opentelemetry span exception events', () => {
    let sentryEvent: any;
    let otelSpan: any;

    client = new NodeClient({
      ...DEFAULT_NODE_CLIENT_OPTIONS,
      beforeSend: event => {
        sentryEvent = event;
        return null;
      },
    });
    setCurrentClient(client);
    client.init();
    const tracer = provider.getTracer('default');

    tracer.startActiveSpan('GET /users', parentOtelSpan => {
      tracer.startActiveSpan('SELECT * FROM users;', child => {
        child.recordException(new Error('this is an otel error!'));
        otelSpan = child as OtelSpan;
        child.end();
      });

      parentOtelSpan.end();
    });

    expect(sentryEvent).toBeDefined();
    expect(sentryEvent.exception).toBeDefined();
    expect(sentryEvent.exception.values[0]).toEqual({
      mechanism: expect.any(Object),
      type: 'Error',
      value: 'this is an otel error!',
    });
    expect(sentryEvent.contexts.trace).toEqual({
      parent_span_id: otelSpan.parentSpanId,
      span_id: otelSpan.spanContext().spanId,
      trace_id: otelSpan.spanContext().traceId,
    });
  });
});

// OTEL expects a custom date format
const NANOSECOND_DIGITS = 9;
const SECOND_TO_NANOSECONDS = Math.pow(10, NANOSECOND_DIGITS);

function otelNumberToHrtime(epochMillis: number): OpenTelemetry.HrTime {
  const epochSeconds = epochMillis / 1000;
  // Decimals only.
  const seconds = Math.trunc(epochSeconds);
  // Round sub-nanosecond accuracy to nanosecond.
  const nanos = Number((epochSeconds - seconds).toFixed(NANOSECOND_DIGITS)) * SECOND_TO_NANOSECONDS;
  return [seconds, nanos];
}
