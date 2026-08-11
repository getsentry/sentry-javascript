import { metrics, trace } from '@opentelemetry/api';
import * as Sentry from '@sentry/nextjs';

export const dynamic = 'force-dynamic';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  return trace.getTracer('nextjs-otlp').startActiveSpan('telemetry-handler', span => {
    const { traceId, spanId } = span.spanContext();

    // Deliberately carries no trace id. Exemplars are how a metric data point is meant to reference
    // a trace, and OpenTelemetry JS ships them unwired, so the only alternative is an attribute,
    // which would make the trace id part of the time series identity and mint a fresh series per
    // request. Metrics and traces are correlated by attributes and time instead.
    metrics.getMeter('nextjs-otlp').createCounter('otlp.test.count').add(1, { id });

    Sentry.captureException(new Error(`This is an exception with id ${id}`));

    span.end();

    return Response.json({ traceId, spanId });
  });
}
