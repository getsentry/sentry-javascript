import { metrics, trace } from '@opentelemetry/api';
import * as Sentry from '@sentry/nextjs';

export const dynamic = 'force-dynamic';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  return trace.getTracer('nextjs-otlp').startActiveSpan('telemetry-handler', span => {
    const { traceId, spanId } = span.spanContext();

    // Test-only shortcut, do not copy this into an app. Exemplars are how a metric data point is
    // meant to reference a trace, but OpenTelemetry JS ships them unwired, so the trace id has to
    // ride along as an attribute instead. Attributes form the time series identity, so a trace id
    // mints a fresh series per request. That is fine for five requests and ruinous at volume.
    metrics.getMeter('nextjs-otlp').createCounter('otlp.test.count').add(1, { id, 'trace.id': traceId });

    Sentry.captureException(new Error(`This is an exception with id ${id}`));

    span.end();

    return Response.json({ traceId, spanId });
  });
}
