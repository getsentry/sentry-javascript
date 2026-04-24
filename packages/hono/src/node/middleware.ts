import { type BaseTransportOptions, debug, type Options } from '@sentry/core';
import { init } from './sdk';
import type { Hono, MiddlewareHandler } from 'hono';
import { requestHandler, responseHandler } from '../shared/middlewareHandlers';
import { applyPatches } from '../shared/applyPatches';

export interface HonoNodeOptions extends Options<BaseTransportOptions> {}

/**
 * Sentry middleware for Hono running in a Node runtime environment.
 *
 * @param app The root Hono application instance to which the middleware will be applied.
 * @param options Optional Sentry initialization options, which **should usually be omitted** when Sentry is initialized externally (e.g. in an `instrument.ts` file loaded via `--import`).
 *                If provided, the middleware will initialize Sentry internally using these options. If omitted, the middleware assumes Sentry has already been initialized externally.
 */
export const sentry = (app: Hono, options?: HonoNodeOptions): MiddlewareHandler => {
  if (options) {
    options.debug && debug.log('Initialized Sentry Hono middleware (Node)');
    init(options);
  }

  applyPatches(app);

  return async (context, next) => {
    requestHandler(context);

    await next(); // Handler runs in between Request above ⤴ and Response below ⤵

    responseHandler(context);
  };
};
