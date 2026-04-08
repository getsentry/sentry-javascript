import { trace } from '@opentelemetry/api';

// Simulate a pre-existing OTel provider (like Supabase Edge Runtime registers
// before user code runs). Without trace.disable() in Sentry's setup, this would
// cause setGlobalTracerProvider to be a no-op, silently dropping all OTel spans.
const fakeProvider = {
  getTracer: () => ({
    startSpan: () => ({ end: () => {}, setAttributes: () => {} }),
    startActiveSpan: (_name: string, fn: Function) => fn({ end: () => {}, setAttributes: () => {} }),
  }),
};
trace.setGlobalTracerProvider(fakeProvider as any);

// Sentry.init() must call trace.disable() to clear the fake provider above
import * as Sentry from '@sentry/deno';
import { generateText } from 'ai';
import { MockLanguageModelV1 } from 'ai/test';
import { z } from 'zod';

Sentry.init({
  environment: 'qa',
  dsn: Deno.env.get('E2E_TEST_DSN'),
  debug: !!Deno.env.get('DEBUG'),
  tunnel: 'http://localhost:3031/',
  traceLifecycle: 'stream',
  tracesSampleRate: 1,
  sendDefaultPii: true,
  enableLogs: true,
});

const port = 3030;

Deno.serve({ port }, async (req: Request) => {
  const url = new URL(req.url);

  if (url.pathname === '/test-success') {
    return new Response(JSON.stringify({ version: 'v1' }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Test Sentry.startSpan — uses Sentry's internal pipeline
  if (url.pathname === '/test-sentry-span') {
    Sentry.startSpan({ name: 'test-sentry-span' }, () => {
      // noop
    });
    return new Response(JSON.stringify({ status: 'ok' }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Test interop: OTel span inside a Sentry span
  if (url.pathname === '/test-interop') {
    Sentry.startSpan({ name: 'sentry-parent' }, () => {
      const tracer = trace.getTracer('test-tracer');
      const span = tracer.startSpan('otel-child');
      span.end();
    });
    return new Response(JSON.stringify({ status: 'ok' }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Test outbound fetch instrumentation
  if (url.pathname === '/test-outgoing-fetch') {
    const response = await Sentry.startSpan({ name: 'test-outgoing-fetch' }, async () => {
      const res = await fetch('http://localhost:3030/test-success');
      return res.json();
    });
    return new Response(JSON.stringify(response), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return new Response('Not found', { status: 404 });
});

console.log(`Deno test app listening on port ${port}`);
