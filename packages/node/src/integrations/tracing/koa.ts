import { KoaInstrumentation } from '@opentelemetry/instrumentation-koa';
import { ATTR_HTTP_ROUTE } from '@opentelemetry/semantic-conventions';
import {
  SEMANTIC_ATTRIBUTE_SENTRY_OP,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  captureException,
  defineIntegration,
  getDefaultIsolationScope,
  getIsolationScope,
  spanToJSON,
} from '@sentry/core';
import type { IntegrationFn, Span } from '@sentry/types';
import { logger } from '@sentry/utils';
import { DEBUG_BUILD } from '../../debug-build';
import { generateInstrumentOnce } from '../../otel/instrument';
import { ensureIsWrapped } from '../../utils/ensureIsWrapped';

const INTEGRATION_NAME = 'Koa';

export const instrumentKoa = generateInstrumentOnce(
  INTEGRATION_NAME,
  () =>
    new KoaInstrumentation({
      requestHook(span, info) {
        addKoaSpanAttributes(span);

        if (getIsolationScope() === getDefaultIsolationScope()) {
          DEBUG_BUILD && logger.warn('Isolation scope is default isolation scope - skipping setting transactionName');
          return;
        }
        const attributes = spanToJSON(span).data;
        const route = attributes && attributes[ATTR_HTTP_ROUTE];
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        const method: string = info?.context?.request?.method?.toUpperCase() || 'GET';
        if (route) {
          getIsolationScope().setTransactionName(`${method} ${route}`);
        }
      },
    }),
);

const _koaIntegration = (() => {
  return {
    name: INTEGRATION_NAME,
    setupOnce() {
      instrumentKoa();
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
      throw error;
    }
  });

  ensureIsWrapped(app.use, 'koa');
};

function addKoaSpanAttributes(span: Span): void {
  span.setAttribute(SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN, 'auto.http.otel.koa');

  const attributes = spanToJSON(span).data || {};

  // this is one of: middleware, router
  const type = attributes['koa.type'];

  if (type) {
    span.setAttribute(SEMANTIC_ATTRIBUTE_SENTRY_OP, `${type}.koa`);
  }

  // Also update the name
  const name = attributes['koa.name'];
  if (typeof name === 'string') {
    // Somehow, name is sometimes `''` for middleware spans
    // See: https://github.com/open-telemetry/opentelemetry-js-contrib/issues/2220
    span.updateName(name || '< unknown >');
  }
}
