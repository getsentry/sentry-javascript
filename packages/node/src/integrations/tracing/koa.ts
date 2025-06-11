import { KoaInstrumentation } from '@opentelemetry/instrumentation-koa';
import { ATTR_HTTP_ROUTE } from '@opentelemetry/semantic-conventions';
import type { IntegrationFn, Span } from '@sentry/core';
import {
  captureException,
  defineIntegration,
  getDefaultIsolationScope,
  getIsolationScope,
  logger,
  SEMANTIC_ATTRIBUTE_SENTRY_OP,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  spanToJSON,
} from '@sentry/core';
import { DEBUG_BUILD } from '../../debug-build';
import { generateInstrumentOnce } from '../../otel/instrument';
import { ensureIsWrapped } from '../../utils/ensureIsWrapped';
import { addOriginToSpan } from '../../utils/addOriginToSpan';

/**
 * Koa layer types for ignoreLayersType option
 */
export type KoaLayerType = 'router' | 'middleware';

interface KoaOptions {
  /**
   * Ignore layers of specified types.
   *
   * @example ['middleware'] - Ignore all middleware layers
   * @example ['router'] - Ignore all router layers
   * @example ['middleware', 'router'] - Ignore both middleware and router layers
   */
  ignoreLayersType?: KoaLayerType[];
}

const INTEGRATION_NAME = 'Koa';

export const instrumentKoa = generateInstrumentOnce(
  INTEGRATION_NAME,
  KoaInstrumentation,
  (options: KoaOptions = {}) => {
    return {
      ignoreLayersType: options.ignoreLayersType as any,
      requestHook(span, info) {
        addKoaSpanAttributes(span);
        addOriginToSpan(span, 'auto.http.otel.koa');

        if (getIsolationScope() === getDefaultIsolationScope()) {
          DEBUG_BUILD && logger.warn('Isolation scope is default isolation scope - skipping setting transactionName');
          return;
        }
        const attributes = spanToJSON(span).data;
        const route = attributes[ATTR_HTTP_ROUTE];
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        const method = info.context?.request?.method?.toUpperCase() || 'GET';
        if (route) {
          getIsolationScope().setTransactionName(`${method} ${route}`);
        }
      },
    };
  },
);

const _koaIntegration = ((options: KoaOptions = {}) => {
  return {
    name: INTEGRATION_NAME,
    setupOnce() {
      instrumentKoa(options);
    },
  };
}) satisfies IntegrationFn;

/**
 * Adds Sentry tracing instrumentation for [Koa](https://koajs.com/).
 *
 * If you also want to capture errors, you need to call `setupKoaErrorHandler(app)` after you set up your Koa server.
 *
 * For more information, see the [koa documentation](https://docs.sentry.io/platforms/javascript/guides/koa/).
 *
 * @param {KoaOptions} options Configuration options for the Koa integration.
 *
 * @example
 * ```javascript
 * const Sentry = require('@sentry/node');
 *
 * Sentry.init({
 *   integrations: [Sentry.koaIntegration()],
 * })
 * ```
 *
 * @example
 * ```javascript
 * // To ignore middleware spans
 * const Sentry = require('@sentry/node');
 *
 * Sentry.init({
 *   integrations: [
 *     Sentry.koaIntegration({
 *       ignoreLayersType: ['middleware']
 *     })
 *   ],
 * })
 * ```
 */
export const koaIntegration = defineIntegration(_koaIntegration);

/**
 * Add an Koa error handler to capture errors to Sentry.
 *
 * The error handler must be before any other middleware and after all controllers.
 *
 * @param app The Express instances
 * @param options {ExpressHandlerOptions} Configuration options for the handler
 *
 * @example
 * ```javascript
 * const Sentry = require('@sentry/node');
 * const Koa = require("koa");
 *
 * const app = new Koa();
 *
 * Sentry.setupKoaErrorHandler(app);
 *
 * // Add your routes, etc.
 *
 * app.listen(3000);
 * ```
 */
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
  const attributes = spanToJSON(span).data;

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
