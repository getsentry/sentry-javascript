import { metrics, trace } from '@opentelemetry/api';
import * as Sentry from '@sentry/nextjs';

export const dynamic = 'force-dynamic';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  return trace.getTracer('nextjs-otlp').startActiveSpan('telemetry-handler', span => {
    const { traceId, spanId } = span.spanContext();

    // OpenTelemetry JS does not implement exemplars, so the trace has to be carried on the metric
    // as an attribute for the two to be connectable.
    metrics.getMeter('nextjs-otlp').createCounter('otlp.test.count').add(1, { id, 'trace.id': traceId });

    Sentry.captureException(new Error(`This is an exception with id ${id}`));

    span.end();

    return Response.json({ traceId, spanId });
  });
}
