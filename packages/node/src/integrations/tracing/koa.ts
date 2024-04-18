import { KoaInstrumentation } from '@opentelemetry/instrumentation-koa';
import { SEMATTRS_HTTP_ROUTE } from '@opentelemetry/semantic-conventions';
import {
  captureException,
  defineIntegration,
  getDefaultIsolationScope,
  getIsolationScope,
  spanToJSON,
} from '@sentry/core';
import { addOpenTelemetryInstrumentation } from '@sentry/opentelemetry';
import type { IntegrationFn } from '@sentry/types';
import { logger } from '@sentry/utils';
import { DEBUG_BUILD } from '../../debug-build';

const _koaIntegration = (() => {
  return {
    name: 'Koa',
    setupOnce() {
      addOpenTelemetryInstrumentation(
        new KoaInstrumentation({
          requestHook(span, info) {
            if (getIsolationScope() === getDefaultIsolationScope()) {
              DEBUG_BUILD &&
                logger.warn('Isolation scope is default isolation scope - skipping setting transactionName');
              return;
            }
            const attributes = spanToJSON(span).data;
            const route = attributes && attributes[SEMATTRS_HTTP_ROUTE];
            const method = info.context.request.method.toUpperCase() || 'GET';
            if (route) {
              getIsolationScope().setTransactionName(`${method} ${route}`);
            }
          },
        }),
      );
    },
  };
}) satisfies IntegrationFn;

export const koaIntegration = defineIntegration(_koaIntegration);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const setupKoaErrorHandler = (app: { use: (arg0: (ctx: any, next: any) => Promise<void>) => void }): void => {
  app.use(async (ctx, next) => {
    try {
      await next();
    } catch (error) {
      captureException(error);
    }
  });
};
