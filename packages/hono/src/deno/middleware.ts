import { type BaseTransportOptions, debug, type Options } from '@sentry/core';
import { init } from './sdk';
import type { Env, Hono, MiddlewareHandler } from 'hono';
import { getConnInfo } from 'hono/deno';
import { requestHandler, responseHandler } from '../shared/middlewareHandlers';
import { applyPatches } from '../shared/applyPatches';
import type { SentryHonoMiddlewareOptions } from '../shared/types';

export interface HonoDenoOptions extends Options<BaseTransportOptions>, SentryHonoMiddlewareOptions {}

/**
 * Sentry middleware for Hono running in a Deno runtime environment.
 */
export const sentry = <E extends Env>(app: Hono<E>, options: HonoDenoOptions): MiddlewareHandler => {
  options.debug && debug.log('Initialized Sentry Hono middleware (Deno)');

  init(options);

  applyPatches(app);

  return async (context, next) => {
    requestHandler(context, getConnInfo);

    await next(); // Handler runs in between Request above ⤴ and Response below ⤵

    responseHandler(context, options.shouldHandleError);
  };
};
