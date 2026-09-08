import { trace } from '@opentelemetry/api';
import * as Sentry from '@sentry/sveltekit';
import { json } from '@sveltejs/kit';

export const GET = ({ params }) => {
  const { id } = params;

  return trace.getTracer('sveltekit-2-otlp').startActiveSpan('telemetry-handler', span => {
    const { traceId, spanId } = span.spanContext();

    Sentry.logger.info(`This is a log with id ${id}`);
    Sentry.metrics.count('sentry.test.count', 1, { attributes: { id } });
    Sentry.captureException(new Error(`This is an exception with id ${id}`));

    span.end();

    return json({ traceId, spanId });
  });
};
