import * as OpenTelemetry from '@opentelemetry/api';
import { BasicTracerProvider, Span as OtelSpan } from '@opentelemetry/sdk-trace-base';
import { Hub, makeMain } from '@sentry/core';
import { addExtensionMethods, Span as SentrySpan, Transaction } from '@sentry/tracing';

import { SentrySpanProcessor } from '../src/spanprocessor';

// Integration Test of SentrySpanProcessor

beforeAll(() => {
  addExtensionMethods();
});

describe('SentrySpanProcessor', () => {
  let hub: Hub;
  beforeEach(() => {
    hub = new Hub();
    makeMain(hub);

    const provider = new BasicTracerProvider();
    provider.addSpanProcessor(new SentrySpanProcessor());
    provider.register();
  });

  describe('onStart', () => {
    it('create a transaction', () => {
      const otelSpan = OpenTelemetry.trace.getTracer('default').startSpan('GET /users') as OtelSpan;
      const sentrySpanTransaction = hub.getScope()?.getSpan() as Transaction;
      expect(sentrySpanTransaction).toBeInstanceOf(Transaction);

      // Make sure name is set
      expect(sentrySpanTransaction?.name).toBe('GET /users');

      // Enforce we use otel timestamps
      expect(sentrySpanTransaction.startTimestamp).toEqual(otelSpan.startTime[0]);

      // Check for otel trace context
      expect(sentrySpanTransaction.traceId).toEqual(otelSpan.spanContext().traceId);
      expect(sentrySpanTransaction.parentSpanId).toEqual(otelSpan.parentSpanId);
      expect(sentrySpanTransaction.spanId).toEqual(otelSpan.spanContext().spanId);
    });

    it.only('creates a child span if there is a running transaction', () => {
      const tracer = OpenTelemetry.trace.getTracer('default');

      tracer.startActiveSpan('GET /users', parentOtelSpan => {
        // console.log((parentOtelSpan as any).spanContext());
        // console.log(hub.getScope()?.getSpan()?.traceId);
        tracer.startActiveSpan('SELECT * FROM users;', child => {
          const childOtelSpan = child as OtelSpan;

          const sentrySpan = hub.getScope()?.getSpan();
          expect(sentrySpan).toBeInstanceOf(SentrySpan);
          // console.log(hub.getScope()?.getSpan()?.traceId);
          // console.log(sentrySpan);

          // Make sure name is set
          expect(sentrySpan?.description).toBe('SELECT * FROM users;');

          // Enforce we use otel timestamps
          expect(sentrySpan?.startTimestamp).toEqual(childOtelSpan.startTime[0]);

          // Check for otel trace context
          expect(sentrySpan?.spanId).toEqual(childOtelSpan.spanContext().spanId);

          childOtelSpan.end();
        });

        parentOtelSpan.end();
      });
    });
  });

  // it('Creates a transaction if there is no running ', () => {
  // const otelSpan = OpenTelemetry.trace.getTracer('default').startSpan('GET /users') as OtelSpan;
  // processor.onStart(otelSpan, OpenTelemetry.context.active());

  // const sentrySpanTransaction = hub.getScope()?.getSpan() as Transaction;
  // });
});
