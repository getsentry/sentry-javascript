import { registerInstrumentations } from '@opentelemetry/instrumentation';
import { KoaInstrumentation } from '@opentelemetry/instrumentation-koa';
import { SemanticAttributes } from '@opentelemetry/semantic-conventions';
import { captureException, defineIntegration, getCurrentScope, spanToJSON } from '@sentry/core';
import type { IntegrationFn } from '@sentry/types';

const _koaIntegration = (() => {
  return {
    name: 'Koa',
    setupOnce() {
      registerInstrumentations({
        instrumentations: [
          new KoaInstrumentation({
            requestHook(span, info) {
              if (span.isRecording() && info.layerType === 'router') {
                const attributes = spanToJSON(span).data;
                const route = attributes && attributes[SemanticAttributes.HTTP_ROUTE];
                const method = info.context.request.method.toUpperCase() || 'GET';
                if (route && method) {
                  getCurrentScope().setTransactionName(`${method} ${route}`);
                }
              }
            },
          }),
        ],
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
