import type * as OpenTelemetry from '@opentelemetry/api';
import { SpanKind } from '@opentelemetry/api';
import { Resource } from '@opentelemetry/resources';
import type { Span as OtelSpan } from '@opentelemetry/sdk-trace-base';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { SemanticAttributes, SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';
import type { SpanStatusType } from '@sentry/core';
import {
  addTracingExtensions,
  createTransport,
  Hub,
  makeMain,
  Scope,
  Span as SentrySpan,
  Transaction,
} from '@sentry/core';
import { NodeClient } from '@sentry/node';
import { resolvedSyncPromise } from '@sentry/utils';

import { SENTRY_SPAN_PROCESSOR_MAP, SentrySpanProcessor } from '../src/spanprocessor';

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
  let hub: Hub;
  let client: NodeClient;
  let provider: NodeTracerProvider;
  let spanProcessor: SentrySpanProcessor;

  beforeEach(() => {
    client = new NodeClient(DEFAULT_NODE_CLIENT_OPTIONS);
    hub = new Hub(client);
    makeMain(hub);

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
    await provider.forceFlush();
    await provider.shutdown();
  });

  function getSpanForOtelSpan(otelSpan: OtelSpan | OpenTelemetry.Span) {
    return SENTRY_SPAN_PROCESSOR_MAP.get(otelSpan.spanContext().spanId);
  }

  function getContext(transaction: Transaction) {
    const transactionWithContext = transaction as unknown as Transaction;
    // @ts-ignore accessing private property
    return transactionWithContext._contexts;
  }

  it('creates a transaction', async () => {
    const startTimestampMs = 1667381672875;
    const endTimestampMs = 1667381672309;
    const startTime = otelNumberToHrtime(startTimestampMs);
    const endTime = otelNumberToHrtime(endTimestampMs);

    const otelSpan = provider.getTracer('default').startSpan('GET /users', { startTime }) as OtelSpan;

    const sentrySpanTransaction = getSpanForOtelSpan(otelSpan) as Transaction | undefined;
    expect(sentrySpanTransaction).toBeInstanceOf(Transaction);

    expect(sentrySpanTransaction?.name).toBe('GET /users');
    expect(sentrySpanTransaction?.startTimestamp).toEqual(startTimestampMs / 1000);
    expect(sentrySpanTransaction?.traceId).toEqual(otelSpan.spanContext().traceId);
    expect(sentrySpanTransaction?.parentSpanId).toEqual(otelSpan.parentSpanId);
    expect(sentrySpanTransaction?.spanId).toEqual(otelSpan.spanContext().spanId);

    otelSpan.end(endTime);

    expect(sentrySpanTransaction?.endTimestamp).toBe(endTimestampMs / 1000);
  });

  it('creates a child span if there is a running transaction', () => {
    const startTimestampMs = 1667381672875;
    const endTimestampMs = 1667381672309;
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
        expect(sentrySpan?.description).toBe('SELECT * FROM users;');
        expect(sentrySpan?.startTimestamp).toEqual(startTimestampMs / 1000);
        expect(sentrySpan?.spanId).toEqual(childOtelSpan.spanContext().spanId);
        expect(sentrySpan?.parentSpanId).toEqual(sentrySpanTransaction?.spanId);

        expect(hub.getScope().getSpan()).toBeUndefined();

        child.end(endTime);

        expect(sentrySpan?.endTimestamp).toEqual(endTimestampMs / 1000);
      });

      parentOtelSpan.end();
    });
  });

  it('allows to create multiple child spans on same level', () => {
    const tracer = provider.getTracer('default');

    tracer.startActiveSpan('GET /users', parentOtelSpan => {
      const sentrySpanTransaction = getSpanForOtelSpan(parentOtelSpan) as Transaction | undefined;

      expect(sentrySpanTransaction).toBeInstanceOf(SentrySpan);
      expect(sentrySpanTransaction?.name).toBe('GET /users');

      // Create some parallel, independent spans
      const span1 = tracer.startSpan('SELECT * FROM users;') as OtelSpan;
      const span2 = tracer.startSpan('SELECT * FROM companies;') as OtelSpan;
      const span3 = tracer.startSpan('SELECT * FROM locations;') as OtelSpan;

      const sentrySpan1 = getSpanForOtelSpan(span1);
      const sentrySpan2 = getSpanForOtelSpan(span2);
      const sentrySpan3 = getSpanForOtelSpan(span3);

      expect(sentrySpan1?.parentSpanId).toEqual(sentrySpanTransaction?.spanId);
      expect(sentrySpan2?.parentSpanId).toEqual(sentrySpanTransaction?.spanId);
      expect(sentrySpan3?.parentSpanId).toEqual(sentrySpanTransaction?.spanId);

      expect(sentrySpan1?.description).toEqual('SELECT * FROM users;');
      expect(sentrySpan2?.description).toEqual('SELECT * FROM companies;');
      expect(sentrySpan3?.description).toEqual('SELECT * FROM locations;');

      span1.end();
      span2.end();
      span3.end();

      parentOtelSpan.end();
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
          'telemetry.sdk.version': '1.7.0',
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
          'telemetry.sdk.version': '1.7.0',
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

        expect(sentrySpan?.data).toEqual({});

        child.end();

        expect(sentrySpan?.data).toEqual({
          'otel.kind': 'INTERNAL',
          'test-attribute': 'test-value',
          'test-attribute-2': [1, 2, 3],
          'test-attribute-3': 0,
          'test-attribute-4': false,
        });
      });

      parentOtelSpan.end();
    });
  });

  it('sets status for transaction', async () => {
    const otelSpan = provider.getTracer('default').startSpan('GET /users');

    const transaction = getSpanForOtelSpan(otelSpan) as Transaction;

    // status is only set after end
    expect(transaction?.status).toBe(undefined);

    otelSpan.end();

    expect(transaction?.status).toBe('ok');
  });

  it('sets status for span', async () => {
    const tracer = provider.getTracer('default');

    tracer.startActiveSpan('GET /users', parentOtelSpan => {
      tracer.startActiveSpan('SELECT * FROM users;', child => {
        const sentrySpan = getSpanForOtelSpan(child);

        expect(sentrySpan?.status).toBe(undefined);

        child.end();

        expect(sentrySpan?.status).toBe('ok');

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
        expect(transaction?.status).toBe(expected);
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

          expect(sentrySpan?.op).toBe(undefined);
          expect(sentrySpan?.description).toBe('SELECT * FROM users;');

          child.end();

          expect(sentrySpan?.op).toBe(undefined);
          expect(sentrySpan?.description).toBe('new name');

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

          expect(sentrySpan?.op).toBe('http.client');

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

          expect(sentrySpan?.op).toBe('http.server');

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

          expect(sentrySpan?.description).toBe('HTTP GET');

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

          expect(sentrySpan?.description).toBe('GET /my/route/{id}');
          expect(sentrySpan?.data).toEqual({
            'http.method': 'GET',
            'http.route': '/my/route/{id}',
            'http.target': '/my/route/123',
            'http.url': 'http://example.com/my/route/123',
            'otel.kind': 'INTERNAL',
            url: 'http://example.com/my/route/123',
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

          expect(sentrySpan?.description).toBe('GET http://example.com/my/route/123');
          expect(sentrySpan?.data).toEqual({
            'http.method': 'GET',
            'http.target': '/my/route/123',
            'http.url': 'http://example.com/my/route/123',
            'otel.kind': 'INTERNAL',
            url: 'http://example.com/my/route/123',
          });

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

          expect(sentrySpan?.description).toBe('GET http://example.com/my/route/123');
          expect(sentrySpan?.data).toEqual({
            'http.method': 'GET',
            'http.target': '/my/route/123',
            'http.url': 'http://example.com/my/route/123?what=123#myHash',
            'otel.kind': 'INTERNAL',
            url: 'http://example.com/my/route/123',
            'http.query': '?what=123',
            'http.fragment': '#myHash',
          });

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

          expect(sentrySpan?.op).toBe('db');
          expect(sentrySpan?.description).toBe('SELECT * FROM users');

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

          expect(sentrySpan?.op).toBe('db');
          expect(sentrySpan?.description).toBe('fetch users from DB');

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

          expect(sentrySpan?.op).toBe('rpc');
          expect(sentrySpan?.description).toBe('test operation');

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

          expect(sentrySpan?.op).toBe('message');
          expect(sentrySpan?.description).toBe('test operation');

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

          expect(sentrySpan?.op).toBe('test faas trigger');
          expect(sentrySpan?.description).toBe('test operation');

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

        expect(transaction?.op).toBe('test faas trigger');
        expect(transaction?.name).toBe('test operation');
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

      expect(sentrySpanTransaction?.endTimestamp).toBeUndefined();

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

      expect(sentrySpanTransaction?.endTimestamp).toBeDefined();
    });

    it('does not finish spans for Sentry request', async () => {
      const tracer = provider.getTracer('default');

      tracer.startActiveSpan('GET /users', () => {
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

            expect(sentrySpan?.endTimestamp).toBeUndefined();

            // Ensure it is still removed from map!
            expect(getSpanForOtelSpan(childOtelSpan)).toBeUndefined();
          },
        );
      });
    });

    it('handles child spans of Sentry requests normally', async () => {
      const tracer = provider.getTracer('default');

      tracer.startActiveSpan('GET /users', () => {
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

            const grandchildSpan = tracer.startSpan('child 1');

            const sentrySpan = getSpanForOtelSpan(childOtelSpan);
            expect(sentrySpan).toBeDefined();

            const sentryGrandchildSpan = getSpanForOtelSpan(grandchildSpan);
            expect(sentryGrandchildSpan).toBeDefined();

            grandchildSpan.end();

            childOtelSpan.end();

            expect(sentryGrandchildSpan?.endTimestamp).toBeDefined();
            expect(sentrySpan?.endTimestamp).toBeUndefined();
          },
        );
      });
    });
  });

  it('associates an error to a transaction', () => {
    let sentryEvent: any;
    let otelSpan: any;

    client = new NodeClient({
      ...DEFAULT_NODE_CLIENT_OPTIONS,
      beforeSend: event => {
        sentryEvent = event;
        return null;
      },
    });
    hub = new Hub(client);
    makeMain(hub);

    const tracer = provider.getTracer('default');

    tracer.startActiveSpan('GET /users', parentOtelSpan => {
      tracer.startActiveSpan('SELECT * FROM users;', child => {
        hub.captureException(new Error('oh nooooo!'));
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
    hub = new Hub(client);
    makeMain(hub);

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

  // Regression test for https://github.com/getsentry/sentry-javascript/issues/7538
  // Since otel context does not map to when Sentry hubs are cloned
  // we can't rely on the original hub at transaction creation to contain all
  // the scope information we want. Let's test to make sure that the information is
  // grabbed from the new hub.
  it('handles when a different hub creates the transaction', () => {
    let sentryTransaction: any;

    client = new NodeClient({
      ...DEFAULT_NODE_CLIENT_OPTIONS,
      tracesSampleRate: 1.0,
    });

    client.on('finishTransaction', transaction => {
      sentryTransaction = transaction;
    });

    hub = new Hub(client);
    makeMain(hub);

    const newHub = new Hub(client, Scope.clone(hub.getScope()));
    newHub.configureScope(scope => {
      scope.setTag('foo', 'bar');
    });

    const tracer = provider.getTracer('default');

    tracer.startActiveSpan('GET /users', parentOtelSpan => {
      tracer.startActiveSpan('SELECT * FROM users;', child => {
        makeMain(newHub);
        child.end();
      });

      parentOtelSpan.end();
    });

    // @ts-ignore Accessing private attributes
    expect(sentryTransaction._hub.getScope()._tags.foo).toEqual('bar');
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
