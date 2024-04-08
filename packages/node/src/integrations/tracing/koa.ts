import { registerInstrumentations } from '@opentelemetry/instrumentation';
import { KoaInstrumentation } from '@opentelemetry/instrumentation-koa';
import { captureException, defineIntegration } from '@sentry/core';
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

export const setupKoaErrorHandler = (app: { use: (arg0: (ctx: any, next: any) => Promise<void>) => void }): void => {
  app.use(async (ctx, next) => {
    try {
      await next();
    } catch (error) {
      captureException(error);
    }
  });
};
