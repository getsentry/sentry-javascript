import { RemixInstrumentation } from 'opentelemetry-instrumentation-remix';

import { defineIntegration } from '@sentry/core';
import { addOpenTelemetryInstrumentation } from '@sentry/node';
import type { IntegrationFn } from '@sentry/types';
import type { RemixOptions } from '../remixOptions';

const _remixIntegration = ((options?: RemixOptions) => {
  return {
    name: 'Remix',
    setupOnce() {
      addOpenTelemetryInstrumentation(
        new RemixInstrumentation({
          actionFormDataAttributes: options?.sendDefaultPii ? options?.captureActionFormDataKeys : undefined,
        }),
      );
    },
  };
}) satisfies IntegrationFn;

/**
 * Instrumentation for aws-sdk package
 */
export const remixIntegration = defineIntegration(_remixIntegration);
