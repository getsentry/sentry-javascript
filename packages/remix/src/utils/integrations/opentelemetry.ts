import { RemixInstrumentation } from 'opentelemetry-instrumentation-remix';

import { defineIntegration } from '@sentry/core';
import { SEMANTIC_ATTRIBUTE_SENTRY_OP, generateInstrumentOnce, getClient, spanToJSON } from '@sentry/node';
import type { Client, IntegrationFn, Span } from '@sentry/types';
import type { RemixOptions } from '../remixOptions';

const INTEGRATION_NAME = 'Remix';

const instrumentRemix = generateInstrumentOnce<RemixOptions>(
  INTEGRATION_NAME,
  (_options?: RemixOptions) =>
    new RemixInstrumentation({
      actionFormDataAttributes: _options?.sendDefaultPii ? _options?.captureActionFormDataKeys : undefined,
    }),
);

const _remixIntegration = (() => {
  return {
    name: 'Remix',
    setupOnce() {
      const client = getClient();
      const options = client?.getOptions();

      instrumentRemix(options);
    },

    setup(client: Client) {
      client.on('spanStart', span => {
        addRemixSpanAttributes(span);
      });
    },
  };
}) satisfies IntegrationFn;

const addRemixSpanAttributes = (span: Span): void => {
  const attributes = spanToJSON(span).data || {};

  // this is one of: loader, action, requestHandler
  const type = attributes['code.function'];

  // If this is already set, or we have no remix span, no need to process again...
  if (attributes[SEMANTIC_ATTRIBUTE_SENTRY_OP] || !type) {
    return;
  }

  // `requestHandler` span from `opentelemetry-instrumentation-remix` is the main server span.
  // It should be marked as the `http.server` operation.
  // The incoming requests are skipped by the custom `RemixHttpIntegration` package.
  if (type === 'requestHandler') {
    span.setAttribute(SEMANTIC_ATTRIBUTE_SENTRY_OP, 'http.server');
    return;
  }

  // All other spans are marked as `remix` operations with their specific type [loader, action]
  span.setAttribute(SEMANTIC_ATTRIBUTE_SENTRY_OP, `${type}.remix`);
};

/**
 * Instrumentation for aws-sdk package
 */
export const remixIntegration = defineIntegration(_remixIntegration);
