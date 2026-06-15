import type { KoaInstrumentationConfig, KoaLayerType } from './vendored/types';
import { KoaInstrumentation } from './vendored/instrumentation';
import type { IntegrationFn } from '@sentry/core';
import { captureException, defineIntegration } from '@sentry/core';
import { ensureIsWrapped, generateInstrumentOnce } from '@sentry/node-core';

interface KoaOptions {
  /**
   * Ignore layers of specified types
   */
  ignoreLayersType?: Array<'middleware' | 'router'>;
}

const INTEGRATION_NAME = 'Koa';

export const instrumentKoa = generateInstrumentOnce(
  INTEGRATION_NAME,
  KoaInstrumentation,
  (options: KoaOptions = {}) => {
    return {
      ignoreLayersType: options.ignoreLayersType as KoaLayerType[],
    } satisfies KoaInstrumentationConfig;
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
      captureException(error, {
        mechanism: {
          handled: false,
          type: 'auto.middleware.koa',
        },
      });
      throw error;
    }
  });

  ensureIsWrapped(app.use, 'koa');
};
