import { type BaseTransportOptions, debug, type Options } from '@sentry/core';
import { init } from './sdk';
import type { Hono, MiddlewareHandler } from 'hono';
import { patchAppUse } from '../shared/patchAppUse';
import { requestHandler, responseHandler } from '../shared/middlewareHandlers';

export interface HonoBunOptions extends Options<BaseTransportOptions> {}

/**
 * Sentry middleware for Hono running in a Bun runtime environment.
 */
export const sentry = (app: Hono, options: HonoBunOptions | undefined = {}): MiddlewareHandler => {
  const isDebug = options.debug;

  isDebug && debug.log('Initialized Sentry Hono middleware (Bun)');

  init(options);

  patchAppUse(app);

  return async (context, next) => {
    requestHandler(context);

    await next(); // Handler runs in between Request above ⤴ and Response below ⤵

    responseHandler(context);
  };
};
