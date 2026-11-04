import { captureException } from '../exports';
import { defineIntegration } from '../integration';
import { isTracingSuppressed, suppressTracing, withActiveSpan } from '../tracing/trace';
import type { IntegrationFn } from '../types/integration';

const INTEGRATION_NAME = 'SpanExceptions' as const;

const _spanExceptionsIntegration = (() => {
  return {
    name: INTEGRATION_NAME,
    setup(client) {
      client.on('recordException', (span, exception) => {
        // The SDK suppresses tracing for its own work, such as sending events, so capturing there could loop.
        if (isTracingSuppressed()) {
          return;
        }

        withActiveSpan(span, () => {
          // Exceptions recorded while the event is processed, e.g. by failing I/O in `beforeSend`, would loop back here.
          suppressTracing(() => {
            captureException(exception, { mechanism: { type: 'auto.core.span_exceptions', handled: true } });
          });
        });
      });
    },
  };
}) satisfies IntegrationFn;

/**
 * Captures exceptions recorded with `span.recordException()` as errors, linked to the span.
 *
 * OpenTelemetry instrumentation records errors this way. When the SDK registers its tracer provider
 * (`enableOpenTelemetrySetup`), spans started through `@opentelemetry/api` are Sentry spans, so this
 * captures the errors that instrumentation records. Exceptions that were already captured are skipped.
 */
export const spanExceptionsIntegration = defineIntegration(_spanExceptionsIntegration);
