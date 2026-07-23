import { SENTRY_OP } from '@sentry/conventions/attributes';
import type { Span } from '@sentry/core';
import { SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN } from '@sentry/core';
import { generateInstrumentOnce, spanToJSON } from '@sentry/node';
import { RemixInstrumentation } from '../../vendor/instrumentation';

const INTEGRATION_NAME = 'Remix';

interface RemixInstrumentationOptions {
  actionFormDataAttributes?: Record<string, string | boolean>;
}

export const instrumentRemixWithOpenTelemetry = generateInstrumentOnce(
  INTEGRATION_NAME,
  (options?: RemixInstrumentationOptions) => {
    return new RemixInstrumentation(options);
  },
);

export function addRemixSpanAttributes(span: Span): void {
  const attributes = spanToJSON(span).data;

  // this is one of: loader, action, requestHandler
  const type = attributes['code.function'];

  // If this is already set, or we have no remix span, no need to process again...
  if (attributes[SENTRY_OP] || !type) {
    return;
  }

  // `requestHandler` span from `opentelemetry-instrumentation-remix` is the main server span.
  // It should be marked as the `http.server` operation.
  // The incoming requests are skipped by the custom `RemixHttpIntegration` package.
  // All other spans are marked as `remix` operations with their specific type [loader, action]
  const op = type === 'requestHandler' ? 'http.server' : `${type}.remix`;

  span.setAttributes({
    [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.http.otel.remix',
    [SENTRY_OP]: op,
  });
}
