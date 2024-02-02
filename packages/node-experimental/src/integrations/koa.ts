import { registerInstrumentations } from '@opentelemetry/instrumentation';
import { KoaInstrumentation } from '@opentelemetry/instrumentation-koa';
import { defineIntegration } from '@sentry/core';
import type { IntegrationFn } from '@sentry/types';

const _koaIntegration = (() => {
  return {
    name: 'Koa',
    setupOnce() {
      registerInstrumentations({
        instrumentations: [new KoaInstrumentation()],
      });
    },
  };
}) satisfies IntegrationFn;

export const koaIntegration = defineIntegration(_koaIntegration);
