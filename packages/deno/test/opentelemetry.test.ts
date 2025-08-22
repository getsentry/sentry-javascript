import { assertEquals } from 'https://deno.land/std@0.212.0/assert/mod.ts';
import { context, propagation, trace } from 'npm:@opentelemetry/api@1';
import type { DenoClient } from '../build/esm/index.js';
import { getCurrentScope, getGlobalScope, getIsolationScope, init, startSpan } from '../build/esm/index.js';

function resetGlobals(): void {
  getCurrentScope().clear();
  getCurrentScope().setClient(undefined);
  getIsolationScope().clear();
  getGlobalScope().clear();
}

function cleanupOtel(): void {
  // Disable all globally registered APIs
  trace.disable();
  context.disable();
  propagation.disable();
}

function resetSdk(): void {
  resetGlobals();
  cleanupOtel();
}

Deno.test('should not capture spans emitted via @opentelemetry/api when skipOpenTelemetrySetup is true', async () => {
  resetSdk();
  const transactionEvents: any[] = [];

  const client = init({
    dsn: 'https://username@domain/123',
    tracesSampleRate: 1,
    skipOpenTelemetrySetup: true,
    beforeSendTransaction: event => {
      transactionEvents.push(event);
      return null;
    },
  }) as DenoClient;

  const tracer = trace.getTracer('test');
  const span = tracer.startSpan('test');
  span.end();

  await client.flush();

  tracer.startActiveSpan('test 2', { attributes: { 'test.attribute': 'test' } }, span2 => {
    const span = tracer.startSpan('test 3', { attributes: { 'test.attribute': 'test2' } });
    span.end();
    span2.end();
  });

  await client.flush();

  assertEquals(transactionEvents.length, 0);
});

Deno.test('should capture spans emitted via @opentelemetry/api', async () => {
  resetSdk();
  const transactionEvents: any[] = [];

  const client = init({
    dsn: 'https://username@domain/123',
    tracesSampleRate: 1,
    beforeSendTransaction: event => {
      transactionEvents.push(event);
      return null;
    },
  }) as DenoClient;

  const tracer = trace.getTracer('test');
  const span = tracer.startSpan('test');
  span.end();

  await client.flush();

  tracer.startActiveSpan('test 2', { attributes: { 'test.attribute': 'test' } }, span2 => {
    const span = tracer.startSpan('test 3', { attributes: { 'test.attribute': 'test2' } });
    span.end();
    span2.end();
  });

  await client.flush();

  assertEquals(transactionEvents.length, 2);
  const [transactionEvent, transactionEvent2] = transactionEvents;

  assertEquals(transactionEvent?.spans?.length, 0);
  assertEquals(transactionEvent?.transaction, 'test');
  assertEquals(transactionEvent?.contexts?.trace?.data?.['sentry.deno_tracer'], true);
  assertEquals(transactionEvent?.contexts?.trace?.data?.['sentry.origin'], 'manual');
  assertEquals(transactionEvent?.contexts?.trace?.data?.['sentry.sample_rate'], 1);
  assertEquals(transactionEvent?.contexts?.trace?.data?.['sentry.source'], 'custom');

  assertEquals(transactionEvent2?.spans?.length, 1);
  assertEquals(transactionEvent2?.transaction, 'test 2');
  assertEquals(transactionEvent2?.contexts?.trace?.data?.['sentry.deno_tracer'], true);
  assertEquals(transactionEvent2?.contexts?.trace?.data?.['sentry.origin'], 'manual');
  assertEquals(transactionEvent2?.contexts?.trace?.data?.['sentry.sample_rate'], 1);
  assertEquals(transactionEvent2?.contexts?.trace?.data?.['sentry.source'], 'custom');
  assertEquals(transactionEvent2?.contexts?.trace?.data?.['test.attribute'], 'test');

  const childSpan = transactionEvent2?.spans?.[0];
  assertEquals(childSpan?.description, 'test 3');
  assertEquals(childSpan?.data?.['sentry.deno_tracer'], true);
  assertEquals(childSpan?.data?.['sentry.origin'], 'manual');
  assertEquals(childSpan?.data?.['test.attribute'], 'test2');
});

Deno.test('opentelemetry spans should interop with Sentry spans', async () => {
  resetSdk();
  const transactionEvents: any[] = [];

  const client = init({
    dsn: 'https://username@domain/123',
    tracesSampleRate: 1,
    beforeSendTransaction: event => {
      transactionEvents.push(event);
      return null;
    },
  }) as DenoClient;

  const tracer = trace.getTracer('test');

  startSpan({ name: 'sentry span' }, () => {
    const span = tracer.startSpan('otel span');
    span.end();
  });

  await client.flush();

  assertEquals(transactionEvents.length, 1);
  const [transactionEvent] = transactionEvents;

  assertEquals(transactionEvent?.spans?.length, 1);
  assertEquals(transactionEvent?.transaction, 'sentry span');
  assertEquals(transactionEvent?.contexts?.trace?.data?.['sentry.origin'], 'manual');
  assertEquals(transactionEvent?.contexts?.trace?.data?.['sentry.sample_rate'], 1);
  assertEquals(transactionEvent?.contexts?.trace?.data?.['sentry.source'], 'custom');
  // Note: Sentry-created spans don't have the deno_tracer marker
  assertEquals(transactionEvent?.contexts?.trace?.data?.['sentry.deno_tracer'], undefined);

  const otelSpan = transactionEvent?.spans?.[0];
  assertEquals(otelSpan?.description, 'otel span');
  assertEquals(otelSpan?.data?.['sentry.deno_tracer'], true);
  assertEquals(otelSpan?.data?.['sentry.origin'], 'manual');
});
