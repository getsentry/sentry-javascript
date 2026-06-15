import { type BaseTransportOptions, consoleSandbox, debug, getClient, type Options } from '@sentry/core';
import { getConnInfo } from '@hono/node-server/conninfo';
import type { Env, Hono, MiddlewareHandler } from 'hono';
import { requestHandler, responseHandler } from '../shared/middlewareHandlers';
import { applyPatches } from '../shared/applyPatches';
import type { SentryHonoMiddlewareOptions } from '../shared/types';

export interface HonoNodeOptions extends Options<BaseTransportOptions> {}

/**
 * Sentry middleware for Hono applications running in a Node.js environment.
 *
 * This middleware enhances your Hono application by automatically instrumenting incoming requests and outgoing responses.
 * It also applies the necessary patches to ensure Sentry captures execution context correctly in Node.js.
 *
 * **Note:** You must initialize Sentry separately before using this middleware. Typically, this is done by calling `Sentry.init()` in an `instrument.ts` file and loading it via the Node `--import` flag.
 */
export const sentry = <E extends Env>(app: Hono<E>, options?: SentryHonoMiddlewareOptions): MiddlewareHandler => {
  const sentryClient = getClient();
  if (sentryClient === undefined) {
    consoleSandbox(() => {
      // eslint-disable-next-line no-console
      console.warn(
        '[@sentry/hono] Sentry is not initialized. Call `init()` from `@sentry/hono/node` in an `instrument.ts` file loaded via `--import` to set up Sentry for your application.',
      );
    });
  } else {
    const isInitializedWithHonoSdk = sentryClient.getOptions()._metadata?.sdk?.name === 'sentry.javascript.hono';

    if (!isInitializedWithHonoSdk) {
      consoleSandbox(() => {
        // eslint-disable-next-line no-console
        console.warn(
          '[Sentry] Sentry was not initialized with `@sentry/hono/node`. Please import from `@sentry/hono/node` to ensure Hono-specific instrumentation is applied correctly.',
        );
      });
    } else {
      sentryClient.getOptions().debug &&
        debug.log('Sentry is initialized, proceeding to set up Hono `sentry` middleware.');
    }
  }

  applyPatches(app);

  return async (context, next) => {
    requestHandler(context, getConnInfo);

    await next(); // Handler runs in between Request above ⤴ and Response below ⤵

    responseHandler(context, options?.shouldHandleError);
  };
};
