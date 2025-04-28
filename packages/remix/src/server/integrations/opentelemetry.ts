import type { Client, IntegrationFn, Span } from '@sentry/core';
import { defineIntegration, SEMANTIC_ATTRIBUTE_SENTRY_OP, SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN } from '@sentry/core';
import { generateInstrumentOnce, getClient, spanToJSON } from '@sentry/node';
import type { RemixOptions } from '../../utils/remixOptions';
import { RemixInstrumentation } from '../../vendor/instrumentation';

const INTEGRATION_NAME = 'Remix';

interface RemixInstrumentationOptions {
  actionFormDataAttributes?: Record<string, string | boolean>;
}

const instrumentRemix = generateInstrumentOnce(INTEGRATION_NAME, (options?: RemixInstrumentationOptions) => {
  return new RemixInstrumentation(options);
});

const _remixIntegration = (() => {
  return {
    name: 'Remix',
    setupOnce() {
      const client = getClient();
      const options = client?.getOptions() as RemixOptions | undefined;

      instrumentRemix({
        actionFormDataAttributes: options?.sendDefaultPii ? options?.captureActionFormDataKeys : undefined,
      });
    },

    setup(client: Client) {
      client.on('spanStart', span => {
        addRemixSpanAttributes(span);
      });
    },
  };
}) satisfies IntegrationFn;

const addRemixSpanAttributes = (span: Span): void => {
  const attributes = spanToJSON(span).data;

  // this is one of: loader, action, requestHandler
  const type = attributes['code.function'];

  // If this is already set, or we have no remix span, no need to process again...
  if (attributes[SEMANTIC_ATTRIBUTE_SENTRY_OP] || !type) {
    return;
  }

  // `requestHandler` span from `opentelemetry-instrumentation-remix` is the main server span.
  // It should be marked as the `http.server` operation.
  // The incoming requests are skipped by the custom `RemixHttpIntegration` package.
  // All other spans are marked as `remix` operations with their specific type [loader, action]
  const op = type === 'requestHandler' ? 'http.server' : `${type}.remix`;

  span.setAttributes({
    [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.http.otel.remix',
    [SEMANTIC_ATTRIBUTE_SENTRY_OP]: op,
  });
};

/**
 * Instrumentation for aws-sdk package
 */
export const remixIntegration = defineIntegration(_remixIntegration);
