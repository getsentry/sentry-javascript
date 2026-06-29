import type { IntegrationFn } from '@sentry/core';
import { defineIntegration } from '@sentry/core';
import type { FastifyIntegration, FastifyReply, FastifyRequest } from './types';

import { instrumentFastify as _instrumentFastify } from './instrumentation';
import { defaultShouldHandleError, INTEGRATION_NAME } from './utils';
import { subscribeToFastifyErrorChannel, handleFastifyError as _handleFastifyError } from './errors';

/**
 * Options for the Fastify integration.
 *
 * `shouldHandleError` - Callback method deciding whether error should be captured and sent to Sentry
 * This is used on Fastify v5 where Sentry handles errors in the diagnostics channel.
 * Fastify v3 and v4 use `setupFastifyErrorHandler` instead.
 *
 * @example
 *
 * ```javascript
 * Sentry.init({
 *   integrations: [
 *     Sentry.fastifyIntegration({
 *       shouldHandleError(_error, _request, reply) {
 *         return reply.statusCode >= 500;
 *       },
 *     });
 *   },
 * });
 * ```
 *
 */
interface FastifyIntegrationOptions {
  /**
   * Callback method deciding whether error should be captured and sent to Sentry
   * This is used on Fastify v5 where Sentry handles errors in the diagnostics channel.
   * Fastify v3 and v4 use `setupFastifyErrorHandler` instead.
   *
   * @param error Captured Fastify error
   * @param request Fastify request (or any object containing at least method, routeOptions.url, and routerPath)
   * @param reply Fastify reply (or any object containing at least statusCode)
   */
  shouldHandleError: (error: Error, request: FastifyRequest, reply: FastifyReply) => boolean;
}

const _fastifyIntegration = (({ shouldHandleError }: Partial<FastifyIntegrationOptions>) => {
  let _shouldHandleError: (error: Error, request: FastifyRequest, reply: FastifyReply) => boolean;

  return {
    name: INTEGRATION_NAME,
    setupOnce() {
      _shouldHandleError = shouldHandleError || defaultShouldHandleError;

      subscribeToFastifyErrorChannel();
      _instrumentFastify();
    },
    getShouldHandleError() {
      return _shouldHandleError;
    },
    setShouldHandleError(shouldHandleError: (error: Error, request: FastifyRequest, reply: FastifyReply) => boolean) {
      _shouldHandleError = shouldHandleError;
    },
  } satisfies FastifyIntegration;
}) satisfies IntegrationFn;

/**
 * Adds Sentry tracing instrumentation for [Fastify](https://fastify.dev/).
 * This integration supports Fastify v5 only.
 *
 * For more information, see the [fastify documentation](https://docs.sentry.io/platforms/javascript/guides/fastify/).
 *
 * @example
 * ```javascript
 * const Sentry = require('@sentry/node');
 *
 * Sentry.init({
 *   integrations: [Sentry.fastifyIntegration()],
 * })
 * ```
 */
export const fastifyIntegration = defineIntegration((options: Partial<FastifyIntegrationOptions> = {}) =>
  _fastifyIntegration(options),
);

/**
 * @deprecated This export is deprecated and will not longer be exposed in the next major version.
 */
export const instrumentFastify = _instrumentFastify;

/**
 * @deprecated This export is deprecated and will not longer be exposed in the next major version.
 */
export const handleFastifyError = _handleFastifyError;
