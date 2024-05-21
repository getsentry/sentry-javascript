import { isWrapped } from '@opentelemetry/core';
import { KoaInstrumentation } from '@opentelemetry/instrumentation-koa';
import { SEMATTRS_HTTP_ROUTE } from '@opentelemetry/semantic-conventions';
import {
  SEMANTIC_ATTRIBUTE_SENTRY_OP,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  captureException,
  defineIntegration,
  getDefaultIsolationScope,
  getIsolationScope,
  isEnabled,
  spanToJSON,
} from '@sentry/core';
import { addOpenTelemetryInstrumentation } from '@sentry/opentelemetry';
import type { IntegrationFn, Span } from '@sentry/types';
import { consoleSandbox, logger } from '@sentry/utils';
import { DEBUG_BUILD } from '../../debug-build';

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

const _koaIntegration = (() => {
  return {
    name: 'Koa',
    setupOnce() {
      addOpenTelemetryInstrumentation(
        new KoaInstrumentation({
          requestHook(span, info) {
            addKoaSpanAttributes(span);

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

  if (!isWrapped(app.use) && isEnabled()) {
    consoleSandbox(() => {
      // eslint-disable-next-line no-console
      console.warn(
        '[Sentry] Koa is not instrumented. This is likely because you required/imported koa before calling `Sentry.init()`.',
      );
    });
  }
};
