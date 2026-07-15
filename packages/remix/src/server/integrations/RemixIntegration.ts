import type { IntegrationFn } from '@sentry/core';
import { defineIntegration, getClient } from '@sentry/core';
import { isOrchestrionInjected } from '@sentry/server-utils/orchestrion';
import { instrumentRemix } from './tracing-channel';
import { addRemixSpanAttributes, instrumentRemixWithOpenTelemetry } from './opentelemetry';
import type { RemixOptions } from '../../utils/remixOptions';

const INTEGRATION_NAME = 'Remix' as const;

const _remixIntegration = (() => {
  return {
    name: INTEGRATION_NAME,
    setupOnce() {
      const client = getClient();
      const options = client?.getOptions() as RemixOptions | undefined;
      const actionFormDataAttributes = client?.getDataCollectionOptions().httpBodies.includes('incomingRequest')
        ? options?.captureActionFormDataKeys
        : undefined;

      if (isOrchestrionInjected()) {
        instrumentRemix(actionFormDataAttributes);
      } else {
        instrumentRemixWithOpenTelemetry({ actionFormDataAttributes });
      }
    },
    setup(client) {
      if (!isOrchestrionInjected()) {
        client.on('spanStart', span => {
          addRemixSpanAttributes(span);
        });
      }
    },
  };
}) satisfies IntegrationFn;

/**
 * Instrument server-side Remix requests to emit spans.
 */
export const remixIntegration = defineIntegration(_remixIntegration);
