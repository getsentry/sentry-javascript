import type { IntegrationFn } from '@sentry/core';
import { defineIntegration } from '@sentry/core';
import type { FastifyIntegration, FastifyReply, FastifyRequest } from './types';
import { instrumentFastify } from './instrumentation';
import { defaultShouldHandleError, INTEGRATION_NAME } from './utils';
import { subscribeToFastifyErrorChannel } from './errors';

/**
 * Options for the Fastify integration.
 *
 * `shouldHandleError` - Callback method deciding whether error should be captured and sent to Sentry
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
   * @param error Captured Fastify error
   * @param request Fastify request (or any object containing at least method, routeOptions.url, and routerPath)
   * @param reply Fastify reply (or any object containing at least statusCode)
   */
  shouldHandleError: (error: Error, request: FastifyRequest, reply: FastifyReply) => boolean;
}

const _fastifyIntegration = (({ shouldHandleError }: Partial<FastifyIntegrationOptions> = {}) => {
  let _shouldHandleError: (error: Error, request: FastifyRequest, reply: FastifyReply) => boolean;

  return {
    name: INTEGRATION_NAME,
    setupOnce() {
      _shouldHandleError = shouldHandleError || defaultShouldHandleError;

      subscribeToFastifyErrorChannel();
      instrumentFastify();
    },
    getShouldHandleError() {
      return _shouldHandleError;
    },
  } satisfies FastifyIntegration;
}) satisfies IntegrationFn;

/**
 * Adds Sentry tracing instrumentation for [Fastify](https://fastify.dev/).
 * This integration supports Fastify v3.21.0-v5.0.0.
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
export const fastifyIntegration = defineIntegration(_fastifyIntegration);

/**
 * No-op kept so existing `setupFastifyErrorHandler(app)` calls keep working.
 * `fastifyIntegration` captures errors on its own.
 *
 * @deprecated Remove this call. To filter errors, set `shouldHandleError` on `fastifyIntegration` instead.
 */
export function setupFastifyErrorHandler(_fastify: unknown): void {
  // noop
}
