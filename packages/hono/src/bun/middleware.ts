import { type BaseTransportOptions, debug, type Options } from '@sentry/core';
import { init } from './sdk';
import { getConnInfo } from 'hono/bun';
import type { Env, Hono, MiddlewareHandler } from 'hono';
import { requestHandler, responseHandler } from '../shared/middlewareHandlers';
import { applyPatches } from '../shared/applyPatches';
import type { SentryHonoMiddlewareOptions } from '../shared/types';

export interface HonoBunOptions extends Options<BaseTransportOptions>, SentryHonoMiddlewareOptions {}

/**
 * Sentry middleware for Hono running in a Bun runtime environment.
 */
export const sentry = <E extends Env>(app: Hono<E>, options: HonoBunOptions): MiddlewareHandler => {
  options.debug && debug.log('Initialized Sentry Hono middleware (Bun)');

  init(options);

  applyPatches(app);

  return async (context, next) => {
    requestHandler(context, getConnInfo);

    await next(); // Handler runs in between Request above ⤴ and Response below ⤵

    responseHandler(context, options.shouldHandleError);
  };
};
