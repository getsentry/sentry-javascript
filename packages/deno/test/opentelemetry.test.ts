import { assertEquals } from 'https://deno.land/std@0.212.0/assert/mod.ts';
import { context, propagation,trace } from 'npm:@opentelemetry/api@1';
import type {
  DenoClient} from '../build/esm/index.js';
import {
  flush,
  getCurrentScope,
  getGlobalScope,
  getIsolationScope,
  init,
  vercelAIIntegration,
} from '../build/esm/index.js';

function delay(time: number): Promise<void> {
  return new Promise(resolve => {
    setTimeout(resolve, time);
  });
}

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

Deno.test('opentelemetry: should capture spans emitted via @opentelemetry/api', async _t => {
  resetSdk();
  const events: any[] = [];

  init({
    dsn: 'https://username@domain/123',
    debug: true,
    tracesSampleRate: 1,
    skipOpenTelemetrySetup: false,
    beforeSendTransaction(event) {
      events.push(event);
      return null;
    },
  });

  const tracer = trace.getTracer('test-tracer');
  const span = tracer.startSpan('test span');
  span.setAttribute('test.attribute', 'test value');
  span.end();

  await delay(200);
  await flush(1000);

  assertEquals(events.length, 1);
  const transactionEvent = events[0];

  assertEquals(transactionEvent?.transaction, 'test span');
  assertEquals(transactionEvent?.contexts?.trace?.data?.['sentry.deno_tracer'], true);
  assertEquals(transactionEvent?.contexts?.trace?.data?.['test.attribute'], 'test value');
});

Deno.test('opentelemetry: should not capture spans when skipOpenTelemetrySetup is true', async () => {
  resetSdk();
  const events: any[] = [];

  init({
    dsn: 'https://username@domain/123',
    debug: true,
    tracesSampleRate: 1,
    skipOpenTelemetrySetup: true,
    beforeSendTransaction(event) {
      events.push(event);
      return null;
    },
  });

  const tracer = trace.getTracer('test-tracer');
  const span = tracer.startSpan('test span');
  span.end();

  await delay(200);
  await flush(1000);

  assertEquals(events.length, 0);
});

Deno.test('opentelemetry: vercelAI integration can be added', () => {
  resetSdk();
  const client = init({
    dsn: 'https://username@domain/123',
    debug: true,
    tracesSampleRate: 1,
    integrations: [vercelAIIntegration()],
  }) as DenoClient;

  // Just verify the integration can be added without errors
  const integration = client.getIntegrationByName('VercelAI');
  assertEquals(integration?.name, 'VercelAI');
});
