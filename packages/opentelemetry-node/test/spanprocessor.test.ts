import * as OpenTelemetry from '@opentelemetry/api';
import { Resource } from '@opentelemetry/resources';
import { Span as OtelSpan } from '@opentelemetry/sdk-trace-base';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { SemanticAttributes, SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';
import { Hub, makeMain } from '@sentry/core';
import { addExtensionMethods, Span as SentrySpan, SpanStatusType, Transaction } from '@sentry/tracing';
import { Contexts, Scope } from '@sentry/types';

import { SentrySpanProcessor } from '../src/spanprocessor';

// Integration Test of SentrySpanProcessor

beforeAll(() => {
  addExtensionMethods();
});

describe('SentrySpanProcessor', () => {
  let hub: Hub;
  let provider: NodeTracerProvider;
  let spanProcessor: SentrySpanProcessor;

  beforeEach(() => {
    hub = new Hub();
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
    return spanProcessor._map.get(otelSpan.spanContext().spanId);
  }

  function getContext(transaction: Transaction) {
    const transactionWithContext = transaction as unknown as Transaction & { _contexts: Contexts };
    return transactionWithContext._contexts;
  }

  // monkey-patch finish to store the context at finish time
  function monkeyPatchTransactionFinish(transaction: Transaction) {
    const monkeyPatchedTransaction = transaction as Transaction & { _contexts: Contexts };

    // eslint-disable-next-line @typescript-eslint/unbound-method
    const originalFinish = monkeyPatchedTransaction.finish;
    monkeyPatchedTransaction._contexts = {};
    monkeyPatchedTransaction.finish = function (endTimestamp?: number | undefined) {
      monkeyPatchedTransaction._contexts = (
        transaction._hub.getScope() as unknown as Scope & { _contexts: Contexts }
      )._contexts;

      return originalFinish.apply(monkeyPatchedTransaction, [endTimestamp]);
    };
  }

  it('creates a transaction', async () => {
    const startTime = otelNumberToHrtime(new Date().valueOf());

    const otelSpan = provider.getTracer('default').startSpan('GET /users', { startTime }) as OtelSpan;

    const sentrySpanTransaction = getSpanForOtelSpan(otelSpan) as Transaction | undefined;
    expect(sentrySpanTransaction).toBeInstanceOf(Transaction);

    expect(sentrySpanTransaction?.name).toBe('GET /users');
    expect(sentrySpanTransaction?.startTimestamp).toEqual(otelSpan.startTime[0]);
    expect(sentrySpanTransaction?.startTimestamp).toEqual(startTime[0]);
    expect(sentrySpanTransaction?.traceId).toEqual(otelSpan.spanContext().traceId);
    expect(sentrySpanTransaction?.parentSpanId).toEqual(otelSpan.parentSpanId);
    expect(sentrySpanTransaction?.spanId).toEqual(otelSpan.spanContext().spanId);

    expect(hub.getScope()?.getSpan()).toBeUndefined();

    const endTime = otelNumberToHrtime(new Date().valueOf());
    otelSpan.end(endTime);

    expect(sentrySpanTransaction?.endTimestamp).toBe(endTime[0]);
    expect(sentrySpanTransaction?.endTimestamp).toBe(otelSpan.endTime[0]);

    expect(hub.getScope()?.getSpan()).toBeUndefined();
  });

  it('creates a child span if there is a running transaction', () => {
    const tracer = provider.getTracer('default');

    tracer.startActiveSpan('GET /users', parentOtelSpan => {
      tracer.startActiveSpan('SELECT * FROM users;', child => {
        const childOtelSpan = child as OtelSpan;

        const sentrySpanTransaction = getSpanForOtelSpan(parentOtelSpan) as Transaction | undefined;
        expect(sentrySpanTransaction).toBeInstanceOf(Transaction);

        const sentrySpan = getSpanForOtelSpan(childOtelSpan);
        expect(sentrySpan).toBeInstanceOf(SentrySpan);
        expect(sentrySpan?.description).toBe('SELECT * FROM users;');
        expect(sentrySpan?.startTimestamp).toEqual(childOtelSpan.startTime[0]);
        expect(sentrySpan?.spanId).toEqual(childOtelSpan.spanContext().spanId);
        expect(sentrySpan?.parentSpanId).toEqual(sentrySpanTransaction?.spanId);

        expect(hub.getScope()?.getSpan()).toBeUndefined();

        const endTime = otelNumberToHrtime(new Date().valueOf());
        child.end(endTime);

        expect(sentrySpan?.endTimestamp).toEqual(childOtelSpan.endTime[0]);
        expect(sentrySpan?.endTimestamp).toEqual(endTime[0]);
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
    monkeyPatchTransactionFinish(transaction);

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
    monkeyPatchTransactionFinish(transaction2);

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
          'otel.kind': 0,
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

  const statusTestTable: [number, undefined | string, undefined | string, SpanStatusType][] = [
    [-1, undefined, undefined, 'unknown_error'],
    [3, undefined, undefined, 'unknown_error'],
    [0, undefined, undefined, 'ok'],
    [1, undefined, undefined, 'ok'],
    [2, undefined, undefined, 'unknown_error'],

    // http codes
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

  it.each(statusTestTable)(
    'correctly converts otel span status to sentry status with otelStatus=%i, httpCode=%s, grpcCode=%s',
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
