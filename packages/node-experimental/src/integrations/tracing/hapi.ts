import { registerInstrumentations } from '@opentelemetry/instrumentation';
import { HapiInstrumentation } from '@opentelemetry/instrumentation-hapi';
import { defineIntegration } from '@sentry/core';
import type { IntegrationFn } from '@sentry/types';

const _hapiIntegration = (() => {
  return {
    name: 'Hapi',
    setupOnce() {
      registerInstrumentations({
        instrumentations: [new HapiInstrumentation()],
      });
    },
  };
}) satisfies IntegrationFn;

/**
 * Hapi integration
 *
 * Capture tracing data for Hapi.
 */
export const hapiIntegration = defineIntegration(_hapiIntegration);
