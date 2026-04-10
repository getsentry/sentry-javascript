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

function flushDeferred() {
  setTimeout(() => {
    Sentry.flush();
  }, 100);
}

Deno.serve({ port }, async (req: Request) => {
  const url = new URL(req.url);

  // Test Sentry.startSpan — uses Sentry's internal pipeline
  if (url.pathname === '/test-sentry-span') {
    Sentry.startSpan({ name: 'test-sentry-span' }, () => {
      // noop
    });
    flushDeferred();
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
    flushDeferred();
    return new Response(JSON.stringify({ status: 'ok' }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return new Response('Not found', { status: 404 });
});

console.log(`Deno test app listening on port ${port}`);
