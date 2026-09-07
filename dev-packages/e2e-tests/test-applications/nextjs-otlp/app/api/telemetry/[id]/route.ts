import { metrics, trace } from '@opentelemetry/api';
import * as Sentry from '@sentry/nextjs';

export const dynamic = 'force-dynamic';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  return trace.getTracer('nextjs-otlp').startActiveSpan('telemetry-handler', span => {
    const { traceId, spanId } = span.spanContext();

    metrics.getMeter('nextjs-otlp').createCounter('otlp.test.count').add(1, { id });

    Sentry.logger.info(`This is a log with id ${id}`);
    Sentry.metrics.count('sentry.test.count', 1, { attributes: { id } });
    Sentry.captureException(new Error(`This is an exception with id ${id}`));

    span.end();

    return Response.json({ traceId, spanId });
  });
}
