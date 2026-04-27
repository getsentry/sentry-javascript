import { type BaseTransportOptions, debug, type Options, getClient } from '@sentry/core';
import { init } from './sdk';
import type { Hono, MiddlewareHandler } from 'hono';
import { requestHandler, responseHandler } from '../shared/middlewareHandlers';
import { applyPatches } from '../shared/applyPatches';

export interface HonoNodeOptions extends Options<BaseTransportOptions> {}

/**
 * Sentry middleware for Hono applications running in a Node.js environment.
 *
 * This middleware enhances your Hono application by automatically instrumenting incoming requests and outgoing responses.
 * It also applies the necessary patches to ensure Sentry captures execution context correctly in Node.js.
 *
 * **Note:** You must initialize Sentry separately before using this middleware. Typically, this is done by calling `Sentry.init()` in an `instrument.ts` file and loading it via the Node `--import` flag.
 */
export const sentry = (app: Hono): MiddlewareHandler => {
  const sentryClient = getClient();
  if (sentryClient === undefined) {
    debug.warn(
      'Sentry is not initialized. Call `init()` from @sentry/hono/node in an `instrument.ts` file loaded via `--import` to set up Sentry for your application.',
    );
  } else {
    sentryClient.getOptions().debug &&
      debug.log('Sentry is initialized, proceeding to set up Hono `sentry` middleware.');
  }

  applyPatches(app);

  return async (context, next) => {
    requestHandler(context);

    await next(); // Handler runs in between Request above ⤴ and Response below ⤵

    responseHandler(context);
  };
};
