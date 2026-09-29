import { context, createContextKey, trace } from '@opentelemetry/api';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const E2E_CONTEXT_KEY = createContextKey('e2e.context.key');

export async function GET() {
  const tracer = trace.getTracer('e2e');

  context.with(context.active().setValue(E2E_CONTEXT_KEY, 'e2e-value'), () => {
    tracer.startActiveSpan('otel-context-outer', outer => {
      // An explicit context, as OpenTelemetry instrumentations pass it.
      const inner = tracer.startSpan('otel-context-inner', {}, context.active());
      inner.setAttribute('e2e.context.value', String(context.active().getValue(E2E_CONTEXT_KEY)));
      inner.end();
      outer.end();
    });
  });

  return NextResponse.json({ ok: true });
}
