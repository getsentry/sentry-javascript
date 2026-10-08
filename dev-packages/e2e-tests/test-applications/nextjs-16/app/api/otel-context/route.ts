// The app does not install `@opentelemetry/api`: OpenNext resolves the ESM build of an installed copy when it bundles
// the Node.js middleware for Workers, but its file tracing only copies the CommonJS build. The copy in Next.js uses the
// same global OpenTelemetry API, but has no types.
// @ts-expect-error `next/dist/compiled/@opentelemetry/api` ships no type declarations
import { context, createContextKey, trace } from 'next/dist/compiled/@opentelemetry/api';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const E2E_CONTEXT_KEY = createContextKey('e2e.context.key');

export async function GET() {
  const tracer = trace.getTracer('e2e');

  context.with(context.active().setValue(E2E_CONTEXT_KEY, 'e2e-value'), () => {
    tracer.startActiveSpan('otel-context-outer', (outer: { end(): void }) => {
      // An explicit context, as OpenTelemetry instrumentations pass it.
      const inner = tracer.startSpan('otel-context-inner', {}, context.active());
      inner.setAttribute('e2e.context.value', String(context.active().getValue(E2E_CONTEXT_KEY)));
      inner.end();
      outer.end();
    });
  });

  return NextResponse.json({ ok: true });
}
