import { assertEquals, assertNotEquals } from 'https://deno.land/std@0.212.0/assert/mod.ts';
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

Deno.test('should be compatible with native Deno OpenTelemetry', async () => {
  resetSdk();

  const providerBefore = trace.getTracerProvider();

  const client = init({
    dsn: 'https://username@domain/123',
    tracesSampleRate: 1,
    beforeSendTransaction: () => null,
  }) as DenoClient;

  const providerAfter = trace.getTracerProvider();
  assertEquals(providerBefore, providerAfter);

  const tracer = trace.getTracer('compat-test');
  const span = tracer.startSpan('test-span');
  span.setAttributes({ 'test.compatibility': true });
  span.end();

  tracer.startActiveSpan('active-span', activeSpan => {
    activeSpan.end();
  });

  const otelSpan = tracer.startSpan('post-init-span');
  otelSpan.end();

  startSpan({ name: 'sentry-span' }, () => {
    const nestedOtelSpan = tracer.startSpan('nested-otel-span');
    nestedOtelSpan.end();
  });

  await client.flush();
});

// Test that name parameter takes precedence over options.name for both startSpan and startActiveSpan
Deno.test('name parameter should take precedence over options.name in startSpan', async () => {
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

  // Pass options with a different name property - the first parameter should take precedence
  // This is important for integrations like Prisma that add prefixes to span names
  const span = tracer.startSpan('prisma:client:operation', { name: 'operation' } as any);
  span.end();

  await client.flush();

  assertEquals(transactionEvents.length, 1);
  const [transactionEvent] = transactionEvents;

  // The span name should be 'prisma:client:operation', not 'operation'
  assertEquals(transactionEvent?.transaction, 'prisma:client:operation');
});

Deno.test('name parameter should take precedence over options.name in startActiveSpan', async () => {
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

  // Pass options with a different name property - the first parameter should take precedence
  // This is important for integrations like Prisma that add prefixes to span names
  tracer.startActiveSpan('prisma:client:operation', { name: 'operation' } as any, span => {
    span.end();
  });

  await client.flush();

  assertEquals(transactionEvents.length, 1);
  const [transactionEvent] = transactionEvents;

  // The span name should be 'prisma:client:operation', not 'operation'
  assertEquals(transactionEvent?.transaction, 'prisma:client:operation');
});

Deno.test('should verify native Deno OpenTelemetry works when enabled', async () => {
  resetSdk();

  // Set environment variable to enable native OTel
  const originalValue = Deno.env.get('OTEL_DENO');
  Deno.env.set('OTEL_DENO', 'true');

  try {
    const client = init({
      dsn: 'https://username@domain/123',
      tracesSampleRate: 1,
      beforeSendTransaction: () => null,
    }) as DenoClient;

    const provider = trace.getTracerProvider();
    const tracer = trace.getTracer('native-verification');
    const span = tracer.startSpan('verification-span');

    if (provider.constructor.name === 'Function') {
      // Native OTel is active
      assertNotEquals(span.constructor.name, 'NonRecordingSpan');

      let contextWorks = false;
      tracer.startActiveSpan('parent-span', parentSpan => {
        if (trace.getActiveSpan() === parentSpan) {
          contextWorks = true;
        }
        parentSpan.end();
      });
      assertEquals(contextWorks, true);
    }

    span.setAttributes({ 'test.native_otel': true });
    span.end();

    await client.flush();
  } finally {
    // Restore original environment
    if (originalValue === undefined) {
      Deno.env.delete('OTEL_DENO');
    } else {
      Deno.env.set('OTEL_DENO', originalValue);
    }
  }
});
