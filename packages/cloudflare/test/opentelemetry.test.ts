import { trace } from '@opentelemetry/api';
import type { TransactionEvent } from '@sentry/core';
import { getActiveSpan, spanToJSON, startSpan } from '@sentry/core';
import { beforeEach, describe, expect, test } from 'vitest';
import { init } from '../src/sdk';
import { resetSdk } from './testUtils';

describe('opentelemetry compatibility', () => {
  beforeEach(() => {
    resetSdk();
  });

  test('should not capture spans emitted via @opentelemetry/api when enableOpenTelemetrySetup is false', async () => {
    const transactionEvents: TransactionEvent[] = [];

    const client = init({
      dsn: 'https://username@domain/123',
      tracesSampleRate: 1,
      traceLifecycle: 'static',
      enableOpenTelemetrySetup: false,
      beforeSendTransaction: event => {
        transactionEvents.push(event);
        return null;
      },
    });

    const tracer = trace.getTracer('test');
    const span = tracer.startSpan('test');
    span.end();

    await client!.flush();

    tracer.startActiveSpan('test 2', { attributes: { 'test.attribute': 'test' } }, span2 => {
      const span = tracer.startSpan('test 3', { attributes: { 'test.attribute': 'test2' } });
      span.end();
      span2.end();
    });

    await client!.flush();

    expect(transactionEvents).toHaveLength(0);
  });

  test('should capture spans emitted via @opentelemetry/api', async () => {
    const transactionEvents: TransactionEvent[] = [];

    const client = init({
      dsn: 'https://username@domain/123',
      tracesSampleRate: 1,
      traceLifecycle: 'static',
      enableOpenTelemetrySetup: true,
      beforeSendTransaction: event => {
        transactionEvents.push(event);
        return null;
      },
    });

    const tracer = trace.getTracer('test');
    const span = tracer.startSpan('test');
    span.end();

    await client!.flush();

    tracer.startActiveSpan('test 2', { attributes: { 'test.attribute': 'test' } }, span2 => {
      const span = tracer.startSpan('test 3', { attributes: { 'test.attribute': 'test2' } });
      span.end();
      span2.end();
    });

    await client!.flush();

    expect(transactionEvents).toHaveLength(2);
    const [transactionEvent, transactionEvent2] = transactionEvents;

    expect(transactionEvent?.spans?.length).toBe(0);
    expect(transactionEvent?.transaction).toBe('test');
    expect(transactionEvent?.contexts?.trace?.data).toEqual({
      'sentry.origin': 'manual',
      'sentry.sample_rate': 1,
      'sentry.segment.name.source': 'custom',
    });

    expect(transactionEvent2?.spans?.length).toBe(1);
    expect(transactionEvent2?.transaction).toBe('test 2');
    expect(transactionEvent2?.contexts?.trace?.data).toEqual({
      'sentry.origin': 'manual',
      'sentry.sample_rate': 1,
      'sentry.segment.name.source': 'custom',
      'test.attribute': 'test',
    });

    expect(transactionEvent2?.spans).toEqual([
      expect.objectContaining({
        description: 'test 3',
        data: {
          'sentry.origin': 'manual',
          'test.attribute': 'test2',
        },
      }),
    ]);
  });

  test('opentelemetry spans should interop with Sentry spans', async () => {
    const transactionEvents: TransactionEvent[] = [];

    const client = init({
      dsn: 'https://username@domain/123',
      tracesSampleRate: 1,
      traceLifecycle: 'static',
      enableOpenTelemetrySetup: true,
      beforeSendTransaction: event => {
        transactionEvents.push(event);
        return null;
      },
    });

    const tracer = trace.getTracer('test');

    startSpan({ name: 'sentry span' }, () => {
      const span = tracer.startSpan('otel span');
      span.end();
    });

    await client!.flush();

    expect(transactionEvents).toHaveLength(1);
    const [transactionEvent] = transactionEvents;

    expect(transactionEvent?.spans?.length).toBe(1);
    expect(transactionEvent?.transaction).toBe('sentry span');
    expect(transactionEvent?.contexts?.trace?.data).toEqual({
      'sentry.origin': 'manual',
      'sentry.sample_rate': 1,
      'sentry.segment.name.source': 'custom',
    });

    expect(transactionEvent?.spans).toEqual([
      expect.objectContaining({
        description: 'otel span',
        data: {
          'sentry.origin': 'manual',
        },
      }),
    ]);
  });

  test('name parameter should take precedence over options.name in startSpan', async () => {
    const transactionEvents: TransactionEvent[] = [];

    const client = init({
      dsn: 'https://username@domain/123',
      tracesSampleRate: 1,
      traceLifecycle: 'static',
      enableOpenTelemetrySetup: true,
      beforeSendTransaction: event => {
        transactionEvents.push(event);
        return null;
      },
    });

    const tracer = trace.getTracer('test');

    // Pass options with a different name property - the first parameter should take precedence
    // This is important for integrations like Prisma that add prefixes to span names
    const span = tracer.startSpan('prisma:client:operation', { name: 'operation' } as any);
    span.end();

    await client!.flush();

    expect(transactionEvents).toHaveLength(1);
    const [transactionEvent] = transactionEvents;

    expect(transactionEvent?.transaction).toBe('prisma:client:operation');
  });

  test('name parameter should take precedence over options.name in startActiveSpan', async () => {
    const transactionEvents: TransactionEvent[] = [];

    const client = init({
      dsn: 'https://username@domain/123',
      tracesSampleRate: 1,
      traceLifecycle: 'static',
      enableOpenTelemetrySetup: true,
      beforeSendTransaction: event => {
        transactionEvents.push(event);
        return null;
      },
    });

    const tracer = trace.getTracer('test');

    // Pass options with a different name property - the first parameter should take precedence
    // This is important for integrations like Prisma that add prefixes to span names
    tracer.startActiveSpan('prisma:client:operation', { name: 'operation' } as any, span => {
      span.end();
    });

    await client!.flush();

    expect(transactionEvents).toHaveLength(1);
    const [transactionEvent] = transactionEvents;

    expect(transactionEvent?.transaction).toBe('prisma:client:operation');
  });

  test('startActiveSpan does not leave the span active after the callback returns', async () => {
    const transactionEvents: TransactionEvent[] = [];

    const client = init({
      dsn: 'https://username@domain/123',
      tracesSampleRate: 1,
      traceLifecycle: 'static',
      enableOpenTelemetrySetup: true,
      beforeSendTransaction: event => {
        transactionEvents.push(event);
        return null;
      },
    });

    const tracer = trace.getTracer('test');

    tracer.startActiveSpan('otel span', span => {
      expect(getActiveSpan()).toBe(span);
      span.end();
    });

    expect(getActiveSpan()).toBeUndefined();

    startSpan({ name: 'sentry span' }, () => {});

    await client!.flush();

    expect(transactionEvents).toHaveLength(2);
    const [otelEvent, sentryEvent] = transactionEvents;

    expect(otelEvent?.transaction).toBe('otel span');
    expect(sentryEvent?.transaction).toBe('sentry span');
    expect(sentryEvent?.contexts?.trace?.parent_span_id).toBeUndefined();
  });

  test('startActiveSpan restores the previously active span after the callback returns', async () => {
    const transactionEvents: TransactionEvent[] = [];

    const client = init({
      dsn: 'https://username@domain/123',
      tracesSampleRate: 1,
      traceLifecycle: 'static',
      enableOpenTelemetrySetup: true,
      beforeSendTransaction: event => {
        transactionEvents.push(event);
        return null;
      },
    });

    const tracer = trace.getTracer('test');

    startSpan({ name: 'sentry span' }, parent => {
      tracer.startActiveSpan('otel span', span => {
        span.end();
      });

      expect(getActiveSpan()).toBe(parent);

      startSpan({ name: 'sentry child' }, () => {});
    });

    await client!.flush();

    expect(transactionEvents).toHaveLength(1);
    const [transactionEvent] = transactionEvents;

    expect(transactionEvent?.transaction).toBe('sentry span');
    expect(transactionEvent?.spans).toHaveLength(2);
    const rootSpanId = transactionEvent?.contexts?.trace?.span_id;
    expect(transactionEvent?.spans?.map(span => [span.description, span.parent_span_id])).toEqual([
      ['otel span', rootSpanId],
      ['sentry child', rootSpanId],
    ]);
  });

  test('ignored startActiveSpan child does not become active', () => {
    init({
      dsn: 'https://username@domain/123',
      tracesSampleRate: 1,
      traceLifecycle: 'stream',
      enableOpenTelemetrySetup: true,
      ignoreSpans: ['ignored span'],
    });

    const tracer = trace.getTracer('test');

    startSpan({ name: 'sentry span' }, parent => {
      tracer.startActiveSpan('ignored span', span => {
        expect(span.isRecording()).toBe(false);
        expect(getActiveSpan()).toBe(parent);

        const child = tracer.startSpan('child span');
        expect(child.isRecording()).toBe(true);
        expect(spanToJSON(child).parent_span_id).toBe(parent.spanContext().spanId);
        child.end();
        span.end();
      });

      expect(getActiveSpan()).toBe(parent);
    });
  });
});
