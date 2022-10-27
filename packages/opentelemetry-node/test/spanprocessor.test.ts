import * as OpenTelemetry from '@opentelemetry/api';
import { Resource } from '@opentelemetry/resources';
import { Span as OtelSpan } from '@opentelemetry/sdk-trace-base';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';
import { Hub, makeMain } from '@sentry/core';
import { addExtensionMethods, Span as SentrySpan, Transaction } from '@sentry/tracing';
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

  function getContext() {
    const scope = hub.getScope() as unknown as Scope & { _contexts: Contexts };
    return scope._contexts;
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

    // context is only set after end
    expect(getContext()).toEqual({});

    otelSpan.end();

    expect(getContext()).toEqual({
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

    // Start new transaction, context should remain the same
    const otelSpan2 = provider.getTracer('default').startSpan('GET /companies');

    expect(getContext()).toEqual({
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

    otelSpan2.setAttribute('test-attribute', 'test-value');

    otelSpan2.end();

    expect(getContext()).toEqual({
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
